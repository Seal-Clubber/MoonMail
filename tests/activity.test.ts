import { expect, it, vi } from "vitest";
import {
  activityDetails,
  activityMatches,
  newestActivity,
} from "../src/ui/activity-details";
import {
  sampleMail,
  sampleLetter,
  sampleActivity,
  filterSampleMail,
} from "../src/ui/sample-office";
import { filterHallMail } from "../src/core/mail-search";
import {
  beginSubmission,
  completeSubmission,
  inspectPending,
  readPending,
  savePending,
  type Pending,
} from "../src/core/pending";
import { readDelivery } from "../src/core/delivery";
const base: Pending = {
  id: "1".repeat(64),
  network: 38,
  registry: `component_${"2".repeat(64)}`,
  operation: "publish",
  envelopeId: "letter",
  state: "submitted",
};
function storage(initial: Pending[] = []) {
  let value = JSON.stringify(initial);
  return {
    length: 1,
    key: () => "ghostdrop:pending:v1",
    clear: () => {
      value = "[]";
    },
    removeItem: () => {
      value = "[]";
    },
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  } as Storage;
}
it("new postbox attempts retain their original start time and intent through receipt confirmation", async () => {
  const store = storage();
  const clock = vi.spyOn(Date, "now").mockReturnValue(1780000000000);
  try {
    const attempt = beginSubmission(store, {
      network: 38,
      registry: base.registry,
      operation: "postbox",
      postboxAction: "rotate",
      envelopeId: "postbox:box",
    });
    clock.mockReturnValue(1780000060000);
    completeSubmission(store, attempt, base.id);
    const pending = readPending(store)[0];
    expect(pending).toMatchObject({
      createdAt: 1780000000000,
      postboxAction: "rotate",
      state: "submitted",
    });
    const confirmed = await readDelivery(
      { reconcile: vi.fn().mockResolvedValue({ outcome: "Commit" }) },
      pending,
    );
    savePending(store, confirmed);
    expect(readPending(store)[0]).toMatchObject({
      id: base.id,
      createdAt: 1780000000000,
      postboxAction: "rotate",
      state: "confirmed",
    });
  } finally {
    clock.mockRestore();
  }
});
it("legacy journals stay readable and unchanged without invented timestamps or postbox actions", () => {
  const old = { ...base, operation: "postbox" as const };
  const store = storage([old]);
  const before = store.getItem("");
  expect(inspectPending(store)).toEqual({ records: [old] });
  expect(activityDetails(old).title).toBe("Change a postbox");
  expect(store.getItem("")).toBe(before);
});
it("malformed new metadata blocks spending rather than crashing the Activity date renderer", () => {
  for (const patch of [
    { createdAt: -1 },
    { createdAt: 0 },
    { createdAt: 9_000_000_000_000_000 },
    { createdAt: "yesterday" },
    { postboxAction: "send" },
    { postboxAction: "rotate" },
  ]) {
    const record = { ...base, ...patch } as Pending;
    expect(inspectPending(storage([record])).error).toContain(
      "spending is blocked",
    );
  }
});
it("a legacy collected claim without its own receipt stays in the pending filter and never promises payout", () => {
  const record = {
    ...base,
    id: "attempt:lost-response",
    operation: "claim" as const,
    state: "confirmed" as const,
  };
  const detail = activityDetails(record);
  expect(detail.label).toBe("Awaiting confirmation");
  expect(detail.explanation).toContain("cannot prove");
  expect(detail.nextStep).toContain("Do not send a replacement");
  expect(activityMatches(record, "pending")).toBe(true);
  expect(activityMatches(record, "confirmed")).toBe(false);
});
it("confirmed backups explain the second approval and postbox actions name the recorded intent", () => {
  expect(
    activityDetails({ ...base, operation: "capsule", state: "confirmed" })
      .nextStep,
  ).toContain("second approval");
  expect(
    activityDetails({ ...base, operation: "postbox", postboxAction: "create" })
      .title,
  ).toBe("Open a postbox");
  expect(
    activityDetails({ ...base, operation: "postbox", postboxAction: "edit" })
      .title,
  ).toBe("Edit a postbox");
  expect(
    activityDetails({ ...base, operation: "postbox", postboxAction: "rotate" })
      .title,
  ).toContain("encryption key");
});
it("sorting puts dated attempts newest first and retains reverse journal order for undated entries", () => {
  const a = { ...base, id: "a" },
    b = { ...base, id: "b", createdAt: 3000 },
    c = { ...base, id: "c", createdAt: 6000 },
    d = { ...base, id: "d" };
  const records = [a, b, c, d];
  expect(newestActivity(records).map((p) => p.id)).toEqual([
    "c",
    "b",
    "d",
    "a",
  ]);
  expect(records).toEqual([a, b, c, d]);
});
it("the busy sample office contains 36 unique readable examples, all audiences and varied gift states", () => {
  expect(sampleMail).toHaveLength(36);
  expect(new Set(sampleMail.map((e) => e.id)).size).toBe(36);
  for (const mode of ["public", "link", "postbox"])
    expect(sampleMail.some((e) => e.mode === mode)).toBe(true);
  expect(sampleMail.some((e) => BigInt(e.gift) > 0n && !e.claimed)).toBe(true);
  expect(sampleMail.some((e) => BigInt(e.gift) > 0n && e.claimed)).toBe(true);
  expect(sampleMail.every((e) => !!sampleLetter(e.id)?.body)).toBe(true);
  expect(sampleActivity).toHaveLength(28);
});
it("public previews and real search both omit private links and postbox mail", () => {
  const privateLetter = sampleMail.find((e) => e.mode === "link")!;
  const subject = sampleLetter(privateLetter.id)!.subject;
  expect(filterSampleMail("all", subject).map((e) => e.id)).not.toContain(
    privateLetter.id,
  );
  expect(
    filterHallMail(sampleMail, "all", subject).map((e) => e.id),
  ).not.toContain(privateLetter.id);
  expect(filterSampleMail("all", "").every((e) => e.mode === "public")).toBe(
    true,
  );
  expect(filterSampleMail("all", "")).toHaveLength(20);
  const postbox = sampleMail.find((e) => e.mode === "postbox")!;
  expect(
    filterSampleMail("all", sampleLetter(postbox.id)!.subject),
  ).toHaveLength(0);
  expect(
    filterSampleMail("gifts", "").every(
      (e) => e.mode === "public" && !e.claimed && BigInt(e.gift) > 0n,
    ),
  ).toBe(true);
});
