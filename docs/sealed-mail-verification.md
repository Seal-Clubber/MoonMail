# Sealed mailbox verification — 15 October 2026

The separate V4 office is deployed on Esmeralda. **Try sealed mail** selects it
explicitly; **Open existing postboxes** returns to V3. Existing mail is not
migrated. The office choice is a public browser preference, and each wallet
still approves spending separately from its private-view permission.

Stock Sapient 0.6.6 sent five encrypted letters and replies with native private
postage. The recipient rotated its encryption key between replies. A separately
restored wallet recovered three incoming letters, two Sent copies, both key
versions, encrypted read/star settings, compact spacing and a favourite contact.
The sender independently recovered two incoming letters and three Sent copies.
The encrypted conversation-specific reply keys remained recoverable after the
recipient's rotation. These are encryption identities, not different spending
accounts.

The final production build was exercised with the stock extension and real
ledger reads on the Pages HTTPS origin, serving reviewed local frontend assets.
Inbox and Sent opened, settings and favourites recovered, and reload reused the
actual connection/private-view grant without a repeated permission request.
Screenshots at 1440 and 390 pixels were inspected. A fresh browser without a
wallet opened the actual public letter and private-link letter after an explicit
office choice. The private capability was removed from the address bar. No
financial method or broadcast occurred during these final read-only checks.
This is acceptance of the local build, not a claim that GitHub Pages has already
published it. The user retains control of the push.

The bounded development campaign confirmed 21 transactions: four setup/funding,
sixteen stock-wallet operations and one prepaid public-gift collection. Total
fees were **14.604952 test TARI**. It used only isolated development actors, no
personal wallet, bridge or burn. The development operator was stopped afterwards.
Public transaction identifiers and results are in [the evidence record](sealed-mail-evidence.json).

Validation includes 250 unit tests, strict TypeScript, the Pages-base production
build and 46 native engine checks. The first full browser run passed 279 of 280;
its desktop inbox-position check exposed an oversized office notice. The control
was compacted without weakening that check, and all 54 affected desktop/mobile
cases passed. The complete rerun passed **all 280 browser cases**. The
native checks include actual SDK ciphertext through engine persistence and
independent Inbox/Sent decryption, sender-copy rejection, immutable storage,
controller authorization and bounded key history.

Private test messages, capabilities, browser profiles, passwords, deployment
helpers and research remain outside the repository. Privacy scans cover known
historical secrets and the new private test messages/capability.

## Remaining limits

- Native private payment attachments still need recipient handoff, exact-output
  verification and interrupted-delivery recovery. Sealed letters cannot attach
  a public gift as a fallback.
- Public gifts retain public amounts, collection state and payout routing.
- Transaction signers, timing, office, opaque IDs, padded size buckets and public
  postbox registration/controller relationships remain observable. This is not
  anonymity.
- Discovery is bounded to fifty entries per pass, with at most sixteen mailbox
  key versions and 128 validated conversation descriptors. Large mailboxes may
  require additional passes. The office holds at most 4,096 total letters.
- View permission is account-wide and can expose other private output summaries
  to the site. It never grants transaction approval. Revocation clears readable
  private state; no backend stores that state.
