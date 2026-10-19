<p align="center">
  <img src="public/favicon.svg" alt="" width="80" height="80">
</p>

<h1 align="center">MoonMail</h1>

<p align="center"><strong>Your words, under cover of night.</strong></p>

<p align="center">
  A familiar private mailbox, built on Tari Ootle.<br>
  Encrypted letters. Recoverable conversations. A little moonlight.
</p>

<p align="center">
  <a href="https://seal-clubber.github.io/MoonMail/"><strong>Open MoonMail</strong></a>
  &nbsp; · &nbsp;
  <a href="docs/DEMO.md">Demo walkthrough</a>
  &nbsp; · &nbsp;
  <a href="docs/private-email.md">Privacy explained</a>
</p>

---

MoonMail brings an email-style inbox to Ootle: a folder sidebar, message list,
conversation reader and a compact Compose window. Private mail is the default.
Letters and encrypted mailbox state live on chain; your wallet recovers access
when you move to another device.

Use the website and your normal [Sapient wallet](https://sapient.tari.mw/).
There is no central MoonMail backend or extra bridge program. The static website
runs on GitHub Pages over HTTPS and reads Ootle through public indexers.

**Currently on Esmeralda testnet.** MoonMail sends between Ootle postboxes, not
ordinary email addresses. It is experimental software with bounded storage and
discovery, not a production email replacement. Use test funds.

## A mailbox that feels familiar

| Feature                  | What you can do                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Private by default       | Send encrypted subjects and messages with sealed recipient and reply addressing.                                         |
| Inbox and Sent           | Read conversations, reply, search loaded mail and recover your own sent letters.                                         |
| Everyday organisation    | Select letters, mark read/unread, star and archive. Opening a decrypted letter stages it as read.                        |
| Easy addressing          | Type a name or postbox ID; matching favourites appear first, then recent correspondents and the public directory.        |
| Wallet recovery          | Restore the same Sapient wallet to recover mailbox keys, historical access, Sent and saved preferences.                  |
| Private payment requests | Request TARI inside an encrypted letter; review and pay through Sapient, then verify the encrypted receipt.              |
| A public hall            | Explore public letters and gifts in cards or a list. Private-link letters are omitted; postbox letters stay in My inbox. |

The interface uses a moonlit dark-blue theme, readable text, responsive layouts
and animations that respect reduced-motion preferences. Compose stays at the
bottom-right on desktop and opens full-screen on phones.

Choose **Compose letter** inside **My inbox** to open it. The top navigation
keeps **My inbox**, **Public mail** and **Activity** labelled at every screen
size. Routine mail-sync status sits in the top bar to the left of the wallet controls; transaction
outcomes and errors keep their own notices.

To collect a public or private-link gift, paste your **Ootle wallet address** and
review the destination. MoonMail finds the account for you and, when needed,
sets it up from the gift’s fee reserve. Connecting Sapient fills the address
automatically. You never need to look up an account component ID.

When sharing a private letter, use **Copy private link** inside the letter.
MoonMail removes the private key from the browser address after opening it, so
keep the original complete link to reopen it after a reload.

## Native Sapient integration

MoonMail puts Sapient's native privacy features to work in an Ootle mailbox.
The integration covers the full journey from connecting a wallet to recovering
encrypted conversations and paying a private request:

- **Direct browser connection.** Uses Sapient's `window.tari` provider to connect
  the selected account, check the network and detect supported features. No
  separate bridge program is needed.
- **Separate, revocable private-view access.** Mail recovery uses an explicit
  account-wide reading grant. It can reveal private output amounts and memos,
  including other resources; it never grants permission to spend.
- **Encrypted memo recovery.** Postbox decryption keys are backed up in encrypted
  Ootle output memos addressed to your wallet. Sapient's private-output APIs let
  the same restored wallet recover Inbox, Sent and historical mailbox access.
- **Private postage.** Sapient can pay transaction fees from private funds.
  MoonMail enforces the selected funding type and never silently substitutes
  public funding for a private operation. Fee amounts remain observable.
- **Native private TARI payments.** Encrypted payment requests use Sapient's
  `sendPrivately` transaction requests. Encrypted receipts deliver the output
  reference needed to verify/import the payment and check its exact amount and
  memo, without another spending approval.
- **Wallet ownership proofs.** Sapient signs context-bound ownership challenges
  for supported wallet-controlled gift claims, without exporting its signing key.
- **Resumable approvals.** Persisted wallet request IDs let MoonMail inspect and
  resume the original approved operation after an interruption instead of
  silently creating a replacement. Valid connection/view grants can be reused
  after a reload; revocation and account changes are checked.

MoonMail encrypts letter content and inner addressing locally. Sapient protects
wallet signing keys and supplies approved private-output access and spending.
After a view grant, recovered **mailbox decryption keys** are handled in browser
memory; your **wallet seed and signing keys** are never requested. Public
signers, postbox registrations and other chain metadata still remain visible.

The [Sapient integration guide](docs/SAPIENT-INTEGRATION.md) maps these features
to the actual APIs, implementation and stock-wallet test evidence. See
[What can others see?](#what-can-others-see) for the privacy boundary.

## Try it

1. **[Open MoonMail](https://seal-clubber.github.io/MoonMail/)** and choose
   **Open mailbox**. To browse without connecting a wallet, choose
   **Explore public mail** instead.
2. **Connect Sapient.** Before recovering private mail, review the separate
   account-wide private-view permission. It can expose private output summaries,
   including amounts and memos for other resources. It grants no spending permission.
3. **Create a postbox.** Sapient asks for two separate transaction approvals:
   **Save recovery backup**, then **Open my postbox**. The setup explains each
   step before you approve it.
4. **Compose a letter.** Choose a recipient, write your message and review it.
   Encrypted private mail is selected by default. Sapient approves spending;
   the website cannot approve it for you.

Opening mail sends no transaction. Read marks, archive changes, favourites and
preferences are staged until you explicitly **Save** them on chain; an amber
bar makes unsaved changes visible. Unsent text stays only in the current tab:
there are no saved drafts, and reloading loses that text.

Never enter your wallet seed or signing keys into MoonMail. See the
[walkthrough](docs/DEMO.md) for recovery, permissions and interrupted operations.
For installation and connection problems, see [wallet connection help](docs/wallet-connection.md).

## What can others see?

**Encrypted content does not mean anonymity.** The app's **What can others see?**
view explains these boundaries without asking for wallet access.

| Protected by encryption                                         | Still observable                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Private subjects, messages and inner recipient/reply addressing | Transaction signers, timing, office/template identities and opaque letter IDs            |
| Conversation keys and thread links                              | Padded size buckets, fees and output commitments                                         |
| Saved mailbox preferences                                       | Changes to encrypted state; public postbox names, IDs, controllers and key registrations |
| Native private-payment amounts, receiving addresses and memos   | Payment/mail timing patterns; public-gift amounts and payout routing                     |

Postboxes are publicly registered and searchable; a private letter does not make
its postbox identity secret. Conversation-specific reply keys are automatic for
new private letters, but do not hide transaction signers or provide forward
secrecy after compromise of historical mailbox secrets. Website hosts and
indexers see connection information, and the client does not verify consensus
proofs. Read the [privacy guide](docs/private-email.md),
[postbox visibility guide](docs/public-postboxes.md) and
[sealed-mail protocol](docs/sealed-mail-protocol.md) for the full limits.

Permission to read private mail stays separate from permission to spend.
Private postage is selected when supported by the connected account; public
funding requires a deliberate choice. Unsupported private operations fail closed.
Fees use automatic defaults, with an adjustment shown if a verified
pre-submission shortage requires it. Costs remain visible before approval.

## Payments, gifts and public mail

**Private payments start with an encrypted request.** Sending a request pays
postage only. Paying it requires three Sapient approvals: authorize the native
private transfer, save its encrypted recovery record, then deliver the encrypted
receipt. The receiver verifies/imports the payment using view permission without
a spending approval.

Payment and receipt delivery are not atomic. If interrupted, resume the original
request. Losing the original Sapient installation and its missing result before
receipt delivery can prevent automatic discovery. There is no atomic private
gift escrow or claim-by-deadline/refund flow. See
[payment behaviour and recovery limits](docs/private-payments.md).

**Public publication is an explicit choice.** Public letters are readable by
anyone. Public and private-link gifts use a public vault: gift amounts and payout
routing are visible, and there is no expiry or sender refund. Opening a letter
never collects its gift; collection has its own review and confirmation.
Public/private-link gifts support receiving without a connected wallet.

A complete private link is a bearer capability: anyone with it can open the
letter and collect its gift. Keep it safe. MoonMail scrubs it from browser
history and cannot recover it after the session closes. The
[public hall guide](docs/public-mail-gui.md) explains browsing and visibility.

## Built and verified on Ootle

The current default is one **V4 sealed office on Esmeralda**, configured in
[`public/deployment.json`](public/deployment.json). The
[single template](contracts/moonmail-v4/README.md) handles sealed letters,
postboxes, historical recovery keys, encrypted settings and public gift rules.
Native private transfers are separate wallet operations. Old testnet mail is
not migrated or selected; earlier app versions remain in backup branches.

The [contract guide](contracts/README.md) separates the current implementation,
engine tests and historical templates.

The checked stack targets **Ootle 0.46.0**, **TypeScript SDK 0.9.0** and
**crypto WASM 0.46.0**, with unmodified **Sapient 0.6.6**. Available operations
also depend on the connected account's runtime capabilities.

Recorded verification as of **19 October 2026** includes:

- **284 unit tests and 330 desktop/mobile browser checks**, strict TypeScript and
  the Pages build. [Activity and postbox verification](docs/activity-gui.md#verification),
  [wallet connection verification](docs/wallet-connection.md#verification) and
  [earlier public GUI evidence](docs/public-mail-gui-evidence.json).
- **Real Esmeralda mail and wallet recovery:** encrypted letters/replies, key
  rotation, independently restored Inbox/Sent, saved settings and native private
  postage. [Sealed-mail evidence](docs/sealed-mail-evidence.json).
- **A real private payment with interrupted-result recovery:** one 0.1-test-TARI
  transfer, no duplicate payment, exact amount/memo verification and an
  independently restored recipient. [Payment evidence](docs/private-payment-evidence.json).
- **Guest public-mail reads against the real ledger**, with no wallet, financial
  requests or broadcasts. [Public hall verification](docs/public-mail-gui.md).

Local-build checks on the Pages HTTPS origin do not establish that those assets
are already published. The evidence records each test's scope;
[upgrade verification](docs/ootle-v046-upgrade.md) covers the dependency pins and
engine compatibility.

## Run locally

Use **Node 24.19+** and **pnpm 11.19.0**:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

To check the frontend:

```sh
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Fonts, artwork and crypto WASM ship with the app. Configured offices read the
actual chain; **Try sample mail** is a clearly labelled fictional preview, with
no funded gifts. Loading and network failures are not disguised as sample mail.

See the [development guide](docs/DEVELOPMENT.md) for contract checks, repository
layout and GitHub Pages setup. The [Pages workflow](.github/workflows/pages.yml)
tests, builds and deploys on pushes to `main`, with manual dispatch also available.

## License

[MIT](LICENSE). Tari libraries retain their upstream licenses. The moonlit scene
uses local SVG/CSS and original text. The bundled, unmodified Inter font includes
its [SIL Open Font License](public/fonts/LICENSE.txt).
