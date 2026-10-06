import {
  generateKeypair,
  generateOotleAddress,
  parseOotleAddress,
} from "@tari-project/ootle-wasm";
import { prepareSapientCapsule } from "../src/core/sapient-capsule-create";
import { sealMailbox } from "../src/core/mailbox";
import { hex } from "../src/core/crypto";

// Finance-free engine fixture. Optional address is public; no wallet credential
// is accepted. Exercise production preparation, then emit encrypted/public data.
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
let controller: string;
try {
  if (parsed.network !== 38) throw new Error("Wrong fixture network");
  controller = hex(parsed.owner_key);
} finally {
  parsed.free();
}
const context = {
  network: 38,
  registry: `component_${"11".repeat(32)}`,
  template: "22".repeat(32),
  postbox: "permanent-capsule-engine-proof",
  controller,
  keyVersion: 1,
};
const prepared = await prepareSapientCapsule(
  context,
  {
    address,
    account: {
      name: "public engine recipient",
      component_address: `component_${"44".repeat(32)}`,
      owner_public_key: controller,
      owner_key_id: null,
    },
  },
  {
    resource,
    component: `component_${"55".repeat(32)}`,
    template: "66".repeat(32),
  },
);
const examplePayload = await sealMailbox(
  {
    subject: "Capsule restoration proof",
    body: "Read after restoring the same wallet.",
  },
  context,
  "capsule-restoration-letter",
  prepared.capsule.descriptor,
);
console.log(
  JSON.stringify({
    statement: JSON.parse(prepared.statementJson),
    context,
    descriptor: prepared.capsule.descriptor,
    recipientAddress: address,
    examplePayload,
  }),
);
