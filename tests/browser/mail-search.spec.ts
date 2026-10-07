import { test, expect, type Page } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
const d = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"1".repeat(64)}`,
  template: "2".repeat(64),
  envelopeTemplate: "3".repeat(64),
  indexerUrl: "https://fixture-indexer.invalid/",
};
const ids = Array.from(
  { length: 101 },
  (_, i) => `letter-${String(i).padStart(3, "0")}`,
);
const children = ids.map(
  (_, i) => `component_${(i + 1000).toString(16).padStart(64, "0")}`,
);
async function setup(page: Page, delayedLast = false) {
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  let release = () => {},
    started = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    const url = r.request().url();
    const registry = url.includes(d.registry);
    const index = children.findIndex((child) => url.includes(child));
    if (delayedLast && index === 100) {
      started();
      await held;
    }
    const mode = index === 2 ? 1 : index === 3 ? 2 : 0;
    const publicKey = "5".repeat(64);
    const payload =
      mode === 0
        ? {
            subject: `Moonlit letter ${index}`,
            body:
              index === 50
                ? "Needle from the far hall"
                : "Kindness travels quietly.",
          }
        : mode === 1
          ? {
              version: "gd-link-1",
              iv: "fixture",
              ciphertext: "secret subject must stay hidden",
              wrapIv: "fixture",
              wrappedClaimKey: "fixture",
              claimPublicKey: publicKey,
            }
          : {
              version: "gd-postbox-1",
              keyVersion: 1,
              recipientKey: publicKey,
              ephemeralPublicKey: "6".repeat(64),
              iv: "fixture",
              ciphertext: "private postbox contents",
            };
    const state = registry
      ? [
          38,
          Object.fromEntries(ids.map((id, i) => [id, children[i]])),
          {},
          `template_${d.envelopeTemplate}`,
        ]
      : [
          38,
          ids[index],
          mode,
          JSON.stringify(payload),
          index < 2 ? "1000000" : "0",
          index < 2 ? "100000" : "0",
          index === 1,
          mode === 0 ? "" : publicKey,
          mode === 2 ? "box" : "",
          "",
          "7".repeat(64),
          "",
        ];
    return r.fulfill({
      json: {
        version: 0,
        substate: {
          Component: {
            header: {
              template_address: registry ? d.template : d.envelopeTemplate,
              owner_rule: "None",
            },
            body: { state },
          },
        },
      },
    });
  });
  return { release, requested, writes: () => writes };
}

test("hall search filters public contents, keeps sealed contents private and resets pages", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("./");
  const search = page.getByLabel("Find public mail", { exact: true });
  const filter = page.getByLabel("Show mail", { exact: true });
  await expect(search).toBeVisible();
  await expect(page.locator(".search-summary")).toContainText("99 loaded");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Page 2");
  await search.fill("Needle from the far hall");
  await expect(
    page.getByRole("button", { name: /Moonlit letter 50/ }),
  ).toBeVisible();
  await expect(page.locator(".envelope-card")).toHaveCount(1);
  await search.fill("secret subject must stay hidden");
  await expect(page.getByText("No letters match this search.")).toBeVisible();
  await expect(page.locator(".envelope-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".pagination")).toContainText("Page 1");
  await filter.selectOption("link");
  await expect(page.locator(".envelope-card")).toHaveCount(1);
  await search.fill("letter-002");
  await expect(page.locator(".envelope-card")).toHaveCount(1);
  await search.fill("");
  await filter.selectOption("gifts");
  await expect(page.locator(".envelope-card")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Moonlit letter 0/ }),
  ).toBeVisible();
  expect(fixture.writes()).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("loading another chain page extends local search without signing", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.goto("./");
  const search = page.getByLabel("Find public mail", { exact: true });
  await search.fill("letter-100");
  await expect(page.locator(".envelope-card")).toHaveCount(0);
  await expect(page.locator(".search-summary")).toContainText(
    "Search covers loaded mail",
  );
  await page.getByRole("button", { name: "Load more chain mail" }).click();
  await expect(
    page.getByRole("button", { name: /Moonlit letter 100/ }),
  ).toBeVisible();
  await expect(page.locator(".search-summary")).toContainText("100 loaded");
  await expect(
    page.getByRole("button", { name: "Load more chain mail" }),
  ).toHaveCount(0);
  expect(fixture.writes()).toBe(0);
});

test("a late pagination response cannot import letters after switching networks", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page.goto("./");
  await page.getByRole("button", { name: "Load more chain mail" }).click();
  await fixture.requested;
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await page.getByLabel("Ootle test network").selectOption("16");
  const completed = page.waitForResponse((response) =>
    response.url().includes(children[100]),
  );
  fixture.release();
  await completed;
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await expect(page.getByText("The post office is unavailable.")).toBeVisible();
  await expect(page.locator(".envelope-card")).toHaveCount(0);
  expect(fixture.writes()).toBe(0);
});
