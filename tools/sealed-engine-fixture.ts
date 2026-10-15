// Public synthetic test key (scalar 1). Never use it for a wallet or deployment.
import {
  publicKeyFromSecretKey,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { isDeepStrictEqual } from "node:util";
import { hex, unhex } from "../src/core/crypto";
import {
  sealAddressedRoute,
  openAddressedRoute,
  type SealedAddressEnvelope,
} from "../src/core/sealed-addressing";
import {
  sealPrivateMail,
  openPrivateMail,
  type SealedMessage,
} from "../src/core/sealed-mail";
import {
  decodeSealedOffice,
  decodeSealedLetter,
  sealedPublishTransaction,
} from "../src/core/sealed-office";
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
  if (["create2", "open2", "reject2", "codec2", "tx2"].includes(command)) {
    const senderSecret = new Uint8Array(32);
    senderSecret[0] = 2;
    try {
      const message: SealedMessage = {
        version: value.payment ? "mm-message-2" : "mm-message-1",
        recipient: {
          postbox: "private-engine-inbox",
          keyVersion: 2,
          publicKey: hex(publicKeyFromSecretKey(secret)),
        },
        sender: {
          postbox: "private-engine-sent",
          keyVersion: 3,
          publicKey: hex(publicKeyFromSecretKey(senderSecret)),
          controller: value.context.senderPublicKey,
        },
        letter: {
          subject: "Native sealed delivery",
          body: "P".repeat(15000),
          ...(value.payment
            ? {
                privatePayment: {
                  version: "mm-payment-1" as const,
                  kind: "request" as const,
                  nonce: "bc".repeat(32),
                  resource: `resource_${"01".repeat(32)}`,
                  amount: "100000",
                  destination: generateOotleAddress(
                    unhex(value.context.senderPublicKey),
                    publicKeyFromSecretKey(secret),
                    value.context.network,
                  ),
                },
              }
            : {}),
        },
      };
      if (command === "tx2") {
        if (
          value.context.network !== 16 ||
          !/^[a-f0-9]{64}$/.test(value.signerSecret)
        )
          throw new Error("Local engine only; no live wallet signing");
        const { Network, signTransaction, sealTransaction } =
          await import("@tari-project/ootle");
        const { SecretKeyWallet } =
          await import("@tari-project/ootle-secret-key-wallet");
        const signerSecret = new Uint8Array(
          Buffer.from(value.signerSecret, "hex"),
        );
        try {
          const payload = await sealPrivateMail(
            message,
            value.context,
            value.id,
          );
          const profile = {
            ...value.context,
            protocol: "moonmail-sealed-1" as const,
            indexerUrl: "http://127.0.0.1:18200",
            resource: `resource_${"01".repeat(32)}`,
            recoveryResource: value.recoveryResource,
            evidence: {
              engine: false,
              recovery: false,
              stockSapient: false,
              sentAndReplies: false,
              nativePrivatePostage: false,
            },
          };
          const tx = sealedPublishTransaction(
            profile,
            value.id,
            payload,
            value.account,
            "100000",
            0,
          );
          tx.inputs = value.inputs;
          const signed = await signTransaction(
            [SecretKeyWallet.fromSecretKey(signerSecret, Network.LocalNet)],
            tx,
          );
          process.stdout.write(
            JSON.stringify({
              bor: Buffer.from(sealTransaction(signed), "base64").toString(
                "hex",
              ),
              payload,
            }),
          );
        } finally {
          signerSecret.fill(0);
        }
      } else if (command === "create2")
        process.stdout.write(
          JSON.stringify(
            await sealPrivateMail(message, value.context, value.id),
          ),
        );
      else if (command === "open2" || command === "codec2") {
        if (command === "codec2") {
          const profile = {
            ...value.context,
            protocol: "moonmail-sealed-1" as const,
            indexerUrl: "http://127.0.0.1:18200",
            resource: `resource_${"01".repeat(32)}`,
            recoveryResource: value.recoveryResource,
            evidence: {
              engine: false,
              recovery: false,
              stockSapient: false,
              sentAndReplies: false,
              nativePrivatePostage: false,
            },
          };
          const office = decodeSealedOffice(value.root.body.state, profile);
          if (
            office.sealedRefs.length !== 1 ||
            office.sealedRefs[0].component !== value.component
          )
            throw new Error(
              "V4 root codec did not recover its actual sealed directory",
            );
          const stored = decodeSealedLetter(
            value.child.body.state,
            profile,
            value.id,
            value.component,
          );
          if (
            stored.senderPublicKey !== value.context.senderPublicKey ||
            !isDeepStrictEqual(stored.payload, value.payload)
          )
            throw new Error(
              "V4 child codec did not recover engine storage exactly",
            );
        }
        for (const recovered of [secret, senderSecret]) {
          const opened = await openPrivateMail(
            value.payload,
            new Uint8Array(recovered),
            value.context,
            value.id,
          );
          if (JSON.stringify(opened) !== JSON.stringify(message))
            throw new Error(
              "Engine stored mail did not recover exact Inbox and Sent",
            );
        }
        process.stdout.write(JSON.stringify({ recovered: true, sent: true }));
      } else {
        let rejected = 0;
        for (const recovered of [secret, senderSecret]) {
          try {
            await openPrivateMail(
              value.payload,
              recovered,
              value.context,
              value.id,
            );
          } catch {
            rejected++;
          }
        }
        if (rejected !== 2)
          throw new Error("Copied mail opened under a foreign signer");
        process.stdout.write(JSON.stringify({ rejected: true }));
      }
    } finally {
      senderSecret.fill(0);
    }
  } else if (command === "create")
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
  } else if (command === "reject") {
    let rejected = false;
    try {
      await openAddressedRoute(
        value.payload as SealedAddressEnvelope,
        secret,
        value.context,
        value.id,
      );
    } catch {
      rejected = true;
    }
    if (!rejected)
      throw new Error("Ciphertext opened under a different transaction sender");
    process.stdout.write(JSON.stringify({ rejected: true }));
  } else throw new Error("Choose create, open or reject");
} finally {
  secret.fill(0);
}
