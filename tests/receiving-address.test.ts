import { expect, it, vi } from "vitest";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import {
  accountForOwner,
  receivingAddress,
} from "../src/core/receiving-address";
import { unhex } from "../src/core/crypto";
import { PostOfficeClient } from "../src/core/chain";
import { emptyDeployment } from "../src/core/config";

// Ootle Rust SDK golden vectors; also checked against the current engine in
// contracts/tests/mailbox/src/unified_claims.rs. Public test keys only.
it.each([
  [
    "44f53520926ec81fbd5a387845beb7df85a96a24ece18738bdcfa6a7822a176d",
    "23e5679a3e55e58e32318b94e258b73e72e3164b658f187fe5de833a861e2d45",
  ],
  [
    "07".repeat(32),
    "0f987d031de55aee41a7233426059b1c3506408832f3283eb2bdaed15a314021",
  ],
  [
    "f6f89e316e6ba5f05e5250ddd4a5d3ed39dcd038cf812cc6a154b6ec0951d25f",
    "26cf65a80010d961aa64950a5677fd9d3852adcf3618aa7fe171f6dda8b961ae",
  ],
])("derives the engine's canonical account for %s", (owner, account) => {
  expect(accountForOwner(unhex(owner))).toBe(`component_${account}`);
});
function fixture() {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  const target = receivingAddress(address, 38);
  owner.free();
  view.free();
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"1".repeat(64)}`,
    template: "2".repeat(64),
    envelopeTemplate: "3".repeat(64),
    resource: `resource_${"01".repeat(32)}`,
    indexerUrl: "https://fixture.invalid",
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
      guestAccountCreation: true,
    },
  };
  const response = {
    substate: {
      Component: {
        header: {
          template_address: "0".repeat(64),
          owner_rule: { ByPublicKey: target.owner },
        },
      },
    },
  };
  const provider = { getSubstate: vi.fn(async () => response) };
  const client = new (PostOfficeClient as any)(d, provider) as PostOfficeClient;
  return { address, target, response, provider, client, d };
}
it("resolves and verifies an existing account from just an address", async () => {
  const f = fixture();
  expect(
    await f.client.resolveReceivingAddress(` ${f.address} `, true),
  ).toEqual({ ...f.target, createAccount: false });
  expect(f.provider.getSubstate).toHaveBeenCalledExactlyOnceWith(
    f.target.destination,
  );
});
it("only explicit 404 permits gift-funded account setup, when enabled", async () => {
  const f = fixture();
  f.provider.getSubstate.mockRejectedValue(
    Object.assign(new Error("Missing"), { status: 404 }),
  );
  expect(await f.client.resolveReceivingAddress(f.address, true)).toEqual({
    ...f.target,
    createAccount: true,
  });
  await expect(
    f.client.resolveReceivingAddress(f.address, false),
  ).rejects.toThrow("Choose your connected Sapient");
  f.d.evidence.guestAccountCreation = false;
  await expect(
    f.client.resolveReceivingAddress(f.address, true),
  ).rejects.toThrow("not enabled");
});
it.each([
  new Error("404 not found in untrusted text"),
  Object.assign(new Error("Outage"), { status: 503 }),
  new Error("timed out"),
])("fails closed on lookup errors: %s", async (error) => {
  const f = fixture();
  f.provider.getSubstate.mockRejectedValue(error);
  await expect(
    f.client.resolveReceivingAddress(f.address, true),
  ).rejects.toThrow("nothing was submitted");
});
it.each(["owner", "template", "malformed"])(
  "rejects incompatible %s without enabling creation",
  async (problem) => {
    const f = fixture();
    if (problem === "owner")
      f.response.substate.Component.header.owner_rule.ByPublicKey = "9".repeat(
        64,
      );
    else if (problem === "template")
      f.response.substate.Component.header.template_address = "9".repeat(64);
    else f.response.substate = {} as any;
    await expect(
      f.client.resolveReceivingAddress(f.address, true),
    ).rejects.toThrow("could not be verified");
  },
);
it("rejects invalid or wrong-network addresses before any indexer lookup", async () => {
  const f = fixture();
  await expect(
    f.client.resolveReceivingAddress("not-an-address", true),
  ).rejects.toThrow("valid Ootle wallet address");
  expect(() => receivingAddress(f.address, 36)).toThrow("another network");
  expect(f.provider.getSubstate).not.toHaveBeenCalled();
});
