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

For technical review, start with [architecture and trust boundaries](#architecture-and-trust-boundaries),
the [Sapient API map](#sapient-api-map), [implementation and test map](#implementation-and-test-map)
and [verification scope](#built-and-verified-on-ootle). These describe implemented
behaviour and recorded evidence; they are not a roadmap or an independent audit.

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
Delivery options stay visible below the message. Once delivery is confirmed,
Compose clears that letter and returns to private mail for the next one. Pending
or unsuccessful sends keep your text, and a late confirmation never clears a
newer letter you have started.

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

The checked stack targets **Ootle 0.47.0**, **TypeScript SDK 0.11.1** and
**crypto WASM 0.47.0**, with unmodified **Sapient 0.6.14** from the Chrome Web Store. Available operations
also depend on the connected account's runtime capabilities.

Recorded verification as of **29 October 2026** separates these scopes:

| Evidence                                                              | Environment and result                                                                                                                                                 | What it establishes                                                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Current frontend and upgrade record](docs/ootle-v047-evidence.json)  | 295 unit tests in 34 files; 336 desktop/mobile browser cases; strict TypeScript; Pages build                                                                           | Local regression coverage. Browser suites use synthetic wallet providers and intercepted ledger responses; they are not live transactions.                                   |
| [Native engine verification](docs/ootle-v047-upgrade.md#verification) | 49 mailbox, 13 legacy-mail and one recovery check: 63 total, including SDK/WASM signing and fee execution                                                              | Real Ootle 0.47 engine execution in isolated state with synthetic keys. Evidence from the upgrade is retained for unchanged mail contracts; these are not public broadcasts. |
| [Original published binary probe](docs/ootle-v047-evidence.json)      | The preserved deployed V4 WASM runs postbox creation, settings writes/foreign-writer rejection and sealed publication/reads in the 0.47 engine                         | Compatibility of that exact artifact for this tested surface, separately from rebuilding current source.                                                                     |
| [Current stock-wallet recovery](docs/ootle-v047-evidence.json)        | Unmodified Sapient 0.6.14; real Ootle 0.47 Esmeralda responses; Inbox, Sent, settings and valid view-grant reuse after reload                                          | Read-only acceptance using reviewed local assets on the Pages HTTPS origin. Financial requests and broadcasts were blocked; zero occurred.                                   |
| [Funded sealed-mail campaign](docs/sealed-mail-evidence.json)         | Earlier stock Sapient 0.6.6 campaign: publication/replies, rotation, independent wallet restoration, settings and private postage                                      | Real testnet financial/mail evidence from its recorded build, not a repeat of financial operations on the latest 0.47 stack.                                                 |
| [Funded private-payment campaign](docs/private-payment-evidence.json) | 15 October 2026; Sapient 0.6.6; one 0.1-test-TARI payment with deliberately lost success response, exact amount/memo verification and independently restored recipient | The recorded request/intent/receipt flow recovered that payment without paying again. It is not an atomic escrow or a new 0.47 funded acceptance test.                       |
| [Public hall verification](docs/public-mail-gui.md)                   | Guest reads against the real ledger, without a wallet or financial requests                                                                                            | Public browsing against Esmeralda, distinct from the fictional preview and browser fixtures.                                                                                 |

Local-build checks on the Pages HTTPS origin do not establish that those assets
are already published. The evidence records each test's scope;
[upgrade verification](docs/ootle-v047-upgrade.md) covers the dependency pins and
engine compatibility.

Evidence files are repository records, not third-party attestations. Earlier
records retain their original limitations: for example, the sealed-mail campaign
predates the separately implemented payment-request flow. Follow its paired
[payment evidence](docs/private-payment-evidence.json) for that feature.

## Architecture and trust boundaries

The application has three runtime parts: a static browser client, the user's
stock Sapient extension and Ootle components accessed through a configured
indexer. There is no application database, hosted mailbox server or required
MoonMail operator. GitHub Pages distributes the client; it does not decrypt mail
or hold wallet keys. Public indexers remain a dependency for availability and
truthful reads.

| Layer                                  | Responsibility                                                                                                                      | Boundary                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| React/TypeScript client                | Mailbox UI, local encryption/decryption, bounded discovery, transaction review and reconciliation                                   | The loaded frontend can see plaintext and recovered mailbox secrets after permission; users must trust its origin/build. |
| Stock Sapient                          | Account/network identity, explicit private-view grants, encrypted output memos, native private funding and user-approved signatures | Connecting or granting view access does not authorize spending. Runtime capability checks gate each operation.           |
| Current V4 office and child components | Postbox controllers/key history, immutable letters, encrypted settings revisions, recovery resource and public-gift claim rules     | The contract enforces authority, shape and capacity; it cannot prove a sender's ciphertext is decryptable.               |
| Configured Ootle indexer               | Read office/letter/account/output state, track transaction outcomes and accept supported submissions                                | MoonMail validates expected identities and formats, but does not independently verify consensus proofs.                  |

### Private letter lifecycle

1. The browser generates a mailbox encryption key. With Sapient approval, an
   encrypted memo backs it up to the controlling wallet on Ootle. The recovery
   carrier contains **one unit of a dedicated recovery resource**, with a locked
   `DenyAll` spending condition; it is not a one-micro-TARI payment. Recovery checks
   the actual carrier, resource, condition, context and registered public key.
2. A second approved transaction registers the postbox/controller and recovery
   reference. Key rotation retains contiguous historical versions. The financial
   wallet seed and signing keys are never requested by the website.
3. Compose encrypts the subject, body, inner recipient identity, thread data and
   reply identity locally. The `mm-sealed-2` envelope uses AES-256-GCM, fresh
   ephemeral Tari Ristretto Diffie-Hellman and HKDF-SHA256. Two randomly ordered
   wrapped content-key slots provide recipient access and recoverable Sent.
   Authenticated context binds the deployment, letter ID and recorded signer.
4. Sapient approves publication and funding. The chain stores the complete
   encrypted payload, not just a hash or an external content-storage URL. Public
   contract records retain the transaction signer and opaque letter ID.
5. The reader loads bounded shared directory pages and attempts decryption
   locally using recovered mailbox/reply keys. It does not query a public
   recipient-locator index. The same restored wallet can recover historical keys,
   Sent and conversation reply identities from chain records.
6. Opening a letter is read-only. Organisation changes are staged in the UI;
   explicitly saving encrypts the mailbox state and requests a separate
   controller-authorized transaction with revision checks.

These are application cryptography and recovery rules built with the documented
primitives, not an independent cryptographic audit. Permanent ciphertext can
become readable if the corresponding historical mailbox secrets are compromised.

### Payment and interruption lifecycle

An encrypted request contains the requested amount and native receiving details.
To pay it, MoonMail creates the Sapient private-transfer approval, commits a
unique encrypted recovery intent **before submitting the transfer**, reconciles
the original wallet request, and then delivers an encrypted receipt. A receiver
checks the real output, ownership, resource, exact amount and intent-specific memo
through Sapient's view/import APIs. Importing a receipt does not spend funds.

Pending operations retain public request/transaction identifiers so reloads and
uncertain responses can resume the original operation. Unknown outcomes are not
treated as permission to send a replacement. This reduces duplicate-payment
risk; it does not make transfer and receipt atomic or guarantee recovery after
losing the original wallet installation and its unavailable result.

### Storage, limits and availability

| Data or limit          | Current behaviour                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Letter storage         | Full public text or full encrypted payload in Ootle child components. Public and sealed directories share a 4,096-letter capacity per office.                                                                                                |
| Postboxes              | Up to 512 per office, with 16 contiguous recoverable key versions per postbox. Names, IDs, controllers and registered keys are public.                                                                                                       |
| Sealed payload         | Plaintext, metadata and a four-byte length prefix fit a padded 1,024 / 2,048 / 4,096 / 8,192 / 16,384-byte bucket. This is not a character-count allowance. Envelope JSON is capped at 24,000 bytes and complete child CBOR at 32,768 bytes. |
| Discovery              | At most 50 sealed entries per contract page; bounded scanning and reply-key derivation. Search covers loaded mail, not an unlimited server-side index.                                                                                       |
| Mailbox settings       | Encrypted on-chain state with controller authorization and expected-revision checks. Unsaved changes remain local until explicitly approved.                                                                                                 |
| Browser state          | Decrypted letters and mailbox secrets stay in session memory and are cleared on loss of access/account changes. Pending-operation identifiers persist for reconciliation. Unsent Compose text has no saved draft.                            |
| Link mail              | A complete private link is a bearer capability. Scrubbing the URL reduces accidental exposure; it does not revoke a copied link or recover a lost one.                                                                                       |
| Deletion and archiving | Archive/read changes organise a mailbox. They do not erase immutable chain history or other people's copies.                                                                                                                                 |
| Availability           | Requires a reachable compatible indexer, Ootle network and supported Sapient account. Capacity exhaustion needs a new office/deployment strategy; this is not unlimited production email.                                                    |

Current deployment identities are versioned in
[`public/deployment.json`](public/deployment.json): network **38 / Esmeralda**,
protocol **`unified-2`**, registry
`component_47b0dddced08140d37448b79bbf1f545907344b65bfa28b5f10ffe27f8132ebe`
and template
`e0c2b09b5d172542e7196f54625fbf78a5150aa77cead67d0b8737bd436d2f0c`.
Rebuilt WASM has a different identity; a source build is not automatically a new
deployment or a replacement for the recorded published binary.

## Sapient API map

The visitor path uses the injected `window.tari` provider. These calls implement
different permissions and phases, rather than treating wallet connection as
blanket authority:

| Purpose                         | API / request form                                                                                    | Relevant rule                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Connect and bind identity       | `tari_requestAccounts`, `tari_getAccounts`, `tari_getWalletAddress`, `tari_getNetwork`                | Recheck account/network before operating; reject a mismatched session.                                               |
| Detect support                  | `tari_getCapabilities`                                                                                | An API name alone does not establish private-spend or private-fee capability.                                        |
| Read permission                 | `tari_getViewAccess`, `tari_requestViewAccess`                                                        | Separate, revocable, account-wide grant; may expose private memos/amounts for resources other than MoonMail.         |
| Recover mail / verify receipt   | `tari_getShieldedOutputs`, `tari_claimPrivatePayment`                                                 | Validate the permanent recovery carrier or exact payment output; these read/import actions do not authorize a spend. |
| Private postage                 | `tari_createTransactionRequest`, `kind: "instructions"`, `feeType: "private"`, `enforceFeeType: true` | Wallet constructs private funding; unsupported operations fail closed rather than falling back to public funds.      |
| Native payment                  | `tari_createTransactionRequest`, `kind: "sendPrivately"`, private fees, `minimumValuePromise: "0"`    | Encrypted request/intent/receipt bind the transfer; the zero promise is not a zero payment amount.                   |
| Resume an approval              | `tari_getTransactionRequest`, `tari_submitTransactionRequest`                                         | Reuse the persisted original request ID instead of silently creating another payment.                                |
| Addressed gift authority        | `tari_signWalletOwnershipChallenge`                                                                   | Context-bound proof for supported public-vault postbox claims; not private escrow.                                   |
| Public-path checks / disconnect | `tari_signAndSubmitTransaction` with `dryRun: true`; `tari_disconnect`                                | Legacy dry-run does not establish private-fee success. Disconnect/view revocation invalidates private access.        |

See the [full integration guide](docs/SAPIENT-INTEGRATION.md) for adapter details,
versioned upstream references and evidence. Native private-payment funding is
separate from the public vault used by public/private-link gifts.

## Implementation and test map

These entry points let a reviewer trace a user-visible claim to implementation
and focused checks. Tests complement the scoped network records above; source
existence or a passing local test is not proof of a live deployment.

| Area                                          | Primary source                                                                                                                               | Checks                                                                                                                                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mailbox, folders and conversations            | [MailboxWorkspace.tsx](src/ui/MailboxWorkspace.tsx), [Postboxes.tsx](src/ui/Postboxes.tsx), [threads.ts](src/core/threads.ts)                | [Mailbox browser cases](tests/browser/mailbox.spec.ts), [sealed mailbox cases](tests/browser/sealed-mailbox.spec.ts)                                                                   |
| Envelope encryption, Sent and sender binding  | [sealed-mail.ts](src/core/sealed-mail.ts), [sealed-addressing.ts](src/core/sealed-addressing.ts)                                             | [Envelope tests](tests/sealed-mail.test.ts), [addressing tests](tests/sealed-addressing.test.ts), [persisted engine roundtrip](contracts/tests/mailbox/src/sealed_delivery.rs)         |
| Permanent wallet recovery                     | [capsule creation](src/core/sapient-capsule-create.ts), [capsule recovery](src/core/sapient-capsule.ts), [memo format](src/core/capsules.ts) | [Recovery tests](tests/sapient-capsule.test.ts): fresh recovery, unsafe carriers, ledger rechecks and revoked grants                                                                   |
| Shared discovery and revoked access           | [sealed-mailbox.ts](src/core/sealed-mailbox.ts), [sealed-office.ts](src/core/sealed-office.ts)                                               | [Mailbox discovery tests](tests/sealed-mailbox.test.ts), [strict office tests](tests/sealed-office.test.ts): bounded scans, later Sent recovery and canceled sessions                  |
| Saved encrypted settings                      | [mailbox-state.ts](src/core/mailbox-state.ts), [useChainMailbox.ts](src/ui/useChainMailbox.ts)                                               | [Settings tests](tests/mailbox-state.test.ts), [engine authorization/revision tests](contracts/tests/mailbox/src/mailbox_state.rs)                                                     |
| Wallet permissions, funding and interruptions | [sapient.ts](src/core/sapient.ts), [pending.ts](src/core/pending.ts), [delivery.ts](src/core/delivery.ts)                                    | [Sapient tests](tests/sapient.test.ts): account/network binding, private-fee enforcement, lost results and original-request recovery                                                   |
| Private payment protocol                      | [flow](src/core/private-payment-flow.ts), [client](src/core/private-payment-client.ts), [message validation](src/core/private-payment.ts)    | [Protocol tests](tests/private-payment.test.ts), [wallet/output tests](tests/private-payment-wallet.test.ts): intent uniqueness, interruptions, exact output/memo and read-only import |
| Public/link gifts and address-only receiving  | [chain.ts](src/core/chain.ts), [postbox-claim.ts](src/core/postbox-claim.ts), [receiving-address.ts](src/core/receiving-address.ts)          | [Address derivation checks](tests/receiving-address.test.ts), [engine claim checks](contracts/tests/mailbox/src/unified_claims.rs): authority, replay, rollback and spendable payouts  |
| Current contract                              | [V4 source](contracts/moonmail-v4/src/lib.rs), [contract guide](contracts/moonmail-v4/README.md)                                             | [Mailbox engine suite](contracts/tests/mailbox/src), including storage bounds, immutable ciphertext, key history and ownership                                                         |
| Ootle 0.47 reads                              | [substate.ts](src/core/substate.ts), [upgrade notes](docs/ootle-v047-upgrade.md)                                                             | [Substate tests](tests/substate.test.ts): reject down, obsolete and malformed envelopes; real-read scope in the upgrade evidence                                                       |

Earlier templates under [`contracts/legacy/`](contracts/legacy) and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) preserve historical designs; their
old daemon/extension requirements and disabled-feature notes are not the current
visitor architecture. The current V4 sources, pinned dependencies, deployment
profile and versioned evidence above define this implementation. No claim is
made here of anonymous postboxes, hidden transaction signers, forward secrecy,
SMTP/IMAP interoperability, atomic private gift escrow or an independent audit.

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

For the current template and all three native engine suites, use Linux or WSL
with the pinned Rust toolchain (`wasm32-unknown-unknown` included):

```sh
cargo build --manifest-path contracts/moonmail-v4/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo test --manifest-path contracts/tests/mailbox/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/tests/legacy-mail/Cargo.toml --locked -- --include-ignored
cargo test --manifest-path contracts/tests/recovery/Cargo.toml --locked
```

Native engine checks need Node and installed JavaScript dependencies for the SDK
fixtures. See the [engine setup and Windows/WSL paths](docs/ootle-v047-upgrade.md#build-and-engine-checks).
These tests use isolated state and synthetic keys; they do not publish templates
or spend live funds. Running the actual application against its default profile
does use Esmeralda, so approving a wallet transaction there spends testnet funds.

Fonts, artwork and crypto WASM ship with the app. Configured offices read the
actual chain; **Try sample mail** is a clearly labelled fictional preview, with
no funded gifts. Loading and network failures are not disguised as sample mail.

See the [development guide](docs/DEVELOPMENT.md) for contract checks, repository
layout and GitHub Pages setup. The [Pages workflow](.github/workflows/pages.yml)
tests, builds and deploys on pushes to `main`, with manual dispatch also available.
The separate [verification workflow](.github/workflows/verify.yml) runs the browser
and native contract suites; neither workflow is evidence that every live wallet
financial path has been retested on the latest release.

## License

[MIT](LICENSE). Tari libraries retain their upstream licenses. The moonlit scene
uses local SVG/CSS and original text. The bundled, unmodified Inter font includes
its [SIL Open Font License](public/fonts/LICENSE.txt).
