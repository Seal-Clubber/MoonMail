import { test, expect } from "@playwright/test";
import deployed from "../../public/deployment.json" with { type: "json" };
import archived from "../../public/deployment-v2.json" with { type: "json" };
import { createPostboxLink } from "../../src/core/postbox-links";

test.beforeEach(async ({ page }) => {
  await page.route("https://ootle-indexer-a.tari.com/**", (route) =>
    route.abort(),
  );
});

test("sealed mail is the single default even with a stale office preference", async ({
  page,
}) => {
  const profiles: string[] = [];
  page.on("request", (r) => {
    if (/deployment[^/]*\.json/.test(r.url()))
      profiles.push(new URL(r.url()).pathname);
  });
  await page.addInitScript(() =>
    localStorage.setItem("moonmail:office:v1", "existing"),
  );
  await page.goto("./#/postboxes");
  await expect(
    page.getByRole("region", { name: "Mailbox office", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Try sealed mail", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open existing postboxes", exact: true }),
  ).toHaveCount(0);
  await expect.poll(() => profiles.length).toBe(1);
  await page.reload();
  await expect.poll(() => profiles.length).toBe(2);
  expect(profiles.every((p) => p === "/MoonMail/deployment.json")).toBe(true);
  expect(deployed.contractProtocol).toBe("unified-2");
  expect(deployed.evidence.nativePrivatePayments).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(await page.evaluate(() => (window as any).tari)).toBeUndefined();
});

test("a current invitation opens directly without an office switch", async ({
  page,
}) => {
  const hash = new URL(
    createPostboxLink("https://example.com/MoonMail/", {
      id: "fixture-recipient",
      context: deployed,
    }),
  ).hash;
  await page.goto("./" + hash);
  await expect(
    page.getByRole("region", { name: "Incoming mail office", exact: true }),
  ).toHaveCount(0);
  const invitation = page.getByRole("region", {
    name: "Postbox invitation",
    exact: true,
  });
  await expect(invitation).toContainText("fixture-recipient");
  await expect(invitation).toContainText("could not be reached");
  expect(
    await page.evaluate(() => localStorage.getItem("moonmail:office:v1")),
  ).toBeNull();
});

test("an old testnet invitation cannot change the active office or start a draft", async ({
  page,
}) => {
  const hash = new URL(
    createPostboxLink("https://example.com/MoonMail/", {
      id: "old-test-postbox",
      context: archived,
    }),
  ).hash;
  await page.goto("./" + hash);
  const invitation = page.getByRole("region", {
    name: "Postbox invitation",
    exact: true,
  });
  await expect(invitation).toContainText("different post office or network");
  await expect(
    invitation.getByRole("button", {
      name: "Use this postbox for my letter",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Open this link’s office", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});
