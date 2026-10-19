import { describe, it, expect } from "vitest";
import {
  sealLetter,
  openLetter,
  fromBase64url,
  assertEnvelopeSize,
} from "../src/core/crypto";
import { createGiftLink, parseGiftLink } from "../src/core/links";
const context = {
  network: 16,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
};
describe("private link gd-link-1", () => {
  it.each(["\\&", "%5C&"])(
    "accepts a pasted %s context separator without changing the capability",
    async (separator) => {
      const sealed = await sealLetter(
        { subject: "Fixture", body: "Local only" },
        context,
        "pasted-link",
      );
      const link = new URL(
        createGiftLink("https://example.com/MoonMail/", {
          id: "pasted-link",
          capability: sealed.capability,
          context,
        }),
      );
      const original = parseGiftLink(link.hash)!;
      const pasted = link.hash.replaceAll("&", separator);
      expect(parseGiftLink(pasted)).toEqual(original);
      expect(() =>
        parseGiftLink(pasted.replace(context.template, "bad")),
      ).toThrow();
      expect(() =>
        parseGiftLink(
          pasted.replace(sealed.capability, sealed.capability + "\\"),
        ),
      ).toThrow();
    },
  );
  it("encrypts subject and message, unwraps a real Tari claim key in a second client", async () => {
    const { payload, capability } = await sealLetter(
      { subject: "Secret subject", body: "Never publish this plaintext" },
      context,
      "id-1",
    );
    expect(fromBase64url(capability)).toHaveLength(32);
    expect(JSON.stringify(payload)).not.toContain("Secret subject");
    expect(JSON.stringify(payload)).not.toContain(capability);
    const opened = await openLetter(
      structuredClone(payload),
      capability,
      context,
      "id-1",
    );
    expect(opened.letter.subject).toBe("Secret subject");
    expect(opened.claimSecret).toHaveLength(32);
    opened.claimSecret.fill(0);
  });
  it("rejects wrong link, modified ciphertext, different ID/network/contract", async () => {
    const first = await sealLetter({ subject: "s", body: "b" }, context, "id"),
      second = await sealLetter({ subject: "s", body: "b" }, context, "id");
    await expect(
      openLetter(first.payload, second.capability, context, "id"),
    ).rejects.toThrow();
    const modified = {
      ...first.payload,
      ciphertext:
        (first.payload.ciphertext[0] === "A" ? "B" : "A") +
        first.payload.ciphertext.slice(1),
    };
    await expect(
      openLetter(modified, first.capability, context, "id"),
    ).rejects.toThrow();
    for (const [ctx, id] of [
      [context, "other"],
      [{ ...context, network: 38 }, "id"],
      [{ ...context, registry: `component_${"c".repeat(64)}` }, "id"],
      [{ ...context, template: "c".repeat(64) }, "id"],
    ] as const)
      await expect(
        openLetter(first.payload, first.capability, ctx, id),
      ).rejects.toThrow();
  });
  it("uses fresh IVs and verifies the decrypted signing key public identity", async () => {
    const a = await sealLetter({ subject: "s", body: "b" }, context, "id"),
      b = await sealLetter({ subject: "s", body: "b" }, context, "id");
    expect(a.payload.iv).not.toBe(b.payload.iv);
    expect(a.payload.wrapIv).not.toBe(a.payload.iv);
    await expect(
      openLetter(
        { ...a.payload, claimPublicKey: b.payload.claimPublicKey },
        a.capability,
        context,
        "id",
      ),
    ).rejects.toThrow("authority");
  });
  it("enforces serialized envelope limits", () =>
    expect(() => assertEnvelopeSize({ body: "x".repeat(4096) })).toThrow(
      "4 KiB",
    ));
  it("keeps capability only in fragment and preserves Pages subpath/deployment", async () => {
    const { capability } = await sealLetter(
      { subject: "s", body: "b" },
      context,
      "id",
    );
    const link = createGiftLink("https://owner.github.io/repo/", {
      id: "id",
      capability,
      context,
    });
    const u = new URL(link);
    expect(u.pathname).toBe("/repo/");
    expect(u.search).toBe("");
    expect(`${u.origin}${u.pathname}${u.search}`).not.toContain(capability);
    expect(parseGiftLink(u.hash)).toEqual({ id: "id", capability, context });
    expect(parseGiftLink("#/hall")).toBeNull();
    expect(() => parseGiftLink("#/letter/id")).toThrow();
    expect(() =>
      createGiftLink("http://unsafe.example/", {
        id: "id",
        capability,
        context,
      }),
    ).toThrow("HTTPS");
  });
});
