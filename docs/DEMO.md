# MoonMail demo

Use isolated Esmeralda test funds. The app needs only the website and stock Sapient. Do not enter your wallet seed or signing keys into MoonMail.

## A familiar private mailbox

The desktop mailbox uses a postbox/folder rail, message list and dark conversation reader. Search the current folder in the header; open **View options** to change sorting. On a phone, open a letter and use **Back to messages** to return. Postbox management is under the initially collapsed **Postbox options**; spacing/reload controls are under **Mailbox settings**. Public mail and privacy remain directly reachable. Unsaved read/archive/favourite changes have an amber save bar. [Interface guide](gui-overhaul.md).

1. Open the contest page: **MoonMail — Your words, under cover of night.** Choose **Open mailbox**. Public mail has a separate **Explore public mail** action.
2. Connect Sapient. Before reading private mail, the full permission dialog explains account-wide private output summaries, including amounts and memos for other resources. Explicitly continue in Sapient. This is a reading permission, not spending authorization.
3. Create a new postbox in the current sealed office. Review its name, public registration details and automatic fee limits. Postbox names, IDs and controlling public keys are public; letters remain encrypted. Approve **Save recovery backup**, wait for confirmation, then approve **Open my postbox**. These are two transactions. Interrupted setup resumes the original request; Activity tracks outcomes.
4. Copy **My postbox invitation** for a friend. They can open it without a wallet, verify the full ID (names can repeat) and choose **Use this postbox for my letter**. An invitation grants no inbox access.
5. Compose opens at the bottom-right over the inbox; phones use a full-screen writing window. Minimize to consult the inbox, restore to continue, or expand on desktop. Closing keeps unsent text only in this tab; reloading loses it and no draft is saved. Click **To** and type a name or full postbox ID. Matching favourites appear first, recent verified correspondents next, then the public directory. Click a result or use arrows/Enter; IDs distinguish repeated names. The selected recipient's star stages a favourite change requiring a separate save. **Delivery options** contains public/private-link mode, payment requests, reply encryption, postage and privacy details. Review the content, selected sending postbox, encryption disclosure, postage source and fee cap. Every sealed letter includes recoverable Sent access. Sending opens Activity after submission.
6. Open a letter to read the conversation and reply. Successful opening stages a read mark. Select letters for read/unread, star or archive. Changed mailbox preferences/read marks stay visibly unsaved until **Save** is approved on chain. Contacts/favourites are beside the recipient choices. No draft folder is stored.
7. Restore the same Sapient wallet on another system: Inbox, Sent, historical keys and saved encrypted settings recover from Ootle. Reload reuses only a real, still-valid Sapient connection/view grant. Revoking that grant clears decrypted mail.

The current office is the single default. Old testnet mail is not migrated or selectable; backup branches preserve earlier versions.

New private letters automatically offer a conversation-specific reply key; no checkbox is needed. Replies use the authenticated conversation identity, and the same Sapient wallet can recover it from encrypted Sent. Earlier letters remain readable. This separates encryption keys, while transaction signers and timing remain public; it does not provide forward secrecy after compromise of the historical postbox secret.

## Request and pay privately

1. In encrypted Compose, select **Request a private payment**, enter the amount and send the letter. The amount and your current Sapient receiving address are encrypted. This sends a request, not money.
2. The recipient opens it read-only, then chooses **Review private payment**. Review the amount, private receiving details and automatic maximum fee per step/attempt.
3. Continue with Sapient for three approvals: authorize the native transfer, publish its unique encrypted recovery record, then deliver the encrypted receipt after payment succeeds. The transfer uses private funds/fees and zero minimum-value promise. Fees remain separately observable.
4. If interrupted, reopen the original request and resume it. MoonMail retrieves the original approved wallet request; it does not pay a second time or replace unknown/rejected requests. If the original installation and result are lost before receipt delivery, automatic discovery is not guaranteed.
5. The requesting wallet opens the receipt and selects **Verify & import in Sapient**. MoonMail checks authenticated request/intent/receipt records, the actual native output, ownership, exact amount and encrypted memo. If Sapient already recovered it, the app verifies that existing output. This step sends no transaction or spending request.

A payment and its mail receipt are not atomic. [Real testnet verification](private-payment-evidence.json) includes a deliberately lost successful transfer result, receipt-only recovery and an independently restored recipient.

## Public letters and gifts

Choose public mail or a private link deliberately. Public publication requires its own content acknowledgement; editing clears it. Public gifts have a visible amount and separately funded collection reserve. The recipient gets the full gift when its reserve covers execution. No expiry/refunds; unused reserves stay locked.

For a private link, save the complete link before publishing and confirm that you saved it. Anyone with it can read/collect; the link is scrubbed from history and is not stored as a draft or transaction-journal secret. Refreshing/closing can lose an unsaved link.

Opening a letter never collects its gift. **Review gift collection** shows the exact payout, destination and sender-funded reserve before **Confirm & collect gift**. Public/private-link gifts can be received without connecting a wallet, using supported existing/fresh account options. Native private payments use the different encrypted request/receipt flow above.

## Explain the privacy honestly

Open **What can others see?** Subjects, bodies and sealed routing are encrypted. Signers, timing, contract/office IDs, opaque IDs, padding buckets, fees, commitments, postbox registrations and changes remain observable. Payment steps can be correlated by timing. Public gifts expose amount/routing; hosts/indexers see connections. There is no anonymity claim.

Activity preserves uncertain requests and checks known receipts without signing or resubmitting. Use the original approval instead of creating a replacement. The site's saved settings and read permission are separate from spending; every transaction is approved in Sapient. Never include private links or credentials in screenshots/issues.

Network fee controls stay hidden during normal use. If a pre-submission check needs a higher fee, use the warning’s adjustment and review again. An existing wallet request must be reconciled or resumed; changing a limit never replaces it. [Automatic fees](automatic-fees.md).
