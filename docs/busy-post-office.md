# A busy post office

The live Public mail hall reads the configured Ootle registry. Its list view shows each public subject, a short excerpt, the audience and gift state. Sealed subjects stay hidden. Search and filters apply to loaded letters; pages show twelve at a time, with an explicit loaded count. Addressed letters belong in the controlling wallet's inbox.

Activity describes what each action does, whether its original transaction has a confirmed receipt, and what to do next. Search, action and status filters and twelve-item pages keep a long history usable. Saved start times describe the original attempt, not a later status check. Older records explicitly say when their start time was not saved. A confirmed recovery backup is the first of the two postbox approvals. An old claim without a transaction receipt never proves a payout.

Activity belongs to this browser and the selected post office. It is not a reconstructed wallet-wide transaction history. Reading a receipt and resuming the same saved Sapient request are separate actions. Uncertain outcomes retain the original attempt and do not permit replacement broadcasts.

Optional sample mail and sample Activity are clearly labelled fictional design examples. They never enter the real journal or offer gift collection. Real Esmeralda mail must be published and confirmed on the configured registry; sample counts are not testnet publication evidence.

## Validation

The initial refinement passes 184 client tests, 218 desktop/mobile browser checks, strict TypeScript, the Pages-base production build and formatting/diff checks. Coverage includes 36-letter pagination, all audiences, 28-action Activity pagination and filters, legacy unreceipted claims, 320-pixel layouts, and a delayed real registry response while a sample modal is open. The latter cannot turn a sample gift into a live claim.

## Real Esmeralda mail

The current registry has 41 actual letters, including 33 public-hall envelopes across three pages. The busy-office campaign added 20 public letters, 10 encrypted private-link letters and six letters to the existing development recovery postbox. All 36 publications have actual commit receipts and state reads. Four gifts contain 0.025 test TARI with a separate 0.025 collection reserve; one public and one private-link gift were collected into the isolated recipient, with the full amounts verified in its balance. Two remain available.

The source spent 0.494788 test TARI, below the 0.632 cap. Exactly 38 broadcasts were sent, including the two claims. No bridge, burn, top-up, personal wallet or additional contract deployment was used. Private bearer links remain encrypted outside this repository. The original closed campaigns were preserved.

See [public receipt and reading evidence](busy-esmeralda-mail-evidence.json). Local production reading checks use the real Esmeralda indexer and unmodified stock Sapient 0.6.6: desktop, 390- and 320-pixel list/public reading; collected and available private-link reading without a wallet; all six addressed letters decrypted by the restored controlling wallet; and the sender's 36 original confirmed Activity records. Application assets were served locally for this reviewed UI check; the mail itself is on the public Esmeralda ledger.

Completed letter and gift actions keep a concise confirmation visible, with next steps under their transaction details. Uncertain actions and recovery-backup steps keep the guidance visible. Turning a page moves keyboard focus to its updated result range.

The already published HTTPS site independently passed a fresh read-only check: all 33 hall letters across three pages on desktop and mobile, the new collected public gift's exact body, and both a collected and available new private-link letter. No wallet, app/ledger overrides or broadcasts were used. The existing hosted frontend has its older layout until the human pushes the UI checkpoints; testnet mail does not wait for that push.

Expanded Activity details also show the stored letter type, original gift amount and original collection reserve. These amounts come from the selected registry's decoded letter, without exposing sealed subjects or bodies. They are labelled separately from actual receipt fees, remaining reserve and destination/payout evidence. Final validation includes 184 client tests and 220 desktop/mobile browser checks; new checks measure small list, status and funding text at a minimum contrast ratio of 4.5:1.
