# Using GhostDrop with Sapient

Use Esmeralda in Sapient. All amounts are test TARI. The website needs no separate bridge or daemon. The current source uses the verified Sapient office; older office mail does not carry over.

## Read a letter

Open **Public mail** and choose a letter. Public reading needs no wallet. If someone gives you a private link, open the complete link to decrypt the letter on your device. Opening a letter never collects a gift. Empty and loading states show no invented mail or funded gifts.

For a public letter, choose **Copy public letter link** and share the complete address. Your friend can open that exact letter without connecting Sapient. Public links give everyone access to the letter and any available public gift; opening alone never collects it. Keep sealed mail on its private link or controlling postbox wallet. If a public link belongs to another office, check it with the sender. The site keeps your current office settings.

## Prepare your Sapient funds

GhostDrop sending and postbox setup use public TARI. Open **Wallet details → Check public funds** to read that balance without requesting private-view permission or signing. This is a snapshot, not a guarantee that a future transaction will succeed; Sapient still checks funds and fees. An unavailable read stays unknown and can retry.

If you received private TARI, it appears under Sapient’s **Private balance**, while **Public balance** can remain zero. Rescan beside **Assets**, or use **Receive → Claim a private payment** with the sender’s commitment for a missing output. Each payment has its own commitment. Then use **Unshield** in Sapient for the amount you want available to GhostDrop, including gifts, collection reserves and transaction fees; review the wallet’s amount and fee before approving. Gift collection itself still needs no recipient coins. Never enter your seed or private keys into GhostDrop.

## Send a little kindness

1. Open **Write a letter** and choose public mail, a private link, or a postbox. For a postbox, browse the spirit directory or paste your friend’s registered ID. Check the ID with your friend because names can repeat.
2. Write the subject and body. Set the gift to `0` for a plain letter, or enter a TARI amount. A funded gift gets a separate collection reserve; the recipient receives the full gift when that reserve covers execution. Unused reserve stays locked, and there are no refunds or expiry.
3. Connect Sapient, approve the site and review. **Sending fee limit** shows the per-attempt cap; Sapient estimates the actual fee before approval. Its own retries can charge multiple attempt fees.
4. For a private link, use **Copy secret link**, or copy the complete value from **Private link to save**, before publishing. Tick **I saved my private link somewhere safe** only once you have saved it; sending remains disabled until then. Keep the complete link safely: it is not stored in browser history or the transaction journal, and cannot be recovered after closing or refreshing the session.
5. Choose **Fund & publish letter** and approve in Sapient. The app takes you to **Activity**. Known transaction IDs are checked automatically for up to two minutes while that page is open, without signing or resubmitting. Manual **Check status** stays available afterward. Once delivery confirms, copy the same confirmed private link or refresh the public hall. An uncertain request stays blocked; resume the original Sapient approval rather than sending a replacement. A fee-only commit remains uncertain and is not shown as delivered. If saved records cannot be read, financial actions are paused; inspect wallet history before recovering storage rather than deleting uncertain attempts.

If a letter includes a registered return postbox, choose **Reply to this spirit**. It selects that postbox at your writing desk without connecting a wallet or sending. Your existing draft, gift and collection funds are kept; only an empty subject gets a reply suggestion. Check the recipient and gift before publishing. To offer a return address yourself, connect the wallet owning your registered postbox and tick **Include my postbox for replies**.

## Invite a friend to write

Once your postbox is registered, open **My inbox** and copy **My postbox invitation**. Send that public address to your friend. It works for an unlisted postbox too. They can open it without connecting a wallet, check its full ID with you, and choose **Use this postbox for my letter**. Their current subject, message and gift stay in the draft; nothing is published until they review and approve through Sapient. This invitation gives no access to your inbox. A different office or an unavailable/unknown postbox cannot be selected until verified.

## Make a postbox

1. Open **My inbox** and connect Sapient. Existing owned postboxes appear automatically. Otherwise choose **Create my postbox**.
2. Read the separate private-view explanation. Acknowledge its account-wide scope, then approve view access in Sapient. This exposes private output summaries, including amounts and memos for other resources, but not your seed or financial signing key.
3. Give the postbox a name and choose whether it appears in the directory. Review the backup and postbox fee limits.
4. Choose **Save recovery backup** and approve the backup transaction. The app checks known receipts automatically for up to two minutes; **Check backup status** also remains available. Confirmation is required before **Open my postbox** becomes available. A saved approval without a transaction ID uses **Resume Sapient approval**, which resumes only that same request. Approve that second transaction, then check it in **Activity**.
5. Return to **My inbox**, refresh and copy your postbox ID for friends. Select private mail to open it. Restore the same Sapient wallet to recover mail on another device; recovery keys are encrypted on Ootle. Key rotation affects new mail while earlier keys remain recoverable.

## Collect a gift

Open the letter and choose the receiving account. Connecting Sapient selects it automatically; public/private-link guests can instead provide a compatible Ootle receiving address and existing built-in account component, or select fresh-account creation with a new address. Recipient validation runs before signing/submission.

Choose **Review gift collection**. Check the complete receiving address/account, testnet, exact payout and sender’s fee reserve. **Change destination** returns to editing without a wallet request or submission; closing the letter discards this review. Only **Confirm & collect gift** starts collection. A postbox claim asks Sapient for an ownership proof scoped to this gift, destination and at most 10 network epochs. Its fee comes from the sender’s reserve and needs no recipient coins. Rejection submits nothing. Opening alone never claims. Use **Activity** to confirm delivery, then refresh Sapient.

## Developer checks

Client and desktop/mobile browser tests use isolated fixtures. The published GUI also passed real stock Sapient connection and private-inbox reading with no new financial operation; [GUI evidence](gui-evidence.json) records the exact build and limits. Real funded stock-wallet and engine evidence is linked from README. Do not treat fixture tests as new public financial verification. Advanced settings are under **Settings**; editing identities clears the reviewed evidence. No financial worker starts with the site.

Never put private links in screenshots, logs or issue reports. Use isolated test funds for demonstrations.
