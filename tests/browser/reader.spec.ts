import { test, expect, type Page } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";

// Synthetic read-only state. No network, wallet or spending permissions needed.
const deployment = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"1".repeat(64)}`,
  template: "2".repeat(64),
  envelopeTemplate: "3".repeat(64),
  indexerUrl: "https://fixture-indexer.invalid/",
};
const envelope = `component_${"4".repeat(64)}`;
const subject = "Recovered after an indexer outage";
async function configure(page: Page) {
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: deployment }),
  );
}
function state(url: string) {
  if (url.includes(deployment.registry))
    return {
      substate: {
        Component: {
          header: { template_address: deployment.template, owner_rule: "None" },
          body: {
            state: [
              38,
              { recovered: envelope },
              {},
              `template_${deployment.envelopeTemplate}`,
            ],
          },
        },
      },
    };
  if (url.includes(envelope))
    return {
      substate: {
        Component: {
          header: {
            template_address: deployment.envelopeTemplate,
            owner_rule: "None",
          },
          body: {
            state: [
              38,
              "recovered",
              0,
              JSON.stringify({
                subject,
                body: "The selected post office is back.",
              }),
              "0",
              "0",
              false,
              "",
              "",
              "",
              "5".repeat(64),
              "",
            ],
          },
        },
      },
    };
  return {};
}

test("configured public reader retries an initial outage without a page reload", async ({
  page,
}) => {
  await configure(page);
  let unavailable = true;
  await page.route(`${deployment.indexerUrl}**`, (route) =>
    unavailable
      ? route.fulfill({ status: 503, body: "Temporary outage" })
      : route.fulfill({ json: state(route.request().url()) }),
  );
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Could not read");
  await expect(
    page.getByText("The spirits are fetching your mail."),
  ).toBeVisible();
  await expect(page.getByText("The post office is unavailable.")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Explore preview" }),
  ).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "↻ Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Mail is up to date");
});

test("a delayed initial read cannot load letters after the selected network changes", async ({
  page,
}) => {
  await configure(page);
  let release!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`${deployment.indexerUrl}**`, async (route) => {
    if (route.request().url().includes(deployment.registry)) {
      started();
      await pending;
    }
    await route.fulfill({ json: state(route.request().url()) });
  });
  await page.goto("./");
  await requested;
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await page.getByLabel("Ootle test network").selectOption("16");
  const completed = page.waitForResponse((response) =>
    response.url().includes(envelope),
  );
  release();
  await completed;
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await expect(page.getByText("The post office is unavailable.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "↻ Refresh", exact: true }),
  ).toBeDisabled();
});

test("Activity confirms an uncertain publication from ledger state without signing or resending", async ({
  page,
}) => {
  await configure(page);
  let writes = 0;
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: state(r.request().url()) });
  });
  await page.addInitScript(({ network, registry }) => {
    localStorage.setItem(
      "ghostdrop:pending:v1",
      JSON.stringify([
        {
          id: "attempt:gui-test",
          network,
          registry,
          operation: "publish",
          envelopeId: "recovered",
          state: "unknown",
        },
      ]),
    );
  }, deployment);
  await page.goto("./#/activity");
  await expect(page.locator(".delivery-card")).toContainText(
    "Awaiting confirmation",
  );
  const check = page.getByRole("button", { name: "Check status" });
  await expect(check).toBeEnabled();
  await check.click();
  await expect(page.locator(".delivery-card")).toContainText("Delivered");
  expect(writes).toBe(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghostdrop:pending:v1")!)[0].state,
    ),
  ).toBe("confirmed");
});

test("directory searches names, excludes unlisted postboxes and starts an addressed draft", async ({
  page,
}) => {
  await configure(page);
  const key = JSON.stringify({
    version: "gd-postbox-1",
    keyVersion: 1,
    publicKey: "6".repeat(64),
  });
  await page.route(`${deployment.indexerUrl}**`, (r) =>
    r.fulfill({
      json: {
        substate: {
          Component: {
            header: {
              template_address: deployment.template,
              owner_rule: "None",
            },
            body: {
              state: [
                38,
                {},
                {
                  friendly: [
                    "friendly",
                    "Moonlit Friend",
                    "7".repeat(64),
                    key,
                    true,
                  ],
                  secret: [
                    "secret",
                    "Unlisted Friend",
                    "8".repeat(64),
                    key,
                    false,
                  ],
                },
                `template_${deployment.envelopeTemplate}`,
              ],
            },
          },
        },
      },
    }),
  );
  await page.goto("./#/ledger");
  await expect(
    page.getByRole("heading", { name: "Moonlit Friend", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Unlisted Friend", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Find a postbox").fill("missing");
  await expect(
    page.getByRole("heading", { name: "No spirits by that name." }),
  ).toBeVisible();
  await page.getByLabel("Find a postbox").fill("moonlit");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Write to Moonlit Friend" }).click();
  await expect(page.getByLabel("Recipient postbox ID")).toHaveValue("friendly");
  await expect(
    page.getByRole("button", { name: "▥ To a postbox" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Fund & publish letter" }),
  ).toHaveCount(0);
});
