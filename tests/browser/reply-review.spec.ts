import { openDeliveryOptions } from "./support/composer";
import {
  chooseMailMode,
  connectFromVisibleControl,
  minimizeComposer,
} from "./support/composer";
import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { parseGiftLink } from "../../src/core/links";

// Public ledger and connection-only provider fixtures. No signing or submission.
const d = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  envelopeTemplate: "c".repeat(64),
  resource: `resource_${"01".repeat(32)}`,
  indexerUrl: "https://fixture-indexer.invalid/",
  evidence: {
    ...emptyDeployment.evidence,
    engineClaims: true,
    guestPayout: true,
    sapientWallet: true,
  },
};
const replyId = `reply-${"x".repeat(58)}`;
async function connectFixture(page: Page) {
  const owner = generateKeypair(),
    view = generateKeypair();
  const controller = Buffer.from(owner.public_key).toString("hex"),
    address = generateOotleAddress(owner.public_key, view.public_key, 38),
    account = `component_${"f".repeat(64)}`;
  owner.free();
  view.free();
  let writes = 0;
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    return r.fulfill({
      json: {
        substate: {
          Component: {
            header: { template_address: d.template, owner_rule: "None" },
            body: {
              state: [
                38,
                {},
                {
                  [replyId]: [
                    replyId,
                    "My Reply Home",
                    controller,
                    JSON.stringify({
                      version: "gd-postbox-1",
                      keyVersion: 1,
                      publicKey: "6".repeat(64),
                    }),
                    false,
                  ],
                },
                `template_${d.envelopeTemplate}`,
              ],
            },
          },
        },
      },
    });
  });
  await page.addInitScript(
    ({ address, account }) => {
      const w = window as any;
      w.walletCalls = [];
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: any) => {
          w.walletCalls.push(method);
          if (method === "tari_getNetwork") return "esmeralda";
          if (
            method === "tari_requestAccounts" ||
            method === "tari_getAccounts"
          )
            return [account];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_disconnect") return null;
          throw new Error("Fixture forbids wallet method " + method);
        },
      };
    },
    { address, account },
  );
  await page.goto("./#/compose");
  await chooseMailMode(page, "⌘ Private link");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  const toggle = page.getByRole("checkbox", {
    name: "Include my postbox for replies (optional)",
  });
  await expect(toggle).toBeEnabled();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Keep my reply choice");
  await page
    .getByLabel("Your letter")
    .fill("This letter has no gift and is never submitted.");
  return { toggle, writes: () => writes };
}

for (const initialReply of [false, true]) {
  test(`${initialReply ? "removing" : "adding"} a reply postbox invalidates the reviewed private link and saved acknowledgement`, async ({
    page,
  }) => {
    const fixture = await connectFixture(page);
    if (initialReply) await fixture.toggle.check();
    const review = page.locator(".review"),
      reviewButton = page.getByRole("button", {
        name: "Review letter",
        exact: false,
      }),
      saved = page.getByRole("checkbox", {
        name: "I saved my private link somewhere safe",
      }),
      publish = page.getByRole("button", {
        name: /Send encrypted letter|Publish publicly/,
      });
    await reviewButton.click();
    await expect(review).toBeVisible();
    const originalLink = await page
      .getByLabel("Private link to save", { exact: true })
      .inputValue();
    await saved.check();
    await expect(publish).toBeEnabled();
    await fixture.toggle.setChecked(!initialReply);
    await expect(review).toHaveCount(0);
    await expect(publish).toHaveCount(0);
    await expect(saved).toHaveCount(0);
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
      "Keep my reply choice",
    );
    if (!initialReply)
      await expect(page.getByLabel("Verified owned reply postbox")).toHaveValue(
        replyId,
      );
    else
      await expect(page.getByLabel("Verified owned reply postbox")).toHaveCount(
        0,
      );
    await reviewButton.click();
    await expect(review).toBeVisible();
    const currentLink = await page
      .getByLabel("Private link to save", { exact: true })
      .inputValue();
    const original = parseGiftLink(new URL(originalLink).hash)!,
      current = parseGiftLink(new URL(currentLink).hash)!;
    expect(current.id).not.toBe(original.id);
    expect(current.capability).not.toBe(original.capability);
    await expect(saved).not.toBeChecked();
    await expect(publish).toBeDisabled();
    const replies = review
      .locator(".receipt > div")
      .filter({ has: page.getByText("Replies", { exact: true }) });
    await expect(replies).toContainText(
      initialReply ? "No reply postbox" : replyId,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(fixture.writes()).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
    ).toBeNull();
    expect(
      (await page.evaluate(() => (window as any).walletCalls)).some(
        (method: string) =>
          /View|Transaction|Ownership|PrivatePayment/.test(method),
      ),
    ).toBe(false);
  });
}

async function expectNoSpending(page: Page, writes: () => number) {
  expect(writes()).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(
    (await page.evaluate(() => (window as any).walletCalls)).some(
      (method: string) =>
        /requestViewAccess|Transaction|Ownership|PrivatePayment/.test(method),
    ),
  ).toBe(false);
}

test("disconnect clears the wallet-bound reply choice and keeps the written draft", async ({
  page,
}) => {
  const fixture = await connectFixture(page);
  await fixture.toggle.check();
  await page.getByLabel("Gift amount (optional)").fill("2.5");
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await page
    .getByRole("checkbox", { name: "I saved my private link somewhere safe" })
    .check();
  await minimizeComposer(page);
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Restore composer", exact: true })
    .click();
  await expect(fixture.toggle).not.toBeChecked();
  await expect(fixture.toggle).toBeDisabled();
  await expect(page.locator(".review")).toHaveCount(0);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Keep my reply choice",
  );
  await expect(page.getByLabel("Your letter")).toHaveValue(
    "This letter has no gift and is never submitted.",
  );
  await expect(page.getByLabel("Gift amount (optional)")).toHaveValue("2.5");
  await expect(
    page.getByText(
      "Collection postage is included automatically: 0.1 TARI, separate from the gift.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await expect(page.locator(".review .receipt")).toContainText(
    "No reply postbox",
  );
  await expect(
    page.getByRole("checkbox", {
      name: "I saved my private link somewhere safe",
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", {
      name: /Send encrypted letter|Publish publicly/,
    }),
  ).toBeDisabled();
  await expectNoSpending(page, fixture.writes);
});

test("changing offices clears old reply routing even when the new office has the same public ID", async ({
  page,
}) => {
  const fixture = await connectFixture(page);
  await fixture.toggle.check();
  await page.getByLabel("Gift amount (optional)").fill("2.5");
  await page
    .getByRole("button", { name: "Close composer", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Unlock your private inbox", exact: true })
    .getByRole("button", { name: "Not now", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByText("Advanced connection settings", { exact: true }).click();
  const registry = `component_${"e".repeat(64)}`;
  await page.getByLabel("Registry component", { exact: true }).fill(registry);
  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await openDeliveryOptions(page);
  await expect(fixture.toggle).toBeEnabled();
  await expect(fixture.toggle).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Wallet details", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Gift amount (optional)")).toHaveValue("2.5");
  await expect(
    page.getByText(
      "Collection postage is included automatically: 0.1 TARI, separate from the gift.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await expect(page.locator(".review .receipt")).toContainText(
    "No reply postbox",
  );
  const privateLink = await page
    .getByLabel("Private link to save", { exact: true })
    .inputValue();
  expect(parseGiftLink(new URL(privateLink).hash)?.context.registry).toBe(
    registry,
  );
  await expectNoSpending(page, fixture.writes);
});
