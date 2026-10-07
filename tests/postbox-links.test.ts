import { describe, it, expect } from "vitest";
import { createPostboxLink, parsePostboxLink } from "../src/core/postbox-links";
const context = {
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
};
const route = { id: "a-friend", context };
const hash = new URL(createPostboxLink("https://example.com/GhostDrop/", route))
  .hash;
describe("public postbox invitations", () => {
  it("preserves a Pages or mirror path and uses only the fragment for the recipient and context", () => {
    for (const base of [
      "https://example.com/GhostDrop/?discard=1#/old",
      "https://mirror.example/subpath",
      "http://127.0.0.1:4173/GhostDrop/",
    ]) {
      const u = new URL(createPostboxLink(base, route));
      expect(u.search).toBe("");
      expect(u.pathname.endsWith("/")).toBe(true);
      expect(parsePostboxLink(u.hash)).toEqual(route);
      expect(u.hash).not.toContain("indexer");
      expect(u.hash).not.toContain("capability");
    }
  });
  it("encodes special ID characters and counts UTF-8 bytes against the on-chain limit", () => {
    for (const id of ["friend /?#&", "幽".repeat(21), "a".repeat(64)])
      expect(
        parsePostboxLink(
          new URL(createPostboxLink("https://example.com/", { id, context }))
            .hash,
        )?.id,
      ).toBe(id);
    for (const id of [
      "",
      "a".repeat(65),
      "幽".repeat(22),
      "box\nfriend",
      "\u0000",
    ])
      expect(() =>
        createPostboxLink("https://example.com/", { id, context }),
      ).toThrow();
  });
  it("rejects insecure frontends and embedded credentials", () => {
    for (const base of [
      "http://unsafe.example/",
      "https://user:pass@example.com/",
      "javascript:alert(1)",
      "file:///example/",
    ])
      expect(() => createPostboxLink(base, route)).toThrow();
  });
  it("keeps network, registry and template bound without accepting an endpoint in the link", () => {
    for (const network of [16, 36, 38])
      expect(
        parsePostboxLink(
          new URL(
            createPostboxLink("https://example.com/", {
              id: route.id,
              context: { ...context, network },
            }),
          ).hash,
        )?.context.network,
      ).toBe(network);
    for (const change of [
      { network: 0 },
      { registry: "anything" },
      { template: "template_" + context.template },
    ])
      expect(() =>
        createPostboxLink("https://example.com/", {
          id: route.id,
          context: { ...context, ...change },
        }),
      ).toThrow();
    expect(() =>
      parsePostboxLink(hash + "&indexer=https://foreign.example"),
    ).toThrow("Invalid postbox invitation");
  });
  it("rejects missing, duplicated, aliased and unsupported deployment parameters", () => {
    for (const bad of [
      hash.replace("network=38", "network=038"),
      hash.replace("network=38", "network=0"),
      hash.replace("network=38&", ""),
      hash + "&network=38",
      hash + "&registry=" + context.registry,
      hash.replace(context.template, "x"),
      hash + "?extra",
    ])
      expect(() => parsePostboxLink(bad)).toThrow("Invalid postbox invitation");
  });
  it("rejects malformed or misleading IDs without accepting a private-link path", () => {
    for (const path of [
      "#/postbox/",
      "#/postbox/a/extra",
      "#/postbox/%ZZ",
      "#/postbox/%0A",
      "#/postbox/" + "x".repeat(65),
    ])
      expect(() =>
        parsePostboxLink(path + hash.slice(hash.indexOf("?"))),
      ).toThrow("Invalid postbox invitation");
    expect(parsePostboxLink("#/letter/id/private-key")).toBeNull();
    expect(parsePostboxLink("#/postboxes")).toBeNull();
    expect(() => parsePostboxLink(hash + "&capability=private-key")).toThrow();
  });
});
