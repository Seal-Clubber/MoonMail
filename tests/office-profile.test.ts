import { afterEach, expect, test, vi } from "vitest";
import { officeProfile, loadOfficeProfile } from "../src/core/office-profile";
import {
  claimsReady,
  emptyDeployment,
  postboxSetupReady,
  writesReady,
} from "../src/core/config";
import deployed from "../public/deployment-v4.json";
import mainnet from "../public/deployment.json";

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

test("Mainnet enables gift collection and postbox setup independently of sending", () => {
  const profile = officeProfile(mainnet);
  expect(profile.network).toBe(0);
  expect(profile.registry).toMatch(/^component_[a-f0-9]{64}$/);
  expect(profile.contractProtocol).toBe("unified-2");
  expect(profile.capsule?.component).toBe(profile.registry);
  expect(postboxSetupReady(profile, "sapient")).toBe(true);
  expect(writesReady(profile, "public", "sapient")).toBe(false);
  expect(writesReady(profile, "link", "sapient")).toBe(false);
  expect(writesReady(profile, "postbox", "sapient")).toBe(false);
  expect(claimsReady(profile)).toBe(true);
  expect(claimsReady(profile, true)).toBe(true);
});

test("unverified recovery or a missing capsule blocks postbox setup", () => {
  const profile = officeProfile({
    ...mainnet,
    sealedDelivery: { ...mainnet.sealedDelivery, recovery: false },
  });
  expect(postboxSetupReady(profile, "sapient")).toBe(false);
  expect(postboxSetupReady(profile, "daemon")).toBe(false);
  expect(writesReady(profile, "postbox", "sapient")).toBe(false);
  expect(writesReady(profile, "public", "sapient")).toBe(false);
  expect(
    postboxSetupReady(
      { ...officeProfile(mainnet), capsule: undefined },
      "sapient",
    ),
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
  const result = loadOfficeProfile("/MoonMail/deployment.json");
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
  await expect(loadOfficeProfile("/MoonMail/deployment.json")).rejects.toThrow(
    "unavailable",
  );
  expect(json).not.toHaveBeenCalled();
});
