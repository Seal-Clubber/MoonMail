import { FeeLimitError, walletFeeFailure } from "./fee-limit";
import { parseOotleAddress } from "@tari-project/ootle-wasm";
import type { WalletAccount } from "./wallet";
import type { NativeMailboxAdapter } from "./native-mailbox";
import type {
  MailboxContext,
  MailboxPayload,
  Letter,
  CapsuleDeployment,
} from "./types";
import { hex } from "./crypto";
import {
  paymentAddress,
  paymentAmount,
  paymentHex,
  paymentMemo,
  privateTari,
  type PaymentRequest,
  type PaymentReceipt,
} from "./private-payment";
import {
  SapientCapsuleMailbox,
  type CapsuleSubstateReader,
  verifyCapsuleDeployment,
} from "./sapient-capsule";
import {
  prepareSapientCapsule,
  capsuleStoreTransaction,
} from "./sapient-capsule-create";
import { money, type publishTransaction } from "./transactions";
import {
  postboxClaimChallenge,
  type WalletOwnershipProof,
} from "./postbox-claim";
import type { Envelope } from "./types";
import {
  beginSubmission,
  completeSubmission,
  hasUnresolved,
  readPending,
  savePending,
  type Pending,
  capsuleIdentity,
  validCapsule,
} from "./pending";

export interface SapientProvider {
  isTariWallet: true;
  info: { name: string; rdns: string; embedded: boolean };
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}
export type SapientPostage = "transparent" | "private";
type WalletWindow = Window & {
  tari?: SapientProvider;
  tariProviders?: SapientProvider[];
};
export function sapientProvider(): SapientProvider | undefined {
  if (typeof window === "undefined") return;
  const w = window as WalletWindow;
  return [
    ...(Array.isArray(w.tariProviders) ? w.tariProviders : []),
    w.tari,
  ].find((p) => p?.isTariWallet === true && p.info?.rdns === "mw.tari.sapient");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Sapient response");
  return value as Record<string, unknown>;
}
function transactionId(result: unknown) {
  const r = record(result),
    id = r.transactionId ?? r.transaction_id;
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    throw new Error(
      "Sapient did not return a transaction ID. Keep this operation pending and inspect wallet history.",
    );
  return id;
}
const networkName = (network: number) =>
  network === 38 ? "esmeralda" : network === 36 ? "igor" : undefined;
export class SapientSession {
  readonly kind = "sapient" as const;
  readonly version = "Sapient injected provider";
  privateFeeCapable = false;
  private active = true;
  private constructor(
    private provider: SapientProvider,
    readonly accounts: WalletAccount[],
    readonly network: number,
  ) {}
  private async call(method: string, params?: unknown, timeout = 30000) {
    if (!this.active) throw new Error("Reconnect Sapient before continuing");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        this.provider.request({ method, params }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Sapient request timed out. Reconcile the existing operation before retrying.",
                ),
              ),
            timeout,
          );
        }),
      ]);
      if (!this.active)
        throw new Error(
          "Wallet session changed; reconnect and resume the existing request",
        );
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
  static async connect(network: number, provider = sapientProvider()) {
    return (await this.authorize(network, provider, true))!;
  }
  // Restore only an existing site grant. This never opens a permission prompt.
  static async resumeAuthorized(network: number, provider = sapientProvider()) {
    if (!provider) return;
    return this.authorize(network, provider, false);
  }
  private static async authorize(
    network: number,
    provider: SapientProvider | undefined,
    request: boolean,
  ) {
    if (!networkName(network))
      throw new Error(
        "Sapient supports Esmeralda and Igor; choose a supported network",
      );
    if (
      !provider ||
      provider.isTariWallet !== true ||
      provider.info?.rdns !== "mw.tari.sapient"
    )
      throw new Error(
        "Sapient was not detected. Open MoonMail in the browser where Sapient is installed, then try again.",
      );
    const session = new SapientSession(provider, [], network);
    try {
      if ((await session.call("tari_getNetwork")) !== networkName(network))
        throw new Error("Switch Sapient to the selected Ootle network");
      const addresses = await session.call(
        request ? "tari_requestAccounts" : "tari_getAccounts",
        undefined,
        request ? 120000 : 30000,
      );
      if (!request && Array.isArray(addresses) && addresses.length === 0) {
        session.invalidate();
        return;
      }
      if (
        !Array.isArray(addresses) ||
        addresses.length !== 1 ||
        typeof addresses[0] !== "string" ||
        !/^component_[a-f0-9]{64}$/.test(addresses[0])
      )
        throw new Error("Sapient must expose one selected account");
      const address = await session.call("tari_getWalletAddress");
      if (typeof address !== "string")
        throw new Error("Invalid Sapient receiving address");
      const parsed = parseOotleAddress(address);
      try {
        if (parsed.network !== network || parsed.memo?.length)
          throw new Error("Sapient returned an address for another network");
        session.accounts.push({
          address,
          account: {
            name: "Sapient selected account",
            component_address: addresses[0],
            owner_public_key: hex(parsed.owner_key),
            owner_key_id: null,
          },
        });
      } finally {
        parsed.free();
      }
      const capabilities = record(await session.call("tari_getCapabilities"));
      session.privateFeeCapable = capabilities.supportsPrivateFees === true;
      if (
        capabilities.transactionRequests !== true ||
        capabilities.walletAddress !== true
      )
        throw new Error(
          "Update Sapient: transaction requests and receiving addresses are required",
        );
      await session.assertCurrent();
      return session;
    } catch (error) {
      if (request) session.disconnect();
      else session.invalidate();
      throw error;
    }
  }
  async assertCurrent() {
    const network = await this.call("tari_getNetwork"),
      accounts = await this.call("tari_getAccounts"),
      address = await this.call("tari_getWalletAddress");
    if (
      network !== networkName(this.network) ||
      !Array.isArray(accounts) ||
      accounts.length !== 1 ||
      accounts[0] !== this.accounts[0].account.component_address ||
      address !== this.accounts[0].address
    ) {
      this.invalidate();
      throw new Error(
        "Sapient account or network changed. Reconnect before continuing.",
      );
    }
  }
  // Public-only read: never request private view access or infer a hidden private balance.
  async publicTariBalance() {
    await this.assertCurrent();
    const balances = await this.call("tari_getBalances");
    await this.assertCurrent();
    if (!Array.isArray(balances)) throw new Error("Invalid Sapient balances");
    const rows = balances.map(record);
    if (
      rows.some(
        (row) =>
          typeof row.resourceAddress !== "string" ||
          !/^resource_[a-f0-9]{64}$/.test(row.resourceAddress),
      )
    )
      throw new Error("Invalid Sapient resource balance");
    const native = rows.filter(
      (balance) => balance.resourceAddress === `resource_${"01".repeat(32)}`,
    );
    if (native.length > 1) throw new Error("Duplicate Sapient TARI balance");
    if (!native.length) return "0";
    const balance = native[0];
    if (
      balance.divisibility !== 6 ||
      balance.kind !== "Stealth" ||
      typeof balance.amount !== "string"
    )
      throw new Error("Invalid Sapient TARI balance");
    return money(balance.amount).toString();
  }
  async privatePaymentCapabilities(receiving = false) {
    await this.assertCurrent();
    const capabilities = record(await this.call("tari_getCapabilities"));
    await this.assertCurrent();
    if (
      receiving
        ? capabilities.privateScan !== true
        : capabilities.privateSpend !== true ||
          capabilities.supportsPrivateFees !== true
    )
      throw new Error(
        receiving
          ? "This Sapient account cannot import native private payments"
          : "This Sapient account cannot send privately with private postage. No public fallback is allowed.",
      );
  }
  async createPrivatePayment(
    request: PaymentRequest,
    intentId: string,
    feeCap: string,
  ) {
    if (request.resource !== privateTari)
      throw new Error("Only native test TARI is supported");
    paymentAmount(request.amount);
    paymentAmount(feeCap);
    paymentAddress(request.destination, this.network);
    paymentHex(intentId);
    await this.privatePaymentCapabilities();
    const created = record(
      await this.call("tari_createTransactionRequest", {
        kind: "sendPrivately",
        resourceAddress: privateTari,
        recipientWalletAddress: request.destination,
        amount: request.amount,
        maxFee: feeCap,
        memo: paymentMemo(intentId),
        minimumValuePromise: "0",
        feeType: "private",
        enforceFeeType: true,
      }).catch((error) => {
        throw walletFeeFailure(error, "private-payment") ?? error;
      }),
    );
    if (
      typeof created.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(created.requestId)
    )
      throw new Error(
        "Private payment request identity was lost. Keep the original attempt; do not create another.",
      );
    await this.assertCurrent();
    return created.requestId;
  }
  async inspectPrivatePayment(requestId: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId))
      throw new Error("Invalid original private payment request");
    await this.assertCurrent();
    const r = record(
      await this.call("tari_getTransactionRequest", { requestId }),
    );
    await this.assertCurrent();
    if (
      r.requestId !== requestId ||
      ![
        "pending",
        "approved",
        "submitting",
        "submitted",
        "rejected",
        "failed",
      ].includes(r.status as string)
    )
      throw new Error(
        "Private payment request does not match the original approval",
      );
    if (r.status === "failed" && walletFeeFailure(r.error, "private-payment"))
      throw walletFeeFailure(r.error, "private-payment")!;
    return r as {
      requestId: string;
      status:
        | "pending"
        | "approved"
        | "submitting"
        | "submitted"
        | "rejected"
        | "failed";
      result?: unknown;
    };
  }
  async submitPrivatePayment(requestId: string) {
    const existing = await this.inspectPrivatePayment(requestId);
    if (existing.status === "submitted") return existing.result;
    if (existing.status !== "approved")
      throw new Error(
        "Keep the original private payment approval and resume it; do not create a replacement",
      );
    await this.privatePaymentCapabilities();
    return this.call(
      "tari_submitTransactionRequest",
      { requestId },
      120000,
    ).catch((error) => {
      throw walletFeeFailure(error, "private-payment") ?? error;
    });
  }
  async importPrivatePayment(receipt: PaymentReceipt) {
    await this.privatePaymentCapabilities(true);
    if (
      receipt.resource !== privateTari ||
      receipt.destination !== this.accounts[0].address
    )
      throw new Error(
        "This payment is addressed to a different Sapient wallet",
      );
    paymentHex(receipt.commitment);
    if (!(await this.hasPostboxViewAccess()))
      throw new Error(
        "Approve private view access before importing this payment. Spending permission is separate.",
      );
    let result: Record<string, unknown>,
      alreadyImported = false;
    try {
      result = record(
        await this.call("tari_claimPrivatePayment", {
          resourceAddress: privateTari,
          commitment: receipt.commitment,
        }),
      );
    } catch (error) {
      if (!/already claimed this payment/i.test(String(error))) throw error;
      const rows = await this.call("tari_getShieldedOutputs", {
        resourceAddress: privateTari,
      });
      if (!Array.isArray(rows))
        throw new Error("Sapient did not return its existing private outputs");
      const found = rows
        .map(record)
        .filter(
          (row) =>
            row.resourceAddress === privateTari &&
            row.commitment === receipt.commitment,
        );
      if (found.length !== 1)
        throw new Error(
          "Sapient reported an earlier import but the exact private output cannot be verified",
        );
      result = found[0];
      alreadyImported = true;
    }
    await this.assertCurrent();
    if (!(await this.hasPostboxViewAccess()))
      throw new Error("Private view permission was removed during import");
    if (
      result.amount !== receipt.amount ||
      result.memo !== paymentMemo(receipt.intentLetter)
    )
      throw new Error(
        "Sapient recovered a different amount or payment memo. Do not treat this receipt as paid.",
      );
    return { amount: receipt.amount, alreadyImported };
  }
  invalidate() {
    this.active = false;
  }
  disconnect() {
    this.invalidate();
    void this.provider.request({ method: "tari_disconnect" }).catch(() => {});
  }
  nativeMailbox(): NativeMailboxAdapter {
    throw new Error(
      "Sapient uses recovery capsules; native daemon memo recovery is unsupported. Choose the verified Sapient postbox office.",
    );
  }
  // Each deployment must record recovery evidence before enabling new setup.
  // The wallet popup explains the grant; the website must also explain its account-wide scope.
  async hasPostboxViewAccess() {
    await this.assertCurrent();
    const result = record(await this.call("tari_getViewAccess"));
    await this.assertCurrent();
    return result.granted === true;
  }
  async requestPostboxViewAccess() {
    await this.assertCurrent();
    const result = record(
      await this.call("tari_requestViewAccess", undefined, 120000),
    );
    await this.assertCurrent();
    if (result.granted !== true)
      throw new Error("Sapient private view access was declined");
  }
  async authorizePostboxClaim(
    envelope: Envelope,
    destination: string,
    validUntil: number,
  ): Promise<WalletOwnershipProof> {
    const challenge = postboxClaimChallenge(envelope, destination, validUntil);
    if (
      envelope.context.network !== this.network ||
      envelope.claimAuthority !== this.accounts[0].account.owner_public_key
    )
      throw new Error(
        "Choose the Sapient wallet controlling this postbox gift",
      );
    await this.assertCurrent();
    const result = record(
      await this.call(
        "tari_signWalletOwnershipChallenge",
        { challenge },
        120000,
      ),
    );
    await this.assertCurrent();
    if (
      result.walletAddress !== this.accounts[0].address ||
      typeof result.publicNonce !== "string" ||
      typeof result.signature !== "string" ||
      !/^[a-f0-9]{64}$/.test(result.publicNonce) ||
      !/^[a-f0-9]{64}$/.test(result.signature)
    )
      throw new Error(
        "Sapient returned an ownership proof for a different account or invalid encoding",
      );
    return {
      walletAddress: result.walletAddress as string,
      publicNonce: result.publicNonce,
      signature: result.signature,
    };
  }
  capsuleMailbox(read: CapsuleSubstateReader) {
    return new SapientCapsuleMailbox(
      {
        network: this.network,
        account: this.accounts[0],
        assertCurrent: () => this.assertCurrent(),
        request: (method, params) => this.call(method, params),
      },
      read,
    );
  }
  async decryptPostbox(
    _account: string,
    _context: MailboxContext,
    _id: string,
    _payload: MailboxPayload,
  ): Promise<Letter> {
    throw new Error(
      "This postbox uses an earlier wallet recovery method. Sapient recovery is not yet supported; its existing keys have been preserved.",
    );
  }
  async submitOperation(
    tx: ReturnType<typeof publishTransaction>,
    feeCap: string,
    storage: Storage,
    context: Omit<Pending, "id" | "state" | "walletRequest">,
    postage: SapientPostage = "transparent",
  ) {
    if (context.operation === "claim" || context.operation === "capsule")
      throw new Error(
        "Sapient cannot replace prepaid fee instructions or native key recovery",
      );
    return this.submitInstructions(tx, feeCap, storage, context, postage);
  }
  private unusedCapsule(storage: Storage, context: MailboxContext) {
    const identity = capsuleIdentity(context);
    if (
      hasUnresolved(storage, context.network, context.registry, identity) ||
      readPending(storage).some(
        (p) =>
          p.network === context.network &&
          p.registry === context.registry &&
          p.operation === "capsule" &&
          p.envelopeId === identity,
      )
    )
      throw new Error(
        "A recovery setup already exists; resume it before generating another key",
      );
  }
  async storeCapsule(
    context: MailboxContext,
    deployment: CapsuleDeployment,
    feeCap: string,
    storage: Storage,
    funding: {
      readSubstate: CapsuleSubstateReader;
      vaults(account: string): Promise<string[]>;
      epoch(): Promise<number>;
      resolveInputs(
        inputs: ReturnType<typeof capsuleStoreTransaction>["inputs"],
      ): Promise<ReturnType<typeof capsuleStoreTransaction>["inputs"]>;
    },
  ) {
    if (
      context.network !== this.network ||
      context.controller !== this.accounts[0].account.owner_public_key
    )
      throw new Error("Choose the connected Sapient controller and network");
    if (money(feeCap) <= 0n)
      throw new Error("A positive transaction fee cap is required");
    this.unusedCapsule(storage, context);
    await this.assertCurrent();
    await verifyCapsuleDeployment(deployment, funding.readSubstate);
    const vaults = await funding.vaults(
        this.accounts[0].account.component_address,
      ),
      epoch = await funding.epoch();
    await this.assertCurrent();
    const prepared = await prepareSapientCapsule(
      context,
      this.accounts[0],
      deployment,
    );
    this.unusedCapsule(storage, context);
    const tx = capsuleStoreTransaction(prepared, feeCap, epoch, vaults);
    tx.inputs = await funding.resolveInputs(tx.inputs);
    const transactionId = await this.submitInstructions(tx, feeCap, storage, {
      network: context.network,
      registry: context.registry,
      envelopeId: capsuleIdentity(context),
      operation: "capsule",
      capsule: prepared.capsule,
    });
    return { transactionId, capsule: prepared.capsule };
  }
  private async submitInstructions(
    tx: ReturnType<typeof publishTransaction>,
    feeCap: string,
    storage: Storage,
    context: Omit<Pending, "id" | "state" | "walletRequest">,
    postage: SapientPostage = "transparent",
  ) {
    if (
      context.operation === "capsule" &&
      (!validCapsule(context) ||
        context.capsule?.descriptor.recovery !== "sapient-capsule-1" ||
        context.capsule.account !==
          this.accounts[0].account.component_address ||
        context.capsule.context.controller !==
          this.accounts[0].account.owner_public_key)
    )
      throw new Error("Invalid Sapient capsule operation");
    if (context.network !== this.network)
      throw new Error("Wrong Sapient operation network");
    if (money(feeCap) <= 0n)
      throw new Error("A positive transaction fee cap is required");
    await this.assertCurrent();
    if (postage !== "private" && postage !== "transparent")
      throw new Error("Choose a supported postage source");
    if (postage === "private") {
      const capabilities = record(await this.call("tari_getCapabilities"));
      if (capabilities.supportsPrivateFees !== true)
        throw new Error(
          "This Sapient account cannot pay private postage. No public fallback was requested.",
        );
      await this.assertCurrent();
    }
    if (context.operation === "capsule")
      this.unusedCapsule(storage, context.capsule!.context);
    const params = {
      instructions: tx.instructions,
      // Stock Sapient appends the native TARI resource itself when constructing
      // private fees. A duplicate resource input makes its WASM decoder reject
      // the transaction. Leave that dependency to the wallet, preserving all
      // other explicit dependencies and the transparent path unchanged.
      inputs:
        postage === "private"
          ? tx.inputs.filter(
              (i) => i.substate_id !== `resource_${"01".repeat(32)}`,
            )
          : tx.inputs,
      maxFee: feeCap,
    };
    // Stock 0.6.6's legacy dry-run API always pays a transparent fee. It cannot
    // simulate private postage; do not silently reveal funds to satisfy it.
    // The native wallet constructs private fee proofs under the user's approval.
    if (postage === "transparent") {
      const dry = record(
        await this.call("tari_signAndSubmitTransaction", {
          ...params,
          dryRun: true,
        }),
      );
      const execution = record(dry.result),
        finalize = record(execution.finalize),
        outcome = record(finalize.result);
      if (money(String(finalize.total_fees_required)) > money(feeCap))
        throw new FeeLimitError(
          context.operation,
          hasUnresolved(
            storage,
            context.network,
            context.registry,
            context.envelopeId,
          )
            ? "locked"
            : "low",
          String(finalize.total_fees_required),
        );
      if (!("Accept" in outcome))
        throw new Error("Sapient simulation rejected; nothing submitted");
    }
    await this.assertCurrent();
    if (context.operation === "capsule")
      this.unusedCapsule(storage, context.capsule!.context);
    if (
      hasUnresolved(
        storage,
        context.network,
        context.registry,
        context.envelopeId,
      )
    )
      throw new Error("Resume the existing submission first");
    const attempt = beginSubmission(storage, context);
    const created = record(
      await this.call("tari_createTransactionRequest", {
        kind: "instructions",
        ...params,
        feeType: postage,
        enforceFeeType: true,
      }).catch((error) => {
        throw walletFeeFailure(error, context.operation) ?? error;
      }),
    );
    if (
      typeof created.requestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(created.requestId)
    )
      throw new Error("Invalid Sapient request ID; retain the unknown attempt");
    const pending = readPending(storage).find((p) => p.id === attempt);
    if (!pending) throw new Error("Submission journal missing");
    savePending(storage, {
      ...pending,
      walletRequest: {
        provider: "sapient",
        id: created.requestId,
        account: this.accounts[0].account.component_address,
      },
    });
    return this.resume(attempt, storage);
  }
  async resume(attempt: string, storage: Storage, waitMs = 120000) {
    const pending = readPending(storage).find((p) => p.id === attempt),
      request = pending?.walletRequest;
    if (
      !pending ||
      !request ||
      pending.operation === "claim" ||
      (pending.operation === "capsule" &&
        (pending.capsule?.descriptor.recovery !== "sapient-capsule-1" ||
          pending.capsule.context.controller !==
            this.accounts[0].account.owner_public_key)) ||
      pending.network !== this.network ||
      request.account !== this.accounts[0].account.component_address ||
      pending.state !== "unknown"
    )
      throw new Error(
        "This pending request does not match the connected Sapient account",
      );
    const end = Date.now() + waitMs;
    do {
      await this.assertCurrent();
      const r = record(
        await this.call("tari_getTransactionRequest", {
          requestId: request.id,
        }),
      );
      if (r.requestId !== request.id)
        throw new Error("Sapient request identity mismatch");
      if (r.status === "submitted") {
        const id = transactionId(r.result);
        completeSubmission(storage, attempt, id);
        return id;
      }
      if (r.status === "approved") {
        // Sapient claims this persisted request atomically; never create a replacement.
        const result = await this.call(
          "tari_submitTransactionRequest",
          { requestId: request.id },
          120000,
        ).catch((error) => {
          throw walletFeeFailure(error, pending.operation) ?? error;
        });
        const id = transactionId(result);
        completeSubmission(storage, attempt, id);
        return id;
      }
      if (r.status === "rejected") {
        savePending(storage, { ...pending, state: "rejected" });
        throw new Error(
          "Transaction rejected in Sapient; nothing submitted by MoonMail",
        );
      }
      if (r.status === "failed" && walletFeeFailure(r.error, pending.operation))
        throw walletFeeFailure(r.error, pending.operation)!;
      if (r.status === "failed")
        throw new Error(
          "Sapient reported failure. Retain this request and reconcile wallet history before any replacement.",
        );
      if (r.status !== "pending" && r.status !== "submitting")
        throw new Error("Invalid Sapient request status");
      if (Date.now() >= end) break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    } while (true);
    throw new Error(
      "Approval or submission is still pending in Sapient. Resume the saved request in Activity.",
    );
  }
}
