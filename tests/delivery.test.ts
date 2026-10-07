import { expect, it, vi } from "vitest";
import { readDelivery } from "../src/core/delivery";
import {
  inspectPending,
  readPending,
  hasUnresolved,
  type Pending,
} from "../src/core/pending";
const pending: Pending = {
  id: "1".repeat(64),
  network: 38,
  registry: `component_${"2".repeat(64)}`,
  operation: "publish",
  envelopeId: "letter",
  state: "submitted",
};

it("only confirms a committed receipt; a pending receipt preserves the original record", async () => {
  const reconcile = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ outcome: "Commit" });
  expect(await readDelivery({ reconcile }, pending)).toBe(pending);
  expect(await readDelivery({ reconcile }, pending)).toEqual({
    ...pending,
    state: "confirmed",
  });
});
it("a fee-only commit stays uncertain, while a full rejection ends the attempt", async () => {
  const reconcile = vi
    .fn()
    .mockResolvedValueOnce({
      outcome: "FeeIntentCommit",
      reason: "Main aborted",
    })
    .mockResolvedValueOnce({ outcome: "Reject" });
  expect(await readDelivery({ reconcile }, pending)).toEqual({
    ...pending,
    state: "unknown",
  });
  expect(await readDelivery({ reconcile }, pending)).toEqual({
    ...pending,
    state: "rejected",
  });
});
it("never queries or replaces an attempt without a transaction ID", async () => {
  const reconcile = vi.fn();
  await expect(
    readDelivery({ reconcile }, { ...pending, id: "attempt:lost-response" }),
  ).rejects.toThrow("Inspect Sapient history");
  expect(reconcile).not.toHaveBeenCalled();
});
it("does not reclassify completed records or mutate a record when the indexer is offline", async () => {
  const reconcile = vi.fn().mockRejectedValue(new Error("Indexer offline"));
  const confirmed = { ...pending, state: "confirmed" as const };
  expect(await readDelivery({ reconcile }, confirmed)).toBe(confirmed);
  expect(reconcile).not.toHaveBeenCalled();
  await expect(readDelivery({ reconcile }, pending)).rejects.toThrow(
    "Indexer offline",
  );
  expect(pending.state).toBe("submitted");
});
it("distinguishes a corrupt journal from an empty history without deleting spending protection", () => {
  const storage = { getItem: () => "{corrupt" };
  expect(inspectPending(storage)).toMatchObject({
    records: [],
    error: expect.stringContaining("spending is blocked"),
  });
  expect(readPending(storage)).toEqual([]);
  expect(() =>
    hasUnresolved(storage, 38, pending.registry, pending.envelopeId),
  ).toThrow("spending is blocked");
  expect(inspectPending({ getItem: () => null })).toEqual({ records: [] });
});
