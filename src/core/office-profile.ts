import type { Deployment } from "./types";
import { readWithTimeout } from "./read-timeout";

// Shape validation prevents a damaged static asset from crashing the UI. This
// does not establish contract identity or replace the reviewed evidence gates.
export function officeProfile(value: unknown): Deployment {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid post office settings");
  const d = value as Record<string, unknown>;
  const evidence = d.evidence as Record<string, unknown> | undefined;
  if (
    ![16, 36, 38].includes(d.network as number) ||
    ["registry", "template", "envelopeTemplate", "indexerUrl", "resource"].some(
      (key) => typeof d[key] !== "string",
    ) ||
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence) ||
    [
      "engineClaims",
      "guestPayout",
      "daemonScopes",
      "httpsWallet",
      "mailboxRecovery",
    ].some((key) => typeof evidence[key] !== "boolean") ||
    [
      "guestAccountCreation",
      "sapientWallet",
      "postboxClaims",
      "mailboxState",
    ].some(
      (key) =>
        evidence[key] !== undefined && typeof evidence[key] !== "boolean",
    ) ||
    (d.postboxClaimProtocol !== undefined &&
      d.postboxClaimProtocol !== "sapient-proof-1")
  )
    throw new Error("Invalid post office settings");
  if (
    d.contractProtocol !== undefined &&
    (d.contractProtocol !== "unified-1" || d.template !== d.envelopeTemplate)
  )
    throw new Error("Invalid unified post office settings");
  if (d.capsule !== undefined) {
    const capsule = d.capsule as Record<string, unknown> | null;
    if (
      !capsule ||
      typeof capsule !== "object" ||
      Array.isArray(capsule) ||
      ["template", "component", "resource"].some(
        (key) => typeof capsule[key] !== "string",
      )
    )
      throw new Error("Invalid post office recovery settings");
  }
  if (
    d.contractProtocol === "unified-1" &&
    (!d.capsule ||
      (d.capsule as Record<string, unknown>).template !== d.template ||
      (d.capsule as Record<string, unknown>).component !== d.registry)
  )
    throw new Error(
      "Unified recovery must use the same post office template and component",
    );
  return value as Deployment;
}

export function loadOfficeProfile(url: string): Promise<Deployment> {
  return readWithTimeout(
    fetch(url, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Post office settings unavailable");
      return officeProfile(await response.json());
    }),
  );
}
