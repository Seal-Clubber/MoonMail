import type {
  Envelope,
  Letter,
  MailboxContext,
  MailboxKey,
  MailboxPayload,
} from "./types";
import { assertEnvelopeSize, base64url, hex, unhex } from "./crypto";
const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const buffer = (v: Uint8Array) => new Uint8Array(v).buffer;
export function envelopeMailboxContext(envelope: Envelope): MailboxContext {
  if (
    envelope.mode !== "postbox" ||
    !envelope.recipientPostbox ||
    !envelope.claimAuthority ||
    !("version" in envelope.payload) ||
    envelope.payload.version !== "gd-postbox-1"
  )
    throw new Error("Invalid addressed letter");
  return {
    ...envelope.context,
    postbox: envelope.recipientPostbox,
    controller: envelope.claimAuthority,
    keyVersion: envelope.payload.keyVersion,
  };
}
export function mailboxKey(value: string | unknown): MailboxKey {
  const key = typeof value === "string" ? JSON.parse(value) : value;
  if (
    !key ||
    typeof key !== "object" ||
    key.version !== "gd-postbox-1" ||
    !Number.isSafeInteger(key.keyVersion) ||
    key.keyVersion < 1 ||
    key.keyVersion > 1_000_000 ||
    !/^[a-f0-9]{64}$/.test(key.publicKey) ||
    /^0+$/.test(key.publicKey)
  ) {
    throw new Error("Unsupported postbox encryption key");
  }
  return {
    version: "gd-postbox-1",
    keyVersion: key.keyVersion,
    publicKey: key.publicKey,
  };
}
export function mailboxAAD(
  context: MailboxContext,
  id: string,
  recipientKey: string,
  ephemeralPublicKey: string,
) {
  if (
    ![16, 36, 38].includes(context.network) ||
    !/^component_[a-f0-9]{64}$/.test(context.registry) ||
    !/^[a-f0-9]{64}$/.test(context.template) ||
    !/^[a-f0-9]{64}$/.test(context.controller) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(context.postbox) ||
    !Number.isSafeInteger(context.keyVersion) ||
    context.keyVersion < 1 ||
    context.keyVersion > 1_000_000 ||
    !id ||
    new TextEncoder().encode(id).length > 64
  ) {
    throw new Error("Invalid mailbox context");
  }
  return encode([
    "GhostDrop",
    "gd-postbox-1",
    context.network,
    context.registry,
    context.template,
    context.postbox,
    context.controller,
    context.keyVersion,
    id,
    recipientKey,
    ephemeralPublicKey,
  ]);
}
export async function sealMailbox(
  letter: Letter,
  context: MailboxContext,
  id: string,
  descriptor: MailboxKey,
): Promise<MailboxPayload> {
  const key = mailboxKey(descriptor);
  if (key.keyVersion !== context.keyVersion)
    throw new Error("Mailbox key version changed; review again");
  const { generateKeypair, encryptedDataDhKdfAead } =
    await import("@tari-project/ootle-wasm");
  const pair = generateKeypair();
  let secret: Uint8Array | undefined, shared: Uint8Array | undefined;
  try {
    secret = pair.secret_key;
    const ephemeralPublicKey = hex(pair.public_key);
    shared = encryptedDataDhKdfAead(secret, unhex(key.publicKey));
    const aad = mailboxAAD(context, id, key.publicKey, ephemeralPublicKey);
    const material = await crypto.subtle.importKey(
      "raw",
      buffer(shared),
      "HKDF",
      false,
      ["deriveKey"],
    );
    const aes = await crypto.subtle.deriveKey(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: buffer(encode(["GhostDrop", "gd-postbox-1", "salt"])),
        info: buffer(aad),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buffer(iv), additionalData: buffer(aad) },
      aes,
      encode(letter),
    );
    const payload: MailboxPayload = {
      version: "gd-postbox-1",
      keyVersion: key.keyVersion,
      recipientKey: key.publicKey,
      ephemeralPublicKey,
      iv: base64url(iv),
      ciphertext: base64url(new Uint8Array(ciphertext)),
    };
    assertEnvelopeSize(payload);
    return payload;
  } finally {
    secret?.fill(0);
    shared?.fill(0);
    pair.free();
  }
}
