import { test, expect } from "vitest";
import { conversation, replyThread, threadMetadata } from "../src/core/threads";
import type { Envelope, Letter, Postbox } from "../src/core/types";
const box = (id: string): Postbox => ({
  id,
  controller: id + "-key",
  nickname: id,
  encryptionKey: "unused",
  discoverable: true,
});
const boxes = [box("home"), box("friend"), box("stranger")];
function mail(id: string, from = "home", to = "friend"): Envelope {
  return {
    id,
    mode: "postbox",
    replyPostbox: from,
    recipientPostbox: to,
    sender: from + "-key",
    claimAuthority: to + "-key",
  } as Envelope;
}
const root = mail("root"),
  reply = mail("reply", "friend", "home"),
  next = mail("next");
const text = new Map<string, Letter>([
  ["root", { subject: "Hello", body: "first" }],
  [
    "reply",
    {
      subject: "Re: Hello",
      body: "second",
      thread: replyThread(root, undefined),
    },
  ],
  [
    "next",
    {
      subject: "Re: Hello",
      body: "third",
      thread: { version: "gd-thread-1", root: "root", parent: "reply" },
    },
  ],
]);
test("loaded verified replies join both directions in parent-first order, including branches", () => {
  const branch = mail("branch", "friend", "home"),
    texts = new Map(text);
  texts.set(branch.id, {
    subject: "Hello",
    body: "branch",
    thread: replyThread(root, undefined),
  });
  expect(
    conversation(next, [next, branch, reply, root], texts, boxes).map(
      (e) => e.id,
    ),
  ).toEqual(["root", "reply", "next", "branch"]);
  expect(replyThread(reply, text.get(reply.id))).toEqual({
    version: "gd-thread-1",
    root: "root",
    parent: "reply",
  });
});
test("subjects, forged root IDs, missing plaintext and unrelated routing cannot merge conversations", () => {
  const stranger = mail("stranger", "stranger", "home"),
    forged = mail("forged"),
    texts = new Map(text);
  texts.set(stranger.id, {
    subject: "Hello",
    body: "stranger",
    thread: replyThread(root, undefined),
  });
  texts.set(forged.id, {
    subject: "Hello",
    body: "forged",
    thread: { version: "gd-thread-1", root: "wrong", parent: "root" },
  });
  expect(
    conversation(root, [root, reply, next, stranger, forged], texts, boxes).map(
      (e) => e.id,
    ),
  ).toEqual(["root", "reply", "next"]);
  texts.delete("reply");
  expect(conversation(root, [root, reply, next], texts, boxes)).toEqual([root]);
  expect(
    conversation(root, [root, { ...reply, sender: "attacker" }], text, boxes),
  ).toEqual([root]);
});
test("malformed and cyclic metadata remains readable mail but cannot fabricate a thread", () => {
  for (const value of [
    null,
    [],
    { version: "gd-thread-1", root: "x", parent: 3 },
    { version: "wrong", root: "x", parent: "y" },
    { version: "gd-thread-1", root: "x".repeat(65), parent: "y" },
  ])
    expect(threadMetadata(value)).toBeUndefined();
  const a = mail("a"),
    b = mail("b"),
    texts = new Map<string, Letter>([
      [
        "a",
        {
          subject: "a",
          body: "a",
          thread: { version: "gd-thread-1", root: "cycle", parent: "b" },
        },
      ],
      [
        "b",
        {
          subject: "b",
          body: "b",
          thread: { version: "gd-thread-1", root: "cycle", parent: "a" },
        },
      ],
    ]);
  expect(conversation(a, [a, b], texts, boxes)).toEqual([a]);
  expect(replyThread({ ...root, mode: "link" }, undefined)).toBeUndefined();
});
