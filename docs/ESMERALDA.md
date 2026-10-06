# Esmeralda deployment status

On 2026-10-06, GhostDrop's two templates, registry and **three complete public letters** were deployed on the real Esmeralda network (38), using the official HTTPS indexer `https://ootle-indexer-a.tari.com/`. The application's public reader independently fetched all three subjects/bodies and validated the templates and owner rules. `public/deployment.json` now contains these confirmed identities. Engine and guest-delivery gates are verified; sending and postbox actions retain their unverified wallet gates.

| Identity            | Confirmed address                                                            |
| ------------------- | ---------------------------------------------------------------------------- |
| Registry            | `component_2afdeb8728a3ffbf04da19218964243c63cd63e9d77ca5b7877e4dd29873b4b7` |
| PostOffice template | `91d80c4d98d9b53cf3327952980a4b797d2896701fbe11c2f1d951c2cf922d62`           |
| Envelope template   | `51d3ff2985c2fea21b9517606beaeee2fb5f823b0bbd89478727a75ca7484f49`           |

The letters are **A ghost has arrived on Esmeralda**, **Mail that lives on the ledger** and **About wallet-controlled postboxes**. They contain no gifts or fee reserves. [Public deployment evidence](esmeralda-deployment-evidence.json) records their components, complete contents, accepted transaction IDs, actual paid fees and artifact hashes. Published template addresses were extracted from accepted receipts; artifact hashes alone are not their identities.

The initial L2 faucet was empty, so its account-creation/faucet simulation rejected with `InsufficientFunds`. Funding was subsequently obtained through the L1 faucet and burn route below. Every deployment transaction was simulated before submission. Temporary local API keys were issued and revoked through the development wallet's authenticated UI; seeds, wallet stores, credentials and operational journals remain outside this repository.

## Development funding receipts

The deployment uses this disposable Esmeralda wallet; no additional funding transfer is required for the completed publication:

```text
otl_esm_1l2v5lxv7xsjhg8mtp3xm9zpwqwzsh9s4pdhljqwlc7x0u0r4j5rf4s242sf9r5w5jtw4r79dyvudzjmjydht60gtxfjcvvypmspc6vqyl8glr
```

Its account component is:

```text
component_66132ae4e184b246368048309672f34c551548e66acb876734e47c276284b9ec
```

This address belongs to a task-specific development wallet, not a personal wallet. The [official wallet documentation](https://github.com/tari-project/ootle-wallet-cli#get-testnet-funds) describes faucet funding; the official wallet UI suggests L1 burn claims when the L2 faucet is empty. No personal seed or API key was shared with the faucet or website.

### Alternative L1 faucet and burn claim

The user-supplied [Esmeralda tXTM faucet](https://testnet-faucet.supportxtm.com/) is a separate L1 faucet. On 2026-10-06 it reported a successful **10,000 test XTM** send to a new disposable Minotari development wallet, with faucet transaction ID `6382880209977150378`. That is the sender's reported transaction ID, not an Ootle transaction. Receiving-wallet checks independently showed the incoming transfer, then **10,000 test XTM available** at scanned height `952871`.

Exactly **30 test XTM** was subsequently burned to the preserved Ootle account's public key. The L1 wallet returned transaction ID `10619409634625873011` and commitment `7af8d309d2be20ec5ade905d55ddcbf41604aab737740ada958f33eb6079556c`. Its native proof includes a burn output proof and reports mined epoch `11910`; its value and claim key were checked against the submitted amount and saved account. At observed L2 epoch **11926**, the Ootle claim was accepted as `3cc7d318751d64ab881c5e25bf75a30647c91b2ae7b20202a9ab0431836e80f5`. The wallet recovered **29.986762 tTARI** after the claim fee, then revealed **29 tTARI** in the same account with a 0.1 tTARI fee cap. Public evidence is recorded in [esmeralda-funding-evidence.json](esmeralda-funding-evidence.json).

The official [burn guide](https://ootle.tari.com/guides/burn-minotari/) describes converting Esmeralda L1 Minotari into Ootle TARI. Both task wallets used Esmeralda. The completed burn specified this account's **public claim destination key**, leaving the sidechain deployment key empty:

```text
fa994f999e3425741f6b0c4db2882e03850b96150b6ff901dfc78cfe3c759506
```

This public key was read from the preserved development account corresponding to the component above. It is not the `otl_…` address. The native protocol derives the final stealth claim key from the burn's public nonce and the controlling wallet key. Confirmation, proof validation, claim receipt and received balance were checked separately. Do not repeat this completed burn or faucet request.

The official Minotari Esmeralda console wallet 6.0.1 was downloaded and verified against its published SHA256. Its encrypted disposable store, RPC client, request journal and burn-proof directory are local development files outside this repository. They are deployment tools, not software GhostDrop visitors need to install. Resume the existing wallets and proof; do not request another faucet payout or burn again for this deployment.

The publication plan capped each template at 10 tTARI, registry creation at 1 tTARI and each public letter at 1 tTARI, for at most 24 tTARI. Actual paid publication fees totaled **2.184726 tTARI** across the two templates, registry and three letters. The separate funding claim and reveal fees are recorded in their receipts.

## Remaining verification and publication

Public and private-link gift proofs also committed on Esmeralda. Each SDK proof deposited exactly 2 tTARI into an initially unfunded independent stock-wallet account, then spent part of that payout. The sender paid for that account's initial on-chain creation. A second pair used the actual GhostDrop production UI: desktop public claim and mobile private-link claim, with no wallet connection or credential. The stock recipient independently discovered their combined 4 tTARI and committed another spend. All four proof gifts are now collected. The [curated gift evidence](esmeralda-gift-evidence.json) contains accepted IDs and checks, without private capabilities or letter plaintext.

The stock recipient used unmodified daemon 0.43.0. Its owner UI registration initially chose EdDSA despite the daemon permitting ES256/RSA. The test constrained its virtual authenticator to ES256; no daemon or RPC response was patched. This does not establish stock browser connection or physical-passkey onboarding.

1. Desktop/mobile public reading passes against this deployment, with all subjects/bodies compared. The user pushed `da995ff`; Pages and Verify both succeeded. All seven public frontend/config files match the reviewed production build, and the actual Pages default configuration reads the three original letters without interception. Do not repeat completed publication transactions. [Published-build evidence](pages-published-evidence.json) records hashes and workflow URLs.
2. Desktop public and mobile private-link gifts were collected through that actual hosted site without configuration/RPC overrides or wallet credentials. The independent stock recipient discovered exactly 1 test TARI per gift and committed a proof spend from each. Five further public gifts, each 1 test TARI plus a 0.1 collection reserve, were visible and unclaimed during final verification. Availability can decrease as visitors collect; no replenishment worker remains. [Hosted proof](esmeralda-hosted-evidence.json) omits the private capability and plaintext.
3. Real Esmeralda guest collection and stock-recipient payout/spend are verified, including creation of new unfunded receiving accounts in the claim checkpoint. Verify deployment-specific daemon scopes, recovery and authenticated hosted-wallet transport before enabling sending/postbox gates. The standard-wallet postbox adapter and secure browser connection remain pending.

### Receiving without a pre-existing account

The **Create a new receiving account** option needs only a fresh Ootle address, with no account component, recipient funding or wallet connection. Native `CreateAccount` supplies the destination through the transaction workspace; GhostDrop does not implement its own account-address hashing. Creation, deposit, claimed state and fee payment share the fee checkpoint. Engine checks show that wrong private authority or an insufficient reserve rolls back both creation and the claim.

Desktop public and mobile private-link browser claims created two previously absent Esmeralda accounts. The independent unmodified stock wallet discovered exactly 2 tTARI in each, then spent part of each payout. [New-account evidence](esmeralda-account-creation-evidence.json) records their accepted receipts and verified ownership. This enables `guestAccountCreation` for the confirmed deployment. Both proof gifts are collected, bringing the total to six. Use this option for fresh addresses; existing accounts use the component-and-address path. No sender-created account was used in these two proofs.

The local-only deployment command retains its localnet restriction. Deployment preparation and wallet state for this particular authorized testnet run are stored in the development environment, outside the clone.

The public demo campaign capped six publications at 7.2 test TARI in total; a separate private-link proof capped another 1.2. Five public gifts remained after the hosted public claim. Bounded actor increments reused the keeper planner and retained all reservations across process restarts. The actual updated keeper CLI subsequently reported `claimable:5`, `outstanding:0`, `remaining:0`, `count:0` and exited without spending. Publishing new letters used the external development actor; this is not a claim that the CLI made those particular transactions. All task wallets were stopped after verification.
