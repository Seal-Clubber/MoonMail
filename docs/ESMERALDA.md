# Esmeralda deployment status

On 2026-10-06, a fresh isolated development wallet was connected to the real Esmeralda network (38), using the official HTTPS indexer `https://ootle-indexer-a.tari.com/`. The requested deployment is **waiting for test TARI funding**. No transaction has been broadcast, and no GhostDrop template or registry address is confirmed. `public/deployment.json` therefore keeps contract identities empty and write evidence false.

The faucet's verified vault state reports revealed and locked balances of zero. A simulated account-creation/faucet transaction rejected with `InsufficientFunds`: the fixed 1,000 tTARI payout required 1,000,000,000 microTARI and had zero available. Its required simulation fee was 179 microTARI. The temporary deployment API keys were issued and revoked through the local wallet's authenticated UI. Seeds, wallet stores, credentials and operational journals remain outside this repository.

## Funding the development wallet

Send **30 tTARI on Esmeralda**, using revealed/public funding, to the disposable deployment wallet:

```text
otl_esm_1l2v5lxv7xsjhg8mtp3xm9zpwqwzsh9s4pdhljqwlc7x0u0r4j5rf4s242sf9r5w5jtw4r79dyvudzjmjydht60gtxfjcvvypmspc6vqyl8glr
```

Its account component is:

```text
component_66132ae4e184b246368048309672f34c551548e66acb876734e47c276284b9ec
```

This address belongs to a task-specific development wallet, not a personal wallet. The local wallet can create or retrieve its account on chain when funding becomes available. A faucet refill would also resolve the funding issue. The [official wallet documentation](https://github.com/tari-project/ootle-wallet-cli#get-testnet-funds) describes faucet funding; the current official wallet UI suggests L1 burn claims when the faucet is empty. No personal seed or API key needs to be shared to transfer test funds.

### Alternative L1 faucet and burn claim

The user-supplied [Esmeralda tXTM faucet](https://testnet-faucet.supportxtm.com/) is a separate L1 faucet. On 2026-10-06 it reported a successful **10,000 test XTM** send to a new disposable Minotari development wallet, with faucet transaction ID `6382880209977150378`. That is the sender's reported transaction ID, not an Ootle transaction. Receiving-wallet checks independently showed the incoming transfer, then **10,000 test XTM available** at scanned height `952871`.

Exactly **30 test XTM** was subsequently burned to the preserved Ootle account's public key. The L1 wallet returned transaction ID `10619409634625873011` and commitment `7af8d309d2be20ec5ade905d55ddcbf41604aab737740ada958f33eb6079556c`. Its native proof includes a burn output proof and reports mined epoch `11910`; its value and claim key were checked against the submitted amount and saved account. The Ootle daemon successfully parsed this proof and queued it for claiming at L2 epoch **11911**. The public indexer last reported epoch **11909**, so the L2 claim and deployment funding remain pending. Public evidence is recorded in [esmeralda-funding-evidence.json](esmeralda-funding-evidence.json). Both task wallets were stopped for handoff with stores and proof preserved; no claim worker remains running.

The official [burn guide](https://ootle.tari.com/guides/burn-minotari/) describes converting Esmeralda L1 Minotari into Ootle TARI. Both wallets must use Esmeralda. After confirming spendable L1 funds, burn only the bounded deployment amount to this Ootle account's **public claim key**, leaving the sidechain deployment key empty:

```text
fa994f999e3425741f6b0c4db2882e03850b96150b6ff901dfc78cfe3c759506
```

This public key was read from the preserved development account corresponding to the component above. It is not the `otl_…` address. Burning 30 test XTM should provide approximately 30 test TARI before the Ootle claim fee; verify the final balance rather than assume the amount is sufficient. Confirm the burn on L1, preserve its proof and commitment, and claim through the Ootle wallet. The guide estimates the Esmeralda confirmation window at under an hour. Do not repeat a burn or faucet request after an uncertain response.

The official Minotari Esmeralda console wallet 6.0.1 was downloaded and verified against its published SHA256. Its encrypted disposable store, RPC client, request journal and burn-proof directory are local development files outside this repository. They are deployment tools, not software GhostDrop visitors need to install. Resume the existing wallets and proof; do not request another faucet payout or burn again for this deployment.

The prepared plan caps each template publication at 10 tTARI, registry creation at 1 tTARI and each of three public demonstration letters at 1 tTARI, for at most 24 tTARI across those operations. Actual fees must first pass dry runs. These are caps, not an assertion of the final fees. The demonstration letters have no gifts or fee reserves.

## Completing deployment

1. Confirm revealed native test TARI funding in the preserved development wallet, or rerun the faucet dry run after a refill. Do not repeat an uncertain submission.
2. Dry-run and publish the Envelope and PostOffice release WASM. Confirm both transaction receipts and extract the actual `template_…` identities from accepted output. Artifact fingerprints are not template addresses, because the wallet optimizes WASM.
3. Create the registry with network byte 38 and the confirmed Envelope template. Confirm its PostOffice template and owner rule `None` through the public indexer.
4. Publish three text-only public letters, each capped at 1 tTARI in fees. Verify full subjects/bodies through GhostDrop's real indexer reader without a wallet connection.
5. Commit the confirmed registry, PostOffice template and Envelope template to `public/deployment.json`, plus public receipt evidence. Keep spending evidence false until deployment-specific delivery and transport checks pass.
6. Push the reviewed `main` checkpoint to trigger the existing GitHub Pages workflow. Check the deployed HTTPS site reads the same public letters.

The local-only deployment command retains its localnet restriction. Deployment preparation and wallet state for this particular authorized testnet run are stored in the development environment, outside the clone.
