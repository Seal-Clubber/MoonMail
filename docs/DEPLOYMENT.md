# Deployment

Templates and registry are deployed on real Esmeralda, with three public demonstration letters verified through the application's reader. Their confirmed identities are in `public/deployment.json`. Public/private-link guest claims pass real browser and stock-recipient payout/spend checks; their chain/guest gates are enabled. Sender-wallet and postbox gates remain false. The static interface is live on GitHub Pages with HTTPS enforced; the new configuration reaches that site after the reviewed `main` checkpoint is pushed. See [the testnet deployment status](ESMERALDA.md).

## Public network presets

The website defaults to Esmeralda (network byte 38), `https://ootle-indexer-a.tari.com/`, and native test TARI resource `resource_0101010101010101010101010101010101010101010101010101010101010101`. The HTTPS endpoint is the [official wallet CLI default](https://github.com/tari-project/ootle-wallet-cli), also present in the pinned SDK. Read-only checks on 2026-10-06 confirm health OK, network 38, daemon/indexer 0.43.0, the test TARI resource, and browser CORS support.

Open `#/network` directly. **Check indexer connection** checks the selected network, service health and resource with credential-free GET requests; it sends no transaction and enables no evidence flag. Localnet prefills the official SDK's `http://localhost:12500/`; Igor requires an operator-provided endpoint. Switching networks clears GhostDrop contract identities, evidence and wallet credentials. Custom compatible HTTPS indexers remain editable.

The default configuration includes confirmed Esmeralda registry/template identities from the authorized public deployment. Localnet evidence addresses belong to a separate chain and must never be inserted into the public preset. Contract publication alone does not verify gifts, wallet scope enforcement, recovery or hosted wallet transport; record each deployment-specific check before enabling its gate.

## Isolated local chain

Use the supported official Ootle localnet with fresh donor/sender/recipient wallet directories. Never reuse a personal wallet or import a financial seed. SDK packages are pinned to 0.7.0, crypto WASM 0.43.0, wallet client 1.24.0, template lib 0.33.0, engine tooling 0.43.0 and Rust 1.97.1. Source compatibility was checked against `tari-ootle` commit `44d96cd6a5f22a0f4d104feb21a92f9440267274` and `ootle.ts` commit `c41c0ce04efd08df392203846b37496caa5844c7`. Do not invent network endpoints from examples.

1. Build both release WASM templates using README commands.
2. Copy `deployment-plan.example.json` to `deployment-plan.local.json`, choose your isolated loopback daemon and explicit funding account, and review the fee cap. Default invocation reads binaries and prints a plan without contacting a wallet:

```sh
pnpm deploy:local -- deployment-plan.local.json
```

3. Provide a short-lived isolated API key in process environment `GHOSTDROP_DEV_API_KEY`. `--dry-run` uses the official daemon `publishTemplate` schema and does not publish. `--submit` explicitly submits only localnet transactions, after a successful simulation:

```sh
pnpm deploy:local -- deployment-plan.local.json --dry-run
pnpm deploy:local -- deployment-plan.local.json --submit
```

4. Reconcile both transaction IDs through the daemon/indexer. Read the **actual published template identities from committed execution output**, not the printed SHA-256 artifact fingerprint. The daemon may optimize WASM before publication. Put the confirmed PostOffice identity in `officeTemplate` and child identity in `envelopeTemplate` in your local plan. Supply `currentEpoch` from the actual local indexer. Create the registry explicitly:

```sh
pnpm deploy:local -- deployment-plan.local.json --create-registry --dry-run
pnpm deploy:local -- deployment-plan.local.json --create-registry --submit
```

5. Reconcile the created registry component and check owner rule `None`, both template identities and test network. The tool preserves public uncertain attempts in ignored `.deployment-state.local.json`; an existing attempt blocks repeated submission. Inspect history before changing a journal entry. A timeout does not prove rejection. Publication and registry creation were successfully exercised on isolated localnet; see the evidence document.
6. Fill `public/deployment.json` with network, registry, registry template, envelope template, actual indexer endpoint and native test TARI resource. No seeds, API credentials, capabilities or donor configuration belong in this file.

## Required evidence before enabling spending

Keep all flags false until the corresponding **deployment-specific** evidence is recorded. Engine tests alone do not prove network, transport, indexer state/input resolution or wallet delivery. Set `engineClaims` only for the identical deployed template artifacts after contract/SDK bridge verification; `guestPayout` after independent recipient discovery and spend; `daemonScopes` after actual API-key scope/expiry tests; `httpsWallet` after testing authenticated wallet access from the actual hosted HTTPS origin. `mailboxRecovery` additionally requires the selected adapter's historical keys, token replacement and recovery in a second client. The current adapter uses the wallet extension; the standard-wallet native-memo recovery route is proven on an isolated chain but not yet integrated. Addressed actions also have explicit code guards, so toggling its flag alone does not enable a nonexistent encryption implementation.

Guest public/private-link collection requires only confirmed deployment identities plus `engineClaims` and `guestPayout`. It signs through the public indexer using an ephemeral or link key, so it does not require `daemonScopes` or `httpsWallet`. Sending requires both wallet gates; addressed operations additionally require `mailboxRecovery`. The confirmed Esmeralda guest evidence and 11 engine/SDK bridge checks enable collection while keeping wallet actions disabled. Changing deployment settings clears evidence; operators must verify any replacement deployment independently.

The browser directly uses `authenticateWithApiKey`. Current source checks `transactions:create` for arbitrary transaction submission and `templates:create` for template publication. `accounts:read`, `transactions:read` and wallet-info access should be tested with the exact daemon version. An unscoped spending permission is broad spending authority; do not describe it as account-limited. The older [API-key guide](https://ootle.tari.com/guides/agent-api-keys/) uses legacy permission names; use current daemon source and runtime tests. No Admin credential is requested by GhostDrop. API-key minting/revocation remains the wallet owner's interactive task.

The isolated 0.43.0 probe verified scope enforcement, expiry/revocation and WalletSession connection/disconnect/token replacement. Real localnet publication and public/link claims committed; a separate recipient daemon discovered and spent both payouts. Dry runs can sign with read permission. Repeat against the intended hosted deployment before enabling writes.

The stock daemon's OPTIONS response for the Pages origin lacks CORS allow-origin/header fields. The [pinned local extension](../wallet-extension/README.md) adds an opt-in exact-origin policy, loopback-only fixed-port listener, Host checks, POST/OPTIONS and Authorization/Content-Type support while retaining API-key authentication. Native restrictions and actual local-browser authenticated RPC pass. Authenticated transport from the actual Pages HTTPS origin still needs testing; a successful OPTIONS status alone is insufficient. Grant browser Local Network Access through normal site permissions. Do not enable permissive development CORS, add a central wallet proxy or disable browser security.

## GitHub Pages

`.github/workflows/verify.yml` runs JS/build/browser and Linux engine checks on pushes and pull requests. Its expensive native wallet-extension job runs only when **Verify GhostDrop** is started manually with **Run workflow**; it also runs the normal checks in that case. `.github/workflows/pages.yml` automatically builds/deploys every push to `main` after its own client tests and build pass. The manual `workflow_dispatch` trigger remains available. It uses a repository base path dynamically. The verified live URL is [GhostDrop](https://seal-clubber.github.io/GhostDrop/); hosted checks cover the build at `72b853c`. See [the evidence](EVIDENCE.md) for successful workflow runs.

After authorization and confirmed repository access:

1. Select **Settings → Pages → Source: GitHub Actions** and enable **Enforce HTTPS**.
2. Review `public/deployment.json` and the public static artifact, then push the reviewed `main` commit. This starts the Pages workflow automatically; the separate Verify workflow also runs.
3. Check the Pages and Verify results. To redeploy the same commit, manually dispatch Pages. Verify all assets/WASM, homepage, private fragment deep links, refresh and copy under `/GhostDrop/`.
4. Test daemon connectivity from that actual HTTPS origin before setting `httpsWallet` true and redeploying.

[GitHub documents](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) that Pages from private repositories requires an eligible paid plan. A private repository's ordinary Pages site can still be publicly accessible; review the output accordingly. HTTPS setup is described in [GitHub's HTTPS instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Mirrors and headers

Set `GHOSTDROP_BASE=/your-subpath/` during `pnpm build` for a mirror, or use `/` for a root/custom domain. Links are generated from the current trusted frontend base, carrying network/registry/template in the fragment. Serve HTML/JS/CSS/WASM over HTTPS with WASM MIME `application/wasm`. No SSR, rewrites, secret redirect service, SharedArrayBuffer or special COOP/COEP headers are required by the tested build. The client uses hash navigation. Host the same artifact/config on another origin, stop the original host, and verify the same chain mail through compatible tracked infrastructure.

Indexers must track the registry, every child envelope and dependent vaults/resources. Claim transactions resolve current versions of envelope, destination, both vault sets and resource before SDK signing. Verify this against the live indexer; the in-memory engine harness supplies available inputs automatically and does not prove production input discovery or consensus concurrency.
