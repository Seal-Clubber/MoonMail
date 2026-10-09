# One GhostDrop mail template

`contracts/ghostdrop-v3` builds one published WASM template, `GhostDrop`. It includes the post office, public letters, private-link letters, addressed Sapient mail, gift vaults and claim rules, permanent recovery capsules and encrypted mailbox preferences. A single template can instantiate many components. The root keeps small directory references; separate letter and mailbox components keep payloads out of the shared directory. This is one mail application template, not one ever-growing ledger record. There is no GhostDrop backend.

## Deployment status

This version is implemented and verified locally against the Ootle 0.45.0 engine and the website's production transaction builders. It has **not been published on Esmeralda**. Current public deployment files still identify the existing two-template post office and recovery service. Pushing the frontend alone does not enable the new contract or increase old letters' limits. Old contracts and receipts remain preserved.

A fresh approved Esmeralda publication and post office are required. There is no automatic mail or postbox migration. Configure `contractProtocol: "unified-1"`, `postboxClaimProtocol: "sapient-proof-1"`, the same reviewed hash for `template`, `envelopeTemplate` and `capsule.template`, and the root component for both `registry` and `capsule.component`. The root's `resource()` is `capsule.resource`. Evidence must be based on the new deployment; do not copy old funded acceptance into the new profile. `evidence.mailboxState` enables mailbox writes only alongside the existing Sapient, recovery and claim gates.

## Letters and gifts

Existing public, bearer-link and wallet-controlled postbox gift rules are retained. Postbox claims verify Sapient's context-bound ownership proof and pay from the sender's separate reserve. Payout, claimed flag and fee payment share the fee checkpoint; a later main-instruction failure cannot allow a second payout. The recipient receives the full named gift. Unsupported destinations, foreign ownership, stale proofs and reused claims are rejected. Visitors need only the site and Sapient; public/private-link readers and claims retain their optional-wallet route.

The complete encoded **letter component** is limited to **32 KiB**, including public metadata and the gift vault reference. The editor allows up to 16,000 UTF-16 code units for this deployment and counts serialized UTF-8/encryption overhead before review. This is a ceiling, not a promise that every 16,000-character Unicode message fits. Emoji, escaping and base64 expansion use more bytes. The old deployment remains at 4 KiB and 2,600 editor characters. Sapient simulates the actual fee before approval. Storage and read costs grow with message size.

## Encrypted mailbox state

Each postbox can create one registered state component. Only the postbox controller's transaction signer proof can open or update it. Every save requires an exact `u64` expected revision. The engine rejects a stale device atomically, leaving the current snapshot intact. Public APIs expose the ciphertext and revision; read marks are not public read receipts.

The website encrypts read, star and archive marks, message spacing and sorting to the postbox's current encryption descriptor. The context binds the network, registry, template, postbox, controller, key version and revision. A separate hashed purpose ID distinguishes preferences from ordinary letters. Bodies are padded to 4 KiB buckets; approximate snapshot size, controller, routing, timing and fees remain public. Neither private previews nor decoded preferences are stored in browser storage. Unsaved edits remain in memory and are explicitly labelled until one approved batch save is confirmed.

On another device, reconnect the same Sapient controller, approve the account-wide private view permission and load mailbox settings. The client checks the registered component and template, reads the encrypted snapshot and recovers its historical key from the permanent Sapient carrier. Key rotation does not rewrite older snapshots or destroy old carriers. Malformed or undecryptable state never becomes an empty editable replacement. Up to 512 marked IDs and 64 KiB of decoded preferences are supported; encrypted transport is limited to 96 KiB to remain below the engine's 128 KiB call limit. Marks cover IDs you have loaded, including arbitrary valid IDs such as `constructor`; they use maps rather than object-property lookups.

Saving pays ordinary wallet fees. Several edits can be batched into one Sapient approval. Opening/decrypting settings sends no transaction. The existing local delivery journal records the original wallet request and receipt, without plaintext settings. An uncertain save blocks a replacement for that mailbox until its original request is reconciled in Activity. A conflicting device must discard its unsaved changes and reload before preparing another save; changes are not silently merged. The journal itself does not follow the wallet to another browser.

## Recovery and limits

The root allocates its own immutable stealth recovery resource. Only that root can mint carrier units. Store accepts exactly one encrypted unit with no existing inputs, no revealed change and a DenyAll spend condition. Burn, recall, freeze and mint-rule updates are locked. The controller can recover an old memo after restoring Sapient without moving or spending the carrier. Postbox setup retains its two clearly labelled approvals: permanent recovery first, then registration.

Directories are bounded at 512 postboxes and 4,096 letters to stay within engine substate limits. This is an Esmeralda testnet release, not an unlimited production email service. Archive hides a letter from Inbox; it does not erase immutable chain data or refund storage. Sender/controller keys, routing and gift amounts remain public. Sent still has no encrypted sender copy. SMTP addresses, attachments, contacts, a sender blocklist and anonymous routing are outside this release.

## Verification

[Verification evidence](unified-contract-evidence.json) records local scope and separates engine proofs, browser fixtures and public deployment status. Engine tests cover controller isolation, stale revisions, size boundaries, child/root method separation, full public/link/postbox payouts, replay prevention, fee rollback/checkpoints, SDK proof transactions, locked recovery outputs and the production mailbox transaction builder paying actual engine fees. Browser checks restore encrypted marks/layout in a fresh session and reject damaged snapshots. No public-network transaction was broadcast for this version.
