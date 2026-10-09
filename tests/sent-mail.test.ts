import { expect, test } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import {
  hex,
  sealLetter,
  envelopeSize,
  assertEnvelopeSize,
} from "../src/core/crypto";
import { sealMailbox, openMailbox } from "../src/core/mailbox";
import {
  addSentCopy,
  sentCopy,
  sentContext,
  sentPurpose,
} from "../src/core/sent-mail";
import { draftEnvelopeSize } from "../src/core/letter-size";
import type { Envelope, MailboxKey, Postbox } from "../src/core/types";
const context = {
  network: 38,
  registry: `component_${"1".repeat(64)}`,
  template: "2".repeat(64),
};
function actor(id: string, controller: string) {
  const p = generateKeypair();
  const secret = p.secret_key;
  const key: MailboxKey = {
    version: "gd-postbox-1",
    keyVersion: 1,
    publicKey: hex(p.public_key),
    recovery: "sapient-capsule-1",
    capsule: {
      resource: `resource_${"5".repeat(64)}`,
      commitment: "6".repeat(64),
    },
  };
  p.free();
  const box: Postbox = {
    id,
    controller,
    nickname: id,
    encryptionKey: JSON.stringify(key),
    discoverable: true,
  };
  return { key, box, secret };
}
const letter = {
  subject: "A recovered sent message",
  body: '👻 café\n"The sender can read this too."',
};
async function fixture(mode: "link" | "postbox") {
  const sender = actor("sender-box", "3".repeat(64)),
    recipient = actor("recipient-box", "4".repeat(64));
  const id = "sent-letter",
    sealed = await sealLetter(letter, context, id, 32768);
  const primary =
    mode === "link"
      ? sealed.payload
      : await sealMailbox(
          letter,
          {
            ...context,
            postbox: recipient.box.id,
            controller: recipient.box.controller,
            keyVersion: 1,
          },
          id,
          recipient.key,
          32768,
        );
  const envelope: Envelope = {
    id,
    mode,
    context,
    payload: primary,
    gift: "0",
    reserve: "0",
    claimed: false,
    sender: sender.box.controller,
    replyPostbox: sender.box.id,
    ...(mode === "postbox"
      ? {
          recipientPostbox: recipient.box.id,
          claimAuthority: recipient.box.controller,
        }
      : {}),
  };
  const result = await addSentCopy(envelope, letter, sender.box);
  return { sender, recipient, envelope, result };
}
async function openSent(e: Envelope, secret: Uint8Array) {
  const copy = sentCopy(e)!;
  return openMailbox(
    copy.payload,
    sentContext(e, copy),
    await sentPurpose(e),
    secret,
  );
}
for (const mode of ["link", "postbox"] as const)
  test(`${mode} Sent restores without recipient key and counts the complete wire size`, async () => {
    const f = await fixture(mode);
    try {
      const stored = JSON.parse(JSON.stringify(f.result)) as Envelope;
      if (mode === "link")
        stored.claimAuthority = (stored.payload as any).claimPublicKey;
      expect(await openSent(stored, new Uint8Array(f.sender.secret))).toEqual(
        letter,
      );
      await expect(openSent(stored, f.recipient.secret)).rejects.toThrow();
      expect(
        draftEnvelopeSize(
          letter,
          { ...f.envelope, payload: undefined } as any,
          mode === "postbox" ? f.recipient.key : undefined,
          {
            key: f.sender.key,
            postbox: f.sender.box.id,
            controller: f.sender.box.controller,
          },
        ),
      ).toBe(envelopeSize(f.result));
      expect(await sentPurpose({ ...stored, claimed: true })).toBe(
        await sentPurpose(stored),
      );
      expect(JSON.stringify(sentCopy(stored))).not.toContain("wrappedClaimKey");
      if (mode === "postbox")
        expect(
          await openMailbox(
            stored.payload as any,
            {
              ...context,
              postbox: f.recipient.box.id,
              controller: f.recipient.box.controller,
              keyVersion: 1,
            },
            stored.id,
            f.recipient.secret,
          ),
        ).toEqual(letter);
    } finally {
      f.sender.secret.fill(0);
      f.recipient.secret.fill(0);
    }
  });
test.each(["id", "network", "registry", "template", "recipient", "ciphertext"])(
  "Sent cannot be transplanted across %s",
  async (field) => {
    const f = await fixture("postbox");
    try {
      const e = structuredClone(f.result);
      if (field === "id") e.id = "foreign-letter";
      if (field === "network") e.context.network = 36;
      if (field === "registry")
        e.context.registry = `component_${"7".repeat(64)}`;
      if (field === "template") e.context.template = "8".repeat(64);
      if (field === "recipient") e.recipientPostbox = "other-box";
      if (field === "ciphertext")
        (e.payload as any).ciphertext =
          "A" + (e.payload as any).ciphertext.slice(1);
      await expect(openSent(e, f.sender.secret)).rejects.toThrow();
    } finally {
      f.sender.secret.fill(0);
      f.recipient.secret.fill(0);
    }
  },
);
test("forged sender, postbox and nested copy fail; absent legacy copy remains valid", async () => {
  const f = await fixture("postbox");
  try {
    expect(sentCopy(f.envelope)).toBeUndefined();
    for (const mutation of [
      (e: Envelope) => (e.sender = "9".repeat(64)),
      (e: Envelope) => (e.replyPostbox = "foreign"),
      (e: Envelope) => ((e.payload as any).sent.payload.sent = {}),
    ]) {
      const e = structuredClone(f.result);
      mutation(e);
      expect(() => sentCopy(e)).toThrow();
    }
    await expect(
      addSentCopy(f.envelope, letter, {
        ...f.sender.box,
        controller: "9".repeat(64),
      }),
    ).rejects.toThrow();
  } finally {
    f.sender.secret.fill(0);
    f.recipient.secret.fill(0);
  }
});
test("canonical payload key ordering survives serialization and oversized combined copies are refused", async () => {
  const f = await fixture("postbox");
  try {
    const e = structuredClone(f.result);
    e.payload = Object.fromEntries(Object.entries(e.payload).reverse()) as any;
    expect(await sentPurpose(e)).toBe(await sentPurpose(f.result));
    expect(await openSent(e, f.sender.secret)).toEqual(letter);
    const huge = { subject: "large", body: "x".repeat(14000) };
    const primary = await sealMailbox(
      huge,
      {
        ...context,
        postbox: f.recipient.box.id,
        controller: f.recipient.box.controller,
        keyVersion: 1,
      },
      f.envelope.id,
      f.recipient.key,
      32768,
    );
    const combined = await addSentCopy(
      { ...f.envelope, payload: primary },
      huge,
      f.sender.box,
    );
    expect(() => assertEnvelopeSize(combined, 32768)).toThrow();
  } finally {
    f.sender.secret.fill(0);
    f.recipient.secret.fill(0);
  }
});
