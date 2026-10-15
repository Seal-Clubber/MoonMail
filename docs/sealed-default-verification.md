# Sealed mailbox release verification — 15 October 2026

MoonMail now opens the verified V4 sealed Esmeralda mailbox directly. Old testnet offices are not selectable or migrated; an old saved office choice is ignored. Earlier app versions remain in backup branches. Incoming current-office invitations and guest letter links work directly. Unknown/old contexts cannot switch the active office or gain evidence.

Native private payments by encrypted request are enabled after their separate [real funded campaign](private-payment-evidence.json). The disabled public-gift field is absent from private Compose. Public/private-link gifts retain their explicit separate mode. Payment-card controls were corrected for readable contrast, including the nested parchment reader and review state.

The [final evidence record](sealed-default-evidence.json) pins runtime source `24d5c8714ca86f426543060b8c2c4c8cd764e8a1` and all twelve build files. Documentation-only commits after that checkpoint do not change the accepted runtime.

## Final verification

- 266 client tests across 31 files, strict TypeScript and Pages-base production build pass. Two obsolete office-choice unit tests were removed with their unused module.
- All 286 desktop/mobile browser cases passed at the single-default checkpoint `fc94697`. After restoring the direct privacy shortcut in the mailbox and Settings, all 60 affected cases passed again at the final runtime `24d5c87`. These checks include sealed single-default behavior with stale preferences, direct invitations, safe rejection of old contexts, existing mailbox/public-link regressions and private-payment review contrast.
- All 47 native Ootle 0.46 engine checks pass, including the three SDK bridge cases enabled explicitly. The encrypted payment request round-trips through actual V4 engine persistence and both Inbox/Sent codecs.
- Unmodified stock Sapient 0.6.6 and actual Esmeralda reads verified the final local frontend on the Pages HTTPS origin. The independently restored test wallet opened real Inbox/Sent, recovered saved settings/favourites, and reused its actual private-view grant on reload with zero repeated permission requests.
- The actual payment receipt verified the exact output, amount and memo already recovered by that restored wallet. No transaction or spending request was made. Screenshots at 1440/390 pixels were inspected for readability and overflow.
- Fresh guest browsers with no wallet opened the real current-office public and private-link letters directly; the private capability was scrubbed from the address bar. No ledger responses were mocked.
- The complete final read-only acceptance created zero financial requests/broadcasts. Development browser contexts closed afterwards. No new operator, bridge, funding transfer, template publication or personal-wallet operation occurred.
- Privacy scans covered 289 repository/build files against 40 historical private values, 11 sealed-mail private values and nine private-payment test values. No matches or tracked local development files were found.

The first browser run passed 284/286: a new contrast assertion incorrectly searched for an exact text label containing a currency suffix. The locator was corrected; the measured contrast assertions remain, and the full suite passed. The first engine run used a WSL helper path with Windows Node; correcting the local runner paths enabled the full 47 checks. A guest acceptance assertion also raced app loading after removal of the office chooser; it now waits for actual URL scrubbing. Failure reports are preserved outside the repository. None of these corrections repeated a financial transaction.

## Publication and limits

The agent has not pushed or dispatched Pages. The user can push `main`; the existing Pages workflow tests/builds and publishes `/MoonMail/` over HTTPS. These results verify a local build using the real ledger, not an already published Pages deployment. A read-only deployed-asset comparison remains appropriate after the user pushes.

Reading permission is separate from every spending approval. Payments use an encrypted request and three approvals; they are not atomic gifts. Payment may succeed before receipt delivery. If the original wallet installation and missing result are both lost, automatic payment discovery is not guaranteed. The current UI does not offer unsolicited native private gifts without a request. Public gifts remain public. Signers, timing, fees, output commitments, office/opaque IDs, padding buckets and public registrations remain observable. Discovery and office capacity are bounded; MoonMail does not claim anonymity or production-scale email service.
