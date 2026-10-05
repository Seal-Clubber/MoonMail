# Verification evidence

Evidence applies to this build and isolated network. It does not establish a public deployment or hosted HTTPS wallet connection.

| Requirement               | Verified                                                                                                    | Remaining                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Pages architecture        | Static build/manual workflow; Chromium assets, WASM, hash links and refresh at exact `/GhostDrop/` path     | Authorized publication, eligible private-repo plan, actual HTTPS origin |
| Ootle storage/rules       | Engine and isolated consensus tests; complete letters/ciphertext in separate ownerless envelopes            | Intended public deployment                                              |
| Link encryption           | HKDF/AES-GCM and official Tari keys; context/tamper tests; actual stored ciphertext decrypted/claimed       | Independent cryptographic review                                        |
| Public/link guest payouts | Actual indexer submission; separate recipient daemon discovers exact gift and spends it                     | Intended hosted deployment                                              |
| Fees/authority            | Engine checks wrong keys, replay, one payout, destination/network, inadequate fees and fee/main checkpoints | Distributed races and production fee calibration                        |
| Postboxes                 | Engine checks IDs, duplicate nicknames, controller edits and frozen gift authority                          | Wallet key storage/unwrap/second-client recovery; UI disabled           |
| Wallet adapter            | Actual scoped submission, token replacement/clearing, expiry/revocation and network checks                  | Interactive key issuance and Pages transport                            |
| Submission recovery       | Pre-broadcast journal, corrupt-journal spending block, uncertain keeper reservations                        | Live lost-response/account-history recovery                             |
| Keeper                    | Filter/target/buffer/budget/concurrency/restart tests and full pagination                                   | Dedicated donor execution; worker never started                         |
| Accessible UI             | Desktop/mobile, reduced-motion/list view, focus trap/Escape/restoration, draft survival and fragment scrub  | Broader browser/assistive technology review                             |
| Independent hosting       | Configurable asset base and deployment-bound links                                                          | Two HTTPS hosts; original-host outage test                              |

## Automated checks

- `pnpm test`: **18 passed**.
- `pnpm build`: strict TypeScript/static Vite build passed, including `GHOSTDROP_BASE=/GhostDrop/`.
- `pnpm test:browser`: **10 passed**, desktop 1440×1100/mobile 390×844. Scene screenshots visually inspected.
- Six native Envelope validation cases passed; both release WASM artifacts built.
- **11 Linux Ootle engine tests passed**, including two SDK bridge cases: JS/WASM signatures and BOR verified in Rust, complete encrypted publication/decryption/claim and recipient spend. Run `cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked -- --include-ignored` with JS dependencies installed. CI includes these cases.

The engine race test applies competing claims to committed state; it is not a distributed consensus race. The harness supplies inputs automatically. Actual isolated-network probes separately checked live input resolution and consensus acceptance. Gifts and fees are **revealed test TARI**. This is not an external audit.

For Windows/WSL bridge tests, set `GHOSTDROP_TEST_NODE` to Windows Node via `/mnt/c/...`, `GHOSTDROP_TEST_LOADER` to the repository's `file:///C:/.../node_modules/tsx/dist/loader.mjs`, and `GHOSTDROP_TEST_SIGNER` to its `C:/.../tools/sign-engine-claim.ts`. Keys travel through subprocess stdin. Engine fixtures contain only isolated public state; their identities are not deployment configuration.

## Actual isolated network

Official Linux Ootle 0.43.0 binaries (392d805) were checked against release SHA-256 checksums. A configured-oracle validator/indexer ran with mDNS disabled, no public seeds and loopback APIs. Fresh sender and **separate recipient wallet directories** were used. No personal wallet or public network was accessed.

Scoped API-key hashes were provisioned directly in these isolated SQLite stores. This tests runtime authorization, **not interactive WebAuthn key issuance**. No Admin key was requested. Scoped SDK faucet funding, both template publications and registry creation committed successfully.

For public and private-link gifts: sender publishes 2,000,000 microTARI gift plus 1,000,000 reserve; project reader decodes on-chain state; private subject/body decrypts from stored ciphertext; ephemeral/link signer submits a prepaid claim through the indexer; independent recipient daemon refreshes, discovers an **exact 2,000,000 balance increase**, then commits a 100,000 withdrawal/deposit using that payout. See [public receipt IDs](isolated-network-evidence.json). These belong to an ephemeral localnet, not a reusable public service.

Live probes fixed account authorization in `other_signers` separately from sealing, explicit child-template read inputs, and raw hash encoding for Rust `TemplateAddress`. Registry/publication dry runs check acceptance before broadcast.

## Actual permissions and transport

- Unauthenticated account listing rejected; public version/network info is intentionally unauthenticated.
- `accounts:read,transactions:read`: listing accepted, rename and actual submission rejected. Legacy scope names rejected.
- `transactions:create`: real scoped transactions committed. This is broad spending authority, not account-limited.
- Expired/revoked keys and wrong network rejected by the project adapter. Replacement retained identity; disconnect cleared credentials and later lookup failed.
- Dry-run signing can pass with read scope; do not call this a no-signing permission.
- Default preflight for planned `https://seal-clubber.github.io`: HTTP 200 with no CORS allow-origin/allow-header fields. **Hosted transport remains blocked/unverified.** Security settings were not disabled.

Public deployment configuration stays blank/false. Local tests do not override production UI gates. Capabilities, test private keys, databases and session research stay outside the repo. No donor worker was started.

## Primary sources

- [Official engine/templates](https://github.com/tari-project/tari-ootle), inspected `44d96cd6a5f22a0f4d104feb21a92f9440267274`.
- [Official TypeScript SDK](https://github.com/tari-project/ootle.ts), inspected `c41c0ce04efd08df392203846b37496caa5844c7`.
- [State/execution](https://ootle.tari.com/concepts/state-and-execution/), [fees](https://ootle.tari.com/reference/fees/), [privacy](https://ootle.tari.com/concepts/privacy-in-applications/).
- [API-key guide](https://ootle.tari.com/guides/agent-api-keys/); its older scope names differ from the tested daemon.
