# Sapient integration in MoonMail

MoonMail uses stock Sapient as the wallet for its Ootle mailbox. The website
connects directly through the injected `window.tari` provider. No custom wallet,
local bridge service or central MoonMail backend is required.

The current checked compatibility target is unmodified **Sapient 0.6.14** with
**Ootle 0.47.0**; the [upgrade evidence](ootle-v047-evidence.json) covers read-only
Inbox/Sent/settings recovery and grant reuse, with financial requests blocked.
The earlier funded mail and payment campaigns below used **Sapient 0.6.6** with
the **Ootle 0.46** application. They are not new funded tests on 0.47.
MoonMail checks the selected account, network and capabilities
at runtime; a supported API name alone is not proof that an account can perform
the operation.

## Features and APIs used

| Sapient capability                 | APIs used by MoonMail                                                                                     | Application behaviour                                                                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account connection and identity    | `tari_requestAccounts`, `tari_getAccounts`, `tari_getWalletAddress`, `tari_getNetwork`                    | Connect the selected wallet, bind operations to its account/network and reuse an existing site grant without a fresh connection prompt.                                          |
| Feature detection                  | `tari_getCapabilities`                                                                                    | Check transaction requests, private fees and private spend/import support before enabling operations.                                                                            |
| Public balance display             | `tari_getBalances`                                                                                        | Read the revealed TARI balance without requesting private-view permission or treating withheld private balances as zero.                                                         |
| Private-view permission            | `tari_getViewAccess`, `tari_requestViewAccess`                                                            | Recover private mail only after a separate account-wide reading grant; recheck it during recovery/import.                                                                        |
| Encrypted output memos             | `tari_getShieldedOutputs`, `tari_claimPrivatePayment`                                                     | Recover wallet-addressed mailbox-key capsules, including historical keys, through verified permanent recovery outputs.                                                           |
| Private postage                    | `tari_createTransactionRequest` with `kind: "instructions"`, `feeType: "private"`, `enforceFeeType: true` | Let Sapient construct private fee proofs under the user's approval; fail closed if private fees are unsupported.                                                                 |
| Native private payments            | `tari_createTransactionRequest` with `kind: "sendPrivately"`, private fees and `minimumValuePromise: "0"` | Pay an encrypted request using native private TARI outputs and an encrypted intent-specific memo.                                                                                |
| Payment receiving and verification | `tari_claimPrivatePayment`, `tari_getShieldedOutputs`                                                     | Verify/import the receipt's exact output commitment, resource, amount and memo; verify an already recovered output without importing it twice.                                   |
| Persisted approvals and submission | `tari_createTransactionRequest`, `tari_getTransactionRequest`, `tari_submitTransactionRequest`            | Preserve request identity across interruptions, distinguish approval from submission and reconcile the original request.                                                         |
| Ownership proofs                   | `tari_signWalletOwnershipChallenge`                                                                       | Authorise supported addressed gift claims with a context-bound proof tying together the controller, destination and expiry.                                                      |
| Transparent-path simulation        | `tari_signAndSubmitTransaction` with `dryRun: true`                                                       | Check explicitly public-funded operations before submission. The inspected legacy simulation does not forward private fee selection and is not used to simulate private postage. |
| Disconnection                      | `tari_disconnect`                                                                                         | End the site connection and invalidate the application session. Revoking view permission in Sapient also removes private read access.                                            |

The implementation is in [the Sapient adapter](../src/core/sapient.ts),
[capsule creation](../src/core/sapient-capsule-create.ts),
[capsule recovery](../src/core/sapient-capsule.ts),
[mailbox-key memo format](../src/core/capsules.ts) and
[chain operations](../src/core/chain.ts).

## How the privacy fits together

MoonMail encrypts subjects, bodies, inner recipient/reply addressing and saved
mailbox preferences in the browser. Its padded sealed envelopes contain
recipient and recoverable-Sent key slots without public labels identifying
their roles. Conversation-specific reply keys separate encryption identities;
they do not hide wallet signers or provide forward secrecy after historical
mailbox-key compromise.

Sapient's native output encryption protects mailbox-key backup memos for the
wallet's receiving address. After explicit view permission, the browser uses
the recovered mailbox decryption key to restore mail and settings. These are
application keys, not the wallet seed or signing keys. Plaintext and recovered
mailbox secrets are held in session memory and cleared when access is lost.
The view grant is account-wide and can expose other private amounts and memos;
it is not limited to MoonMail resources.

Native private payments keep amounts, receiving addresses and payment memos
out of clear public letter content. Private postage pays fees using private
funds, but does not hide the fee amount. Transaction signers, timing, office
identities, commitments, size buckets and public postbox registrations remain
observable. Multi-step timing can link activity; hosts/indexers see connection
information. Public gifts retain visible amounts and payout routing.
**These features do not provide anonymity.**

Reading permission never approves a spend. Paying a request takes three
approvals: authorise the native transfer, publish its encrypted recovery intent,
then deliver the encrypted receipt. Payment and receipt delivery are not atomic.
If the original wallet installation and its missing result are lost before the
receipt is delivered, automatic discovery is not guaranteed. See
[the payment protocol](private-payments.md) and
[the sealed-mail threat model](sealed-mail-protocol.md).

## What has been verified

- [Current Ootle 0.47 compatibility](ootle-v047-upgrade.md) and
  [stock Sapient 0.6.14 evidence](ootle-v047-evidence.json): actual-network
  Inbox/Sent/settings recovery and valid grants after reload. Local reviewed
  assets on the Pages origin; zero financial requests or broadcasts.
- [Sealed-mail Esmeralda evidence](sealed-mail-evidence.json): stock Sapient,
  encrypted publication/replies, independent wallet restoration, Inbox/Sent,
  historical keys, saved settings and private postage.
- [Private-payment Esmeralda evidence](private-payment-evidence.json): one
  0.1-test-TARI private payment, deliberately lost success response, recovery
  without another payment, exact amount/memo verification and an independently
  restored recipient.
- [Ownership-proof integration](POSTBOX-PROOF-CLAIMS.md) and
  [native-privacy evidence](native-privacy-evidence.json): proof-bound claims and
  the Ootle fee/epoch behaviour. These claims use the public gift vault, not
  private escrow.
- [GUI acceptance](gui-overhaul.md): stock-wallet recovery, retained valid grants
  across reloads and read-only private-payment verification with no new spending.

Each evidence record describes its version and scope. Local frontend acceptance
on the Pages HTTPS origin does not prove publication of that build.

For the wallet's public overview, see [Sapient](https://sapient.tari.mw/).
For the exact inspected API surface, see the
[pinned provider reference](https://github.com/chironbuilds/tari-wallet/blob/7ad3c4f117a76c64d472fd371b7d75bbe297abec/docs/integration/provider-api.md).
