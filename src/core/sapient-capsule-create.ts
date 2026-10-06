import {
  Mask,
  WasmStealthCrypto,
  StealthTransferStatement,
  createOutput,
  TransactionBuilder,
  Network,
  stringLiteral,
} from "@tari-project/ootle";
import { generateKeypair, parseOotleAddress } from "@tari-project/ootle-wasm";
import type { CapsuleDeployment, MailboxContext } from "./types";
import type { WalletAccount } from "./wallet";
import type { CapsuleRecord } from "./pending";
import { encodeMailboxCapsule } from "./capsules";
import { mailboxAAD, mailboxKey } from "./mailbox";
import { hex } from "./crypto";
import { money } from "./transactions";

// Only the encrypted statement and public recovery metadata leave this function.
export async function prepareSapientCapsule(
  context: MailboxContext,
  account: WalletAccount,
  deployment: CapsuleDeployment,
) {
  mailboxAAD(context, "key-capsule", "00".repeat(32), "00".repeat(32));
  if (!/^resource_[a-f0-9]{64}$/.test(deployment.resource))
    throw new Error("Invalid capsule resource");
  const address = parseOotleAddress(account.address);
  try {
    if (
      address.network !== context.network ||
      address.memo?.length ||
      account.account.owner_public_key !== context.controller ||
      hex(address.owner_key) !== context.controller
    )
      throw new Error("Choose the wallet account controlling this capsule");
  } finally {
    address.free();
  }
  const pair = generateKeypair(),
    secret = pair.secret_key;
  pair.free();
  try {
    const encoded = await encodeMailboxCapsule(context, secret),
      crypto = new WasmStealthCrypto(context.network);
    const inputs = await crypto.buildInputsStatement([], 1n);
    const { statement: outputs, outputMask } =
      await crypto.generateOutputsStatement(
        [
          createOutput({
            destination: account.address,
            resourceAddress: deployment.resource,
            amount: 1n,
            memo: encoded.memo,
            payTo: { AccessRule: "DenyAll" },
          }),
        ],
        null,
      );
    if (!inputs.statementJson)
      throw new Error("Missing canonical capsule inputs");
    const proof = await crypto.generateBalanceProofSignature(
      Mask.zero(),
      outputMask,
      inputs.statementJson,
      outputs.statementJson,
    );
    const statement = new StealthTransferStatement(inputs, outputs, proof);
    await crypto.validateTransfer(statement);
    const statementJson = statement.toCompactJson(),
      decoded = JSON.parse(statementJson);
    if (new TextEncoder().encode(statementJson).length > 16384)
      throw new Error("Capsule statement too large");
    const descriptor = mailboxKey({
      ...encoded.descriptor,
      recovery: "sapient-capsule-1",
      capsule: {
        resource: deployment.resource,
        commitment: decoded.outputs_statement.outputs[0].output.commitment,
      },
    });
    const capsule: CapsuleRecord = {
      account: account.account.component_address,
      context: {
        network: context.network,
        registry: context.registry,
        template: context.template,
        postbox: context.postbox,
        controller: context.controller,
        keyVersion: context.keyVersion,
      },
      descriptor,
      deployment: { ...deployment },
    };
    return { capsule, statementJson };
  } finally {
    secret.fill(0);
  }
}
export function capsuleStoreTransaction(
  prepared: Awaited<ReturnType<typeof prepareSapientCapsule>>,
  fee: string,
  epoch: number,
  vaults: string[],
) {
  const { capsule, statementJson } = prepared,
    deployment = capsule.deployment!;
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 0 ||
    epoch > Number.MAX_SAFE_INTEGER - 10 ||
    vaults.some((v) => !/^vault_[a-f0-9]{64}$/.test(v))
  )
    throw new Error("Invalid capsule funding inputs or epoch");
  return TransactionBuilder.new(capsule.context.network as Network, epoch + 10)
    .feeTransactionPayFromComponent(capsule.account, money(fee))
    .withInputs(
      Array.from(
        new Set([
          `template_${deployment.template}`,
          deployment.component,
          deployment.resource,
          capsule.account,
          `resource_${"01".repeat(32)}`,
          ...vaults,
        ]),
      ).map((substate_id) => ({
        substate_id,
        version: null,
        is_write:
          substate_id === deployment.resource ||
          substate_id === capsule.account ||
          substate_id.startsWith("vault_"),
      })),
    )
    .callMethod(
      { componentAddress: deployment.component, methodName: "store" },
      [stringLiteral(statementJson)],
    )
    .buildUnsignedTransaction();
}
