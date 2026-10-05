import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { WalletDaemonClient } from "@tari-project/wallet_jrpc_client";
import {
  TransactionBuilder,
  Network,
  intLiteral,
  templateAddressLiteral,
} from "@tari-project/ootle";
import { endpoint } from "../src/core/config";
import { money } from "../src/core/transactions";
const args = process.argv.slice(2),
  submit = args.includes("--submit"),
  dry = args.includes("--dry-run"),
  create = args.includes("--create-registry");
if (submit && dry) throw new Error("Select dry-run or submit");
const config = JSON.parse(
  await fs.readFile(
    args.find((x) => x.endsWith(".json")) || "deployment-plan.example.json",
    "utf8",
  ),
);
if (config.network !== 16)
  throw new Error("This isolated development tool permits localnet only");
const url = endpoint(config.daemonUrl, true);
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Use an isolated loopback development daemon");
const binaries = [
  [
    "Envelope",
    "contracts/envelope/target/wasm32-unknown-unknown/release/ghostdrop_envelope.wasm",
  ],
  [
    "PostOffice",
    "contracts/ghostdrop/target/wasm32-unknown-unknown/release/ghostdrop_template.wasm",
  ],
] as const;
const plan = await Promise.all(
  binaries.map(async ([name, path]) => {
    const binary = await fs.readFile(path);
    return {
      name,
      path,
      binary,
      size: binary.length,
      sha256: createHash("sha256").update(binary).digest("hex"),
    };
  }),
);
console.log(
  JSON.stringify(
    {
      operation: create ? "create-registry" : "publish-templates",
      network: 16,
      feeAccount: config.feeAccount,
      maxFee: config.maxFee,
      binaries: plan.map(({ binary, ...rest }) => rest),
      mode: submit ? "submit" : dry ? "dry-run" : "review-only",
    },
    null,
    2,
  ),
);
if (!submit && !dry) process.exit(0);
if (
  !/^component_[a-f0-9]{64}$/.test(config.feeAccount) ||
  money(config.maxFee) === 0n
)
  throw new Error("Explicit funding account and positive fee cap required");
const key = process.env.GHOSTDROP_DEV_API_KEY;
if (!key?.startsWith("tw_"))
  throw new Error(
    "Provide an isolated development API key through GHOSTDROP_DEV_API_KEY",
  );
const client = WalletDaemonClient.usingFetchTransport(url);
client.authenticateWithApiKey(key);
client.setReauthenticationEnabled(false);
const journalPath = ".deployment-state.local.json";
let journal: Record<
  string,
  { state: string; txId?: string; identity: string }
> = {};
try {
  journal = JSON.parse(await fs.readFile(journalPath, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const persist = async () => {
  await fs.writeFile(journalPath + ".tmp", JSON.stringify(journal, null, 2));
  await fs.rename(journalPath + ".tmp", journalPath);
};
async function act(
  name: string,
  identity: string,
  fn: () => Promise<{ transaction_id: string }>,
) {
  if (submit && journal[name])
    throw new Error(
      `Existing ${name} attempt: reconcile ${journalPath} before retrying`,
    );
  if (submit) {
    journal[name] = { state: "unknown", identity };
    await persist();
  }
  const response = await fn();
  console.log(
    JSON.stringify({
      name,
      transactionId: response.transaction_id,
      dryRun: dry,
    }),
  );
  if (submit) {
    journal[name] = {
      state: "submitted",
      identity,
      txId: response.transaction_id,
    };
    await persist();
  }
}
try {
  if ((await client.walletGetInfo()).network_byte !== 16)
    throw new Error("Development wallet must be on localnet");
  if (create) {
    if (
      !/^[a-f0-9]{64}$/.test(config.officeTemplate) ||
      !/^[a-f0-9]{64}$/.test(config.envelopeTemplate)
    )
      throw new Error("Record both confirmed template identities first");
    const accounts = await client.accountsList({ offset: 0, limit: 100 });
    const account = accounts.accounts.find(
      (a) => a.account.component_address === config.feeAccount,
    );
    if (!account?.account.owner_key_id)
      throw new Error("Selected account has no daemon signing key");
    // Use an explicitly observed indexer epoch; never guess one or invent an RPC.
    if (!Number.isSafeInteger(config.currentEpoch) || config.currentEpoch < 0)
      throw new Error(
        "Set currentEpoch from your isolated indexer before creating registry",
      );
    const tx = TransactionBuilder.new(
      Network.LocalNet,
      config.currentEpoch + 10,
    )
      .feeTransactionPayFromComponent(config.feeAccount, money(config.maxFee))
      .callFunction(
        { templateAddress: config.officeTemplate, functionName: "new" },
        [intLiteral(16n), templateAddressLiteral(config.envelopeTemplate)],
      )
      .buildUnsignedTransaction();
    const request = {
      transaction: { V1: tx },
      seal_signer: account.account.owner_key_id,
      other_signers: [account.account.owner_key_id],
      signatures: [],
      detect_inputs: true,
      detect_inputs_use_unversioned: true,
      lock_ids: [],
    };
    const simulation = await client.submitTransactionDryRun(request);
    if (
      !("Accept" in simulation.result.finalize.result) ||
      BigInt(simulation.required_fees) > money(config.maxFee)
    )
      throw new Error("Registry dry run rejected or exceeds fee cap");
    await act(
      "registry",
      JSON.stringify([
        config.officeTemplate,
        config.envelopeTemplate,
        config.currentEpoch,
      ]),
      () =>
        dry ? Promise.resolve(simulation) : client.submitTransaction(request),
    );
  } else
    for (const p of plan) {
      const request = {
        binary: p.binary.toString("base64"),
        fee_account: config.feeAccount,
        max_fee: config.maxFee,
        detect_inputs: true,
        dry_run: true,
      };
      const simulation = await client.publishTemplate(request);
      if (
        simulation.dry_run_fee === null ||
        BigInt(simulation.dry_run_fee) > money(config.maxFee)
      )
        throw new Error("Template dry run exceeds cap");
      await act(p.name, p.sha256, () =>
        dry
          ? Promise.resolve(simulation)
          : client.publishTemplate({ ...request, dry_run: false }),
      );
    }
} finally {
  client.setToken("");
}
