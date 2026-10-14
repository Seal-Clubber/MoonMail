# MoonMail V4 sealed-delivery prototype

This **unpublished prototype** extends the single V3 template with an opaque sealed-letter directory. The deployed V3 source and addresses remain unchanged. The website does not select this template yet.

`publish_sealed(id, payload)` accepts a 64-digit lowercase hex ID and the four-field `mm-sealed-1` envelope: version, ephemeral public key, nonce and padded ciphertext. It does not accept public recipient IDs, recipient keys, controller keys, capsule locators, reply IDs or conversation IDs. Storage is immutable; duplicate IDs and calls against the wrong component kind fail. Discovery pages have a maximum of 50 entries; both directories share the 4,096-letter capacity.

The browser prototype encrypts addressing, key version, message and optional reply identity together. Ciphertext is padded to one of five size buckets. Recovered keys can trial-decrypt a bounded page without fetching a recipient-specific index. Reply identities derive from the recovered mailbox secret and an encrypted random conversation nonce. This is encryption-key separation, not independent Sapient spending accounts.

**Limits:** the contract validates structure and storage bounds, not whether ciphertext will decrypt. Transaction signers, timing, shared office and size buckets remain observable. Native private payments are separate from this directory; no atomic private gift or claim is implemented here. Sender authentication, recoverable Sent slot discovery, full wallet recovery integration, live stock-wallet publication and receiving tests remain required before activation. No anonymity claim.

The engine suite includes malformed/public routing fields, duplicates, mutation, bounded paging and recovery of an actual browser-encrypted payload after native engine persistence. Supply `GHOSTDROP_TEST_NODE`, `GHOSTDROP_TEST_LOADER` and `MOONMAIL_SEALED_FIXTURE` (the absolute `tools/sealed-engine-fixture.ts` path) for the SDK bridge test. It uses a clearly public synthetic test key and never touches a wallet or broadcasts.
