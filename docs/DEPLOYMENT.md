# Deployment

**Current wallet target: Sapient.** Visitors use the static website and stock Sapient browser wallet. No daemon credentials, custom wallet build, separate GhostDrop extension, bridge program or file import is required. Public reading and public/private-link gift collection allow guests; sending and postbox setup require Sapient. [Sapient setup and limits](SAPIENT.md) describe the supported provider and approval flow.

The current `public/deployment.json` selects the verified Esmeralda Sapient V2 office, including its registry, envelope and recovery capsule identities. `sapientWallet`, `mailboxRecovery` and `postboxClaims` are enabled by the recorded [V2 campaign](postbox-v2-esmeralda-evidence.json). Postbox creation, key rotation, restored-wallet recovery, ownership-proof collection into a zero-TARI account and independent payout spending passed actual public tests. The original office is not selectable and old mail is not migrated.

The consumer GUI at `b4b86b7` is published over HTTPS. All nine production files match its exact Pages artifact. Pages and Verify passed, including 157 client tests, 156 one-worker Linux browser checks and all Rust jobs. Actual stock Sapient passed unsent two-approval setup, reply-toggle review invalidation, fresh-link/save-acknowledgement reset and disconnect cleanup. Fresh guests read an existing public letter through its actual sharing link and rejected sealed letters on desktop and phone layouts. These checks made no private-consent, signing or financial requests. [Current published evidence](gui-release-published-evidence.json) records exact scope; [earlier sharing evidence](public-sharing-published-evidence.json) and [GUI evidence](gui-evidence.json) preserve earlier checks and historical private-letter recovery.

The same published release also passed a separately approved four-transaction Sapient public/private-link gift campaign and recovery after one successful wallet-provider response was dropped. Both guest recipients received the full 0.1-TARI gift; claim fees came from separate sender reserves. [Financial verification](sapient-gift-published-evidence.json) records exact transactions, caps and scope. This completed campaign does not authorize further public broadcasts.

## Public network presets

The website defaults to Esmeralda (network byte 38), `https://ootle-indexer-a.tari.com/`, and native test TARI resource `resource_0101010101010101010101010101010101010101010101010101010101010101`. The HTTPS endpoint is the [official wallet CLI default](https://github.com/tari-project/ootle-wallet-cli), also present in the pinned SDK. Read-only checks on 2026-10-06 confirm health OK, network 38, daemon/indexer 0.43.0, the test TARI resource, and browser CORS support.

Open `#/network` directly. **Check indexer connection** checks the selected network, service health and resource with credential-free GET requests; it sends no transaction and enables no evidence flag. Localnet prefills the official SDK's `http://localhost:12500/`; Igor requires an operator-provided endpoint. Switching networks clears GhostDrop contract identities, evidence and wallet credentials. Custom compatible HTTPS indexers remain editable.

The default configuration includes confirmed Esmeralda registry/template identities from the authorized public deployment. Localnet evidence addresses belong to a separate chain and must never be inserted into the public preset. Contract publication alone does not verify gifts, wallet scope enforcement, recovery or hosted wallet transport; record each deployment-specific check before enabling its gate.

## Historical local deployment tooling

The two-template `deploy:local` recipe below preserves the original office's isolated developer lab and optional operator tooling. It is not a visitor setup requirement or a deployment recipe for the current three-template Sapient V2 office. For the current office, use the recorded V2 registry, envelope and recovery capsule identities; any replacement requires separately reviewed publication and deployment-specific recovery/claim evidence.

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

For a replacement deployment, keep evidence flags false until its corresponding checks are recorded. Engine tests alone do not prove network, input resolution, wallet delivery or recovery. Verify `engineClaims` against the identical deployed artifacts; `guestPayout` through independent recipient discovery and spending; and `guestAccountCreation` through fresh unfunded addresses and rollback cases. Guest public/private-link collection uses the public indexer and an ephemeral or link signer, with the sender's funded reserve. It does not require a connected wallet or recipient coins.

Sapient sending requires `sapientWallet`; V2 addressed operations also require `mailboxRecovery` and `postboxClaims`. Verify postbox registration, key rotation, restored-wallet recovery and ownership-proof claims for the selected office and capsule. Recovery requires explicit account-wide private view consent; gift collection uses a separately approved ownership proof. The current Esmeralda configuration enables these flags from the recorded V2 campaign. Connecting alone never supplies this evidence, and changing deployments clears it.

Legacy `daemonScopes` and `httpsWallet` remain false in the current Sapient configuration. They apply only to the preserved daemon adapter: actual scope/expiry checks and authenticated access from the hosted HTTPS origin are necessary before enabling that historical route. They do not gate or authorize Sapient.

The separate local donor CLI requires the confirmed chain/guest evidence and an explicit authorized funding account, then simulates each bounded publication. It uses Node's direct wallet RPC, so it does not claim or require hosted browser connectivity. Its configuration and optional `--journal` file can stay outside this checkout. See [Faucet Keeper](KEEPER.md).

The preserved donor/deployment and historical daemon adapter uses `authenticateWithApiKey`. Current source checks `transactions:create` for arbitrary transaction submission and `templates:create` for template publication. `accounts:read`, `transactions:read` and wallet-info access should be tested with the exact daemon version. An unscoped spending permission is broad spending authority; do not describe it as account-limited. The older [API-key guide](https://ootle.tari.com/guides/agent-api-keys/) uses legacy permission names; use current daemon source and runtime tests. No Admin credential is requested by GhostDrop. API-key minting/revocation remains the wallet owner's interactive task.

The historical isolated 0.43.0 probe verified scope enforcement, expiry/revocation and WalletSession connection/disconnect/token replacement. Real localnet publication and public/link claims committed; a separate recipient daemon discovered and spent both payouts. Dry runs can sign with read permission. Repeat daemon-specific checks only when deploying that optional historical adapter.

Historical daemon transport checks found that its OPTIONS response for the Pages origin lacked CORS allow-origin/header fields. Earlier [legacy extension](../wallet-extension/README.md) tests passed locally, but that patch is not the consumer connection route. Sapient's injected browser provider supplies the current supported connection, including verified actual Pages-origin access. Browser Local Network Access permission does not supply daemon CORS headers; do not add permissive development CORS, a central proxy or a separate GhostDrop bridge.

## GitHub Pages

`.github/workflows/verify.yml` runs client/build/browser checks and the contract, recovery-capsule and postbox-claim engine jobs on pushes, pull requests and manual dispatch. The unused manual native wallet-extension job has been removed; its historical lab source and evidence remain available. Static verification has a 20-minute job cap, Chromium installation an 8-minute step cap and a 60-second download connection timeout. Browser checks use one worker in CI, following Playwright's recommended runner configuration.

The earlier `fd4d90c` Verify run was cancelled after its Chromium installer stalled. At `4f87f39`, installation and Rust jobs passed but one exact fractional viewport assertion failed. Fix `178d48b` checks near-full visibility, actual bounds, actionability and keyboard focus. The user pushed it with `83e3d2d`; [Verify37688613299](https://github.com/Seal-Clubber/GhostDrop/actions/runs/37688613299) passed all157 client and142 one-worker Linux browser checks plus all Rust jobs. Earlier cancelled/failed runs retain their historical results.

`.github/workflows/pages.yml` builds/deploys every push to `main` after its own client tests and build pass, and supports manual dispatch. It uses the repository base path dynamically. The verified live URL is [GhostDrop](https://seal-clubber.github.io/GhostDrop/), with `0e2dab2` published and HTTPS enforced. Pages and Verify are separate workflows; check both results. See [GUI evidence](gui-evidence.json) and the dated [evidence checklist](EVIDENCE.md).

After authorization and confirmed repository access:

1. Select **Settings → Pages → Source: GitHub Actions** and enable **Enforce HTTPS**.
2. Review `public/deployment.json` and the public static artifact, then push the reviewed `main` commit. This starts the Pages workflow automatically; the separate Verify workflow also runs.
3. Check the Pages and Verify results. To redeploy the same commit, manually dispatch Pages. Verify all assets/WASM, homepage, private fragment deep links, refresh and copy under `/GhostDrop/`.
4. Test stock Sapient connection and origin disconnect from that actual HTTPS site. Verify postbox reads with separate explicit private-view consent; guest reads must still work disconnected. Review any financial regression campaign and its bounded test funds before broadcasting. No daemon transport flag or visitor bridge is needed for Sapient.

[GitHub documents](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) that Pages from private repositories requires an eligible paid plan. A private repository's ordinary Pages site can still be publicly accessible; review the output accordingly. HTTPS setup is described in [GitHub's HTTPS instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

## Mirrors and headers

Set `GHOSTDROP_BASE=/your-subpath/` during `pnpm build` for a mirror, or use `/` for a root/custom domain. Links are generated from the current trusted frontend base, carrying network/registry/template in the fragment. Serve HTML/JS/CSS/WASM over HTTPS with WASM MIME `application/wasm`. No SSR, rewrites, secret redirect service, SharedArrayBuffer or special COOP/COEP headers are required by the tested build. The client uses hash navigation. Host the same artifact/config on another origin, stop the original host, and verify the same chain mail through compatible tracked infrastructure.

Indexers must track the registry, every child envelope and dependent vaults/resources. Claim transactions resolve current versions of envelope, destination, both vault sets and resource before SDK signing. Verify this against the live indexer; the in-memory engine harness supplies available inputs automatically and does not prove production input discovery or consensus concurrency.
