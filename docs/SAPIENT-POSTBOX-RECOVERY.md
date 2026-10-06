# Sapient postbox recovery candidate

A normal Ootle contract call can create a permanent encrypted key capsule that the stock Sapient wallet can read after backup restoration. The visitor would use the website and Sapient only. This candidate has local engine and wallet evidence; it is not deployed or enabled for public postboxes.

## Contract and recovery

[`contracts/recovery-capsule`](../contracts/recovery-capsule/src/lib.rs) creates an ownerless custom Stealth resource. Minting is permanently restricted to its capsule component. Burning, recalling and freezing are permanently denied. `store` accepts a bounded JSON string containing an encrypted output and its proofs, requires exactly one carrier unit and output, denies existing inputs and revealed change, and requires the single-leaf `DenyAll` script root with no key spending path. Ootle verifies the range and balance proofs before committing. Neither a wallet signing key nor a plaintext postbox key is submitted to the contract.

The browser generates an application encryption key and uses the recipient's public Ootle address to encrypt the existing bound `gd-capsule-1` memo. Sapient keeps its financial signing and view secrets. After confirmation, the proposed public descriptor would retain the carrier's resource address and commitment, together with the postbox encryption public key and key version. An addressed envelope must retain that reference for its own version, so rotation does not erase access to older mail. The current descriptor parser has not been changed to accept this new format; historical descriptors remain intact.

Recovery uses a separate Sapient view-access approval, then a deterministic resource/commitment lookup. `tari_claimPrivatePayment` decrypts and remembers the custom output in the wallet; it performs local payment bookkeeping and broadcasts no transaction. Subsequent reads use `tari_getShieldedOutputs`. GhostDrop's capsule decoder checks the network, registry, template, postbox, controller, key version and encryption public key before using the recovered application key. There is no need to scan recent receipts to locate an old key. The permanent UTXO, rather than the original browser or a spendable payment memo, holds the encrypted key.

Sapient's current view approval covers the account's private output summaries, not a GhostDrop-only resource. The UI must explain this before requesting it. Financial seeds, view keys and signing keys must never be requested by GhostDrop.

## Verified locally

The [public lab record](sapient-capsule-lab-evidence.json) distinguishes engine execution from live testnet evidence. The official Chrome Store 0.6.6 package was used unchanged in isolated unfunded profiles. Only the custom resource/UTXO reads were supplied from an actual Ootle 0.45 engine fixture; ordinary public reads and the published application assets were unchanged. All public transaction submissions were blocked.

- Original wallet and an independent profile restored from its backup each started without a cached capsule, recovered the same application key, and decrypted the complete example addressed letter.
- A different wallet could not decrypt the capsule. A changed key-version binding was rejected.
- Private output reads were denied before the separate view grant and after origin disconnection.
- The standalone engine test accepted a valid official-SDK output and rejected six unsafe store statements. Both attempted spending paths failed: key path has no spend key; the native script path denies access. Rejections left the carrier present.

Run `pnpm install --frozen-lockfile`, then `cargo test --manifest-path contracts/capsule-tests/Cargo.toml --locked`. The new Verify job runs this test with the locked 0.45 engine. Existing mail contracts and their separate 0.43 CI harness are unchanged. `tools/capsule-engine-fixture.ts` emits encrypted/public test data only; it accepts no wallet credentials. Operational browser helpers and wallet profiles remain outside the repository.

## Remaining boundaries

`mailboxRecovery` remains false. The capsule template has no confirmed public template/component/resource address. The production adapter, public-only recoverable submission journal, descriptor references in historical envelopes, rotation and unknown-response recovery still need integration and end-to-end verification. Do not enable the gate merely because this lab proof passed. Public deployment or funded tests need a new bounded authorization; the prior one-letter test is complete.

There is also a separate **addressed gift claim** limitation. The current [Sapient provider](https://github.com/chironbuilds/tari-wallet/blob/7ad3c4f117a76c64d472fd371b7d75bbe297abec/src/background/index.ts) accepts main instructions, inputs and a fee cap. Its [SDK 0.1.20](https://www.npmjs.com/package/@chironbuilder/ootle-sdk/v/0.1.20) `OotleAccount.execute` path constructs its own account-paid or private-UTXO-paid fee instructions. GhostDrop's existing envelope requires `claim_and_pay_fee` in the fee phase, where payout, claimed state and the reserve payment share a checkpoint. Moving that call into main instructions is invalid: Ootle rejects fee payment in the main intent. Exporting signing keys or converting the claim to wallet-paid fees would not satisfy the original design. The current Sapient adapter therefore continues to reject such conversion.

A stock-wallet API that preserves reviewed caller-supplied fee instructions and supports their authorization could retain the deployed gift contracts. A different claim-proof design would require new contracts and explicit compatibility treatment for existing envelopes; it has not been implemented or verified here. Wallet ownership/message proofs are not interchangeable with transaction authorization signatures.

Template publication has a related operator-side boundary: the provider's `instructions` operation does not forward transaction blobs. Its SDK represents a `PublishTemplate` binary by an index into `blobs`. Do not pass a blob index alone or assume an ignored `blobs` property will publish the binary. This does not prevent ordinary capsule `CallMethod` use after a verified deployment, but publication must use an actually supported operator path.
