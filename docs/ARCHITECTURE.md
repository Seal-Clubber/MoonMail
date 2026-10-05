# Architecture and threat model

GhostDrop is a static React application. GitHub Pages serves HTML/CSS/JS and the official Tari crypto WASM. There is no required GhostDrop server. Wallet RPC goes directly to a user-controlled daemon; indexer reads and guest transaction submissions go directly to replaceable infrastructure.

## Authority and data

The Rust PostOffice template stores postbox IDs/nicknames/controllers/encryption public keys and a stable ID-to-envelope component index. It atomically creates a separate Envelope component containing the complete public message or authenticated ciphertext, immutable claim authority and its own funded vault. Link envelopes have a public claim verification key; addressed envelopes freeze the registered controller. Each component uses OwnerRule::None, disabling owner access-rule changes. No upgrade/withdraw/refund route or administrator exists. Sending withdraws exact gift plus reserve and publishes in one main intent. Sender publication fees can still commit when publication fails; reconcile the transaction and account balance before trying again. Separate envelope components prevent later registry growth from increasing an existing gift's claim storage cost or making unrelated gifts compete for the same registry write lock.

Only native test TARI is implemented, with **revealed** gifts and fees. Do not confuse this with L1 Universe XTM, or claim confidential gift amounts. Transaction sender/controller keys, timing, resource, amounts, envelope IDs and addressed routing remain visible.

## gd-link-1 cryptography

The device generates a random 32-byte root capability using Web Crypto. HKDF-SHA256 derives two independent AES-256-GCM keys with distinct `letter` and `claim-wrap` labels. Salt, info and authenticated data bind version, network, registry, template, envelope ID and purpose. Fresh 12-byte IVs are used separately for each encryption. The entire subject/body is encrypted.

The claim signer is a separately random keypair from official Tari WASM `generateKeypair`, wrapped under the `claim-wrap` key. This construction deliberately does not invent a scalar derivation from HKDF bytes. Opening unwraps the private scalar, verifies its derived Tari public key against the recorded authority, and delegates transaction signing to the official SecretKeyWallet. The random root and wrapped signer are independent; no financial wallet seed is imported or exported. This is a standard primitive composition tested here, **not a third-party cryptographic audit**.

The capability stays in the fragment and page memory. It is never an RPC argument, query, analytics event or on-chain field. Capturing replaces the visible history entry with an ID-only route. Refresh after capture needs the saved original link again. Anyone with the original link, including the sender, can read and compete to claim. A malicious frontend/extension can steal it. AES authentication does not hide public metadata. Claimed letters remain decryptable.

## Fee checkpoint

`claim_and_pay_fee` runs wholly in **fee instructions**: verify gift state and authority; require a built-in account destination; mark claimed; deposit exact gift; pay the fixed reserve cap. This makes the entire payout part of the fee checkpoint. A failed main intent must retain both payout and consumed claim; a fee-checkpoint failure must revert both. There is no generic fee-sponsor method that can be called repeatedly without consuming the gift. Extra instructions can burn only the cap committed to this gift; they cannot reopen it. An insufficient cap leaves the gift unclaimed. Unused reserve is permanently locked; no expiry or refund is implemented.

Native in-memory engine tests validate this protocol separately from real network deployment, indexer transport, browser signing and recipient wallet discovery/spendability. The latter evidence is required before production buttons are enabled.

## Receiving and wallet credentials

Public and link claims use ephemeral/link signers and an already-existing receiving account. No connection or funded receiving wallet is needed by the protocol. Manual entry requires a checksummed Ootle address **and** its account component; the indexer confirms the address network and owner key. The template additionally rejects non-built-in accounts. Memo addresses are unsupported. Mailbox authority and destination ownership are separate.

The wallet adapter uses official `authenticateWithApiKey`, disables reauthentication, validates network and paginates accounts. API keys stay in memory and are cleared on disconnect. A key permitting arbitrary transaction submission is spending authority. Current source requires `transactions:create`, an unscoped capability, rather than pretending the older account-scoped documentation limits arbitrary manifests. No Admin permission is requested. Runtime permission and expiry tests against a fresh isolated daemon remain required.

## Mailbox recovery boundary

Stock daemon operations decrypt stealth payment data; no reviewed arbitrary-letter unwrap/recovery operation was found. Registration and addressed sending/decryption remain disabled. The template can enforce postbox controller/gift rules, but that does not prove encryption recovery. A local extension must store versioned mailbox-specific keys within the user-controlled wallet, expose a narrowly authorized unwrap operation, and demonstrate recovery in a second client without the original browser. API keys, signatures, master view keys and exported wallet seeds must not be used as substitutes.

## Infrastructure, pagination and history

The client verifies configured template identity and ownerless registry, then strictly decodes the component state returned by the indexer. It does **not** verify validator consensus proofs. A dishonest indexer can lie about history, confirmed availability and destination ownership; use infrastructure you trust and verify delivery in the recipient daemon. Template method checks and signatures still govern honest chain execution.

Configure indexer tracking for the registry, child envelope components and their dependent vaults. Registry IDs plus current envelope states are the authoritative archive, retaining full letters after claims. `list_letters(after, limit)` and `list_postboxes(after, limit)` provide stable-ID pages of 1..100 in template calls. The static client downloads the registry index and fetches envelopes in pages of 100 (eight parallel reads at a time), renders 12 per page and offers “Load more chain mail.” Direct private links resolve their ID independently of the loaded page. The keeper reads every page before planning refills. This registry index still grows; publication scalability is bounded by actual engine limits and is not an unlimited archive guarantee. Historical indexer retrieval uses explicit substate versions (`provider.getSubstate(id, version)`), subject to indexer retention. Export/mirror public configuration and use another compatible indexer to access the same post office independently of the original host.

Before a broadcast the client journals a public attempt ID; a returned transaction ID replaces it. Lost HTTP responses therefore remain uncertain and disable duplicate submissions. Confirm through the envelope's state and account/transaction history, rather than assuming a timeout failed. An attempt without a transaction ID cannot prove rejection automatically. Losing the disposable cache does not delete chain state; reconcile envelope/account history before retrying. Keeper reservations similarly retain uncertainty across restart and bind the journal to network, registry and campaign. No fee spending automation is part of the hosted interface.
