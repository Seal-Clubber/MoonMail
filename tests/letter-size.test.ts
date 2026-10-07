import { expect, it } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import {
  assertEnvelopeSize,
  envelopeSize,
  ENVELOPE_LIMIT,
  hex,
  sealLetter,
} from "../src/core/crypto";
import { draftEnvelopeSize } from "../src/core/letter-size";
import { sealMailbox } from "../src/core/mailbox";
import type { Envelope, MailboxKey, MailMode } from "../src/core/types";

const context = {
  network: 38,
  registry: `component_${"1".repeat(64)}`,
  template: "2".repeat(64),
};
const id = "00000000-0000-0000-0000-000000000000";
function metadata(mode: MailMode): Omit<Envelope, "payload"> {
  return {
    id,
    mode,
    context,
    gift: "1000000",
    reserve: "100000",
    claimed: false,
    sender: "3".repeat(64),
    replyPostbox: "reply-box",
    ...(mode === "postbox"
      ? { recipientPostbox: "recipient-box", claimAuthority: "4".repeat(64) }
      : {}),
  };
}
const pair = generateKeypair();
const key: MailboxKey = {
  version: "gd-postbox-1",
  keyVersion: 12345,
  publicKey: hex(pair.public_key),
  recovery: "sapient-capsule-1",
  capsule: {
    resource: `resource_${"5".repeat(64)}`,
    commitment: "6".repeat(64),
  },
};
pair.free();
for (const mode of ["public", "link", "postbox"] as const) {
  it.each(["x", "xx", "xxx", '👻 café\n"sealed"\u0000'])(
    `${mode} space matches the real UTF-8/encryption wire format for %s`,
    async (body) => {
      const letter = { subject: "A small kindness", body },
        envelope = metadata(mode);
      const payload =
        mode === "public"
          ? letter
          : mode === "link"
            ? (await sealLetter(letter, context, id)).payload
            : await sealMailbox(
                letter,
                {
                  ...context,
                  postbox: "recipient-box",
                  controller: "4".repeat(64),
                  keyVersion: key.keyVersion,
                },
                id,
                key,
              );
      expect(
        draftEnvelopeSize(
          letter,
          envelope,
          mode === "postbox" ? key : undefined,
        ),
      ).toBe(envelopeSize({ ...envelope, payload }));
    },
  );
}
it("native recovery metadata also matches actual encryption overhead", async () => {
  const native: MailboxKey = {
    version: key.version,
    keyVersion: 1,
    publicKey: key.publicKey,
    recovery: "native-memo-1",
  };
  const letter = { subject: "Native", body: "A private letter" },
    envelope = metadata("postbox");
  const payload = await sealMailbox(
    letter,
    {
      ...context,
      postbox: "recipient-box",
      controller: "4".repeat(64),
      keyVersion: 1,
    },
    id,
    native,
  );
  expect(draftEnvelopeSize(letter, envelope, native)).toBe(
    envelopeSize({ ...envelope, payload }),
  );
});
it("the complete envelope permits exactly its byte limit and rejects the next byte", () => {
  const envelope = metadata("public");
  const empty = { subject: "s", body: "" };
  const body = "x".repeat(ENVELOPE_LIMIT - draftEnvelopeSize(empty, envelope));
  const atLimit = { ...envelope, payload: { ...empty, body } };
  expect(draftEnvelopeSize(atLimit.payload, envelope)).toBe(ENVELOPE_LIMIT);
  expect(() => assertEnvelopeSize(atLimit)).not.toThrow();
  expect(() =>
    assertEnvelopeSize({ ...atLimit, payload: { ...empty, body: body + "x" } }),
  ).toThrow("4 KiB");
});
