import type { MailboxContext, MailboxKey } from "./types";
import { hex, unhex } from "./crypto";
import { mailboxAAD, mailboxKey } from "./mailbox";

// A capsule is private plaintext for an ordinary encrypted Ootle memo, never
// public registry data. Native wallet encryption protects it under its view key.
async function binding(context: MailboxContext) {
  const aad = mailboxAAD(
    context,
    "key-capsule",
    "00".repeat(32),
    "00".repeat(32),
  );
  return hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(aad).buffer),
    ),
  );
}
export async function encodeMailboxCapsule(
  context: MailboxContext,
  secret: Uint8Array,
): Promise<{ memo: { Message: string }; descriptor: MailboxKey }> {
  const { publicKeyFromSecretKey } = await import("@tari-project/ootle-wasm");
  if (secret.length !== 32) throw new Error("Invalid mailbox key");
  const descriptor = mailboxKey({
    version: "gd-postbox-1",
    keyVersion: context.keyVersion,
    publicKey: hex(publicKeyFromSecretKey(secret)),
  });
  const text = JSON.stringify([
    "gd-capsule-1",
    await binding(context),
    context.keyVersion,
    hex(secret),
  ]);
  if (new TextEncoder().encode(text).length > 253)
    throw new Error("Mailbox capsule exceeds native memo capacity");
  return { memo: { Message: text }, descriptor };
}
export async function recoverMailboxCapsule(
  context: MailboxContext,
  memo: unknown,
  expected: MailboxKey,
): Promise<Uint8Array> {
  let secret: Uint8Array | undefined;
  try {
    const descriptor = mailboxKey(expected);
    if (
      !memo ||
      typeof memo !== "object" ||
      !("Message" in memo) ||
      typeof memo.Message !== "string"
    )
      throw new Error();
    const tuple: unknown = JSON.parse(memo.Message);
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 4 ||
      tuple[0] !== "gd-capsule-1" ||
      tuple[1] !== (await binding(context)) ||
      tuple[2] !== context.keyVersion ||
      descriptor.keyVersion !== context.keyVersion ||
      typeof tuple[3] !== "string" ||
      !/^[a-f0-9]{64}$/.test(tuple[3])
    )
      throw new Error();
    secret = unhex(tuple[3]);
    const { publicKeyFromSecretKey } = await import("@tari-project/ootle-wasm");
    if (hex(publicKeyFromSecretKey(secret)) !== descriptor.publicKey)
      throw new Error();
    return secret;
  } catch {
    secret?.fill(0);
    // Avoid including private memo contents in parser errors or diagnostics.
    throw new Error(
      "Mailbox recovery capsule does not match this postbox and key version",
    );
  }
}
