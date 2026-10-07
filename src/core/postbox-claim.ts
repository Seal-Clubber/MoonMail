import {
  TransactionBuilder,
  Network,
  componentAddressLiteral,
  intLiteral,
  stringLiteral,
} from "@tari-project/ootle";
import type { Envelope } from "./types";
import { money } from "./transactions";
export interface WalletOwnershipProof {
  walletAddress: string;
  publicNonce: string;
  signature: string;
}
export const nativeTari = `resource_${"01".repeat(32)}`;
export function postboxClaimChallenge(
  envelope: Envelope,
  destination: string,
  validUntil: number,
) {
  if (
    envelope.mode !== "postbox" ||
    envelope.claimProtocol !== "sapient-proof-1" ||
    envelope.claimed ||
    !/^component_[a-f0-9]{64}$/.test(envelope.component || "") ||
    !/^component_[a-f0-9]{64}$/.test(envelope.context.registry) ||
    !/^component_[a-f0-9]{64}$/.test(destination) ||
    ![16, 36, 38].includes(envelope.context.network) ||
    !/^[a-f0-9]{64}$/.test(envelope.claimAuthority || "") ||
    !Number.isSafeInteger(validUntil) ||
    validUntil < 0 ||
    money(envelope.gift) <= 0n ||
    money(envelope.reserve) <= 0n
  )
    throw new Error("Invalid postbox claim context");
  // Tuple encoding is identical to EnvelopeV2's serde_json encoding. The
  // amounts are canonical decimal strings; no caller-supplied challenge is used.
  const challenge = JSON.stringify([
    "gd-postbox-claim-1",
    envelope.context.network,
    envelope.context.registry,
    envelope.component,
    destination,
    nativeTari,
    money(envelope.gift).toString(),
    money(envelope.reserve).toString(),
    validUntil,
  ]);
  if (challenge.length > 500) throw new Error("Claim challenge too large");
  return challenge;
}
export function postboxProofClaimTransaction(
  envelope: Envelope,
  destination: string,
  validUntil: number,
  epoch: number,
  proof: WalletOwnershipProof,
) {
  postboxClaimChallenge(envelope, destination, validUntil);
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 0 ||
    epoch > Number.MAX_SAFE_INTEGER - 10 ||
    validUntil < epoch ||
    validUntil > epoch + 10 ||
    !/^[a-f0-9]{64}$/.test(proof.publicNonce) ||
    !/^[a-f0-9]{64}$/.test(proof.signature) ||
    typeof proof.walletAddress !== "string" ||
    proof.walletAddress.length > 128
  )
    throw new Error("Invalid postbox ownership proof or expiry");
  return TransactionBuilder.new(envelope.context.network as Network, validUntil)
    .addFeeInstruction({
      CallMethod: {
        call: { Address: envelope.component! },
        method: "claim_with_wallet_proof_and_pay_fee",
        args: [
          componentAddressLiteral(destination),
          intLiteral(BigInt(envelope.context.network)),
          intLiteral(BigInt(validUntil)),
          stringLiteral(proof.walletAddress),
          stringLiteral(proof.publicNonce),
          stringLiteral(proof.signature),
        ],
      },
    })
    .buildUnsignedTransaction();
}
