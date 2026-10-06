import { expect, test } from "vitest";
import { generateKeypair } from "@tari-project/ootle-wasm";
import {
  encodeMailboxCapsule,
  recoverMailboxCapsule,
} from "../src/core/capsules";
import { sealMailbox, openMailbox } from "../src/core/mailbox";
import { base64url, fromBase64url } from "../src/core/crypto";
const context = {
  network: 16,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  postbox: "native-wallet",
  controller: "c".repeat(64),
  keyVersion: 1,
};
test("native memo fits and restores full letter without original mailbox key", async () => {
  const pair = generateKeypair(),
    secret = pair.secret_key;
  pair.free();
  const { memo, descriptor } = await encodeMailboxCapsule(context, secret);
  expect(new TextEncoder().encode(memo.Message).length).toBeLessThanOrEqual(
    253,
  );
  const letter = {
    subject: "Recovered",
    body: "Entire body stays encrypted on Ootle.",
  };
  const payload = await sealMailbox(letter, context, "letter", descriptor);
  secret.fill(0);
  const recovered = await recoverMailboxCapsule(
    context,
    JSON.parse(JSON.stringify(memo)),
    descriptor,
  );
  try {
    expect(await openMailbox(payload, context, "letter", recovered)).toEqual(
      letter,
    );
  } finally {
    recovered.fill(0);
  }
});
test("capsule rejects another controller, postbox, network, deployment or key version", async () => {
  const pair = generateKeypair(),
    secret = pair.secret_key;
  pair.free();
  try {
    const { memo, descriptor } = await encodeMailboxCapsule(context, secret);
    for (const change of [
      { controller: "d".repeat(64) },
      { postbox: "other" },
      { network: 38 },
      { registry: `component_${"e".repeat(64)}` },
      { template: "f".repeat(64) },
      { keyVersion: 2 },
    ])
      await expect(
        recoverMailboxCapsule({ ...context, ...change }, memo, descriptor),
      ).rejects.toThrow("does not match");
  } finally {
    secret.fill(0);
  }
});
test("capsule checks published public key and keeps secret out of failure messages", async () => {
  const pair = generateKeypair(),
    secret = pair.secret_key,
    other = generateKeypair();
  pair.free();
  try {
    const { memo, descriptor } = await encodeMailboxCapsule(context, secret);
    const { descriptor: wrong } = await encodeMailboxCapsule(
      context,
      other.secret_key,
    );
    await expect(recoverMailboxCapsule(context, memo, wrong)).rejects.toThrow(
      "does not match",
    );
    await expect(
      recoverMailboxCapsule(
        context,
        { Message: memo.Message + "invalid" },
        descriptor,
      ),
    ).rejects.toThrow(/^Mailbox recovery capsule does not match/);
  } finally {
    secret.fill(0);
    other.free();
  }
});
test("browser letter opening rejects ciphertext tampering and changed envelope identity", async () => {
  const pair = generateKeypair(),
    secret = pair.secret_key;
  pair.free();
  try {
    const { descriptor } = await encodeMailboxCapsule(context, secret);
    const payload = await sealMailbox(
      { subject: "Secret", body: "Body" },
      context,
      "id",
      descriptor,
    );
    const ciphertext = fromBase64url(payload.ciphertext);
    ciphertext[0] ^= 1;
    await expect(
      openMailbox(
        { ...payload, ciphertext: base64url(ciphertext) },
        context,
        "id",
        secret,
      ),
    ).rejects.toThrow();
    await expect(
      openMailbox(payload, context, "another-id", secret),
    ).rejects.toThrow();
  } finally {
    secret.fill(0);
  }
});
