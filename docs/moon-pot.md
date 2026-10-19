# Moon Pot: weekly public community pot

Moon Pot has its own tab beside Public mail. The existing private inbox and
public-letter flows stay intact. All pot contributions, postbox identities,
messages, amounts and results are public. It does not claim anonymous entries
or private pot funding.

## Current status

The template, strict state decoder, transaction builder, Sapient request path,
Activity integration and desktop/phone interface are implemented locally.
The default `public/moon-pot.json` is `{ "deployment": null }`: no pot has been
published or opened, and the default website cannot request a pot payment.
Its optional fictional preview and share calculator never access a wallet.

The operator must publish the reviewed template and catalog, verify actual
stock Sapient funding/discovery and record the resulting public addresses before
activating a deployment. No live pot contribution or payout is claimed yet.

## Experience

Each entry shows its public postbox ID, message and contribution. Repeated entries
aggregate into the postbox's current share. Ten TARI in a 100-TARI pot means an
intended 10% weighted chance; adding ten to an existing 100-TARI pot yields about
9.09%. All contributions can change the shares before the cutoff. The entire
contribution may be lost when another postbox wins.

When configured, visitors can read the pot without connecting. Sending requires
Sapient and an owned registered postbox. Review shows the public message,
contribution, estimated share, receiving account where relevant and fee cap.
Sapient then approves spending. No private-mail reading grant is requested.

Contributions withdraw public TARI. Private postage remains the default;
unsupported private fee funding fails closed, and public fee funding requires
an explicit selection. The fee cap uses the existing automatic defaults and is
adjustable only when a fee warning requires it. Winners collect the whole pot;
fees are separate and no house cut is taken.

Requests use the existing durable Sapient approval journal. A pending or unknown
pot action cannot silently create a replacement. Activity identifies opening,
contributing, drawing, collecting and refunding, and can resume the original
saved wallet request. A lost transaction ID is not resolved merely because a pot
balance or entry appears; inspect the original wallet request/history.

Recent rounds can be selected for old prize collection or refunds. History loads
in groups of eight, up to 256 rounds in this initial interface. Contract records
remain on chain beyond this interface's retrieval bound.

## Draw limitations and explicit experimental mode

The [official randomness guide](https://ootle.tari.com/guides/randomness/)
warns that Ootle's basic transaction-derived randomness can be ground by callers.
The prototype instead freezes entries before a fixed future epoch and derives
the ticket from that epoch's hash without caller-selected transaction inputs.
If that exact epoch is missed, the contract permits refunds rather than allowing
the draw submitter to choose a later hash.

This removes one source of manipulation but does not establish unbiased entropy:
the appropriate cutoff against oracle lag is unverified, L1 miners can influence
block hashes, and censorship/non-participation can prevent the draw. A weekly
round follows 504 consensus epochs; its wall-clock length can vary. Six epochs
are closed before the one-epoch draw window. Someone must explicitly submit the
draw; a static website does not execute transactions on a timer.

The user selected an experimental testnet-only version. Activation may use
`experimental: true`, verified `engine` and `stockSapient` evidence, and an
unchecked acknowledgement in the interface. It must keep `drawSecurity: false`
and `livePayout: false` until those claims have their own evidence. The disclosure
appears before financial review. Acceptance is reset on reload, account change,
deployment change and fictional preview. Evidence flags are UI interlocks;
contract authentication, deadlines and custody are the actual enforcement.

## Remaining release checks

1. Identify the existing isolated Esmeralda development Sapient account and its
   available public balance; never substitute a visitor's or personal account.
2. Quote publication of the exact locked-build WASM, record its artifact hash,
   and prepare the template publication and ownerless catalog creation for
   review under the standing public-broadcast authorization requirements.
3. Confirm the published template identity from actual chain state, instantiate
   the catalog against the existing MoonMail registry, and open its first round.
4. Use isolated development funds for one small public contribution through
   actual stock Sapient; verify the on-chain entry, postbox, amount and message,
   plus interrupted-request reconciliation. Do not call a provider fixture a
   stock-wallet probe.
5. Populate the public configuration with genuine addresses and truthful
   evidence, then let the user push main to publish the feature. A live weekly
   prize/refund check needs the corresponding consensus deadline; native-engine
   payout tests do not replace it.

## Deployment configuration

`public/moon-pot.json` accepts a `deployment` matching the selected Esmeralda
office, containing `network`, `registry`, `template` (mail template),
`potTemplate`, `catalog`, `experimental` and the four explicit evidence flags
`engine`, `drawSecurity`, `stockSapient`, `livePayout`. Never invent an address or
mark stock-wallet/live evidence complete from a provider mock. Component reads
verify the expected pot template, ownerless rule, office identity, round schedule,
contribution sums and participant weights before enabling review. Indexer reads
use the existing deployment's endpoint and do not verify consensus proofs.
