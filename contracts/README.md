# MoonMail contracts

Start with **[moonmail-v4](moonmail-v4/README.md)**. It is the single template
used by the current Esmeralda office: sealed letters, postboxes, recovery,
encrypted mailbox settings and public gift rules. Native private transfers are
separate Sapient operations.

```text
contracts/
├── moonmail-v4/   Current application template
├── tests/        Native engine and SDK integration suites
└── legacy/       Earlier templates retained for regression checks
```

| Directory                               | Purpose                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [moonmail-v4](moonmail-v4/)             | Current sealed-mail contract and its locked dependencies                                          |
| [tests/mailbox](tests/mailbox/)         | V4 sealed delivery, Inbox/Sent recovery, key history, mailbox state and earlier claim regressions |
| [tests/legacy-mail](tests/legacy-mail/) | Original public/link gift and SDK transaction checks                                              |
| [tests/recovery](tests/recovery/)       | Standalone recovery-capsule engine/SDK checks                                                     |
| [legacy](legacy/README.md)              | Historical contract implementations; not alternate mailbox choices in the website                 |

Each crate keeps its own `Cargo.toml` and `Cargo.lock`. Source/crate names,
cryptographic domains, deployed addresses and contract behaviour are unchanged
by this folder organisation. Historical evidence may refer to the earlier flat
paths; the [legacy index](legacy/README.md) maps them to their current locations.

## Run the checks

Use Rust 1.97.1 and the `wasm32-unknown-unknown` target from the repository's
toolchain file. Native engine execution needs Linux/WSL, plus Node and installed
JavaScript dependencies for SDK integration checks:

```sh
cargo build --manifest-path contracts/moonmail-v4/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo test --manifest-path contracts/tests/mailbox/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/tests/legacy-mail/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/tests/recovery/Cargo.toml --locked
```

The [development guide](../docs/DEVELOPMENT.md) and
[engine setup](../docs/ootle-v046-upgrade.md#build-and-engine-checks) explain the
SDK signer/fixture paths, including Windows Node under WSL. Tests use isolated
engine state and synthetic keys; these commands do not broadcast transactions.

## Generated files

Cargo output stays in ignored `target` directories; it is not source material.
Engine tests do not overwrite committed browser fixtures during normal runs.
To export original-engine codec state deliberately, set
`GHOSTDROP_ENGINE_FIXTURE` to an explicit path ending in `.local.json` before
running `export_real_engine_state_for_browser_codec_tests`. Other optional
fixture exports likewise require explicit local paths. Review any fixture before
promoting it to committed test data; keep local output outside the repository.
