import { describe, expect, it } from "vitest";
import {
  decodePotCatalog,
  decodePotRound,
  potOdds,
  potPhase,
  potWritesReady,
  type PotProfile,
} from "../src/core/moon-pot";
const profile: PotProfile = {
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  catalog: `component_${"c".repeat(64)}`,
  potTemplate: "d".repeat(64),
  evidence: {
    engine: true,
    drawSecurity: false,
    stockSapient: false,
    livePayout: false,
  },
};
const controller = "ef".repeat(32),
  component = `component_${"1".repeat(64)}`;
function raw(): unknown[] {
  return [
    38,
    profile.registry,
    `template_${profile.template}`,
    1,
    100,
    604,
    {},
    [
      ["alice", controller, 100000, "A public wish"],
      ["alice", controller, 300000, "Another wish"],
    ],
    { alice: [controller, 400000, false] },
    400000,
    "",
    "",
    false,
    "vault_fixture",
  ];
}
describe("Moon Pot weights and state", () => {
  it("aggregates a postbox and preserves its full public message history", () => {
    const r = decodePotRound(raw(), profile, component);
    expect(r.total).toBe("400000");
    expect(r.participants.alice.amount).toBe("400000");
    expect(r.entries).toHaveLength(2);
    expect(potOdds(r.participants.alice.amount, r.total)).toBe("100%");
  });
  it.each([
    ["0", "0", "0%"],
    ["0", "100", "0%"],
    ["10", "100", "10%"],
    ["1", "3", "33.33%"],
    ["1", "1000000000", "<0.01%"],
    ["999999999", "1000000000", "99.99%"],
  ])("uses exact integer amounts for %s/%s", (amount, total, expected) =>
    expect(potOdds(amount, total)).toBe(expected),
  );
  it("rejects a share greater than the pot", () =>
    expect(() => potOdds("2", "1")).toThrow());
  it("has a fixed close, draw and refund boundary", () => {
    const r = decodePotRound(raw(), profile, component);
    for (const [epoch, phase] of [
      [99, "waiting"],
      [100, "open"],
      [597, "open"],
      [598, "closed"],
      [603, "closed"],
      [604, "draw"],
      [605, "refund"],
    ] as const)
      expect(potPhase(r, epoch)).toBe(phase);
    expect(
      potPhase({ ...r, winner: "alice", seed: "aa".repeat(32) }, 605),
    ).toBe("won");
    expect(
      potPhase(
        { ...r, winner: "alice", seed: "aa".repeat(32), paid: true },
        605,
      ),
    ).toBe("paid");
  });
  it.each([0, 1, 2, 3, 5, 7, 8, 9, 10, 11, 12])(
    "fails closed on damaged field %s",
    (field) => {
      const s = raw();
      s[field] = field === 9 ? 400001 : null;
      expect(() => decodePotRound(s, profile, component)).toThrow();
    },
  );
  it("rejects changed weights or a winner without a seed", () => {
    const s = raw();
    s[8] = { alice: [controller, 100000, false] };
    expect(() => decodePotRound(s, profile, component)).toThrow();
    const next = raw();
    next[10] = "alice";
    expect(() => decodePotRound(next, profile, component)).toThrow();
  });
  it("accepts canonical native tagged maps without prototype keys affecting lookup", () => {
    const s = raw();
    s[8] = {
      "@cbor": "map",
      entries: [["alice", [controller, 400000, false]]],
    };
    expect(
      decodePotRound(s, profile, component).participants.alice.amount,
    ).toBe("400000");
  });
  it("reads newest rounds first without treating a round as a catalog", () => {
    const s = raw();
    s[3] = 0;
    s[6] = { "100": component, "604": profile.catalog };
    expect(decodePotCatalog(s, profile).rounds.map((r) => r.start)).toEqual([
      604, 100,
    ]);
    expect(() => decodePotCatalog(raw(), profile)).toThrow();
  });
  it("cannot enable financial actions using incomplete or renamed evidence flags", () => {
    expect(potWritesReady()).toBe(false);
    expect(potWritesReady(profile)).toBe(false);
    expect(
      potWritesReady({
        ...profile,
        evidence: {
          engine: true,
          drawSecurity: true,
          stockSapient: true,
          livePayout: true,
        },
      }),
    ).toBe(true);
    expect(
      potWritesReady({
        ...profile,
        evidence: { a: true, b: true, c: true, d: true } as never,
      }),
    ).toBe(false);
  });
});
