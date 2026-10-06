# Standard wallet handoff candidate

GhostDrop's required setup is the HTTPS website and an unmodified standard Ootle wallet daemon. An additional local proxy, patched wallet or browser extension is outside that requirement.

## Built-in manifest import

The official v0.45.0 wallet source, commit `9c626062673760530ffb075b6b006a67becebe5a`, mounts `/manifest`. This screen imports a JSON file, lets the user select wallet signing keys, estimates fees using a dry run and submits through the wallet. This is a candidate for a manual website-to-wallet handoff that does not depend on browser cross-origin RPC or a separate bridge. It has not yet been verified with GhostDrop transactions in the stock v0.45 wallet UI.

The wallet's import format is a non-empty array of tabs. Each tab contains `name` and `code` strings, `variables` as a string-to-string map, `signingKeys` as wallet key identifiers, and `blobs` as a string-to-string map. Signing key identifiers are references to keys held by the wallet, not private keys. GhostDrop should leave their selection to the wallet user.

The proposed interaction is: prepare an operation on GhostDrop, download its wallet manifest, import it into the wallet's Manifest screen, review its destination/amount and fee cap, then explicitly submit in the wallet. Return the transaction ID to GhostDrop for chain reconciliation. The website must retain an uncertain operation and must not generate a replacement merely because an ID has not yet been entered.

This would be a manual handoff, not automatic wallet connection. Public/private-link receiving can retain its current wallet-optional flow.

## Verification before implementation is enabled

1. Prove import, account/key selection and a read-only registry call in an unmodified v0.45 wallet UI. Confirm parser argument encodings and template imports against the deployed contracts.
2. Verify one bounded publication: simulate, inspect the explicit fee cap, sign in the wallet, reconcile the returned ID and read the complete published letter. Check rejection, unknown outcome, reload and duplicate prevention before exposing it as supported sending.
3. Verify postbox setup separately. Publishing a descriptor through a manifest does not establish mailbox key recovery. Native encrypted-memo creation, recovery, rotation and historical mail need an independent standard-wallet flow using only supported wallet UI capabilities.

The wallet Manifest screen logs submitted code and its tab store persists editor data. Generated files must contain public transaction material and encrypted letter payloads only. Never put private-link capabilities, mailbox recovery secrets, financial keys or authentication tokens into manifests. A native recovery capsule cannot be casually exported as manifest text.

Public sending/postbox evidence gates remain disabled until these checks pass. No contract or public registry replacement is necessary just to investigate this transport candidate.

## Other transports reviewed

The release's default RPC CORS layer does not permit cross-origin website access; its permissive setting is documented for development. WebRTC fetches its offer and ICE candidates from an external signaling server and posts the answer there. The WalletConnect menu entry is commented out. These observations do not establish a working direct connection using only the two required pieces. They also do not rule out the separate manifest handoff discovered above.

## Pinned primary sources

- [Mounted wallet routes](https://github.com/tari-project/tari-ootle/blob/9c626062673760530ffb075b6b006a67becebe5a/applications/tari_walletd/web_ui/src/App.tsx)
- [Manifest import, fee estimation and submission](https://github.com/tari-project/tari-ootle/blob/9c626062673760530ffb075b6b006a67becebe5a/applications/tari_walletd/web_ui/src/routes/Manifest/Manifest.tsx)
- [Manifest tab format and persistence](https://github.com/tari-project/tari-ootle/blob/9c626062673760530ffb075b6b006a67becebe5a/applications/tari_walletd/web_ui/src/services/store/manifestStore.ts)
- [Wallet manifest handler](https://github.com/tari-project/tari-ootle/blob/9c626062673760530ffb075b6b006a67becebe5a/applications/tari_walletd/src/handlers/transaction.rs)
- [WebRTC signaling client](https://github.com/tari-project/tari-ootle/blob/9c626062673760530ffb075b6b006a67becebe5a/applications/tari_walletd/src/webrtc.rs)
