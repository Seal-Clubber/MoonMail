# MoonMail

“Your words, under cover of night.”

A moonlit private mailbox on Tari Ootle: encrypted letters, Inbox, recoverable Sent, reply conversations, contacts/favourites and native private payments. Visitors use the [website](https://seal-clubber.github.io/MoonMail/) and their normal [Sapient wallet](https://sapient.tari.mw/). No extra bridge program or central MoonMail backend.

## Open your mailbox

Choose **Open mailbox**, connect Sapient and create a postbox. Creation has two clearly separated spending approvals: save the encrypted recovery backup, then register the postbox. Reading mail requires a separate, explicit account-wide private-view permission; it does not approve spending. Never enter your wallet seed or signing keys into MoonMail.

Compose defaults to encrypted private mail. The workspace has folders, a message list, conversation reader, selection actions, read/unread, archive and encrypted settings. Opening a successfully decrypted letter stages it as read. Changed settings/read marks have a prominent save action because saving them is an Ootle transaction. There is no drafts folder or saved drafts. Restore the same Sapient wallet on another device to recover mailbox keys, Sent, historical keys and saved preferences.

All registered postboxes are searchable in the directory. There is no hide/unlisted control: names, IDs and controlling public keys are public on Ootle. [Postbox visibility](docs/public-postboxes.md) explains the boundary.

The single default is the verified V4 sealed Esmeralda office in `public/deployment.json`. Old testnet postboxes and messages are not carried over or selected. Earlier app versions remain in backup branches; historical evidence retains the exact build and contract it tested. This is testnet software with finite storage/discovery limits, not a production email replacement.

## Private payments and public gifts

**Request a private payment** adds the requesting wallet's receiving address and amount inside the encrypted letter. Sending a request pays postage only. Paying it requires three Sapient approvals: authorize the native private transfer, save its encrypted recovery intent, then deliver the encrypted receipt. The payment uses private funds/fees with a zero minimum-value promise. MoonMail resumes the original approved request after an interruption and never silently substitutes a replacement. The recipient verifies/imports through private-view permission with no spending approval or transaction.

This is not an atomic mail-and-payment operation. If payment succeeds before receipt delivery, resume the original request. Losing the original Sapient installation and missing result before receipt delivery can prevent automatic discovery. [Payment protocol and limits](docs/private-payments.md).

Public mail and public gifts are secondary views and require an explicit choice before publication. Public/private-link gifts use the public gift vault, with visible amounts and payout routing. A private link is a bearer capability: anyone with the complete link can open the letter and collect its gift. Opening alone never collects. Keep that link safe; it is scrubbed from browser history and cannot be recovered after closing the session.

## What can others see?

Sealed mail encrypts subjects, bodies, recipient/reply addressing, conversation keys, payment requests/amounts/receiving addresses/memos and mailbox settings. Transaction signers, timing, office/contract identities, opaque letter IDs, padded size buckets, fees, output commitments, postbox registrations/controller associations and updates remain observable. Multi-step timing can correlate payment and mail. Public gifts retain public amounts/routing. Indexers and the website host see connection information; the client does not verify consensus proofs. **MoonMail does not provide anonymity.** [Privacy capabilities](docs/private-email.md) and [sealed protocol limits](docs/sealed-mail-protocol.md).

Private postage is selected when the current Sapient account supports it; a deliberate public-funding choice remains available. Unsupported private operations fail closed instead of silently spending public funds. Permission to read is separate from each spending approval.

Network fees use automatic defaults. Routine fee editors are hidden; a verified pre-submission fee shortage reveals an adjustment, while existing approvals remain protected from replacement. Cost summaries stay visible before approval. [Fee behavior](docs/automatic-fees.md).

## Verification

The [moonlit GUI overhaul](docs/gui-overhaul.md) provides the responsive mailbox, guided options and clearer approval steps. Its [verification scope](docs/gui-overhaul-evidence.json) includes the full browser suite and stock Sapient read-only acceptance against real Esmeralda mail.

The application targets Ootle **0.46.0**, TypeScript SDK **0.9.0**, crypto WASM **0.46.0** and the inspected unmodified stock Sapient **0.6.6**. Current-account capabilities are checked at runtime. The single [V4 template](contracts/moonmail-v4/README.md) stores sealed letters, postboxes, historical recovery keys, encrypted settings and public gift rules.

- [Final sealed-default verification](docs/sealed-default-verification.md): desktop/mobile checks and zero-spend stock-Sapient/real-ledger acceptance.
- [Sealed-mail Esmeralda evidence](docs/sealed-mail-evidence.json): real encrypted letters/replies, rotation, independently restored Inbox/Sent, settings and native private postage.
- [Private-payment Esmeralda evidence](docs/private-payment-evidence.json): one 0.1-test-TARI payment, deliberate loss of its success response, receipt-only recovery, exact amount/memo verification in a separately restored wallet, and repeat checks without another payment.
- [Ootle upgrade verification](docs/ootle-v046-upgrade.md): dependency pins and engine compatibility.
- [Demo walkthrough](docs/DEMO.md): permissions, setup, everyday mail and payments.

Local-build acceptance uses reviewed frontend assets on the Pages HTTPS origin with actual ledger responses. This does not mean those assets are already published. GitHub pushes remain under the user's control. The Pages workflow runs on pushes to `main`, tests/builds and publishes the static `/MoonMail/` site over HTTPS.

## Develop

Node 24.19+ and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Assets, fonts and crypto WASM are served with the app. An unconfigured development instance offers a clearly labelled sample preview; configured offices use actual chain reads and honest loading/empty/error states.

Rust 1.97.1, `wasm32-unknown-unknown` and template-lib 0.34 are pinned. Run native engine checks on Linux/WSL; upstream Wasmer 7.5 Cranelift does not support Windows:

```sh
cargo test --manifest-path contracts/postbox-claim-tests/Cargo.toml --locked -- --include-ignored
```

The SDK bridge checks require Node and installed JS dependencies. With Windows Node under WSL, supply Windows paths for `GHOSTDROP_TEST_POSTBOX_SIGNER`, `GHOSTDROP_MAILBOX_SIGNER`, `GHOSTDROP_CAPSULE_FIXTURE` and `MOONMAIL_SEALED_FIXTURE`, plus the Node executable and TS loader paths. No visitor needs these development tools. Developer funding/keeper utilities remain optional isolated tooling and are never started by the site.

Keep wallet data, private links, API keys and development credentials out of Git/build variables. [Historical architecture](docs/ARCHITECTURE.md), [earlier evidence](docs/EVIDENCE.md) and [brand/cryptographic naming](docs/branding.md) preserve their original context. Current formats retain domain separation; renaming the app does not rename cryptographic domains.

MIT licensed. Tari libraries retain their upstream licenses. The moonlit scene uses local SVG/CSS and original text. The bundled, unmodified Inter variable font is distributed under its included [SIL Open Font License](public/fonts/LICENSE.txt).
