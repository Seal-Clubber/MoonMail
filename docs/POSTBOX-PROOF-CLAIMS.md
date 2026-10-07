# Sapient gift-funded postbox claims

The separate `PostOfficeV2` and `EnvelopeV2` contracts let the controller approve a specific gift payout with Sapient's `tari_signWalletOwnershipChallenge`. GhostDrop submits a transaction sealed by a temporary local relay key. The recipient's financial wallet key never leaves Sapient, and their account needs no coins for collection. The sender funds both the full gift and a separate capped fee reserve.

**This route is implemented locally and remains disabled on the published deployment.** It requires new immutable templates and a registry; existing deployed envelopes retain their original claim rules. Local engine tests and mocked browser-provider tests do not establish successful public deployment or actual stock-wallet financial claims.

The exact signed challenge is the JSON tuple:

```text
["gd-postbox-claim-1", network, registry, envelope, destination,
 nativeTariResource, giftDecimal, reserveDecimal, validUntilEpoch]
```

The contract constructs those fields from its own immutable state and current component address, checks the registry's letter mapping and postbox controller, and requires a canonical lowercase Bech32m wallet address for that controller and network. The proof is valid for at most ten epochs. Native Ristretto operations verify Sapient's length-prefixed ownership and Schnorr hash domains. No financial transaction signature is derived from the proof.

Before paying anything, the contract rejects a claimed gift, expired approval, foreign controller, mismatched destination or context, invalid address/proof encoding, and a destination that is not the built-in Account template. The complete payout, claimed flag and reserve fee payment occur in one fee checkpoint. Insufficient fees roll back the payout; a later main-instruction failure preserves the checkpoint and prevents another payout. Unused reserve remains locked under the existing envelope rule.

The client requests one explicit ownership approval, rechecks the selected account/network, declares the registry, envelope, destination, resource, templates and vault inputs, and requires a successful dry run with fees within the reserve before broadcast. It records a public-only unknown submission before the network request. A lost response blocks replacement until reconciliation. Ownership approval itself spends no funds, but authorizes this contract to release the specified gift: the receiving UI explains that consequence and displays the destination, full payout, reserve cap and expiry.

## Verification and release

Run `pnpm test`, `pnpm build`, `pnpm test:browser`, and:

```sh
cargo test --manifest-path contracts/envelope-v2/Cargo.toml --locked
cargo test --manifest-path contracts/postbox-claim-tests/Cargo.toml --locked -- --include-ignored
cargo build --manifest-path contracts/envelope-v2/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo build --manifest-path contracts/ghostdrop-v2/Cargo.toml --target wasm32-unknown-unknown --release --locked
```

The [evidence record](postbox-proof-claims-evidence.json) distinguishes eleven local financial engine tests, fifteen mocked browser-adapter tests, and an actual ownership approval/rejection in a fresh unfunded stock Sapient 0.6.6 profile. The real approved signature passes the production crypto source in Ootle 0.45, with thirteen tampering cases rejected. That crypto probe uses a synthetic registry/envelope/expiry context; it is not a registered public postbox claim. The local measured claim fee was 4,369 µTARI, with a 100,000 µTARI reserve. Public fees must still be simulated and measured independently.

An additional JavaScript-to-engine bridge compares the production builder's challenge with the contract's exact tuple, decodes its JSON and submission BOR as the same Rust transaction, verifies every WASM signature and the seal, and executes an exact payout with an unrelated temporary relay signer. Run this twelfth engine test with `--include-ignored`; Node and installed JS dependencies are required. Windows/WSL can supply `GHOSTDROP_TEST_NODE`, `GHOSTDROP_TEST_LOADER` and `GHOSTDROP_TEST_POSTBOX_SIGNER` pointing to `tools/sign-postbox-engine-claim.ts`. The bridge accepts public proof fields only, with no wallet or controller private key and no RPC.

CI runs the contract checks, including that bridge, separately from the preserved original tests. Enable `postboxClaimProtocol: "sapient-proof-1"` and `evidence.postboxClaims: true` only for the reviewed new registry/envelope identities after actual deployment and gift collection evidence. Sapient postbox writes also require the separately verified recovery capsule identity and `mailboxRecovery` evidence. Never enable these flags on an original envelope deployment.

Remaining release work: registered capsule creation, rotation and restoration on the public testnet; supported operator template publication; a bounded funded claim with a zero-balance Sapient recipient; and published HTTPS validation. The user authorized a revised bounded test after the public template fee quotes exceeded the initial caps; public transactions and restoration/claim evidence remain to be confirmed. Preserve historical mail/deployment selection when introducing a new registry.

Four additional desktop/mobile UI cases verify the exact review, rejection without broadcast, frozen receiving controls during approval, and disabled historical-deployment claims. All twenty local browser cases and the strict production build pass. Current template publication simulations quoted 1,890,925 / 980,028 / 5,017,967 µTARI; these are publication costs, not gift collection fees.
