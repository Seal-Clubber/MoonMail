import { expect, test, vi } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import {
  sealPrivateMail,
  sealedPayloadHash,
  type SealedMessage,
} from "../src/core/sealed-mail";
import {
  recoveredSealedEnvelope,
  preserveSealedViews,
  verifySealedPublication,
} from "../src/core/sealed-view";
import { readDelivery } from "../src/core/delivery";
import {
  hasUnresolved,
  inspectPending,
  type Pending,
} from "../src/core/pending";
import { emptyDeployment, writesReady } from "../src/core/config";
import { officeProfile } from "../src/core/office-profile";
import { publishTransaction } from "../src/core/transactions";
const context = {
    network: 38,
    registry: `component_${"aa".repeat(32)}`,
    template: "bb".repeat(32),
  },
  id = "01".repeat(32);
async function fixture() {
  const pair = generateKeypair(),
    pub = hex(pair.public_key);
  pair.free();
  const sender = {
      id: "sender",
      nickname: "Sender",
      controller: "cc".repeat(32),
      encryptionKey: JSON.stringify({
        version: "gd-postbox-1",
        keyVersion: 1,
        publicKey: pub,
      }),
      discoverable: true,
    },
    recipient = {
      ...sender,
      id: "recipient",
      nickname: "Recipient",
      controller: "dd".repeat(32),
    };
  const message: SealedMessage = {
    version: "mm-message-1",
    sender: {
      postbox: sender.id,
      controller: sender.controller,
      keyVersion: 1,
      publicKey: pub,
    },
    recipient: { postbox: recipient.id, keyVersion: 1, publicKey: pub },
    letter: {
      subject: "Encrypted display",
      body: "Only the decrypted local view contains these words.",
    },
  };
  const payload = await sealPrivateMail(
      message,
      { ...context, senderPublicKey: sender.controller },
      id,
    ),
    entry = {
      id,
      payload,
      senderPublicKey: sender.controller,
      component: `component_${"ee".repeat(32)}`,
    },
    opened = { id, message, inbox: true, sent: false };
  const envelope = recoveredSealedEnvelope(
    entry,
    opened,
    [sender, recipient],
    context,
  );
  const pending: Pending = {
    id: "ff".repeat(32),
    operation: "publish",
    envelopeId: id,
    network: 38,
    registry: context.registry,
    state: "submitted",
    sealedBinding: {
      sender: sender.controller,
      payloadHash: await sealedPayloadHash(payload),
    },
  };
  return { sender, recipient, message, entry, opened, envelope, pending };
}
test("local mail routing can display verified contacts but cannot invent a sender nickname from decrypted claims", async () => {
  const f = await fixture();
  expect(f.envelope).toMatchObject({
    replyPostbox: f.sender.id,
    recipientPostbox: f.recipient.id,
    claimAuthority: f.recipient.controller,
  });
  const untrusted = recoveredSealedEnvelope(
    f.entry,
    f.opened,
    [{ ...f.sender, controller: f.recipient.controller }, f.recipient],
    context,
  );
  expect(untrusted.replyPostbox).toBeUndefined();
  expect(JSON.stringify(f.envelope.payload)).not.toContain(f.sender.id);
  expect(JSON.stringify(f.envelope.payload)).not.toContain(
    f.message.letter.body,
  );
  expect(() =>
    recoveredSealedEnvelope(
      { ...f.entry, senderPublicKey: f.recipient.controller },
      f.opened,
      [f.sender, f.recipient],
      context,
    ),
  ).toThrow("identity");
});
test("refresh preserves local routing only for the exact immutable ciphertext and deployment", async () => {
  const f = await fixture(),
    raw = {
      ...f.envelope,
      localAccess: undefined,
      replyPostbox: undefined,
      recipientPostbox: undefined,
      claimAuthority: undefined,
    };
  expect(preserveSealedViews([f.envelope], [raw])[0]).toMatchObject({
    localAccess: f.envelope.localAccess,
    replyPostbox: f.sender.id,
  });
  for (const changed of [
    { ...raw, sender: f.recipient.controller },
    { ...raw, context: { ...context, network: 36 } },
    { ...raw, component: context.registry },
  ])
    expect(
      preserveSealedViews([f.envelope], [changed])[0].localAccess,
    ).toBeUndefined();
  const altered = {
    ...raw,
    payload: { ...f.entry.payload, iv: "A".repeat(16) },
  };
  expect(
    preserveSealedViews([f.envelope], [altered])[0].localAccess,
  ).toBeUndefined();
});
test("lost publication responses require the original signer, deployment and ciphertext hash before confirmation", async () => {
  const f = await fixture();
  await verifySealedPublication(f.pending, f.envelope);
  for (const changed of [
    { ...f.envelope, sender: f.recipient.controller },
    { ...f.envelope, id: "02".repeat(32) },
    { ...f.envelope, context: { ...context, registry: f.entry.component } },
    {
      ...f.envelope,
      payload: {
        ...f.entry.payload,
        slots: [...f.entry.payload.slots].reverse(),
      },
    },
  ])
    await expect(verifySealedPublication(f.pending, changed)).rejects.toThrow(
      "original submission",
    );
  const reconcile = vi.fn(async () => ({ outcome: "Commit" as const })),
    readLetter = vi.fn(async () => f.envelope);
  expect((await readDelivery({ reconcile, readLetter }, f.pending)).state).toBe(
    "confirmed",
  );
  readLetter.mockResolvedValueOnce({
    ...f.envelope,
    sender: f.recipient.controller,
  });
  await expect(
    readDelivery({ reconcile, readLetter }, f.pending),
  ).rejects.toThrow("do not send a replacement");
  expect(f.pending.state).toBe("submitted");
  await expect(readDelivery({ reconcile }, f.pending)).rejects.toThrow(
    "original sealed letter",
  );
});
test("a damaged sealed publication journal blocks spending and never discards its original bytes", async () => {
  const f = await fixture(),
    original = JSON.stringify([
      {
        ...f.pending,
        sealedBinding: { sender: f.sender.controller, payloadHash: "wrong" },
      },
    ]),
    storage = { getItem: () => original };
  expect(inspectPending(storage).error).toMatch(/cannot be read/);
  expect(() => hasUnresolved(storage, 38, context.registry, id)).toThrow(
    "spending is blocked",
  );
  expect(storage.getItem()).toBe(original);
});
test("V4 requires explicit named evidence and its own publication method instead of legacy routing", async () => {
  const f = await fixture(),
    d = {
      ...emptyDeployment,
      ...context,
      contractProtocol: "unified-2" as const,
      envelopeTemplate: context.template,
      resource: `resource_${"01".repeat(32)}`,
      indexerUrl: "https://example.test",
      capsule: {
        template: context.template,
        component: context.registry,
        resource: `resource_${"ab".repeat(32)}`,
      },
      evidence: {
        ...emptyDeployment.evidence,
        engineClaims: true,
        guestPayout: true,
        sapientWallet: true,
        mailboxRecovery: true,
      },
      sealedDelivery: {
        engine: true,
        recovery: true,
        stockSapient: true,
        sentAndReplies: false,
      },
    };
  expect(writesReady(officeProfile(d), "postbox", "sapient")).toBe(false);
  expect(() =>
    officeProfile({
      ...d,
      sealedDelivery: { a: true, b: true, c: true, d: true },
    }),
  ).toThrow("sealed delivery");
  expect(
    writesReady(
      { ...d, sealedDelivery: { ...d.sealedDelivery, sentAndReplies: true } },
      "postbox",
      "sapient",
    ),
  ).toBe(true);
  expect(() =>
    publishTransaction(d, f.envelope, f.entry.component, "1000", 100),
  ).toThrow("dedicated sealed");
});
