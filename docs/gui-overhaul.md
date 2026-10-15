# A familiar mailbox under moonlight

MoonMail's interface now uses one navy and lunar-blue design across the mailbox, writing desk, Activity, postbox setup and privacy screens. The desktop mailbox fills the page with postbox/folder navigation, a message list and a dark reading pane. On phones, opening a letter switches to a focused reader; **Back to messages** returns to the list. The ghost and favicon share the same local vector artwork. No new font service, image service or visitor program is required.

## Everyday controls

- Switch between **My postboxes** in the mailbox sidebar. **Compose letter** starts from the selected postbox. Inbox, Unread, Starred, Sent, Archive and existing gift views remain available; counts describe loaded mail, not an unbounded full-chain total.
- Search the current folder from the header. **View options** contains sorting; compact spacing keeps a one-line message preview. **Postbox options** contains creation, refresh and editing and starts collapsed on desktop and phones. Public mail/gifts and the privacy explanation remain directly reachable in the sidebar. **Mailbox settings** contains saved message spacing and reload controls after settings have loaded.
- Opening a successfully decrypted incoming letter stages its read mark. Select letters and choose a bulk read/unread, star or archive action. The amber **Unsaved mailbox changes** bar remains visible until saved or discarded. Saving requires a separate Sapient transaction approval; reloading can lose unsaved changes.
- Compose puts the sending postbox before the recipient. Contacts/favourites stay with recipient choices. Conversation-specific reply keys are under **Reply encryption options**. Private mail remains the default; public publishing still requires explicit acknowledgement and review.
- The reader shows the verified sending postbox when known, otherwise a wallet reference, and the recipient postbox. It does not invent message timestamps. Loaded conversation replies remain expandable; the open letter is not repeated below itself. Sent recovery, payment requests and original-request recovery remain available.
- Native private-payment review shows the three approvals as separate steps: authorize the original transfer, save its recovery record, deliver the receipt. Automatic fee defaults and guarded fee adjustment retain their existing behavior.

## Permissions and visibility

Private-view permission remains account-wide and separate from spending. It can reveal private output summaries, including amounts and memos for other resources. Reusing an existing grant across reloads does not silently approve transactions. Disconnection/revocation still clears readable session data.

Sealed content and inner addressing remain encrypted. Postbox registrations and their names/IDs/controller associations, transaction signers, timing, fees, commitments and other public metadata remain observable. **Encrypted letter** does not mean anonymous or a private postbox identity. Public mail and bearer-link gifts retain their existing boundaries. [What remains visible](private-email.md).

## Verification

The approved design was implemented on `main`, preserving the `moonmail-pre-gui-overhaul` restore tag. No template, deployed office, cryptographic format, funding default or transaction state machine changed. No migration or template publication is needed.

- 269 unit tests across 32 files, strict TypeScript and the GitHub Pages build passed.
- All 296 desktop/mobile browser checks passed on the final interface, including recovery, public consent, fees, gifts, interrupted payments, read/spend permission separation and a 100-letter encrypted fixture. Two additional concept-composition checks exercise the real controls with 27 explicitly fictional encrypted letters and verify the bundled font and mobile reader.
- Earlier additional layout checks covered Landing, Compose, sample Activity, Settings and Privacy at 320, 390, 768 and 1440 pixels. Development fixtures do not populate the live testnet with sample mail. Final desktop and phone previews are screenshots of the working interface, labelled as fictional mail.
- Unmodified stock Sapient 0.6.6 and actual Esmeralda reads verified Inbox, Sent, recovered saved settings/favourites, grant reuse after reload and exact verification of a previously confirmed isolated private-payment output. There were **zero financial wallet requests and zero broadcasts**. No new payment or deliberately lost transaction was used for this GUI verification.
- Private-material scans covered source/build output. Local prompts, profiles, credentials, screenshot evidence and development notes remain outside the app repository.

[Verification scope](gui-overhaul-evidence.json) identifies the checked commits. Stock acceptance served reviewed local frontend assets on the Pages HTTPS origin while using the actual ledger; it does not establish that the new assets are already published. GitHub pushes and publication remain under the user's control. Earlier engine verification remains documented separately; contracts did not change in this overhaul.

## Pages test correction

The first pushed overhaul failed in [Pages run 38819948705](https://github.com/Seal-Clubber/MoonMail/actions/runs/38819948705): random base64 ciphertext happened to contain the three-character test recipient ID. The privacy test now checks the exact outer payload keys and absence of the quoted clear JSON identity, alongside authenticated decryption, recipient binding and recoverable Sent assertions. No production encryption behavior changed and no checks were skipped. The next user push runs the corrected test and Pages workflow; the failed remote run is not presented as successful.
