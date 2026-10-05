import { WalletDaemonClient } from "@tari-project/wallet_jrpc_client";
import { endpoint } from "./config";
export type WalletAccount = Awaited<
  ReturnType<WalletDaemonClient["accountsList"]>
>["accounts"][number];
export class WalletSession {
  private client: WalletDaemonClient;
  readonly accounts: WalletAccount[];
  readonly version: string;
  readonly network: number;
  private constructor(
    client: WalletDaemonClient,
    accounts: WalletAccount[],
    info: { version: string; network_byte: number },
  ) {
    this.client = client;
    this.accounts = accounts;
    this.version = info.version;
    this.network = info.network_byte;
  }
  static async connect(url: string, apiKey: string, network: number) {
    if (!apiKey.startsWith("tw_"))
      throw new Error("Use a scoped daemon API key beginning tw_");
    const client = WalletDaemonClient.usingFetchTransport(endpoint(url, true));
    client.authenticateWithApiKey(apiKey);
    client.setReauthenticationEnabled(false);
    try {
      const info = await client.walletGetInfo();
      if (info.network_byte !== network)
        throw new Error("Wallet is on a different Ootle network");
      const accounts: WalletAccount[] = [];
      for (let offset = 0; offset < 1000; offset += 100) {
        const page = await client.accountsList({ offset, limit: 100 });
        accounts.push(...page.accounts);
        if (accounts.length >= page.total) break;
      }
      if (!accounts.length) throw new Error("No accessible funding accounts");
      return new WalletSession(client, accounts, info);
    } catch {
      client.setToken("");
      throw new Error(
        "Wallet connection failed. Check network, API-key scope/expiry, CORS preflight and browser local-network permission. Credentials were cleared.",
      );
    }
  }
  disconnect() {
    this.client.setToken("");
  }
  submitDryRun(
    request: Parameters<WalletDaemonClient["submitTransactionDryRun"]>[0],
  ) {
    return this.client.submitTransactionDryRun(request);
  }
  submit(request: Parameters<WalletDaemonClient["submitTransaction"]>[0]) {
    return this.client.submitTransaction(request);
  }
  result(id: string) {
    return this.client.getTransactionResult({ transaction_id: id });
  }
}
