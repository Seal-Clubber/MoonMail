import { afterEach, expect, test, vi } from "vitest";
import { IndexerProvider } from "@tari-project/ootle-indexer";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import {
  MoonPotClient,
  parsePotProfile,
  potTransaction,
} from "../src/core/moon-pot-client";
import { emptyDeployment } from "../src/core/config";
import { SapientSession, type SapientProvider } from "../src/core/sapient";
import { readPending } from "../src/core/pending";
import { decodePotRound, type PotProfile } from "../src/core/moon-pot";
vi.mock("@tari-project/ootle", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVaultIdsForAccount: vi.fn(async () => []),
}));
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const owner = generateKeypair(),
    view = generateKeypair(),
    address = generateOotleAddress(owner.public_key, view.public_key, 38),
    controller = Buffer.from(owner.public_key).toString("hex");
  owner.free();
  view.free();
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "b".repeat(64),
    indexerUrl: "https://pot-fixture.invalid/",
    resource: `resource_${"01".repeat(32)}`,
  };
  const profile: PotProfile = {
    ...d,
    catalog: `component_${"c".repeat(64)}`,
    potTemplate: "d".repeat(64),
    experimental: true,
    evidence: {
      engine: true,
      drawSecurity: false,
      stockSapient: true,
      livePayout: false,
    },
  };
  const component = `component_${"e".repeat(64)}`,
    account = `component_${"f".repeat(64)}`,
    txid = "12".repeat(32),
    calls: { method: string; params?: any }[] = [];
  const store = new Map<string, string>(),
    storage = {
      getItem: (k: string) => store.get(k) || null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    } as Storage;
  const provider: SapientProvider = {
    isTariWallet: true,
    info: { name: "Test fixture", rdns: "mw.tari.sapient", embedded: false },
    request: async (args) => {
      calls.push(args);
      if (args.method === "tari_getNetwork") return "esmeralda";
      if (
        args.method === "tari_requestAccounts" ||
        args.method === "tari_getAccounts"
      )
        return [account];
      if (args.method === "tari_getWalletAddress") return address;
      if (args.method === "tari_getCapabilities")
        return {
          transactionRequests: true,
          walletAddress: true,
          supportsPrivateFees: false,
        };
      if (args.method === "tari_signAndSubmitTransaction") {
        expect((args.params as any).dryRun).toBe(true);
        return {
          result: {
            finalize: { result: { Accept: {} }, total_fees_required: "1000" },
          },
        };
      }
      if (args.method === "tari_createTransactionRequest")
        return { requestId: "pot_fixture" };
      if (args.method === "tari_getTransactionRequest")
        return { requestId: "pot_fixture", status: "approved" };
      if (args.method === "tari_submitTransactionRequest")
        return { transactionId: txid };
      throw new Error("Unsupported or private-view wallet method");
    },
  };
  const wallet = await SapientSession.connect(38, provider);
  const raw: unknown[] = [
    38,
    d.registry,
    `template_${d.template}`,
    1,
    100,
    604,
    {},
    [],
    {},
    0,
    "",
    "",
    false,
    `vault_${"23".repeat(32)}`,
  ];
  const catalog: unknown[] = [
    38,
    d.registry,
    `template_${d.template}`,
    0,
    100,
    604,
    { 100: component },
    [],
    {},
    0,
    "",
    "",
    false,
    `vault_${"24".repeat(32)}`,
  ];
  const indexer = {
    getCurrentEpoch: vi.fn(async () => 200),
    getSubstate: vi.fn(async (id: string) => ({
      substate: {
        Component: {
          header: { template_address: profile.potTemplate, owner_rule: "None" },
          body: { state: id === profile.catalog ? catalog : raw },
        },
      },
    })),
    resolveInputs: vi.fn(async (inputs: any[]) =>
      inputs.map((i) => ({ ...i, version: 0 })),
    ),
    stopWatcher: vi.fn(),
  };
  vi.spyOn(IndexerProvider, "connect").mockResolvedValue(indexer as never);
  const client = await MoonPotClient.connect(d, profile);
  return {
    d,
    profile,
    client,
    wallet,
    raw,
    catalog,
    component,
    account,
    calls,
    storage,
    indexer,
    txid,
  };
}
test("experimental pots need explicit acknowledgement and never fall back to public fee funding", async () => {
  const f = await fixture(),
    intent = {
      action: "contribute" as const,
      postbox: "home",
      amount: "100000",
      message: "A public wish",
    };
  await expect(
    f.client.submit(
      f.wallet,
      "100000",
      f.storage,
      intent,
      false,
      "transparent",
    ),
  ).rejects.toThrow("not enabled");
  await expect(
    f.client.submit(f.wallet, "100000", f.storage, intent, true, "private"),
  ).rejects.toThrow("Choose public fee funding explicitly");
  expect(f.calls.filter((c) => c.method.includes("Transaction"))).toEqual([]);
});
test("one reviewed contribution uses Sapient requests, keeps its receipt and blocks replacement", async () => {
  const f = await fixture(),
    intent = {
      action: "contribute" as const,
      postbox: "home",
      amount: "100000",
      message: "This public message is not stored in the local journal",
    };
  expect(
    await f.client.submit(
      f.wallet,
      "100000",
      f.storage,
      intent,
      true,
      "transparent",
    ),
  ).toBe(f.txid);
  const saved = readPending(f.storage);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    operation: "pot",
    potAction: "contribute",
    id: f.txid,
    state: "submitted",
    walletRequest: { id: "pot_fixture" },
  });
  expect(f.storage.getItem("ghostdrop:pending:v1")).not.toContain(
    intent.message,
  );
  await expect(
    f.client.submit(f.wallet, "100000", f.storage, intent, true, "transparent"),
  ).rejects.toThrow("Reconcile the original");
  expect(
    f.calls.filter((c) => c.method === "tari_createTransactionRequest"),
  ).toHaveLength(1);
  expect(
    f.calls.filter((c) => c.method === "tari_submitTransactionRequest"),
  ).toHaveLength(1);
  expect(
    f.calls.filter((c) => /ViewAccess|ShieldedOutputs/.test(c.method)),
  ).toEqual([]);
});
test("changed pot identity, unsupported network and a missed contribution deadline cannot build a payment", async () => {
  const f = await fixture();
  expect(() =>
    parsePotProfile({ ...f.profile, registry: f.component }, f.d),
  ).toThrow();
  expect(() => parsePotProfile(f.profile, { ...f.d, network: 0 })).toThrow();
  const round = decodePotRound(f.raw, f.profile, f.component),
    intent = {
      action: "contribute" as const,
      postbox: "home",
      amount: "100000",
      message: "Too late",
    };
  expect(() =>
    potTransaction(f.d, f.profile, round, 598, f.account, "100000", intent),
  ).toThrow("deadline");
  expect(() =>
    potTransaction(
      { ...f.d, network: 0 },
      f.profile,
      round,
      200,
      f.account,
      "100000",
      intent,
    ),
  ).toThrow("Esmeralda");
});
test("template and owner checks reject an untrusted live component before preparing any wallet request", async () => {
  const f = await fixture();
  f.indexer.getSubstate.mockResolvedValue({
    substate: {
      Component: {
        header: { template_address: "0".repeat(64), owner_rule: "None" },
        body: { state: f.catalog },
      },
    },
  });
  await expect(f.client.read()).rejects.toThrow("Untrusted Moon Pot");
  expect(f.calls.filter((c) => c.method.includes("Transaction"))).toEqual([]);
});
