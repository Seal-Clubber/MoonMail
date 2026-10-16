import { expect, test } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import { conversationReplyKey } from "../src/core/sealed-addressing";
import {
  sealPrivateMail,
  openPrivateMail,
  discoverPrivateMailPage,
  parseSealedMail,
  type SealedMessage,
  type RecoveredSealedKey,
  type SealedMailEntry,
  type ReplyIdentity,
} from "../src/core/sealed-mail";
const context = {
  network: 38,
  registry: `component_${"aa".repeat(32)}`,
  template: "bb".repeat(32),
  senderPublicKey: "cc".repeat(32),
};
const id = "01".repeat(32),
  nonce = "03".repeat(32);
function key(postbox: string, keyVersion = 1): RecoveredSealedKey {
  const pair = generateKeypair();
  try {
    return {
      postbox,
      keyVersion,
      controller:
        postbox === "alice" ? context.senderPublicKey : "dd".repeat(32),
      publicKey: hex(pair.public_key),
      secret: new Uint8Array(pair.secret_key),
    };
  } finally {
    pair.free();
  }
}
function message(a: RecoveredSealedKey, b: RecoveredSealedKey): SealedMessage {
  return {
    version: "mm-message-1",
    recipient: {
      postbox: b.postbox,
      keyVersion: b.keyVersion,
      publicKey: b.publicKey,
    },
    sender: {
      postbox: a.postbox,
      keyVersion: a.keyVersion,
      publicKey: a.publicKey,
      controller: a.controller,
    },
    letter: {
      subject: "Under moonlight",
      body: "Only our wallets should restore this.",
    },
  };
}
function entry(
  payload: SealedMailEntry["payload"],
  letterId = id,
  senderPublicKey = context.senderPublicKey,
): SealedMailEntry {
  return { id: letterId, payload, senderPublicKey };
}
test("one padded body restores both Inbox and Sent after independently copying recovered wallet keys", async () => {
  const a = key("alice"),
    b = key("bob"),
    unrelated = key("eve");
  try {
    const m = message(a, b),
      e = await sealPrivateMail(m, context, id);
    expect(e.slots).toHaveLength(2);
    expect(new TextEncoder().encode(JSON.stringify(e)).length).toBeLessThan(
      24000,
    );
    for (const marker of [
      a.postbox,
      b.postbox,
      a.publicKey,
      b.publicKey,
      m.letter.subject,
      m.letter.body,
    ])
      expect(JSON.stringify(e)).not.toContain(marker);
    expect(
      await openPrivateMail(e, new Uint8Array(a.secret), context, id),
    ).toEqual(m);
    expect(
      await openPrivateMail(e, new Uint8Array(b.secret), context, id),
    ).toEqual(m);
    await expect(
      openPrivateMail(e, unrelated.secret, context, id),
    ).rejects.toThrow();
    const sent = await discoverPrivateMailPage(
      [entry(e)],
      [{ ...a, secret: new Uint8Array(a.secret) }],
      context,
    );
    expect(sent.matches[0]).toMatchObject({
      id,
      sent: true,
      inbox: false,
      message: m,
    });
    const inbox = await discoverPrivateMailPage(
      [entry(e)],
      [{ ...b, secret: new Uint8Array(b.secret) }],
      context,
    );
    expect(inbox.matches[0]).toMatchObject({ id, sent: false, inbox: true });
  } finally {
    for (const k of [a, b, unrelated]) k.secret.fill(0);
  }
});
test("self mail remains in both folders and historical key versions survive rotation", async () => {
  const old = key("alice"),
    current = key("alice", 2);
  try {
    const e = await sealPrivateMail(message(old, old), context, id);
    const result = await discoverPrivateMailPage(
      [entry(e)],
      [current, old],
      context,
    );
    expect(result.matches[0]).toMatchObject({ inbox: true, sent: true });
    expect(
      (await discoverPrivateMailPage([entry(e)], [current], context)).skipped,
    ).toBe(1);
    await expect(
      discoverPrivateMailPage([entry(e)], [{ ...old, keyVersion: 2 }], context),
    ).resolves.toMatchObject({ skipped: 1 });
  } finally {
    old.secret.fill(0);
    current.secret.fill(0);
  }
});
test("both parties recover reply identities from their Sent and open replies discovered before their seed letter", async () => {
  const a = key("alice"),
    b = key("bob"),
    replyA = await conversationReplyKey(a.secret, context, nonce),
    replyB = await conversationReplyKey(b.secret, context, nonce);
  try {
    const initial = message(a, b);
    initial.reply = { conversation: nonce, publicKey: replyA.publicKey };
    const initialPayload = await sealPrivateMail(
      initial,
      context,
      "ff".repeat(32),
    );
    const response = message(b, a);
    response.recipient = {
      ...response.recipient,
      conversation: nonce,
      publicKey: replyA.publicKey,
    };
    response.reply = { conversation: nonce, publicKey: replyB.publicKey };
    response.letter.thread = {
      version: "gd-thread-1",
      root: "ff".repeat(32),
      parent: "ff".repeat(32),
    };
    const responsePayload = await sealPrivateMail(
      response,
      { ...context, senderPublicKey: b.controller },
      id,
    );
    const page = [
      entry(responsePayload, id, b.controller),
      entry(initialPayload, "ff".repeat(32)),
    ];
    const restoredA = await discoverPrivateMailPage(
      page,
      [{ ...a, secret: new Uint8Array(a.secret) }],
      context,
    );
    expect(restoredA.matches).toHaveLength(2);
    expect(restoredA.matches.find((m) => m.id === id)).toMatchObject({
      inbox: true,
      sent: false,
      message: response,
    });
    expect(restoredA.identities).toEqual([
      {
        postbox: a.postbox,
        keyVersion: a.keyVersion,
        publicKey: replyA.publicKey,
        conversation: nonce,
      },
    ]);
    const restoredB = await discoverPrivateMailPage(page, [b], context);
    expect(restoredB.matches).toHaveLength(2);
    expect(restoredB.matches.find((m) => m.id === id)).toMatchObject({
      inbox: false,
      sent: true,
    });
    // Restore page two first, then revisit an earlier page with only descriptors.
    const seeds = await discoverPrivateMailPage([page[1]], [a], context);
    expect(
      (await discoverPrivateMailPage([page[0]], [a], context, seeds.identities))
        .matches[0].inbox,
    ).toBe(true);
    for (const identity of restoredA.identities)
      expect(JSON.stringify(responsePayload)).not.toContain(identity.publicKey);
    expect(a.secret.some((n) => n !== 0)).toBe(true); // caller keys are borrowed, never erased
  } finally {
    for (const k of [a, b, replyA, replyB]) k.secret.fill(0);
  }
});
test("reply recovery crosses the 128-key boundary and learns later Sent seeds without truncation", async () => {
  const a = key("alice"),
    b = key("bob");
  const identities: ReplyIdentity[] = [];
  try {
    for (let i = 0; i < 129; i++) {
      const conversation = i.toString(16).padStart(64, "0");
      const derived = await conversationReplyKey(
        a.secret,
        context,
        conversation,
      );
      identities.push({
        postbox: a.postbox,
        keyVersion: a.keyVersion,
        conversation,
        publicKey: derived.publicKey,
      });
      derived.secret.fill(0);
    }
    const conversation = "fe".repeat(32),
      latest = await conversationReplyKey(a.secret, context, conversation);
    const seed = message(a, b);
    seed.reply = { conversation, publicKey: latest.publicKey };
    latest.secret.fill(0);
    const makeReply = async (
      identity: (typeof identities)[number],
      letterId: string,
    ) => {
      const value = message(b, a);
      value.recipient = {
        ...value.recipient,
        conversation: identity.conversation,
        publicKey: identity.publicKey,
      };
      return entry(
        await sealPrivateMail(
          value,
          { ...context, senderPublicKey: b.controller },
          letterId,
        ),
        letterId,
        b.controller,
      );
    };
    const first = await makeReply(identities[0], "11".repeat(32));
    const lastIdentity = {
      ...identities[0],
      conversation,
      publicKey: seed.reply.publicKey,
    };
    const last = await makeReply(lastIdentity, "12".repeat(32));
    const seedEntry = entry(
      await sealPrivateMail(seed, context, "13".repeat(32)),
      "13".repeat(32),
    );
    const restored = await discoverPrivateMailPage(
      [last, first, seedEntry],
      [{ ...a, secret: new Uint8Array(a.secret) }],
      context,
      identities,
    );
    expect(restored.identities).toHaveLength(130);
    expect(
      restored.matches
        .filter((m) => m.inbox)
        .map((m) => m.id)
        .sort(),
    ).toEqual([first.id, last.id].sort());
    expect(restored.matches.find((m) => m.id === seedEntry.id)?.sent).toBe(
      true,
    );
    const restoredAgain = await discoverPrivateMailPage(
      [last],
      [a],
      context,
      restored.identities,
    );
    expect(restoredAgain.matches[0]?.inbox).toBe(true);
    const abort = new AbortController();
    const cancelled = discoverPrivateMailPage(
      [last],
      [a],
      context,
      restored.identities,
      abort.signal,
    );
    abort.abort();
    await expect(cancelled).rejects.toThrow();
    await expect(
      discoverPrivateMailPage(
        [],
        [a],
        context,
        Array(4097).fill(identities[0]),
      ),
    ).rejects.toThrow("bounded");
    expect(a.secret.some((n) => n !== 0)).toBe(true);
  } finally {
    a.secret.fill(0);
    b.secret.fill(0);
  }
});

test("sender, deployment, id, body and access-slot substitutions cannot open copied ciphertext", async () => {
  const a = key("alice"),
    b = key("bob");
  try {
    const e = await sealPrivateMail(message(a, b), context, id),
      other = await sealPrivateMail(message(a, b), context, id);
    for (const c of [
      { ...context, senderPublicKey: b.controller },
      { ...context, network: 36 },
      { ...context, registry: `component_${"ee".repeat(32)}` },
      { ...context, template: "ee".repeat(32) },
    ])
      await expect(openPrivateMail(e, b.secret, c, id)).rejects.toThrow();
    await expect(
      openPrivateMail(e, b.secret, context, "04".repeat(32)),
    ).rejects.toThrow();
    for (const corrupted of [
      { ...e, slots: [...e.slots].reverse() },
      { ...e, slots: other.slots },
      { ...e, ciphertext: other.ciphertext },
      { ...e, iv: other.iv },
    ])
      await expect(
        openPrivateMail(corrupted, b.secret, context, id),
      ).rejects.toThrow();
    const forged = message(a, b);
    forged.sender.controller = b.controller;
    await expect(sealPrivateMail(forged, context, id)).rejects.toThrow(
      "signer",
    );
  } finally {
    a.secret.fill(0);
    b.secret.fill(0);
  }
});
test("strict public and private schemas reject extra routing, malformed slots, inflated payloads and sender impersonation", async () => {
  const a = key("alice"),
    b = key("bob");
  try {
    const m = message(a, b),
      e = await sealPrivateMail(m, context, id);
    for (const field of [
      "recipientPostbox",
      "recipientKey",
      "capsule",
      "conversation",
      "replyPostbox",
    ]) {
      expect(() => parseSealedMail({ ...e, [field]: "visible" })).toThrow();
      expect(() =>
        parseSealedMail({
          ...e,
          slots: [{ ...e.slots[0], [field]: "visible" }, e.slots[1]],
        }),
      ).toThrow();
    }
    for (const slots of [
      [],
      [e.slots[0]],
      [...e.slots, e.slots[0]],
      [{ ...e.slots[0], wrappedKey: "x" }, e.slots[1]],
    ])
      expect(() => parseSealedMail({ ...e, slots })).toThrow();
    await expect(
      sealPrivateMail(
        { ...m, recipient: { ...m.recipient, keyVersion: 0 } },
        context,
        id,
      ),
    ).rejects.toThrow();
    await expect(
      sealPrivateMail(
        { ...m, letter: { subject: "x", body: "x".repeat(16500) } },
        context,
        id,
      ),
    ).rejects.toThrow("padded");
    await expect(
      sealPrivateMail(
        { ...m, letter: { ...m.letter, unsafe: "unsupported" } } as any,
        context,
        id,
      ),
    ).rejects.toThrow();
    // A valid decryption key is insufficient to forge a different owned postbox.
    const forged = await sealPrivateMail(
      {
        ...m,
        sender: { ...m.sender, postbox: "forged" },
        recipient: { ...m.recipient, postbox: "forged" },
      },
      context,
      id,
    );
    expect(
      (await discoverPrivateMailPage([entry(forged)], [a, b], context)).matches,
    ).toEqual([]);
  } finally {
    a.secret.fill(0);
    b.secret.fill(0);
  }
});
test("large padded mail fits once with both access slots and does not disclose exact length", async () => {
  const a = key("alice"),
    b = key("bob");
  try {
    const m = message(a, b);
    m.letter.body = "x".repeat(15000);
    const e = await sealPrivateMail(m, context, id),
      other = await sealPrivateMail(
        { ...m, letter: { ...m.letter, body: "x".repeat(15500) } },
        context,
        id,
      );
    expect(e.ciphertext.length).toBe(other.ciphertext.length);
    expect(e.ciphertext).not.toBe(other.ciphertext);
    expect(new TextEncoder().encode(JSON.stringify(e)).length).toBeLessThan(
      24000,
    );
    expect((await openPrivateMail(e, a.secret, context, id)).letter.body).toBe(
      m.letter.body,
    );
  } finally {
    a.secret.fill(0);
    b.secret.fill(0);
  }
});
test("discovery bounds work, honors cancellation, rejects forged descriptors and never mutates borrowed keys", async () => {
  const a = key("alice"),
    b = key("bob");
  try {
    const e = entry(await sealPrivateMail(message(a, b), context, id));
    await expect(
      discoverPrivateMailPage(Array(51).fill(e), [a], context),
    ).rejects.toThrow("bounded");
    await expect(discoverPrivateMailPage([e, e], [a], context)).rejects.toThrow(
      "unique",
    );
    await expect(
      discoverPrivateMailPage([e], Array(17).fill(a), context),
    ).rejects.toThrow("bounded");
    await expect(
      discoverPrivateMailPage([e], [{ ...a, publicKey: b.publicKey }], context),
    ).rejects.toThrow("mismatch");
    await expect(
      discoverPrivateMailPage([e], [a], context, [
        {
          postbox: a.postbox,
          keyVersion: a.keyVersion,
          conversation: nonce,
          publicKey: b.publicKey,
        },
      ]),
    ).rejects.toThrow("belong");
    const abort = new AbortController();
    abort.abort();
    await expect(
      discoverPrivateMailPage([e], [a], context, [], abort.signal),
    ).rejects.toThrow();
    expect(a.secret.some((n) => n !== 0)).toBe(true);
  } finally {
    a.secret.fill(0);
    b.secret.fill(0);
  }
});
