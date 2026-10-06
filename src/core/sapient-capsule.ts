import type {
  Letter,
  MailboxContext,
  MailboxKey,
  MailboxPayload,
  CapsuleReference,
} from "./types";
import type { WalletAccount } from "./wallet";
import { mailboxAAD, mailboxKey, openMailbox } from "./mailbox";
import { recoverMailboxCapsule } from "./capsules";
import { denyAllCarrierRoot } from "./native-mailbox";

export type CapsuleSubstateReader = (
  id: string,
) => Promise<{ substate: unknown }>;
export interface CapsuleWalletPort {
  network: number;
  account: WalletAccount;
  assertCurrent(): Promise<void>;
  request(method: string, params?: unknown): Promise<unknown>;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Unsupported permanent capsule response");
  return value as Record<string, unknown>;
}
// Inspect the current ledger, even when the wallet has a cached decrypted memo.
// Indexer trust is the same boundary as other application substate reads.
export async function verifyPermanentCarrier(
  reference: CapsuleReference,
  read: CapsuleSubstateReader,
) {
  if (
    !/^resource_[a-f0-9]{64}$/.test(reference.resource) ||
    !/^[a-f0-9]{64}$/.test(reference.commitment)
  )
    throw new Error("Invalid permanent capsule reference");
  const resource = object(
    object((await read(reference.resource)).substate).Resource,
  );
  const rules = object(resource.access_rules);
  if (
    resource.resource_type !== "Stealth" ||
    resource.owner_rule !== "None" ||
    resource.auth_hook !== null ||
    resource.view_key !== null ||
    rules.auth_hook_updater !== "Locked" ||
    rules.mint_updater !== "Locked" ||
    ["burn", "recall", "freeze"].some(
      (name) =>
        rules[name] !== "DenyAll" || rules[`${name}_updater`] !== "Locked",
    )
  )
    throw new Error("Capsule resource does not preserve immutable recovery");
  const mint = object(
    object(object(object(rules.mint).Restricted).Require).Require,
  );
  if (
    typeof mint.ScopedToComponent !== "string" ||
    !/^component_[a-f0-9]{64}$/.test(mint.ScopedToComponent)
  )
    throw new Error("Unsupported capsule mint authority");
  const id = `utxo_${reference.resource.slice("resource_".length)}_${reference.commitment}`;
  const utxo = object(object((await read(id)).substate).Utxo);
  const output = object(utxo.output),
    auth = object(output.auth);
  if (
    utxo.is_frozen !== false ||
    Object.keys(auth).length !== 1 ||
    auth.Script !== (await denyAllCarrierRoot())
  )
    throw new Error("Capsule carrier is not permanently locked");
  return id;
}

// Deliberately separate from transaction submission. View permission must already
// have been explicitly granted; this adapter never requests signing or a seed.
export class SapientCapsuleMailbox {
  constructor(
    private wallet: CapsuleWalletPort,
    private read: CapsuleSubstateReader,
  ) {}
  private async assertView() {
    await this.wallet.assertCurrent();
    const view = object(await this.wallet.request("tari_getViewAccess"));
    await this.wallet.assertCurrent();
    if (view.granted !== true)
      throw new Error(
        "Approve Sapient private view access before recovering a postbox. This permission covers the account's private output summaries.",
      );
  }
  async recover(
    account: string,
    context: MailboxContext,
    value: MailboxKey,
  ): Promise<Uint8Array> {
    const descriptor = mailboxKey(value);
    mailboxAAD(context, "key-capsule", "00".repeat(32), "00".repeat(32));
    if (
      descriptor.recovery !== "sapient-capsule-1" ||
      !descriptor.capsule ||
      descriptor.keyVersion !== context.keyVersion ||
      context.network !== this.wallet.network ||
      this.wallet.account.account.component_address !== account ||
      this.wallet.account.account.owner_public_key !== context.controller
    )
      throw new Error(
        "Choose the Sapient account controlling this capsule and key version",
      );
    await this.assertView();
    await verifyPermanentCarrier(descriptor.capsule, this.read);
    await this.wallet.assertCurrent();
    const params = { resourceAddress: descriptor.capsule.resource };
    const summaries = await this.wallet.request(
      "tari_getShieldedOutputs",
      params,
    );
    if (!Array.isArray(summaries))
      throw new Error("Invalid Sapient capsule summaries");
    const matches = summaries.filter(
      (s) =>
        object(s).resourceAddress === descriptor.capsule!.resource &&
        object(s).commitment === descriptor.capsule!.commitment,
    );
    if (matches.length > 1)
      throw new Error("Ambiguous Sapient capsule summary");
    // This API records a decrypted output locally; it does not spend the carrier.
    const payment =
      matches.length === 1
        ? object(matches[0])
        : object(
            await this.wallet.request("tari_claimPrivatePayment", {
              ...params,
              commitment: descriptor.capsule.commitment,
            }),
          );
    if (
      payment.amount !== "1" ||
      typeof payment.memo !== "string" ||
      new TextEncoder().encode(payment.memo).length > 253
    )
      throw new Error("Invalid Sapient recovery carrier or memo");
    await this.wallet.assertCurrent();
    const secret = await recoverMailboxCapsule(
      context,
      { Message: payment.memo },
      descriptor,
    );
    try {
      await this.assertView();
      return secret;
    } catch (error) {
      secret.fill(0);
      throw error;
    }
  }
  async open(
    account: string,
    context: MailboxContext,
    id: string,
    payload: MailboxPayload,
  ): Promise<Letter> {
    const descriptor = mailboxKey({
      version: payload.version,
      keyVersion: payload.keyVersion,
      publicKey: payload.recipientKey,
      recovery: payload.recovery,
      capsule: payload.capsule,
    });
    const secret = await this.recover(account, context, descriptor);
    try {
      const letter = await openMailbox(payload, context, id, secret);
      await this.assertView();
      return letter;
    } finally {
      secret.fill(0);
    }
  }
}
