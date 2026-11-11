export const MAINNET = 0;
export const ESMERALDA = 38;

export function supportedNetwork(value: unknown): value is number {
  return (
    value === MAINNET || value === ESMERALDA || value === 36 || value === 16
  );
}

export function networkLabel(network: number) {
  switch (network) {
    case MAINNET:
      return "Mainnet";
    case ESMERALDA:
      return "Esmeralda testnet";
    case 36:
      return "Igor testnet";
    default:
      return "Localnet";
  }
}

export function tariUnit(network: number) {
  return network === MAINNET ? "TARI" : "test TARI";
}
