import { afterEach, expect, test, vi } from "vitest";
import { officeProfile, loadOfficeProfile } from "../src/core/office-profile";
import { emptyDeployment, writesReady } from "../src/core/config";
import deployed from "../public/deployment.json";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("both the deployed Sapient profile and an explicitly unconfigured office remain valid", () => {
  expect(writesReady(officeProfile(deployed), "postbox", "sapient")).toBe(true);
  expect(
    writesReady(officeProfile(emptyDeployment), "postbox", "sapient"),
  ).toBe(false);
});

test("damaged types cannot crash the UI or display fabricated evidence", () => {
  for (const value of [
    null,
    [],
    {},
    { ...deployed, network: "38" },
    { ...deployed, evidence: { ...deployed.evidence, sapientWallet: "false" } },
    { ...deployed, capsule: null },
    { ...deployed, capsule: { ...deployed.capsule, resource: 123 } },
    { ...deployed, registry: {} },
    { ...deployed, postboxClaimProtocol: "unexpected" },
  ])
    expect(() => officeProfile(value)).toThrow(/Invalid post office/);
});

test("a stalled JSON body times out after headers and cannot replace that failed result later", async () => {
  vi.useFakeTimers();
  let release!: (value: unknown) => void;
  const body = new Promise((r) => (release = r));
  const fetch = vi.fn(async () => ({ ok: true, json: () => body }));
  vi.stubGlobal("fetch", fetch);
  const result = loadOfficeProfile("/GhostDrop/deployment.json");
  const failed = expect(result).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15_000);
  await failed;
  release(deployed);
  await expect(result).rejects.toThrow("timed out");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test("an HTTP failure preserves an explicit error without parsing its body", async () => {
  const json = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, json })),
  );
  await expect(loadOfficeProfile("/GhostDrop/deployment.json")).rejects.toThrow(
    "unavailable",
  );
  expect(json).not.toHaveBeenCalled();
});
