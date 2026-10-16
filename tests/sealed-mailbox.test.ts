import { expect, test, vi } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import { mailboxKey } from "../src/core/mailbox";
import { SapientSession } from "../src/core/sapient";
import { SealedMailboxSession } from "../src/core/sealed-mailbox";
import type {
  SealedOfficeClient,
  SealedOfficeProfile,
  SealedPostbox,
} from "../src/core/sealed-office";
import {
  openPrivateMail,
  sealPrivateMail,
  type SealedMessage,
  type SealedMailEntry,
} from "../src/core/sealed-mail";
import { conversationReplyKey } from "../src/core/sealed-addressing";
const profile: SealedOfficeProfile = {
  protocol: "moonmail-sealed-1",
  network: 38,
  registry: `component_${"aa".repeat(32)}`,
  template: "bb".repeat(32),
  resource: `resource_${"01".repeat(32)}`,
  recoveryResource: `resource_${"ee".repeat(32)}`,
  indexerUrl: "https://example.test",
  evidence: {
    engine: false,
    recovery: false,
    stockSapient: false,
    sentAndReplies: false,
    nativePrivatePostage: false,
  },
};
function identity(id: string, controller: string, version = 1) {
  const pair = generateKeypair(),
    secret = new Uint8Array(pair.secret_key),
    publicKey = hex(pair.public_key);
  pair.free();
  const descriptor = {
    version: "gd-postbox-1",
    keyVersion: version,
    publicKey,
    recovery: "sapient-capsule-1",
    capsule: {
      resource: profile.recoveryResource,
      commitment: hex(crypto.getRandomValues(new Uint8Array(32))),
    },
  };
  const box: SealedPostbox = {
    id,
    nickname: id,
    controller,
    encryptionKey: JSON.stringify(descriptor),
    discoverable: true,
    keyHistory: [],
  };
  return { box, secret, publicKey };
}
const alice = () => identity("alice", "cc".repeat(32)),
  bob = () => identity("bob", "dd".repeat(32));
function route(
  a: ReturnType<typeof identity>,
  b: ReturnType<typeof identity>,
): SealedMessage {
  return {
    version: "mm-message-1",
    sender: {
      postbox: a.box.id,
      keyVersion: mailboxKey(a.box.encryptionKey).keyVersion,
      publicKey: a.publicKey,
      controller: a.box.controller,
    },
    recipient: {
      postbox: b.box.id,
      keyVersion: mailboxKey(b.box.encryptionKey).keyVersion,
      publicKey: b.publicKey,
    },
    letter: {
      subject: "Restored moonlight",
      body: "No browser storage is the authority.",
    },
  };
}
async function envelope(
  message: SealedMessage,
  id: string,
): Promise<SealedMailEntry> {
  return {
    id,
    senderPublicKey: message.sender.controller,
    payload: await sealPrivateMail(
      message,
      { ...profile, senderPublicKey: message.sender.controller },
      id,
    ),
  };
}
function fixture(
  owner: ReturnType<typeof identity>,
  boxes: SealedPostbox[],
  entries: SealedMailEntry[],
  old: ReturnType<typeof identity>[] = [],
) {
  const wallet = Object.create(SapientSession.prototype) as SapientSession,
    account = `component_${"12".repeat(32)}`;
  Object.assign(wallet, {
    network: 38,
    accounts: [
      {
        account: {
          component_address: account,
          owner_public_key: owner.box.controller,
        },
      },
    ],
  });
  const view = vi.spyOn(wallet, "hasPostboxViewAccess").mockResolvedValue(true),
    buffers: Uint8Array[] = [];
  const recover = vi.fn(
    async (_account: string, context: { keyVersion: number }) => {
      const key = [owner, ...old].find(
        (k) =>
          mailboxKey(k.box.encryptionKey).keyVersion === context.keyVersion,
      );
      if (!key) throw new Error("Unknown historical key");
      const copy = new Uint8Array(key.secret);
      buffers.push(copy);
      return copy;
    },
  );
  vi.spyOn(wallet, "capsuleMailbox").mockReturnValue({ recover } as any);
  const submit = vi
    .spyOn(wallet, "submitOperation")
    .mockImplementation(async () => {
      throw new Error("Reading must never spend");
    });
  const readOffice = vi.fn(async () => ({ postboxes: boxes }));
  const readPage = vi.fn(async (after = "", limit = 50) => {
    const sorted = entries
        .filter((e) => e.id > after)
        .sort((a, b) => a.id.localeCompare(b.id)),
      selected = sorted.slice(0, limit);
    return {
      entries: selected,
      postboxes: boxes,
      total: entries.length,
      nextCursor: sorted.length > limit ? selected.at(-1)!.id : "",
      unavailableIds: [] as string[],
    };
  });
  const readLetter = vi.fn(async (id: string) => {
    const e = entries.find((e) => e.id === id);
    if (!e) throw new Error("Unavailable");
    return e;
  });
  const client = {
    profile,
    readOffice,
    readPage,
    readLetter,
    provider: { getSubstate: vi.fn() },
  } as unknown as SealedOfficeClient;
  return {
    wallet,
    view,
    recover,
    buffers,
    submit,
    client,
    readPage,
    readOffice,
    readLetter,
  };
}
test("an independent restored wallet session recovers earlier reply pages after a later Sent seed, without spending", async () => {
  const a = alice(),
    b = bob(),
    conversation = "ab".repeat(32),
    reply = await conversationReplyKey(a.secret, profile, conversation);
  let session: SealedMailboxSession | undefined;
  try {
    const initial = route(a, b);
    initial.reply = { conversation, publicKey: reply.publicKey };
    const response = route(b, a);
    response.recipient = {
      ...response.recipient,
      conversation,
      publicKey: reply.publicKey,
    };
    const first = await envelope(response, "01".repeat(32)),
      seed = await envelope(initial, "ff".repeat(32));
    const entries = [
      first,
      ...Array.from({ length: 49 }, (_, i) => ({
        ...first,
        id: (i + 100).toString(16).padStart(64, "0"),
      })),
      seed,
    ];
    const f = fixture(a, [a.box, b.box], entries);
    session = await SealedMailboxSession.open(f.client, f.wallet, a.box.id);
    expect((await session.loadMore()).complete).toBe(false);
    expect(await session.messages()).toHaveLength(0);
    expect((await session.loadMore()).complete).toBe(true);
    const restored = await session.messages();
    expect(restored).toHaveLength(2);
    expect(restored.find((m) => m.id === first.id)).toMatchObject({
      inbox: true,
      sent: false,
      message: response,
    });
    expect(restored.find((m) => m.id === seed.id)).toMatchObject({
      inbox: false,
      sent: true,
    });
    restored[0].message.letter.body = "Caller edits cannot mutate the session";
    expect((await session.messages())[0].message.letter.body).not.toContain(
      "Caller edits",
    );
    expect(f.submit).not.toHaveBeenCalled();
    session.dispose();
    expect(f.buffers.every((v) => v.every((n) => n === 0))).toBe(true);
    await expect(session.messages()).rejects.toThrow();
  } finally {
    session?.dispose();
    a.secret.fill(0);
    b.secret.fill(0);
    reply.secret.fill(0);
  }
});
test("rotation restores old and current key versions from the on-chain postbox history", async () => {
  const old = alice(),
    current = identity(old.box.id, old.box.controller, 2),
    b = bob();
  current.box.keyHistory = [mailboxKey(old.box.encryptionKey)];
  let session: SealedMailboxSession | undefined;
  try {
    const sent = await envelope(route(old, b), "01".repeat(32)),
      inbox = await envelope(route(b, current), "02".repeat(32));
    const f = fixture(current, [current.box, b.box], [sent, inbox], [old]);
    session = await SealedMailboxSession.open(
      f.client,
      f.wallet,
      current.box.id,
    );
    expect(f.recover.mock.calls.map((c) => c[1].keyVersion)).toEqual([1, 2]);
    await session.loadMore();
    expect(await session.messages()).toHaveLength(2);
    expect(f.submit).not.toHaveBeenCalled();
  } finally {
    session?.dispose();
    old.secret.fill(0);
    current.secret.fill(0);
    b.secret.fill(0);
  }
});
test("missing view permission, access revocation, external abort and account changes clear recovered keys", async () => {
  const a = alice();
  try {
    const denied = fixture(a, [a.box], []);
    denied.view.mockResolvedValue(false);
    await expect(
      SealedMailboxSession.open(denied.client, denied.wallet, a.box.id),
    ).rejects.toThrow("separately");
    expect(denied.recover).not.toHaveBeenCalled();
    expect(denied.submit).not.toHaveBeenCalled();
    for (const mode of ["revoke", "abort", "account"] as const) {
      const f = fixture(a, [a.box], []),
        abort = new AbortController(),
        session = await SealedMailboxSession.open(
          f.client,
          f.wallet,
          a.box.id,
          abort.signal,
        );
      if (mode === "revoke") f.view.mockResolvedValue(false);
      if (mode === "account")
        f.view.mockRejectedValue(new Error("Account changed"));
      if (mode === "abort") abort.abort();
      await expect(session.messages()).rejects.toThrow();
      expect(f.buffers.every((v) => v.every((n) => n === 0))).toBe(true);
      expect(f.submit).not.toHaveBeenCalled();
      session.dispose();
    }
  } finally {
    a.secret.fill(0);
  }
});
test("late recovery results cannot reintroduce secrets after cancellation", async () => {
  const a = alice(),
    f = fixture(a, [a.box], []),
    abort = new AbortController();
  let deliver!: (v: Uint8Array<ArrayBuffer>) => void;
  const buffer = new Uint8Array(a.secret);
  f.recover.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  );
  const opening = SealedMailboxSession.open(
    f.client,
    f.wallet,
    a.box.id,
    abort.signal,
  );
  try {
    await vi.waitFor(() => expect(deliver).toBeTypeOf("function"));
    abort.abort();
    deliver(buffer);
    await expect(opening).rejects.toThrow();
    expect(buffer.every((n) => n === 0)).toBe(true);
  } finally {
    a.secret.fill(0);
  }
});
test("composition binds reply routing to an opened original and always creates an encrypted Sent slot", async () => {
  const a = alice(),
    b = bob(),
    conversation = "ab".repeat(32),
    reply = await conversationReplyKey(b.secret, profile, conversation);
  let session: SealedMailboxSession | undefined;
  try {
    const original = route(b, a);
    original.reply = { conversation, publicKey: reply.publicKey };
    const received = await envelope(original, "01".repeat(32)),
      f = fixture(a, [a.box, b.box], [received]);
    session = await SealedMailboxSession.open(f.client, f.wallet, a.box.id);
    await session.loadMore();
    await expect(
      session.prepare({ subject: "x", body: "y" }, b.box.id, {
        replyTo: "ff".repeat(32),
      }),
    ).rejects.toThrow("original");
    await expect(
      session.prepare({ subject: "x", body: "y" }, a.box.id, {
        replyTo: received.id,
      }),
    ).rejects.toThrow("conversation");
    const prepared = await session.prepare(
      { subject: "Re: moonlight", body: "Restorable reply" },
      b.box.id,
      { replyTo: received.id },
    );
    const opened = await openPrivateMail(
      prepared.payload,
      reply.secret,
      { ...profile, senderPublicKey: a.box.controller },
      prepared.id,
    );
    expect(opened.recipient).toMatchObject({
      postbox: b.box.id,
      conversation,
      publicKey: reply.publicKey,
    });
    expect(opened.reply?.conversation).toBe(conversation);
    expect(opened.reply?.publicKey).toMatch(/^[a-f0-9]{64}$/);
    expect(opened.letter.thread).toEqual({
      version: "gd-thread-1",
      root: received.id,
      parent: received.id,
    });
    expect(
      await openPrivateMail(
        prepared.payload,
        a.secret,
        { ...profile, senderPublicKey: a.box.controller },
        prepared.id,
      ),
    ).toEqual(opened);
    // Random base64 ciphertext can contain a short name such as "bob" by chance.
    // A clear JSON identity value is a leak; an incidental ciphertext substring is not.
    expect(Object.keys(prepared.payload).sort()).toEqual([
      "ciphertext",
      "ephemeralPublicKey",
      "iv",
      "slots",
      "version",
    ]);
    expect(JSON.stringify(prepared.payload)).not.toContain(
      JSON.stringify(b.box.id),
    );
    expect(f.submit).not.toHaveBeenCalled();
  } finally {
    session?.dispose();
    a.secret.fill(0);
    b.secret.fill(0);
    reply.secret.fill(0);
  }
});
test("concurrent discovery is refused before awaiting permissions; changing keys closes a stale session", async () => {
  const a = alice(),
    f = fixture(a, [a.box], []);
  let session: SealedMailboxSession | undefined;
  try {
    session = await SealedMailboxSession.open(f.client, f.wallet, a.box.id);
    let release!: (v: boolean) => void;
    f.view.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = session.loadMore();
    await expect(session.loadMore()).rejects.toThrow("already running");
    release(true);
    await first;
    // A new session checks the fresh chain key list before showing more mail.
    session.dispose();
    session = await SealedMailboxSession.open(f.client, f.wallet, a.box.id);
    f.readPage.mockResolvedValueOnce({
      entries: [],
      postboxes: [],
      total: 0,
      nextCursor: "",
      unavailableIds: [],
    });
    await expect(session.loadMore()).rejects.toThrow("keys changed");
    expect(f.buffers.every((v) => v.every((n) => n === 0))).toBe(true);
    expect(f.submit).not.toHaveBeenCalled();
  } finally {
    session?.dispose();
    a.secret.fill(0);
  }
});
