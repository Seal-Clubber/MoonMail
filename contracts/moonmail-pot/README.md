# Moon Pot — experimental testnet template

This additive template implements a weighted community pot using the current
MoonMail office's registered postboxes. It does not replace the deployed mail
template, move old letters or change mailbox recovery. No deployment is recorded
yet. The production site's `public/moon-pot.json` deliberately has a null
deployment until publication and stock Sapient checks are completed.

**This is an experimental draw, not verified fair randomness.** The user opted
to prepare an explicitly labelled Esmeralda-only experiment after reviewing this
limitation. Do not set `drawSecurity` or `livePayout` evidence to true based on
engine tests. The future epoch hash can be influenced by L1 miners, and a safe
margin against oracle lag has not been established. See the
[application notes](../../docs/moon-pot.md).

## Rules enforced by the template

- Creation permits test networks only. The website additionally restricts
  configuration and transaction building to Esmeralda (network 38).
- A catalog creates separate round components on a fixed 504-epoch schedule,
  approximately weekly at the expected network pace. Consensus progress, not
  wall-clock time, determines the actual deadlines.
- Contributions close six epochs before the predetermined draw epoch. The
  six-epoch buffer is experimental and is not a proven security bound.
- A postbox's controller must sign each contribution. Funds must be native
  TARI; the minimum entry is 0.1 TARI, with a 1,000-TARI pot cap and at most
  128 entries per round. Each public message is 1–512 UTF-8 bytes.
- Repeated contributions from one postbox add to its weight. Separate postboxes
  do not create free tickets: weight always comes from contributed amounts.
- The draw uses the fixed consensus epoch hash, round identity and domain
  separation, followed by rejection sampling. Transaction hashes, caller-chosen
  salts and browser randomness do not select the result.
- Any wallet can submit the draw during that one epoch. A later epoch cannot be
  substituted. There is no scheduler backend: someone must submit a transaction
  while the fixed window is open.
- The winning controller can withdraw the entire contributed pot into a built-in
  account once. Transaction fees are funded separately. There is no house cut.
- If the draw window is missed, each contributing controller can reclaim its
  own postbox's aggregate contribution once. A completed draw cannot be refunded.
- The catalog and round components have no owner or privileged withdrawal path.

## Verification

The engine tests in `contracts/tests/pot` exercise actual native engine deposits,
authorization, cutoff enforcement, weighted participant selection, prize payout,
replay prevention, expired-round refunds and round creation. They do not prove
unbiased entropy, stock Sapient execution or a live Esmeralda payout.

```sh
cargo build --manifest-path contracts/moonmail-pot/Cargo.toml --target wasm32-unknown-unknown --release --locked
cargo test --manifest-path contracts/tests/pot/Cargo.toml --locked
```
