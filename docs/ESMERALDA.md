# Esmeralda deployment status

On 2026-10-06, GhostDrop's two templates, registry and **three complete public letters** were deployed on the real Esmeralda network (38), using the official HTTPS indexer `https://ootle-indexer-a.tari.com/`. The application's public reader independently fetched all three subjects/bodies and validated the templates and owner rules. `public/deployment.json` now contains these confirmed identities; its spending evidence flags remain false.

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

1. Desktop/mobile public reading passes against this deployment, with all subjects/bodies compared. A separate credential-free probe from the existing Pages HTTPS origin also passes with only `deployment.json` overridden to these confirmed identities. This proves origin compatibility, not that the new configuration has been published. Do not repeat completed publication transactions.
2. Push the reviewed `main` checkpoint to trigger GitHub Pages, then verify the deployed HTTPS site reads the same public letters.
3. Verify actual Esmeralda guest gifts, daemon scopes, recovery and authenticated hosted-wallet transport before enabling the corresponding spending gates. Existing isolated-chain tests do not substitute for those checks. The standard-wallet postbox adapter and secure browser connection remain pending.

The local-only deployment command retains its localnet restriction. Deployment preparation and wallet state for this particular authorized testnet run are stored in the development environment, outside the clone.
