import type { Deployment, Envelope, Postbox } from "./types";
import { hex } from "./crypto";
import { mailboxKey } from "./mailbox";
// Strict codec for positional minicbor component state, not an invented RPC.
function arr(v: unknown): unknown[] {
  if (!Array.isArray(v))
    throw new Error("Unsupported component state encoding");
  return v;
}
// Indexer persistence may represent an absent CBOR value as an empty array.
function absent(v: unknown): boolean {
  return v == null || (Array.isArray(v) && v.length === 0);
}
function map(v: unknown): [string, unknown][] {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (o["@cbor"] === "map")
      return arr(o.entries).map((e) => {
        const a = arr(e);
        return [String(a[0]), a[1]];
      });
    return Object.entries(o);
  }
  throw new Error("Unsupported registry map");
}
function text(v: unknown): string {
  if (typeof v !== "string") throw new Error("Invalid text in state");
  return v;
}
export function stateBytes(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return hex(Uint8Array.from(v as number[]));
  if (v && typeof v === "object" && "hex" in v) return text(v.hex);
  throw new Error("Invalid public key");
}
function amount(v: unknown): string {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0)
    return String(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return v;
  if (v && typeof v === "object" && "value" in v) return amount(v.value);
  throw new Error("Unrepresentable amount");
}
export function taggedAddress(v: unknown, prefix: string): string {
  if (typeof v === "string" && new RegExp(`^${prefix}_[a-f0-9]{64}$`).test(v))
    return v;
  if (v && typeof v === "object" && "value" in v)
    return `${prefix}_${stateBytes(v.value)}`;
  if (prefix === "template") return `template_${stateBytes(v)}`;
  throw new Error("Invalid address encoding");
}
export function decodeEnvelope(
  state: unknown,
  d: Deployment,
  id: string,
  component: string,
): Envelope {
  if (d.contractProtocol === "unified-2")
    throw new Error("V4 requires its dedicated state codec");
  const unified = d.contractProtocol === "unified-1";
  const outer = arr(state);
  if (
    unified &&
    (outer.length < 7 ||
      outer.length > 9 ||
      outer[0] !== d.network ||
      outer[5] !== 1 ||
      !absent(outer[7]) ||
      !absent(outer[8]) ||
      taggedAddress(outer[3], "template") !== `template_${d.template}` ||
      map(outer[1]).length ||
      map(outer[2]).length ||
      map(outer[4]).length)
  )
    throw new Error("Invalid unified letter component");
  const raw = unified ? arr(outer[6]) : outer;
  if (raw[0] !== d.network) throw new Error("Envelope network mismatch");
  const e = raw.slice(1);
  if (
    d.postboxClaimProtocol === "sapient-proof-1" &&
    taggedAddress(raw[14], "component") !== d.registry
  )
    throw new Error("Proof envelope registry mismatch");
  if (text(e[0]) !== id || ![0, 1, 2].includes(Number(e[1])))
    throw new Error("Envelope identity mismatch");
  const mode = (["public", "link", "postbox"] as const)[Number(e[1])];
  const payload = JSON.parse(text(e[2]));
  if (typeof e[5] !== "boolean") throw new Error("Invalid claimed state");
  if (mode === "link" && payload.claimPublicKey !== stateBytes(e[6]))
    throw new Error("Stored claim authority mismatch");
  if (
    mode === "public" &&
    (typeof payload.subject !== "string" || typeof payload.body !== "string")
  )
    throw new Error("Invalid public letter");
  if (mode === "postbox") {
    if (
      !payload ||
      payload.version !== "gd-postbox-1" ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(text(e[7])) ||
      !/^[a-f0-9]{64}$/.test(stateBytes(e[6]))
    )
      throw new Error("Invalid addressed envelope");
    mailboxKey({
      version: payload.version,
      keyVersion: payload.keyVersion,
      publicKey: payload.recipientKey,
      recovery: payload.recovery,
      capsule: payload.capsule,
    });
  }
  return {
    claimProtocol: d.postboxClaimProtocol,
    component,
    id,
    mode,
    context: { network: d.network, registry: d.registry, template: d.template },
    payload,
    gift: amount(e[3]),
    reserve: amount(e[4]),
    claimed: e[5],
    recipientPostbox: text(e[7]),
    claimAuthority: mode === "public" ? undefined : stateBytes(e[6]),
    replyPostbox: text(e[8]),
    sender: stateBytes(e[9]),
    campaign: text(e[10]),
  };
}
export function decodeOffice(state: unknown, d: Deployment) {
  if (d.contractProtocol === "unified-2")
    throw new Error("V4 requires its dedicated state codec");
  const a = arr(state);
  if (a[0] !== d.network) throw new Error("Registry network mismatch");
  if (
    taggedAddress(a[3], "template").replace("template_", "") !==
    d.envelopeTemplate
  )
    throw new Error("Wrong envelope template");
  if (
    d.contractProtocol === "unified-1" &&
    (a.length !== 9 ||
      a[5] !== 0 ||
      !absent(a[6]) ||
      !absent(a[7]) ||
      d.template !== d.envelopeTemplate)
  )
    throw new Error("Invalid unified post office");
  if (
    d.contractProtocol === "unified-1" &&
    (!d.capsule ||
      d.capsule.template !== d.template ||
      d.capsule.component !== d.registry ||
      taggedAddress(a[8], "resource") !== d.capsule.resource)
  )
    throw new Error("Unified recovery resource mismatch");
  const mailboxRefs =
    d.contractProtocol === "unified-1"
      ? map(a[4]).map(([id, value]) => ({
          id,
          component: taggedAddress(value, "component"),
        }))
      : [];
  const letterRefs = map(a[1]).map(([id, value]) => ({
    id,
    component: taggedAddress(value, "component"),
  }));
  const postboxes: Postbox[] = map(a[2]).map(([id, value]) => {
    const p = arr(value);
    if (text(p[0]) !== id) throw new Error("Postbox identity mismatch");
    return {
      id,
      nickname: text(p[1]),
      controller: stateBytes(p[2]),
      encryptionKey: text(p[3]),
      discoverable: p[4] === true,
    };
  });
  return { letterRefs, postboxes, mailboxRefs };
}
export function decodeMailboxState(
  state: unknown,
  d: Deployment,
  box: Postbox,
) {
  if (d.contractProtocol === "unified-2")
    throw new Error("V4 requires its dedicated state codec");
  const a = arr(state);
  if (
    d.contractProtocol !== "unified-1" ||
    a.length < 8 ||
    a.length > 9 ||
    a[0] !== d.network ||
    a[5] !== 2 ||
    !absent(a[6]) ||
    !absent(a[8]) ||
    taggedAddress(a[3], "template") !== `template_${d.template}` ||
    map(a[1]).length ||
    map(a[2]).length ||
    map(a[4]).length
  )
    throw new Error("Invalid mailbox component");
  const m = arr(a[7]);
  const revision = amount(m[2]);
  const ciphertext = text(m[3]);
  if (
    m.length !== 5 ||
    text(m[0]) !== box.id ||
    stateBytes(m[1]) !== box.controller ||
    taggedAddress(m[4], "component") !== d.registry ||
    !/^[1-9][0-9]*$/.test(revision) ||
    BigInt(revision) > 18446744073709551615n ||
    !ciphertext ||
    new TextEncoder().encode(ciphertext).length > 98304
  )
    throw new Error("Mailbox identity or revision mismatch");
  return { revision, ciphertext };
}
