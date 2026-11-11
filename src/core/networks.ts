import { emptyDeployment, endpoint } from "./config";
import type { Deployment } from "./types";
import { decodeResource } from "@tari-project/ootle";
import { ESMERALDA, MAINNET, supportedNetwork } from "./network-id";

export const publicIndexer = "https://ootle-indexer-a.tari.com/";
export const mainnetIndexer = "https://indexer-a.ootle.tari.com/";
const nativeTariResource = `resource_${"01".repeat(32)}`;
export function networkPreset(network: number): Deployment {
  if (!supportedNetwork(network)) throw new Error("Unsupported Ootle network");
  return {
    ...emptyDeployment,
    network,
    indexerUrl:
      network === ESMERALDA
        ? publicIndexer
        : network === MAINNET
          ? mainnetIndexer
          : network === 16
            ? "http://localhost:12500/"
            : "",
    resource: nativeTariResource,
    evidence: { ...emptyDeployment.evidence },
  };
}

export async function checkPublicIndexer(deployment: Deployment) {
  const base = new URL(
    endpoint(deployment.indexerUrl, deployment.network === 16),
  );
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  if (!/^resource_[a-f0-9]{64}$/.test(deployment.resource))
    throw new Error("Choose a valid asset resource");
  const signal = AbortSignal.timeout(10000);
  async function read(path: string) {
    const response = await fetch(new URL(path, base), {
      signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`Indexer read failed (HTTP ${response.status})`);
    return response.json();
  }
  const [network, health, asset] = await Promise.all([
    read("network"),
    read("health"),
    read(`resources/${deployment.resource}`),
  ]);
  const resource =
    typeof asset.resource === "string"
      ? decodeResource(asset.resource)
      : asset.resource;
  if (network.network_byte !== deployment.network)
    throw new Error(
      "Indexer is on a different network; choose matching settings",
    );
  if (
    health.status !== "ok" ||
    health.db_ok !== true ||
    health.epoch_manager_ok !== true ||
    health.network_ok !== true
  )
    throw new Error(
      "Indexer reports that its network or database is not ready",
    );
  if (
    !Number.isSafeInteger(network.epoch) ||
    network.epoch < 0 ||
    typeof resource?.metadata?.SYMBOL !== "string"
  )
    throw new Error("Unsupported indexer network or resource response");
  return {
    network: String(network.network),
    epoch: network.epoch as number,
    version: String(health.version),
    symbol: String(resource.metadata.SYMBOL),
  };
}
