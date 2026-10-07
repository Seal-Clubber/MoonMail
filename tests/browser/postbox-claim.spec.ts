import { test, expect } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";

for (const protocol of ["sapient-proof-1", undefined] as const) {
  test(
    protocol
      ? "V2 postbox review explains exact payout and rejection broadcasts nothing"
      : "historical postbox gifts never promise proof collection",
    async ({ page }) => {
      // UI/provider/ledger fixtures only. Real wallet and engine evidence is separate.
      const owner = generateKeypair(),
        view = generateKeypair();
      const address = generateOotleAddress(
          owner.public_key,
          view.public_key,
          38,
        ),
        controller = Buffer.from(owner.public_key).toString("hex");
      owner.free();
      view.free();
      const account = `component_${"d".repeat(64)}`,
        child = `component_${"e".repeat(64)}`;
      const d = {
        ...emptyDeployment,
        network: 38,
        registry: `component_${"a".repeat(64)}`,
        template: "b".repeat(64),
        envelopeTemplate: "c".repeat(64),
        resource: `resource_${"01".repeat(32)}`,
        indexerUrl: "https://fixture-indexer.invalid/",
        postboxClaimProtocol: protocol,
        capsule: {
          template: "1".repeat(64),
          component: `component_${"2".repeat(64)}`,
          resource: `resource_${"3".repeat(64)}`,
        },
        evidence: {
          ...emptyDeployment.evidence,
          engineClaims: true,
          guestPayout: true,
          sapientWallet: true,
          mailboxRecovery: true,
          postboxClaims: true,
        },
      };
      const key = {
        version: "gd-postbox-1",
        keyVersion: 1,
        publicKey: "4".repeat(64),
        recovery: "sapient-capsule-1",
        capsule: { resource: d.capsule.resource, commitment: "5".repeat(64) },
      };
      const payload = {
        ...key,
        recipientKey: key.publicKey,
        ephemeralPublicKey: "6".repeat(64),
        iv: "fixture",
        ciphertext: "fixture",
      };
      await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
      let posts = 0;
      await page.route(`${d.indexerUrl}**`, (r) => {
        const path = new URL(r.request().url()).pathname;
        if (r.request().method() === "POST") {
          posts++;
          return r.abort();
        }
        if (path === "/network")
          return r.fulfill({
            json: { network: "Esmeralda", network_byte: 38, epoch: 100 },
          });
        if (path === "/epoch-manager/stats")
          return r.fulfill({ json: { current_epoch: 100 } });
        const registry = path.includes(d.registry),
          recipient = path.includes(account);
        const state = registry
          ? [
              38,
              { gift: child },
              { box: ["box", "Inbox", controller, JSON.stringify(key), true] },
              `template_${d.envelopeTemplate}`,
            ]
          : recipient
            ? []
            : [
                38,
                "gift",
                2,
                JSON.stringify(payload),
                "1000000",
                "100000",
                false,
                controller,
                "box",
                "",
                controller,
                "",
                `vault_${"7".repeat(64)}`,
                null,
                ...(protocol ? [d.registry] : []),
              ];
        return r.fulfill({
          json: {
            version: 0,
            substate: {
              Component: {
                header: {
                  template_address: registry
                    ? d.template
                    : recipient
                      ? "0".repeat(64)
                      : d.envelopeTemplate,
                  owner_rule: recipient ? { ByPublicKey: controller } : "None",
                },
                body: { state },
              },
            },
          },
        });
      });
      await page.addInitScript(
        ({ address, account }) => {
          const w = window as any;
          w.claimMethods = [];
          let connected = false;
          w.tari = {
            isTariWallet: true,
            info: {
              name: "Sapient fixture",
              rdns: "mw.tari.sapient",
              embedded: false,
            },
            request: async ({ method, params }: any) => {
              w.claimMethods.push({ method, params });
              if (method === "tari_getNetwork") return "esmeralda";
              if (method === "tari_requestAccounts") {
                connected = true;
                return [account];
              }
              if (method === "tari_getAccounts")
                return connected ? [account] : [];
              if (method === "tari_getWalletAddress") return address;
              if (method === "tari_getCapabilities")
                return {
                  transactionRequests: true,
                  walletAddress: true,
                  walletOwnershipProof: true,
                };
              if (method === "tari_getViewAccess") return { granted: false };
              if (method === "tari_signWalletOwnershipChallenge")
                return new Promise((_resolve, reject) => {
                  w.rejectClaim = () =>
                    reject(new Error("User declined the specific gift proof"));
                });
              throw new Error("Unexpected wallet call " + method);
            },
          };
        },
        { address, account },
      );
      await page.goto("./#/postboxes");
      await page
        .getByRole("button", { name: "Connect wallet", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Connect Sapient", exact: true })
        .click();
      await page
        .getByRole("combobox", { name: "My postboxes", exact: true })
        .selectOption("box");
      await page.getByRole("button", { name: /Sealed letter · gift/ }).click();
      const dialog = page.getByRole("dialog", {
        name: "A sealed little secret",
      });
      await expect(dialog).toBeVisible();
      const claim = dialog.getByRole("button", {
        name: "Review address & explicitly claim",
      });
      if (protocol) {
        await expect(dialog).toContainText("You receive 1000000 µTARI");
        await expect(dialog).toContainText("up to 100000 µTARI");
        await expect(dialog).toContainText("at most 10 network epochs");
        await dialog
          .getByRole("button", { name: "Choose from connected wallet" })
          .click();
        await expect(claim).toBeEnabled();
        await claim.click();
        await expect(
          dialog.getByRole("button", { name: "Use another address" }),
        ).toBeDisabled();
        await expect(
          dialog.getByRole("button", { name: "Choose from connected wallet" }),
        ).toBeDisabled();
        await expect(dialog.getByLabel("Receiving account")).toBeDisabled();
        await expect
          .poll(() => page.evaluate(() => typeof (window as any).rejectClaim))
          .toBe("function");
        await page.evaluate(() => (window as any).rejectClaim());
        await expect(page.getByRole("alert").first()).toContainText(
          "User declined",
        );
        const calls = await page.evaluate(() => (window as any).claimMethods);
        expect(
          calls.filter(
            (c: any) => c.method === "tari_signWalletOwnershipChallenge",
          ),
        ).toEqual([
          {
            method: "tari_signWalletOwnershipChallenge",
            params: {
              challenge: JSON.stringify([
                "gd-postbox-claim-1",
                38,
                d.registry,
                child,
                account,
                d.resource,
                "1000000",
                "100000",
                110,
              ]),
            },
          },
        ]);
        expect(
          calls.some(
            (c: any) =>
              c.method.includes("Transaction") ||
              c.method === "tari_requestViewAccess",
          ),
        ).toBe(false);
      } else {
        await expect(claim).toBeDisabled();
        await expect(dialog).toContainText("Postbox collection is not enabled");
        await expect(dialog).not.toContainText(
          "Your wallet needs no coins for this claim",
        );
      }
      expect(posts).toBe(0);
    },
  );
}
