import type { Envelope, Letter, MailboxKey } from "./types";
import { envelopeSize } from "./crypto";

// AES-GCM adds a 16-byte tag. Unpadded base64url takes ceil(bytes * 4 / 3).
// These placeholders measure the wire format without generating or retaining keys.
export function draftEnvelopeSize(
  letter: Letter,
  envelope: Omit<Envelope, "payload">,
  mailbox?: MailboxKey,
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
  return envelopeSize({ ...envelope, payload });
}
