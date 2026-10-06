# Sapient wallet integration

The website's wallet is [Sapient](https://sapient.tari.mw/), an Ootle browser extension. Visitors use GhostDrop and their normal Sapient wallet. The page detects Sapient's injected provider, asks for the selected account, and sends transaction requests to the wallet's approval popup. Financial seeds and signing keys stay in Sapient. There is no GhostDrop daemon, proxy, extra extension, credential entry or file import.

Public letters, private-link decryption and prepaid guest claims still work without connection. Connecting optionally provides the selected account and public receiving address. Switch accounts or networks in Sapient; reconnect GhostDrop after a change.

## Supported interface

The adapter follows [Sapient's official integration documentation](https://github.com/chironbuilds/tari-wallet/tree/7ad3c4f117a76c64d472fd371b7d75bbe297abec/docs/integration), source commit `7ad3c4f117a76c64d472fd371b7d75bbe297abec`, version 0.6.6. The verification used an unmodified source build, not a modified GhostDrop wallet. The installed store version must expose the same capabilities; runtime checks reject providers lacking transaction requests or receiving addresses. No runtime version is invented from the provider's name.

- Discover `window.tariProviders` or `window.tari` with `info.rdns === "mw.tari.sapient"`; handle late provider announcements.
- Check `tari_getNetwork` before `tari_requestAccounts`, then verify the selected component and checksummed public address. Esmeralda and Igor are supported by this adapter.
- Check `tari_getCapabilities`; recheck network, account and address before signing or resuming. Account-change events invalidate the session and clear private page state.
- Simulate through `tari_signAndSubmitTransaction` with `dryRun: true`. Require an accepted result and `finalize.total_fees_required` within the cap.
- Journal an uncertain attempt before `tari_createTransactionRequest`. Supply the original main instructions and inputs, an explicit `maxFee`, and enforced transparent fees. Sapient builds its own fee instructions and signs with its selected account.
- Save the public request ID and account before polling. Submit only the same approved ID through `tari_submitTransactionRequest`; recover its persisted status through `tari_getTransactionRequest` after reload. Never create a replacement for an uncertain submission.
- Disconnect locally and call `tari_disconnect` to remove the origin grant.

The journal contains public IDs, not seeds, private links, plaintext or encryption keys. A lost request-creation response remains blocked without a known wallet request ID. A failed/submitting wallet request is still uncertain: inspect wallet and chain history before a replacement. Sapient's SDK can internally retry input/version failures; `maxFee` is a per-transaction cap, not a guaranteed total across these wallet retries. GhostDrop does not add retries of its own.

## Verification and write gates

[Public verification record](sapient-connection-evidence.json): connection approval, real public registry reads through Sapient, draft preservation, a persisted request surviving reload, wallet rejection reconciled by GhostDrop, and origin disconnect. Both localhost and the actual Pages HTTPS origin passed. The HTTPS test substituted the reviewed local static assets in that isolated browser; no public RPC or wallet was mocked. It does not prove the changed source is published. The test request was intentionally rejected, and **zero public transactions were broadcast**.

Client tests additionally cover wrong network/account, fee rejection, lost creation/submit responses, reconnect, session invalidation and preventing gift-paid claims from being replaced with wallet-paid operations. Desktop/mobile regressions exercise the updated dialog and unchanged guest routes.

`sapientWallet` remains false in public configuration until a funded public/private-link publication, fee behavior and chain confirmation pass through the intended website/wallet flow. Legacy `daemonScopes` and `httpsWallet` flags do not authorize Sapient. Existing chain and guest evidence stays enabled. No contract redeployment is required for this adapter.

## Postbox recovery remains incomplete

The prior [native memo adapter](STANDARD-WALLET-POSTBOXES.md) requires a permanent, script-only `DenyAll` output and access to its historical decrypted memo after wallet restoration. Sapient's provider rejects raw `StealthTransfer` instructions. Its structured shield/payment operations and private-output summaries have not established this permanent carrier and independent historical recovery path. `tari_claimPrivatePayment` is wallet payment bookkeeping, not a proven arbitrary postbox decrypt operation.

Therefore new addressed mail, postbox setup and addressed claims remain gated. Existing descriptors and recovery implementations are preserved; the Sapient page does not silently change or rederive their keys. A browser-only local key, a public-signature-derived key or an ordinary spendable memo cannot satisfy the original recovery requirement. The next step is a supported stock Sapient primitive with permanent carrier creation, historical memo access, scoped permission and second-wallet restoration tests. No custom wallet build or extra local program is the visitor solution.

Legacy daemon code remains for optional donor/deployment tools and historical verification. It is not the website's connection route. The older [manual manifest candidate](WALLET-HANDOFF.md) is superseded for the current Sapient target.
