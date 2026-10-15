# Native private payments by encrypted request

Implementation checkpoint; public deployment activation requires a fresh stock
Sapient campaign. `nativePrivatePayments` is separate from private-postage
evidence and is currently absent from published profiles.

A sealed payment request contains the requesting wallet's receiving address,
native TARI amount and random nonce. The address owner must match the
authenticated letter author. These fields stay inside `mm-message-2`, using the
existing V4 `mm-sealed-2` encrypted envelope; old `mm-message-1` mail is preserved.
No template change or central service is required.

Paying takes three approvals:

1. Authorize a persisted Sapient `sendPrivately` request with private funding,
   private fees and a zero minimum-value promise. Approval does not yet submit it.
2. Publish the encrypted recovery intent, including the original wallet request
   ID. Only after that unique intent commits may MoonMail submit the payment.
3. Publish its encrypted receipt, containing the recipient output commitment.
   The recipient imports that output through Sapient's separate view permission;
   importing sends no transaction and grants no spending approval.

Intent and receipt IDs derive from the encrypted invoice nonce, invoice ID,
payer and office. A competing browser cannot submit its different approval when
another immutable intent owns the invoice. Browser storage holds only opaque
scope/hash/request identifiers, never amount, receiving address, nonce or letter
content. Losing a response preserves uncertainty. An existing approved/submitted
wallet request is resumed; an unknown, rejected or failed request is never
silently replaced. A confirmed receipt cannot trigger another payment.

The receiver checks all three authenticated letter records and their participant
and invoice bindings. The receipt must identify the exact native output created
by its committed transaction. Sapient independently verifies ownership, amount
and the encrypted intent-specific memo. An indexer can prune old transaction
receipts; only an explicit HTTP404 permits checking a current unfrozen output
instead. In that case the UI distinguishes unavailable transaction history from
the output/amount/memo verification. A rejected/mismatched transaction never
falls back. An unavailable or spent output cannot be imported again.

This is not an atomic payment-and-letter operation. Payment may succeed before
receipt delivery; resume the original intent to deliver the receipt. A restored
Sapient installation may lack the original request record. MoonMail blocks
replacement in that case; the original installation is needed to recover its
result. If the original installation and its result are lost before receipt
delivery, this implementation cannot promise automatic payment discovery.

Amounts/receiving addresses/memos are encrypted, but transaction signers, fees,
output commitments, office, padding and transaction timing remain observable.
The multi-step pattern can correlate mail with a payment. Public gifts continue
to use their public vault; there is no automatic public funding fallback.
