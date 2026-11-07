# Ootle 0.49 reset and MoonMail republication

MoonMail was rebuilt for [Ootle 0.49.2](https://github.com/tari-project/tari-ootle/releases/tag/v0.49.2)
and published on the reset Esmeralda network on **7 November 2026**. The public
indexer reported **0.49.1** during verification. This is a fresh office: the old
office is absent after the network reset, and its postboxes/mail are not migrated.
Create a fresh postbox using updated Sapient.

## Dependencies and protocol changes

- Ootle TypeScript SDK/indexer/secret-key wallet: **0.13.0**.
- Signing/crypto WASM: **0.49.1**; CBOR decoder WASM: **0.49.2**.
- Wallet RPC client: **1.28.0**; generated bindings: **1.62.0**.
- Template library: **0.37.0**; native engine/tooling: **0.49.2**.
- Rust **1.97.1** and pnpm **11.19.0** remain pinned.

The official SDK now signs the sr25519 transaction format. Address parsing uses
`destination_tag`, and daemon transfer options use the renamed field. Indexer
substates, resources and dry-run results are decoded from base64 CBOR with the
official SDK. Down/malformed states still fail closed. This is not independent
browser verification of consensus proofs.

Contracts now assert the required public-key badge in the current call frame
instead of obtaining removed signer proofs. Components retain the default locked
upgrade rule. Native tests cover controller authority, fees, SDK signatures,
recovery carriers, sealed Inbox/Sent, key rotation, payments, replay and rollback.
Historical regression crates rebuild with the matching ABI; the original
implementation and old pins remain in Git history.

The new signer also rejects duplicate template inputs. Public-letter construction
now declares a unified office's template only once. This was caught during a real
pre-broadcast smoke check; no transaction was sent for the failed construction.

## Deployment

The default profile and its V4 copy point to:

| Identity          | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Network           | Esmeralda / 38                                                               |
| Template          | `053d83393b3bb23df607cc758ff5082257f034fef8415262811ab916877677af`           |
| Office            | `component_ed2b9dc6193daae03312aa9ae64355c305cf5ea0c280ff86a9bbddc6140a1b79` |
| Recovery resource | `resource_ed17af29e78ef47328739f074d3f2f05d63a17fad68e9bc009d4fd77ea11c4a1`  |
| WASM SHA256       | `2845b2c2d736a5a69b0af952cad6fb5531dfb698fe1f6e0f840a7d456d3114c2`           |
| WASM bytes        | 543,714                                                                      |

Confirmed transactions:

| Operation                   | Transaction                                                        | Actual fee, test TARI |
| --------------------------- | ------------------------------------------------------------------ | --------------------- |
| Template publication        | `8bcc4fc1f18acdc16d92798ca90f7ddc39b9d56af759f16ca7f9d01654038a60` | 21.425799             |
| Fresh office                | `739d3b2143274fe0ccc7ea1c6dbce35413de2504fad02d1340735d4b6c631e4a` | 0.013238              |
| Public demonstration letter | `fcf38dd19d88b91d466b9ffc0f26a6cd76dea00204f819313dce311f1b0ef9e1` | 0.014674              |

Total fees: **21.453711 test TARI**. The demonstration letter also holds a
**0.1-test-TARI gift** and **0.1-test-TARI collection reserve**. Its subject is
“A new moon over Esmeralda”; its body explicitly identifies it as a testnet demo.
It is real on-chain mail, not a preview fixture. The gift is left uncollected.

The default faucet had zero revealed balance. Its dry-run bootstrap failed before
any broadcast; no faucet funds were taken and no L1 burn was made. The user
provided 30 test TARI to an isolated deployment account. Its remaining revealed
balance after the above operations is 8.346289 test TARI, retained for development.
Each real operation was journaled before its single submission and reconciled
against the original transaction ID. Private keys, wallet profiles and operational
journals stay outside this repository.

## Verification scope

Local frontend checks and native engine checks are distinct from public
transactions. Current counts/results are recorded in
[the evidence file](ootle-v049-evidence.json). Browser suites use synthetic
providers and intercepted responses. Rust-generated CBOR fixtures exercise the
new SDK decoder without replacing it with a mock decoder.

Real network checks decoded the native resource and fresh office, confirmed the
new template/office/public letter, and checked the office's ownerless, locked
header. The exact deployed binary was built against template-lib 0.37.

The unmodified Chrome Web Store **Sapient 0.7.2** package was downloaded and
identified (CRX SHA256
`dec42531cc3d4f3b9df7a19f92692caa4881cfe87a937b3b5255b7c35c0d9939`).
This is package verification, **not a new funded stock-wallet end-to-end mailbox
or private-payment campaign**. Earlier Sapient 0.6.6 financial evidence remains
historical. New private-postbox setup/recovery and private payments should receive
a fresh stock-0.7.2 acceptance pass; local engine/SDK checks do not replace it.

No claim of anonymity, hidden signers, forward secrecy or private gift escrow is
added by this upgrade. Read permission remains separate from spending.

## Reproduce checks and publish the website

Use the commands and Linux/WSL SDK helper paths in the
[development guide](DEVELOPMENT.md) and
[earlier engine setup](ootle-v047-upgrade.md#build-and-engine-checks), with the
current pinned dependencies. Test commands do not broadcast. The Pages workflow
deploys the new static configuration when the user pushes `main`; on-chain
republication does not itself update GitHub Pages.
