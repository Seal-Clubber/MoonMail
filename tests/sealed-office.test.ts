import { expect, test, vi } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import { decodeOffice } from "../src/core/chain";
import { emptyDeployment } from "../src/core/config";
import { SapientSession } from "../src/core/sapient";
import * as capsules from "../src/core/sapient-capsule";
import { sealPrivateMail } from "../src/core/sealed-mail";
import {
  SealedOfficeClient,
  decodeSealedOffice,
  decodeSealedLetter,
  sealedOfficeProfile,
  sealedWritesReady,
  sealedPublishTransaction,
  type SealedOfficeProfile,
} from "../src/core/sealed-office";
const profile: SealedOfficeProfile = {
  protocol: "moonmail-sealed-1",
  network: 38,
  registry: `component_${"aa".repeat(32)}`,
  template: "bb".repeat(32),
  indexerUrl: "https://indexer.example.test/json_rpc",
  resource: `resource_${"01".repeat(32)}`,
  recoveryResource: `resource_${"ee".repeat(32)}`,
  evidence: {
    engine: false,
    recovery: false,
    stockSapient: false,
    sentAndReplies: false,
    nativePrivatePostage: false,
  },
};
const id = "01".repeat(32),
  child = `component_${"02".repeat(32)}`,
  controller = "cc".repeat(32);
const root = (directory: Record<string, string> = {}): unknown[] => [
  38,
  {},
  {},
  `template_${profile.template}`,
  {},
  directory,
  [],
  0,
  [],
  [],
  profile.recoveryResource,
];
function storage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}
async function fixture(count = 1) {
  const pair = generateKeypair(),
    pub = hex(pair.public_key);
  pair.free();
  const descriptor = JSON.stringify({
    version: "gd-postbox-1",
    keyVersion: 1,
    publicKey: pub,
    recovery: "sapient-capsule-1",
    capsule: {
      resource: profile.recoveryResource,
      commitment: "ab".repeat(32),
    },
  });
  const sender = {
      id: "sender-private-box",
      nickname: "Sender",
      controller,
      encryptionKey: descriptor,
      discoverable: true,
    },
    recipient = {
      ...sender,
      id: "recipient-private-box",
      controller: "dd".repeat(32),
    };
  const payload = await sealPrivateMail(
    {
      version: "mm-message-1",
      sender: { postbox: sender.id, keyVersion: 1, publicKey: pub, controller },
      recipient: { postbox: recipient.id, keyVersion: 1, publicKey: pub },
      letter: { subject: "Private subject", body: "Private body" },
    },
    { ...profile, senderPublicKey: controller },
    id,
  );
  const refs = Array.from({ length: count }, (_, i) => ({
    id: (i + 1).toString(16).padStart(64, "0"),
    component: `component_${(i + 20).toString(16).padStart(64, "0")}`,
  }));
  const states = new Map<string, unknown>();
  const office = root(Object.fromEntries(refs.map((r) => [r.id, r.component])));
  office[2] = {
    [sender.id]: [
      sender.id,
      sender.nickname,
      sender.controller,
      sender.encryptionKey,
      true,
      [],
    ],
    [recipient.id]: [
      recipient.id,
      recipient.nickname,
      recipient.controller,
      recipient.encryptionKey,
      true,
      [],
    ],
  };
  states.set(profile.registry, office);
  for (const ref of refs)
    states.set(ref.component, [
      38,
      {},
      {},
      `template_${profile.template}`,
      {},
      {},
      [ref.id, 38, profile.registry, JSON.stringify(payload), controller],
      3,
      [],
      [],
      [],
    ]);
  const getSubstate = vi.fn(async (address: string) => {
    if (!states.has(address)) throw new Error("Missing fixture substate");
    return {
      version: 0,
      verified: false,
      state: {
        up: {
          substate: {
            Component: {
              header: {
                template_address: profile.template,
                owner_rule: "None",
              },
              body: { state: states.get(address) },
            },
          },
        },
      },
    };
  });
  const provider = {
    getSubstate,
    getCurrentEpoch: vi.fn(async () => 100),
    resolveInputs: vi.fn(async (inputs: any[]) =>
      inputs.map((i) => ({ ...i, version: 1 })),
    ),
  };
  const client = new (SealedOfficeClient as any)(
    profile,
    provider,
  ) as SealedOfficeClient;
  return { sender, recipient, payload, refs, office, states, provider, client };
}
test("V4 root has its own decoder and cannot silently enter the V3 positional codec", () => {
  const state = root({ [id]: child });
  expect(decodeSealedOffice(state, profile).sealedRefs).toEqual([
    { id, component: child },
  ]);
  const old = {
    ...emptyDeployment,
    ...profile,
    contractProtocol: "unified-1" as const,
    envelopeTemplate: profile.template,
    capsule: {
      template: profile.template,
      component: profile.registry,
      resource: profile.recoveryResource,
    },
    evidence: emptyDeployment.evidence,
  };
  expect(() => decodeOffice(state, old)).toThrow("unified");
  expect(() =>
    decodeSealedOffice(
      [
        38,
        {},
        {},
        `template_${profile.template}`,
        {},
        0,
        [],
        [],
        profile.recoveryResource,
      ],
      profile,
    ),
  ).toThrow("V4");
  for (const index of [0, 3, 6, 7, 8, 9, 10]) {
    const copy = structuredClone(state);
    copy[index] = index === 0 ? 36 : index === 7 ? 3 : "unexpected";
    expect(() => decodeSealedOffice(copy, profile)).toThrow();
  }
  const duplicate = structuredClone(state);
  duplicate[1] = { [id]: child };
  expect(() => decodeSealedOffice(duplicate, profile)).toThrow("combined");
});
test("profile is separate, HTTPS-only and never treats missing or partial evidence as activation", () => {
  expect(sealedWritesReady(sealedOfficeProfile(profile))).toBe(false);
  expect(() =>
    sealedOfficeProfile({ ...profile, protocol: "unified-1" }),
  ).toThrow();
  expect(() =>
    sealedOfficeProfile({
      ...profile,
      indexerUrl: "http://public.example.test",
    }),
  ).toThrow("HTTPS");
  expect(() =>
    sealedOfficeProfile({ ...profile, evidence: { engine: true } }),
  ).toThrow();
  for (const missing of [
    "engine",
    "recovery",
    "stockSapient",
    "sentAndReplies",
  ] as const)
    expect(
      sealedWritesReady({
        ...profile,
        evidence: {
          engine: true,
          recovery: true,
          stockSapient: true,
          sentAndReplies: true,
          nativePrivatePostage: true,
          [missing]: false,
        },
      }),
    ).toBe(false);
  const ready = {
    ...profile,
    evidence: {
      engine: true,
      recovery: true,
      stockSapient: true,
      sentAndReplies: true,
      nativePrivatePostage: false,
    },
  };
  expect(sealedWritesReady(ready)).toBe(false);
  expect(sealedWritesReady(ready, "transparent")).toBe(true);
});
test("bounded partial reads advance across missing letters, enforce identity and do not query recipient locators", async () => {
  const f = await fixture(3);
  f.states.delete(f.refs[1].component);
  await expect(f.client.readPage()).rejects.toThrow("Missing");
  const first = await f.client.readPage("", 2, { allowPartial: true });
  expect(first.entries.map((e) => e.id)).toEqual([f.refs[0].id]);
  expect(first.unavailableIds).toEqual([f.refs[1].id]);
  expect(first.nextCursor).toBe(f.refs[1].id);
  expect(
    (await f.client.readPage(first.nextCursor)).entries.map((e) => e.id),
  ).toEqual([f.refs[2].id]);
  for (const [address] of f.provider.getSubstate.mock.calls)
    expect(address.startsWith("component_")).toBe(true);
  const state = structuredClone(f.states.get(f.refs[0].component)) as any[];
  // Native CBOR omits trailing optional None fields on child components.
  expect(
    decodeSealedLetter(
      state.slice(0, 8),
      profile,
      f.refs[0].id,
      f.refs[0].component,
    ).payload,
  ).toEqual(f.payload);
  for (const [index, value] of [
    [0, 36],
    [1, { fake: child }],
    [5, { [id]: child }],
    [7, 1],
    [8, ["mixed"]],
    [10, profile.recoveryResource],
  ] as const) {
    const wrong = structuredClone(state);
    wrong[index] = value;
    expect(() =>
      decodeSealedLetter(wrong, profile, f.refs[0].id, f.refs[0].component),
    ).toThrow();
  }
  const wrong = structuredClone(state);
  wrong[6][2] = child;
  expect(() =>
    decodeSealedLetter(wrong, profile, f.refs[0].id, f.refs[0].component),
  ).toThrow("identity");
});
test("root trust checks stay strict, read cancellation and page limits fail before extra requests", async () => {
  const f = await fixture();
  for (const limit of [0, 51, 1.5])
    await expect(f.client.readPage("", limit)).rejects.toThrow("1..50");
  const abort = new AbortController();
  abort.abort();
  await expect(
    f.client.readPage("", 50, { signal: abort.signal }),
  ).rejects.toThrow();
  expect(f.provider.getSubstate).not.toHaveBeenCalled();
  f.provider.getSubstate.mockResolvedValueOnce({
    version: 0,
    verified: false,
    state: {
      up: {
        substate: {
          Component: {
            header: {
              template_address: profile.template,
              owner_rule: "ByPublicKey",
            },
            body: { state: f.office },
          },
        },
      },
    },
  });
  await expect(
    f.client.readPage("", 50, { allowPartial: true }),
  ).rejects.toThrow("Untrusted");
  await expect(f.client.readLetter("ff".repeat(32))).rejects.toThrow("Unknown");
});
test("publication includes ciphertext only and no gift withdrawal, and rechecks fresh mailbox keys before requesting any spend", async () => {
  const f = await fixture(0),
    tx = sealedPublishTransaction(profile, id, f.payload, child, "50000", 100);
  expect(tx.instructions).toHaveLength(1);
  const serialized = JSON.stringify(tx.instructions);
  expect(serialized).toContain("publish_sealed");
  expect(serialized).not.toContain("withdraw");
  for (const marker of [
    f.sender.id,
    f.recipient.id,
    "Private subject",
    "Private body",
  ])
    expect(serialized).not.toContain(marker);
  const wallet = Object.create(SapientSession.prototype) as SapientSession;
  Object.assign(wallet, {
    network: 38,
    accounts: [
      { account: { component_address: child, owner_public_key: controller } },
    ],
  });
  const submit = vi
    .spyOn(wallet, "submitOperation")
    .mockResolvedValue("ef".repeat(32));
  const review = {
    id,
    payload: f.payload,
    sender: f.sender,
    recipient: f.recipient,
  };
  await expect(
    f.client.publish(wallet, review, "50000", storage()),
  ).rejects.toThrow("disabled");
  expect(f.provider.getSubstate).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  const ready = {
    ...profile,
    evidence: {
      engine: true,
      recovery: true,
      stockSapient: true,
      sentAndReplies: true,
      nativePrivatePostage: true,
    },
  };
  const carriers = vi
    .spyOn(capsules, "verifyPermanentCarrier")
    .mockResolvedValue("verified-test-carrier");
  const active = new (SealedOfficeClient as any)(
    ready,
    f.provider,
  ) as SealedOfficeClient;
  await expect(
    active.publish(wallet, review, "50000", storage()),
  ).resolves.toBe("ef".repeat(32));
  expect(submit).toHaveBeenCalledTimes(1);
  expect(carriers).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[0][4]).toBe("private");
  const publicRequest = JSON.stringify(submit.mock.calls[0][0]);
  for (const marker of [f.sender.id, f.recipient.id, "Private subject"])
    expect(publicRequest).not.toContain(marker);
  const changed = structuredClone(f.office) as any[];
  changed[2][f.recipient.id][3] = JSON.stringify({
    ...JSON.parse(f.recipient.encryptionKey),
    keyVersion: 2,
    publicKey: "ef".repeat(32),
    capsule: {
      resource: profile.recoveryResource,
      commitment: "cd".repeat(32),
    },
  });
  changed[2][f.recipient.id][5] = [f.recipient.encryptionKey];
  f.states.set(profile.registry, changed);
  await expect(
    active.publish(wallet, review, "50000", storage()),
  ).rejects.toThrow("changed");
  expect(submit).toHaveBeenCalledTimes(1);
  carriers.mockRestore();
});
