# The public hall

Public mail shares MoonMail's moonlit navy styling with a compact header, small
MoonMail illustration, card/list controls and direct search filters. The large
clerk and its quote are removed. Cards show a public subject/excerpt, letter type
and available/collected gift state; list rows retain the same information. The
paper reader explains that reading never collects a gift. The guest account-creation
checkbox now keeps its normal size.

## Visibility and controls

- Public letters open without a wallet. Private-link invitations stay sealed and
  require their complete private link; their real contents are never publicly searched.
- Private postbox letters belong in My inbox. The live feed already excluded them;
  the public sample preview now excludes them too, including its old postbox filter.
  Postbox registrations remain public in the separate directory; this UI change
  does not make names or controllers secret.
- Filters cover all hall mail, public letters, uncollected public gifts and private-link
  invitations. Switching card/list layout preserves search, filter and page.
- Counts cover loaded, verified entries. Additional chain pages extend search;
  unavailable mail keeps its retry notice. Dates and unread states are not invented.
- Write a letter preserves Compose's privacy defaults and existing draft safeguards.
  Public publishing still requires an explicit public choice and acknowledgement.
  Reading never requests wallet access or spending. Collection review/confirmation
  and interrupted-operation recovery are unchanged.

## Verification

[Evidence](public-mail-gui-evidence.json) identifies the reviewed source. Strict
TypeScript, the Pages build, 270 unit tests/32 files and all 308 desktop/mobile
browser checks passed. Layouts were checked at 320, 390, 768 and 1440 pixels,
including cards/list, gift states, the reader, contrast, reduced motion and pagination.
A 101-entry browser ledger fixture includes public, link and postbox records;
postbox mail stays outside the hall. The preview now has 30 explicitly fictional
public/link examples; these are not funded real mail and cannot authorize claims.

A finite guest check used actual Esmeralda responses with the reviewed local build
on the Pages HTTPS origin. It loaded one public letter and one private-link invitation,
opened the public letter without a wallet and checked the phone list. There were zero
financial requests or broadcasts. This verifies real testnet reads, not publication of
the new frontend. Contracts and payment rules did not change. GitHub pushes remain
user-controlled; screenshots and local verification scripts stay outside this repo.
