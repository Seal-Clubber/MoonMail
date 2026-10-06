import { test, expect } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";

test.beforeEach(async ({ page }) => {
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: emptyDeployment }),
  );
});

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
  await expect(
    page.getByRole("heading", { name: "Connect Sapient" }),
  ).toBeVisible();
  await expect(page.getByLabel("API key · held in memory only")).toHaveCount(0);
  await page.getByRole("button", { name: "Close wallet connection" }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "A private thought",
  );
  await page.getByRole("button", { name: "Connect to send" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect Sapient" }),
  ).toBeVisible();
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
test("addressed mail explains Sapient recovery and remains gated", async ({
  page,
}) => {
  await page.goto("./#/compose");
  await page.getByRole("button", { name: "▥ To a postbox" }).click();
  await expect(
    page.getByText("Addressed mail requires a registered postbox", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("postbox key recovery are still", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review letter" }),
  ).toBeDisabled();
});
test("postbox private view access requires explicit account-wide consent and never submits", async ({
  page,
}) => {
  // Provider/ledger fixtures test UI consent only; stock-wallet evidence is separate.
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38),
    controller = Buffer.from(owner.public_key).toString("hex");
  owner.free();
  view.free();
  const registry = `component_${"a".repeat(64)}`,
    component = `component_${"d".repeat(64)}`;
  const deployment = {
    ...emptyDeployment,
    network: 38,
    registry,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    indexerUrl: "https://fixture-indexer.invalid/",
  };
  const capsuleDeployment = {
    resource: `resource_${"5".repeat(64)}`,
    component: `component_${"6".repeat(64)}`,
    template: "7".repeat(64),
  };
  const pending = {
    id: "1".repeat(64),
    network: 38,
    registry,
    operation: "capsule",
    envelopeId: "capsule:privacy-lab:1",
    state: "confirmed",
    capsule: {
      account: component,
      context: {
        network: 38,
        registry,
        template: deployment.template,
        postbox: "privacy-lab",
        controller,
        keyVersion: 1,
      },
      descriptor: {
        version: "gd-postbox-1",
        keyVersion: 1,
        publicKey: "8".repeat(64),
        recovery: "sapient-capsule-1",
        capsule: {
          resource: capsuleDeployment.resource,
          commitment: "9".repeat(64),
        },
      },
      deployment: capsuleDeployment,
    },
  };
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: deployment }),
  );
  await page.route("https://fixture-indexer.invalid/**", (route) =>
    route.fulfill({
      json: {
        substate: {
          Component: {
            header: {
              template_address: deployment.template,
              owner_rule: "None",
            },
            body: {
              state: [38, {}, {}, `template_${deployment.envelopeTemplate}`],
            },
          },
        },
      },
    }),
  );
  await page.addInitScript(
    ({ address, component, pending }) => {
      localStorage.setItem("ghostdrop:pending:v1", JSON.stringify([pending]));
      const state = window as unknown as {
        tari: unknown;
        capsuleMethods: string[];
      };
      state.capsuleMethods = [];
      let connected = false,
        granted = false;
      state.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: { method: string }) => {
          state.capsuleMethods.push(method);
          if (method === "tari_getNetwork") return "esmeralda";
          if (method === "tari_requestAccounts") {
            connected = true;
            return [component];
          }
          if (method === "tari_getAccounts")
            return connected ? [component] : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_requestViewAccess") {
            granted = true;
            return { granted };
          }
          if (method === "tari_getViewAccess") return { granted };
          if (method === "tari_disconnect") {
            connected = false;
            granted = false;
            return null;
          }
          throw new Error("Unexpected provider method");
        },
      };
    },
    { address, component, pending },
  );
  await page.goto("./#/postboxes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page.getByRole("button", { name: /privacy-lab · key/ }).click();
  const approval = page.getByRole("button", {
    name: "Approve postbox view access",
  });
  await expect(approval).toBeDisabled();
  await expect(
    page.getByText("including amounts and memos for other resources", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).capsuleMethods.includes("tari_requestViewAccess"),
    ),
  ).toBe(false);
  await page
    .getByRole("checkbox", {
      name: "I understand the account-wide private view permission",
    })
    .check();
  await expect(approval).toBeEnabled();
  await approval.click();
  await expect(page.getByRole("status")).toContainText(
    "private view access approved",
  );
  await expect(
    page.getByRole("button", { name: "Publish postbox", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as any).capsuleMethods.filter((m: string) =>
        /sign|submit|createTransaction/.test(m),
      ),
    ),
  ).toEqual([]);
});
