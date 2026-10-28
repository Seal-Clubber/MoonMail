# Ootle v0.47 compatibility

MoonMail targets [Ootle v0.47.0](https://github.com/tari-project/tari-ootle/releases/tag/v0.47.0),
published on 20 October 2026 as a prerelease. The public Esmeralda indexer was
checked on 28 October at version 0.47.0, epoch 12697. Visitors use the website and
Sapient; no MoonMail server or additional bridge is required.

## Pinned dependencies

| Dependency                                        | Version  |
| ------------------------------------------------- | -------- |
| `@tari-project/ootle`                             | `0.11.1` |
| `@tari-project/ootle-indexer`                     | `0.11.1` |
| `@tari-project/ootle-secret-key-wallet`           | `0.11.1` |
| `@tari-project/ootle-wasm`                        | `0.47.0` |
| `@tari-project/wallet_jrpc_client`                | `1.26.0` |
| Transitive `@tari-project/ootle-ts-bindings`      | `1.60.0` |
| `tari_template_test_tooling`, `tari_engine_types` | `0.47.0` |
| `tari_template_lib`                               | `0.35.0` |

SDK and independently versioned Rust package numbers differ from the node
release. Node 24.19+, exact pnpm 11.19.0 and Rust 1.97.1 remain the build tools.
Dependency lockfiles are committed; package age exceptions name exact versions.

## Chain reads and privacy boundary

The 0.47 indexer returns `state.up.substate` or `state.down` instead of a
top-level `substate`. All office, letter, settings, account, recovery carrier,
and private-payment output reads use a strict shared live-state decoder.
Down, malformed and obsolete responses are rejected. Only an explicit HTTP 404
can enable the existing gift-funded account-creation path; a down response is
not a new account.

Component template and owner checks, locked recovery-resource rules and frozen
output checks remain in place. Transaction receipt output records use their
own format and are not treated as indexer GET responses. Tests retain original
transaction-ID reconciliation and duplicate-spending protections.

The browser trusts the selected indexer for ledger reads. Its `verified` flag
reports verification performed by the indexer; MoonMail does **not** independently
verify committee or Merkle proofs. Upgrading dependencies alone adds no anonymity
or metadata-hiding guarantee. Reading private mail still requires a separate
Sapient view grant, never spending approval.

## Templates and existing mail

Active templates and historical regression copies rebuild against template-lib
0.35, as required by the release. The old and new native template ABI exports
cannot be linked together in one engine test process. Historical contract logic
is retained with matching build dependencies; the backup preserves original pins.

Rebuilding changes WASM bytes and template identities. This upgrade does not
replace the published office or point existing postboxes at a rebuilt template.
Existing deployment addresses and postbox/recovery identities stay configured.
The exact preserved published V4 WASM (SHA256
`b3363d4c0394eb43db5572f59bd0939a6a807c271748221f105aa67cb1bec902`)
was loaded directly into the 0.47 engine: creating a postbox, writing encrypted
settings, rejecting a foreign settings writer and publishing/reading sealed
mail all succeeded in isolated state. This check used the original binary,
not a rebuild assigned its former address.

## Verification

[Machine-readable evidence](ootle-v047-evidence.json) distinguishes local
execution, real chain reads and stock-wallet recovery. The full browser suite
covers desktop and mobile, private links, public mail, Compose, threads, mailbox
selection/settings and wallet permissions. Native checks execute actual SDK/WASM
signing, fee payment, private capsules, sender binding, ownership, payouts,
rollback and replay protection.
Results: 295 unit tests, 336 desktop/mobile browser cases, 63 checks across the
three native engine suites, plus the separate original-binary compatibility probe.
Frontend checks and stock-wallet acceptance were refreshed on 29 October 2026;
the native evidence covers the same unchanged mail contracts from the upgrade.

The official Chrome Web Store package tested was unmodified **Sapient 0.6.14**.
The upstream source tree reported 0.6.16; that source version is not asserted to
be the published store package. A copied, independently restored development
profile recovered real encrypted Inbox and Sent letters, saved settings and its
existing private grant after reload. Private-fee and private-spend capabilities
were advertised by the actual wallet.

The wallet check used the reviewed local production assets on the real Pages
HTTPS origin and real Esmeralda responses. Financial methods and broadcasts
were blocked. Those read-only results do not establish a new funded live send
or payout, nor that these local assets are already published. GitHub pushes
and website publication remain user-controlled.

## Build and engine checks

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm test:browser
cargo build --manifest-path contracts/moonmail-v4/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo test --manifest-path contracts/tests/mailbox/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/tests/legacy-mail/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/tests/recovery/Cargo.toml --locked
```

Run native engine checks on Linux/WSL; Wasmer 7.5 Cranelift does not support
Windows. With Windows Node under WSL, set `GHOSTDROP_TEST_NODE` to the executable's
`/mnt/c/.../node.exe` path and `GHOSTDROP_TEST_LOADER` to the
`file:///C:/.../MoonMail/node_modules/tsx/dist/loader.mjs` URI. Set these helper
variables to Windows absolute paths beneath the checkout:

| Variable                        | File                                  |
| ------------------------------- | ------------------------------------- |
| `GHOSTDROP_TEST_SIGNER`         | `tools/sign-engine-claim.ts`          |
| `GHOSTDROP_TEST_POSTBOX_SIGNER` | `tools/sign-postbox-engine-claim.ts`  |
| `GHOSTDROP_MAILBOX_SIGNER`      | `tools/sign-mailbox-engine-update.ts` |
| `GHOSTDROP_CAPSULE_FIXTURE`     | `tools/capsule-engine-fixture.ts`     |
| `MOONMAIL_SEALED_FIXTURE`       | `tools/sealed-engine-fixture.ts`      |

Defaults work when Node runs natively on the engine host. CI runs all three
engine suites; it does not deploy templates.
