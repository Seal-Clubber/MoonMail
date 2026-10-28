import { chooseMailMode, selectRecipient } from "./support/composer";
import { test, expect } from "@playwright/test";
import { generateKeypair } from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";

for (const mode of ["public", "link", "postbox"] as const) {
  test(`${mode} letter space counts Unicode, keeps an oversized draft and permits shortening`, async ({
    page,
  }) => {
    const d = {
      ...emptyDeployment,
      network: 38,
      registry: `component_${"1".repeat(64)}`,
      template: "2".repeat(64),
      envelopeTemplate: "3".repeat(64),
      indexerUrl: "https://fixture-indexer.invalid/",
    };
    const pair = generateKeypair();
    const key = {
      version: "gd-postbox-1",
      keyVersion: 1,
      publicKey: Buffer.from(pair.public_key).toString("hex"),
      recovery: "sapient-capsule-1",
      capsule: {
        resource: `resource_${"5".repeat(64)}`,
        commitment: "6".repeat(64),
      },
    };
    pair.free();
    let writes = 0;
    await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
    await page.route(`${d.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") {
        writes++;
        return r.abort();
      }
      return r.fulfill({
        json: {
          version: 0,
          verified: false,
          state: {
            up: {
              substate: {
                Component: {
                  header: { template_address: d.template, owner_rule: "None" },
                  body: {
                    state: [
                      38,
                      {},
                      {
                        friendly: [
                          "friendly",
                          "Moonlit Friend",
                          "7".repeat(64),
                          JSON.stringify(key),
                          true,
                        ],
                      },
                      `template_${d.envelopeTemplate}`,
                    ],
                  },
                },
              },
            },
          },
        },
      });
    });
    await page.goto("./#/compose");
    await chooseMailMode(page, "⌘ Private link");
    await page
      .getByRole("button", {
        name:
          mode === "public"
            ? "✧ Public mail"
            : mode === "link"
              ? "⌘ Private link"
              : "▥ Private mail",
        exact: true,
      })
      .click();
    if (mode === "postbox") {
      await expect(
        page.getByRole("combobox", { name: "Recipient postbox", exact: true }),
      ).toBeVisible();
      await selectRecipient(page, "friendly");
    }
    const body = page.getByLabel("Your letter", { exact: true });
    const full = "👻".repeat(1200);
    await page
      .getByLabel("Subject", { exact: true })
      .fill("Room for a little kindness");
    await body.fill(full);
    await expect(page.locator("#letter-space")).toContainText("Letter is full");
    await expect(page.getByRole("alert")).toContainText(
      "Shorten your subject or message",
    );
    await expect(body).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByRole("button", { name: "Review letter", exact: false }),
    ).toBeDisabled();
    await expect(body).toHaveValue(full);
    await expect(page.locator(".review")).toHaveCount(0);
    if (mode === "postbox")
      await page.screenshot({
        path: test.info().outputPath("letter-space-full.png"),
        fullPage: true,
      });
    await body.fill("A little kindness 👻");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(body).toHaveAttribute("aria-invalid", "false");
    await expect(
      page.getByRole("progressbar", { name: "Letter space used" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review letter", exact: false })
      .click();
    await expect(page.locator(".review")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Send encrypted letter|Publish publicly/,
      }),
    ).toBeDisabled();
    await expect(body).toHaveValue("A little kindness 👻");
    expect(writes).toBe(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
