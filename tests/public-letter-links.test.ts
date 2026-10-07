import { it, expect } from "vitest";
import {
  createPublicLetterLink,
  parsePublicLetterLink,
} from "../src/core/public-letter-links";
const context = {
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
};
it("public letter links preserve frontend paths, carry only public context and round-trip escaped IDs", () => {
  for (const base of [
    "https://example.com/GhostDrop/?old=1#/old",
    "https://mirror.example/subpath",
    "http://127.0.0.1:4173/GhostDrop/",
  ]) {
    const u = new URL(
      createPublicLetterLink(base, { id: "public /?#&", context }),
    );
    expect(u.pathname.endsWith("/")).toBe(true);
    expect(u.search).toBe("");
    expect(parsePublicLetterLink(u.hash)).toEqual({
      id: "public /?#&",
      context,
    });
    expect(u.hash.startsWith("#/mail/")).toBe(true);
    expect(u.hash).not.toContain("capability");
  }
});
it("public parsing rejects incomplete, private, polluted and invalid deployment links", () => {
  const hash = new URL(
    createPublicLetterLink("https://example.com/", { id: "public", context }),
  ).hash;
  expect(parsePublicLetterLink("#/letter/id/private-key")).toBeNull();
  expect(parsePublicLetterLink("#/postbox/friend")).toBeNull();
  for (const value of [
    "#/mail/public",
    hash + "&capability=secret",
    hash + "&network=38",
    hash.replace(context.registry, "component_bad"),
    hash.replace("network=38", "network=0"),
    hash.replace("/public?", "/%ZZ?"),
  ])
    expect(() => parsePublicLetterLink(value)).toThrow(
      "Invalid public letter link",
    );
});
it("public link creation rejects insecure or credential-bearing frontend bases", () => {
  for (const base of [
    "http://untrusted.example/",
    "https://user:pass@example.com/",
    "file:///GhostDrop/",
  ])
    expect(() =>
      createPublicLetterLink(base, { id: "public", context }),
    ).toThrow();
});
