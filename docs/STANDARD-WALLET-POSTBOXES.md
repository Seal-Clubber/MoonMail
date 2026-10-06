# Postboxes with the standard wallet

There is a working alternative to installing the GhostDrop wallet patch: use the standard Ootle wallet's encrypted payment memos to recover a mailbox-specific key. The encryption/recovery route has been exercised on an isolated chain using the **unmodified official wallet daemon 0.43.0**. The hosted website has not yet migrated its postbox adapter to this route.

## Preserve the original model

1. The website generates a random mailbox encryption key for one postbox and key version. The controlling wallet signs registration of its public key in GhostDrop's existing registry.
2. Store the private mailbox key in a small **encrypted native Ootle memo**, sent to that wallet's own Ootle address. Encrypting a native memo uses the wallet's ordinary view public key; the financial seed and private view key never leave the wallet.
3. Put that memo on a one-microTARI carrier output with a script-only `DenyAll` spending condition. Its value is permanently locked, so normal spending cannot consume the recovery record. Charge its creation fee explicitly as part of postbox setup/rotation.
4. The sender encrypts the complete subject/body to the registered mailbox public key. The full ciphertext remains in the existing ownerless Envelope component. The recorded controller still governs postbox updates and addressed-gift collection.
5. On another device, restore the ordinary Ootle wallet from its seed. Its native scanner decrypts the memo. GhostDrop reads that account's recovered memo using `stealth_utxos.list`, obtains only the mailbox key, and decrypts letters in the browser.

This keeps wallet-controlled postboxes, independent nicknames/inboxes, complete on-chain letters, versioned keys and wallet recovery. It requires no separate mailbox backup file, new user identity, financial seed import into the website, custom daemon decrypt RPC, or GhostDrop backend. Public and private-link flows are unchanged.

The [official privacy documentation](https://ootle.tari.com/concepts/privacy/#encrypted-payloads) describes encrypted native payloads and memos. The pinned standard implementation returns decrypted memos in [`stealth_utxos.list`](https://github.com/tari-project/tari-ootle/blob/392d805579db35fcc8e8bc1aba84adc1fffe0c22/applications/tari_walletd/src/handlers/stealth_utxos.rs); native memo bytes are bounded to 253 bytes. A short key capsule fits; the entire letter need not fit in the memo.

## Actual proof

The test published a script-only `DenyAll` carrier, created a wallet-controlled postbox, and published a full encrypted addressed letter to the real isolated registry. It then recovered the carrier in a fresh standard-wallet store restored internally from the disposable test seed, with no original wallet database or browser key. A new process read the stored envelope through the indexer, checked its frozen controller and successfully opened its full subject/body using the application's crypto helper. Public identities and accepted transaction IDs are in [native-memo-evidence.json](native-memo-evidence.json). These addresses belong to localnet, not Esmeralda.

The carrier's committed script root matches the official WASM-derived root for the single `DenyAll` condition and has no alternate key spending path. Native wallet selection excludes script-only outputs. The creation/rotation cost includes one permanently locked microTARI per key version plus transaction fees. Do not use an ordinary spendable payment output as a recovery record.

Normal owner UI authentication issued/revoked temporary keys for creation and publication. Fresh-store recovery used an isolated loopback wallet in test-only authentication-none mode and a read-only JWT, so it proves cryptographic/native scanning recovery, not physical-passkey onboarding. No personal wallet or public testnet funds were used. The first memo scans lagged while the restored chain caught up; later original-wallet and independent restored-wallet reads both succeeded. No uncertain submission was repeated.

## Integration still required

- Migrate creation/rotation to a reviewed capsule transaction followed by registry registration. Show both fee caps and the permanently locked carrier amount before signing. Journal both steps independently; a timeout must not create another capsule or key version automatically.
- Bind the capsule to the full network, registry, template, postbox, controller and key version. `src/core/capsules.ts` supplies a compact context-hashed format and checks the recovered key against the published public key. The live proof used an earlier test tuple; the hardened format has separate automated tests and must be exercised through the native wallet before activation.
- Route addressed decryption through the recovered mailbox key and `openMailbox`. Preserve existing patched-wallet postboxes as a compatible legacy path; their keys cannot silently change.
- Test historical versions, rotation, scoped memo access, disconnect/token replacement, reload and recovery after a separate restore with the final adapter. Reading native memos can expose other private payment memos within the granted account; describe and scope that permission accurately.
- Verify the **actual GitHub Pages-to-standard-wallet connection**. The cryptographic proof uses local RPC. Stock RPC CORS and browser local-network permissions remain a separate integration problem. Native WebRTC exists, but a complete supported hosted pairing flow and its signaling infrastructure have not been verified. Do not require an additional user-side process, add a central wallet proxy, enable permissive development CORS, or claim hosted connectivity based only on the crypto test.

The existing website therefore retains its current postbox adapter and deployment write gates. This document records a tested recovery route and the remaining migration work, not a claim that the deployed website already supports it.
