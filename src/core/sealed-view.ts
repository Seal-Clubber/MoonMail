import type { Context, Envelope, Postbox } from "./types";
import { mailboxKey } from "./mailbox";
import type { RecoveredSealedMail, SealedMailEntry } from "./sealed-mail";
import { sealedPayloadHash } from "./sealed-mail";
import type { Pending } from "./pending";
export async function verifySealedPublication(
  pending: Pending,
  envelope: Envelope,
) {
  const binding = pending.sealedBinding;
  if (!binding) return;
  if (
    envelope.deliveryProtocol !== "mm-sealed-2" ||
    envelope.context.network !== pending.network ||
    envelope.context.registry !== pending.registry ||
    envelope.id !== pending.envelopeId ||
    envelope.sender !== binding.sender ||
    !("version" in envelope.payload) ||
    envelope.payload.version !== "mm-sealed-2" ||
    (await sealedPayloadHash(envelope.payload)) !== binding.payloadHash
  )
    throw new Error(
      "The stored sealed letter does not match this original submission. Keep the request and inspect Sapient history; do not send a replacement.",
    );
}

// Local display metadata only. The chain envelope never contains these fields.
// A nickname/contact/thread needs directory identity, not just a claimed name.
export function recoveredSealedEnvelope(
  entry: SealedMailEntry & { component?: string },
  opened: RecoveredSealedMail,
  boxes: readonly Postbox[],
  context: Context,
): Envelope {
  if (
    entry.id !== opened.id ||
    entry.senderPublicKey !== opened.message.sender.controller ||
    (!opened.inbox && !opened.sent)
  )
    throw new Error("Sealed display identity mismatch");
  const message = opened.message;
  const ownsKey = (
    box: Postbox | undefined,
    party: { keyVersion: number; publicKey: string },
    conversation = false,
  ) => {
    if (!box) return false;
    try {
      const key = [
        ...(box.keyHistory ?? []),
        mailboxKey(box.encryptionKey),
      ].find((k) => k.keyVersion === party.keyVersion);
      return !!key && (conversation || key.publicKey === party.publicKey);
    } catch {
      return false;
    }
  };
  const sender = boxes.find(
      (b) =>
        b.id === message.sender.postbox &&
        b.controller === entry.senderPublicKey,
    ),
    recipient = boxes.find((b) => b.id === message.recipient.postbox);
  const verifiedSender = ownsKey(sender, message.sender),
    verifiedRecipient = ownsKey(
      recipient,
      message.recipient,
      !!message.recipient.conversation,
    );
  return {
    deliveryProtocol: "mm-sealed-2",
    localAccess: { inbox: opened.inbox, sent: opened.sent },
    id: entry.id,
    component: entry.component,
    mode: "postbox",
    context: { ...context },
    payload: structuredClone(entry.payload),
    sender: entry.senderPublicKey,
    replyPostbox: verifiedSender ? sender!.id : undefined,
    recipientPostbox: verifiedRecipient ? recipient!.id : undefined,
    claimAuthority: verifiedRecipient ? recipient!.controller : undefined,
    gift: "0",
    reserve: "0",
    claimed: false,
  };
}
export function preserveSealedViews(
  previous: readonly Envelope[],
  incoming: readonly Envelope[],
): Envelope[] {
  const prior = new Map(
    previous
      .filter((e) => e.deliveryProtocol === "mm-sealed-2" && e.localAccess)
      .map((e) => [e.id, e]),
  );
  return incoming.map((e) => {
    const old = prior.get(e.id);
    if (
      !old ||
      e.deliveryProtocol !== "mm-sealed-2" ||
      e.sender !== old.sender ||
      e.component !== old.component ||
      e.context.network !== old.context.network ||
      e.context.registry !== old.context.registry ||
      e.context.template !== old.context.template ||
      JSON.stringify(e.payload) !== JSON.stringify(old.payload)
    )
      return e;
    return {
      ...e,
      localAccess: old.localAccess,
      replyPostbox: old.replyPostbox,
      recipientPostbox: old.recipientPostbox,
      claimAuthority: old.claimAuthority,
    };
  });
}
