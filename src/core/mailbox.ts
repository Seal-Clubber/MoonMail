import type {
  Envelope,
  Letter,
  MailboxContext,
  MailboxKey,
  MailboxPayload,
  CapsuleReference,
} from "./types";
import {
  assertEnvelopeSize,
  base64url,
  fromBase64url,
  hex,
  unhex,
} from "./crypto";
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
    /^0+$/.test(key.publicKey) ||
    (key.recovery !== undefined &&
      key.recovery !== "native-memo-1" &&
      key.recovery !== "sapient-capsule-1") ||
    (key.recovery === "sapient-capsule-1"
      ? !key.capsule ||
        !/^resource_[a-f0-9]{64}$/.test(key.capsule.resource) ||
        !/^[a-f0-9]{64}$/.test(key.capsule.commitment) ||
        /^0+$/.test(key.capsule.commitment)
      : key.capsule !== undefined)
  ) {
    throw new Error("Unsupported postbox encryption key");
  }
  return {
    version: "gd-postbox-1",
    keyVersion: key.keyVersion,
    publicKey: key.publicKey,
    ...(key.recovery ? { recovery: key.recovery } : {}),
    ...(key.recovery === "sapient-capsule-1"
      ? {
          capsule: {
            resource: key.capsule.resource,
            commitment: key.capsule.commitment,
          },
        }
      : {}),
  };
}
export function mailboxAAD(
  context: MailboxContext,
  id: string,
  recipientKey: string,
  ephemeralPublicKey: string,
  capsule?: CapsuleReference,
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
  const tuple: unknown[] = [
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
  ];
  if (capsule)
    tuple.push("sapient-capsule-1", capsule.resource, capsule.commitment);
  return encode(tuple);
}
export async function sealMailbox(
  letter: Letter,
  context: MailboxContext,
  id: string,
  descriptor: MailboxKey,
  limit: 4096 | 32768 = 4096,
): Promise<MailboxPayload> {
  return sealData(letter, context, id, descriptor, limit);
}
export function sealMailboxStatePayload(
  letter: Letter,
  context: MailboxContext,
  id: string,
  descriptor: MailboxKey,
) {
  if (!/^ms:[A-Za-z0-9_-]{43}$/.test(id))
    throw new Error("Invalid mailbox state purpose");
  return sealData(letter, context, id, descriptor, 98304);
}
async function sealData(
  letter: Letter,
  context: MailboxContext,
  id: string,
  descriptor: MailboxKey,
  limit: number,
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
    const aad = mailboxAAD(
      context,
      id,
      key.publicKey,
      ephemeralPublicKey,
      key.capsule,
    );
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
      ...(key.recovery ? { recovery: key.recovery } : {}),
      ...(key.capsule ? { capsule: { ...key.capsule } } : {}),
    };
    if (limit === 98304) {
      if (encode(payload).length > limit)
        throw new Error("Mailbox ciphertext exceeds limit");
    } else assertEnvelopeSize(payload, limit as 4096 | 32768);
    return payload;
  } finally {
    secret?.fill(0);
    shared?.fill(0);
    pair.free();
  }
}

export async function openMailbox(
  payload: MailboxPayload,
  context: MailboxContext,
  id: string,
  mailboxSecret: Uint8Array,
): Promise<Letter> {
  const { publicKeyFromSecretKey, encryptedDataDhKdfAead } =
    await import("@tari-project/ootle-wasm");
  const descriptor = mailboxKey({
    version: payload.version,
    keyVersion: payload.keyVersion,
    publicKey: payload.recipientKey,
    recovery: payload.recovery,
    capsule: payload.capsule,
  });
  if (
    payload.version !== "gd-postbox-1" ||
    payload.keyVersion !== context.keyVersion ||
    mailboxSecret.length !== 32 ||
    hex(publicKeyFromSecretKey(mailboxSecret)) !== payload.recipientKey
  )
    throw new Error("Mailbox key or version mismatch");
  const iv = fromBase64url(payload.iv);
  if (iv.length !== 12) throw new Error("Invalid mailbox nonce");
  const shared = encryptedDataDhKdfAead(
    mailboxSecret,
    unhex(payload.ephemeralPublicKey),
  );
  try {
    const aad = mailboxAAD(
      context,
      id,
      payload.recipientKey,
      payload.ephemeralPublicKey,
      descriptor.capsule,
    );
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
      ["decrypt"],
    );
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: buffer(iv), additionalData: buffer(aad) },
        aes,
        buffer(fromBase64url(payload.ciphertext)),
      ),
    );
    try {
      const letter: unknown = JSON.parse(new TextDecoder().decode(plain));
      if (
        !letter ||
        typeof letter !== "object" ||
        typeof (letter as Letter).subject !== "string" ||
        typeof (letter as Letter).body !== "string"
      )
        throw new Error("Invalid mailbox letter");
      return letter as Letter;
    } finally {
      plain.fill(0);
    }
  } finally {
    shared.fill(0);
  }
}
