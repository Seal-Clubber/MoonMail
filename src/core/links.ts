import type { Context } from "./types";
import { fromBase64url, base64url } from "./crypto";
import { supportedNetwork } from "./network-id";
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
  const [path, query, extra] = hash.slice(1).split("?");
  const parts = path.split("/");
  if (parts.length !== 4 || !parts[2] || !parts[3])
    throw new Error("A private letter needs its complete private link");
  const capability = parts[3];
  const raw = fromBase64url(capability);
  if (raw.length !== 32 || base64url(raw) !== capability)
    throw new Error("Invalid private-link capability");
  // Some Markdown editors escape query separators when links are pasted.
  // Normalize only the separator before our known context fields; never
  // alter the private capability, identifier or the authenticated context.
  const q = new URLSearchParams(
    query?.replace(/(?:\\|%5c)&(?=(?:network|registry|template)=)/gi, "&"),
  );
  const rawNetwork = q.get("network");
  const network = Number(rawNetwork);
  const registry = q.get("registry") || "",
    template = q.get("template") || "";
  if (
    extra !== undefined ||
    rawNetwork !== String(network) ||
    ["network", "registry", "template"].some(
      (key) => q.getAll(key).length !== 1,
    ) ||
    !supportedNetwork(network) ||
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
