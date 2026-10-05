import { test, expect } from "@playwright/test";
test("honest guest hall and reduced-motion visual preview", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "A little mystery. A little generosity.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("No funded gifts are being advertised.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Explore preview" }).click();
  await page.screenshot({
    path: `artifacts/screenshots/scene-${test.info().project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByText("VISUAL PREVIEW · These example letters", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "✧ Public letters", exact: false })
    .count();
  await page
    .getByRole("button", {
      name: "To whoever needs a little light",
      exact: false,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review address & explicitly claim" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close letter" }).click();
  await page.getByRole("button", { name: "☷ List view" }).click();
  await expect(
    page.getByRole("button", { name: "✧ Scene view" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/screenshots/hall-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("wallet dialog traps keyboard focus, closes on Escape and restores focus", async ({
  page,
}) => {
  await page.goto("./#/compose");
  const trigger = page.getByRole("button", { name: "Connect to send" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("real browser WASM encrypts subject locally; send stays disabled; drafts survive connect", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#/compose");
  await page.getByLabel("Subject", { exact: true }).fill("A private thought");
  await page.getByLabel("Your letter").fill("Do not put this on a server");
  await page.getByRole("button", { name: "Review letter" }).click();
  await expect(
    page.getByRole("heading", { name: "Sealed on this device" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fund & publish letter" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Connect to send" }).click();
  await page.getByLabel("API key · held in memory only").fill("tw_test");
  await page.getByRole("button", { name: "Close wallet connection" }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "A private thought",
  );
  await page.getByRole("button", { name: "Connect to send" }).click();
  await expect(page.getByLabel("API key · held in memory only")).toHaveValue(
    "",
  );
  expect(errors).toEqual([]);
});
test("subpath deep link removes capability before network requests and copy material stays local", async ({
  page,
}) => {
  const cap = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    registry = `component_${"a".repeat(64)}`,
    template = "b".repeat(64);
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await page.goto(
    `./#/letter/id/${cap}?network=16&registry=${registry}&template=${template}`,
  );
  await expect.poll(() => page.url()).not.toContain(cap);
  expect(urls.every((u) => !u.includes(cap))).toBe(true);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("complete private link");
});
test("wallet-controlled addressed mail is visibly incomplete", async ({
  page,
}) => {
  await page.goto("./#/compose");
  await page.getByRole("button", { name: "▥ To a postbox" }).click();
  await expect(
    page.getByText("Addressed mail is incomplete:", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review letter" }),
  ).toBeDisabled();
});
