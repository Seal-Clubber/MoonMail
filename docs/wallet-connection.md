# Connecting Sapient

Open **Connect wallet** from any MoonMail screen. The same dialog is used when
you connect from Compose, your inbox or a gift reader.

- **Sapient not detected:** use **Get Sapient wallet** to open its official
  download page. Install and enable it in the browser you use for MoonMail,
  create or restore your wallet, then return and choose **Check again**. A new
  installation may need a page reload. Private browsing and phones need a
  browser that supports the extension and allows it on this site.
- **Sapient detected:** unlock the wallet, select the account on the office's
  network (normally Esmeralda testnet), then choose **Connect Sapient**. Detection
  means the provider is present; it does not mean the wallet is unlocked.
- **Waiting for approval:** finish the connection request in Sapient. The button
  stays disabled to prevent duplicate requests. You can close MoonMail's dialog;
  an approval that arrives after closing it will not connect the page. Closing
  the dialog does not cancel an already open wallet prompt.
- **Connection problem:** the dialog explains the next step for a locked wallet,
  declined request, wrong network, pending request, timeout or update requirement.
  Retry only after resolving the prompt or wallet state. No transaction is sent
  by connecting.
- **Connected:** **Wallet details** shows the network, receiving address and
  public balance, with copying and disconnection controls. Disconnect clears
  private page state. Valid existing grants can be reused after a reload;
  connection and private-view access are still separate permissions.

Connecting shares the selected wallet address. Private mail recovery requires a
separate **account-wide view grant**, which can expose private amounts and memos
for resources beyond MoonMail. Spending always needs its own wallet approval.
MoonMail never asks for a wallet recovery phrase. Public letters and private
links can be opened without connecting.

The dialog keeps the moonlit navy theme, readable contrast, keyboard focus trap
and Escape/focus restoration. The GUI checks use synthetic providers to exercise
these states without private-view or spending requests. Existing stock-Sapient
evidence is documented in the [integration guide](SAPIENT-INTEGRATION.md); this
UI change does not add wallet APIs, change contracts or claim new funded testing.

## Verification

The 17 October 2026 refresh passed strict TypeScript, the Pages-base production
build, 270 unit tests and all 316 desktop/mobile browser checks. Eight new browser
cases cover missing/late providers, safe external links, actionable connection
errors (including provider error codes), successful connection, pending-request
locking and ignored late approval after dismissal. Layout and contrast checks
cover 320, 390, 768 and 1440 pixels, including the waiting button. Existing tests
retain keyboard focus/Escape behaviour, grant recovery and public-only wallet
details. New connection tests request no private-view or spending permission;
no funded live wallet test or public broadcast was performed for this UI change.
