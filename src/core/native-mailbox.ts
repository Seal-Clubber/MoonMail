import type { WalletDaemonClient } from "@tari-project/wallet_jrpc_client";
import type { WalletAccount } from "./wallet";
import type {
  Letter,
  MailboxContext,
  MailboxKey,
  MailboxPayload,
} from "./types";
import { encodeMailboxCapsule, recoverMailboxCapsule } from "./capsules";
import { openMailbox } from "./mailbox";
import { money } from "./transactions";
import {
  beginSubmission,
  completeSubmission,
  hasUnresolved,
  readPending,
  capsuleIdentity,
  type CapsuleRecord,
} from "./pending";
import { hex } from "./crypto";

export const nativeTariResource = `resource_${"01".repeat(32)}`;
type NativeClient = Pick<
  WalletDaemonClient,
  "getToken" | "stealthTransfer" | "stealthUtxosList" | "getTransactionResult"
>;
let denyRoot: Promise<string> | undefined;
export function denyAllCarrierRoot() {
  return (denyRoot ??= import("@tari-project/ootle-wasm").then(
    ({ buildScriptPathWitness }) =>
      JSON.parse(
        buildScriptPathWitness(
          JSON.stringify([[{ AccessRule: "DenyAll" }]]),
          JSON.stringify([{ AccessRule: "DenyAll" }]),
          new Uint8Array(),
        ),
      ).condition_root as string,
  ));
}

export class NativeMailboxAdapter {
  constructor(
    private client: NativeClient,
    private accounts: WalletAccount[],
    private network: number,
  ) {}
  private account(address: string, context: MailboxContext) {
    const account = this.accounts.find(
      (a) => a.account.component_address === address,
    );
    if (
      !account ||
      context.network !== this.network ||
      account.account.owner_public_key !== context.controller
    )
      throw new Error("Choose the wallet account controlling this postbox");
    return account;
  }
  private session() {
    const token = this.client.getToken();
    if (!token) throw new Error("Connect the controlling wallet");
    return token;
  }
  private unchanged(token: string) {
    if (this.client.getToken() !== token)
      throw new Error(
        "Wallet session changed; reconcile and reopen the postbox",
      );
  }
  private unused(storage: Storage, context: MailboxContext) {
    const identity = capsuleIdentity(context);
    if (
      hasUnresolved(storage, context.network, context.registry, identity) ||
      readPending(storage).some(
        (p) =>
          p.operation === "capsule" &&
          p.network === context.network &&
          p.registry === context.registry &&
          p.envelopeId === identity,
      )
    )
      throw new Error(
        "A recovery setup already exists; reconcile and resume it instead of generating another key",
      );
  }
  async store(
    accountAddress: string,
    context: MailboxContext,
    feeCap: string,
    storage: Storage,
  ): Promise<{ transactionId: string; capsule: CapsuleRecord }> {
    const account = this.account(accountAddress, context),
      token = this.session();
    if (money(feeCap) <= 0n)
      throw new Error("A positive recovery transaction-fee cap is required");
    const identity = capsuleIdentity(context);
    this.unused(storage, context);
    const { generateKeypair, parseOotleAddress } =
      await import("@tari-project/ootle-wasm");
    this.unchanged(token);
    const parsed = parseOotleAddress(account.address);
    try {
      if (
        parsed.network !== this.network ||
        parsed.memo?.length ||
        hex(parsed.owner_key) !== context.controller
      )
        throw new Error("Invalid controlling account receiving address");
    } finally {
      parsed.free();
    }
    const pair = generateKeypair(),
      secret = pair.secret_key;
    pair.free();
    try {
      const encoded = await encodeMailboxCapsule(context, secret);
      this.unchanged(token);
      const descriptor: MailboxKey = {
        ...encoded.descriptor,
        recovery: "native-memo-1",
      };
      const capsule: CapsuleRecord = {
        account: accountAddress,
        descriptor,
        context: {
          network: context.network,
          registry: context.registry,
          template: context.template,
          postbox: context.postbox,
          controller: context.controller,
          keyVersion: context.keyVersion,
        },
      };
      const request: Parameters<WalletDaemonClient["stealthTransfer"]>[0] = {
        owner_account: { ComponentAddress: accountAddress },
        fee_params: {
          input_selection: "RevealedOnly",
          pay_fee_with_swap: null,
        },
        input_selection: "RevealedOnly",
        resource_address: nativeTariResource,
        badge_usage: "None",
        transfers: [
          {
            destination_address: account.address,
            blinded_output_amount: "1",
            revealed_output_amount: "0",
            output_memo: encoded.memo,
            pay_to: { AccessRule: "DenyAll" },
            attach_sender_address: false,
            pay_ref: null,
          },
        ],
        max_fee: feeCap,
        dry_run: true,
      };
      try {
        const dry = await this.client.stealthTransfer(request);
        this.unchanged(token);
        if (!/^[a-f0-9]{64}$/.test(dry.transaction_id)) throw new Error();
        const receipt = await this.client.getTransactionResult({
          transaction_id: dry.transaction_id,
        });
        if (
          !receipt.result ||
          !("Accept" in receipt.result.result) ||
          money(String(receipt.result.total_fees_required)) > money(feeCap)
        )
          throw new Error();
      } catch {
        this.unchanged(token);
        throw new Error(
          "Recovery transfer simulation failed; no transaction submitted",
        );
      }
      this.unchanged(token);
      // Another setup may have completed while this dry run was in flight.
      this.unused(storage, context);
      const attempt = beginSubmission(storage, {
        network: context.network,
        registry: context.registry,
        operation: "capsule",
        envelopeId: identity,
        capsule,
      });
      let result: Awaited<ReturnType<WalletDaemonClient["stealthTransfer"]>>;
      try {
        result = await this.client.stealthTransfer({
          ...request,
          dry_run: false,
        });
      } catch {
        throw new Error(
          "Recovery transfer response is uncertain; reconcile wallet history before retrying",
        );
      }
      if (!/^[a-f0-9]{64}$/.test(result.transaction_id))
        throw new Error(
          "Recovery transfer ID is uncertain; reconcile before retrying",
        );
      completeSubmission(storage, attempt, result.transaction_id);
      this.unchanged(token);
      return { transactionId: result.transaction_id, capsule };
    } finally {
      secret.fill(0);
    }
  }
  async recover(
    accountAddress: string,
    context: MailboxContext,
    descriptor: MailboxKey,
  ): Promise<Uint8Array> {
    this.account(accountAddress, context);
    const token = this.session();
    let response: Awaited<ReturnType<WalletDaemonClient["stealthUtxosList"]>>;
    try {
      response = await this.client.stealthUtxosList({
        resource_address: nativeTariResource,
        account_address: accountAddress,
        filter_by_status: null,
      });
    } catch {
      throw new Error(
        "Cannot read recovery memos; check the account's stealth-UTXO read permission",
      );
    }
    this.unchanged(token);
    const root = await denyAllCarrierRoot();
    for (const output of response.utxos) {
      if (
        !output.is_on_chain ||
        !output.auth ||
        Object.keys(output.auth).length !== 1 ||
        !("Script" in output.auth) ||
        output.auth.Script !== root ||
        String(output.value) !== "1"
      )
        continue;
      if (
        !output.memo ||
        !("Message" in output.memo) ||
        typeof output.memo.Message !== "string" ||
        !output.memo.Message.startsWith('["gd-capsule-1",')
      )
        continue;
      let secret: Uint8Array;
      try {
        secret = await recoverMailboxCapsule(context, output.memo, descriptor);
      } catch {
        continue;
      }
      try {
        this.unchanged(token);
        return secret;
      } catch (error) {
        secret.fill(0);
        throw error;
      }
    }
    throw new Error(
      "No matching confirmed recovery memo. Let the wallet finish scanning or restore the controlling wallet.",
    );
  }
  async open(
    accountAddress: string,
    context: MailboxContext,
    envelopeId: string,
    payload: MailboxPayload,
  ): Promise<Letter> {
    const token = this.session();
    const descriptor: MailboxKey = {
      version: "gd-postbox-1",
      keyVersion: payload.keyVersion,
      publicKey: payload.recipientKey,
      recovery: "native-memo-1",
    };
    const secret = await this.recover(accountAddress, context, descriptor);
    try {
      const letter = await openMailbox(payload, context, envelopeId, secret);
      this.unchanged(token);
      return letter;
    } finally {
      secret.fill(0);
    }
  }
}
