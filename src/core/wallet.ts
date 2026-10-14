import { WalletDaemonClient } from "@tari-project/wallet_jrpc_client";
import { endpoint } from "./config";
import type {
  Letter,
  MailboxContext,
  MailboxKey,
  MailboxPayload,
} from "./types";
import { mailboxKey } from "./mailbox";
import { NativeMailboxAdapter } from "./native-mailbox";
type DaemonAccount = Awaited<
  ReturnType<WalletDaemonClient["accountsList"]>
>["accounts"][number];
export type WalletAccount = Pick<DaemonAccount, "address"> & {
  account: Pick<
    DaemonAccount["account"],
    "name" | "component_address" | "owner_public_key" | "owner_key_id"
  >;
};
export type ConnectedWallet =
  | WalletSession
  | import("./sapient").SapientSession;
export class WalletSession {
  readonly kind = "daemon" as const;
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
    client.setReauthenticationEnabled(false);
    client.authenticateWithApiKey(apiKey);
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
  private async postboxCall<T>(
    method: "public_key" | "decrypt",
    params: unknown,
  ): Promise<T> {
    const token = this.client.getToken();
    if (!token)
      throw new Error("Connect the controlling wallet to open a postbox");
    const result = await this.client
      .getTransport()
      .sendRequest<T>(
        { jsonrpc: "2.0", id: 1, method: `postboxes.${method}`, params },
        { token, timeout_millis: 15000 },
      );
    if (result.error || result.result === undefined) {
      throw new Error(
        result.error?.code === -32601
          ? "Legacy postbox recovery needs the archived wallet extension"
          : "Postbox operation failed: verify controller, key version, context and the account-scoped postbox permission",
      );
    }
    if (this.client.getToken() !== token)
      throw new Error("Wallet session changed; reopen the letter");
    return result.result;
  }
  async postboxPublicKey(
    account: string,
    context: MailboxContext,
  ): Promise<MailboxKey> {
    return mailboxKey(
      await this.postboxCall("public_key", { account, context }),
    );
  }
  async decryptPostbox(
    account: string,
    context: MailboxContext,
    envelopeId: string,
    payload: MailboxPayload,
  ): Promise<Letter> {
    if (payload.recovery === "native-memo-1")
      return this.nativeMailbox().open(account, context, envelopeId, payload);
    const letter = await this.postboxCall<Letter>("decrypt", {
      account,
      context,
      envelopeId,
      payload,
    });
    if (typeof letter.subject !== "string" || typeof letter.body !== "string")
      throw new Error("Invalid wallet letter response");
    return letter;
  }
  nativeMailbox() {
    return new NativeMailboxAdapter(this.client, this.accounts, this.network);
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
