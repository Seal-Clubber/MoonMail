# Your wallet-controlled mailbox

My inbox now gives each owned Sapient postbox a folder sidebar, searchable letter list and reading pane. It uses the existing on-chain post office; there is no GhostDrop account server or mailbox database.

## What follows you to another device

Reconnect the same Sapient wallet to the same post office, select your postbox and approve the private view permission. The postbox identity, encrypted letters, recovery capsules, original gift amounts and collected flags come from Ootle. Nothing needs to be exported from the previous browser to recover these records. The wallet must still control the postbox and retain access to its recovery outputs. Browsing a different network or registry opens a different post office.

Inbox includes loaded letters addressed to that postbox and controller. Available gifts and Collected gifts filter those letters by their on-chain gift state. These folders are derived views, so the same loaded chain state produces the same contents on another device. Counts always describe loaded letters; use Load more letters when the post office has another page. Post office order is registry order, not a fabricated delivery timestamp.

Sent includes loaded on-chain letters whose sender is the postbox controller and whose verified reply postbox is this postbox. Letters without that reply address cannot be assigned to a particular sending postbox. Public sent mail can be read. The current encrypted envelope format has no sender decryption copy, so encrypted sent letters show their public routing and gift details without promising recoverable plaintext. Collected flags alone do not prove who received a payout.

## Reading and writing

Approve postbox view access before unlocking previews. The existing permission covers the connected account's private output summaries, including other amounts and memos; it does not expose seed or signing keys. Unlocking reads existing recovery state and decrypts loaded letters. It sends no transaction. Subjects and body previews stay in application memory for the wallet session, and are cleared on disconnect, account change or post office change. They are not written to localStorage, sessionStorage or the delivery journal. Another device decrypts its own copy after permission approval.

Search matches public IDs, sender/routing keys and the subjects and bodies unlocked in the current session. It cannot search ciphertext. Sort by registry order, unlocked subject or original gift amount. Lists show twelve matching letters per page.

Compose letter opens the existing writing desk with this postbox selected for replies and its controlling funding account. An existing unfinished draft is preserved. Review the recipient, visibility, gift and fees before sending. Including a reply address exposes that postbox ID on chain. Opening an incoming letter uses the existing retry, reply and gift-review controls in the reading pane. Public letters and private-link gifts retain their existing guest reader.

## Privacy and scope

Encryption protects sealed subjects and messages. Revealed test TARI amounts, sender/controller keys, routing, transaction timing and reply postbox IDs remain observable. This is Esmeralda testnet mail, with the existing indexer trust model; it is not SMTP/IMAP email and cannot send to Gmail, Proton or Outlook addresses.

The new [single-template post office](unified-contract.md) stores encrypted read/star/archive marks, sorting and message spacing on Ootle. After changing them, choose Save mailbox changes and approve the transaction in Sapient; unsaved edits stay in memory. On another device, approve private view access and choose Load mailbox settings. A stale save is rejected without overwriting the saved snapshot; discard unsaved changes and reload before saving again. Archive hides mail from Inbox but cannot delete immutable chain data. These settings do not publish read receipts or add saved contacts or encrypted sender copies. Device-only persistent preferences are not introduced. The existing browser delivery journal remains necessary for safe reconciliation of uncertain signing/transaction requests; it is not the authority for on-chain mail or gifts. It does not automatically move to a new browser.

## Verification

[Mailbox verification evidence](chain-mailbox-evidence.json) separates synthetic browser regressions from real Esmeralda acceptance. The real checks use the existing isolated restored stock Sapient wallet and existing on-chain letters, with signing/broadcast methods blocked. All six addressed campaign letters opened in the new reading pane; the mailbox, search and reading worked at 390 px and 320 px. The real 33-letter public hall and two private-link readers also passed. This verifies the local production build against the real network, not a newly published Pages deployment.

The unified-contract campaign separately confirmed fifteen real Esmeralda transactions, including long letters, saved encrypted preferences, key rotation and a full gift-funded payout to an empty restored Sapient account. Read-only actual UI checks recovered archive/star/layout settings and historical private mail at 1440, 390 and 320 px. [Unified acceptance evidence](unified-contract-evidence.json) records this new office and distinguishes chain deployment from the website awaiting the user’s push.
