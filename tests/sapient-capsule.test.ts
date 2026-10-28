import { expect, test, vi } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import ledger from "./fixtures/capsule-carrier.json";
import {
  SapientCapsuleMailbox,
  verifyPermanentCarrier,
} from "../src/core/sapient-capsule";
import { encodeMailboxCapsule } from "../src/core/capsules";
import { mailboxKey, openMailbox, sealMailbox } from "../src/core/mailbox";
import { hex } from "../src/core/crypto";
import type { MailboxKey } from "../src/core/types";

const resource = Object.keys(ledger).find((id) => id.startsWith("resource_"))!;
const utxo = Object.keys(ledger).find((id) => id.startsWith("utxo_"))!;
const reference = { resource, commitment: utxo.slice(-64) };
const context = {
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  controller: "c".repeat(64),
  postbox: "stock-wallet",
  keyVersion: 1,
};
const account = {
  address: "unused-public-address",
  account: {
    component_address: `component_${"d".repeat(64)}`,
    owner_public_key: context.controller,
    name: "test",
    owner_key_id: null,
  },
};
async function fixture() {
  const pair = generateKeypair(),
    secret = pair.secret_key;
  pair.free();
  const encoded = await encodeMailboxCapsule(context, secret);
  secret.fill(0);
  const descriptor: MailboxKey = {
    ...encoded.descriptor,
    recovery: "sapient-capsule-1",
    capsule: reference,
  };
  let granted = true,
    cached = false;
  const read = vi.fn(async (id: string) => {
    const substate = ledger[id as keyof typeof ledger];
    if (!substate) throw new Error("Unknown substate");
    return structuredClone(substate);
  });
  const request = vi.fn(
    async (method: string, params?: unknown): Promise<unknown> => {
      if (method === "tari_getViewAccess") return { granted };
      if (method === "tari_getShieldedOutputs") {
        expect(params).toEqual({ resourceAddress: resource });
        return cached
          ? [
              {
                resourceAddress: resource,
                commitment: reference.commitment,
                amount: "1",
                memo: encoded.memo.Message,
              },
            ]
          : [];
      }
      if (method === "tari_claimPrivatePayment") {
        expect(params).toEqual({
          resourceAddress: resource,
          commitment: reference.commitment,
        });
        cached = true;
        return { amount: "1", memo: encoded.memo.Message };
      }
      throw new Error("Unexpected wallet method");
    },
  );
  const current = vi.fn(async () => {});
  return {
    descriptor,
    request,
    read,
    current,
    memo: encoded.memo,
    adapter: new SapientCapsuleMailbox(
      { network: 38, account, request, assertCurrent: current },
      read,
    ),
    grant: (value: boolean) => {
      granted = value;
    },
  };
}
test("restored capsule lookup works without cache and cached recovery still verifies the ledger", async () => {
  const f = await fixture(),
    letter = { subject: "restored", body: "complete addressed text" };
  const recovered = await f.adapter.recover(
    account.account.component_address,
    context,
    f.descriptor,
  );
  const payload = await sealMailbox(
    letter,
    context,
    "old-letter",
    f.descriptor,
  );
  expect(hex(recovered)).not.toBe("");
  recovered.fill(0);
  expect(
    await f.adapter.open(
      account.account.component_address,
      context,
      "old-letter",
      payload,
    ),
  ).toEqual(letter);
  expect(
    f.request.mock.calls.filter(
      ([method]) => method === "tari_claimPrivatePayment",
    ),
  ).toHaveLength(1);
  expect(f.read.mock.calls).toEqual([[resource], [utxo], [resource], [utxo]]);
  expect(
    f.request.mock.calls.every(
      ([method]) => !/sign|submit|scan|requestView/.test(method),
    ),
  ).toBe(true);
});
test("private access and wallet identity fail before capsule reads, without an implicit popup", async () => {
  const f = await fixture();
  f.grant(false);
  await expect(
    f.adapter.recover(account.account.component_address, context, f.descriptor),
  ).rejects.toThrow("account's private output summaries");
  expect(f.read).not.toHaveBeenCalled();
  expect(f.request.mock.calls.map(([method]) => method)).toEqual([
    "tari_getViewAccess",
  ]);
  f.request.mockClear();
  await expect(
    f.adapter.recover(
      account.account.component_address,
      { ...context, controller: "e".repeat(64) },
      f.descriptor,
    ),
  ).rejects.toThrow("controlling");
  expect(f.request).not.toHaveBeenCalled();
});
test("mutable resources, spendable outputs, missing outputs and frozen carriers cannot be recovered", async () => {
  for (const change of [
    (data: typeof ledger) => {
      (
        data[resource as keyof typeof ledger].state.up.substate as any
      ).Resource.owner_rule = "Owner";
    },
    (data: typeof ledger) => {
      (
        data[resource as keyof typeof ledger].state.up.substate as any
      ).Resource.access_rules.recall_updater = "Owner";
    },
    (data: typeof ledger) => {
      (
        data[utxo as keyof typeof ledger].state.up.substate as any
      ).Utxo.output.auth = "KeyPath";
    },
    (data: typeof ledger) => {
      (
        data[utxo as keyof typeof ledger].state.up.substate as any
      ).Utxo.output.auth.Script = "0".repeat(64);
    },
    (data: typeof ledger) => {
      (
        data[utxo as keyof typeof ledger].state.up.substate as any
      ).Utxo.is_frozen = true;
    },
    (data: typeof ledger) => {
      delete (data as any)[utxo];
    },
  ]) {
    const data = structuredClone(ledger);
    change(data);
    await expect(
      verifyPermanentCarrier(reference, async (id) => {
        const value = data[id as keyof typeof data];
        if (!value) throw new Error("Missing carrier");
        return value;
      }),
    ).rejects.toThrow();
  }
});
test("capsule reference survives key rotation and is authenticated in every historical envelope", async () => {
  const f = await fixture(),
    letter = { subject: "version one", body: "old reference remains usable" };
  const payload = await sealMailbox(letter, context, "history", f.descriptor);
  const pair = generateKeypair(),
    newerSecret = pair.secret_key;
  pair.free();
  const newer = await encodeMailboxCapsule(
    { ...context, keyVersion: 2 },
    newerSecret,
  );
  newerSecret.fill(0);
  const rotated = mailboxKey({
    ...newer.descriptor,
    recovery: "sapient-capsule-1",
    capsule: { ...reference, commitment: "e".repeat(64) },
  });
  expect(rotated.keyVersion).toBe(2);
  expect(payload.capsule).toEqual(reference);
  expect(
    await f.adapter.open(
      account.account.component_address,
      context,
      "history",
      payload,
    ),
  ).toEqual(letter);
  const secret = await f.adapter.recover(
    account.account.component_address,
    context,
    f.descriptor,
  );
  try {
    await expect(
      openMailbox(
        { ...payload, capsule: rotated.capsule },
        context,
        "history",
        secret,
      ),
    ).rejects.toThrow();
    await expect(
      openMailbox(
        { ...payload, recovery: undefined, capsule: undefined },
        context,
        "history",
        secret,
      ),
    ).rejects.toThrow();
  } finally {
    secret.fill(0);
  }
});
test("wrong capsule binding and revoked sessions cannot expose decrypted letters", async () => {
  const f = await fixture();
  await expect(
    f.adapter.recover(
      account.account.component_address,
      { ...context, postbox: "different" },
      f.descriptor,
    ),
  ).rejects.toThrow("does not match");
  f.current.mockRejectedValue(new Error("Session revoked"));
  await expect(
    f.adapter.recover(account.account.component_address, context, f.descriptor),
  ).rejects.toThrow("Session revoked");
});
test("new capsule descriptors reject missing references and legacy descriptors preserve their encoding", () => {
  const legacy = {
    version: "gd-postbox-1",
    keyVersion: 1,
    publicKey: "a".repeat(64),
    recovery: "native-memo-1",
  };
  expect(mailboxKey(legacy)).toEqual(legacy);
  expect(() =>
    mailboxKey({ ...legacy, recovery: "sapient-capsule-1" }),
  ).toThrow();
  expect(() => mailboxKey({ ...legacy, capsule: reference })).toThrow();
  expect(() =>
    mailboxKey({
      ...legacy,
      recovery: "sapient-capsule-1",
      capsule: { resource, commitment: "bad" },
    }),
  ).toThrow();
});
test("view revocation during wallet recovery prevents key disclosure", async () => {
  const f = await fixture(),
    implementation = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (method, params) => {
    const result = await implementation(method, params);
    if (method === "tari_claimPrivatePayment") f.grant(false);
    return result;
  });
  await expect(
    f.adapter.recover(account.account.component_address, context, f.descriptor),
  ).rejects.toThrow("private view access");
});

test.each([
  ["resource", resource],
  ["carrier", utxo],
])(
  "a stalled capsule %s lookup rejects without requesting private summaries and ignores late completion",
  async (_kind, target) => {
    const f = await fixture(),
      original = f.read.getMockImplementation()!;
    let release!: (value: Awaited<ReturnType<typeof f.read>>) => void;
    const stalled = new Promise<Awaited<ReturnType<typeof f.read>>>(
      (resolve) => (release = resolve),
    );
    f.read.mockImplementation(async (id) =>
      id === target ? stalled : original(id),
    );
    let settled: { error: string | null } | undefined;
    vi.useFakeTimers();
    const outcome = f.adapter
      .recover(account.account.component_address, context, f.descriptor)
      .then(
        (secret) => {
          secret.fill(0);
          settled = { error: null };
        },
        (error: Error) => {
          settled = { error: error.message };
        },
      );
    try {
      await vi.waitFor(() => expect(f.read).toHaveBeenCalledWith(target));
      await vi.advanceTimersByTimeAsync(15_001);
      expect(settled?.error).toContain("read timed out");
      expect(f.request.mock.calls.map(([method]) => method)).toEqual([
        "tari_getViewAccess",
      ]);
      release(structuredClone(ledger[target as keyof typeof ledger]));
      await outcome;
      expect(f.request.mock.calls.map(([method]) => method)).toEqual([
        "tari_getViewAccess",
      ]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      release(structuredClone(ledger[target as keyof typeof ledger]));
      await outcome;
      vi.useRealTimers();
    }
  },
);
