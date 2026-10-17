# Activity and postbox setup

Postbox submission now stays in **My inbox**. A notice distinguishes submission,
confirmation and rejection; it never presents a submitted transaction as a
finished postbox. Read-only receipt checks run for a bounded two-minute period.
Once the original receipt confirms and the refreshed directory contains the
postbox, it is selected in the mailbox. Manual refresh and **View activity**
remain available. Recovery backup and registration still require their separate
wallet approvals; no additional approval is requested by confirmation checks.

Activity uses a compact navy layout with operation icons, readable status badges
and clickable summary cards to filter awaiting, completed and unsuccessful
actions. Search, action filters, pagination and original receipts remain
available. Confirmed letters say **Delivered**; other confirmed operations say
**Confirmed**. Delivery does not imply that a letter was read or independently
verify a gift's received amount. Uncertain outcomes retain their original-attempt
warnings and resume controls.

The history is local to this browser and selected office. Sample activity stays
explicitly fictional and cannot submit, resume or check real transactions.
Private letter contents are not added to Activity search or storage.

The regression checks exercise the shared postbox submission completion path
using a synthetic postbox edit, confirming it in the mailbox with one wallet
submission and no indexer writes. Summary filters leave the journal unchanged.
Actual two-step new-postbox setup retains its earlier checks and stock-wallet
evidence; this UI pass does not claim a new funded creation or deployment.
