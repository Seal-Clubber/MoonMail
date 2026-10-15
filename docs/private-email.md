# MoonMail private email

MoonMail opens with “Your words, under cover of night.” **Open mailbox** leads to a full-width folder sidebar, message list and conversation reader. Compose defaults to encrypted private mail. Public mail and gifts are secondary; publishing requires an explicit public-content acknowledgement. Editing the content clears that acknowledgement.

The single current mailbox is the V4 sealed Esmeralda office. Create a new postbox there. Old testnet postboxes and messages are not migrated or selected; backup branches preserve the earlier app. Inbox, encrypted Sent, reply threads, contacts/favourites, selection, read/unread, archive and wallet recovery are supported. Saved settings stay encrypted on Ootle; changes need an explicit save transaction. No drafts folder or saved drafts.

## Verified stock Sapient support

Unmodified stock Sapient 0.6.6 was tested with the current Ootle 0.46 application. Its [inspected provider API](https://github.com/chironbuilds/tari-wallet/blob/7ad3c4f117a76c64d472fd371b7d75bbe297abec/docs/integration/provider-api.md) and live account capabilities determine available operations. The website cannot approve transactions itself. Visitors need only the website and Sapient, with no extra bridge or backend.

- Private postage uses a persisted transaction request with `feeType: "private"` and `enforceFeeType: true`. Unsupported accounts fail closed. Reading permission is separate from spending approval.
- Native private payments use `sendPrivately`, private funding/fees and `minimumValuePromise: "0"`. An encrypted request, unique recovery intent and receipt bind the original wallet approval to the exact receiving output. [Protocol and recovery limits](private-payments.md).
- Account-wide private view permission exposes private output amounts/memos, including other resources. It never grants spending permission. The site asks explicitly before recovering mail; opening a recovered letter sends no transaction.
- `withdrawStealthAndExecute` is not private funding in the inspected stock runtime: it uses the account's revealed balance. It is not used as a private-funding fallback.
- The legacy dry-run path does not forward fee type. Private success is established by the native request path and confirmed ledger results. Failed attempts and stock retries can charge additional fees; caps are per attempt.

Stock Sapient supplies its native resource dependency for private fees. MoonMail omits that duplicate from application-provided dependencies and retains other required inputs. Deployment evidence and fresh account capability checks both apply.

## Sealed addressing and recovery

V4 encrypts recipient IDs, keys, capsule references, reply identifiers and optional conversation-specific reply keys inside a padded two-slot envelope. Shared directory pages are read publicly; the browser tries recovered keys locally. Inbox and Sent recover from Sapient, including historical mailbox keys and encrypted preferences. Reply keys separate encryption identities, not transaction signers. [Protocol and capacity limits](sealed-mail-protocol.md).

[Real Esmeralda evidence](sealed-mail-evidence.json) covers five encrypted letters/replies, key rotation, an independently restored wallet, Sent, private postage and saved settings. [Private-payment evidence](private-payment-evidence.json) covers a single 0.1-test-TARI payment, deliberately lost success response, recovery without paying twice, exact amount/memo verification and an independent restored recipient. The latter stock wallet had already discovered its output; the site verified it instead of claiming it twice. Three approvals are required to pay, and payment/receipt delivery are not atomic. If the original installation and missing result are lost before receipt delivery, automatic payment discovery is not guaranteed.

## What others can see

Subjects, bodies, recipient/reply addressing, conversation keys, payment requests, amounts, receiving addresses, payment memos and mailbox preferences are encrypted. Public chain observers still see transaction signers, timing, opaque letter IDs, contract/office identities, padding buckets, fees, output commitments, postbox registrations/controller associations and changes to encrypted state. Multi-step payment timing can correlate payment and mail. Postbox names, IDs and controlling public keys are public and searchable. The interface has no hide/unlisted control; old contract listing flags do not hide entries in the current directory. Public gifts expose amounts and payout routing. Hosts and indexers see connection information. MoonMail does not provide anonymity; the site’s **What can others see?** view states these boundaries without requesting wallet permission.

Ootle 0.46 proof claims use reported epoch +9 so expiry stays within the contract window whether execution uses that epoch or the previous one. Actual gift publication/collection and native engine verification cover this behavior.
