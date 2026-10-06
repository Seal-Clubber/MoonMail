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
    page.getByText("A deployed post office is configured."),
  ).toBeVisible();
  await expect(
    page.getByText("The post office is awaiting deployment."),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Explore preview" }),
  ).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "↻ Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Chain state loaded");
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
  await page
    .getByRole("button", { name: "Network & verification", exact: false })
    .click();
  await page.getByLabel("Ootle test network").selectOption("16");
  const completed = page.waitForResponse((response) =>
    response.url().includes(envelope),
  );
  release();
  await completed;
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "The hall", exact: true }).click();
  await expect(
    page.getByText("The post office is awaiting deployment."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "↻ Refresh", exact: true }),
  ).toBeDisabled();
});
