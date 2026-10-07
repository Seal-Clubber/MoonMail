import type { Context } from "./types";

export interface PostboxRoute {
  id: string;
  context: Context;
}
function validId(id: string) {
  return (
    !!id &&
    new TextEncoder().encode(id).length <= 64 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(id)
  );
}
function validContext(context: Context) {
  return (
    [16, 38, 36].includes(context.network) &&
    /^component_[a-f0-9]{64}$/.test(context.registry) &&
    /^[a-f0-9]{64}$/.test(context.template)
  );
}
export function createPostboxLink(base: string, route: PostboxRoute) {
  const u = new URL(base);
  if (
    u.username ||
    u.password ||
    (u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      ))
  )
    throw new Error("Use an HTTPS frontend");
  if (!validId(route.id) || !validContext(route.context))
    throw new Error("Invalid postbox invitation");
  u.search = "";
  u.hash = "";
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  const q = new URLSearchParams({
    network: String(route.context.network),
    registry: route.context.registry,
    template: route.context.template,
  });
  u.hash = `/postbox/${encodeURIComponent(route.id)}?${q}`;
  return u.href;
}
export function parsePostboxLink(hash: string): PostboxRoute | null {
  if (!hash.startsWith("#/postbox/")) return null;
  try {
    if (hash.length > 1024) throw new Error();
    const [path, query, extra] = hash.slice(1).split("?");
    const parts = path.split("/");
    const q = new URLSearchParams(query);
    if (
      parts.length !== 3 ||
      extra !== undefined ||
      !parts[2] ||
      [...q.keys()].some(
        (key) => !["network", "registry", "template"].includes(key),
      ) ||
      ["network", "registry", "template"].some(
        (key) => q.getAll(key).length !== 1,
      ) ||
      !/^(16|38|36)$/.test(q.get("network") || "")
    )
      throw new Error();
    const route = {
      id: decodeURIComponent(parts[2]),
      context: {
        network: Number(q.get("network")),
        registry: q.get("registry")!,
        template: q.get("template")!,
      },
    };
    if (!validId(route.id) || !validContext(route.context)) throw new Error();
    return route;
  } catch {
    throw new Error(
      "Invalid postbox invitation. Ask your friend for a complete postbox link.",
    );
  }
}
