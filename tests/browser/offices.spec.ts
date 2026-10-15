import { test, expect } from "@playwright/test";
import { reviewedOffice } from "../../src/core/offices";
import { createPostboxLink } from "../../src/core/postbox-links";

test.beforeEach(async ({ page }) => {
  await page.route("https://ootle-indexer-a.tari.com/**", (route) =>
    route.abort(),
  );
});
test("sealed mail is explicit, survives reload, and keeps existing postboxes one click away", async ({
  page,
}) => {
  await page.goto("./#/postboxes");
  const office = page.getByRole("region", {
    name: "Mailbox office",
    exact: true,
  });
  await expect(office).toContainText("Existing postboxes · Esmeralda");
  await office
    .getByRole("button", { name: "Try sealed mail", exact: true })
    .click();
  await expect(office).toContainText("Sealed mail · Esmeralda");
  await page.reload();
  await expect(office).toContainText("Sealed mail · Esmeralda");
  await office
    .getByRole("button", { name: "Open existing postboxes", exact: true })
    .click();
  await expect(office).toContainText("Existing postboxes · Esmeralda");
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(await page.evaluate(() => (window as any).tari)).toBeUndefined();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("an incoming known-office invitation offers an explicit switch and preserves the invitation", async ({
  page,
}) => {
  const hash = new URL(
    createPostboxLink("https://example.com/MoonMail/", {
      id: "fixture-recipient",
      context: reviewedOffice("sealed"),
    }),
  ).hash;
  await page.goto("./" + hash);
  const incoming = page.getByRole("region", {
    name: "Incoming mail office",
    exact: true,
  });
  await expect(incoming).toContainText("No transaction is sent");
  await incoming
    .getByRole("button", { name: "Open this link’s office", exact: true })
    .click();
  await expect(incoming).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Postbox invitation", exact: true }),
  ).toContainText("fixture-recipient");
  expect(
    await page.evaluate(() => localStorage.getItem("moonmail:office:v1")),
  ).toBe("sealed");
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});
