import { it, expect } from "vitest";
import { planRefill, type KeeperConfig } from "../tools/keeper";
import { emptyDeployment } from "../src/core/config";
import type { Envelope } from "../src/core/types";
const c: KeeperConfig = {
  target: 5,
  buffer: 1,
  gift: "100",
  reserve: "10",
  publicationCap: "5",
  budget: "690",
  campaign: "test",
  concurrency: 4,
};
const e: Envelope = {
  id: "e",
  mode: "public",
  payload: { subject: "s", body: "b" },
  context: emptyDeployment,
  gift: "100",
  reserve: "10",
  claimed: false,
  sender: "",
  campaign: "test",
};
it("counts only adequately funded unclaimed public campaign gifts", () => {
  const letters = [
    e,
    { ...e, mode: "link" as const },
    { ...e, mode: "postbox" as const },
    { ...e, gift: "0" },
    { ...e, reserve: "0" },
    { ...e, claimed: true },
    { ...e, campaign: "other" },
  ];
  expect(planRefill(c, { reservations: [] }, letters).claimable).toBe(1);
});
it("respects total budget, concurrency and target+buffer", () => {
  expect(planRefill(c, { reservations: [] }, []).count).toBe(4);
  expect(
    planRefill({ ...c, budget: "114" }, { reservations: [] }, []).count,
  ).toBe(0);
  expect(planRefill(c, { reservations: [] }, Array(6).fill(e)).count).toBe(0);
});
it("restart retains uncertain reservations and prevents duplicate refill", () => {
  const j = {
    reservations: Array.from({ length: 6 }, (_, i) => ({
      envelopeId: String(i),
      cost: "115",
      state: "unknown" as const,
    })),
  };
  expect(planRefill(c, JSON.parse(JSON.stringify(j)), []).count).toBe(0);
  expect(planRefill(c, j, []).remaining).toBe("0");
});
