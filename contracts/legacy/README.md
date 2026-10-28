# Historical templates

These implementations remain available for reproducibility and native engine
regression tests. The current website uses [MoonMail V4](../moonmail-v4/README.md),
not these older offices. No legacy testnet mail migration is implied.

| Template                    | Original path                | Current source                        |
| --------------------------- | ---------------------------- | ------------------------------------- |
| Original office             | `contracts/ghostdrop`        | [ghostdrop](ghostdrop/)               |
| Original envelope           | `contracts/envelope`         | [envelope](envelope/)                 |
| Proof-based postbox office  | `contracts/ghostdrop-v2`     | [ghostdrop-v2](ghostdrop-v2/)         |
| Proof-based envelope        | `contracts/envelope-v2`      | [envelope-v2](envelope-v2/)           |
| Unified office              | `contracts/ghostdrop-v3`     | [ghostdrop-v3](ghostdrop-v3/)         |
| Standalone recovery capsule | `contracts/recovery-capsule` | [recovery-capsule](recovery-capsule/) |

The engine suites formerly at `contracts/engine-tests`,
`contracts/postbox-claim-tests` and `contracts/capsule-tests` now live at
`contracts/tests/legacy-mail`, `contracts/tests/mailbox` and
`contracts/tests/recovery`, respectively. Each crate keeps its package name and
a committed lockfile. The regression copies now rebuild against template-lib 0.35 for Ootle
0.47, including its changed native ABI. Their contract logic is preserved; the
rebuilt binaries have new identities and are not substitutions for published
templates. Original dependency pins remain in the backup branches. Historical
evidence records retain the paths and versions tested at the time; current
instructions and CI use the new layout.
