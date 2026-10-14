// Protocol prototype: deliberately not connected to the deployed V3 mailbox.
// Discovery is bounded trial decryption using recovered mailbox keys; the outer
// envelope carries no recipient key, postbox ID, controller or capsule locator.
import type { Context, Letter } from "./types";
import { base64url, fromBase64url, hex, unhex } from "./crypto";

export interface SealedRoute {
  version: "mm-route-1";
  recipientPostbox: string;
  keyVersion: number;
  letter: Letter;
  reply?: { publicKey: string; conversation: string };
}
export interface SealedAddressEnvelope {
  version: "mm-sealed-1";
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
}
const bytes = (value: Uint8Array) => new Uint8Array(value).buffer;
const encode = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));
const buckets = [1024, 2048, 4096, 8192, 16384] as const;
function publicKey(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value) || /^0+$/.test(value))
    throw new Error("Invalid sealed route key");
}
function associated(context: Context, id: string, ephemeral: string) {
  if (
    ![16, 36, 38].includes(context.network) ||
    !/^component_[a-f0-9]{64}$/.test(context.registry) ||
    !/^[a-f0-9]{64}$/.test(context.template) ||
    !/^[a-f0-9]{64}$/.test(id)
  )
    throw new Error("Invalid sealed delivery context");
  publicKey(ephemeral);
  return encode([
    "MoonMail",
    "mm-sealed-1",
    context.network,
    context.registry,
    context.template,
    id,
    ephemeral,
  ]);
}
async function key(shared: Uint8Array, aad: Uint8Array) {
  const material = await crypto.subtle.importKey(
    "raw",
    bytes(shared),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: bytes(encode(["MoonMail", "mm-sealed-1", "salt"])),
      info: bytes(aad),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
function route(value: unknown): SealedRoute {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid sealed route");
  const v = value as SealedRoute;
  if (
    v.version !== "mm-route-1" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(v.recipientPostbox) ||
    !Number.isSafeInteger(v.keyVersion) ||
    v.keyVersion < 1 ||
    v.keyVersion > 1_000_000 ||
    typeof v.letter?.subject !== "string" ||
    typeof v.letter?.body !== "string" ||
    encode(v.letter.subject).length > 512
  )
    throw new Error("Invalid sealed route");
  if (v.reply) {
    publicKey(v.reply.publicKey);
    if (!/^[a-f0-9]{64}$/.test(v.reply.conversation))
      throw new Error("Invalid private conversation identity");
  }
  return v;
}
export async function sealAddressedRoute(
  value: SealedRoute,
  recipientPublicKey: string,
  context: Context,
  id: string,
): Promise<SealedAddressEnvelope> {
  publicKey(recipientPublicKey);
  route(value);
  const { generateKeypair, encryptedDataDhKdfAead } =
    await import("@tari-project/ootle-wasm");
  const pair = generateKeypair();
  let secret: Uint8Array | undefined,
    shared: Uint8Array | undefined,
    padded: Uint8Array | undefined;
  try {
    secret = pair.secret_key;
    const ephemeralPublicKey = hex(pair.public_key),
      aad = associated(context, id, ephemeralPublicKey),
      plain = encode(value);
    const size = buckets.find((size) => plain.length + 4 <= size);
    if (!size) throw new Error("Sealed delivery exceeds padded message limit");
    padded = crypto.getRandomValues(new Uint8Array(size));
    new DataView(padded.buffer).setUint32(0, plain.length);
    padded.set(plain, 4);
    plain.fill(0);
    shared = encryptedDataDhKdfAead(secret, unhex(recipientPublicKey));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: bytes(iv), additionalData: bytes(aad) },
        await key(shared, aad),
        bytes(padded),
      ),
    );
    return {
      version: "mm-sealed-1",
      ephemeralPublicKey,
      iv: base64url(iv),
      ciphertext: base64url(ciphertext),
    };
  } finally {
    secret?.fill(0);
    shared?.fill(0);
    padded?.fill(0);
    pair.free();
  }
}
export async function openAddressedRoute(
  envelope: SealedAddressEnvelope,
  recipientSecret: Uint8Array,
  context: Context,
  id: string,
): Promise<SealedRoute> {
  if (
    !envelope ||
    envelope.version !== "mm-sealed-1" ||
    recipientSecret.length !== 32 ||
    Object.keys(envelope).sort().join() !==
      "ciphertext,ephemeralPublicKey,iv,version"
  )
    throw new Error("Invalid sealed envelope");
  const iv = fromBase64url(envelope.iv),
    ciphertext = fromBase64url(envelope.ciphertext);
  if (
    iv.length !== 12 ||
    !buckets.some((size) => ciphertext.length === size + 16) ||
    base64url(iv) !== envelope.iv ||
    base64url(ciphertext) !== envelope.ciphertext
  )
    throw new Error("Invalid sealed envelope encoding");
  const { encryptedDataDhKdfAead } = await import("@tari-project/ootle-wasm");
  const aad = associated(context, id, envelope.ephemeralPublicKey),
    shared = encryptedDataDhKdfAead(
      recipientSecret,
      unhex(envelope.ephemeralPublicKey),
    );
  let plain: Uint8Array | undefined;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: bytes(iv), additionalData: bytes(aad) },
        await key(shared, aad),
        bytes(ciphertext),
      ),
    );
    const length = new DataView(plain.buffer).getUint32(0);
    if (!length || length > plain.length - 4)
      throw new Error("Invalid padded route length");
    return route(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          plain.subarray(4, 4 + length),
        ),
      ),
    );
  } finally {
    plain?.fill(0);
    shared.fill(0);
  }
}

// Reply keys derive from the recovered mailbox secret and a random, encrypted
// conversation nonce. They cannot be reconstructed from the public postbox key.
export async function conversationReplyKey(
  mailboxSecret: Uint8Array,
  context: Context,
  conversation: string,
) {
  if (mailboxSecret.length !== 32 || !/^[a-f0-9]{64}$/.test(conversation))
    throw new Error("Invalid reply identity");
  const { publicKeyFromSecretKey } = await import("@tari-project/ootle-wasm");
  associated(context, conversation, "01".repeat(32));
  const salt = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      bytes(
        encode([
          "MoonMail",
          "mm-reply-1",
          context.network,
          context.registry,
          context.template,
          conversation,
        ]),
      ),
    ),
  );
  const material = await crypto.subtle.importKey(
    "raw",
    bytes(mailboxSecret),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const wide = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: bytes(salt),
        info: bytes(encode(["MoonMail", "mm-reply-1", "scalar"])),
      },
      material,
      512,
    ),
  );
  // Reduce a 512-bit HKDF result modulo the Ristretto/Ed25519 scalar order.
  // Wide reduction avoids the appreciable bias of reducing a 256-bit value.
  let scalar = 0n;
  for (let i = wide.length - 1; i >= 0; i--)
    scalar = (scalar << 8n) | BigInt(wide[i]);
  wide.fill(0);
  scalar %= (1n << 252n) + 27742317777372353535851937790883648493n;
  if (scalar === 0n) throw new Error("Invalid zero reply scalar");
  const secret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    secret[i] = Number(scalar & 255n);
    scalar >>= 8n;
  }
  return { secret, publicKey: hex(publicKeyFromSecretKey(secret)) };
}
