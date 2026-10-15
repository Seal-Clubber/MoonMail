# MoonMail private email

The entry page introduces MoonMail with “Your words, under cover of night.” Open mailbox leads to the existing full-width folder/list/conversation workspace. Compose defaults to encrypted postbox mail. Public mail is a secondary destination; publication requires a separate acknowledgement that the subject, message and gift are public. Changing the message or gift clears that acknowledgement.

Sent copies, reply threads, contacts, bulk selection, read/unread, archive and Sapient recovery remain in the existing protocol. There is no automatic migration of old mail or key domains. Saved folder settings remain encrypted on Ootle; edits still need an explicit save transaction.

## What stock Sapient supports

Inspected stock Chrome package 0.6.6 and [its pinned provider API](https://github.com/chironbuilds/tari-wallet/blob/7ad3c4f117a76c64d472fd371b7d75bbe297abec/docs/integration/provider-api.md). Runtime capability flags describe the selected account; unsupported or changed capabilities must fail closed. The site cannot approve its own transactions.

- `supportsPrivateFees`: native private fee UTXO selection through a persisted transaction request with `feeType: "private"` and `enforceFeeType: true`. No automatic public fallback. Read permission is not required to request spending.
- `sendPrivately`: native private transfers with wallet coin selection and `minimumValuePromise: "0"`. A commitment must reach the recipient to recover the payment reliably. This is not yet an attached MoonMail payment.
- `tari_requestViewAccess`: a separate account-wide read grant exposing private output amounts/memos. It never grants spending approval.
- `withdrawStealthAndExecute` is **not private funding** in this exact stock runtime. Its embedded implementation calls `spendRevealedInput` against the account balance.
- The legacy `tari_signAndSubmitTransaction` dry-run branch does not forward fee type. A transparent simulation cannot establish private-postage success. The private request path therefore relies on wallet construction and approval, not a substituted public dry run. Failed execution can still consume a fee; the cap is per attempt and stock retries can add fees.

Native private postage was verified on real Esmeralda with unmodified stock Sapient 0.6.6: an encrypted self-letter committed and decrypted normally. Sapient adds its own native TARI resource input for a private fee. MoonMail must omit that same resource from its supplied dependencies; duplicating it causes stock WASM deserialization to fail before broadcasting. Other dependencies are retained. The deployment evidence gate and current-account capability check both apply. Unsupported private requests fail closed rather than spending public funds.

A separate native private self-transfer with zero minimum-value promise committed and its exact amount was recovered through Sapient. This establishes native transfer support, not a completed MoonMail attachment flow or a hidden mail recipient. Receiving-side handoff, two-step failure recovery and independent-wallet recovery still need integration. See [verification evidence](native-privacy-evidence.json).

## Current public information

Private subjects, message bodies, encrypted conversation links, Sent copies and mailbox preferences are protected content. The existing V3 office publishes sender/controller keys, recipient and reply postbox IDs, letter/contract IDs, timing, gift/reserve amounts, claim status and payout destination. V4 sealed letters encrypt recipient and reply addressing, but still expose the transaction signer, opaque IDs, office, timing and padded size bucket. Public gifts retain their public funding and payout information in either office. Postbox registration and updates to encrypted state are observable. Unlisted is not anonymous. Hosts/indexers also observe connection information. The “What can others see?” view spells this out without requesting wallet permissions.

## Sealed addressing and remaining payment work

Sealed addressing must remove recipient IDs **and** recipient keys/capsule references from the published envelope, then provide bounded trial decryption and recoverable discovery. Merely encrypting one ID leaves the other routing identifiers exposed.

Conversation-specific reply identities need recoverable encryption keys and a secure claim authorization independent of a public controller. Registering another ordinary postbox exposes the same controller and is not a privacy improvement. A native private transfer has different guarantees from the deployed public gift vault; it cannot be presented as an atomic attached gift before failure/recovery handling and receiving-side verification exist.

The separate [V4 sealed office](../contracts/moonmail-v4/README.md) removes recipient IDs, recipient encryption keys, capsule locators and reply identifiers from each published letter. The same mailbox UI supports Inbox, Sent, replies, contacts, encrypted preferences, historical keys and permission revocation. Stock Sapient 0.6.6 sent five real encrypted letters/replies with native private postage; a separately restored wallet recovered all five, both recipient key versions and saved settings. The actual mailbox opened the mail and survived reload on desktop and phone layouts. See [testnet evidence](sealed-mail-evidence.json) and [protocol limits](sealed-mail-protocol.md). Choose **Try sealed mail** explicitly; create a postbox in that office. Existing postboxes stay separately available and no data is migrated. Conversation keys separate encryption identities; they do not hide the Sapient transaction signer. Website and Sapient remain the only user software. Native private payment attachments still require receiving-side handoff and interrupted-delivery recovery.

Ootle v0.46 simulates at an observed consensus epoch clamped to the reported epoch or one earlier. Proof claims use reported epoch +9 rather than +10, keeping their expiry inside the contract limit in both cases. A real mixed-funding gift publication and prepaid collection committed after this correction. No claim was broadcast by the preceding rejected simulations.
