import { test, expect } from "@playwright/test";
import { readable } from "./support/contrast";
import { emptyDeployment } from "../../src/core/config";

// Theme checks use synthetic read-only mail. No wallet or transaction API is used.
test.beforeEach(async ({ page }) => {
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: emptyDeployment }),
  );
});

test("theme keeps utility, parchment and nested dark text readable", async ({
  page,
}) => {
  await page.goto("./");
  for (const selector of [
    ".hero-rule",
    ".mode-legend",
    ".how-it-works p",
    ".empty-hall small",
  ])
    await readable(page.locator(selector).first());
  await page
    .getByRole("button", { name: "Write a letter", exact: true })
    .first()
    .click();
  await readable(
    page.getByLabel("Your letter", { exact: true }),
    "::placeholder",
  );
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await page.getByRole("button", { name: "Explore preview" }).click();
  await page
    .getByRole("button", {
      name: "To whoever needs a little light",
      exact: false,
    })
    .click();
  const letter = page.getByRole("dialog");
  await readable(letter.locator(".kicker"));
  await readable(letter.locator(".letter-body"));
  await letter
    .getByRole("button", { name: "Ghost View", exact: false })
    .click();
  await readable(letter.locator(".ghost-view p"));
  await readable(letter.locator(".ghost-view pre"));
  await letter.getByRole("button", { name: "Close letter" }).click();

  // A real rendering path for guest receiving labels; fixtures cannot broadcast.
  const deployment = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    indexerUrl: "https://theme-fixture.invalid/",
  };
  const envelope = `component_${"d".repeat(64)}`;
  let writes = 0;
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: deployment }),
  );
  await page.route(`${deployment.indexerUrl}**`, (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    const registry = route.request().url().includes(deployment.registry);
    return route.fulfill({
      json: {
        substate: {
          Component: {
            header: {
              template_address: registry
                ? deployment.template
                : deployment.envelopeTemplate,
              owner_rule: "None",
            },
            body: {
              state: registry
                ? [
                    38,
                    { "readable-gift": envelope },
                    {},
                    `template_${deployment.envelopeTemplate}`,
                  ]
                : [
                    38,
                    "readable-gift",
                    0,
                    JSON.stringify({
                      subject: "Readable moonlit gift",
                      body: "Only synthetic display data.",
                    }),
                    "1000000",
                    "100000",
                    false,
                    "5".repeat(64),
                    "",
                    "",
                    "8".repeat(64),
                    "",
                  ],
            },
          },
        },
      },
    });
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Readable moonlit gift", exact: false })
    .click();
  await readable(
    page
      .getByRole("dialog")
      .getByText("Ootle receiving address", { exact: true }),
  );
  await readable(
    page
      .getByRole("dialog")
      .getByText("Existing built-in account component", { exact: true }),
  );
  expect(writes).toBe(0);
});

test("MoonMail brand stays left with a centered icon and no overflow", async ({
  page,
}) => {
  await page.goto("./");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const brand = page.locator(".topbar .brand");
    await expect(brand).toBeVisible();
    const leftEdge = await page
      .locator(".topbar")
      .evaluate(
        (header) =>
          header.getBoundingClientRect().left +
          parseFloat(getComputedStyle(header).paddingLeft),
      );
    const position = await brand.boundingBox();
    expect(position).not.toBeNull();
    const centered = await page.locator(".brand-icon").evaluate((icon) => {
      const circle = icon.getBoundingClientRect();
      const mark = icon.querySelector("svg")!.getBoundingClientRect();
      return [
        Math.abs(mark.x + mark.width / 2 - circle.x - circle.width / 2),
        Math.abs(mark.y + mark.height / 2 - circle.y - circle.height / 2),
      ];
    });
    expect(centered.every((offset) => offset <= 1)).toBe(true);
    expect(Math.abs(position!.x - leftEdge)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Connect wallet", exact: true }),
    ).toBeVisible();
    // Exercise the actual connected labels without connecting a wallet. This
    // synthetic DOM case measures layout only; wallet behavior has other tests.
    await page.locator(".wallet-actions").evaluate((actions) => {
      const connect = actions.querySelector(".wallet-button")!;
      const details = document.createElement("button");
      details.className = "wallet-details-button";
      details.textContent = "Wallet details";
      actions.prepend(details);
      connect.lastChild!.textContent = "Disconnect wallet";
    });
    const connectedPosition = await brand.boundingBox();
    expect(Math.abs(connectedPosition!.x - leftEdge)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Wallet details", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Disconnect wallet", exact: true }),
    ).toBeVisible();
    await page.locator(".wallet-actions").evaluate((actions) => {
      actions.querySelector(".wallet-details-button")!.remove();
      actions.querySelector(".wallet-button")!.lastChild!.textContent =
        "Connect wallet";
    });
  }
});

test("reduced motion freezes atmospheric layers and envelope artwork", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./");
  await page.getByRole("button", { name: "Explore preview" }).click();
  for (const selector of [
    ".haunting-mist",
    ".haunting-mote",
    ".hero-sigil",
    ".brand-icon svg",
    ".envelope-visual",
    ".ghost-clerk",
  ]) {
    const elements = page.locator(selector);
    expect(await elements.count(), selector).toBeGreaterThan(0);
    for (const element of await elements.all()) {
      const animations = await element.evaluate((node) =>
        [null, "::before", "::after"].map(
          (pseudo) => getComputedStyle(node, pseudo).animationName,
        ),
      );
      expect(animations, selector).toEqual(["none", "none", "none"]);
    }
  }
});

test("busy lists and Activity keep small text, gift funding and every status readable", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Explore preview", exact: true })
    .click();
  await page.getByRole("button", { name: "List view", exact: false }).click();
  for (const selector of [
    ".list-hall .envelope-caption h3",
    ".letter-excerpt",
    ".mail-audience",
    ".mail-row-no-gift",
    ".search-summary",
  ])
    await readable(page.locator(selector + ":visible").first());
  await page.getByLabel("Show mail", { exact: true }).selectOption("link");
  await readable(page.locator(".audience-link").first());
  await page.getByLabel("Show mail", { exact: true }).selectOption("postbox");
  await readable(page.locator(".audience-postbox").first());
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page
    .getByRole("button", { name: "See sample activity", exact: true })
    .click();
  for (const selector of [
    ".activity-summary span",
    ".activity-tools label",
    ".activity-range",
    ".activity-subject",
    ".activity-explanation",
    ".activity-entry-footer",
    ".activity-next strong",
    ".activity-next",
  ])
    await readable(page.locator(selector + ":visible").first());
  for (const status of ["confirmed", "pending", "rejected"]) {
    await page
      .getByRole("combobox", { name: "Activity status", exact: true })
      .selectOption(status);
    await readable(page.locator(".activity-badge").first());
    await readable(page.locator(".activity-explanation").first());
  }
  await page
    .getByRole("combobox", { name: "Activity status", exact: true })
    .selectOption("confirmed");
  await page.locator(".activity-receipt summary").first().click();
  await readable(page.locator(".activity-mail-details dt").first());
  await readable(page.locator(".activity-mail-details dd").first());
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});
