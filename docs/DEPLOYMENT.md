# Deployment

Templates and registry were verified on isolated localnet. No hosted site or public-chain deployment has been published. Public-network spending, git push and Pages publication require separate authorization.

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

Keep all flags false until the corresponding **deployment-specific** evidence is recorded. Engine tests alone do not prove network, transport, indexer state/input resolution or wallet delivery. Set `engineClaims` only for the identical deployed template artifacts after contract/SDK bridge verification; `guestPayout` after independent recipient discovery and spend; `daemonScopes` after actual API-key scope/expiry tests; `httpsWallet` after testing the actual hosted HTTPS origin. `mailboxRecovery` additionally requires a wallet extension, historical keys, token replacement and recovery in a second client. Addressed actions also have explicit code guards, so toggling its flag alone does not enable a nonexistent encryption implementation.

The browser directly uses `authenticateWithApiKey`. Current source checks `transactions:create` for arbitrary transaction submission and `templates:create` for template publication. `accounts:read`, `transactions:read` and wallet-info access should be tested with the exact daemon version. An unscoped spending permission is broad spending authority; do not describe it as account-limited. The older [API-key guide](https://ootle.tari.com/guides/agent-api-keys/) uses legacy permission names; use current daemon source and runtime tests. No Admin credential is requested by GhostDrop. API-key minting/revocation remains the wallet owner's interactive task.

The isolated 0.43.0 probe verified scope enforcement, expiry/revocation and WalletSession connection/disconnect/token replacement. Real localnet publication and public/link claims committed; a separate recipient daemon discovered and spent both payouts. Dry runs can sign with read permission. Repeat against the intended hosted deployment before enabling writes.

Default daemon OPTIONS responses to the **planned** Pages Origin returned HTTP 200 but no `Access-Control-Allow-Origin` or allowed-header fields. A successful OPTIONS status alone is insufficient. Current daemon source exposes either disabled CORS or permissive development CORS, not a reviewed origin allowlist. Production Pages connectivity therefore remains blocked pending a supported, tested daemon origin policy. A minimal user-controlled daemon change should allow only the chosen HTTPS origin, POST/OPTIONS and Authorization/Content-Type, retaining API-key enforcement. This is a deployment requirement, not a completed extension. Do not enable broad development CORS as the production fix. From the actual Pages origin also test credentials mode, HTTPS-to-loopback transport and browser local-network permissions separately. Do not add a central wallet proxy or disable browser security.

## GitHub Pages

`.github/workflows/verify.yml` runs JS/build/browser and Linux engine checks. `.github/workflows/pages.yml` is a manual `workflow_dispatch` build/deploy workflow. It uses a repository base path dynamically; for `Seal-Clubber/GhostDrop`, the intended URL is `https://Seal-Clubber.github.io/GhostDrop/`. This URL is planned, **not a verified live site**.

After authorization and confirmed repository access:

1. Push the reviewed `main` commit, require verification to pass, and select **Settings → Pages → Source: GitHub Actions**.
2. Review `public/deployment.json` and the public static artifact. Enable **Enforce HTTPS** in Pages settings.
3. Manually dispatch the Pages workflow. Verify all assets/WASM, homepage, private fragment deep links, refresh and copy under `/GhostDrop/`.
4. Test daemon connectivity from that actual HTTPS origin before setting `httpsWallet` true and redeploying.

[GitHub documents](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) that Pages from private repositories requires an eligible paid plan. A private repository's ordinary Pages site can still be publicly accessible; review the output accordingly. HTTPS setup is described in [GitHub's HTTPS instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Mirrors and headers

Set `GHOSTDROP_BASE=/your-subpath/` during `pnpm build` for a mirror, or use `/` for a root/custom domain. Links are generated from the current trusted frontend base, carrying network/registry/template in the fragment. Serve HTML/JS/CSS/WASM over HTTPS with WASM MIME `application/wasm`. No SSR, rewrites, secret redirect service, SharedArrayBuffer or special COOP/COEP headers are required by the tested build. The client uses hash navigation. Host the same artifact/config on another origin, stop the original host, and verify the same chain mail through compatible tracked infrastructure.

Indexers must track the registry, every child envelope and dependent vaults/resources. Claim transactions resolve current versions of envelope, destination, both vault sets and resource before SDK signing. Verify this against the live indexer; the in-memory engine harness supplies available inputs automatically and does not prove production input discovery or consensus concurrency.
