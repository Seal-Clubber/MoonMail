import { expect, test, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import {
  NativeMailboxAdapter,
  denyAllCarrierRoot,
  nativeTariResource,
} from "../src/core/native-mailbox";
import { encodeMailboxCapsule } from "../src/core/capsules";
import { sealMailbox, mailboxKey } from "../src/core/mailbox";
import { hex } from "../src/core/crypto";
import { readPending } from "../src/core/pending";
import type { WalletAccount } from "../src/core/wallet";
import type { WalletSession } from "../src/core/wallet";
import { PostOfficeClient } from "../src/core/chain";
import { IndexerProvider } from "@tari-project/ootle-indexer";
import { savePending, capsuleIdentity } from "../src/core/pending";

type Client = ConstructorParameters<typeof NativeMailboxAdapter>[0];
type Output = Awaited<ReturnType<Client["stealthUtxosList"]>>["utxos"][number];
function fixture() {
  const owner = generateKeypair(),
    view = generateKeypair();
  const controller = hex(owner.public_key);
  const account = {
    account: {
      name: "test",
      component_address: `component_${"d".repeat(64)}`,
      owner_public_key: controller,
      owner_key_id: null,
    },
    address: generateOotleAddress(owner.public_key, view.public_key, 16),
  } as WalletAccount;
  owner.free();
  view.free();
  const context = {
    network: 16,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    controller,
    postbox: "native-test",
    keyVersion: 1,
  };
  let token = "test-session";
  const transfer = vi
    .fn<Client["stealthTransfer"]>()
    .mockResolvedValue({ transaction_id: "1".repeat(64) });
  const list = vi
    .fn<Client["stealthUtxosList"]>()
    .mockResolvedValue({ utxos: [] });
  const result = vi.fn<Client["getTransactionResult"]>().mockResolvedValue({
    transaction_id: "1".repeat(64),
    status: "DryRun",
    result: { result: { Accept: {} }, total_fees_required: 10n },
  } as unknown as Awaited<ReturnType<Client["getTransactionResult"]>>);
  const client: Client = {
    getToken: () => token,
    stealthTransfer: transfer,
    stealthUtxosList: list,
    getTransactionResult: result,
  };
  let journal = "";
  const storage = {
    getItem: () => journal || null,
    setItem: (_key: string, value: string) => {
      journal = value;
    },
    get length() {
      return journal ? 1 : 0;
    },
    clear: () => {
      journal = "";
    },
    removeItem: () => {
      journal = "";
    },
    key: (index: number) =>
      index === 0 && journal ? "ghostdrop:pending:v1" : null,
  } satisfies Storage;
  return {
    account,
    context,
    client,
    transfer,
    list,
    result,
    storage,
    journal: () => journal,
    session: (value: string) => {
      token = value;
    },
    adapter: () => new NativeMailboxAdapter(client, [account], 16),
  };
}
async function capsule(context: ReturnType<typeof fixture>["context"]) {
  const pair = generateKeypair(),
    secret = pair.secret_key;
  pair.free();
  try {
    const encoded = await encodeMailboxCapsule(context, secret);
    return {
      ...encoded,
      descriptor: { ...encoded.descriptor, recovery: "native-memo-1" as const },
    };
  } finally {
    secret.fill(0);
  }
}
async function output(memo: Output["memo"]): Promise<Output> {
  return {
    address: { resource_address: nativeTariResource, id: "e".repeat(64) },
    value: 1n,
    status: "Unspent",
    memo,
    sender_address: null,
    auth: { Script: await denyAllCarrierRoot() },
    is_burnt: true,
    is_frozen: false,
    is_on_chain: true,
  };
}

test("standard adapter restores historical keys and distinct postboxes, skipping unsafe carriers", async () => {
  const f = fixture(),
    first = await capsule(f.context),
    secondContext = { ...f.context, keyVersion: 2 },
    second = await capsule(secondContext),
    otherContext = { ...f.context, postbox: "second-box" },
    other = await capsule(otherContext);
  const original = await output(first.memo);
  f.list.mockResolvedValue({
    utxos: [
      { ...original, is_on_chain: false },
      { ...original, value: 2n },
      { ...original, auth: { Key: f.context.controller } },
      {
        ...original,
        auth: { Script: await denyAllCarrierRoot(), Key: f.context.controller },
      },
      {
        ...original,
        auth: {
          KeyAndScript: {
            spend_key: f.context.controller,
            condition_root: await denyAllCarrierRoot(),
          },
        },
      },
      await output(second.memo),
      await output(other.memo),
      original,
    ],
  });
  for (const [context, key] of [
    [f.context, first],
    [secondContext, second],
    [otherContext, other],
  ] as const) {
    const letter = {
      subject: `Version ${context.keyVersion}`,
      body: `Full ${context.postbox} message`,
    };
    const payload = await sealMailbox(
      letter,
      context,
      "mail-id",
      key.descriptor,
    );
    expect(payload.recovery).toBe("native-memo-1");
    expect(
      await f
        .adapter()
        .open(f.account.account.component_address, context, "mail-id", payload),
    ).toEqual(letter);
  }
  expect(f.list).toHaveBeenCalledWith({
    resource_address: nativeTariResource,
    account_address: f.account.account.component_address,
    filter_by_status: null,
  });
  expect(f.transfer).not.toHaveBeenCalled();
  f.list.mockResolvedValue({ utxos: [{ ...original, is_on_chain: false }] });
  await expect(
    f
      .adapter()
      .recover(
        f.account.account.component_address,
        f.context,
        first.descriptor,
      ),
  ).rejects.toThrow("No matching confirmed");
});

test("wrong public key, controller and memo-read permission cannot expose recovery contents", async () => {
  const f = fixture(),
    good = await capsule(f.context),
    wrong = await capsule(f.context);
  f.list.mockResolvedValue({ utxos: [await output(good.memo)] });
  await expect(
    f
      .adapter()
      .recover(
        f.account.account.component_address,
        f.context,
        wrong.descriptor,
      ),
  ).rejects.toThrow("No matching");
  await expect(
    f
      .adapter()
      .recover(
        f.account.account.component_address,
        { ...f.context, controller: "f".repeat(64) },
        good.descriptor,
      ),
  ).rejects.toThrow("controlling");
  f.list.mockRejectedValue(new Error(good.memo.Message));
  await expect(
    f
      .adapter()
      .recover(f.account.account.component_address, f.context, good.descriptor),
  ).rejects.toThrow(/^Cannot read recovery memos/);
  expect(f.journal()).toBe("");
});

test("disconnect or API-key replacement invalidates in-flight memo recovery", async () => {
  const f = fixture(),
    good = await capsule(f.context),
    utxo = await output(good.memo);
  for (const session of ["", "replacement-session"]) {
    f.session("initial");
    f.list.mockImplementation(async () => {
      f.session(session);
      return { utxos: [utxo] };
    });
    await expect(
      f
        .adapter()
        .recover(
          f.account.account.component_address,
          f.context,
          good.descriptor,
        ),
    ).rejects.toThrow("session changed");
  }
});

test("setup uses only standard transfers, locks one microTARI and journals only public metadata", async () => {
  const f = fixture();
  f.transfer.mockImplementation(async (req) => {
    if (!req.dry_run) expect(readPending(f.storage)[0].state).toBe("unknown");
    return { transaction_id: (req.dry_run ? "1" : "2").repeat(64) };
  });
  const stored = await f
    .adapter()
    .store(f.account.account.component_address, f.context, "100", f.storage);
  expect(f.transfer).toHaveBeenCalledTimes(2);
  const request = f.transfer.mock.calls[1][0];
  expect(request.max_fee).toBe("100");
  expect(request.transfers[0]).toMatchObject({
    blinded_output_amount: "1",
    revealed_output_amount: "0",
    pay_to: { AccessRule: "DenyAll" },
  });
  const memo = request.transfers[0].output_memo! as { Message: string };
  const secret = JSON.parse(memo.Message)[3];
  expect(f.journal()).not.toContain(secret);
  expect(f.journal()).not.toContain(memo.Message);
  expect(readPending(f.storage)[0]).toMatchObject({
    state: "submitted",
    id: "2".repeat(64),
    capsule: stored.capsule,
  });
  expect(mailboxKey(stored.capsule.descriptor).recovery).toBe("native-memo-1");
  f.list.mockResolvedValue({ utxos: [await output(memo)] });
  const restored = await f
    .adapter()
    .recover(
      f.account.account.component_address,
      f.context,
      stored.capsule.descriptor,
    );
  expect(hex(restored)).toBe(secret);
  restored.fill(0);
});

test("uncertain broadcast survives reload and blocks a second key or transfer", async () => {
  const f = fixture();
  let memo = "";
  f.transfer.mockImplementation(async (req) => {
    memo = (req.transfers[0].output_memo as { Message: string }).Message;
    if (req.dry_run) return { transaction_id: "1".repeat(64) };
    throw new Error(memo);
  });
  await expect(
    f
      .adapter()
      .store(f.account.account.component_address, f.context, "100", f.storage),
  ).rejects.toThrow(/^Recovery transfer response is uncertain/);
  const pending = readPending(f.storage)[0];
  expect(pending.state).toBe("unknown");
  expect(pending.id).toMatch(/^attempt:/);
  expect(f.journal()).not.toContain(JSON.parse(memo)[3]);
  f.session("new-scoped-key");
  await expect(
    f
      .adapter()
      .store(f.account.account.component_address, f.context, "100", f.storage),
  ).rejects.toThrow("already exists");
  expect(f.transfer).toHaveBeenCalledTimes(2);
});

test("failed, unreadable or over-cap simulation never broadcasts or persists a capsule", async () => {
  for (const mode of ["denied", "unreadable", "over-cap"]) {
    const f = fixture();
    if (mode === "denied")
      f.transfer.mockRejectedValue(new Error("private details"));
    else if (mode === "unreadable")
      f.result.mockRejectedValue(new Error("private details"));
    await expect(
      f
        .adapter()
        .store(
          f.account.account.component_address,
          f.context,
          mode === "over-cap" ? "1" : "100",
          f.storage,
        ),
    ).rejects.toThrow(/^Recovery transfer simulation failed/);
    expect(f.transfer).toHaveBeenCalledTimes(1);
    expect(f.transfer.mock.calls[0][0].dry_run).toBe(true);
    expect(f.journal()).toBe("");
  }
});

test("session changes during dry run cannot authorize a subsequent broadcast", async () => {
  const f = fixture();
  f.transfer.mockImplementation(async () => {
    f.session("new-session");
    return { transaction_id: "1".repeat(64) };
  });
  await expect(
    f
      .adapter()
      .store(f.account.account.component_address, f.context, "100", f.storage),
  ).rejects.toThrow("session changed");
  expect(f.transfer).toHaveBeenCalledTimes(1);
  expect(f.journal()).toBe("");
});

test("overlapping dry runs for one postbox version cannot broadcast two recovery keys", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f
      .adapter()
      .store(f.account.account.component_address, f.context, "100", f.storage),
    f
      .adapter()
      .store(f.account.account.component_address, f.context, "100", f.storage),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    f.transfer.mock.calls.filter(([request]) => !request.dry_run),
  ).toHaveLength(1);
  expect(readPending(f.storage)).toHaveLength(1);
});

test("registry publication requires confirmed matching setup and a fresh native recovery read", async () => {
  const f = fixture(),
    key = await capsule(f.context);
  const deployment = {
    ...f.context,
    envelopeTemplate: "f".repeat(64),
    resource: nativeTariResource,
    indexerUrl: "http://localhost:15910",
    evidence: {
      engineClaims: true,
      guestPayout: true,
      daemonScopes: true,
      httpsWallet: true,
      mailboxRecovery: true,
    },
  };
  const provider = { getCurrentEpoch: vi.fn().mockResolvedValue(100) };
  const connection = vi
    .spyOn(IndexerProvider, "connect")
    .mockResolvedValue(provider as unknown as IndexerProvider);
  const recover = vi
    .fn()
    .mockRejectedValue(new Error("No matching confirmed recovery memo"));
  const submit = vi.fn(),
    dryRun = vi.fn();
  const wallet = {
    network: 16,
    nativeMailbox: () => ({ recover }),
    submit,
    submitDryRun: dryRun,
  } as unknown as WalletSession;
  const account = {
    ...f.account,
    account: {
      ...f.account.account,
      owner_key_id: { Imported: { local_key_id: 1 } },
    },
  } as WalletAccount;
  const box = {
    id: f.context.postbox,
    nickname: "test",
    controller: f.context.controller,
    discoverable: true,
    encryptionKey: JSON.stringify(key.descriptor),
  };
  try {
    const office = await PostOfficeClient.connect(deployment);
    await expect(
      office.savePostbox(wallet, account, box, "create", "100", f.storage),
    ).rejects.toThrow("Resume a confirmed");
    const p = {
      id: "2".repeat(64),
      network: 16,
      registry: f.context.registry,
      operation: "capsule" as const,
      state: "submitted" as const,
      envelopeId: capsuleIdentity(f.context),
      capsule: {
        account: account.account.component_address,
        context: f.context,
        descriptor: key.descriptor,
      },
    };
    savePending(f.storage, p);
    await expect(
      office.savePostbox(wallet, account, box, "create", "100", f.storage),
    ).rejects.toThrow("Confirm the recovery transaction");
    savePending(f.storage, { ...p, state: "confirmed" });
    await expect(
      office.savePostbox(wallet, account, box, "create", "100", f.storage),
    ).rejects.toThrow("No matching confirmed recovery memo");
    expect(recover).toHaveBeenCalledTimes(1);
    expect(dryRun).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    const secret = new Uint8Array(32).fill(7);
    recover.mockResolvedValue(secret);
    dryRun.mockResolvedValue({
      result: { finalize: { result: { Accept: {} } } },
      required_fees: 5n,
    });
    submit.mockResolvedValue({ transaction_id: "3".repeat(64) });
    expect(
      await office.savePostbox(
        wallet,
        account,
        box,
        "create",
        "100",
        f.storage,
      ),
    ).toBe("3".repeat(64));
    expect(secret.every((b) => b === 0)).toBe(true);
    expect(
      readPending(f.storage).some(
        (p) => p.operation === "postbox" && p.state === "submitted",
      ),
    ).toBe(true);
    const requests = submit.mock.calls[0][0];
    expect(JSON.stringify(requests)).not.toContain("0707070707");
  } finally {
    connection.mockRestore();
  }
});
