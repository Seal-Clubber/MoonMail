import type {
  Envelope,
  Letter,
  MailboxContext,
  Postbox,
  SentCopy,
} from "./types";
import { mailboxKey, sealMailbox } from "./mailbox";
import { base64url } from "./crypto";

export function sentCopy(envelope: Envelope): SentCopy | undefined {
  if (envelope.mode === "public" || !("sent" in envelope.payload)) return;
  const copy = envelope.payload.sent;
  if (!copy) return;
  if (
    copy.version !== "gd-sent-1" ||
    copy.postbox !== envelope.replyPostbox ||
    copy.controller !== envelope.sender ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(copy.postbox) ||
    !/^[a-f0-9]{64}$/.test(copy.controller) ||
    !copy.payload ||
    copy.payload.sent !== undefined
  )
    throw new Error("Invalid encrypted sent copy");
  const key = mailboxKey({
    version: copy.payload.version,
    keyVersion: copy.payload.keyVersion,
    publicKey: copy.payload.recipientKey,
    recovery: copy.payload.recovery,
    capsule: copy.payload.capsule,
  });
  if (key.recovery !== "sapient-capsule-1")
    throw new Error("Sent copy needs Sapient recovery");
  return copy;
}
export function hasSentCopy(envelope: Envelope) {
  try {
    return !!sentCopy(envelope);
  } catch {
    return false;
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
// Separate purpose binds the copy to the actual primary ciphertext and immutable routing.
// Changing collected state does not change decryption access.
export async function sentPurpose(envelope: Envelope) {
  const { sent: _copy, ...primary } =
    envelope.payload as Envelope["payload"] & { sent?: SentCopy };
  const binding = [
    "GhostDrop",
    "gd-sent-1",
    envelope.context.network,
    envelope.context.registry,
    envelope.context.template,
    envelope.id,
    envelope.mode,
    envelope.sender,
    envelope.replyPostbox || "",
    envelope.recipientPostbox || "",
    envelope.mode === "link" && "claimPublicKey" in envelope.payload
      ? envelope.payload.claimPublicKey
      : envelope.claimAuthority || "",
    canonical(primary),
  ];
  return (
    "sent:" +
    base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(binding)),
        ),
      ),
    )
  );
}
export function sentContext(
  envelope: Envelope,
  copy: SentCopy,
): MailboxContext {
  return {
    ...envelope.context,
    postbox: copy.postbox,
    controller: copy.controller,
    keyVersion: copy.payload.keyVersion,
  };
}
export async function addSentCopy(
  envelope: Envelope,
  letter: Letter,
  box: Postbox,
): Promise<Envelope> {
  if (
    envelope.mode === "public" ||
    envelope.replyPostbox !== box.id ||
    envelope.sender !== box.controller ||
    ("sent" in envelope.payload && envelope.payload.sent)
  )
    throw new Error("Choose your owned sending postbox");
  const key = mailboxKey(box.encryptionKey);
  if (key.recovery !== "sapient-capsule-1")
    throw new Error("Choose a Sapient postbox for sent recovery");
  const payload = await sealMailbox(
    letter,
    {
      ...envelope.context,
      postbox: box.id,
      controller: box.controller,
      keyVersion: key.keyVersion,
    },
    await sentPurpose(envelope),
    key,
    32768,
  );
  return {
    ...envelope,
    payload: {
      ...envelope.payload,
      sent: {
        version: "gd-sent-1",
        postbox: box.id,
        controller: box.controller,
        payload,
      },
    },
  };
}
