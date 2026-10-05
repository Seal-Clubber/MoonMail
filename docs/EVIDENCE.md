# Verification evidence

Evidence is scoped to this source/build. Do not treat test fixtures as a deployed network or funded public demo.

| Requirement                     | Evidence                                                                                                                                                                | Remaining work                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Static HTTPS Pages architecture | Production build, manual Pages workflow; browser runs at `/ghostdrop/` with working WASM                                                                                | Authorized publish, eligible private-repo Pages plan, real HTTPS-origin checks                     |
| No GhostDrop backend            | Static source/build; all letters/ciphertext stored in Envelope components; registry/postboxes and enforced funding rules in Rust                                        | Deploy and configure tracked public infrastructure                                                 |
| Private link encryption         | WebCrypto HKDF/AES-GCM + official Tari key generation; 256-bit root; tamper/context/wrong-link tests; actual browser WASM                                               | Independent cryptographic review beyond current tests                                              |
| Public guest and link payouts   | Real engine validates exact payout, authority, single use, replay, bad destination/network, inadequate fees and fee/main checkpoint behavior                            | Real indexer guest submission and independent wallet discovery/spend                               |
| Browser/engine compatibility    | Official SDK JSON and base64 BOR decode in Rust; all signatures/seal verified; tampering fails; full encrypted publication/decryption/claim plus recipient engine spend | Actual daemon/indexer and consensus test                                                           |
| Postbox identity/control        | Real engine: multiple IDs, duplicate nicknames, rename, wrong controller rejection, addressed gift authority                                                            | Wallet-controlled letter key storage, unwrap and second-client recovery; frontend actions disabled |
| Wallet connection               | Exact official API-key transport and daemon submit schema; network/account checks, memory-only credential clearing, draft preservation                                  | Live scope enforcement, expired/revoked key, Pages-origin preflight/local-network permission       |
| Unknown submissions             | Pre-broadcast public attempt journal survives missing response; pending IDs disable retry; keeper persists reservations before spending                                 | Live timeout/account-history reconciliation                                                        |
| Keeper                          | Filtering, target/buffer/budget/concurrency and uncertain restart tests; explicit donor account; full chain pagination                                                  | Dedicated verified donor execution; worker has not been started                                    |
| Haunted accessible UI           | Desktop/mobile Chromium, reduced-motion/list view, semantic dialogs, fragment scrub and narrow-layout checks                                                            | Broader browser/assistive-technology review                                                        |
| Independent hosting             | Relative/configurable asset base, hash links with deployment context, no backend dependency                                                                             | Two live HTTPS hosts against the same deployed chain                                               |

## Commands and results

- `pnpm test`: 17 tests passed (crypto, state codecs/transactions/journal, keeper).
- `pnpm build`: strict TypeScript and static Vite build passed.
- `pnpm test:browser`: 8 Chromium cases passed across desktop 1440×1100 and mobile 390×844.
- `cargo test --manifest-path contracts/envelope/Cargo.toml --locked`: six validation cases passed after formatting; both release WASM artifacts built.
- Linux engine suite: **11 real-engine tests passed together** after formatting, including two SDK bridge tests for encrypted publication and recipient spend. Bridge cases are marked ignored by default because Node/tsx are required; run `-- --include-ignored` after installing JS dependencies. CI installs these and includes all 11.
- Engine-generated `tests/fixtures/engine-office.json` is public isolated test state. JS tests decode actual engine output and reject a mismatched template identity. No fixture identity is a deployment identity.

SDK bridge on Linux with local Node/tsx: `cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked javascript_ -- --ignored`. If Node cannot resolve `tsx` from the Rust crate directory, set `GHOSTDROP_TEST_LOADER` to the repository's `node_modules/tsx/dist/loader.mjs` file URL. `GHOSTDROP_TEST_NODE` and `GHOSTDROP_TEST_SIGNER` can override executable/script paths. For Windows+WSL use the Windows Node executable via its `/mnt/c/...` path, loader `file:///C:/.../node_modules/tsx/dist/loader.mjs`, and signer `C:/.../tools/sign-engine-claim.ts`. Isolated test keys travel only through a subprocess stdin; no real wallet seeds are involved.

The race test applies two claims in competing-holder order and proves one payout at committed engine state. It does not simulate full distributed validator consensus. The engine harness adds available input substates, so these tests do not prove live indexer input resolution. Payment values are revealed test TARI, not confidential balances. Tests are protocol evidence, not an external audit.

## Actual isolated daemon probe

The official 0.43.0 Linux release (commit 392d805) was SHA-256 checked against its official checksum and run in a fresh zero-value wallet directory, on loopback port 15100 with an unreachable loopback indexer. Test-only API-key hashes/scopes were provisioned directly in this isolated SQLite store to exercise the authentication resolver; this does **not** verify interactive WebAuthn key issuance. No personal wallet or public network was accessed.

- Unauthenticated account list: HTTP/RPC 401. Public wallet version/network info is intentionally unauthenticated.
- `accounts:read,transactions:read`: account list accepted; rename rejected; actual empty-transaction submission rejected with required `Transactions(Create)`.
- `transactions:create`: passed submission authorization then failed on the unreachable indexer. This verifies the permission boundary, not a committed transaction.
- Expired and revoked modern-scope keys rejected by account operations and the actual application's WalletSession adapter.
- Key replacement kept the same account identity; disconnect cleared the bearer token and subsequent transaction lookup was rejected; wrong wallet network failed connection.
- Default preflight to planned `https://seal-clubber.github.io` returned HTTP 200 without CORS allow-origin/allow-header fields. Actual Pages-origin browser transport remains unverified and blocked by the default daemon policy. No security settings were disabled.
- Dry-run signing can pass with read scope. Repeated identical fixtures produced local duplicate transaction-ID errors; these are not chain acceptance evidence.

The probe's raw credentials and wallet data are local development artifacts outside the application repository. A donor worker was never started. Public configuration remains unverified/disabled.

## Primary sources

- [Official Ootle engine/template source](https://github.com/tari-project/tari-ootle)
- [Official TypeScript SDK](https://github.com/tari-project/ootle.ts)
- [Ootle state and execution](https://ootle.tari.com/concepts/state-and-execution/)
- [Ootle fees](https://ootle.tari.com/reference/fees/)
- [Application privacy](https://ootle.tari.com/concepts/privacy-in-applications/)
- [API-key authentication](https://ootle.tari.com/guides/agent-api-keys/) (permission names differ from current source)
