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
    sapientWallet: false,
    mailboxRecovery: false,
    postboxClaims: false,
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
  provider: "daemon" | "sapient" = "daemon",
) {
  return (
    deploymentReady(d) &&
    (provider === "sapient"
      ? d.evidence.sapientWallet === true
      : d.evidence.daemonScopes === true && d.evidence.httpsWallet === true) &&
    (mode !== "postbox" ||
      (d.evidence.mailboxRecovery === true &&
        (provider !== "sapient" ||
          (!!d.capsule &&
            /^[a-f0-9]{64}$/.test(d.capsule.template) &&
            /^component_[a-f0-9]{64}$/.test(d.capsule.component) &&
            /^resource_[a-f0-9]{64}$/.test(d.capsule.resource)))))
  );
}
export function postboxClaimsReady(
  d: Deployment,
  provider: "daemon" | "sapient",
) {
  return (
    writesReady(d, "postbox", provider) &&
    (provider === "daemon" ||
      (d.postboxClaimProtocol === "sapient-proof-1" &&
        d.evidence.postboxClaims === true &&
        d.resource === `resource_${"01".repeat(32)}`))
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

export function mailboxStateReady(d: Deployment) {
  return (
    d.contractProtocol === "unified-1" &&
    d.template === d.envelopeTemplate &&
    d.evidence.mailboxState === true &&
    writesReady(d, "postbox", "sapient")
  );
}
export function letterLimit(d: Deployment): 4096 | 32768 {
  return d.contractProtocol === "unified-1" ? 32768 : 4096;
}
