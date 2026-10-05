import type { Context } from "./types";
import { fromBase64url, base64url } from "./crypto";
export interface LinkRoute {
  id: string;
  capability: string;
  context: Context;
}
export function createGiftLink(base: string, route: LinkRoute) {
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
  u.search = "";
  u.hash = "";
  if (!u.pathname.endsWith("/")) u.pathname += "/";
  u.hash = `/letter/${encodeURIComponent(route.id)}/${route.capability}?network=${route.context.network}&registry=${route.context.registry}&template=${route.context.template}`;
  return u.href;
}
export function parseGiftLink(hash: string): LinkRoute | null {
  if (!hash.startsWith("#/letter/")) return null;
  const [path, query] = hash.slice(1).split("?");
  const parts = path.split("/");
  if (parts.length !== 4 || !parts[2] || !parts[3])
    throw new Error("A private letter needs its complete private link");
  const capability = parts[3];
  const raw = fromBase64url(capability);
  if (raw.length !== 32 || base64url(raw) !== capability)
    throw new Error("Invalid private-link capability");
  const q = new URLSearchParams(query);
  const network = Number(q.get("network"));
  const registry = q.get("registry") || "",
    template = q.get("template") || "";
  if (
    !q.has("network") ||
    ![16, 38, 36].includes(network) ||
    !/^component_[a-f0-9]{64}$/.test(registry) ||
    !/^[a-f0-9]{64}$/.test(template)
  )
    throw new Error("Missing or unsupported deployment context");
  return {
    id: decodeURIComponent(parts[2]),
    capability,
    context: { network, registry, template },
  };
}
export function sameContext(a: Context, b: Context) {
  return (
    a.network === b.network &&
    a.registry === b.registry &&
    a.template === b.template
  );
}
