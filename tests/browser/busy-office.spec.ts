import { test, expect, type Page } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
const d = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"1".repeat(64)}`,
  template: "2".repeat(64),
  envelopeTemplate: "3".repeat(64),
  indexerUrl: "https://busy-office-fixture.invalid/",
};
const component = `component_${"4".repeat(64)}`;
function ledger(url: string) {
  const registry = url.includes(d.registry);
  return {
    substate: {
      Component: {
        header: {
          template_address: registry ? d.template : d.envelopeTemplate,
          owner_rule: "None",
        },
        body: {
          state: registry
            ? [
                38,
                { "live-letter": component },
                {},
                `template_${d.envelopeTemplate}`,
              ]
            : [
                38,
                "live-letter",
                0,
                JSON.stringify({
                  subject: "Actual fixture letter",
                  body: "This is read-only fixture mail, separate from the sample office.",
                }),
                "1000000",
                "100000",
                true,
                "5".repeat(64),
                "",
                "",
                "8".repeat(64),
                "",
              ],
        },
      },
    },
  };
}
async function unconfigured(page: Page) {
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: emptyDeployment }),
  );
}
async function noWrites(page: Page) {
  let writes = 0;
  const urls: string[] = [];
  await page.route("**/*", (r) => {
    urls.push(r.request().url());
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    return r.fallback();
  });
  return () => ({ writes, urls });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("36 sample letters paginate, filter and read in list view without any gift or wallet action", async ({
  page,
}) => {
  await unconfigured(page);
  const inspect = await noWrites(page);
  await page.goto("./");
  await page
    .getByRole("button", { name: "Explore preview", exact: true })
    .click();
  await page.getByRole("button", { name: "List view", exact: false }).click();
  await expect(page.locator(".envelope-card")).toHaveCount(12);
  await expect(page.locator(".search-summary")).toContainText("1–12 of 36");
  await expect(page.locator(".preview-banner")).toContainText("fictional");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Page 2 of 3");
  await expect(page.locator(".search-summary")).toBeFocused();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Page 3 of 3");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Show mail", { exact: true }).selectOption("postbox");
  await expect(page.locator(".envelope-card")).toHaveCount(6);
  const addressed = page.getByRole("button", {
    name: "For the keeper of this postbox",
    exact: false,
  });
  await addressed.click();
  await expect(page.locator(".letter-body")).toContainText(
    "Sample addressed mail",
  );
  await expect(
    page.getByRole("button", { name: "Review gift collection", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry opening letter", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close letter", exact: true }).click();
  await page.getByLabel("Show mail", { exact: true }).selectOption("link");
  await page.getByLabel("Find public mail", { exact: true }).fill("midnight");
  await page
    .getByRole("button", { name: "Do not open until midnight", exact: false })
    .click();
  await expect(page.locator(".letter-body")).toContainText(
    "By the time you read this",
  );
  await page.getByRole("button", { name: "Close letter", exact: true }).click();
  await page.getByLabel("Find public mail", { exact: true }).fill("");
  await page.getByLabel("Show mail", { exact: true }).selectOption("gifts");
  const coffee = page.getByRole("button", {
    name: "Coffee for the night shift",
    exact: false,
  });
  await expect(coffee).toContainText("sample TARI");
  await coffee.click();
  await expect(page.locator(".letter-body")).toContainText("Thank you");
  await expect(
    page.getByRole("button", { name: "Review gift collection", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm & collect gift", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close letter", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  expect(inspect().writes).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(await page.evaluate(() => !!(window as any).tari)).toBe(false);
});
test("a real office finishing its read cannot turn an open sample gift into a live claim", async ({
  page,
}) => {
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((r) => {
    release = r;
  });
  const requested = new Promise<void>((r) => {
    started = r;
  });
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().url().includes(d.registry)) {
      started();
      await held;
    }
    await r.fulfill({ json: ledger(r.request().url()) });
  });
  const inspect = await noWrites(page);
  await page.goto("./");
  await requested;
  await page
    .getByRole("button", { name: "Try sample mail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Coffee for the night shift", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toContainText("VISUAL PREVIEW");
  const response = page.waitForResponse((r) => r.url().includes(component));
  release();
  await response;
  await expect(page.locator(".message.status")).toContainText(
    "Mail is up to date",
  );
  await expect(page.getByRole("dialog")).toContainText("VISUAL PREVIEW");
  await expect(
    page.getByRole("button", { name: "Review gift collection", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Copy public letter link", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close letter", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave preview", exact: true })
    .click();
  await expect(page.locator(".preview-banner")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Actual fixture letter", exact: false }),
  ).toBeVisible();
  expect(
    inspect().urls.some(
      (url) => url.startsWith(d.indexerUrl) && url.includes("preview-"),
    ),
  ).toBe(false);
  expect(inspect().writes).toBe(0);
});
test("sample activity covers approvals and outcomes without changing the real delivery book", async ({
  page,
}) => {
  await unconfigured(page);
  const inspect = await noWrites(page);
  await page.goto("./#/activity");
  const original = await page.evaluate(() =>
    localStorage.getItem("ghostdrop:pending:v1"),
  );
  await page
    .getByRole("button", { name: "See sample activity", exact: true })
    .click();
  await expect(page.locator(".sample-activity-notice")).toContainText(
    "28 fictional actions",
  );
  await expect(page.locator(".activity-entry")).toHaveCount(12);
  await expect(
    page.getByRole("button", { name: "Check status", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Resume Sapient approval", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Action type", exact: true })
    .selectOption("capsule");
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("confirmed");
  const backups = page.locator(".activity-entry");
  await expect(backups).toHaveCount(2);
  await expect(backups.first()).toContainText("second approval");
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("pending");
  await expect(page.locator(".activity-entry")).toHaveCount(4);
  await page
    .getByRole("combobox", { name: "Action type", exact: true })
    .selectOption("all");
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("all");
  await page
    .getByRole("button", { name: "Next activity", exact: true })
    .click();
  await expect(page.locator(".activity-range")).toBeFocused();
  await expect(
    page.getByRole("navigation", { name: "Activity pages" }),
  ).toContainText("Page 2 of 3");
  await page
    .getByRole("button", { name: "Next activity", exact: true })
    .click();
  await expect(page.locator(".activity-entry")).toHaveCount(4);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page
    .getByRole("button", { name: "Return to my activity", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No deliveries yet.", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBe(original);
  expect(inspect().writes).toBe(0);
});
test("a busy real Activity book filters legacy uncertain claims without promising a payout or rewriting history", async ({
  page,
}) => {
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  await page.route(`${d.indexerUrl}**`, (r) =>
    r.fulfill({ json: ledger(r.request().url()) }),
  );
  const records = Array.from({ length: 27 }, (_, i) => ({
    id: i < 3 ? `attempt:older-${i}` : (i + 100).toString(16).padStart(64, "0"),
    operation: i < 3 ? "claim" : i % 3 === 0 ? "postbox" : "publish",
    state:
      i === 0
        ? "confirmed"
        : i < 3
          ? "unknown"
          : i > 23
            ? "rejected"
            : "confirmed",
    network: 38,
    registry: d.registry,
    envelopeId: i % 3 === 0 && i > 2 ? `postbox:box-${i}` : "live-letter",
    ...(i === 0 ? {} : { createdAt: Date.now() - i * 60000 }),
    ...(i % 3 === 0 && i > 2 ? { postboxAction: "rotate" } : {}),
  }));
  await page.addInitScript(
    (records) =>
      localStorage.setItem("ghostdrop:pending:v1", JSON.stringify(records)),
    records,
  );
  const inspect = await noWrites(page);
  await page.goto("./#/activity");
  const original = await page.evaluate(() =>
    localStorage.getItem("ghostdrop:pending:v1"),
  );
  await expect(page.locator(".activity-entry")).toHaveCount(12);
  const finished = page
    .locator(".activity-confirmed")
    .filter({
      has: page.getByRole("heading", { name: "Send a letter", exact: true }),
    })
    .first();
  await expect(finished.locator(".activity-next")).not.toBeVisible();
  await finished.locator(".activity-receipt summary").click();
  await expect(finished.locator(".activity-next")).toBeVisible();
  await finished.locator(".activity-receipt summary").click();
  await page
    .getByRole("button", { name: "Next activity", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Next activity", exact: true })
    .click();
  await expect(page.locator(".activity-entry")).toHaveCount(3);
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("pending");
  await expect(page.locator(".activity-entry")).toHaveCount(3);
  const legacy = page
    .locator(".activity-entry")
    .filter({ hasText: "Start time was not saved" });
  await expect(legacy).toContainText("Awaiting confirmation");
  await expect(legacy).not.toContainText("Delivered");
  await expect(legacy).toContainText("cannot prove");
  await legacy
    .getByRole("button", { name: "Check status", exact: true })
    .click();
  await expect(page.locator(".message.status")).toContainText(
    "cannot confirm your payout",
  );
  await legacy.locator("summary").click();
  await expect(
    legacy.getByLabel("Local attempt ID", { exact: true }),
  ).toHaveValue("attempt:older-0");
  await legacy
    .getByRole("button", { name: "Read public letter", exact: false })
    .click();
  await expect(page.locator(".letter-body")).toContainText(
    "separate from the sample office",
  );
  await page.getByRole("button", { name: "Close letter", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("confirmed");
  await page
    .getByRole("combobox", { name: "Action type", exact: true })
    .selectOption("postbox");
  await expect(page.locator(".activity-entry").first()).toContainText(
    "encryption key",
  );
  await noOverflow(page);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBe(original);
  expect(inspect().writes).toBe(0);
});
