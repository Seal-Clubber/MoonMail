import type { Context } from "./types";
import { stateBytes, taggedAddress } from "./state-codecs";

export const potRules = {
  roundEpochs: 504,
  closedEpochs: 6,
  minEntry: 100000n,
  maxPot: 1000000000n,
  maxEntries: 128,
} as const;
export interface PotEntry {
  postbox: string;
  controller: string;
  amount: string;
  message: string;
}
export interface PotParticipant {
  controller: string;
  amount: string;
  refunded: boolean;
}
export interface PotRound {
  vault?: string;
  component: string;
  start: number;
  draw: number;
  total: string;
  entries: PotEntry[];
  participants: Record<string, PotParticipant>;
  winner: string;
  seed: string;
  paid: boolean;
}
export interface PotProfile extends Context {
  experimental?: boolean;
  catalog: string;
  potTemplate: string;
  evidence: {
    engine: boolean;
    drawSecurity: boolean;
    stockSapient: boolean;
    livePayout: boolean;
  };
}
function array(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new Error("Unsupported Moon Pot state");
  return v;
}
function text(v: unknown): string {
  if (typeof v !== "string") throw new Error("Invalid Moon Pot text");
  return v;
}
function integer(v: unknown): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
    throw new Error("Invalid Moon Pot epoch");
  return v;
}
function amount(v: unknown): string {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) v = String(v);
  if (
    typeof v !== "string" ||
    !/^(0|[1-9]\d*)$/.test(v) ||
    BigInt(v) > potRules.maxPot
  )
    throw new Error("Invalid Moon Pot amount");
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Invalid Moon Pot flag");
  return v;
}
function entries(v: unknown): [string, unknown][] {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid Moon Pot map");
  if ("@cbor" in v && v["@cbor"] === "map")
    return array((v as Record<string, unknown>).entries).map((item) => {
      const a = array(item);
      return [String(a[0]), a[1]];
    });
  return Object.entries(v);
}
function state(raw: unknown, p: PotProfile, kind: number) {
  const s = array(raw);
  if (
    s.length !== 14 ||
    s[0] !== p.network ||
    s[3] !== kind ||
    taggedAddress(s[1], "component") !== p.registry ||
    taggedAddress(s[2], "template") !== `template_${p.template}`
  )
    throw new Error("Moon Pot belongs to a different post office");
  return s;
}
export function decodePotCatalog(raw: unknown, p: PotProfile) {
  const s = state(raw, p, 0);
  const rounds = entries(s[6])
    .map(([key, address]) => ({
      start: integer(Number(key)),
      component: taggedAddress(address, "component"),
    }))
    .sort((a, b) => b.start - a.start);
  return { next: integer(s[5]), rounds };
}
export function decodePotRound(
  raw: unknown,
  p: PotProfile,
  component: string,
): PotRound {
  const s = state(raw, p, 1),
    start = integer(s[4]),
    draw = integer(s[5]);
  if (draw - start !== potRules.roundEpochs)
    throw new Error("Unexpected Moon Pot schedule");
  const list = array(s[7]);
  if (list.length > potRules.maxEntries)
    throw new Error("Unexpected Moon Pot entry count");
  const contributionEntries = list.map((v): PotEntry => {
    const e = array(v),
      postbox = text(e[0]),
      controller = stateBytes(e[1]),
      n = amount(e[2]),
      message = text(e[3]);
    if (
      e.length !== 4 ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(postbox) ||
      !/^[a-f0-9]{64}$/.test(controller) ||
      BigInt(n) < potRules.minEntry ||
      !message.trim() ||
      new TextEncoder().encode(message).length > 512
    )
      throw new Error("Invalid Moon Pot contribution");
    return { postbox, controller, amount: n, message };
  });
  const participants: Record<string, PotParticipant> = Object.create(null);
  for (const [postbox, v] of entries(s[8])) {
    const a = array(v);
    if (
      a.length !== 3 ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(postbox) ||
      Object.hasOwn(participants, postbox)
    )
      throw new Error("Invalid Moon Pot participant");
    participants[postbox] = {
      controller: stateBytes(a[0]),
      amount: amount(a[1]),
      refunded: bool(a[2]),
    };
  }
  const totals = new Map<string, bigint>();
  for (const e of contributionEntries) {
    if (participants[e.postbox]?.controller !== e.controller)
      throw new Error("Moon Pot controller mismatch");
    totals.set(e.postbox, (totals.get(e.postbox) || 0n) + BigInt(e.amount));
  }
  if (
    totals.size !== Object.keys(participants).length ||
    Object.entries(participants).some(
      ([id, p]) => totals.get(id) !== BigInt(p.amount),
    )
  )
    throw new Error("Moon Pot participant weights mismatch");
  const total = amount(s[9]),
    winner = text(s[10]),
    seed = text(s[11]),
    paid = bool(s[12]);
  if (
    contributionEntries.reduce((n, e) => n + BigInt(e.amount), 0n) !==
      BigInt(total) ||
    (winner && !Object.hasOwn(participants, winner)) ||
    !!winner !== !!seed ||
    (seed && !/^[a-f0-9]{64}$/.test(seed)) ||
    (paid && !winner) ||
    (winner && Object.values(participants).some((p) => p.refunded))
  )
    throw new Error("Invalid Moon Pot result");
  return {
    component,
    start,
    draw,
    total,
    entries: contributionEntries,
    participants,
    winner,
    seed,
    paid,
  };
}
export function potPhase(round: PotRound, epoch: number) {
  if (round.paid) return "paid";
  if (round.winner) return "won";
  if (epoch < round.start) return "waiting";
  if (epoch < round.draw - potRules.closedEpochs) return "open";
  if (epoch < round.draw) return "closed";
  if (epoch === round.draw) return "draw";
  return "refund";
}
export function potOdds(amount: string, total: string): string {
  const a = BigInt(amount),
    t = BigInt(total);
  if (a < 0n || t < 0n || a > t) throw new Error("Invalid pot share");
  if (!t || !a) return "0%";
  const hundredths = (a * 10000n) / t;
  if (!hundredths) return "<0.01%";
  return `${hundredths / 100n}${
    hundredths % 100n
      ? `.${String(hundredths % 100n)
          .padStart(2, "0")
          .replace(/0+$/, "")}`
      : ""
  }%`;
}
export function potWritesReady(p?: PotProfile, experimentalAccepted = false) {
  return (
    !!p &&
    p.network === 38 &&
    /^component_[a-f0-9]{64}$/.test(p.catalog) &&
    /^component_[a-f0-9]{64}$/.test(p.registry) &&
    /^[a-f0-9]{64}$/.test(p.template) &&
    /^[a-f0-9]{64}$/.test(p.potTemplate) &&
    p.evidence?.engine === true &&
    p.evidence.stockSapient === true &&
    ((p.evidence.drawSecurity === true && p.evidence.livePayout === true) ||
      (p.experimental === true && experimentalAccepted))
  );
}
