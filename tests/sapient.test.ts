import { expect, test, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { SapientSession, type SapientProvider } from "../src/core/sapient";
import {
  emptyDeployment,
  writesReady,
  postboxClaimsReady,
} from "../src/core/config";
import { publishTransaction } from "../src/core/transactions";
import { PostOfficeClient } from "../src/core/chain";
import { readPending } from "../src/core/pending";
import capsuleLedger from "./fixtures/capsule-carrier.json";
async function capsuleFixture() {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  const resource = Object.keys(capsuleLedger).find((id) =>
    id.startsWith("resource_"),
  )!;
  const resourceState = (capsuleLedger as any)[resource];
  const component =
    resourceState.substate.Resource.access_rules.mint.Restricted.Require.Require
      .ScopedToComponent;
  const deployment = { component, resource, template: "f".repeat(64) };
  const context = {
    network: 38,
    registry: f.d.registry,
    template: f.d.template,
    postbox: "new-postbox",
    controller: wallet.accounts[0].account.owner_public_key,
    keyVersion: 1,
  };
  const funding = {
    readSubstate: vi.fn(async (id: string) => {
      if (id === resource) return structuredClone(resourceState);
      if (id === component)
        return {
          substate: {
            Component: {
              header: {
                template_address: deployment.template,
                owner_rule: "None",
              },
            },
          },
        };
      throw new Error("Unknown deployment");
    }),
    vaults: vi.fn(async () => [`vault_${"e".repeat(64)}`]),
    epoch: vi.fn(async () => 123),
    resolveInputs: vi.fn(async (inputs: any[]) =>
      inputs.map((input) => ({ ...input, version: 7 })),
    ),
  };
  return { ...f, wallet, deployment, capsuleContext: context, funding };
}
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
    envelope,
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
    "native daemon memo recovery is unsupported",
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

test("Sapient publication declares the registry and funding dependencies before wallet simulation", async () => {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  const vault = "e".repeat(64);
  const chain = {
    deployment: f.d,
    provider: {
      getCurrentEpoch: async () => 123,
      resolveInputs: async (inputs: any[]) =>
        inputs.map((input) => ({ ...input, version: 7 })),
      getSubstate: async () => ({
        substate: {
          Component: {
            body: {
              state: [
                {
                  "@cbor": "tag",
                  tag: 132,
                  value: { "@cbor": "bytes", hex: vault },
                },
              ],
            },
          },
        },
      }),
    },
  } as unknown as PostOfficeClient;
  await PostOfficeClient.prototype.publish.call(
    chain,
    wallet,
    wallet.accounts[0],
    f.envelope,
    "100",
    f.storage,
  );
  const dry = f.request.mock.calls.find(
    ([a]) => a.method === "tari_signAndSubmitTransaction",
  )![0].params as { inputs: { substate_id: string; is_write: boolean }[] };
  expect(dry.inputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ substate_id: f.d.registry, is_write: true }),
      expect.objectContaining({
        substate_id: wallet.accounts[0].account.component_address,
        is_write: true,
      }),
      expect.objectContaining({ substate_id: f.d.resource, is_write: false }),
      expect.objectContaining({
        substate_id: `vault_${vault}`,
        is_write: true,
      }),
      expect.objectContaining({
        substate_id: `template_${f.d.envelopeTemplate}`,
        is_write: false,
      }),
    ]),
  );
  expect(dry.inputs.every((input: any) => input.version === 7)).toBe(true);
});
test("capsule creation journals only public recovery data before approval and declares funding inputs", async () => {
  const f = await capsuleFixture(),
    call = f.provider.request;
  f.provider.request = async (args) => {
    if (args.method === "tari_createTransactionRequest") {
      const pending = readPending(f.storage)[0];
      expect(pending.state).toBe("unknown");
      expect(pending.capsule?.descriptor.recovery).toBe("sapient-capsule-1");
      expect(pending.capsule?.descriptor.capsule?.commitment).toMatch(
        /^[a-f0-9]{64}$/,
      );
    }
    return call(args);
  };
  const result = await f.wallet.storeCapsule(
    f.capsuleContext,
    f.deployment,
    "100",
    f.storage,
    f.funding,
  );
  const journal = JSON.stringify(readPending(f.storage));
  for (const forbidden of [
    "statementJson",
    "encrypted_data",
    "Message",
    "secret_key",
    "gd-capsule-1",
  ])
    expect(journal).not.toContain(forbidden);
  expect(readPending(f.storage)[0]).toMatchObject({
    id: result.transactionId,
    operation: "capsule",
    state: "submitted",
    walletRequest: { id: f.id },
    capsule: { deployment: f.deployment },
  });
  const tx = f.request.mock.calls.find(
    ([a]) => a.method === "tari_createTransactionRequest",
  )![0].params as any;
  expect(tx.instructions).toHaveLength(1);
  expect(f.funding.resolveInputs).toHaveBeenCalledTimes(1);
  expect(tx.inputs.every((input: any) => input.version === 7)).toBe(true);
  expect(tx.instructions[0].CallMethod.method).toBe("store");
  expect(tx.inputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        substate_id: f.deployment.resource,
        is_write: true,
      }),
      expect.objectContaining({
        substate_id: f.deployment.component,
        is_write: false,
      }),
      expect.objectContaining({
        substate_id: `template_${f.deployment.template}`,
        is_write: false,
      }),
      expect.objectContaining({
        substate_id: f.wallet.accounts[0].account.component_address,
        is_write: true,
      }),
      expect.objectContaining({
        substate_id: `vault_${"e".repeat(64)}`,
        is_write: true,
      }),
    ]),
  );
});
test("lost capsule submission resumes the same approval after reconnect without minting another capsule", async () => {
  const f = await capsuleFixture();
  f.loseSubmit();
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("lost response");
  const p = readPending(f.storage)[0];
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("setup already exists");
  const restored = await SapientSession.connect(38, f.provider);
  expect(await restored.resume(p.id, f.storage)).toBe("1".repeat(64));
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
test("lost capsule creation response blocks a replacement before ledger reads or key generation", async () => {
  const f = await capsuleFixture();
  f.loseCreate();
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("lost response");
  const originalDescriptor = readPending(f.storage)[0].capsule?.descriptor;
  f.funding.readSubstate.mockClear();
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("setup already exists");
  expect(f.funding.readSubstate).not.toHaveBeenCalled();
  expect(readPending(f.storage)[0].capsule?.descriptor).toEqual(
    originalDescriptor,
  );
  expect(readPending(f.storage)[0].walletRequest).toBeUndefined();
});
test("capsule creation rejects the wrong reviewed template and corrupt journals before approval", async () => {
  const f = await capsuleFixture();
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      { ...f.deployment, template: "a".repeat(64) },
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("reviewed template");
  f.storage.setItem("ghostdrop:pending:v1", "invalid");
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("spending is blocked");
  expect(
    f.request.mock.calls.some(
      ([a]) => a.method === "tari_createTransactionRequest",
    ),
  ).toBe(false);
});
test("capsule refusal preserves its metadata and never broadcasts or replaces the key", async () => {
  const f = await capsuleFixture();
  f.setStatus("rejected");
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("rejected in Sapient");
  expect(readPending(f.storage)[0].state).toBe("rejected");
  await expect(
    f.wallet.storeCapsule(
      f.capsuleContext,
      f.deployment,
      "100",
      f.storage,
      f.funding,
    ),
  ).rejects.toThrow("setup already exists");
  expect(
    f.request.mock.calls.some(
      ([a]) => a.method === "tari_submitTransactionRequest",
    ),
  ).toBe(false);
});
test("capsule evidence never enables Sapient addressed gifts or prepaid collection", async () => {
  const f = await capsuleFixture();
  const deployment = {
    ...f.d,
    capsule: f.deployment,
    evidence: { ...f.d.evidence, mailboxRecovery: true },
  };
  expect(writesReady(deployment, "postbox", "sapient")).toBe(true);
  expect(
    writesReady({ ...deployment, capsule: undefined }, "postbox", "sapient"),
  ).toBe(false);
  expect(postboxClaimsReady(deployment, "sapient")).toBe(false);
  const chain = { deployment, provider: {} } as PostOfficeClient;
  const gift = {
    ...f.envelope,
    mode: "postbox" as const,
    gift: "1",
    reserve: "1",
  };
  await expect(
    PostOfficeClient.prototype.publish.call(
      chain,
      f.wallet,
      f.wallet.accounts[0],
      gift,
      "100",
      f.storage,
    ),
  ).rejects.toThrow("prepaid signing");
  await expect(
    PostOfficeClient.prototype.claimPostbox.call(
      chain,
      f.wallet,
      f.wallet.accounts[0],
      gift,
      "unused",
      "unused",
      f.storage,
    ),
  ).rejects.toThrow("prepaid addressed");
  expect(
    f.request.mock.calls.some(
      ([a]) => a.method === "tari_createTransactionRequest",
    ),
  ).toBe(false);
});
test("concurrent capsule setup creates only one persisted wallet approval", async () => {
  const f = await capsuleFixture();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      f.wallet.storeCapsule(
        f.capsuleContext,
        f.deployment,
        "100",
        f.storage,
        f.funding,
      ),
    ),
  );
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
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
  expect(readPending(f.storage)).toHaveLength(1);
});
test("postbox registration declares account and fee vault dependencies before Sapient simulation", async () => {
  const f = await capsuleFixture();
  const deployment = {
    ...f.d,
    capsule: f.deployment,
    evidence: { ...f.d.evidence, mailboxRecovery: true },
  };
  const chain = {
    deployment,
    provider: {
      getCurrentEpoch: async () => 123,
      resolveInputs: async (inputs: any[]) =>
        inputs.map((input) => ({ ...input, version: 7 })),
      getSubstate: async () => ({
        substate: {
          Component: {
            body: {
              state: [
                {
                  "@cbor": "tag",
                  tag: 132,
                  value: { "@cbor": "bytes", hex: "e".repeat(64) },
                },
              ],
            },
          },
        },
      }),
    },
  } as unknown as PostOfficeClient;
  Object.setPrototypeOf(chain, PostOfficeClient.prototype);
  await PostOfficeClient.prototype.savePostbox.call(
    chain,
    f.wallet,
    f.wallet.accounts[0],
    {
      id: "existing",
      nickname: "edited",
      controller: f.capsuleContext.controller,
      discoverable: false,
      encryptionKey: "unused-for-edit",
    },
    "edit",
    "100",
    f.storage,
  );
  const dry = f.request.mock.calls.find(
    ([a]) => a.method === "tari_signAndSubmitTransaction",
  )![0].params as any;
  expect(dry.inputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        substate_id: deployment.registry,
        is_write: true,
      }),
      expect.objectContaining({
        substate_id: f.wallet.accounts[0].account.component_address,
        is_write: true,
      }),
      expect.objectContaining({
        substate_id: `vault_${"e".repeat(64)}`,
        is_write: true,
      }),
    ]),
  );
});
