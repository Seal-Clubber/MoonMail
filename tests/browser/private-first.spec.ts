import { chooseMailMode, openDeliveryOptions } from "./support/composer";
import { test, expect } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
import { readable } from "./support/contrast";

test.beforeEach(async ({ page }) => {
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: emptyDeployment }),
  );
});

test("MoonMail landing opens the mailbox and public mail deliberately, without wallet access", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "MoonMail", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Your words, under cover of night.", { exact: true }),
  ).toBeVisible();
  await readable(page.locator(".landing-tagline"));
  await readable(page.locator(".landing-intro"));
  await expect(page.locator(".landing-moon")).toBeVisible();
  await expect(page.locator(".landing-feature-icon .ui-icon")).toHaveCount(3);
  for (const feature of await page.locator(".landing-features p").all()) {
    await readable(feature);
  }
  await page.screenshot({
    path: test.info().outputPath("moonlit-landing.png"),
    fullPage: true,
  });
  await expect(page.locator(".moon-messenger")).toHaveCSS(
    "animation-name",
    "none",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open mailbox", exact: false })
    .click();
  await expect(page.locator(".inbox-page")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page.locator(".moonmail-landing")).toBeVisible();
  await page
    .getByRole("button", { name: "Explore public mail", exact: true })
    .click();
  await expect(page.locator(".hero")).toBeVisible();
});

test("Compose defaults to encrypted postbox mail and explains actual metadata", async ({
  page,
}) => {
  await page.goto("./#/compose");
  await openDeliveryOptions(page);
  await expect(
    page.getByRole("button", { name: "▥ Private mail", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".privacy-disclosure summary").click();
  await expect(page.locator(".privacy-disclosure")).toContainText(
    "Recipient postbox ID and its controlling public key",
  );
  await expect(page.locator(".privacy-disclosure")).toContainText(
    "does not provide anonymity",
  );
  await expect(page.locator(".privacy-disclosure")).toContainText(
    "does not authorize spending",
  );
  await chooseMailMode(page, "✧ Public mail");
  await expect(page.locator(".public-warning")).toBeVisible();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Public only by choice");
  await page
    .getByLabel("Your letter", { exact: true })
    .fill("This subject and message are readable by everyone.");
  await page.getByRole("button", { name: "Review letter" }).click();
  await expect(
    page.getByRole("checkbox", { name: "I choose to publish this subject" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Publish publicly", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I choose to publish this subject" })
    .check();
  await page
    .getByLabel("Your letter", { exact: true })
    .fill("Changed after acknowledging");
  await page.getByRole("button", { name: "Review letter" }).click();
  await expect(
    page.getByRole("checkbox", { name: "I choose to publish this subject" }),
  ).not.toBeChecked();
});
