import { claimsReady } from "../src/core/config";
import { publishTransaction, money } from "../src/core/transactions";
import {
  beginSubmission,
  completeSubmission,
  hasUnresolved,
} from "../src/core/pending";
import type { PostOfficeClient } from "../src/core/chain";
import type { WalletSession, WalletAccount } from "../src/core/wallet";
import type { Envelope } from "../src/core/types";

// This runs in the local donor process, never in the static website. Browser
// transport evidence cannot authorize or block a loopback donor's own RPC.
export async function publishDonorGift(
  chain: PostOfficeClient,
  wallet: WalletSession,
  funding: WalletAccount,
  envelope: Envelope,
  feeCap: string,
  storage: Storage,
) {
  const d = chain.deployment;
  const owner = funding.account;
  if (!claimsReady(d) || wallet.network !== d.network)
    throw new Error(
      "Donor needs verified gift rules and the matching wallet network",
    );
  if (
    envelope.mode !== "public" ||
    envelope.sender !== owner.owner_public_key ||
    !owner.owner_key_id ||
    !wallet.accounts.some(
      (a) => a.account.component_address === owner.component_address,
    )
  )
    throw new Error("Choose an accessible donor account for a public gift");
  if (hasUnresolved(storage, d.network, d.registry, envelope.id))
    throw new Error("Reconcile the existing donor submission first");
  const tx = publishTransaction(
    d,
    envelope,
    owner.component_address,
    feeCap,
    await chain.provider.getCurrentEpoch(),
  );
  const request = {
    transaction: { V1: tx },
    seal_signer: owner.owner_key_id,
    other_signers: [owner.owner_key_id],
    signatures: [],
    detect_inputs: true,
    detect_inputs_use_unversioned: true,
    lock_ids: [],
  };
  const dry = await wallet.submitDryRun(request);
  if (
    !("Accept" in dry.result.finalize.result) ||
    BigInt(dry.required_fees) > money(feeCap)
  )
    throw new Error(
      "Donor simulation rejected or exceeds the publication fee cap",
    );
  const attempt = beginSubmission(storage, {
    network: d.network,
    registry: d.registry,
    operation: "publish",
    envelopeId: envelope.id,
  });
  const result = await wallet.submit(request);
  completeSubmission(storage, attempt, result.transaction_id);
  return result.transaction_id;
}
