# Verification evidence

Evidence applies to the stated build and isolated network. GitHub Pages HTTPS hosting is verified separately from wallet connectivity and public-chain deployment.

| Requirement               | Verified                                                                                                                            | Remaining                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Pages architecture        | Live enforced-HTTPS Pages site; all 10 hosted Chromium checks passed for assets, WASM, hash links, refresh and mobile               | Updated builds repeat hosted checks                           |
| Ootle storage/rules       | Engine and isolated consensus tests; complete letters/ciphertext in separate ownerless envelopes                                    | Intended public deployment                                    |
| Link encryption           | HKDF/AES-GCM and official Tari keys; context/tamper tests; actual stored ciphertext decrypted/claimed                               | Independent cryptographic review                              |
| Public/link guest payouts | Actual indexer submission; separate recipient daemon discovers exact gift and spends it                                             | Intended hosted deployment                                    |
| Fees/authority            | Engine checks wrong keys, replay, one payout, destination/network, inadequate fees and fee/main checkpoints                         | Distributed races and production fee calibration              |
| Postboxes                 | Actual chain create/edit/rotate, ciphertext unwrap, frozen controller, exact payout/spend; historical decryption in second client   | Full restored daemon installation; intended public deployment |
| Wallet adapter            | Actual scoped submission, token replacement/clearing, expiry/revocation, owner UI key issuance/revocation and local-browser RPC     | Authenticated Pages transport; physical passkey device        |
| Submission recovery       | Pre-broadcast journal, corrupt-journal spending block, uncertain keeper reservations                                                | Live lost-response/account-history recovery                   |
| Keeper                    | Actual dedicated disposable donor funds five, restarts from journal, refills claimed gift, stops at budget; guest claims after exit | Intended deployment and lost-response recovery                |
| Accessible UI             | Desktop/mobile, reduced-motion/list view, focus trap/Escape/restoration, draft survival and fragment scrub                          | Broader browser/assistive technology review                   |
| Independent hosting       | Configurable asset base and deployment-bound links                                                                                  | Two HTTPS hosts; original-host outage test                    |

## Automated checks

GitHub Verify run [37390878555](https://github.com/Seal-Clubber/GhostDrop/actions/runs/37390878555) and Pages run [37391283346](https://github.com/Seal-Clubber/GhostDrop/actions/runs/37391283346) succeeded for `72b853c7dc583c438c9bd917271aa674697c96ea`. The repository's GitHub API confirms Pages uses workflow deployment and enforces HTTPS. Test the existing hosted build with `GHOSTDROP_TEST_BASE_URL=https://seal-clubber.github.io/GhostDrop/ pnpm test:browser` (use the appropriate environment-variable syntax for your shell).

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
- Stock-daemon preflight lacks CORS allow-origin/header fields. The pinned extension passes actual Pages-origin credential-free `wallet.get_info` transport with a normal Chromium Local Network Access permission grant (HTTP 200, network 16, daemon 0.43.0). Authenticated account access remains unverified; no API key was sent. Security settings were not disabled.

Public deployment configuration stays blank/false. Local tests do not override production UI gates. Capabilities, test private keys, databases and session research stay outside the repo. Keeper execution is limited to the bounded disposable-donor continuation described below; no ongoing worker remains.

## Wallet extension and addressed-chain continuation

The extension pins official v0.43.0 source `392d805579db35fcc8e8bc1aba84adc1fffe0c22`. A fresh checkout applies the shipped patch and exactly reproduces all 14 tested files. Six native tests pass: authenticated crypto/tampering, independent mnemonic-restored key store with historical versions, independent permission scopes, origin/Host/configuration restrictions and listener CLI parsing.

Sixteen actual daemon RPC checks pass for JS/WebCrypto + official WASM encryption/native Rust unwrap, wrong context/controller/account/network, tampering, permission separation, key replacement/history, expiration/revocation and disconnect. Those key hashes were provisioned only in disposable stores. Separately, the actual wallet owner UI passes WebAuthn registration, scoped key issuance and revocation using a Chromium virtual authenticator. No GhostDrop Admin or spending key was issued in that owner-UI test; physical passkey hardware remains untested.

Thirteen isolated-chain checks pass: multiple IDs/duplicate nicknames, controller edits, stored addressed ciphertext decryption, frozen authority, wrong controller rejection, rotation preserving ID/controller, historical decryption from a second client, exact 2,000,000 microTARI payout, duplicate rejection, recipient spending, and fresh public/link guest payouts. See [public identities and committed transaction IDs](postbox-network-evidence.json). These fresh identities supersede the older ephemeral deployment for continuation tests; they are not public configuration.

Six browser integration checks pass on desktop/mobile against real wallet/indexer RPC. Only deployment.json is a local test fixture: stored historical mail decrypts, desktop postbox creation commits and reconciles, and disconnect clears sessions. No RPC is mocked. Public configuration remains blank/false.

Four further browser checks pass through actual local UI sending and guest receiving: public and link letters publish/confirm, an independent browser reads/decrypts them without a wallet connection, and each prepaid claim confirms. This run uses the supported reduced-motion mode and actual hall pagination.

The actual keeper CLI was run only in bounded `--run --once` increments using a fresh dedicated donor daemon and an external journal. Six checks pass: five confirmed public gifts, retained journal across process restarts, collection after keeper exit, refill to five after collection, fixed 24,000,000 microTARI budget exhaustion, and independent donor identity. Six gifts were funded total; one was claimed. The first claim probe used an incomplete disposable Storage adapter and lost its returned transaction journal entry after broadcast; continuation reconciled the existing on-chain claimed state and did not repeat that claim. This does not prove general live lost-response recovery. All keeper increments exited and temporary keys were revoked.

Authenticated Pages-to-loopback verification is pending approval for entering a temporary, non-spending disposable-wallet API key into the user-owned hosted page. No credential was sent there. Exact-origin support passing local tests does not establish hosted browser transport. Neither financial seeds nor mailbox secrets were exported; native mnemonic testing uses synthetic unit-test material.

The later credential-free Pages probe verifies the origin/CORS/loopback portion, with `credentials:"omit"` and no Authorization header. It requests only intentionally public wallet metadata and does not replace authenticated verification. The `httpsWallet` public evidence flag remains false. The [keeper receipts and bounded plans](keeper-network-evidence.json) record only public localnet identifiers and reservations.

## Primary sources

- [Official engine/templates](https://github.com/tari-project/tari-ootle), inspected `44d96cd6a5f22a0f4d104feb21a92f9440267274`.
- [Official TypeScript SDK](https://github.com/tari-project/ootle.ts), inspected `c41c0ce04efd08df392203846b37496caa5844c7`.
- [State/execution](https://ootle.tari.com/concepts/state-and-execution/), [fees](https://ootle.tari.com/reference/fees/), [privacy](https://ootle.tari.com/concepts/privacy-in-applications/).
- [API-key guide](https://ootle.tari.com/guides/agent-api-keys/); its older scope names differ from the tested daemon.
