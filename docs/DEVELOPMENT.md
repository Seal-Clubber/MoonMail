# Developing MoonMail

MoonMail is a static React/TypeScript app backed by Ootle contracts and stock
Sapient. Visitors need no development tools, custom wallet or bridge service.
The [README](../README.md) introduces the app; the [demo](DEMO.md) explains the
user flow and permission boundaries.

## Frontend

Use the versions in [`package.json`](../package.json): Node 24.19+ and
pnpm 11.19.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The development server binds to `127.0.0.1`. The current
[`public/deployment.json`](../public/deployment.json) selects the real Esmeralda
V4 office. Running locally does not create a private test network: approving a
transaction against that profile uses real testnet funds. Browser fixtures and
the explicitly labelled sample preview are separate from live mail.

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Build before browser tests. Playwright starts the local static verification
server against `dist` at `/MoonMail/`, with desktop and mobile projects. On a
Linux machine that needs Chromium system dependencies, use
`pnpm exec playwright install --with-deps chromium`.

## Where things live

| Path                     | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `src/`                   | Mailbox UI, encryption, wallet integration and chain reads   |
| `public/`                | Deployment profiles, local fonts and favicon                 |
| `contracts/moonmail-v4/` | Current unified sealed-mail template                         |
| `contracts/tests/`       | Engine/SDK regression suites, separate from application code |
| `contracts/legacy/`      | Earlier templates retained for reproducibility               |
| `tests/`                 | Unit tests and desktop/mobile browser checks                 |
| `tools/`                 | Local deployment, verification and optional keeper utilities |
| `docs/`                  | Protocols, user guides and scoped verification evidence      |
| `.github/workflows/`     | Verification and static Pages deployment                     |

Earlier contract generations and evidence retain their historical context.
The website uses the current V4 office; legacy development tools are not visitor
requirements and are never launched by the website.

## Contracts and native engine checks

[`rust-toolchain.toml`](../rust-toolchain.toml) pins Rust 1.97.1 and
`wasm32-unknown-unknown`; templates use template-lib 0.35 and engine checks use
Ootle 0.47. Run native
engine checks on Linux or WSL: upstream Wasmer 7.5 Cranelift does not support
Windows.

```sh
cargo test --manifest-path contracts/tests/mailbox/Cargo.toml --locked -- --include-ignored
```

The SDK bridge tests need Node and installed JavaScript dependencies. With
Windows Node under WSL, provide the Node executable and TypeScript loader paths,
and Windows absolute paths for the signer/fixture variables such as
`GHOSTDROP_TEST_POSTBOX_SIGNER`, `GHOSTDROP_MAILBOX_SIGNER`,
`GHOSTDROP_CAPSULE_FIXTURE` and `MOONMAIL_SEALED_FIXTURE`. The
[Ootle upgrade guide](ootle-v047-upgrade.md#build-and-engine-checks) documents
the exact path conventions and additional engine suites. The
[V4 template guide](../contracts/moonmail-v4/README.md) describes its bounded
storage and SDK fixture.

## GitHub Pages

In repository settings, select **GitHub Actions** as the Pages build source.
The [Pages workflow](../.github/workflows/pages.yml) runs on pushes to `main`
or manual dispatch. It installs pinned dependencies, runs unit tests, builds
the static site and publishes `dist` over HTTPS. It supplies
`MOONMAIL_BASE=/<repository-name>/` for project-site asset paths.

The separate [verification workflow](../.github/workflows/verify.yml) includes
browser and contract jobs. The Pages workflow itself does not run the browser
or native engine suites. Publishing the website does not deploy a new Ootle
template or migrate an office.

Do not treat a locally served build on the Pages HTTPS origin as evidence that
GitHub has published it. Verify the deployed assets and Actions result after
publication. Historical evidence identifies the version and test scope it
actually checked.

## Private material and compatibility

Keep wallet data, private links, API keys and development credentials out of
Git, build variables and screenshots. Local prompts, development handoffs and
private test evidence belong outside the app repository. Public evidence should
be sanitised and distinguish fixtures, real ledger reads and funded broadcasts.

The [branding guide](branding.md) explains why some historical paths and
`GHOSTDROP_*` variable names remain. Cryptographic domains are compatibility
boundaries; changing the display name must not rename them. The
[historical architecture](ARCHITECTURE.md) and [earlier evidence](EVIDENCE.md)
describe their original versions, not guarantees for every current operation.
