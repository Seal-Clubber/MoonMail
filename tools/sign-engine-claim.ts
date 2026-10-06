// Engine bridge: accepts only an isolated test fixture through stdin. No RPC.
import { signTransaction, sealTransaction, Network } from "@tari-project/ootle";
import { SecretKeyWallet } from "@tari-project/ootle-secret-key-wallet";
import {
  claimTransaction,
  claimToNewAccountTransaction,
  publishTransaction,
} from "../src/core/transactions";
import { emptyDeployment } from "../src/core/config";
import { sealLetter, openLetter } from "../src/core/crypto";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const f = JSON.parse(input);
const d = {
  ...emptyDeployment,
  network: 16,
  registry: f.registry || "",
  template: f.template || "",
  resource: f.resource || "",
};
let capability: string | undefined;
let claimSecret = f.testSecret
  ? Uint8Array.from(Buffer.from(f.testSecret, "hex"))
  : undefined;
let tx;
if (f.operation === "publish") {
  const sealed = await sealLetter(
    {
      subject: "Hidden engine letter",
      body: "A complete encrypted letter stored on Ootle.",
    },
    d,
    "js-roundtrip",
  );
  capability = sealed.capability;
  tx = publishTransaction(
    d,
    {
      id: "js-roundtrip",
      mode: "link",
      context: d,
      payload: sealed.payload,
      gift: "1000000",
      reserve: "1000000",
      claimed: false,
      sender: "",
    },
    f.account,
    "1000000",
    0,
  );
} else {
  if (f.capability) {
    const opened = await openLetter(f.payload, f.capability, d, "js-roundtrip");
    claimSecret = opened.claimSecret;
    if (opened.letter.subject !== "Hidden engine letter")
      throw new Error("Letter mismatch");
  }
  tx = f.newAccountPublicKey
    ? claimToNewAccountTransaction(d, f.component, f.newAccountPublicKey, 0)
    : claimTransaction(d, f.component, f.destination, 0);
}
tx.inputs = f.inputs;
if (!claimSecret) throw new Error("Isolated signer key missing");
const signer = SecretKeyWallet.fromSecretKey(claimSecret, Network.LocalNet);
const signed = await signTransaction([signer], tx);
process.stdout.write(
  JSON.stringify({
    json: JSON.parse(signed.sealedJson),
    bor: Buffer.from(sealTransaction(signed), "base64").toString("hex"),
    capability,
  }),
);
claimSecret.fill(0);
