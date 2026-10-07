# Sapient gift-funded postbox claims

The separate `PostOfficeV2` and `EnvelopeV2` contracts let the controller approve a specific gift payout with Sapient's `tari_signWalletOwnershipChallenge`. GhostDrop submits a transaction sealed by a temporary local relay key. The recipient's financial wallet key never leaves Sapient, and their account needs no coins for collection. The sender funds both the full gift and a separate capped fee reserve.

**Current V2 result (2026-10-07):** three reviewed templates and the registry/capsule components are confirmed on Esmeralda. Stock Sapient registered a postbox, funded an addressed gift and rotated its key. An independently restored wallet recovered current and historical keys from actual permanent ledger carriers, collected the full 1 TARI into a zero-TARI account through an ownership proof, and independently spent the payout. The claim charged 5,730 µTARI to the sender's separate100,000 µTARI reserve. [Actual public evidence](postbox-v2-esmeralda-evidence.json) records exact IDs, artifacts, fees and limits.

The current source opens the verified Sapient office directly through `public/deployment.json`; `deployment-v2.json` retains the same profile for historical verification references. Open **My inbox** for new postboxes. The original office is not selectable and old mail is not carried over. Visitors need the website and stock Sapient only. Recovery requires separate explicit account-wide private view consent; creation and sending require wallet funds, while addressed gift collection requires no recipient coins or financial-wallet signature. Use **Activity** to check confirmations or resume an existing wallet request. The GUI redesign awaits publication after the user’s push; dated evidence below describes the builds tested at that time.

The staged HTTPS interface opened real historical encrypted mail using the restored stock wallet, actual indexer and local build assets. The user pushed `ad8831a`; Pages and Verify succeeded for that exact head, all eight published assets match, 22 hosted browser regressions pass, and both real public readers and restored-wallet historical recovery pass without asset/config/ledger overrides. A real client-created Sapient approval survived reload and resumed the same request before rejection, with unchanged balance and zero financial broadcasts. [Published evidence](postbox-v2-published-wallet-evidence.json) records these checks. Subsequent local wording/evidence changes await the user's next push. The 88 client tests, 22 browser regressions and strict production build checks pass. The earlier 12 proof/JS engine tests plus two new V2 guest regressions pass, covering public/private-link payout and gift-funded account creation. The approved 10-test-XTM replenishment committed at epoch 11948 as the 17th and final campaign transaction. The wallet recovered 9.9 test TARI after the actual 0.1 TARI fee; [bridge evidence](postbox-v2-bridge-evidence.json) records the unspent output. Never repeat the burn or claim. Live financial lost-response fault injection remains unverified.

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

The [evidence record](postbox-proof-claims-evidence.json) distinguishes eleven local financial engine tests, twenty-two mocked browser-adapter tests, and an actual ownership approval/rejection in a fresh unfunded stock Sapient 0.6.6 profile. The real approved signature passes the production crypto source in Ootle 0.45, with thirteen tampering cases rejected. That crypto probe uses a synthetic registry/envelope/expiry context; it is not a registered public postbox claim. The local measured claim fee was 4,369 µTARI, with a 100,000 µTARI reserve. Public fees must still be simulated and measured independently.

An additional JavaScript-to-engine bridge compares the production builder's challenge with the contract's exact tuple, decodes its JSON and submission BOR as the same Rust transaction, verifies every WASM signature and the seal, and executes an exact payout with an unrelated temporary relay signer. Run this twelfth engine test with `--include-ignored`; Node and installed JS dependencies are required. Windows/WSL can supply `GHOSTDROP_TEST_NODE`, `GHOSTDROP_TEST_LOADER` and `GHOSTDROP_TEST_POSTBOX_SIGNER` pointing to `tools/sign-postbox-engine-claim.ts`. The bridge accepts public proof fields only, with no wallet or controller private key and no RPC.

CI runs the contract checks, including that bridge, separately from the preserved original tests. Enable `postboxClaimProtocol: "sapient-proof-1"` and `evidence.postboxClaims: true` only for the reviewed new registry/envelope identities after actual deployment and gift collection evidence. Sapient postbox writes also require the separately verified recovery capsule identity and `mailboxRecovery` evidence. Never enable these flags on an original envelope deployment.

Published source/profile verification is complete for `ad8831a`. The next local wording/evidence checkpoint remains for the user to push. All 17 approved transactions, including replenishment, are confirmed. The user can push the remaining local wording and evidence commits. Live financial response-loss fault injection remains outside this campaign. Preserve the journal and never repeat confirmed operations.

Four additional desktop/mobile UI cases verify the exact review, rejection without broadcast, frozen receiving controls during approval, and disabled historical-deployment claims. All twenty-two local browser cases and the strict production build pass. Current template publication simulations quoted 1,890,925 / 980,028 / 5,017,967 µTARI; these are publication costs, not gift collection fees.

The client resolves fresh ledger input versions before stock wallet simulation/signing and uses the Ootle0.45 dedicated `transactions/dry-run` proof endpoint. SDK0.7 generic simulation targets `transactions`, which0.45 rejects before consensus. Accepted execution, canonical nonnegative fees within reserve, current wallet identity and a clear journal are required before broadcast.

The actual published desktop/mobile readers also recover after an interrupted real indexer read, through Refresh without reloading or replacing the ledger with fixture responses. See [read interruption evidence](pages-v2-outage-evidence.json). This is separate from financial submission response-loss testing.
