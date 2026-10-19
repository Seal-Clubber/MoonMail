# The public hall

Public mail uses MoonMail's moonlit navy theme, compact header, search and
card/list controls. Cards show public subjects and excerpts alongside gift
availability. Reading a letter never collects its gift.

## Visibility and controls

- The listing, search results and loaded count include **public letters only**.
  Encrypted private-link invitations and personal postbox letters are omitted.
  This applies to both the live hall and its explicitly fictional preview.
- Private links still open their letters directly, including in an already-open
  MoonMail tab. Personal postboxes and their messages remain in My inbox.
- Two filters show **All public mail** or uncollected **Public gifts**. Card/list
  switches preserve search and pagination. The footer note uses consistent icons,
  readable spacing and a direct shortcut to personal postboxes.
- Additional chain pages extend search; unavailable entries retain a retry notice.
  Counts describe loaded, verified public mail. The client does not invent dates
  or unread states for the public hall.
- Writing preserves encrypted defaults and the explicit confirmation required
  before public publication. Wallet permissions, gift confirmation, recovery and
  contract rules are unchanged.

Omitting invitations from the interface does not remove their public chain
records or make their metadata anonymous. The private link remains necessary to
decrypt the letter and authorize an available private-link gift.

## Verification

The 19 October 2026 refresh passed strict TypeScript, the Pages-base build,
284 unit tests and all 330 desktop/mobile browser checks. Layout, contrast and
overflow checks cover 320, 390, 768 and 1440 pixels. A 101-entry ledger fixture
mixes public, link and postbox records; only the public entries appear in either
layout, counts or search. The preview contains 20 public examples. It has no
funded mail and cannot authorize claims.

The [earlier GUI evidence](public-mail-gui-evidence.json) records the previous
broader public/link listing and its read-only Esmeralda checks. It is historical
evidence, not a new deployment or funded test of this listing change. GitHub
pushes remain user-controlled; local screenshots and helpers stay outside the repo.
