import { test, expect } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";

test("hash links and browser Back keep the selected page in sync", async ({
  page,
}) => {
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: emptyDeployment }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Write a letter", exact: true })
    .click();
  await expect(page.locator(".compose")).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page.goBack();
  await expect(page.locator(".compose")).toBeVisible();
  await page.evaluate(() => {
    location.hash = "#/postboxes";
  });
  await expect(
    page.getByRole("heading", { name: "Your haunted inbox." }),
  ).toBeVisible();
});

test.beforeEach(async ({ page }) => {
  await page.route("**/deployment.json", (route) =>
    route.fulfill({ json: emptyDeployment }),
  );
});

test("Sapient office is the default; advanced edits clear evidence and reset restores it", async ({
  page,
}) => {
  const next = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"2".repeat(64)}`,
    template: "6".repeat(64),
    envelopeTemplate: "7".repeat(64),
    resource: `resource_${"01".repeat(32)}`,
    indexerUrl: "https://fixture-indexer.invalid/",
    postboxClaimProtocol: "sapient-proof-1",
    capsule: {
      template: "3".repeat(64),
      component: `component_${"4".repeat(64)}`,
      resource: `resource_${"5".repeat(64)}`,
    },
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
      sapientWallet: true,
      mailboxRecovery: true,
      postboxClaims: true,
    },
  };
  await page.route("**/deployment.json", (r) => r.fulfill({ json: next }));
  await page.route(`${next.indexerUrl}**`, (r) =>
    r.fulfill({ status: 503, body: "Fixture outage" }),
  );
  await page.goto("./#/network");
  await expect(
    page.getByRole("button", {
      name: /Use original|Use Sapient postbox office/,
    }),
  ).toHaveCount(0);
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await expect(
    page.getByLabel("Registry component", { exact: true }),
  ).toHaveValue(next.registry);
  await expect(
    page.getByText("postboxClaims: recorded by deployer", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Registry component", { exact: true })
    .fill(`component_${"1".repeat(64)}`);
  await expect(
    page.getByText("postboxClaims: unverified", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore default settings" }).click();
  await expect(
    page.getByLabel("Registry component", { exact: true }),
  ).toHaveValue(next.registry);
  await expect(
    page.getByText("postboxClaims: recorded by deployer", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await expect(
    page.getByLabel("Registry component", { exact: true }),
  ).toHaveValue(next.registry);
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
    page.getByText("No live gifts are shown.", { exact: false }),
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
    page.getByRole("button", { name: "Review gift collection" }),
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
  expect(
    await page.locator("main").evaluate((el) => (el as HTMLElement).inert),
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page
    .locator(".compose textarea")
    .evaluate((el) => (el as HTMLElement).focus());
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.locator("main").evaluate((el) => (el as HTMLElement).inert),
  ).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
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
    page.getByText("A private letter for a Sapient postbox.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Private postbox sending is currently unavailable.", {
      exact: false,
    }),
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
    name: "Continue in Sapient",
  });
  await expect(approval).toBeEnabled();
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
  await expect(approval).toBeEnabled();
  await approval.click();
  await expect(page.locator(".message[role=status]")).toContainText(
    "private view access approved",
  );
  await expect(
    page.getByRole("button", { name: "2 of 2 · Open my postbox", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as any).capsuleMethods.filter((m: string) =>
        /sign|submit|createTransaction/.test(m),
      ),
    ),
  ).toEqual([]);
});

test("everyday Sapient inbox and Activity have honest empty states", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Open my inbox", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your haunted inbox." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Sapient for my inbox" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No deliveries yet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Activity", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("TARI gift input reviews exact micro amounts and resets collection funds for a giftless note", async ({
  page,
}) => {
  await page.goto("./#/compose");
  await page.getByLabel("Subject", { exact: true }).fill("A little kindness");
  await page.getByLabel("Your letter").fill("Keep the exact tiny amount.");
  await page.getByLabel("Gift amount (optional)").fill("1.234567");
  await expect(page.getByLabel("Set aside for collection fees")).toHaveValue(
    "0.1",
  );
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await expect(page.locator(".receipt")).toContainText("1.234567 TARI");
  await expect(page.locator(".receipt")).toContainText("1.334567 TARI");
  await page.getByLabel("Gift amount (optional)").fill("0");
  await expect(page.locator(".review")).toHaveCount(0);
  await expect(page.getByLabel("Set aside for collection fees")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await expect(page.locator(".receipt")).toContainText("0 TARI");
  await page.getByLabel("Gift amount (optional)").fill("1.1234567");
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await expect(page.locator(".review")).toHaveCount(0);
  expect(
    await page
      .getByLabel("Gift amount (optional)")
      .evaluate((el: HTMLInputElement) => el.validity.valid),
  ).toBe(false);
});
