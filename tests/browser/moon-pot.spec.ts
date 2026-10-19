import { test, expect } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
import { readable } from "./support/contrast";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
test("Moon Pot has its own labelled tab, honest preparation state and opt-in examples without wallet access", async ({
  page,
}) => {
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: emptyDeployment }),
  );
  await page.addInitScript(() => {
    (window as any).walletCalls = [];
    (window as any).tari = {
      isTariWallet: true,
      info: { name: "Forbidden wallet", rdns: "mw.tari.sapient" },
      request: (args: unknown) => {
        (window as any).walletCalls.push(args);
        throw new Error("Pot preview must never call a wallet");
      },
    };
  });
  await page.goto("./#/hall");
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Moon Pot", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/pot$/);
  await expect(
    page.getByRole("heading", { name: "Moon Pot.", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pot-preparation")).toContainText(
    "No pot has been deployed or opened",
  );
  await expect(page.locator(".pot-entry")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Preview fictional contributions",
      exact: true,
    })
    .click();
  await expect(page.locator(".pot-hero")).toContainText(
    "FICTIONAL DESIGN PREVIEW",
  );
  await expect(page.locator(".pot-entry")).toHaveCount(3);
  await expect(page.locator(".pot-entry").first()).toContainText(
    "50% of the pot",
  );
  await page
    .getByRole("textbox", { name: "Example contribution", exact: true })
    .fill("10");
  await expect(page.locator(".pot-share-example")).toContainText(
    "9.09% chance",
  );
  for (const width of test.info().project.name === "desktop"
    ? [320, 768, 1440]
    : [390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await readable(page.locator(".pot-entry p").first());
  await readable(page.locator(".pot-entry-share").first());
  await page.screenshot({
    path: test.info().outputPath("moon-pot-fictional.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close fictional preview", exact: true })
    .click();
  await expect(page.locator(".pot-entry")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).walletCalls)).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Moon Pot.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("button", { name: "Public mail", exact: true })
    .click();
  await expect(page.locator(".moon-pot-page")).toHaveCount(0);
});

test("configured experimental pot requires acknowledgement and a separate public contribution review without private-view permission", async ({
  page,
}) => {
  const owner = generateKeypair(),
    view = generateKeypair(),
    address = generateOotleAddress(owner.public_key, view.public_key, 38),
    controller = Buffer.from(owner.public_key).toString("hex");
  owner.free();
  view.free();
  const account = `component_${"f".repeat(64)}`,
    catalog = `component_${"c".repeat(64)}`,
    round = `component_${"e".repeat(64)}`,
    template = "d".repeat(64);
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "b".repeat(64),
    indexerUrl: "https://pot-browser.invalid/",
    resource: `resource_${"01".repeat(32)}`,
  };
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  await page.route("**/moon-pot.json", (r) =>
    r.fulfill({
      json: {
        deployment: {
          ...d,
          catalog,
          potTemplate: template,
          experimental: true,
          evidence: {
            engine: true,
            stockSapient: true,
            drawSecurity: false,
            livePayout: false,
          },
        },
      },
    }),
  );
  await page.route(`${d.indexerUrl}**`, (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/network")
      return r.fulfill({
        json: { network: "Esmeralda", network_byte: 38, epoch: 200 },
      });
    if (path === "/epoch-manager/stats")
      return r.fulfill({ json: { current_epoch: 200 } });
    const key = JSON.stringify({
      version: "gd-postbox-1",
      keyVersion: 1,
      publicKey: "12".repeat(32),
    });
    const common = [38, d.registry, `template_${d.template}`];
    const raw = path.includes(catalog)
      ? [
          ...common,
          0,
          100,
          604,
          { 100: round },
          [],
          {},
          0,
          "",
          "",
          false,
          `vault_${"23".repeat(32)}`,
        ]
      : path.includes(round)
        ? [
            ...common,
            1,
            100,
            604,
            {},
            [],
            {},
            0,
            "",
            "",
            false,
            `vault_${"24".repeat(32)}`,
          ]
        : [
            38,
            {},
            { home: ["home", "Moonlit home", controller, key, true] },
            `template_${d.template}`,
          ];
    return r.fulfill({
      json: {
        version: 0,
        substate: {
          Component: {
            header: {
              template_address:
                path.includes(catalog) || path.includes(round)
                  ? template
                  : d.template,
              owner_rule: "None",
            },
            body: { state: raw },
          },
        },
      },
    });
  });
  await page.addInitScript(
    ({ account, address }) => {
      const w = window as any;
      w.potCalls = [];
      let connected = false;
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async (args: any) => {
          w.potCalls.push(args.method);
          if (args.method === "tari_getNetwork") return "esmeralda";
          if (args.method === "tari_requestAccounts") {
            connected = true;
            return [account];
          }
          if (args.method === "tari_getAccounts")
            return connected ? [account] : [];
          if (args.method === "tari_getWalletAddress") return address;
          if (args.method === "tari_getCapabilities")
            return {
              transactionRequests: true,
              walletAddress: true,
              supportsPrivateFees: false,
            };
          if (args.method === "tari_getViewAccess") return { granted: false };
          throw new Error(
            "This review fixture forbids spending and private-view requests",
          );
        },
      };
    },
    { account, address },
  );
  await page.goto("./#/pot");
  await page
    .getByRole("button", { name: "Connect Sapient for the pot", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Add your wish", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Public message", exact: true })
    .fill("A message with an actual reviewed contribution.");
  const review = page.getByRole("button", {
    name: "Review contribution",
    exact: true,
  });
  await expect(review).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "I understand these limitations" })
    .check();
  await expect(review).toBeEnabled();
  await review.click();
  await expect(
    page.getByRole("region", { name: "Pot action review", exact: true }),
  ).toContainText("1 TARI");
  await expect(
    page.getByRole("region", { name: "Pot action review", exact: true }),
  ).toContainText("You may lose the full contribution");
  await page.screenshot({
    path: test.info().outputPath("moon-pot-review-fictional.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Cancel review", exact: true })
    .click();
  expect(
    (await page.evaluate(() => (window as any).potCalls)).filter((m: string) =>
      /Transaction|requestView|ShieldedOutputs/.test(m),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "I understand these limitations" }),
  ).not.toBeChecked();
});
