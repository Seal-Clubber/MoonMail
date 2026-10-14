# Ootle v0.46 compatibility

MoonMail targets [Tari Ootle v0.46.0](https://github.com/tari-project/tari-ootle/releases/tag/v0.46.0), released on 13 October 2026 as a prerelease. The public Esmeralda indexer was verified at v0.46.0, epoch 12243, past the Protocol V2 activation at epoch 12220. The static site continues to use Sapient, with no MoonMail backend or visitor bridge.

## Pinned dependencies

| Package                                           | Version  |
| ------------------------------------------------- | -------- |
| `@tari-project/ootle`                             | `0.9.0`  |
| `@tari-project/ootle-indexer`                     | `0.9.0`  |
| `@tari-project/ootle-secret-key-wallet`           | `0.9.0`  |
| `@tari-project/ootle-wasm`                        | `0.46.0` |
| `@tari-project/wallet_jrpc_client`                | `1.25.0` |
| `tari_template_test_tooling`, `tari_engine_types` | `0.46.0` |
| Current/host `tari_template_lib`                  | `0.34.0` |

SDK package numbers differ from the node release number. The pnpm lockfile was generated with the project's exact pnpm 11.19.0. Fresh-package age exceptions name only the six exact upgraded direct/binding packages; there is no wildcard exception. Rust engine lockfiles include the new engine, transaction/metadata libraries and Wasmer 7.5.0. Rust 1.97.1 remains pinned.

## Receipt and contract compatibility

Ootle 0.46 no longer puts template return values in transaction results. Production MoonMail already reads letters, postboxes and mailbox revisions from component state, and confirms original transaction IDs using finalized decisions. It does not discover deployments or confirm mail from returned function values. New receipt regressions verify full commit, fee-only uncertainty and rejection when return-value fields are absent.

Engine helpers use the official test-only `TemplateTest.expect_return` capture API. That is harness instrumentation, not a production receipt API. The historical 0.33 template and the 0.34 test host have separate Rust address types; historical payout assertions compare full canonical component identities and parse that identity before reading destination balances. Financial assertions are retained.

The current unified template's published identity, registry, recovery resource, contract source, existing mail and postboxes remain unchanged. There is no required contract replacement or migration. The archived original contract sources retain their 0.33 template library for reproducibility; current contracts remain on the latest 0.34.0 template library. The current-engine tests execute both generations.

## Verified

[Machine-readable evidence](ootle-v046-evidence.json) records214 unit checks,258 desktop/mobile browser checks, strict TypeScript and the Pages-base production build. All 49 engine checks pass:35 postbox/unified claims/settings/recovery,13 historical financial and SDK round trips, and1 standalone capsule test with its unsafe statement/spending cases. All normally ignored Node/WASM cases were explicitly run. The upgraded SDK/WASM signs and executes actual test transactions; owner/destination/context checks, fee limits, payout/spend, replay/rollback and stale settings protections remain covered.

The actual v0.46 Esmeralda indexer returned 38 letters, 19 public bodies and 2 postboxes from the existing office. An independently restored isolated stock Sapient 0.6.6 wallet recovered encrypted settings, decrypted mail and favourites using the reviewed local production build on the real Pages HTTPS origin, with actual ledger responses. Reload restored the existing wallet/private grant without another permission request. Desktop/mobile overflow checks passed. All financial methods and transaction POSTs were blocked; none was attempted. No visitor wallet is upgraded or changed by this application update.

A queried historical publication's transaction-result endpoint returned HTTP404 on the selected indexer. An unavailable retained receipt is not evidence of rejection and is not permission to resend. Existing on-chain component state was readable. The original delivery journal and reconciliation protections remain in place.

The tests do not claim a new consensus-funded live send/payout or a newly published website. The user can push local main to trigger the existing Pages workflow. After deployment, check public mail and connect Sapient to read/reload the private inbox. Wallet approval is still required for any subsequent settings save or send.

## Build and engine checks

Use Node 24.19+, pnpm 11.19.0, Rust 1.97.1 and the wasm32 target. Execute the engine on Linux/Ubuntu WSL; Wasmer 7.5's Cranelift backend does not support Windows.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:browser
cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/postbox-claim-tests/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/capsule-tests/Cargo.toml --locked
```

Node and the installed JS packages must be reachable from the engine host. In Windows/WSL, set `GHOSTDROP_TEST_NODE` to the Windows Node executable's `/mnt/c/.../node.exe` path and `GHOSTDROP_TEST_LOADER` to the `file:///C:/.../node_modules/tsx/dist/loader.mjs` URI. Bridge scripts use Windows absolute paths: `GHOSTDROP_TEST_SIGNER` → `tools/sign-engine-claim.ts`, `GHOSTDROP_TEST_POSTBOX_SIGNER` → `tools/sign-postbox-engine-claim.ts`, `GHOSTDROP_MAILBOX_SIGNER` → `tools/sign-mailbox-engine-update.ts`, `GHOSTDROP_CAPSULE_FIXTURE` → `tools/capsule-engine-fixture.ts`. Their defaults work when Node runs natively on the engine host.
