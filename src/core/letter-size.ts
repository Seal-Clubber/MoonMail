import type { Envelope, Letter, MailboxKey } from "./types";
import { envelopeSize } from "./crypto";

// AES-GCM adds a 16-byte tag. Unpadded base64url takes ceil(bytes * 4 / 3).
// These placeholders measure the wire format without generating or retaining keys.
export function draftEnvelopeSize(
  letter: Letter,
  envelope: Omit<Envelope, "payload">,
  mailbox?: MailboxKey,
  sentMailbox?: { key: MailboxKey; postbox: string; controller: string },
) {
  const ciphertext = "A".repeat(
    Math.ceil(((envelopeSize(letter) + 16) * 4) / 3),
  );
  const payload =
    envelope.mode === "public"
      ? letter
      : envelope.mode === "link"
        ? {
            version: "gd-link-1",
            iv: "A".repeat(16),
            ciphertext,
            wrapIv: "A".repeat(16),
            wrappedClaimKey: "A".repeat(64),
            claimPublicKey: "a".repeat(64),
          }
        : mailbox
          ? {
              version: "gd-postbox-1",
              keyVersion: mailbox.keyVersion,
              recipientKey: mailbox.publicKey,
              ephemeralPublicKey: "a".repeat(64),
              iv: "A".repeat(16),
              ciphertext,
              ...(mailbox.recovery ? { recovery: mailbox.recovery } : {}),
              ...(mailbox.capsule ? { capsule: { ...mailbox.capsule } } : {}),
            }
          : undefined;
  if (!payload) throw new Error("Choose a postbox to check letter space");
  const sent =
    envelope.mode !== "public" && sentMailbox
      ? {
          version: "gd-sent-1",
          postbox: sentMailbox.postbox,
          controller: sentMailbox.controller,
          payload: {
            version: "gd-postbox-1",
            keyVersion: sentMailbox.key.keyVersion,
            recipientKey: sentMailbox.key.publicKey,
            ephemeralPublicKey: "a".repeat(64),
            iv: "A".repeat(16),
            ciphertext,
            recovery: sentMailbox.key.recovery,
            capsule: sentMailbox.key.capsule,
          },
        }
      : undefined;
  return envelopeSize({
    ...envelope,
    payload: sent ? { ...payload, sent } : payload,
  });
}
