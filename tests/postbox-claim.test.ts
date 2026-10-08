import { expect, test, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import {
  postboxClaimChallenge,
  postboxProofClaimTransaction,
  nativeTari,
} from "../src/core/postbox-claim";
import { SapientSession, type SapientProvider } from "../src/core/sapient";
import { emptyDeployment, postboxClaimsReady } from "../src/core/config";
import { PostOfficeClient } from "../src/core/chain";
import { readPending, beginSubmission } from "../src/core/pending";
import type { Envelope } from "../src/core/types";

const simulation = vi.hoisted(() => vi.fn());
vi.mock("@tari-project/ootle", async (original) => ({
  ...(await original<typeof import("@tari-project/ootle")>()),
  getVaultIdsForAccount: vi.fn(async (_provider, account: string) => [
    `vault_${account.slice(-64)}`,
  ]),
}));
function fixture() {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  owner.free();
  view.free();
  let network = "esmeralda",
    selected = `component_${"d".repeat(64)}`;
  let proof: unknown = {
    walletAddress: address,
    publicNonce: "12".repeat(32),
    signature: "23".repeat(32),
  };
  const request = vi.fn(
    async ({
      method,
    }: {
      method: string;
      params?: unknown;
    }): Promise<unknown> => {
      if (method === "tari_getNetwork") return network;
      if (method === "tari_getAccounts" || method === "tari_requestAccounts")
        return [selected];
      if (method === "tari_getWalletAddress") return address;
      if (method === "tari_getCapabilities")
        return { transactionRequests: true, walletAddress: true };
      if (method === "tari_signWalletOwnershipChallenge") {
        if (proof instanceof Error) throw proof;
        return proof;
      }
      throw new Error("Unexpected wallet call: " + method);
    },
  );
  const provider: SapientProvider = {
    isTariWallet: true,
    info: { name: "Sapient", rdns: "mw.tari.sapient", embedded: false },
    request,
  };
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  } as unknown as Storage;
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    resource: nativeTari,
    indexerUrl: "https://fixture.invalid/",
    postboxClaimProtocol: "sapient-proof-1" as const,
    capsule: {
      template: "1".repeat(64),
      component: `component_${"2".repeat(64)}`,
      resource: `resource_${"3".repeat(64)}`,
    },
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
      sapientWallet: true,
      mailboxRecovery: true,
      postboxClaims: true,
    },
  };
  const envelope: Envelope = {
    claimProtocol: "sapient-proof-1",
    component: `component_${"e".repeat(64)}`,
    id: "gift",
    mode: "postbox",
    context: d,
    payload: { subject: "fixture", body: "unused in claim" },
    gift: "1000000",
    reserve: "100000",
    claimed: false,
    sender: "",
    recipientPostbox: "box",
  };
  return {
    d,
    envelope,
    address,
    selected,
    provider,
    request,
    storage,
    setNetwork: (n: string) => (network = n),
    setSelected: (n: string) => (selected = n),
    setProof: (p: unknown) => (proof = p),
  };
}
async function connected() {
  const f = fixture(),
    wallet = await SapientSession.connect(38, f.provider);
  f.envelope.claimAuthority = wallet.accounts[0].account.owner_public_key;
  return { ...f, wallet };
}
async function chainFixture() {
  const f = await connected();
  simulation.mockReset().mockResolvedValue({
    transaction_id: "8".repeat(64),
    result: {
      finalize: { result: { Accept: {} }, total_fees_required: "1000" },
    },
  });
  const resolveInputs = vi.fn(async (inputs) =>
    inputs.map((i: any) => ({ ...i, version: 0 })),
  );
  const submitTransaction = vi.fn(async () => {
    expect(readPending(f.storage)).toEqual([
      expect.objectContaining({ state: "unknown", envelopeId: "gift" }),
    ]);
    return { transaction_id: "4".repeat(64) };
  });
  const provider = {
    getClient: () => ({ getTransport: () => ({ sendPost: simulation }) }),
    getCurrentEpoch: vi.fn(async () => 100),
    resolveInputs,
    submitTransaction,
  };
  // Inject a read-only fixture; the engine suite independently validates the real ledger.
  const chain = new (PostOfficeClient as any)(
    f.d,
    provider,
  ) as PostOfficeClient;
  vi.spyOn(chain, "readLetter").mockResolvedValue(f.envelope);
  vi.spyOn(chain, "validateDestination").mockResolvedValue(f.selected);
  const claim = () =>
    chain.claimPostbox(
      f.wallet,
      f.wallet.accounts[0],
      f.envelope,
      f.address,
      f.selected,
      f.storage,
    );
  return { ...f, chain, provider, claim };
}

test("the wallet challenge binds every payout field and uses canonical decimal amounts", async () => {
  const f = await connected(),
    challenge = postboxClaimChallenge(f.envelope, f.selected, 110);
  expect(JSON.parse(challenge)).toEqual([
    "gd-postbox-claim-1",
    38,
    f.d.registry,
    f.envelope.component,
    f.selected,
    nativeTari,
    "1000000",
    "100000",
    110,
  ]);
  for (const change of [
    { gift: "999999" },
    { reserve: "99999" },
    { component: `component_${"f".repeat(64)}` },
    { context: { ...f.d, registry: `component_${"9".repeat(64)}` } },
  ])
    expect(
      postboxClaimChallenge({ ...f.envelope, ...change }, f.selected, 110),
    ).not.toBe(challenge);
  expect(
    postboxClaimChallenge(f.envelope, `component_${"9".repeat(64)}`, 110),
  ).not.toBe(challenge);
  expect(postboxClaimChallenge(f.envelope, f.selected, 109)).not.toBe(
    challenge,
  );
  const proof = await f.wallet.authorizePostboxClaim(
    f.envelope,
    f.selected,
    110,
  );
  const tx = postboxProofClaimTransaction(
    f.envelope,
    f.selected,
    110,
    100,
    proof,
  );
  expect(tx.instructions).toEqual([]);
  expect(tx.fee_instructions).toHaveLength(1);
  expect(tx.max_epoch).toBe(110);
  expect(JSON.stringify(tx)).toContain("claim_with_wallet_proof_and_pay_fee");
  expect(f.request.mock.calls.map(([a]) => a.method)).not.toContain(
    "tari_createTransactionRequest",
  );
  expect(f.request.mock.calls.map(([a]) => a.method)).not.toContain(
    "tari_requestViewAccess",
  );
});
test.each([99, 111, Number.MAX_SAFE_INTEGER, NaN])(
  "invalid/expired proof window (%s) cannot create a transaction",
  async (expiry) => {
    const f = await connected(),
      p = await f.wallet.authorizePostboxClaim(f.envelope, f.selected, 110);
    expect(() =>
      postboxProofClaimTransaction(f.envelope, f.selected, expiry, 100, p),
    ).toThrow();
  },
);
test("unsafe epoch arithmetic and historical envelopes fail closed", async () => {
  const f = await connected(),
    p = await f.wallet.authorizePostboxClaim(f.envelope, f.selected, 110);
  expect(() =>
    postboxProofClaimTransaction(
      f.envelope,
      f.selected,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
      p,
    ),
  ).toThrow();
  await expect(
    f.wallet.authorizePostboxClaim(
      { ...f.envelope, claimProtocol: undefined },
      f.selected,
      110,
    ),
  ).rejects.toThrow("context");
  expect(
    postboxClaimsReady({ ...f.d, postboxClaimProtocol: undefined }, "sapient"),
  ).toBe(false);
  expect(
    postboxClaimsReady(
      { ...f.d, evidence: { ...f.d.evidence, postboxClaims: false } },
      "sapient",
    ),
  ).toBe(false);
});
test.each([
  "foreign address",
  "invalid scalar",
  "wallet rejection",
  "changed account",
  "changed network",
])("%s cannot reach broadcast or reserve a journal entry", async (caseName) => {
  const f = await chainFixture();
  if (caseName === "foreign address")
    f.setProof({
      walletAddress: "different",
      publicNonce: "12".repeat(32),
      signature: "23".repeat(32),
    });
  if (caseName === "invalid scalar")
    f.setProof({
      walletAddress: f.address,
      publicNonce: "12".repeat(32),
      signature: "FF".repeat(32),
    });
  if (caseName === "wallet rejection") f.setProof(new Error("User rejected"));
  if (caseName === "changed account")
    f.setSelected(`component_${"7".repeat(64)}`);
  if (caseName === "changed network") f.setNetwork("igor");
  await expect(f.claim()).rejects.toThrow();
  expect(f.provider.submitTransaction).not.toHaveBeenCalled();
  expect(readPending(f.storage)).toEqual([]);
});
test.each([
  "rejected",
  "too expensive",
  "negative fee",
  "fractional fee",
  "unsafe fee",
])("%s simulation prevents financial broadcast", async (caseName) => {
  const f = await chainFixture();
  simulation.mockResolvedValue({
    result: {
      finalize: {
        result:
          caseName === "rejected" ? { Reject: "bad proof" } : { Accept: {} },
        total_fees_required:
          caseName === "negative fee"
            ? "-1"
            : caseName === "fractional fee"
              ? 0.5
              : caseName === "unsafe fee"
                ? Number.MAX_SAFE_INTEGER + 1
                : "100001",
      },
    },
  });
  await expect(f.claim()).rejects.toThrow();
  expect(f.provider.submitTransaction).not.toHaveBeenCalled();
  expect(readPending(f.storage)).toEqual([]);
});

test.each(["account", "network"])(
  "a %s change while proof approval is pending prevents submission",
  async (changed) => {
    const f = await chainFixture();
    let finish!: (value: unknown) => void;
    f.setProof(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const result = f.claim();
    result.catch(() => {});
    await vi.waitFor(() =>
      expect(
        f.request.mock.calls.some(
          ([a]) => a.method === "tari_signWalletOwnershipChallenge",
        ),
      ).toBe(true),
    );
    if (changed === "account") f.setSelected(`component_${"7".repeat(64)}`);
    else f.setNetwork("igor");
    finish({
      walletAddress: f.address,
      publicNonce: "12".repeat(32),
      signature: "23".repeat(32),
    });
    await expect(result).rejects.toThrow();
    expect(simulation).not.toHaveBeenCalled();
    expect(f.provider.submitTransaction).not.toHaveBeenCalled();
    expect(readPending(f.storage)).toEqual([]);
  },
);

test.each(["account", "network"])(
  "a %s change during simulation invalidates the approved claim",
  async (changed) => {
    const f = await chainFixture();
    const successfulSimulation = simulation.getMockImplementation()!;
    simulation.mockImplementationOnce(async (...args: unknown[]) => {
      if (changed === "account") f.setSelected(`component_${"7".repeat(64)}`);
      else f.setNetwork("igor");
      return successfulSimulation(...args);
    });
    await expect(f.claim()).rejects.toThrow();
    expect(simulation).toHaveBeenCalledTimes(1);
    expect(f.provider.submitTransaction).not.toHaveBeenCalled();
    expect(readPending(f.storage)).toEqual([]);
  },
);
test("one proof approval submits a fee-only claim with declared dependencies and blocks retry", async () => {
  const f = await chainFixture();
  expect(await f.claim()).toBe("4".repeat(64));
  expect(simulation).toHaveBeenCalledTimes(1);
  expect(simulation).toHaveBeenCalledWith("transactions/dry-run", {
    transaction: expect.any(String),
  });
  const inputs = f.provider.resolveInputs.mock.calls[0][0];
  expect(inputs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ substate_id: f.d.registry, is_write: false }),
      expect.objectContaining({
        substate_id: f.envelope.component,
        is_write: true,
      }),
      expect.objectContaining({ substate_id: nativeTari, is_write: false }),
      expect.objectContaining({ substate_id: f.selected, is_write: true }),
    ]),
  );
  expect(readPending(f.storage)[0].state).toBe("submitted");
  await expect(f.claim()).rejects.toThrow("Reconcile");
  expect(f.provider.submitTransaction).toHaveBeenCalledTimes(1);
  expect(
    f.request.mock.calls.filter(
      ([a]) => a.method === "tari_signWalletOwnershipChallenge",
    ),
  ).toHaveLength(1);
});
test("lost broadcast response remains unknown and cannot replace the authorized claim", async () => {
  const f = await chainFixture();
  f.provider.submitTransaction.mockRejectedValue(new Error("Lost response"));
  await expect(f.claim()).rejects.toThrow("Lost response");
  expect(readPending(f.storage)[0].state).toBe("unknown");
  await expect(f.claim()).rejects.toThrow("Reconcile");
  expect(f.provider.submitTransaction).toHaveBeenCalledTimes(1);
});

test("concurrent guest preparations reserve only one claim before broadcast", async () => {
  const f = await chainFixture();
  const publicGift = { ...f.envelope, mode: "public" as const };
  vi.mocked(f.chain.readLetter).mockResolvedValue(publicGift);
  f.provider.submitTransaction.mockImplementation(async () => ({
    transaction_id: "4".repeat(64),
  }));
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      f.chain.claim(publicGift, f.address, f.selected, undefined, f.storage),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(f.provider.submitTransaction).toHaveBeenCalledTimes(1);
  expect(readPending(f.storage)).toHaveLength(1);
});

test("guest claim stops when another preparation reserves its gift during input resolution", async () => {
  const f = await chainFixture();
  const publicGift = { ...f.envelope, mode: "public" as const };
  vi.mocked(f.chain.readLetter).mockResolvedValue(publicGift);
  f.provider.resolveInputs.mockImplementationOnce(async (inputs) => {
    beginSubmission(f.storage, {
      network: f.d.network,
      registry: f.d.registry,
      envelopeId: publicGift.id,
      operation: "claim",
    });
    return inputs.map((i: any) => ({ ...i, version: 0 }));
  });
  await expect(
    f.chain.claim(publicGift, f.address, f.selected, undefined, f.storage),
  ).rejects.toThrow("existing submission");
  expect(f.provider.submitTransaction).not.toHaveBeenCalled();
  expect(readPending(f.storage)).toEqual([
    expect.objectContaining({ state: "unknown", envelopeId: publicGift.id }),
  ]);
});
