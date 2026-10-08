# GhostDrop — The Haunted Post Office

A spooky place to leave a kind letter, send a gift, or open your private inbox. Visitors need the website and their normal [Sapient wallet](https://sapient.tari.mw/). No GhostDrop bridge, daemon, API key or file import is needed.

The moonlit interface uses a left-aligned brand with a centered dark-blue ghost-and-envelope icon, slow mist and firefly animation, and brighter text on dark surfaces with dark ink on parchment. Motion stops when your device requests reduced motion; decoration never covers controls.

- **Public mail:** read letters without connecting. Search loaded public subjects/messages or public letter IDs, and filter by public letters, sealed invitations or uncollected public gifts. Sealed contents are never searched. Load more includes additional on-chain mail; anyone can collect an available public gift once.
- **Private links:** encrypted letters for whoever holds the complete secret link. Read and collect without connecting, or connect Sapient to choose a receiving account.
- **My inbox:** create a wallet-controlled postbox, share its ID, and open mail encrypted for you. Separate, explicit private view consent lets the same Sapient wallet recover your mail after restoration.
- **Write a letter:** choose your audience, enter gifts in TARI, review the full gift and separate collection funds, then approve in Sapient. Copy or manually save the complete private link, then acknowledge it before sending.
- **Activity:** known transaction receipts update automatically for up to two minutes while the page is open. Manual status checks remain available. Resume an uncertain wallet approval only through its original saved request; GhostDrop never automatically resends a financial operation. Damaged local delivery records pause financial actions and explain how to check wallet history. Blocked/full browser storage also pauses financial actions while public reading remains available; a recheck resumes controls after storage is restored.

Public letter links, private links and postbox IDs always have a manual-copy field. If clipboard access is denied, the app keeps the complete value visible and explains how to copy it yourself. Copying does not automatically confirm that you saved a private link.

Sending review shows the complete included reply postbox ID, or **No reply postbox**. Return IDs are public metadata, including on sealed letters. Changing that choice invalidates the prepared review; re-review creates a fresh private link that must be saved again before sending. [Reply-review verification](docs/reply-review-evidence.json) records local regressions; [published verification](docs/reply-review-published-evidence.json) confirms the unsent flow with stock Sapient on actual Pages HTTPS.

Disconnecting or changing post office clears the optional return postbox and prepared review. Your written subject, message, gift and fee settings remain at the writing desk. Reconnect the wallet and explicitly choose a registered return address again if you want replies. [Reply-session verification](docs/reply-session-evidence.json) records local cleanup checks; [published acceptance](docs/gui-release-published-evidence.json) confirms stock Sapient disconnect cleanup on actual Pages HTTPS without financial or private-view requests.

[Published Sapient gift verification](docs/sapient-gift-published-evidence.json) confirms public and private-link sending with the stock wallet, guest collection of each full 0.1-TARI gift, and recovery of the original wallet request after deliberately losing one successful submission response. Four real Esmeralda transactions committed; the separate test campaign is closed.

Collection checks the latest gift availability before opening a separate destination review: check the full address, receiving account, payout and fee reserve before choosing **Confirm & collect gift**. An already-collected gift leaves its letter readable. An unavailable or stalled read keeps your letter and destination for retry; the busy wait ends after 15 seconds. Opening review never requests a proof or submits a claim. Availability can change after review; collection still rechecks and chain rules enforce one payout. [Local collection verification](docs/collection-review-evidence.json) records the precise fixture scope.

**Testnet only:** the current office uses Esmeralda test TARI. Choose Esmeralda in Sapient. Sending and creating a postbox cost wallet fees. Collection uses the sender’s separate fee reserve; an addressed recipient can collect the full gift with zero coins. Gifts have no expiry or refund, and unused collection funds stay locked.

The current source defaults directly to the verified Sapient office in `public/deployment.json`. The original office is no longer selectable and its mail is not carried over. `deployment-v2.json` remains an identical public profile for historical verification references. Immutable older contracts and evidence remain available to developers.

Share **My inbox → My postbox invitation** with a friend. Opening it checks your registered postbox in the selected office and asks before choosing it for their letter; their existing subject and message stay intact. Unlisted postboxes can receive invitations, and the link gives no access to the inbox or wallet. Invitations carry public ID/network/contract context in the fragment and work under Pages or another frontend base path. A link from a different office never changes settings automatically. [Invitation verification](docs/postbox-invitation-evidence.json) records local checks; [published verification](docs/sapient-gui-published-evidence.json) confirms the guest and stock-wallet flow on actual Pages HTTPS.

Open a public letter and choose **Copy public letter link** to share that exact letter. It opens without a wallet and never collects a gift automatically. The link carries only its public ID and office context; sealed letters cannot open through this route. A different office never switches your settings. Unavailable letters can retry or dismiss safely. [Public-letter link verification](docs/public-letter-link-evidence.json) records local checks; [published verification](docs/gui-release-published-evidence.json) confirms reading an actual public letter through its share link in a fresh guest browser, and sealed-mail rejection, on desktop and phone layouts over Pages HTTPS.

Connected visitors can open **Wallet details** to copy their public receiving address and account component. Opening it makes no additional wallet request. Choose **Check public funds** for a read-only public TARI balance snapshot; it never requests private view access or signing. Sending, gift funding and postbox setup currently use public TARI. If funds are private, use **Unshield** in Sapient first and review its amount and fee there. Missing private payments can be loaded in Sapient through **Receive → Claim a private payment** using the sender’s commitment. Public and private balances are separate; GhostDrop never treats hidden private funds as zero. [Wallet-funds verification](docs/wallet-funds-evidence.json) records local checks; [published verification](docs/sapient-gui-published-evidence.json) confirms the public-only stock-wallet read on actual Pages HTTPS.

**Reply to this spirit** opens the registered return postbox at your writing desk. Existing subject, message, gift and collection funds stay intact; an empty subject receives a reply suggestion. Directory and invitation actions preserve the same draft and focus the writing desk. Check the recipient and gift before publishing.

The writing desk shows remaining letter space before review, including Unicode, encryption and addressing overhead. Oversized drafts stay editable and cannot proceed to review until shortened. The complete envelope limit remains enforced after encryption.

The GUI keeps the moonlit, haunted post office theme, with phone layouts, reduced-motion support, keyboard focus handling, dialog scroll/focus isolation and plain-language empty/error states. The directory searches listed postboxes; unlisted recipients share their IDs directly. Advanced connection settings are under **Settings** and invalidate write evidence when edited.

Private-link opening failures can retry in the same tab, keeping the URL secret scrubbed and never storing it. Dismiss cancels late opening results. Read failures show a retry instruction. A failed refresh preserves already loaded mail and clearly labels it as previously loaded. If an individual letter is unavailable or fails verification, browsing keeps the verified letters visible and shows which public IDs need another read. Unverified letters never appear as available gifts. Registry/template/owner checks remain strict; donor tooling retains strict bulk reads by default.

An attempt that becomes pending while a claim is being prepared blocks the competing preparation before submission. Keep the original record and check it in Activity. Chain rules enforce one gift payout.

Letters/ciphertext, postboxes and gift rules live on Ootle. The static React app reads an HTTPS indexer directly; there is no central GhostDrop backend. The indexer remains trusted infrastructure and this client does not verify consensus proofs. Encryption hides sealed subjects and bodies, while gift amounts and routing metadata remain public.

[GitHub Pages website](https://seal-clubber.github.io/GhostDrop/). Pushes to `main` automatically run client verification and the HTTPS Pages deployment. The current moonlit GUI and refined inbox/setup permission wording are published at `11dca65`; all nine hosted files match its successful Pages artifact. [Latest hosted inbox verification](docs/inbox-permission-published-evidence.json) confirms stock Sapient reading, setup and reply/session cleanup without financial/private-view requests. The subsequent claim-preparation guard and collection-availability review are saved locally. Verify passed 157 client tests, 156 browser checks with one Linux worker and all Rust jobs. Actual HTTPS guest reading/sharing and stock Sapient's unsent setup, reply review and disconnect cleanup passed without private consent or financial requests. [Current published verification](docs/gui-release-published-evidence.json) records exact scopes. Earlier [GUI verification](docs/gui-evidence.json) records restored-wallet private mail opening after key rotation at `fd4d90c`. Prior funded ownership-proof claims and independent payout spending retain their original scope in [public financial evidence](docs/postbox-v2-esmeralda-evidence.json) and [earlier published wallet verification](docs/postbox-v2-published-wallet-evidence.json).

## Run

Node 24.19+ and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Open the local URL printed by Vite. Guests enter immediately. Assets, fonts and crypto WASM are served locally. With the real Sapient office configured, the hall shows live mail or an honest empty/loading state. The clearly labelled example preview is reserved for an unconfigured development instance.

## Contracts

Rust 1.97.1 and `wasm32-unknown-unknown` are pinned in `rust-toolchain.toml`. Run the real engine on Linux/Ubuntu WSL; upstream Wasmer 7.4 Cranelift does not support Windows.

```sh
cargo test --manifest-path contracts/envelope/Cargo.toml --locked
cargo build --manifest-path contracts/envelope/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo build --manifest-path contracts/ghostdrop/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked
cargo test --manifest-path contracts/engine-tests/Cargo.toml --locked javascript_ -- --ignored
```

The final command requires Node and installed JS dependencies on the same host. SDK bridge tests verify JSON/BOR encoding, WASM signatures and execution. On Windows + WSL set the three `GHOSTDROP_TEST_*` bridge paths described in [evidence](docs/EVIDENCE.md).

## Deploy and demonstrate

- [Deployment and GitHub Pages HTTPS](docs/DEPLOYMENT.md)
- [Esmeralda deployment and funding status](docs/ESMERALDA.md)
- [Architecture, cryptography and trust boundaries](docs/ARCHITECTURE.md)
- [Feature-to-evidence checklist](docs/EVIDENCE.md)
- [Demo walkthrough](docs/DEMO.md)
- [Dedicated donor Faucet Keeper](docs/KEEPER.md)

The Pages workflow automatically publishes pushes to `main` after its client tests and build pass; it can also be run manually. Keep API keys, wallet data, donor configuration and private links out of public configuration, git and build variables. No spending worker is started by the web app.

MIT licensed. Tari libraries retain their upstream licenses. The visual scene is CSS and original text; no external artwork is required.
