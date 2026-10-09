// Disposable local-engine signer. No RPC and no production wallet access.
import { Network, signTransaction, sealTransaction } from "@tari-project/ootle";
import { SecretKeyWallet } from "@tari-project/ootle-secret-key-wallet";
import { mailboxStateTransaction } from "../src/core/transactions";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const f = JSON.parse(input);
if (f.deployment.network !== Network.LocalNet)
  throw new Error("This engine bridge permits localnet only");
const secret = new Uint8Array(Buffer.from(f.secret, "hex"));
try {
  const tx = mailboxStateTransaction(
    f.deployment,
    f.account,
    "100000",
    0,
    "home",
    f.ciphertext,
    f.revision,
    f.component,
  );
  tx.inputs = f.inputs;
  const signer = SecretKeyWallet.fromSecretKey(secret, Network.LocalNet);
  const signed = await signTransaction([signer], tx);
  process.stdout.write(
    JSON.stringify({
      bor: Buffer.from(sealTransaction(signed), "base64").toString("hex"),
    }),
  );
} finally {
  secret.fill(0);
}
