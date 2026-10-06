# GhostDrop — The Haunted Post Office

Static React/TypeScript + Rust Ootle templates. Full letters/ciphertext and gift rules live on Ootle; no GhostDrop backend. Public visitors and private-link holders use a prepaid claim path without connecting a wallet. Sending uses the official local wallet daemon API-key client.

**Development status:** GhostDrop's templates, registry and three public letters are deployed on the real [Esmeralda testnet](docs/ESMERALDA.md), and their confirmed addresses are the site's default configuration. The letters contain no gifts and are readable without a wallet. Public and private-link gifts also pass real-testnet browser claims and independent stock-wallet payout/spend checks. Guest collection is enabled without a wallet connection: use an existing compatible account, or select creation for a fresh receiving address. The gift reserve pays new-account creation and collection fees. Sending and postbox actions remain gated on wallet transport verification. The local source now uses [standard-wallet encrypted memos](docs/STANDARD-WALLET-POSTBOXES.md) for new postbox keys; older extension postboxes retain their original recovery path. The new adapter opens actual on-chain mail through an independently restored, unmodified wallet. Secure hosted connection remains unresolved. See [evidence](docs/EVIDENCE.md).

The HTTPS static interface is live at [GhostDrop on GitHub Pages](https://seal-clubber.github.io/GhostDrop/). The published `da995ff` build passes 14 hosted browser regressions and reads the real deployment with its default configuration. Desktop public and mobile private-link claims through that actual site delivered exact gifts which the stock recipient spent. Five unclaimed public gifts, each 1 test TARI, remained during final verification; visitors may collect them. No funding worker remains running. [Published build](docs/pages-published-evidence.json) and [hosted gift evidence](docs/esmeralda-hosted-evidence.json) record the checks.

Network settings default to the official Esmeralda HTTPS indexer, native test TARI resource and confirmed GhostDrop registry/templates. Open `#/network` and use **Check indexer connection** to read public network/health/resource information without a wallet. Switching networks clears these contract identities to avoid reusing them on a different chain.

New postbox setup reviews and journals two transactions separately: an encrypted recovery memo on a permanently locked 1 µTARI output, then public registry registration. A confirmed, readable memo is required before publishing its key. No GhostDrop bridge or custom decrypt program is part of this route. The standard daemon still lacks a verified secure connection from GitHub Pages, so this source change does not enable hosted sending or postbox writes.

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
