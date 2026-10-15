import { test, expect } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import { sealLetter, openLetter, assertEnvelopeSize } from "../src/core/crypto";
import { sealMailbox, openMailbox } from "../src/core/mailbox";
import {
  emptyPreferences,
  toggleMark,
  setMarks,
  toggleFavourite,
  preferences,
  sealPreferences,
  openPreferences,
  READ,
  STAR,
  ARCHIVE,
} from "../src/core/mailbox-state";
import { mailboxStateTransaction } from "../src/core/transactions";
import {
  emptyDeployment,
  mailboxStateReady,
  letterLimit,
} from "../src/core/config";
import {
  beginSubmission,
  readPending,
  hasUnresolved,
} from "../src/core/pending";
import { activityDetails } from "../src/ui/activity-details";
const d = {
  ...emptyDeployment,
  contractProtocol: "unified-1" as const,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  envelopeTemplate: "b".repeat(64),
};
const c = { ...d, postbox: "home", controller: "c".repeat(64), keyVersion: 1 };
function keys() {
  const p = generateKeypair(),
    secret = p.secret_key,
    publicKey = hex(p.public_key);
  p.free();
  return {
    secret,
    descriptor: {
      version: "gd-postbox-1" as const,
      keyVersion: 1,
      publicKey,
      recovery: "sapient-capsule-1" as const,
      capsule: {
        resource: `resource_${"d".repeat(64)}`,
        commitment: "e".repeat(64),
      },
    },
  };
}
test("encrypted preferences recover on a fresh device, bind revision and registry, and contain no cleartext IDs", async () => {
  const { secret, descriptor } = keys();
  try {
    const input = {
      marks: [
        ["constructor", READ | STAR],
        ["__proto__", ARCHIVE],
      ] as [string, number][],
      favourites: ["trusted-home", "private-friend"],
      sort: "gift" as const,
      density: "compact" as const,
    };
    const sealed = await sealPreferences(
      input,
      c,
      "9007199254740993",
      descriptor,
    );
    expect(sealed).not.toContain("constructor");
    expect(sealed).not.toContain("__proto__");
    expect(sealed).not.toContain("compact");
    expect(sealed).not.toContain("trusted-home");
    expect(
      await openPreferences(
        sealed,
        c,
        "9007199254740993",
        new Uint8Array(secret),
      ),
    ).toEqual(preferences(input));
    for (const context of [
      { ...c, registry: `component_${"f".repeat(64)}` },
      { ...c, postbox: "work" },
      { ...c, controller: "f".repeat(64) },
    ])
      await expect(
        openPreferences(sealed, context, "9007199254740993", secret),
      ).rejects.toThrow();
    await expect(
      openPreferences(sealed, c, "9007199254740994", secret),
    ).rejects.toThrow();
    const p = JSON.parse(sealed);
    p.ciphertext =
      (p.ciphertext.startsWith("A") ? "B" : "A") + p.ciphertext.slice(1);
    await expect(
      openPreferences(JSON.stringify(p), c, "9007199254740993", secret),
    ).rejects.toThrow();
  } finally {
    secret.fill(0);
  }
});
test("marks are bounded, independent, prototype-safe and reject damaged snapshots", () => {
  let p = toggleMark(emptyPreferences(), "__proto__", STAR);
  p = toggleMark(p, "__proto__", READ);
  p = toggleMark(p, "constructor", ARCHIVE);
  expect(new Map(p.marks).get("__proto__")).toBe(3);
  expect(toggleMark(p, "__proto__", STAR).marks).toContainEqual([
    "__proto__",
    READ,
  ]);
  for (const marks of [
    [
      ["same", 1],
      ["same", 2],
    ],
    [["x", 8]],
    [["", 1]],
    [["x", 0]],
    Array.from({ length: 513 }, (_, i) => [String(i), 1]),
  ])
    expect(() => preferences({ ...p, marks })).toThrow();
  expect(() => toggleMark(p, "x", 8)).toThrow();
});
test("long public, private-link and postbox payloads require the new deployment limit", async () => {
  const letter = { subject: "Long letter", body: "A".repeat(16000) };
  expect(() => assertEnvelopeSize(letter)).toThrow();
  expect(() => assertEnvelopeSize(letter, 32768)).not.toThrow();
  await expect(sealLetter(letter, d, "long")).rejects.toThrow("4 KiB");
  const sealed = await sealLetter(letter, d, "long", letterLimit(d));
  expect(
    (
      await openLetter(
        sealed.payload,
        sealed.capability,
        d,
        "long",
        letterLimit(d),
      )
    ).letter,
  ).toEqual(letter);
  const { secret, descriptor } = keys();
  try {
    await expect(sealMailbox(letter, c, "long", descriptor)).rejects.toThrow(
      "4 KiB",
    );
    const p = await sealMailbox(letter, c, "long", descriptor, 32768);
    expect(await openMailbox(p, c, "long", secret)).toEqual(letter);
  } finally {
    secret.fill(0);
  }
  expect(() => assertEnvelopeSize({ body: "👻".repeat(10000) }, 32768)).toThrow(
    "32 KiB",
  );
});
test("sealed and existing offices build settings transactions without changing the exact revision", () => {
  for (const contractProtocol of ["unified-1", "unified-2"] as const) {
    const profile = { ...d, contractProtocol };
    const initial = mailboxStateTransaction(
      profile,
      `component_${"f".repeat(64)}`,
      "100000",
      50,
      "home",
      "opaque",
      "0",
    );
    expect(initial.instructions[0]).toHaveProperty(
      "CallMethod.method",
      "open_mailbox",
    );
    const update = mailboxStateTransaction(
      profile,
      `component_${"f".repeat(64)}`,
      "100000",
      50,
      "home",
      "opaque",
      "9007199254740993",
      `component_${"e".repeat(64)}`,
    );
    expect(update.instructions[0]).toHaveProperty(
      "CallMethod.method",
      "set_ciphertext",
    );
    expect(update.instructions[0]).toEqual(
      mailboxStateTransaction(
        d,
        `component_${"f".repeat(64)}`,
        "100000",
        50,
        "home",
        "opaque",
        "9007199254740993",
        `component_${"e".repeat(64)}`,
      ).instructions[0],
    );
  }
});
test("new state transaction preserves exact u64 revision and journal blocks a replacement", () => {
  const tx = mailboxStateTransaction(
    d,
    `component_${"f".repeat(64)}`,
    "100000",
    50,
    "home",
    "opaque",
    "9007199254740993",
    `component_${"e".repeat(64)}`,
  );
  expect(tx.instructions).toHaveLength(1);
  expect(tx.instructions[0]).toHaveProperty(
    "CallMethod.method",
    "set_ciphertext",
  );
  expect(tx.fee_instructions).toHaveLength(1);
  expect(mailboxStateReady(d)).toBe(false);
  expect(() =>
    mailboxStateTransaction(
      { ...d, contractProtocol: undefined },
      "a",
      "1",
      1,
      "home",
      "opaque",
      "0",
    ),
  ).toThrow();
  const data = new Map<string, string>(),
    storage = {
      getItem: (key: string) => data.get(key) || null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
  beginSubmission(storage, {
    network: d.network,
    registry: d.registry,
    operation: "mailbox",
    envelopeId: "mailbox:home",
  });
  expect(hasUnresolved(storage, d.network, d.registry, "mailbox:home")).toBe(
    true,
  );
  expect(() =>
    beginSubmission(storage, {
      network: d.network,
      registry: d.registry,
      operation: "mailbox",
      envelopeId: "mailbox:home",
    }),
  ).toThrow();
  expect(activityDetails(readPending(storage)[0]).title).toBe(
    "Save mailbox changes",
  );
});

test("the client decodes real engine BOR state and rejects wrong component roles and bindings", async () => {
  const { default: f } = await import("./fixtures/engine-unified-mailbox.json");
  const { decodeOffice, decodeMailboxState, taggedAddress } =
    await import("../src/core/chain");
  const { officeProfile } = await import("../src/core/office-profile");
  const rawResource = taggedAddress(f.rootState[8], "resource");
  const deployment = {
    ...d,
    registry: f.registry,
    template: f.template.replace(/^template_/, ""),
    envelopeTemplate: f.template.replace(/^template_/, ""),
    capsule: {
      template: f.template.replace(/^template_/, ""),
      component: f.registry,
      resource: rawResource,
    },
  };
  const office = decodeOffice(f.rootState, deployment),
    box = office.postboxes[0];
  expect(box.controller).toBe(f.controller);
  expect(office.mailboxRefs).toEqual([{ id: "home", component: f.component }]);
  expect(decodeMailboxState(f.mailboxState, deployment, box)).toEqual({
    revision: "2",
    ciphertext: "encrypted-revision-two",
  });
  expect(() => decodeMailboxState(f.rootState, deployment, box)).toThrow();
  expect(() =>
    decodeMailboxState(
      f.mailboxState,
      { ...deployment, registry: d.registry },
      box,
    ),
  ).toThrow();
  expect(() =>
    decodeMailboxState(f.mailboxState, deployment, {
      ...box,
      controller: "f".repeat(64),
    }),
  ).toThrow();
  expect(() => decodeOffice(f.mailboxState, deployment)).toThrow();
  expect(() =>
    officeProfile({
      ...deployment,
      capsule: { ...deployment.capsule, template: "f".repeat(64) },
    }),
  ).toThrow();
});

test("real Esmeralda persisted empty optional arrays preserve office identity", async () => {
  const { default: live } =
    await import("./fixtures/esmeralda-unified-root-persisted.json");
  const { decodeOffice } = await import("../src/core/chain");
  const deployment = {
    ...d,
    network: 38 as const,
    registry: live.registry,
    template: live.template,
    envelopeTemplate: live.template,
    capsule: {
      template: live.template,
      component: live.registry,
      resource: live.resource,
    },
  };
  expect(decodeOffice(live.state, deployment)).toEqual({
    letterRefs: [],
    postboxes: [],
    mailboxRefs: [],
  });
  const malformed: unknown[] = structuredClone(live.state);
  malformed[6] = [[]];
  expect(() => decodeOffice(malformed, deployment)).toThrow(
    "Invalid unified post office",
  );
});

test("persisted empty optional arrays remain absent in mailbox state", async () => {
  const { default: f } = await import("./fixtures/engine-unified-mailbox.json");
  const { decodeOffice, decodeMailboxState, taggedAddress } =
    await import("../src/core/chain");
  const template = f.template.replace(/^template_/, "");
  const deployment = {
    ...d,
    registry: f.registry,
    template,
    envelopeTemplate: template,
    capsule: {
      template,
      component: f.registry,
      resource: taggedAddress(f.rootState[8], "resource"),
    },
  };
  const office = decodeOffice(f.rootState, deployment);
  const state: unknown[] = structuredClone(f.mailboxState);
  state[6] = [];
  if (state.length === 9) state[8] = [];
  expect(decodeMailboxState(state, deployment, office.postboxes[0])).toEqual({
    revision: "2",
    ciphertext: "encrypted-revision-two",
  });
  state[6] = [[]];
  expect(() =>
    decodeMailboxState(state, deployment, office.postboxes[0]),
  ).toThrow();
});

test("bulk actions set rather than toggle flags, preserve other marks and reject excess atomically", () => {
  let p = toggleMark(emptyPreferences(), "one", STAR | 0);
  p = setMarks(p, ["one", "two"], READ, true);
  expect(p.marks).toEqual([
    ["one", READ | STAR],
    ["two", READ],
  ]);
  expect(setMarks(p, ["one", "two"], READ, true)).toEqual(p);
  expect(setMarks(p, ["one", "two"], READ, false).marks).toEqual([
    ["one", STAR],
  ]);
  expect(() =>
    setMarks(
      p,
      Array.from({ length: 513 }, (_, i) => `mail-${i}`),
      ARCHIVE,
      true,
    ),
  ).toThrow();
  expect(p.marks).toHaveLength(2);
  expect(() => setMarks(p, ["x"], 8, true)).toThrow();
});
test("legacy settings accept favourites defaults while damaged or excess contacts are rejected", () => {
  expect(preferences(emptyPreferences()).favourites).toEqual([]);
  const p = toggleFavourite(emptyPreferences(), "__proto__");
  expect(p.favourites).toEqual(["__proto__"]);
  expect(toggleFavourite(p, "__proto__").favourites).toEqual([]);
  for (const favourites of [
    ["same", "same"],
    [""],
    [3],
    "friend",
    Array.from({ length: 129 }, (_, i) => `friend-${i}`),
  ])
    expect(() => preferences({ ...p, favourites })).toThrow();
});
