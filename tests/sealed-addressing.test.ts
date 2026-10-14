import { expect, test } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import {
  sealAddressedRoute,
  openAddressedRoute,
  conversationReplyKey,
  discoverSealedPage,
  type SealedRoute,
} from "../src/core/sealed-addressing";
const context = {
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
  },
  id = "c".repeat(64);
const route: SealedRoute = {
  version: "mm-route-1",
  recipientPostbox: "secret-inbox",
  keyVersion: 3,
  letter: {
    subject: "Night letters",
    body: "A hidden route with a private conversation.",
  },
};
test("sealed envelope hides routing identifiers and recovers with an independent copy of the recipient key", async () => {
  const pair = generateKeypair();
  const secret = new Uint8Array(pair.secret_key),
    pub = hex(pair.public_key);
  pair.free();
  try {
    const e = await sealAddressedRoute(route, pub, context, id);
    expect(Object.keys(e).sort()).toEqual([
      "ciphertext",
      "ephemeralPublicKey",
      "iv",
      "version",
    ]);
    for (const value of [
      pub,
      route.recipientPostbox,
      "Night letters",
      "private conversation",
    ]) {
      expect(JSON.stringify(e)).not.toContain(value);
    }
    expect(
      await openAddressedRoute(e, new Uint8Array(secret), context, id),
    ).toEqual(route);
  } finally {
    secret.fill(0);
  }
});

test("bounded discovery separates recipients and key versions without accepting a forged inner mailbox", async () => {
  const a = generateKeypair(),
    b = generateKeypair();
  try {
    const first = await sealAddressedRoute(
      route,
      hex(a.public_key),
      context,
      id,
    );
    const other = await sealAddressedRoute(
      { ...route, recipientPostbox: "other-inbox" },
      hex(b.public_key),
      context,
      "d".repeat(64),
    );
    const forged = await sealAddressedRoute(
      { ...route, recipientPostbox: "forged-inbox" },
      hex(a.public_key),
      context,
      "e".repeat(64),
    );
    const page = [
      { id, payload: first },
      { id: "d".repeat(64), payload: other },
      { id: "e".repeat(64), payload: forged },
      { id: "f".repeat(64), payload: { ...first, ciphertext: "broken" } },
    ];
    const result = await discoverSealedPage(
      page,
      [
        {
          postbox: route.recipientPostbox,
          keyVersion: 3,
          secret: a.secret_key,
        },
      ],
      context,
    );
    expect(result.matches.map((m) => m.id)).toEqual([id]);
    expect(result.skipped).toBe(3);
    expect(
      (
        await discoverSealedPage(
          page,
          [
            {
              postbox: route.recipientPostbox,
              keyVersion: 2,
              secret: a.secret_key,
            },
          ],
          context,
        )
      ).matches,
    ).toEqual([]);
    await expect(
      discoverSealedPage(Array(51).fill(page[0]), [], context),
    ).rejects.toThrow("bounded");
    await expect(
      discoverSealedPage(
        [],
        Array(17).fill({ postbox: "x", keyVersion: 1, secret: a.secret_key }),
        context,
      ),
    ).rejects.toThrow("bounded");
    const abort = new AbortController();
    abort.abort();
    await expect(
      discoverSealedPage(
        page,
        [
          {
            postbox: route.recipientPostbox,
            keyVersion: 3,
            secret: a.secret_key,
          },
        ],
        context,
        abort.signal,
      ),
    ).rejects.toThrow();
  } finally {
    a.free();
    b.free();
  }
});
test("equal bucket messages conceal exact plaintext length and encrypt differently on each send", async () => {
  const pair = generateKeypair();
  try {
    const pub = hex(pair.public_key),
      a = await sealAddressedRoute(route, pub, context, id),
      b = await sealAddressedRoute(
        { ...route, letter: { ...route.letter, body: "Short" } },
        pub,
        context,
        id,
      );
    expect(a.ciphertext.length).toBe(b.ciphertext.length);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ephemeralPublicKey).not.toBe(b.ephemeralPublicKey);
  } finally {
    pair.free();
  }
});
test("wrong key, network, registry, template, letter ID and ciphertext tampering cannot open a route", async () => {
  const pair = generateKeypair(),
    other = generateKeypair();
  try {
    const e = await sealAddressedRoute(
      route,
      hex(pair.public_key),
      context,
      id,
    );
    await expect(
      openAddressedRoute(e, other.secret_key, context, id),
    ).rejects.toThrow();
    for (const c of [
      { ...context, network: 36 },
      { ...context, registry: `component_${"d".repeat(64)}` },
      { ...context, template: "e".repeat(64) },
    ])
      await expect(
        openAddressedRoute(e, pair.secret_key, c, id),
      ).rejects.toThrow();
    await expect(
      openAddressedRoute(e, pair.secret_key, context, "f".repeat(64)),
    ).rejects.toThrow();
    await expect(
      openAddressedRoute(
        {
          ...e,
          ciphertext:
            (e.ciphertext[0] === "A" ? "B" : "A") + e.ciphertext.slice(1),
        },
        pair.secret_key,
        context,
        id,
      ),
    ).rejects.toThrow();
    await expect(
      openAddressedRoute(
        { ...e, recipientPostbox: "visible" } as any,
        pair.secret_key,
        context,
        id,
      ),
    ).rejects.toThrow();
  } finally {
    pair.free();
    other.free();
  }
});
test("oversized routes and malformed identities fail before publication", async () => {
  const pair = generateKeypair();
  try {
    await expect(
      sealAddressedRoute(
        { ...route, letter: { subject: "x", body: "x".repeat(17000) } },
        hex(pair.public_key),
        context,
        id,
      ),
    ).rejects.toThrow("padded message limit");
    await expect(
      sealAddressedRoute(route, "0".repeat(64), context, id),
    ).rejects.toThrow();
    await expect(
      sealAddressedRoute(
        { ...route, keyVersion: 0 },
        hex(pair.public_key),
        context,
        id,
      ),
    ).rejects.toThrow();
  } finally {
    pair.free();
  }
});
test("conversation reply identities recover deterministically and differ across conversations and deployments", async () => {
  const pair = generateKeypair();
  const replies = [];
  try {
    const a = await conversationReplyKey(pair.secret_key, context, id);
    replies.push(a);
    const restored = await conversationReplyKey(
      new Uint8Array(pair.secret_key),
      context,
      id,
    );
    replies.push(restored);
    const b = await conversationReplyKey(
      pair.secret_key,
      context,
      "d".repeat(64),
    );
    replies.push(b);
    const c = await conversationReplyKey(
      pair.secret_key,
      { ...context, network: 36 },
      id,
    );
    replies.push(c);
    expect(a.publicKey).toBe(restored.publicKey);
    expect(a.secret).toEqual(restored.secret);
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.publicKey).not.toBe(c.publicKey);
    expect(a.publicKey).not.toBe(hex(pair.public_key));
    const e = await sealAddressedRoute(
      { ...route, reply: { publicKey: a.publicKey, conversation: id } },
      hex(pair.public_key),
      context,
      id,
    );
    expect(JSON.stringify(e)).not.toContain(a.publicKey);
    expect(
      (await openAddressedRoute(e, pair.secret_key, context, id)).reply
        ?.publicKey,
    ).toBe(a.publicKey);
  } finally {
    for (const r of replies) r.secret.fill(0);
    pair.free();
  }
});
