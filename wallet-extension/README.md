# Local wallet extension

Experimental patch for official Ootle wallet daemon **v0.43.0**, source commit `392d805579db35fcc8e8bc1aba84adc1fffe0c22`. It adds GhostDrop postbox encryption and an opt-in exact-origin policy. It runs on the wallet owner's machine. GhostDrop still needs no application backend.

An [alternative using standard-wallet encrypted memos](../docs/STANDARD-WALLET-POSTBOXES.md) now has an isolated-chain recovery proof, including a fresh seed-restored stock wallet. It can remove the custom patch requirement after the website adapter and hosted connection are migrated and verified. Existing patched-wallet postboxes remain supported by the current implementation.

## What “Local wallet extension” means

This directory contains source changes to the Ootle **wallet daemon**, the local program that holds wallet keys and signs transactions. Build and run the patched daemon separately using the instructions below. It is not installed by visiting GhostDrop, and it is not a Chrome/Firefox extension. The static website connects directly to that daemon's loopback JSON-RPC interface using a temporary API key issued in the local wallet UI.

The patch adds two operations: derive a postbox's public encryption key, and decrypt a stored addressed letter inside the wallet. Derivation binds the wallet seed to the network, GhostDrop registry/template, postbox, controller and key version. The website receives only the public key or decrypted subject/body; the seed and secret postbox key stay in the daemon. Keeping the wallet's recovery seed allows older key versions to be derived again; a full restored-daemon recovery run is still unverified.

| Action                                  | Wallet connection                             | Postbox encryption extension                    |
| --------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Read public mail                        | No                                            | No                                              |
| Open private-link mail                  | No; the secret link decrypts it locally       | No                                              |
| Receive a public/private-link gift      | Optional; a valid receiving account is needed | No postbox operations                           |
| Send mail or fund a gift                | Yes, for signing and paying fees              | Only postbox-specific key operations require it |
| Create/open a wallet-controlled postbox | Yes, using the controlling wallet             | Yes                                             |

The patch also enables an explicit website-origin allowlist for browser access to the local wallet. Hosted sending still needs compatible browser-to-wallet transport even when postbox encryption is unused. A spending API key grants the daemon's existing broad transaction authority; postbox key/decrypt permissions are separately scoped to a controlling account. Disconnecting clears GhostDrop's in-memory key, while revoking the key in the wallet UI invalidates it at the daemon.

This is an experimental GhostDrop integration, not an independently audited or standard Ootle wallet feature. No existing wallet installation or personal seed is changed automatically.

**Verified locally:** six native tests, 16 live RPC checks, owner WebAuthn registration/scoped key issuance/revocation, and complete isolated-chain addressed publication/decryption/claim/spending pass. Desktop/mobile browsers decrypt real stored mail, and the desktop interface creates/reconciles a real postbox. A fresh pinned checkout exactly reproduces all 14 patched files. Authenticated Pages-to-loopback transport remains unverified. See [evidence](../docs/EVIDENCE.md); default deployment gates remain closed.

## Build in isolation

The GitHub Actions native wallet-extension checks are manual-only. Open **Actions → Verify GhostDrop → Run workflow** to run them with the application and contract checks. Pushes and pull requests skip the native wallet-extension job; GitHub Pages deployment does not depend on it.

Use Linux/Ubuntu WSL, Rust 1.97.1, C/C++ build tools, CMake, OpenSSL development headers, `pkg-config`, `libdbus-1-dev` and `protobuf-compiler`. A first native build compiles the upstream WASM optimizer and can take considerable time and disk space. Keep this checkout, build cache and test wallet stores outside the GhostDrop repository. No installed wallet is changed automatically.

```sh
bash wallet-extension/build.sh "$HOME/.cache/ghostdrop/ootle-392d805" test
```

The script requires a fresh directory, checks out the exact source commit with a detached HEAD, checks/applies the patch and runs its native tests. Modes: `source` only prepares source; `headless` builds the RPC daemon without a wallet UI; `wallet-ui` uses upstream's release build including its wallet UI. The latter also needs Node and pnpm for the pinned upstream workspace. Retain and verify the resulting UI; upstream's build script can warn and continue after frontend failures. A headless build alone does not provide interactive key issuance.

After preparing source, all commands can be rerun there using `cargo ... --locked`. Never use a test-store database provisioning shortcut on a real wallet. Wallet owners create/revoke API keys through the daemon's authenticated wallet interface.

## Exact web origins

For a separately installed/pinned extension daemon, use a loopback listener and explicit origins, for example:

```sh
export GHOSTDROP_WALLET_ORIGINS='https://seal-clubber.github.io,http://localhost:5100'
```

Include the exact local wallet UI origin for its normal owner authentication. No trailing slash or path; HTTPS origins are allowed, HTTP is limited to loopback. The listener stays on its configured port; a busy port fails. Unknown origins and non-loopback Host headers reject. CORS allows POST/OPTIONS and Authorization/Content-Type. API-key authentication remains enabled. Browser Local Network Access permission is separate from CORS; grant the trusted site access using the browser's normal permission prompt. Never disable web security or enable permissive development CORS as the production solution.

An origin covers every page at that origin: on GitHub Pages, different repository paths share the same owner origin. Trust that entire origin before giving it any wallet credential.

## Permissions and protocol

The wallet API-key screen adds `postboxes:key` and `postboxes:decrypt` with a required controlling account component. They encode `postboxes:key:component_<hash>` and `postboxes:decrypt:component_<hash>`. They neither imply each other nor grant transaction signing/submission or financial key export. Gift collection additionally requires the wallet's existing `transactions:create` permission, which remains broad spending authority. GhostDrop requests no Admin API key. The owner's normal authenticated wallet session manages keys.

RPC methods `postboxes.public_key` and `postboxes.decrypt` authorize before accessing an account. They require its seed-derived controller, matching wallet network and versioned context. Public-key output is `{version:"gd-postbox-1",keyVersion,publicKey}`. Decryption returns only authenticated subject/body. Request values and credentials never enter new logs.

Key derivation uses the official wallet key store at index zero on a domain-separated branch containing the complete JSON context: protocol, network, registry template/component, postbox ID, controller and key version. It exports no seed or mailbox secret. The sender generates an official random Ristretto ephemeral key, uses Tari's supported `encrypted_data_dh_kdf_aead`, then domain-separated HKDF-SHA256 and AES-256-GCM with a fresh 96-bit nonce. Authenticated metadata binds both public keys, all context and the envelope ID. Complete ciphertext lives in the Ootle envelope.

Historical payloads retain their key version. Rotation changes the advertised public key for new mail; the wallet derives older versions. Native tests restore an independent key store from mnemonic words. Live RPC/chain checks use a second client and replacement API credential to decrypt old on-chain ciphertext after rotation; browser state is unnecessary. A full recovered daemon installation has not been exercised. Imported/view-only accounts cannot claim this seed-derived recovery path.

This custom protocol has automated tamper, readdressing, wrong-controller/network/account, expiry/revocation and permission-isolation tests and needs independent review before use with valuable assets. Contest support is restricted to Ootle test networks 16/36/38. There is no hidden refund or key-recovery server.

The patch's new code is MIT licensed. The pinned Tari source retains its [BSD 3-Clause license](UPSTREAM-LICENSE).
