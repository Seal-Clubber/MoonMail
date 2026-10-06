import { it, expect, vi } from "vitest";
import { emptyDeployment, writesReady } from "../src/core/config";
import { readPending } from "../src/core/pending";
import { publishDonorGift } from "../tools/keeper-submit";
import type { PostOfficeClient } from "../src/core/chain";
import type { WalletSession, WalletAccount } from "../src/core/wallet";
import type { Envelope } from "../src/core/types";

function fixture() {
  const deployment = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"1".repeat(64)}`,
    template: "2".repeat(64),
    envelopeTemplate: "3".repeat(64),
    resource: `resource_${"01".repeat(32)}`,
    indexerUrl: "https://fixture-indexer.invalid/",
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
    },
  };
  const funding = {
    account: {
      component_address: `component_${"4".repeat(64)}`,
      owner_public_key: "5".repeat(64),
      owner_key_id: { branch: "account", index: 0 },
    },
  } as unknown as WalletAccount;
  const envelope: Envelope = {
    id: "donor-gift",
    mode: "public",
    context: deployment,
    sender: funding.account.owner_public_key,
    campaign: "test",
    gift: "1000000",
    reserve: "100000",
    claimed: false,
    payload: { subject: "A test gift", body: "Funded by the local donor." },
  };
  const dry = vi.fn().mockResolvedValue({
    required_fees: "5000",
    result: { finalize: { result: { Accept: {} } } },
  });
  const submit = vi.fn().mockResolvedValue({ transaction_id: "6".repeat(64) });
  const wallet = {
    network: 38,
    accounts: [funding],
    submitDryRun: dry,
    submit,
  } as unknown as WalletSession;
  const chain = {
    deployment,
    provider: { getCurrentEpoch: vi.fn().mockResolvedValue(100) },
  } as unknown as PostOfficeClient;
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) || null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  } as unknown as Storage;
  const publish = () =>
    publishDonorGift(chain, wallet, funding, envelope, "100000", storage);
  return {
    deployment,
    funding,
    envelope,
    wallet,
    dry,
    submit,
    storage,
    publish,
  };
}

it("local donor submission works independently of the hosted wallet gate and blocks a duplicate", async () => {
  const f = fixture();
  expect(writesReady(f.deployment, "public")).toBe(false);
  expect(await f.publish()).toBe("6".repeat(64));
  expect(readPending(f.storage)).toEqual([
    expect.objectContaining({
      id: "6".repeat(64),
      state: "submitted",
      envelopeId: "donor-gift",
    }),
  ]);
  await expect(f.publish()).rejects.toThrow("Reconcile");
  expect(f.submit).toHaveBeenCalledTimes(1);
  expect(f.submit.mock.calls[0][0]).toMatchObject({
    seal_signer: f.funding.account.owner_key_id,
    other_signers: [f.funding.account.owner_key_id],
  });
});

it.each([
  { required_fees: "100001", result: { finalize: { result: { Accept: {} } } } },
  {
    required_fees: "5000",
    result: { finalize: { result: { Reject: "failure" } } },
  },
])(
  "simulation rejection or excessive fees cannot submit or reserve a broadcast",
  async (outcome) => {
    const f = fixture();
    f.dry.mockResolvedValue(outcome);
    await expect(f.publish()).rejects.toThrow("simulation");
    expect(f.submit).not.toHaveBeenCalled();
    expect(readPending(f.storage)).toEqual([]);
  },
);

it("a lost donor response retains unknown status and prevents a second broadcast", async () => {
  const f = fixture();
  f.submit.mockRejectedValue(new Error("Lost response"));
  await expect(f.publish()).rejects.toThrow("Lost response");
  expect(readPending(f.storage)[0]?.state).toBe("unknown");
  await expect(f.publish()).rejects.toThrow("Reconcile");
  expect(f.dry).toHaveBeenCalledTimes(1);
  expect(f.submit).toHaveBeenCalledTimes(1);
});

it("unverified rules and a wrong wallet network fail before signing", async () => {
  const f = fixture();
  f.deployment.evidence.engineClaims = false;
  await expect(f.publish()).rejects.toThrow("verified gift rules");
  f.deployment.evidence.engineClaims = true;
  Object.assign(f.wallet, { network: 16 });
  await expect(f.publish()).rejects.toThrow("matching wallet network");
  expect(f.dry).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});

it("a mismatched sender or private envelope cannot use the public donor route", async () => {
  const f = fixture();
  f.envelope.sender = "7".repeat(64);
  await expect(f.publish()).rejects.toThrow("public gift");
  f.envelope.sender = f.funding.account.owner_public_key;
  f.envelope.mode = "link";
  await expect(f.publish()).rejects.toThrow("public gift");
  expect(f.dry).not.toHaveBeenCalled();
  expect(f.submit).not.toHaveBeenCalled();
});
