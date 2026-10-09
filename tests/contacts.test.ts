import { test, expect } from "vitest";
import { recipientGroups } from "../src/core/contacts";
import type { Envelope, Postbox } from "../src/core/types";
const box = (id: string, controller: string, discoverable = true): Postbox => ({
  id,
  nickname: id,
  controller,
  discoverable,
  encryptionKey: "unused",
});
const home = box("home", "me"),
  friend = box("friend", "friend-key", false),
  favourite = box("favourite", "fav"),
  other = box("other", "other-key");
const received = {
  id: "letter",
  mode: "postbox",
  recipientPostbox: "home",
  claimAuthority: "me",
  sender: "friend-key",
  replyPostbox: "friend",
} as Envelope;
test("recipients order favourites, verified correspondents and public directory without duplicates", () => {
  const groups = recipientGroups(
    [other, home, friend, favourite],
    [received],
    home,
    ["favourite"],
  );
  expect(groups.map((g) => g.boxes.map((p) => p.id))).toEqual([
    ["favourite"],
    ["friend"],
    ["home", "other"],
  ]);
  expect(
    recipientGroups([home, friend], [received], home, ["friend"])[1].boxes,
  ).toEqual([]);
});
test("forged reply routing and wrong mailbox authority cannot create a correspondent", () => {
  for (const forged of [
    { ...received, sender: "attacker" },
    { ...received, claimAuthority: "attacker" },
    { ...received, recipientPostbox: "elsewhere" },
  ])
    expect(recipientGroups([home, friend], [forged], home)[1].boxes).toEqual(
      [],
    );
  const sent = {
    ...received,
    sender: "me",
    replyPostbox: "home",
    recipientPostbox: "friend",
    claimAuthority: "friend-key",
  };
  expect(recipientGroups([home, friend], [sent], home)[1].boxes).toEqual([
    friend,
  ]);
  expect(
    recipientGroups(
      [home, friend],
      [{ ...sent, claimAuthority: "attacker" }],
      home,
    )[1].boxes,
  ).toEqual([]);
});
