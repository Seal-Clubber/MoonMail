# Faucet Keeper

The keeper is a separate local donor program. It counts only confirmed unclaimed **public** envelopes in its campaign with at least the configured gift and reserve. Target is at least five, with an optional buffer; rapid claims can temporarily reduce availability.

Copy `keeper.config.example.json` to ignored `keeper.config.json`. Values are whole µTARI. The example reserves a conservative 3,000,000 µTARI per new gift (gift + reserve + maximum publication fee), with an 18,000,000 total budget. It runs one submission at a time. `concurrency` limits outstanding new work per increment, up to four; submissions in that increment are sent serially.

```sh
pnpm keeper -- keeper.config.json --once
```

This is a read-only plan by default. An empty deployment exits without spending. To run against a verified deployment, provide a **dedicated donor** daemon through process environment variables `GHOSTDROP_DONOR_URL`, `GHOSTDROP_DONOR_API_KEY` and an explicit `GHOSTDROP_DONOR_ACCOUNT` component. Never embed these in the static site or Actions.

```sh
pnpm keeper -- keeper.config.json --run --once
# Explicit long-running replenishment (stop using Ctrl+C):
pnpm keeper -- keeper.config.json --run
```

Spending requires the same evidence gates as public publication. Bounded isolated-localnet `--run --once` tests used a fresh dedicated donor, funded five gifts, retained the journal on restart, refilled after collection and stopped at the fixed budget. No ongoing worker remains. It checks all registry pages before planning, persists reservations before broadcast and atomically renames its journal. Network, registry and campaign must match on restart. Unknown/prepared submissions retain their full budget reservation and block replacement. Any ambiguous broadcast stops new spending. A rejected/fee-only transaction is held conservatively until its actual costs and chain state are inspected.

Keep `.keeper-state.json` backed up locally with the donor process. Do not delete it to restart or reuse it for another deployment. Reconcile recorded envelope/transaction IDs and donor balances first. The budget measures this journal's spending, not unrelated transactions made with the donor credential. Treat confirmed reservations as consumed budget even after gifts are claimed. Ctrl+C stops after the current bounded submission; disconnecting does not revoke the daemon API key. Stopping the keeper leaves funded envelopes independently claimable.
