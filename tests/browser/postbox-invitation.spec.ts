import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import {
  createPostboxLink,
  parsePostboxLink,
} from "../../src/core/postbox-links";
const d = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  envelopeTemplate: "c".repeat(64),
  indexerUrl: "https://fixture-indexer.invalid/",
};
const id = "unlisted-friend";
const key = JSON.stringify({
  version: "gd-postbox-1",
  keyVersion: 1,
  publicKey: "6".repeat(64),
});
function ledger(controller = "7".repeat(64), include = true) {
  return {
    substate: {
      Component: {
        header: { template_address: d.template, owner_rule: "None" },
        body: {
          state: [
            38,
            {},
            include
              ? { [id]: [id, "Moonlit Friend", controller, key, false] }
              : {},
            `template_${d.envelopeTemplate}`,
          ],
        },
      },
    },
  };
}
async function configure(page: Page) {
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
}
const invitationHash = (context = d, postbox = id) =>
  new URL(
    createPostboxLink("https://example.com/GhostDrop/", {
      id: postbox,
      context,
    }),
  ).hash;
async function noWrites(page: Page) {
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(await page.evaluate(() => (window as any).tari)).toBeUndefined();
}

test("an unlisted invitation verifies its full ID and asks before starting a draft", async ({
  page,
}) => {
  await configure(page);
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: ledger() });
  });
  await page.goto("./" + invitationHash());
  const invitation = page.getByRole("region", { name: "Postbox invitation" });
  await expect(
    invitation.getByRole("heading", { name: "Write to Moonlit Friend" }),
  ).toBeVisible();
  await expect(invitation).toContainText(id);
  await expect(invitation.getByRole("heading")).toBeFocused();
  await expect(page.getByLabel("Recipient postbox ID")).toHaveCount(0);
  await noWrites(page);
  await page.screenshot({
    path: test.info().outputPath("postbox-invitation.png"),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await invitation
    .getByRole("button", { name: "Use this postbox for my letter" })
    .click();
  await expect(page.getByLabel("Recipient postbox ID")).toHaveValue(id);
  await expect(
    page.getByLabel("Recipient postbox", { exact: true }),
  ).toHaveValue(id);
  await expect(
    page.getByRole("option", {
      name: "Moonlit Friend · Unlisted · unlisted-friend",
    }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "▥ To a postbox" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(invitation).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Send something unexpected." }),
  ).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Postbox invitation" }),
  ).toHaveCount(0);
  expect(writes).toBe(0);
  await noWrites(page);
});

test("opening, dismissing and accepting an invitation preserve the existing subject, body and gift", async ({
  page,
}) => {
  await configure(page);
  await page.route(`${d.indexerUrl}**`, (r) => r.fulfill({ json: ledger() }));
  await page.goto("./#/compose");
  await page.getByLabel("Subject", { exact: true }).fill("My unsent letter");
  await page.getByLabel("Your letter").fill("This text must stay here.");
  await page.getByLabel("Gift amount (optional)").fill("2.5");
  await page.evaluate((hash) => {
    location.hash = hash;
  }, invitationHash());
  const invitation = page.getByRole("region", { name: "Postbox invitation" });
  await expect(
    invitation.getByRole("button", { name: "Use this postbox for my letter" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "⌘ Private link" }),
  ).toHaveAttribute("aria-pressed", "true");
  await invitation.getByRole("button", { name: "Dismiss invitation" }).click();
  await expect(invitation).toHaveCount(0);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "My unsent letter",
  );
  await page.evaluate((hash) => {
    location.hash = hash;
  }, invitationHash());
  await invitation
    .getByRole("button", { name: "Use this postbox for my letter" })
    .click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "My unsent letter",
  );
  await expect(page.getByLabel("Your letter")).toHaveValue(
    "This text must stay here.",
  );
  await expect(page.getByLabel("Gift amount (optional)")).toHaveValue("2.5");
  await expect(page.getByLabel("Recipient postbox ID")).toHaveValue(id);
  await noWrites(page);
});

for (const change of [
  { network: 36 },
  { registry: `component_${"d".repeat(64)}` },
  { template: "e".repeat(64) },
]) {
  test(`a different ${Object.keys(change)[0]} cannot silently switch office or select a recipient`, async ({
    page,
  }) => {
    await configure(page);
    let writes = 0;
    await page.route(`${d.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") writes++;
      return r.fulfill({ json: ledger() });
    });
    await page.goto("./" + invitationHash({ ...d, ...change }));
    const invitation = page.getByRole("region", { name: "Postbox invitation" });
    await expect(invitation).toContainText("different post office or network");
    await expect(
      invitation.getByRole("button", {
        name: "Use this postbox for my letter",
      }),
    ).toBeDisabled();
    await invitation
      .getByRole("button", { name: "Dismiss invitation" })
      .click();
    await expect(invitation).toHaveCount(0);
    expect(writes).toBe(0);
    await noWrites(page);
  });
}

test("unknown and temporarily unavailable postboxes can be rechecked without choosing them", async ({
  page,
}) => {
  await configure(page);
  let unavailable = true,
    include = false,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return unavailable
      ? r.fulfill({ status: 503, body: "offline" })
      : r.fulfill({ json: ledger(undefined, include) });
  });
  await page.goto("./" + invitationHash());
  const invitation = page.getByRole("region", { name: "Postbox invitation" });
  const choose = invitation.getByRole("button", {
    name: "Use this postbox for my letter",
  });
  await expect(invitation).toContainText("could not be reached");
  await expect(choose).toBeDisabled();
  unavailable = false;
  await invitation.getByRole("button", { name: "Refresh invitation" }).click();
  await expect(invitation).toContainText("not registered");
  await expect(choose).toBeDisabled();
  include = true;
  await invitation.getByRole("button", { name: "Refresh invitation" }).click();
  await expect(choose).toBeEnabled();
  expect(writes).toBe(0);
  await noWrites(page);
});

test("post office settings and a delayed registry read must finish before a recipient can be chosen", async ({
  page,
}) => {
  let releaseConfig!: () => void, releaseRead!: () => void;
  const config = new Promise<void>((r) => (releaseConfig = r)),
    read = new Promise<void>((r) => (releaseRead = r));
  await page.route("**/deployment.json", async (r) => {
    await config;
    await r.fulfill({ json: d });
  });
  await page.route(`${d.indexerUrl}**`, async (r) => {
    await read;
    await r.fulfill({ json: ledger() });
  });
  await page.goto("./" + invitationHash());
  const invitation = page.getByRole("region", { name: "Postbox invitation" });
  const choose = invitation.getByRole("button", {
    name: "Use this postbox for my letter",
  });
  await expect(invitation).toContainText("Loading the selected post office");
  await expect(choose).toBeDisabled();
  await expect(invitation).not.toContainText("different post office");
  releaseConfig();
  await expect(invitation).toContainText("Checking this postbox");
  await expect(choose).toBeDisabled();
  releaseRead();
  await expect(choose).toBeEnabled();
  await noWrites(page);
});

test("the owner can copy an unlisted public invitation without private view or financial methods", async ({
  page,
}) => {
  await configure(page);
  const owner = generateKeypair(),
    view = generateKeypair();
  const controller = Buffer.from(owner.public_key).toString("hex"),
    address = generateOotleAddress(owner.public_key, view.public_key, 38),
    account = `component_${"f".repeat(64)}`;
  owner.free();
  view.free();
  await page.route(`${d.indexerUrl}**`, (r) =>
    r.fulfill({ json: ledger(controller) }),
  );
  await page.addInitScript(
    ({ address, account }) => {
      const w = window as any;
      w.walletCalls = [];
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: any) => {
          w.walletCalls.push(method);
          if (method === "tari_getNetwork") return "esmeralda";
          if (
            method === "tari_requestAccounts" ||
            method === "tari_getAccounts"
          )
            return [account];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_disconnect") return null;
          throw new Error("Unexpected method " + method);
        },
      };
    },
    { address, account },
  );
  await page.goto("./#/postboxes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page.getByRole("button", { name: "Not now", exact: true }).click();
  await page.locator(".mailbox-address-settings > summary").click();
  const input = page.getByLabel("My postbox invitation", { exact: true });
  await expect(input).toBeVisible();
  const value = await input.inputValue();
  const u = new URL(value);
  expect(u.pathname).toBe("/GhostDrop/");
  expect(parsePostboxLink(u.hash)).toEqual({
    id,
    context: { network: d.network, registry: d.registry, template: d.template },
  });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("not available");
        },
      },
    });
  });
  await page.getByRole("button", { name: "Copy postbox invitation" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "copy it manually" }),
  ).toBeVisible();
  await expect(input).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("postbox-invitation-share.png"),
  });
  expect(
    (await page.evaluate(() => (window as any).walletCalls)).some((m: string) =>
      /View|Transaction|Ownership/.test(m),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});
