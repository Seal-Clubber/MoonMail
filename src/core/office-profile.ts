import type { Deployment } from "./types";
import { readWithTimeout } from "./read-timeout";
import { unifiedOffice } from "./config";
import { ESMERALDA, MAINNET, supportedNetwork } from "./network-id";

// Shape validation prevents a damaged static asset from crashing the UI. This
// does not establish contract identity or replace the reviewed evidence gates.
export function officeProfile(value: unknown): Deployment {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid post office settings");
  const d = value as Record<string, unknown>;
  const evidence = d.evidence as Record<string, unknown> | undefined;
  if (
    !supportedNetwork(d.network) ||
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
      "nativePrivatePostage",
      "nativePrivatePayments",
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
    (!["unified-1", "unified-2"].includes(d.contractProtocol as string) ||
      d.template !== d.envelopeTemplate)
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
    unifiedOffice(value as Deployment) &&
    (!d.capsule ||
      (d.capsule as Record<string, unknown>).template !== d.template ||
      (d.capsule as Record<string, unknown>).component !== d.registry)
  )
    throw new Error(
      "Unified recovery must use the same post office template and component",
    );
  if (d.contractProtocol === "unified-2") {
    const sealed = d.sealedDelivery;
    if (
      !sealed ||
      typeof sealed !== "object" ||
      Array.isArray(sealed) ||
      Object.keys(sealed).sort().join() !==
        "engine,recovery,sentAndReplies,stockSapient" ||
      Object.values(sealed).some((v) => typeof v !== "boolean")
    )
      throw new Error("Invalid sealed delivery evidence");
  } else if (d.sealedDelivery !== undefined)
    throw new Error("Sealed evidence requires its separate V4 protocol");
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

export async function loadSiteOffice(
  base: string,
  network?: typeof MAINNET | typeof ESMERALDA,
) {
  const file = network === ESMERALDA ? "deployment-v4.json" : "deployment.json";
  const profile = await loadOfficeProfile(`${base}${file}`);
  if (network !== undefined && profile.network !== network)
    throw new Error("Post office settings are for another Ootle network");
  return profile;
}
