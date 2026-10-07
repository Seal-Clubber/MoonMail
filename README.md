# GhostDrop — The Haunted Post Office

Static React/TypeScript + Rust Ootle templates. Full letters/ciphertext and gift rules live on Ootle; no GhostDrop backend. Public visitors and private-link holders use a prepaid claim path without connecting a wallet. The website connects directly to the [Sapient wallet](https://sapient.tari.mw/) through its browser provider. No extra daemon, GhostDrop bridge, API key or manifest import is required for this connection.

**Development status:** the original public/private-link office remains the default with confirmed Esmeralda mail and guest gifts. A second real office now supports stock Sapient postbox creation, key rotation, actual ledger recovery in an independently restored wallet, and gift-funded collection into an account with zero TARI. The recipient received the full 1 TARI and then signed an independent spend. The new interface/profile awaits the user's push; the existing HTTPS Pages site remains live. See [V2 public evidence](docs/postbox-v2-esmeralda-evidence.json) and [claim design](docs/POSTBOX-PROOF-CLAIMS.md).

The HTTPS static interface is live at [GhostDrop on GitHub Pages](https://seal-clubber.github.io/GhostDrop/). The current `25d358f` publication has matching reviewed assets, passes all 16 hosted browser regressions and reads the real deployment with its default configuration; the earlier `da995ff` publication also passed 14 hosted browser regressions. Desktop public and mobile private-link claims through that actual site delivered exact gifts which the stock recipient spent. Four unclaimed public gifts, each 1 test TARI, remained at the 2026-10-06 22:44 UTC reader check; their current availability is shown by the site. Capsule setup source is published behind the closed postbox gate. No funding worker remains running. [Published build](docs/pages-published-evidence.json) and [hosted gift evidence](docs/esmeralda-hosted-evidence.json) record the checks.

Network settings default to the official Esmeralda HTTPS indexer, native test TARI resource and confirmed GhostDrop registry/templates. Open `#/network` and use **Check indexer connection** to read public network/health/resource information without a wallet. Switching networks clears these contract identities to avoid reusing them on a different chain.

Open **Network & verification → Use Sapient postbox office** for new inboxes. **Use original public office** preserves historical public letters and private links; reloading selects that original office. The new `public/deployment-v2.json` enables recovery and proof claims only for the reviewed new identities. `public/deployment.json` and historical immutable contracts are unchanged. Creation/sending require Sapient funds. Addressed gift collection uses an explicit ownership approval and the sender's separate fee reserve, without recipient coins or a financial-wallet signature. Recovery requests separate account-wide private view permission. Visitors need the site and stock Sapient only; optional donor/deployment tools use a daemon.

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
- [Esmeralda deployment and funding status](docs/ESMERALDA.md)
- [Architecture, cryptography and trust boundaries](docs/ARCHITECTURE.md)
- [Feature-to-evidence checklist](docs/EVIDENCE.md)
- [Demo walkthrough](docs/DEMO.md)
- [Dedicated donor Faucet Keeper](docs/KEEPER.md)

The Pages workflow automatically publishes pushes to `main` after its client tests and build pass; it can also be run manually. Keep API keys, wallet data, donor configuration and private links out of public configuration, git and build variables. No spending worker is started by the web app.

MIT licensed. Tari libraries retain their upstream licenses. The visual scene is CSS and original text; no external artwork is required.
