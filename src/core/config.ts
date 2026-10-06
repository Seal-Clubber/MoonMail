import type { Deployment } from "./types";
export const emptyDeployment: Deployment = {
  network: 16,
  registry: "",
  template: "",
  envelopeTemplate: "",
  indexerUrl: "",
  resource: "",
  evidence: {
    engineClaims: false,
    guestPayout: false,
    guestAccountCreation: false,
    daemonScopes: false,
    httpsWallet: false,
    mailboxRecovery: false,
  },
};
function deploymentReady(d: Deployment) {
  return (
    [16, 36, 38].includes(d.network) &&
    /^component_[a-f0-9]{64}$/.test(d.registry) &&
    /^[a-f0-9]{64}$/.test(d.template) &&
    /^[a-f0-9]{64}$/.test(d.envelopeTemplate) &&
    /^resource_[a-f0-9]{64}$/.test(d.resource) &&
    !!d.indexerUrl &&
    d.evidence.engineClaims === true &&
    d.evidence.guestPayout === true
  );
}
export function claimsReady(d: Deployment, createAccount = false) {
  return (
    deploymentReady(d) &&
    (!createAccount || d.evidence.guestAccountCreation === true)
  );
}
export function writesReady(
  d: Deployment,
  mode: "public" | "link" | "postbox" = "link",
) {
  return (
    deploymentReady(d) &&
    d.evidence.daemonScopes === true &&
    d.evidence.httpsWallet === true &&
    (mode !== "postbox" || d.evidence.mailboxRecovery === true)
  );
}
export function endpoint(value: string, local = false) {
  const u = new URL(value);
  if (u.username || u.password || u.hash || u.search)
    throw new Error(
      "Endpoints cannot contain credentials, queries or fragments",
    );
  if (
    u.protocol !== "https:" &&
    !(
      local &&
      u.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
    )
  )
    throw new Error("Use HTTPS, or HTTP loopback for a local daemon/localnet");
  return u.href;
}
