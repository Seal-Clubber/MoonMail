import { expect, it, vi } from "vitest";
import { PostOfficeClient } from "../src/core/chain";
import { emptyDeployment } from "../src/core/config";
import type { Envelope } from "../src/core/types";
const d = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"1".repeat(64)}`,
  template: "2".repeat(64),
  envelopeTemplate: "3".repeat(64),
};
function fixture(count = 3) {
  const ids = Array.from(
    { length: count },
    (_, i) => `letter-${String(i).padStart(3, "0")}`,
  );
  const response = {
    substate: {
      Component: {
        header: { template_address: d.template, owner_rule: "None" as unknown },
        body: {
          state: [
            38,
            Object.fromEntries(
              ids.map((id, i) => [
                id,
                `component_${(i + 20).toString(16).padStart(64, "0")}`,
              ]),
            ),
            {},
            `template_${d.envelopeTemplate}`,
          ],
        },
      },
    },
  };
  const provider = { getSubstate: vi.fn(async () => response) };
  const client = new (PostOfficeClient as any)(d, provider) as PostOfficeClient;
  const read = vi
    .spyOn(client, "readLetter")
    .mockImplementation(async (id) => ({
      id,
      mode: "public",
      context: d,
      payload: { subject: id, body: "Public note" },
      gift: "0",
      reserve: "0",
      claimed: false,
      sender: "fixture",
    }));
  return { ids, response, provider, client, read };
}
it("bulk reads stay strict by default for donor and financial tooling", async () => {
  const f = fixture();
  f.read.mockImplementation(async (id) => {
    if (id === f.ids[1]) throw new Error("Untrusted letter");
    return { id } as Envelope;
  });
  await expect(f.client.read()).rejects.toThrow("Untrusted letter");
});
it("opt-in partial browsing returns only verified letters and identifies missing IDs", async () => {
  const f = fixture();
  f.read.mockImplementation(async (id) => {
    if (id === f.ids[1])
      throw new Error("Unreadable private payload must not be exposed");
    return { id } as Envelope;
  });
  const result = await f.client.read("", 100, { allowPartial: true });
  expect(result.letters.map((e) => e.id)).toEqual([f.ids[0], f.ids[2]]);
  expect(result.unavailableLetterIds).toEqual([f.ids[1]]);
  expect(result.total).toBe(3);
  expect(JSON.stringify(result)).not.toContain("private payload");
});
it("pagination advances past a failed final reference instead of getting stuck", async () => {
  const f = fixture();
  f.read.mockImplementation(async (id) => {
    if (id === f.ids[1]) throw new Error("Offline");
    return { id } as Envelope;
  });
  const first = await f.client.read("", 2, { allowPartial: true });
  expect(first.nextCursor).toBe(f.ids[1]);
  expect(first.letters.map((e) => e.id)).toEqual([f.ids[0]]);
  const next = await f.client.read(first.nextCursor, 2, { allowPartial: true });
  expect(next.letters.map((e) => e.id)).toEqual([f.ids[2]]);
  expect(next.nextCursor).toBe("");
});
it.each(["template", "owner"])(
  "partial mode never relaxes the registry %s rule",
  async (bad) => {
    const f = fixture();
    if (bad === "template")
      f.response.substate.Component.header.template_address = "4".repeat(64);
    else
      f.response.substate.Component.header.owner_rule = {
        ByPublicKey: "5".repeat(64),
      };
    await expect(
      f.client.read("", 100, { allowPartial: true }),
    ).rejects.toThrow("Untrusted registry");
    expect(f.read).not.toHaveBeenCalled();
  },
);
it("failed reads remain bounded to eight concurrent requests", async () => {
  const f = fixture(20);
  let active = 0,
    peak = 0;
  f.read.mockImplementation(async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    throw new Error("Offline");
  });
  const result = await f.client.read("", 100, { allowPartial: true });
  expect(result.letters).toEqual([]);
  expect(result.unavailableLetterIds).toEqual(f.ids);
  expect(peak).toBe(8);
});

it.each([0, 101, 1.5, NaN, Infinity])(
  "invalid page size %s cannot start a ledger read",
  async (limit) => {
    const f = fixture();
    await expect(
      f.client.read("", limit, { allowPartial: true }),
    ).rejects.toThrow("Page size");
    expect(f.provider.getSubstate).not.toHaveBeenCalled();
  },
);
