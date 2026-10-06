import { expect, test, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { SapientSession, type SapientProvider } from "../src/core/sapient";
import { emptyDeployment, writesReady } from "../src/core/config";
import { publishTransaction } from "../src/core/transactions";
import { readPending } from "../src/core/pending";
function fixture() {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  owner.free();
  view.free();
  const component = `component_${"d".repeat(64)}`,
    id = "request_123";
  let network = "esmeralda",
    selected = component,
    status = "approved",
    submitError = false,
    createError = false;
  const request = vi.fn(
    async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown;
    }): Promise<unknown> => {
      switch (method) {
        case "tari_getNetwork":
          return network;
        case "tari_requestAccounts":
        case "tari_getAccounts":
          return [selected];
        case "tari_getWalletAddress":
          return address;
        case "tari_getCapabilities":
          return { transactionRequests: true, walletAddress: true };
        case "tari_disconnect":
          return null;
        case "tari_signAndSubmitTransaction":
          return {
            result: {
              finalize: { result: { Accept: {} }, total_fees_required: "10" },
            },
          };
        case "tari_createTransactionRequest":
          if (createError) throw new Error("lost response");
          return { requestId: id };
        case "tari_getTransactionRequest":
          return {
            requestId: id,
            status,
            result:
              status === "submitted"
                ? { transactionId: "1".repeat(64) }
                : undefined,
          };
        case "tari_submitTransactionRequest":
          status = "submitted";
          if (submitError) throw new Error("lost response");
          return { transaction_id: "1".repeat(64) };
        default:
          throw new Error("Unexpected provider method " + method);
      }
    },
  );
  const provider: SapientProvider = {
    isTariWallet: true,
    info: { name: "Sapient", rdns: "mw.tari.sapient", embedded: false },
    request,
  };
  let journal: string | null = null;
  const storage: Storage = {
    getItem: () => journal,
    setItem: (_key: string, value: string) => {
      journal = value;
    },
    get length() {
      return journal ? 1 : 0;
    },
    clear: () => {
      journal = null;
    },
    removeItem: () => {
      journal = null;
    },
    key: () => (journal ? "ghostdrop:pending:v1" : null),
  };
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    resource: `resource_${"01".repeat(32)}`,
    indexerUrl: "https://ootle-indexer-a.tari.com/",
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
      sapientWallet: true,
    },
  };
  const envelope = {
    id: "letter",
    mode: "public" as const,
    context: d,
    payload: { subject: "hello", body: "world" },
    gift: "0",
    reserve: "0",
    claimed: false,
    sender: "",
  };
  const tx = publishTransaction(d, envelope, component, "100", 123);
  const context = {
    network: 38,
    registry: d.registry,
    operation: "publish" as const,
    envelopeId: "letter",
  };
  return {
    provider,
    request,
    storage,
    d,
    tx,
    context,
    id,
    setNetwork: (v: string) => {
      network = v;
    },
    setAccount: (v: string) => {
      selected = v;
    },
    setStatus: (v: string) => {
      status = v;
    },
    loseSubmit: () => {
      submitError = true;
    },
    loseCreate: () => {
      createError = true;
    },
  };
}
test("Sapient connection rejects the wrong network before requesting permission", async () => {
  const f = fixture();
  f.setNetwork("igor");
  await expect(SapientSession.connect(38, f.provider)).rejects.toThrow(
    "Switch Sapient",
  );
  expect(
    f.request.mock.calls.some(([a]) => a.method === "tari_requestAccounts"),
  ).toBe(false);
});
test("Sapient connection is separate from legacy daemon evidence and does not enable postboxes", () => {
  const f = fixture();
  expect(writesReady(f.d, "public", "sapient")).toBe(true);
  expect(writesReady(f.d, "public", "daemon")).toBe(false);
  expect(writesReady(f.d, "postbox", "sapient")).toBe(false);
});
test("Sapient simulates, persists a wallet request and submits only its approved ID", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  const id = await wallet.submitOperation(f.tx, "100", f.storage, f.context);
  expect(id).toBe("1".repeat(64));
  const create = f.request.mock.calls.find(
    ([a]) => a.method === "tari_createTransactionRequest",
  )![0].params as Record<string, unknown>;
  expect(create.feeType).toBe("transparent");
  expect(create.enforceFeeType).toBe(true);
  expect(create.maxFee).toBe("100");
  expect(create.instructions).toEqual(f.tx.instructions);
  expect(readPending(f.storage)[0]).toMatchObject({
    id,
    state: "submitted",
    walletRequest: { id: f.id },
  });
  expect(JSON.stringify(readPending(f.storage))).not.toContain("world");
});
test("lost submit response is recovered from the same persisted wallet request after reconnect", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.loseSubmit();
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow("lost response");
  const pending = readPending(f.storage)[0];
  expect(pending.state).toBe("unknown");
  wallet.invalidate();
  const restored = await SapientSession.connect(38, f.provider);
  expect(await restored.resume(pending.id, f.storage)).toBe("1".repeat(64));
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_createTransactionRequest",
    ),
  ).toHaveLength(1);
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_submitTransactionRequest",
    ),
  ).toHaveLength(1);
});
test("lost request creation response keeps an unknown attempt and blocks duplicate creation", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.loseCreate();
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow("lost response");
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow("existing submission");
  expect(readPending(f.storage)[0].state).toBe("unknown");
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_createTransactionRequest",
    ),
  ).toHaveLength(1);
});
test("pending approvals are journaled for resume without another request", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.setStatus("pending");
  const create = f.provider.request;
  f.provider.request = async (args) => {
    const r = await create(args);
    if (args.method === "tari_createTransactionRequest") wallet.invalidate();
    return r;
  };
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow("session changed");
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_submitTransactionRequest",
    ),
  ).toHaveLength(0);
  expect(readPending(f.storage)[0].state).toBe("unknown");
});
test("a changed account cannot resume a previously approved request", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.loseSubmit();
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow();
  f.setAccount(`component_${"e".repeat(64)}`);
  await expect(
    wallet.resume(readPending(f.storage)[0].id, f.storage),
  ).rejects.toThrow("account or network changed");
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_submitTransactionRequest",
    ),
  ).toHaveLength(1);
});
test("wallet refusal records rejection and never invokes submission", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.setStatus("rejected");
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow("rejected in Sapient");
  expect(readPending(f.storage)[0].state).toBe("rejected");
  expect(
    f.request.mock.calls.some(
      ([a]) => a.method === "tari_submitTransactionRequest",
    ),
  ).toBe(false);
});
test("simulated fees above the cap prevent request creation", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  const call = f.provider.request;
  f.provider.request = (args) =>
    args.method === "tari_signAndSubmitTransaction"
      ? Promise.resolve({
          result: {
            finalize: { result: { Accept: {} }, total_fees_required: "101" },
          },
        })
      : call(args);
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow("fee cap");
  expect(readPending(f.storage)).toHaveLength(0);
  expect(
    f.request.mock.calls.some(
      ([a]) => a.method === "tari_createTransactionRequest",
    ),
  ).toBe(false);
});
test("Sapient cannot silently replace gift-paid fee instructions or native recovery", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, {
      ...f.context,
      operation: "claim",
    }),
  ).rejects.toThrow("prepaid fee");
  expect(() => wallet.nativeMailbox()).toThrow(
    "recovery has not been verified",
  );
});

test("wrong operation network is rejected before simulation or approval", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, {
      ...f.context,
      network: 36,
    }),
  ).rejects.toThrow("operation network");
  expect(
    f.request.mock.calls.some(
      ([a]) => a.method === "tari_signAndSubmitTransaction",
    ),
  ).toBe(false);
  expect(readPending(f.storage)).toHaveLength(0);
});

test("a persisted request cannot turn a prepaid guest claim into a wallet-paid submission", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.loseSubmit();
  await expect(
    wallet.submitOperation(f.tx, "100", f.storage, f.context),
  ).rejects.toThrow();
  const pending = readPending(f.storage)[0];
  f.storage.setItem(
    "ghostdrop:pending:v1",
    JSON.stringify([{ ...pending, operation: "claim" }]),
  );
  await expect(wallet.resume(pending.id, f.storage)).rejects.toThrow(
    "does not match",
  );
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_submitTransactionRequest",
    ),
  ).toHaveLength(1);
});
