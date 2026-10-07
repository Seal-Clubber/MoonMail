// Public-only local engine fixture. No RPC, wallet seed or controller private key.
import { Network, signTransaction, sealTransaction } from "@tari-project/ootle";
import { EphemeralKeySigner } from "@tari-project/ootle-secret-key-wallet";
import {
  postboxClaimChallenge,
  postboxProofClaimTransaction,
} from "../src/core/postbox-claim";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const f = JSON.parse(input);
if (f.envelope.context.network !== Network.LocalNet)
  throw new Error("This test bridge permits localnet only");
const challenge = postboxClaimChallenge(f.envelope, f.destination, f.expiry);
if (challenge !== f.expectedChallenge)
  throw new Error("Contract/client challenge mismatch");
const tx = postboxProofClaimTransaction(
  f.envelope,
  f.destination,
  f.expiry,
  0,
  f.proof,
);
tx.inputs = f.inputs;
const signed = await signTransaction(
  [EphemeralKeySigner.generate(Network.LocalNet)],
  tx,
);
process.stdout.write(
  JSON.stringify({
    json: JSON.parse(signed.sealedJson),
    bor: Buffer.from(sealTransaction(signed), "base64").toString("hex"),
    challenge,
  }),
);
