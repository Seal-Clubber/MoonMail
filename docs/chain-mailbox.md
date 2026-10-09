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

There are no device-only archive, star or unread records in this mailbox. Persistent preferences, private read receipts, saved contacts and recoverable encrypted sent copies need a separately reviewed contract and encryption design. The existing browser delivery journal remains necessary for safe reconciliation of uncertain signing/transaction requests; it is not the authority for on-chain mail or gifts. It does not automatically move to a new browser.
