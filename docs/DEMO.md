# Demo walkthrough

## Available now

1. `pnpm dev`: enter as a guest, without connecting a wallet.
2. Read the real Esmeralda public letters without a wallet. Open Ghost View, close with Escape, and switch between scene and list views. Check a narrow viewport and reduced-motion preference. Refresh retries a temporary indexer failure. The explicitly labelled visual preview is available when no registry is configured.
3. Write a private-link letter; review to run real device encryption with official Tari WASM. The funding button explains the missing live deployment evidence. Connect/close the daemon form and confirm the draft survives while the API-key field clears.
4. Select addressed mail: the interface explains the local wallet extension and requires a registered postbox. Sending and addressed actions remain disabled by pending wallet transport/recovery evidence.
5. Public and private-link collection passes real Esmeralda browser and stock-recipient payout/spend checks. The four proof gifts have already been collected. A newly funded gift can be collected without a wallet connection by entering an existing built-in account component and its matching Ootle receiving address. Opening a letter performs no claim.
6. Run the real engine tests and SDK bridge tests from README. These enforce fee/authority/replay rules and addressed controllers; the public-network proof is recorded separately in the evidence documents.

## After deployment evidence is complete

1. Sender connects an isolated supported Ootle daemon using a short-lived spending API key, explicitly selects a funding account, and composes public or link mail. Replies remain unchecked unless an owned postbox is selected.
2. Review gift, additional fee reserve and publication cap. Save the pending private link before funding. Submit once, reconcile confirmation, and copy the confirmed fragment link.
3. Open a separate browser without a wallet connection. Read public mail or decrypt the link locally. Opening performs no claim. Enter a checksummed same-network Ootle address and existing built-in account component, review full payout/reserve, and explicitly collect.
4. Confirm the receiving wallet discovers and can spend the payout. Verify that a second collection fails, a wrong link cannot decrypt/claim, and a changed destination invalidates an existing signature.
5. Open the same static build from a second HTTPS host with identical public deployment configuration and compatible indexer. Turn off the first host. Existing mail and gifts remain accessible on Ootle; private access still requires the saved fragment.
6. With the pinned wallet extension, connect the controlling account, create two postboxes with distinct IDs and the same nickname, edit listing/nickname, then publish a letter to either ID. Open its inbox from a second client; rotate the advertised key and open the older letter again. Explicitly collect using the controlling account, with an independently selected compatible payout destination. These flows have isolated-chain evidence; repeat on the intended deployment before enabling public writes.

Never put private links into screenshots, issue reports, logs or analytics. Use isolated test assets and dedicated demo wallets.
