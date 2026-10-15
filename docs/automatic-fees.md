# Automatic network fees

MoonMail uses the established default limits without asking newcomers to edit them: sending/postbox changes/mailbox saves up to 0.1 test TARI per attempt, recovery backups up to 1 test TARI, and native private payment steps up to 0.03 test TARI per step/attempt. Public/private-link gifts automatically include 0.1 test TARI for collection, separate from the amount the recipient receives. Read-only cost summaries remain visible before approval. These are limits/allowances, not guaranteed minimum prices; stock private fee processing can charge the full limit, including overcharge. Retries can incur another fee.

Routine fee editors are hidden. A verified Sapient pre-submission simulation that reports a higher required fee shows a warning and an **Adjust fee limit** action. It creates no wallet approval or transaction. Editing the limit closes the previous sending review; the user must review and approve again. MoonMail never automatically raises fees, sends a retry or switches funding sources.

Private postage is not simulated through the wallet's transparent legacy path. If an error occurs after a wallet request may exist, the warning instead directs the user to the original operation in Activity/Sapient. Its journal and request ID stay preserved. No fee editor is offered to replace an unknown, failed or rejected approval. A private payment resumed with the wrong local fee limit can restore the exact limit from its authenticated encrypted intent; it still resumes only the original wallet request.

Wallet fee-error text is used only for conservative classification, not displayed in the warning. An insufficient wallet balance, timeout or rejection is not proof that a fee limit should be raised. Fee checks do not grant private-view permission or spending approval. Public gift collection funds already locked in an existing letter cannot be changed through a fee editor.

## Verification — 15 October 2026

Runtime `ba4846fd997460f99fc211675416d7fad20b71fc` passed 269 client tests, strict TypeScript, the Pages-base build and all 290 desktop/mobile browser checks. Synthetic wallet tests cover pre-submission adjustment without automatic submission, readable warnings, private-payment fee failure without a replacement and resuming an original encrypted payment intent with its exact fee limit.

Unmodified stock Sapient 0.6.6 and real Esmeralda reads verified the final local frontend on the Pages HTTPS origin. Inbox/Sent, restored settings/favourites, reload permission reuse and verification of the existing private payment receipt passed; routine sending/mailbox fee editors were absent. This acceptance created no financial request/broadcast. It verifies a local build, not newly published Pages assets or a new deliberately underfunded chain transaction. The user controls the push.
