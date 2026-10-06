import {
  Mask,
  WasmStealthCrypto,
  StealthTransferStatement,
  createOutput,
} from "@tari-project/ootle";
import {
  generateKeypair,
  generateOotleAddress,
  parseOotleAddress,
} from "@tari-project/ootle-wasm";
import { encodeMailboxCapsule } from "../src/core/capsules";
import { sealMailbox } from "../src/core/mailbox";
import { hex } from "../src/core/crypto";

// Finance-free engine fixture. Optional address is public; no wallet seed or
// signing credential is accepted. Output contains only encrypted/public data.
const [resource, publicAddress] = process.argv.slice(2);
if (!/^resource_[a-f0-9]{64}$/.test(resource || ""))
  throw new Error("Pass the engine's custom resource address");
let address = publicAddress;
if (!address) {
  const owner = generateKeypair(),
    view = generateKeypair();
  try {
    address = generateOotleAddress(owner.public_key, view.public_key, 38);
  } finally {
    owner.free();
    view.free();
  }
}
const parsed = parseOotleAddress(address);
const context = {
  network: 38,
  registry: `component_${"11".repeat(32)}`,
  template: "22".repeat(32),
  postbox: "permanent-capsule-engine-proof",
  controller: hex(parsed.owner_key),
  keyVersion: 1,
};
if (parsed.network !== context.network)
  throw new Error("Wrong fixture network");
parsed.free();
const pair = generateKeypair(),
  secret = pair.secret_key;
pair.free();
try {
  const encoded = await encodeMailboxCapsule(context, secret);
  const crypto = new WasmStealthCrypto(38);
  const inputs = await crypto.buildInputsStatement([], 1n);
  const { statement: outputs, outputMask } =
    await crypto.generateOutputsStatement(
      [
        createOutput({
          destination: address,
          resourceAddress: resource,
          amount: 1n,
          memo: encoded.memo,
          payTo: { AccessRule: "DenyAll" },
        }),
      ],
      null,
    );
  if (!inputs.statementJson)
    throw new Error("WASM did not return canonical inputs");
  const proof = await crypto.generateBalanceProofSignature(
    Mask.zero(),
    outputMask,
    inputs.statementJson,
    outputs.statementJson,
  );
  const statement = new StealthTransferStatement(inputs, outputs, proof);
  await crypto.validateTransfer(statement);
  const examplePayload = await sealMailbox(
    {
      subject: "Capsule restoration proof",
      body: "Read after restoring the same wallet.",
    },
    context,
    "capsule-restoration-letter",
    encoded.descriptor,
  );
  console.log(
    JSON.stringify({
      statement: JSON.parse(statement.toCompactJson()),
      context,
      descriptor: encoded.descriptor,
      recipientAddress: address,
      examplePayload,
    }),
  );
} finally {
  secret.fill(0);
}
