# Demo walkthrough

## Available now

1. `pnpm dev`: enter as a guest, without connecting a wallet.
2. Read the real Esmeralda public letters without a wallet. Open Ghost View, close with Escape, and switch between scene and list views. Check a narrow viewport and reduced-motion preference. Refresh retries a temporary indexer failure. The explicitly labelled visual preview is available when no registry is configured.
3. Write a private-link letter; review to run real device encryption with official Tari WASM. Open **Connect Sapient**, approve the account in your wallet, and confirm the draft survives. No daemon URL, API key or file import is requested. Sapient sending is enabled in the reviewed source after a funded text-only public proof. Review gift, reserve and the per-attempt publication cap before signing. Close/disconnect and check that private session state clears. Publication of the changed frontend still needs verification after the user's push.
4. Select addressed mail: the interface explains pending Sapient postbox recovery and requires a registered postbox. Addressed actions remain disabled by their recovery gate.
5. Public and private-link collection passes real Esmeralda browser and stock-recipient payout/spend checks. The six proof gifts have already been collected. A newly funded gift can be collected without a wallet connection using an existing account component and matching address, or by selecting **Create a new receiving account** with only a fresh Ootle address. Its gift reserve covers creation and collection fees. Opening a letter performs no claim.
6. Run the real engine tests and SDK bridge tests from README. These enforce fee/authority/replay rules and addressed controllers; the public-network proof is recorded separately in the evidence documents.

## After deployment evidence is complete

1. Sender opens the site in a browser with Sapient, unlocks the wallet, chooses its funded Ootle account, and approves **Connect Sapient**. Compose public or link mail. Replies remain unchecked unless a supported owned postbox is selected.
2. Review gift, additional fee reserve and publication cap. Save the pending private link before funding. Submit once, reconcile confirmation, and copy the confirmed fragment link.
3. Open a separate browser without a wallet connection. Read public mail or decrypt the link locally. Opening performs no claim. Enter a checksummed same-network Ootle address and existing built-in account component, review full payout/reserve, and explicitly collect.
4. Confirm the receiving wallet discovers and can spend the payout. Verify that a second collection fails, a wrong link cannot decrypt/claim, and a changed destination invalidates an existing signature.
5. Open the same static build from a second HTTPS host with identical public deployment configuration and compatible indexer. Turn off the first host. Existing mail and gifts remain accessible on Ootle; private access still requires the saved fragment.
6. Postboxes require a supported and independently restored Sapient recovery flow before enabling setup or addressed claims. Historical daemon setup records remain preserved, but do not prove Sapient compatibility. Once supported, test two IDs with duplicate nicknames, edits, addressed mail, a second-client inbox, key rotation and historical decryption. Never repeat an uncertain transaction. See [Sapient's current recovery blocker](SAPIENT.md#postbox-recovery-remains-incomplete).

Never put private links into screenshots, issue reports, logs or analytics. Use isolated test assets and dedicated demo wallets.
