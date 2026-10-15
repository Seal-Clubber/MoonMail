// Unpublished V4 protocol. No recipient or sender-mailbox locator is public.
// Two indistinguishable key slots unlock one padded message: Inbox and Sent.
import type { Context, Letter } from "./types";
import { base64url, fromBase64url, hex, unhex } from "./crypto";
import {
  conversationReplyKey,
  type SealedDeliveryContext,
} from "./sealed-addressing";

export interface SealedParty {
  postbox: string;
  keyVersion: number;
  publicKey: string;
}
export interface SealedMessage {
  version: "mm-message-1";
  recipient: SealedParty & { conversation?: string };
  sender: SealedParty & { controller: string };
  letter: Letter;
  reply?: { conversation: string; publicKey: string };
}
export interface SealedMail {
  version: "mm-sealed-2";
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
  slots: { iv: string; wrappedKey: string }[];
}
export interface RecoveredSealedKey extends SealedParty {
  controller: string;
  secret: Uint8Array;
}
// Keep only in memory. Restore these descriptors by opening Sent again.
export interface ReplyIdentity extends SealedParty {
  conversation: string;
}
export interface SealedMailEntry {
  id: string;
  senderPublicKey: string;
  payload: SealedMail;
}
export interface RecoveredSealedMail {
  id: string;
  message: SealedMessage;
  inbox: boolean;
  sent: boolean;
}
const encode = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const bytes = (v: Uint8Array) => new Uint8Array(v).buffer;
const buckets = [1024, 2048, 4096, 8192, 16384] as const;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid sealed object");
  return v as Record<string, unknown>;
}
function shape(v: unknown, required: string[], optional: string[] = []) {
  const o = object(v);
  if (
    required.some((k) => !Object.hasOwn(o, k)) ||
    Object.keys(o).some((k) => !required.includes(k) && !optional.includes(k))
  )
    throw new Error("Unsupported sealed fields");
  return o;
}
function identifier(v: unknown): asserts v is string {
  if (typeof v !== "string" || !/^[a-f0-9]{64}$/.test(v))
    throw new Error("Invalid sealed identifier");
}
function publicKey(v: unknown): asserts v is string {
  identifier(v);
  if (/^0+$/.test(v)) throw new Error("Invalid sealed public key");
}
function party(v: unknown, extra: string[] = []) {
  const p = shape(v, ["postbox", "keyVersion", "publicKey"], extra);
  if (
    typeof p.postbox !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(p.postbox) ||
    !Number.isSafeInteger(p.keyVersion) ||
    (p.keyVersion as number) < 1 ||
    (p.keyVersion as number) > 1_000_000
  )
    throw new Error("Invalid sealed mailbox identity");
  publicKey(p.publicKey);
  return p;
}
export function parseSealedMessage(
  value: unknown,
  context: SealedDeliveryContext,
): SealedMessage {
  const m = shape(
    value,
    ["version", "recipient", "sender", "letter"],
    ["reply"],
  );
  if (m.version !== "mm-message-1")
    throw new Error("Unsupported sealed message");
  const recipient = party(m.recipient, ["conversation"]),
    sender = party(m.sender, ["controller"]);
  publicKey(sender.controller);
  if (sender.controller !== context.senderPublicKey)
    throw new Error("Sealed sender does not match transaction signer");
  if (recipient.conversation !== undefined) identifier(recipient.conversation);
  const letter = shape(m.letter, ["subject", "body"], ["thread"]);
  if (
    typeof letter.subject !== "string" ||
    typeof letter.body !== "string" ||
    encode(letter.subject).length > 512
  )
    throw new Error("Invalid sealed letter");
  if (letter.thread !== undefined) {
    const thread = shape(letter.thread, ["version", "root", "parent"]);
    if (thread.version !== "gd-thread-1")
      throw new Error("Invalid sealed thread");
    identifier(thread.root);
    identifier(thread.parent);
  }
  if (m.reply !== undefined) {
    const reply = shape(m.reply, ["conversation", "publicKey"]);
    identifier(reply.conversation);
    publicKey(reply.publicKey);
    if (
      recipient.conversation !== undefined &&
      recipient.conversation !== reply.conversation
    )
      throw new Error("Mismatched reply conversation");
  }
  // Clone to prevent caller mutation while asynchronous crypto is in flight.
  return JSON.parse(JSON.stringify(value)) as SealedMessage;
}
function associated(
  context: SealedDeliveryContext,
  id: string,
  ephemeral: string,
) {
  if (
    ![16, 36, 38].includes(context.network) ||
    !/^component_[a-f0-9]{64}$/.test(context.registry)
  )
    throw new Error("Invalid sealed deployment");
  identifier(context.template);
  identifier(id);
  publicKey(context.senderPublicKey);
  publicKey(ephemeral);
  return encode([
    "MoonMail",
    "mm-sealed-2",
    context.network,
    context.registry,
    context.template,
    id,
    ephemeral,
    context.senderPublicKey,
  ]);
}
function decode(v: unknown, length: number | readonly number[]) {
  if (typeof v !== "string" || v.length > 21867 || !/^[A-Za-z0-9_-]+$/.test(v))
    throw new Error("Invalid sealed encoding");
  const result = fromBase64url(v);
  if (
    !(Array.isArray(length)
      ? length.includes(result.length)
      : result.length === length) ||
    base64url(result) !== v
  )
    throw new Error("Invalid sealed encoding");
  return result;
}
export function parseSealedMail(value: unknown): SealedMail {
  const e = shape(value, [
    "version",
    "ephemeralPublicKey",
    "iv",
    "ciphertext",
    "slots",
  ]);
  if (
    e.version !== "mm-sealed-2" ||
    !Array.isArray(e.slots) ||
    e.slots.length !== 2 ||
    encode(e).length > 24000
  )
    throw new Error("Invalid sealed mail envelope");
  publicKey(e.ephemeralPublicKey);
  decode(e.iv, 12);
  decode(
    e.ciphertext,
    buckets.map((n) => n + 16),
  );
  for (const value of e.slots) {
    const slot = shape(value, ["iv", "wrappedKey"]);
    decode(slot.iv, 12);
    decode(slot.wrappedKey, 48);
  }
  return JSON.parse(JSON.stringify(e)) as SealedMail;
}
export async function sealedPayloadHash(value: SealedMail) {
  const e = parseSealedMail(value);
  return hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        bytes(
          encode([
            e.version,
            e.ephemeralPublicKey,
            e.iv,
            e.ciphertext,
            e.slots.map((s) => [s.iv, s.wrappedKey]),
          ]),
        ),
      ),
    ),
  );
}
async function wrappingKey(shared: Uint8Array, aad: Uint8Array) {
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
      salt: bytes(encode(["MoonMail", "mm-sealed-2", "wrap"])),
      info: bytes(aad),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
async function slotContext(
  aad: Uint8Array,
  ciphertext: string,
  iv: string,
  index: number,
) {
  const digest = hex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", bytes(encode([iv, ciphertext]))),
    ),
  );
  return encode([base64url(aad), "slot", index, digest]);
}
export async function sealPrivateMail(
  value: SealedMessage,
  context: SealedDeliveryContext,
  id: string,
): Promise<SealedMail> {
  const message = parseSealedMessage(value, context);
  const plain = encode(message),
    size = buckets.find((n) => plain.length + 4 <= n);
  if (!size) {
    plain.fill(0);
    throw new Error("Sealed mail exceeds padded message limit");
  }
  const { generateKeypair, encryptedDataDhKdfAead } =
    await import("@tari-project/ootle-wasm");
  const pair = generateKeypair(),
    secret = pair.secret_key,
    contentKey = crypto.getRandomValues(new Uint8Array(32)),
    padded = crypto.getRandomValues(new Uint8Array(size));
  try {
    const ephemeralPublicKey = hex(pair.public_key),
      aad = associated(context, id, ephemeralPublicKey);
    new DataView(padded.buffer).setUint32(0, plain.length);
    padded.set(plain, 4);
    plain.fill(0);
    const iv = crypto.getRandomValues(new Uint8Array(12)),
      key = await crypto.subtle.importKey(
        "raw",
        bytes(contentKey),
        "AES-GCM",
        false,
        ["encrypt"],
      );
    const envelope: SealedMail = {
      version: "mm-sealed-2",
      ephemeralPublicKey,
      iv: base64url(iv),
      ciphertext: base64url(
        new Uint8Array(
          await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: bytes(iv), additionalData: bytes(aad) },
            key,
            bytes(padded),
          ),
        ),
      ),
      slots: [],
    };
    const recipients = [message.recipient.publicKey, message.sender.publicKey];
    if ((crypto.getRandomValues(new Uint8Array(1))[0] & 1) !== 0)
      recipients.reverse();
    for (const recipient of recipients) {
      const shared = encryptedDataDhKdfAead(secret, unhex(recipient));
      try {
        const slotAAD = await slotContext(
            aad,
            envelope.ciphertext,
            envelope.iv,
            envelope.slots.length,
          ),
          nonce = crypto.getRandomValues(new Uint8Array(12));
        const wrapped = await crypto.subtle.encrypt(
          { name: "AES-GCM", iv: bytes(nonce), additionalData: bytes(slotAAD) },
          await wrappingKey(shared, slotAAD),
          bytes(contentKey),
        );
        envelope.slots.push({
          iv: base64url(nonce),
          wrappedKey: base64url(new Uint8Array(wrapped)),
        });
      } finally {
        shared.fill(0);
      }
    }
    return parseSealedMail(envelope);
  } finally {
    secret.fill(0);
    contentKey.fill(0);
    padded.fill(0);
    plain.fill(0);
    pair.free();
  }
}
export async function openPrivateMail(
  value: SealedMail,
  secret: Uint8Array,
  context: SealedDeliveryContext,
  id: string,
): Promise<SealedMessage> {
  const envelope = parseSealedMail(value);
  if (secret.length !== 32) throw new Error("Invalid sealed recovery key");
  const { encryptedDataDhKdfAead } = await import("@tari-project/ootle-wasm");
  const aad = associated(context, id, envelope.ephemeralPublicKey),
    shared = encryptedDataDhKdfAead(secret, unhex(envelope.ephemeralPublicKey));
  try {
    for (let index = 0; index < envelope.slots.length; index++) {
      const slot = envelope.slots[index],
        slotAAD = await slotContext(
          aad,
          envelope.ciphertext,
          envelope.iv,
          index,
        );
      let contentKey: Uint8Array;
      try {
        contentKey = new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: bytes(decode(slot.iv, 12)),
              additionalData: bytes(slotAAD),
            },
            await wrappingKey(shared, slotAAD),
            bytes(decode(slot.wrappedKey, 48)),
          ),
        );
      } catch {
        continue;
      }
      let plain: Uint8Array | undefined;
      try {
        const key = await crypto.subtle.importKey(
          "raw",
          bytes(contentKey),
          "AES-GCM",
          false,
          ["decrypt"],
        );
        plain = new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: bytes(decode(envelope.iv, 12)),
              additionalData: bytes(aad),
            },
            key,
            bytes(
              decode(
                envelope.ciphertext,
                buckets.map((n) => n + 16),
              ),
            ),
          ),
        );
        const length = new DataView(plain.buffer).getUint32(0);
        if (!length || length > plain.length - 4)
          throw new Error("Invalid sealed padding");
        return parseSealedMessage(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              plain.subarray(4, length + 4),
            ),
          ),
          context,
        );
      } finally {
        contentKey.fill(0);
        plain?.fill(0);
      }
    }
    throw new Error("This key cannot open the sealed mail");
  } finally {
    shared.fill(0);
  }
}
function matches(party: SealedParty, key: SealedParty) {
  return (
    party.postbox === key.postbox &&
    party.keyVersion === key.keyVersion &&
    party.publicKey === key.publicKey
  );
}
function identityId(
  value: Pick<ReplyIdentity, "postbox" | "keyVersion" | "conversation">,
) {
  return JSON.stringify([value.postbox, value.keyVersion, value.conversation]);
}
// Two passes: restore Inbox/Sent with base keys, then try conversation identities
// learned from Sent. Across pages, callers must revisit earlier unmatched pages
// when this returns new identities. No recipient-specific indexer query is used.
export async function discoverPrivateMailPage(
  entries: readonly SealedMailEntry[],
  keys: readonly RecoveredSealedKey[],
  context: Context,
  identities: readonly ReplyIdentity[] = [],
  signal?: AbortSignal,
) {
  if (
    entries.length > 50 ||
    keys.length > 16 ||
    identities.length > 128 ||
    new Set(entries.map((e) => e.id)).size !== entries.length
  )
    throw new Error("Sealed discovery requires bounded unique pages and keys");
  signal?.throwIfAborted();
  const { publicKeyFromSecretKey } = await import("@tari-project/ootle-wasm");
  for (const k of keys) {
    party({
      postbox: k.postbox,
      keyVersion: k.keyVersion,
      publicKey: k.publicKey,
    });
    publicKey(k.controller);
    if (
      k.secret.length !== 32 ||
      hex(publicKeyFromSecretKey(k.secret)) !== k.publicKey
    )
      throw new Error("Recovered sealed key mismatch");
  }
  if (
    new Set(keys.map((k) => JSON.stringify([k.postbox, k.keyVersion]))).size !==
    keys.length
  )
    throw new Error("Recovered mailbox key versions must be unique");
  const found = new Map<string, RecoveredSealedMail>(),
    derived = new Map<string, ReplyIdentity>(),
    ephemeral: (RecoveredSealedKey & { conversation: string })[] = [];
  async function addIdentity(value: ReplyIdentity) {
    party(value, ["conversation"]);
    identifier(value.conversation);
    const tag = identityId(value);
    if (derived.has(tag)) {
      if (derived.get(tag)!.publicKey !== value.publicKey)
        throw new Error("Reply identity changed");
      return;
    }
    const base = keys.find(
      (k) => k.postbox === value.postbox && k.keyVersion === value.keyVersion,
    );
    if (!base || derived.size >= 128)
      throw new Error(
        "Reply recovery needs its bounded historical mailbox key",
      );
    const reply = await conversationReplyKey(
      base.secret,
      context,
      value.conversation,
    );
    if (reply.publicKey !== value.publicKey) {
      reply.secret.fill(0);
      throw new Error("Reply identity does not belong to this mailbox");
    }
    derived.set(tag, { ...value });
    ephemeral.push({
      ...base,
      publicKey: reply.publicKey,
      secret: reply.secret,
      conversation: value.conversation,
    });
  }
  async function attempt(
    entry: SealedMailEntry,
    k: RecoveredSealedKey,
    conversation?: string,
  ) {
    signal?.throwIfAborted();
    const scoped = { ...context, senderPublicKey: entry.senderPublicKey };
    let message: SealedMessage;
    try {
      message = await openPrivateMail(
        entry.payload,
        k.secret,
        scoped,
        entry.id,
      );
    } catch {
      signal?.throwIfAborted();
      return;
    }
    signal?.throwIfAborted();
    const inbox =
      matches(message.recipient, k) &&
      message.recipient.conversation === conversation;
    const sent =
      conversation === undefined &&
      matches(message.sender, k) &&
      message.sender.controller === k.controller &&
      entry.senderPublicKey === k.controller;
    if (!inbox && !sent) return;
    const previous = found.get(entry.id);
    found.set(entry.id, {
      id: entry.id,
      message,
      inbox: inbox || !!previous?.inbox,
      sent: sent || !!previous?.sent,
    });
    if (sent && message.reply) {
      // A hostile sender-copy body cannot cause us to retain somebody else's key.
      const reply = await conversationReplyKey(
        k.secret,
        context,
        message.reply.conversation,
      );
      try {
        if (reply.publicKey !== message.reply.publicKey) return;
        await addIdentity({
          postbox: k.postbox,
          keyVersion: k.keyVersion,
          conversation: message.reply.conversation,
          publicKey: reply.publicKey,
        });
      } finally {
        reply.secret.fill(0);
      }
    }
  }
  try {
    for (const identity of identities) {
      signal?.throwIfAborted();
      await addIdentity(identity);
    }
    for (const entry of entries) for (const k of keys) await attempt(entry, k);
    for (const entry of entries)
      for (const k of ephemeral) await attempt(entry, k, k.conversation);
    signal?.throwIfAborted();
    return {
      matches: [...found.values()],
      identities: [...derived.values()],
      skipped: entries.length - found.size,
    };
  } finally {
    for (const k of ephemeral) k.secret.fill(0);
  }
}
