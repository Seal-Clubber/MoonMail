import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { readable } from "./support/contrast";

test.beforeEach(async ({ page }) => {
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: { ...emptyDeployment, network: 38 } }),
  );
});

async function installProvider(page: Page, late = false) {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  owner.free();
  view.free();
  const install = ({ address, late }: { address: string; late: boolean }) => {
    const w = window as any;
    w.walletCalls = [];
    w.walletFault = "";
    let connected = false;
    w.installSapient = () => {
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient test fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: { method: string }) => {
          w.walletCalls.push(method);
          if (method === "tari_getNetwork")
            return w.walletFault === "network" ? "igor" : "esmeralda";
          if (method === "tari_requestAccounts") {
            if (w.walletFault === "code-declined")
              throw { code: 4001, message: "Permission refused" };
            if (w.walletFault === "code-pending")
              throw { code: -32002, message: "Request already open" };
            if (w.walletFault === "code-access")
              throw { code: 4100, message: "Unauthorised" };
            if (w.walletFault === "wait")
              await new Promise<void>((resolve) => {
                w.finishConnection = resolve;
              });
            else if (w.walletFault) throw new Error(w.walletFault);
            connected = true;
            return [`component_${"a".repeat(64)}`];
          }
          if (method === "tari_getAccounts")
            return connected ? [`component_${"a".repeat(64)}`] : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_getBalances") return [];
          if (method === "tari_disconnect") {
            connected = false;
            return null;
          }
          throw new Error("Unexpected wallet request: " + method);
        },
      };
    };
    if (!late) w.installSapient();
  };
  await page.addInitScript(install, { address, late });
}

async function openWallet(page: Page) {
  await page.goto("./#/postboxes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Connect Sapient", exact: true });
}

async function noPrivateOrSpendingCalls(page: Page) {
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.filter(
        (method: string) =>
          ![
            "tari_getNetwork",
            "tari_requestAccounts",
            "tari_getAccounts",
            "tari_getWalletAddress",
            "tari_getCapabilities",
            "tari_getBalances",
            "tari_disconnect",
          ].includes(method),
      ),
    ),
  ).toEqual([]);
}

test("missing wallet offers the official install link, recheck and readable phone layout", async ({
  page,
}) => {
  const dialog = await openWallet(page);
  await expect(dialog.getByText("Not detected", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Get Sapient wallet" }),
  ).toHaveAttribute("href", "https://sapient.tari.mw/");
  await expect(
    dialog.getByRole("link", { name: "Get Sapient wallet" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  await expect(
    dialog.getByRole("button", { name: "Connect Sapient", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Check again" }).click();
  await expect(dialog.getByRole("status")).toContainText("Still not detected");
  await dialog.getByText("I already have Sapient", { exact: true }).click();
  await expect(dialog).toContainText("browser where Sapient is installed");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await readable(dialog.locator(".wallet-intro"));
    await readable(dialog.locator(".wallet-permission-note p"));
    await readable(dialog.getByRole("link", { name: "Get Sapient wallet" }));
  }
  await page.screenshot({
    path: test.info().outputPath("wallet-missing.png"),
    fullPage: true,
  });
});

test("late provider detection is read-only until an explicit connection click", async ({
  page,
}) => {
  await installProvider(page, true);
  const dialog = await openWallet(page);
  await page.evaluate(() => (window as any).installSapient());
  await dialog.getByRole("button", { name: "Check again" }).click();
  await expect(dialog.getByText("Detected", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).walletCalls)).toEqual([]);
  await dialog
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Disconnect wallet", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Wallet details", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Your Sapient wallet" }),
  ).toContainText("Connected · Esmeralda");
  await expect(
    page.getByRole("dialog", { name: "Your Sapient wallet" }),
  ).toContainText("Reading private mail");
  await noPrivateOrSpendingCalls(page);
});

test("connection problems stay inside the dialog with a useful next step and safe retry", async ({
  page,
}) => {
  await installProvider(page);
  const dialog = await openWallet(page);
  for (const [fault, title] of [
    ["network", "Choose Esmeralda in Sapient"],
    ["Wallet is locked", "Unlock your wallet"],
    ["User rejected request", "Connection wasn’t approved"],
    ["code-declined", "Connection wasn’t approved"],
    ["code-pending", "Check your open Sapient request"],
    ["code-access", "Check your wallet access"],
    ["A request is already pending", "Check your open Sapient request"],
    ["Sapient request timed out", "We’re still not connected"],
    ["Unsupported capabilities", "Sapient needs an update"],
    ["Unexpected response", "We couldn’t connect"],
  ]) {
    await page.evaluate((value) => {
      (window as any).walletFault = value;
    }, fault);
    await dialog
      .getByRole("button", { name: "Connect Sapient", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(title);
    await expect(
      dialog.getByRole("button", { name: "Connect Sapient", exact: true }),
    ).toBeEnabled();
    await readable(dialog.getByRole("alert").locator("p"));
  }
  await page.screenshot({
    path: test.info().outputPath("wallet-error.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    (window as any).walletFault = "";
  });
  await dialog
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await noPrivateOrSpendingCalls(page);
});

test("a pending connection cannot be duplicated and late approval after closing is ignored", async ({
  page,
}) => {
  await installProvider(page);
  const dialog = await openWallet(page);
  await page.evaluate(() => {
    (window as any).walletFault = "wait";
  });
  await dialog
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText("Continue in Sapient");
  await expect(
    dialog.getByRole("button", { name: "Waiting for Sapient…" }),
  ).toBeDisabled();
  await readable(dialog.getByRole("button", { name: "Waiting for Sapient…" }));
  await page.screenshot({
    path: test.info().outputPath("wallet-waiting.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).finishConnection();
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).walletCalls.includes("tari_getCapabilities"),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).walletCalls.filter(
          (m: string) => m === "tari_requestAccounts",
        ).length,
    ),
  ).toBe(1);
  await noPrivateOrSpendingCalls(page);
});
