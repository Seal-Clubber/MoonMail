import { emptyDeployment, endpoint } from "./config";
import type { Deployment } from "./types";

export const publicIndexer = "https://ootle-indexer-a.tari.com/";
export const testTariResource = `resource_${"01".repeat(32)}`;
export function networkPreset(network: number): Deployment {
  if (![16, 36, 38].includes(network))
    throw new Error("Unsupported test network");
  return {
    ...emptyDeployment,
    network,
    indexerUrl:
      network === 38
        ? publicIndexer
        : network === 16
          ? "http://localhost:12500/"
          : "",
    resource: testTariResource,
    evidence: { ...emptyDeployment.evidence },
  };
}

export async function checkPublicIndexer(deployment: Deployment) {
  const base = new URL(
    endpoint(deployment.indexerUrl, deployment.network === 16),
  );
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  if (!/^resource_[a-f0-9]{64}$/.test(deployment.resource))
    throw new Error("Choose a valid test asset resource");
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
    typeof asset.resource?.metadata?.SYMBOL !== "string"
  )
    throw new Error("Unsupported indexer network or resource response");
  return {
    network: String(network.network),
    epoch: network.epoch as number,
    version: String(health.version),
    symbol: String(asset.resource.metadata.SYMBOL),
  };
}
