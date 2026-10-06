# GhostDrop — The Haunted Post Office

Static React/TypeScript + Rust Ootle templates. Full letters/ciphertext and gift rules live on Ootle; no GhostDrop backend. Public visitors and private-link holders use a prepaid claim path without connecting a wallet. The website connects directly to the [Sapient wallet](https://sapient.tari.mw/) through its browser provider. No extra daemon, GhostDrop bridge, API key or manifest import is required for this connection.

**Development status:** GhostDrop's templates, registry and three public letters are deployed on the real [Esmeralda testnet](docs/ESMERALDA.md), and their confirmed addresses are the site's default configuration. Public/private-link gifts pass real-testnet browser claims and independent recipient payout/spend checks. Guest collection remains available without wallet connection, including gift-funded account creation. The new Sapient connection, public registry reads, wallet rejection, saved approval after reload and disconnect pass with an unmodified Sapient 0.6.6 build and a disposable wallet. A Pages HTTPS-origin probe passes using a local build override; the Sapient changes are not yet published. Sending stays gated until a funded publication is verified. Postbox actions additionally await Sapient key recovery. See [Sapient integration](docs/SAPIENT.md) and [evidence](docs/EVIDENCE.md).

The HTTPS static interface is live at [GhostDrop on GitHub Pages](https://seal-clubber.github.io/GhostDrop/). The published `da995ff` build passes 14 hosted browser regressions and reads the real deployment with its default configuration. Desktop public and mobile private-link claims through that actual site delivered exact gifts which the stock recipient spent. Five unclaimed public gifts, each 1 test TARI, remained during final verification; visitors may collect them. No funding worker remains running. [Published build](docs/pages-published-evidence.json) and [hosted gift evidence](docs/esmeralda-hosted-evidence.json) record the checks.

Network settings default to the official Esmeralda HTTPS indexer, native test TARI resource and confirmed GhostDrop registry/templates. Open `#/network` and use **Check indexer connection** to read public network/health/resource information without a wallet. Switching networks clears these contract identities to avoid reusing them on a different chain.

Historical postbox descriptors and recovery code are preserved. Their daemon memo/legacy extension proofs do not establish Sapient recovery. New Sapient postboxes remain disabled rather than replacing permanent recovery with browser storage or a spendable payment memo. The optional donor/deployment CLI still uses a daemon; website visitors do not need it.

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
