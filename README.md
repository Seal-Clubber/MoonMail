# GhostDrop — The Haunted Post Office

Static React/TypeScript + Rust Ootle templates. Full letters/ciphertext and gift rules live on Ootle; no GhostDrop backend. Public visitors and private-link holders use a prepaid claim path without connecting a wallet. Sending uses the official local wallet daemon API-key client.

**Development status:** all three mail modes work on an isolated Ootle localnet, including addressed encryption, rotation, historical decryption and recipient discovery/spending. Postboxes require the [local wallet extension](wallet-extension/README.md). No public chain deployment is configured; spending stays disabled until deployment-specific evidence is complete. Authenticated GitHub Pages-to-wallet transport still needs verification. See [evidence](docs/EVIDENCE.md).

The HTTPS static interface is live at [GhostDrop on GitHub Pages](https://seal-clubber.github.io/GhostDrop/). All 10 browser checks passed against the hosted site. This verifies hosting and browser crypto; the public configuration still advertises no funded gifts.

## Run

Node 24.19+ and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Open the local URL printed by Vite. Guests enter immediately; “Explore preview” is explicitly example-only, with zero funded gifts. Assets, fonts and crypto WASM are served locally.

## Contracts

Rust 1.97.1 and `wasm32-unknown-unknown` are pinned in `rust-toolchain.toml`. Run the real engine on Linux/Ubuntu WSL; upstream Wasmer 7.4 Cranelift does not support Windows.

```sh
cargo test --manifest-path contracts/envelope/Cargo.toml --locked
cargo build --manifest-path contracts/envelope/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo build --manifest-path contracts/ghostdrop/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked
cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked javascript_ -- --ignored
```

The final command requires Node and installed JS dependencies on the same host. SDK bridge tests verify JSON/BOR encoding, WASM signatures and execution. On Windows + WSL set the three `GHOSTDROP_TEST_*` bridge paths described in [evidence](docs/EVIDENCE.md).

## Deploy and demonstrate

- [Deployment and GitHub Pages HTTPS](docs/DEPLOYMENT.md)
- [Architecture, cryptography and trust boundaries](docs/ARCHITECTURE.md)
- [Feature-to-evidence checklist](docs/EVIDENCE.md)
- [Demo walkthrough](docs/DEMO.md)
- [Dedicated donor Faucet Keeper](docs/KEEPER.md)

The Pages workflow is manual. Keep API keys, wallet data, donor configuration and private links out of public configuration, git and build variables. No spending worker is started by the web app.

MIT licensed. Tari libraries retain their upstream licenses. The visual scene is CSS and original text; no external artwork is required.
