# Native private payments by encrypted request

Verified on real Esmeralda with unmodified stock Sapient 0.6.6. The current
sealed-mail profile enables `nativePrivatePayments` separately from private
postage. [Sanitized test evidence](private-payment-evidence.json) records four
confirmed transactions: encrypted request, recovery intent, one 0.1-test-TARI
private transfer and encrypted receipt. Total fees were 0.105339 test TARI.
The native result was deliberately lost after success; a fresh browser recovered
the original wallet request from its encrypted intent and delivered only the
receipt. No second payment was created. A separately restored wallet verified
the exact amount and memo. Its stock scan had already recovered the output;
MoonMail verified that existing output instead of importing it twice. Actual
receipt UI checks at 1440/390 pixels and a repeat check used zero financial
requests/broadcasts. These are local-build checks on the Pages HTTPS origin
with real ledger responses; publishing the website remains user-controlled.

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
   importing sends no transaction and grants no spending approval. If stock Sapient
   has already recovered the output, MoonMail verifies its exact resource,
   commitment, amount and memo instead of treating it as a new claim.

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
