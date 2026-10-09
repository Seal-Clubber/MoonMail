import type { MailboxContext, MailboxKey, MailboxPayload } from "./types";
import { base64url, fromBase64url } from "./crypto";
import { mailboxKey, openMailbox, sealMailboxStatePayload } from "./mailbox";
export interface MailboxPreferences {
  marks: [string, number][];
  favourites?: string[];
  sort: "chain" | "subject" | "gift";
  density: "comfortable" | "compact";
}
export const READ = 1,
  STAR = 2,
  ARCHIVE = 4;
export const emptyPreferences = (): MailboxPreferences => ({
  marks: [],
  sort: "chain",
  density: "comfortable",
});
export function preferences(value: unknown): MailboxPreferences {
  const p = value as MailboxPreferences;
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    !Array.isArray(p.marks) ||
    p.marks.length > 512 ||
    !["chain", "subject", "gift"].includes(p.sort) ||
    !["comfortable", "compact"].includes(p.density)
  )
    throw new Error("Invalid encrypted mailbox preferences");
  const ids = new Set<string>();
  for (const entry of p.marks) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string" ||
      !entry[0] ||
      new TextEncoder().encode(entry[0]).length > 64 ||
      ids.has(entry[0]) ||
      !Number.isInteger(entry[1]) ||
      entry[1] < 1 ||
      entry[1] > 7
    )
      throw new Error("Invalid mailbox marks");
    ids.add(entry[0]);
  }
  return {
    favourites: favourites(p.favourites),
    marks: p.marks
      .map(([id, flags]) => [id, flags] as [string, number])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    sort: p.sort,
    density: p.density,
  };
}
function favourites(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    value.some(
      (id) =>
        typeof id !== "string" ||
        !id ||
        new TextEncoder().encode(id).length > 64,
    ) ||
    new Set(value).size !== value.length
  )
    throw new Error("Invalid favourite postboxes");
  return [...value].sort();
}
export function setMarks(
  p: MailboxPreferences,
  ids: string[],
  bit: number,
  enabled: boolean,
) {
  if (![READ, STAR, ARCHIVE].includes(bit))
    throw new Error("Invalid mailbox action");
  const map = new Map(p.marks);
  for (const id of ids) {
    const flags = enabled
      ? (map.get(id) || 0) | bit
      : (map.get(id) || 0) & ~bit;
    if (flags) map.set(id, flags);
    else map.delete(id);
  }
  return preferences({ ...p, marks: Array.from(map) });
}
export function toggleFavourite(p: MailboxPreferences, id: string) {
  const ids = new Set(p.favourites || []);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return preferences({ ...p, favourites: Array.from(ids) });
}
export function toggleMark(p: MailboxPreferences, id: string, bit: number) {
  if (![READ, STAR, ARCHIVE].includes(bit))
    throw new Error("Invalid mailbox action");
  const map = new Map(p.marks),
    next = (map.get(id) || 0) ^ bit;
  if (next) map.set(id, next);
  else map.delete(id);
  return preferences({ ...p, marks: Array.from(map) });
}
function binding(c: MailboxContext, revision: string) {
  if (
    !/^[1-9][0-9]*$/.test(revision) ||
    BigInt(revision) > 18446744073709551615n
  )
    throw new Error("Invalid mailbox revision");
  return [
    "gd-mailbox-state-1",
    c.network,
    c.registry,
    c.template,
    c.postbox,
    c.controller,
    c.keyVersion,
    revision,
  ];
}
export async function mailboxStateId(c: MailboxContext, revision: string) {
  return `ms:${base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(binding(c, revision))))))}`;
}
export async function sealPreferences(
  p: MailboxPreferences,
  context: MailboxContext,
  revision: string,
  descriptor: MailboxKey,
) {
  const key = mailboxKey(descriptor);
  if (key.recovery !== "sapient-capsule-1")
    throw new Error("Mailbox settings require permanent Sapient recovery");
  const json = JSON.stringify({
    binding: binding(context, revision),
    preferences: preferences(p),
  });
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > 65536) throw new Error("Mailbox preferences exceed 64 KiB");
  // Pad to 4 KiB buckets. Exact contents remain encrypted; approximate size is public.
  const padded = json + " ".repeat(Math.ceil(bytes / 4096) * 4096 - bytes);
  return JSON.stringify(
    await sealMailboxStatePayload(
      { subject: "gd-mailbox-state-1", body: padded },
      context,
      await mailboxStateId(context, revision),
      key,
    ),
  );
}
export function statePayload(ciphertext: string): MailboxPayload {
  if (!ciphertext || new TextEncoder().encode(ciphertext).length > 98304)
    throw new Error("Invalid mailbox ciphertext size");
  const p = JSON.parse(ciphertext) as MailboxPayload;
  mailboxKey({
    version: p.version,
    keyVersion: p.keyVersion,
    publicKey: p.recipientKey,
    recovery: p.recovery,
    capsule: p.capsule,
  });
  if (
    p.recovery !== "sapient-capsule-1" ||
    !/^[a-f0-9]{64}$/.test(p.ephemeralPublicKey) ||
    !/^[A-Za-z0-9_-]{16}$/.test(p.iv) ||
    typeof p.ciphertext !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(p.ciphertext)
  )
    throw new Error("Invalid mailbox ciphertext");
  if (base64url(fromBase64url(p.ciphertext)) !== p.ciphertext)
    throw new Error("Noncanonical mailbox ciphertext");
  return p;
}
export async function openPreferences(
  ciphertext: string,
  context: MailboxContext,
  revision: string,
  secret: Uint8Array,
) {
  const payload = statePayload(ciphertext);
  const historical = { ...context, keyVersion: payload.keyVersion };
  const letter = await openMailbox(
    payload,
    historical,
    await mailboxStateId(historical, revision),
    secret,
  );
  if (
    letter.subject !== "gd-mailbox-state-1" ||
    new TextEncoder().encode(letter.body).length > 65536
  )
    throw new Error("Invalid mailbox settings format");
  const value = JSON.parse(letter.body);
  if (
    JSON.stringify(value.binding) !==
    JSON.stringify(binding(historical, revision))
  )
    throw new Error("Mailbox settings belong to another postbox or revision");
  return preferences(value.preferences);
}
