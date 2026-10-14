// Public synthetic test key (scalar 1). Never use it for a wallet or deployment.
import { publicKeyFromSecretKey } from "@tari-project/ootle-wasm";
import { hex } from "../src/core/crypto";
import {
  sealAddressedRoute,
  openAddressedRoute,
  type SealedAddressEnvelope,
} from "../src/core/sealed-addressing";
const secret = new Uint8Array(32);
secret[0] = 1;
const command = process.argv[2];
let input = "";
for await (const chunk of process.stdin) input += String(chunk);
const value = JSON.parse(input);
const letter = {
  version: "mm-route-1" as const,
  recipientPostbox: "private-engine-inbox",
  keyVersion: 2,
  letter: {
    subject: "Native sealed delivery",
    body: "Recipient and reply identities are encrypted inside the route.",
  },
  reply: {
    publicKey: hex(publicKeyFromSecretKey(secret)),
    conversation: "ab".repeat(32),
  },
};
try {
  if (command === "create")
    process.stdout.write(
      JSON.stringify(
        await sealAddressedRoute(
          letter,
          hex(publicKeyFromSecretKey(secret)),
          value.context,
          value.id,
        ),
      ),
    );
  else if (command === "open") {
    const opened = await openAddressedRoute(
      value.payload as SealedAddressEnvelope,
      secret,
      value.context,
      value.id,
    );
    if (JSON.stringify(opened) !== JSON.stringify(letter))
      throw new Error("Native engine payload did not recover its exact route");
    process.stdout.write(JSON.stringify({ recovered: true }));
  } else throw new Error("Choose create or open");
} finally {
  secret.fill(0);
}
