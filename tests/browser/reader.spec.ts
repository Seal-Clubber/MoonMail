import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { sealLetter } from "../../src/core/crypto";
import { createGiftLink } from "../../src/core/links";
import { createPublicLetterLink } from "../../src/core/public-letter-links";

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
              { recovered: envelope } as Record<string, string>,
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
  await page.goto("./#/hall");
  await expect(page.getByRole("alert")).toContainText("Could not read");
  await expect(
    page.getByText("The spirits could not reach the post office."),
  ).toBeVisible();
  await expect(
    page.getByText("The spirits are fetching your mail."),
  ).toHaveCount(0);
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
  await expect(
    page.getByRole("status").filter({ hasText: "Mail is up to date" }),
  ).toBeVisible();
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
  await page.goto("./#/hall");
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

test("directory searches all public registrations despite old unlisted flags and starts an addressed draft", async ({
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
  await page.goto("./#/compose");
  await page
    .getByRole("button", { name: "⌘ Private link", exact: true })
    .click();
  await page.getByLabel("Subject", { exact: true }).fill("A directory draft");
  await page.getByLabel("Your letter").fill("These words stay with the draft.");
  await page.getByLabel("Gift amount (optional)").fill("1.5");
  await page.evaluate(() => {
    location.hash = "#/ledger";
  });
  await expect(
    page.getByRole("heading", { name: "Moonlit Friend", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Unlisted Friend", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find a postbox").fill("secret");
  await expect(
    page.getByRole("button", { name: "Write to Unlisted Friend" }),
  ).toBeVisible();
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
    page.getByRole("button", { name: "▥ Private mail" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", {
      name: /Send encrypted letter|Publish publicly/,
    }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "A directory draft",
  );
  await expect(page.getByLabel("Your letter")).toHaveValue(
    "These words stay with the draft.",
  );
  await expect(page.getByLabel("Gift amount (optional)")).toHaveValue("1.5");
  await expect(
    page.getByRole("heading", { name: "Compose a letter." }),
  ).toBeFocused();
});

test("guest gift review requires a separate confirmation and forgets abandoned destinations", async ({
  page,
}) => {
  const giftDeployment = {
    ...deployment,
    resource: `resource_${"01".repeat(32)}`,
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
      guestAccountCreation: true,
    },
  };
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: giftDeployment }),
  );
  let posts = 0;
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") posts++;
    const response = state(r.request().url());
    if (r.request().url().includes(envelope)) {
      const data = response.substate!.Component.body.state;
      data[4] = "2500000";
      data[5] = "100000";
    }
    return r.fulfill({ json: response });
  });
  await page.addInitScript(() => {
    (window as any).walletCalls = 0;
    (window as any).tari = {
      isTariWallet: true,
      info: { name: "Sapient fixture", rdns: "mw.tari.sapient" },
      request: async () => {
        (window as any).walletCalls++;
        throw new Error("No wallet request expected");
      },
    };
  });
  await page.goto("./#/hall");
  const letter = page.getByRole("button", { name: subject, exact: false });
  await expect(letter).toHaveCSS("animation-name", "none");
  if (test.info().project.name === "mobile") {
    await expect(letter.locator(".envelope-visual")).toHaveCSS(
      "animation-name",
      "none",
    );
  }
  await letter.click();
  const dialog = page.getByRole("dialog");
  const reviewButton = dialog.getByRole("button", {
    name: "Review gift collection",
  });
  await expect(reviewButton).toBeDisabled();
  const receiveAddress = "otl_esm_fixture_full_destination";
  const receiveAccount = `component_${"9".repeat(64)}`;
  await dialog.getByLabel("Ootle receiving address").fill(receiveAddress);
  await dialog
    .getByLabel("Existing built-in account component")
    .fill(receiveAccount);
  await reviewButton.click();
  const review = dialog.getByRole("region", {
    name: "Send this gift to your wallet?",
  });
  await expect(review).toContainText("2.5 test TARI");
  await expect(review).toContainText("0.1 TARI, from the sender’s reserve");
  await expect(review).toContainText("Esmeralda testnet");
  await expect(review).toContainText(receiveAddress);
  await expect(review).toContainText(receiveAccount);
  await expect(dialog.getByLabel("Ootle receiving address")).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Connect Sapient to receive" }),
  ).toBeDisabled();
  await expect(
    review.getByRole("button", { name: "Confirm & collect gift" }),
  ).toBeEnabled();
  await review.getByRole("button", { name: "Change destination" }).click();
  await dialog.getByLabel("Create a new receiving account").check();
  await reviewButton.click();
  await expect(review).toContainText(
    "Create a new built-in account for this address",
  );
  await expect(review).not.toContainText(receiveAccount);
  await dialog.getByRole("button", { name: "Close letter" }).click();
  await letter.click();
  await expect(review).toHaveCount(0);
  await expect(dialog.getByLabel("Ootle receiving address")).toHaveValue("");
  await expect(
    dialog.getByLabel("Create a new receiving account"),
  ).not.toBeChecked();
  await expect(reviewButton).toBeDisabled();
  expect(posts).toBe(0);
  expect(await page.evaluate(() => (window as any).walletCalls)).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const problem of ["unavailable", "malformed"] as const) {
  test(`one ${problem} letter cannot hide verified hall mail; retry recovers it`, async ({
    page,
  }) => {
    await configure(page);
    const broken = `component_${"6".repeat(64)}`;
    let failing = true,
      writes = 0;
    await page.route(`${deployment.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") {
        writes++;
        return r.abort();
      }
      const url = r.request().url();
      if (url.includes(deployment.registry)) {
        const response = state(url);
        response.substate!.Component.body.state[1] = {
          recovered: envelope,
          unavailable: broken,
        };
        return r.fulfill({ json: response });
      }
      if (url.includes(broken)) {
        if (failing && problem === "unavailable")
          return r.fulfill({ status: 503, body: "Fixture outage" });
        const response = state(`/${envelope}`);
        const data = response.substate!.Component.body.state;
        data[1] = "unavailable";
        data[3] = failing
          ? "invalid encrypted-or-public JSON"
          : JSON.stringify({
              subject: "Recovered second letter",
              body: "The other letter can now be read.",
            });
        return r.fulfill({ json: response });
      }
      return r.fulfill({ json: state(url) });
    });
    await page.goto("./#/hall");
    await expect(
      page.getByRole("button", { name: subject, exact: false }),
    ).toBeVisible();
    const notice = page.locator(".mail-read-notice");
    await expect(notice).toContainText("1 letter could not be read");
    await expect(
      page.getByRole("status").filter({ hasText: "Loaded available mail" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /invalid encrypted-or-public JSON/ }),
    ).toHaveCount(0);
    await notice.getByText("Which letters?", { exact: true }).click();
    await expect(notice).toContainText("unavailable");
    failing = false;
    await notice
      .getByRole("button", { name: "Retry unavailable mail" })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Recovered second letter",
        exact: false,
      }),
    ).toBeVisible();
    await expect(notice).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Mail is up to date" }),
    ).toBeVisible();
    expect(writes).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("all unreadable letters show a retry state rather than an empty post office", async ({
  page,
}) => {
  await configure(page);
  let failing = true;
  await page.route(`${deployment.indexerUrl}**`, (route) => {
    const url = route.request().url();
    return url.includes(envelope) && failing
      ? route.fulfill({ status: 503, body: "Fixture outage" })
      : route.fulfill({ json: state(url) });
  });
  await page.goto("./#/hall");
  await expect(
    page.getByText("Some mail is waiting for another read."),
  ).toBeVisible();
  await expect(page.getByText("The hall is quiet.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Write the first letter", exact: false }),
  ).toHaveCount(0);
  await expect(page.locator(".envelope-card")).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry unavailable mail" }).click();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toBeVisible();
  await expect(page.locator(".mail-read-notice")).toHaveCount(0);
});

test("a failed refresh keeps loaded mail visible with an honest retry notice", async ({
  page,
}) => {
  await configure(page);
  let failing = false,
    writes = 0;
  await page.route(`${deployment.indexerUrl}**`, (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return failing
      ? route.fulfill({ status: 503, body: "Fixture outage" })
      : route.fulfill({ json: state(route.request().url()) });
  });
  await page.goto("./#/hall");
  const letter = page.getByRole("button", { name: subject, exact: false });
  await expect(letter).toBeVisible();
  failing = true;
  await page.getByRole("button", { name: "↻ Refresh", exact: true }).click();
  await expect(page.getByText("Mail could not be refreshed.")).toBeVisible();
  await expect(
    page.getByText(
      "Previously loaded mail is still here. Use Refresh to try again.",
    ),
  ).toBeVisible();
  await expect(letter).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Mail is up to date" }),
  ).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "↻ Refresh", exact: true }).click();
  await expect(page.getByText("Mail could not be refreshed.")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Mail is up to date" }),
  ).toBeVisible();
  expect(writes).toBe(0);
});

for (const failure of ["outage", "ciphertext"] as const) {
  test(`private-link ${failure} can retry in-tab without leaking its capability`, async ({
    page,
  }) => {
    await configure(page);
    const sealed = await sealLetter(
      {
        subject: "A secret rescued in this tab",
        body: "Only the private link can open this note.",
      },
      deployment,
      "recovered",
    );
    let reads = 0,
      failing = true,
      writes = 0;
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.route(`${deployment.indexerUrl}**`, (route) => {
      if (route.request().method() !== "GET") {
        writes++;
        return route.abort();
      }
      const url = route.request().url(),
        response = state(url);
      if (url.includes(envelope)) {
        reads++;
        if (reads > 1 && failing && failure === "outage")
          return route.fulfill({
            status: 503,
            body: "Fixture private-link outage",
          });
        const payload = { ...sealed.payload };
        if (reads > 1 && failing && failure === "ciphertext")
          payload.ciphertext = `${payload.ciphertext[0] === "A" ? "B" : "A"}${payload.ciphertext.slice(1)}`;
        const data = response.substate!.Component.body.state;
        data[2] = 1;
        data[3] = JSON.stringify(payload);
        data[7] = payload.claimPublicKey;
      }
      return route.fulfill({ json: response });
    });
    const base = String(test.info().project.use.baseURL);
    await page.goto(
      createGiftLink(base, {
        id: "recovered",
        capability: sealed.capability,
        context: deployment,
      }),
    );
    const pane = page.getByRole("status", { name: "Private letter status" });
    await expect(pane).toContainText("Your private letter could not open.");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(page.url()).not.toContain(sealed.capability);
    expect(requests.every((url) => !url.includes(sealed.capability))).toBe(
      true,
    );
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    failing = false;
    await pane.getByRole("button", { name: "Retry private letter" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("A secret rescued in this tab");
    await expect(dialog).toContainText(
      "Only the private link can open this note.",
    );
    await expect(pane).toHaveCount(0);
    expect(page.url()).not.toContain(sealed.capability);
    expect(requests.every((url) => !url.includes(sealed.capability))).toBe(
      true,
    );
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(writes).toBe(0);
    await dialog.getByRole("button", { name: "Close letter" }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("dismissing an opening private link cancels late decryption results", async ({
  page,
}) => {
  await configure(page);
  const sealed = await sealLetter(
    { subject: "Dismissed secret", body: "Must never reopen after dismissal" },
    deployment,
    "recovered",
  );
  let reads = 0;
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`${deployment.indexerUrl}**`, async (route) => {
    const url = route.request().url(),
      response = state(url);
    if (url.includes(envelope)) {
      reads++;
      if (reads > 1) {
        started();
        await held;
      }
      const data = response.substate!.Component.body.state;
      data[2] = 1;
      data[3] = JSON.stringify(sealed.payload);
      data[7] = sealed.payload.claimPublicKey;
    }
    return route.fulfill({ json: response });
  });
  await page.goto(
    createGiftLink(String(test.info().project.use.baseURL), {
      id: "recovered",
      capability: sealed.capability,
      context: deployment,
    }),
  );
  await requested;
  await page.getByRole("button", { name: "Dismiss private letter" }).click();
  const completed = page.waitForResponse((response) =>
    response.url().includes(envelope),
  );
  release();
  await completed;
  await expect(
    page.getByRole("status", { name: "Private letter status" }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Dismissed secret", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(page.url()).toContain("#/hall");
  expect(page.url()).not.toContain(sealed.capability);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("optional Sapient connection returns to the same public gift and restores its original trigger", async ({
  page,
}) => {
  await configure(page);
  let writes = 0;
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    const response = state(r.request().url());
    if (r.request().url().includes(envelope)) {
      const data = response.substate!.Component.body.state;
      data[4] = "1000000";
      data[5] = "100000";
    }
    return r.fulfill({ json: response });
  });
  await page.goto("./#/hall");
  const trigger = page.getByRole("button", { name: subject, exact: false });
  await trigger.click();
  const letter = page.getByRole("dialog", { name: subject, exact: true });
  await expect(letter).toContainText("The selected post office is back.");
  await letter
    .getByRole("button", { name: "Connect Sapient to receive" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "Connect Sapient", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(letter).toBeVisible();
  await expect(letter).toContainText("The selected post office is back.");
  await expect(letter.getByLabel("Ootle receiving address")).toHaveValue("");
  await letter.getByRole("button", { name: "Close letter" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.locator("main").evaluate((el) => (el as HTMLElement).inert),
  ).toBe(false);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  expect(writes).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

async function configureReply(page: Page, registered = true) {
  await configure(page);
  let writes = 0;
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const response = state(r.request().url());
    const data = response.substate?.Component.body.state as
      | unknown[]
      | undefined;
    if (data && r.request().url().includes(deployment.registry)) {
      data[2] = registered
        ? {
            "reply-spirit": [
              "reply-spirit",
              "Reply Spirit",
              "5".repeat(64),
              JSON.stringify({
                version: "gd-postbox-1",
                keyVersion: 1,
                publicKey: "6".repeat(64),
              }),
              false,
            ],
          }
        : {};
    }
    if (data && r.request().url().includes(envelope)) data[9] = "reply-spirit";
    return r.fulfill({ json: response });
  });
  return async () => {
    expect(writes).toBe(0);
    expect(await page.evaluate(() => (window as any).tari)).toBeUndefined();
    expect(
      await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
    ).toBeNull();
  };
}

for (const throughPublicLink of [false, true]) {
  test(`reply preserves the complete existing draft and focuses it from ${throughPublicLink ? "a public permalink over compose" : "the hall"}`, async ({
    page,
  }) => {
    const noWrites = await configureReply(page);
    await page.goto("./#/compose");
    await page
      .getByRole("button", { name: "⌘ Private link", exact: true })
      .click();
    await page.getByLabel("Subject", { exact: true }).fill("My unsent subject");
    await page
      .getByLabel("Your letter")
      .fill("Keep these carefully written words.");
    await page.getByLabel("Gift amount (optional)").fill("2.5");
    await page.getByLabel("Set aside for collection fees").fill("0.1");
    if (throughPublicLink) {
      const hash = new URL(
        createPublicLetterLink("https://example.com/MoonMail/", {
          id: "recovered",
          context: deployment,
        }),
      ).hash;
      await page.evaluate((value) => {
        location.hash = value;
      }, hash);
    } else {
      await page
        .getByRole("button", { name: "Public mail", exact: true })
        .click();
      await page.getByRole("button", { name: subject, exact: false }).click();
    }
    await page.getByRole("button", { name: "Reply to this spirit" }).click();
    await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
      "My unsent subject",
    );
    await expect(page.getByLabel("Your letter")).toHaveValue(
      "Keep these carefully written words.",
    );
    await expect(page.getByLabel("Gift amount (optional)")).toHaveValue("2.5");
    await expect(page.getByLabel("Set aside for collection fees")).toHaveValue(
      "0.1",
    );
    await expect(page.getByLabel("Recipient postbox ID")).toHaveValue(
      "reply-spirit",
    );
    await expect(
      page.getByLabel("Recipient postbox", { exact: true }),
    ).toHaveValue("reply-spirit");
    await expect(
      page.getByRole("heading", { name: "Compose a letter." }),
    ).toBeFocused();
    await expect(
      page.getByRole("button", {
        name: /Send encrypted letter|Publish publicly/,
      }),
    ).toHaveCount(0);
    await noWrites();
  });
}

test("an empty writing desk receives a suggested reply subject without a gift or automatic wallet connection", async ({
  page,
}) => {
  const noWrites = await configureReply(page);
  await page.goto("./#/hall");
  await page.getByRole("button", { name: subject, exact: false }).click();
  await page.getByRole("button", { name: "Reply to this spirit" }).click();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    `Re: ${subject}`,
  );
  await expect(page.getByLabel("Your letter")).toHaveValue("");
  await expect(page.getByLabel("Gift amount (optional)")).toHaveValue("0");
  await expect(page.getByLabel("Recipient postbox ID")).toHaveValue(
    "reply-spirit",
  );
  await expect(
    page.getByRole("heading", { name: "Compose a letter." }),
  ).toBeFocused();
  await noWrites();
});

test("an unknown reply postbox offers no recipient shortcut", async ({
  page,
}) => {
  const noWrites = await configureReply(page, false);
  await page.goto("./#/hall");
  await page.getByRole("button", { name: subject, exact: false }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reply to this spirit" }),
  ).toHaveCount(0);
  await noWrites();
});

for (const target of ["identity", "registry"] as const)
  test(`a stalled initial ${target} read exits loading and retries without a financial action`, async ({
    page,
  }) => {
    await configure(page);
    await page.clock.install();
    let stalled = true,
      writes = 0,
      release!: () => void,
      started!: () => void;
    const pending = new Promise<void>((r) => (release = r)),
      requested = new Promise<void>((r) => (started = r));
    await page.route(`${deployment.indexerUrl}**`, async (r) => {
      if (r.request().method() !== "GET") writes++;
      const matches =
        target === "identity"
          ? new URL(r.request().url()).pathname === "/identity"
          : r.request().url().includes(deployment.registry);
      if (stalled && matches) {
        started();
        await pending;
      }
      await r.fulfill({ json: state(r.request().url()) });
    });
    await page.goto("./#/hall");
    await requested;
    await page.clock.runFor(15_001);
    await expect(page.getByRole("alert")).toContainText(
      "Could not read the post office",
    );
    const retry = page.getByRole("button", { name: "↻ Refresh", exact: true });
    await expect(retry).toBeEnabled();
    await expect(
      page.getByRole("button", { name: subject, exact: false }),
    ).toHaveCount(0);
    const done = page.waitForResponse((r) =>
      target === "identity"
        ? new URL(r.url()).pathname === "/identity"
        : r.url().includes(deployment.registry),
    );
    release();
    await done;
    await expect(
      page.getByRole("button", { name: subject, exact: false }),
    ).toHaveCount(0);
    stalled = false;
    await retry.click();
    await expect(
      page.getByRole("button", { name: subject, exact: false }),
    ).toBeVisible();
    expect(writes).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
    ).toBeNull();
  });

test("a stalled hall refresh retains previously verified mail and releases its retry control", async ({
  page,
}) => {
  await configure(page);
  let hold = false,
    writes = 0,
    release!: () => void,
    started!: () => void;
  const pending = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (started = r));
  await page.route(`${deployment.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") writes++;
    if (hold && r.request().url().includes(deployment.registry)) {
      started();
      await pending;
    }
    await r.fulfill({ json: state(r.request().url()) });
  });
  await page.goto("./#/hall");
  const letter = page.getByRole("button", { name: subject, exact: false }),
    retry = page.getByRole("button", { name: "↻ Refresh", exact: true });
  await expect(letter).toBeVisible();
  await page.clock.install();
  hold = true;
  await retry.click();
  await requested;
  await page.clock.runFor(15_001);
  await expect(page.getByText("Mail could not be refreshed.")).toBeVisible();
  await expect(letter).toBeVisible();
  await expect(retry).toBeEnabled();
  const done = page.waitForResponse((r) =>
    r.url().includes(deployment.registry),
  );
  release();
  await done;
  await expect(page.getByText("Mail could not be refreshed.")).toBeVisible();
  hold = false;
  await retry.click();
  await expect(page.getByText("Mail could not be refreshed.")).toHaveCount(0);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});

for (const damage of ["context", "identifier", "path"] as const)
  test(`a damaged private ${damage} link clears its secret before rejection and history navigation`, async ({
    page,
  }) => {
    await configure(page);
    const sealed = await sealLetter(
      { subject: "A synthetic secret", body: "No opening should occur." },
      deployment,
      "recovered",
    );
    let targetReads = 0,
      writes = 0;
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.route(`${deployment.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") writes++;
      if (r.request().url().includes(envelope)) targetReads++;
      // The ordinary hall is empty; a rejected private route must never read its target.
      const response = state(r.request().url());
      if (r.request().url().includes(deployment.registry))
        response.substate!.Component.body.state[1] = {};
      return r.fulfill({ json: response });
    });
    const u = new URL(
      createGiftLink(String(test.info().project.use.baseURL), {
        id: "recovered",
        capability: sealed.capability,
        context: deployment,
      }),
    );
    if (damage === "context")
      u.hash = u.hash.replace(`&template=${deployment.template}`, "");
    else if (damage === "identifier")
      u.hash = u.hash.replace("/recovered/", "/%E0%A4/");
    else u.hash = u.hash.replace("?network=", "/unexpected?network=");
    await page.goto(u.href);
    await expect(page.getByRole("alert")).toBeVisible();
    expect(page.url().includes(sealed.capability)).toBe(false);
    await expect(page.getByRole("alert")).toContainText(
      "complete private link",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Compose", exact: true }).click();
    await page.goBack();
    expect(page.url().includes(sealed.capability)).toBe(false);
    await page.reload();
    expect(page.url().includes(sealed.capability)).toBe(false);
    await page.goForward();
    expect(page.url().includes(sealed.capability)).toBe(false);
    expect(requests.some((url) => url.includes(sealed.capability))).toBe(false);
    expect(targetReads).toBe(0);
    expect(writes).toBe(0);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    expect(await page.evaluate(() => !!(window as any).tari)).toBe(false);
  });

test("a late initial settings download preserves the visitor's selected office", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/deployment.json", async (r) => {
    await held;
    await r.fulfill({ json: deployment });
  });
  let reads = 0;
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    reads++;
    return r.fulfill({ json: state(r.request().url()) });
  });
  await page.goto("./#/network");
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await page.getByLabel("Ootle test network").selectOption("16");
  await page.getByLabel("Indexer endpoint").fill("http://localhost:12345/");
  const done = page.waitForResponse((r) => r.url().endsWith("deployment.json"));
  release();
  await done;
  await expect(page.getByLabel("Ootle test network")).toHaveValue("16");
  await expect(page.getByLabel("Indexer endpoint")).toHaveValue(
    "http://localhost:12345/",
  );
  await expect(
    page.getByLabel("Registry component", { exact: true }),
  ).toHaveValue("");
  expect(reads).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("a stalled initial settings download offers an explicit retry and ignores its late answer", async ({
  page,
}) => {
  await page.clock.install();
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let attempts = 0;
  await page.route("**/deployment.json", async (r) => {
    const attempt = ++attempts;
    if (attempt === 1) await held;
    await r.fulfill({
      json: attempt === 1 ? { ...deployment, network: 16 } : deployment,
    });
  });
  await page.route(`${deployment.indexerUrl}**`, (r) =>
    r.fulfill({ json: state(r.request().url()) }),
  );
  await page.goto("./#/hall");
  await expect.poll(() => attempts).toBe(1);
  await page.clock.runFor(15_100);
  const retry = page.getByRole("button", { name: "Retry loading post office" });
  await expect(retry).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText(
    "settings could not load",
  );
  await retry.click();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toBeVisible();
  await expect(retry).toHaveCount(0);
  const done = page.waitForResponse((r) => r.url().endsWith("deployment.json"));
  release();
  await done;
  await page.getByRole("button", { name: "Settings", exact: false }).click();
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await expect(page.getByLabel("Ootle test network")).toHaveValue("38");
  expect(attempts).toBe(2);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("a stalled restore preserves the current office and releases its controls", async ({
  page,
}) => {
  await page.clock.install();
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  let attempts = 0;
  await page.route("**/deployment.json", async (r) => {
    if (++attempts === 2) await held;
    await r.fulfill({ json: deployment });
  });
  await page.route(`${deployment.indexerUrl}**`, (r) =>
    r.fulfill({ json: state(r.request().url()) }),
  );
  await page.goto("./#/network");
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await expect(
    page.getByLabel("Registry component", { exact: true }),
  ).toHaveValue(deployment.registry);
  const restore = page.getByRole("button", {
    name: "Restore default settings",
  });
  await restore.click();
  await expect(restore).toBeDisabled();
  await page.clock.runFor(15_100);
  await expect(restore).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText("Try");
  await expect(
    page.getByLabel("Registry component", { exact: true }),
  ).toHaveValue(deployment.registry);
  await page.getByLabel("Ootle test network").selectOption("16");
  const done = page.waitForResponse((r) => r.url().endsWith("deployment.json"));
  release();
  await done;
  await expect(page.getByLabel("Ootle test network")).toHaveValue("16");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("a malformed settings profile leaves the site usable for an explicit retry", async ({
  page,
}) => {
  let malformed = true;
  await page.route("**/deployment.json", (r) =>
    r.fulfill({ json: malformed ? null : deployment }),
  );
  await page.route(`${deployment.indexerUrl}**`, (r) =>
    r.fulfill({ json: state(r.request().url()) }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./#/hall");
  const retry = page.getByRole("button", { name: "Retry loading post office" });
  await expect(retry).toBeEnabled();
  malformed = false;
  await retry.click();
  await expect(
    page.getByRole("button", { name: subject, exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("retrying the first settings load retains an incoming private link only in memory", async ({
  page,
}) => {
  await page.clock.install();
  const sealed = await sealLetter(
    {
      subject: "A secret after settings recover",
      body: "The original incoming link still opens.",
    },
    deployment,
    "recovered",
  );
  let attempts = 0,
    writes = 0;
  const requests: string[] = [];
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/deployment.json", async (r) => {
    if (++attempts === 1) await held;
    await r.fulfill({ json: deployment });
  });
  page.on("request", (r) => requests.push(r.url()));
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const response = state(r.request().url());
    if (r.request().url().includes(envelope)) {
      const data = response.substate!.Component.body.state;
      data[2] = 1;
      data[3] = JSON.stringify(sealed.payload);
      data[7] = sealed.payload.claimPublicKey;
    }
    return r.fulfill({ json: response });
  });
  await page.goto(
    createGiftLink(String(test.info().project.use.baseURL), {
      id: "recovered",
      capability: sealed.capability,
      context: deployment,
    }),
  );
  await expect.poll(() => attempts).toBe(1);
  expect(page.url().includes(sealed.capability)).toBe(false);
  await page.clock.runFor(15_100);
  await page.getByRole("button", { name: "Retry loading post office" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "A secret after settings recover" }),
  ).toBeVisible();
  await expect(dialog).toContainText("The original incoming link still opens.");
  const done = page.waitForResponse((r) => r.url().endsWith("deployment.json"));
  release();
  await done;
  await expect(dialog).toBeVisible();
  expect(requests.some((url) => url.includes(sealed.capability))).toBe(false);
  expect(page.url().includes(sealed.capability)).toBe(false);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(await page.evaluate(() => !!(window as any).tari)).toBe(false);
  expect(writes).toBe(0);
});

for (const movedFocus of [false, true])
  test(`a stalled receiving-account check releases collection review and ${movedFocus ? "preserves moved focus" : "restores keyboard focus"}`, async ({
    page,
  }) => {
    await page.clock.install();
    const owner = generateKeypair(),
      view = generateKeypair();
    const address = generateOotleAddress(owner.public_key, view.public_key, 38);
    const controller = Buffer.from(owner.public_key).toString("hex");
    owner.free();
    view.free();
    const account = `component_${"9".repeat(64)}`;
    const d = {
      ...deployment,
      resource: `resource_${"01".repeat(32)}`,
      evidence: {
        ...emptyDeployment.evidence,
        engineClaims: true,
        guestPayout: true,
      },
    };
    await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
    let started!: () => void, release!: () => void;
    const requested = new Promise<void>((r) => (started = r)),
      held = new Promise<void>((r) => (release = r));
    let writes = 0;
    await page.route(`${d.indexerUrl}**`, async (r) => {
      if (r.request().method() !== "GET") {
        writes++;
        return r.abort();
      }
      const response = state(r.request().url());
      if (r.request().url().includes(account)) {
        started();
        await held;
        return r.fulfill({
          json: {
            substate: {
              Component: {
                header: {
                  template_address: "0".repeat(64),
                  owner_rule: { ByPublicKey: controller },
                },
                body: { state: [] },
              },
            },
          },
        });
      }
      if (r.request().url().includes(envelope)) {
        response.substate!.Component.body.state[4] = "100000";
        response.substate!.Component.body.state[5] = "50000";
      }
      return r.fulfill({ json: response });
    });
    await page.goto("./#/hall");
    await page.getByRole("button", { name: subject, exact: false }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Ootle receiving address").fill(address);
    await dialog
      .getByLabel("Existing built-in account component")
      .fill(account);
    await dialog
      .getByRole("button", { name: "Review gift collection" })
      .click();
    const confirm = dialog
      .getByRole("region", { name: "Send this gift to your wallet?" })
      .locator("button.primary");
    await confirm.focus();
    await page.keyboard.press("Enter");
    await requested;
    await expect(confirm).toBeDisabled();
    const publicLink = dialog.getByLabel("Public link for this letter");
    if (movedFocus) await publicLink.focus();
    await page.clock.runFor(15_100);
    await expect(confirm).toBeEnabled();
    await expect(movedFocus ? publicLink : confirm).toBeFocused();
    await expect(confirm).toHaveAttribute("aria-describedby", "letter-error");
    await expect(dialog.getByRole("alert")).toContainText("timed out");
    await expect(
      dialog.getByRole("region", { name: "Send this gift to your wallet?" }),
    ).toContainText(address);
    const done = page.waitForResponse((r) => r.url().includes(account));
    release();
    await done;
    await expect(
      dialog.getByRole("button", { name: "Change destination" }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "Change destination" }).click();
    await expect(dialog.getByLabel("Ootle receiving address")).toHaveValue(
      address,
    );
    await expect(
      dialog.getByLabel("Existing built-in account component"),
    ).toHaveValue(account);
    expect(writes).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
    ).toBeNull();
    expect(await page.evaluate(() => !!(window as any).tari)).toBe(false);
  });

for (const { claimed, savedState } of [
  { claimed: false, savedState: "unknown" },
  { claimed: true, savedState: "unknown" },
  { claimed: true, savedState: "confirmed" },
])
  test(`an uncertain ${savedState} claim ${claimed ? "on a collected gift" : "without a receipt"} never confirms someone else's payout`, async ({
    page,
  }) => {
    await configure(page);
    const pending = [
      {
        id: "attempt:uncertain-collection",
        network: deployment.network,
        registry: deployment.registry,
        operation: "claim",
        envelopeId: "recovered",
        state: savedState,
      },
    ];
    const journal = JSON.stringify(pending);
    await page.addInitScript(
      (journal) => localStorage.setItem("ghostdrop:pending:v1", journal),
      journal,
    );
    let writes = 0;
    await page.route(`${deployment.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") writes++;
      const response = state(r.request().url());
      if (r.request().url().includes(envelope)) {
        response.substate!.Component.body.state[4] = "100000";
        response.substate!.Component.body.state[5] = "50000";
        response.substate!.Component.body.state[6] = claimed;
      }
      return r.fulfill({ json: response });
    });
    await page.goto("./#/activity");
    const card = page.locator(".delivery-card");
    await expect(card).toContainText("Awaiting confirmation");
    await card.getByRole("button", { name: "Check status" }).click();
    await expect(card).toContainText("Awaiting confirmation");
    await expect(card).not.toContainText("Delivered");
    await expect(page.locator(".message.status")).toContainText(
      claimed ? "cannot confirm your payout" : "no transaction ID",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
    ).toBe(journal);
    await page
      .getByRole("button", { name: "Public mail", exact: true })
      .click();
    await page.getByRole("button", { name: subject, exact: false }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "Your collection is awaiting confirmation.",
    );
    await expect(
      dialog.getByRole("button", { name: "Review gift collection" }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Confirm & collect gift" }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Check collection in Activity" })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Your activity.", exact: true }),
    ).toBeFocused();
    expect(
      await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
    ).toBe(journal);
    expect(writes).toBe(0);
    expect(await page.evaluate(() => !!(window as any).tari)).toBe(false);
  });

test("a known pending claim offers its original Activity receipt instead of another collection", async ({
  page,
}) => {
  await configure(page);
  const tx = "8".repeat(64);
  let confirmed = false,
    writes = 0;
  await page.addInitScript(
    ({ network, registry, tx }) => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      localStorage.setItem(
        "ghostdrop:pending:v1",
        JSON.stringify([
          {
            id: tx,
            network,
            registry,
            operation: "claim",
            envelopeId: "recovered",
            state: "submitted",
          },
        ]),
      );
    },
    { ...deployment, tx },
  );
  await page.route(`${deployment.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    if (r.request().url().includes("transactions/"))
      return r.fulfill({
        json: {
          result: confirmed
            ? { Finalized: { final_decision: "Commit" } }
            : "Pending",
        },
      });
    const response = state(r.request().url());
    if (r.request().url().includes(envelope)) {
      response.substate!.Component.body.state[4] = "100000";
      response.substate!.Component.body.state[5] = "50000";
      response.substate!.Component.body.state[6] = confirmed;
    }
    return r.fulfill({ json: response });
  });
  await page.goto("./#/hall");
  await page.getByRole("button", { name: subject, exact: false }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "Your collection is awaiting confirmation.",
  );
  await expect(
    dialog.getByRole("button", { name: "Review gift collection" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Check collection in Activity" })
    .click();
  const card = page.locator(".delivery-card");
  const check = card.getByRole("button", { name: "Check status" });
  await check.click();
  await expect(page.locator(".message.status")).toContainText("submitted");
  await expect(card).toContainText("Awaiting confirmation");
  confirmed = true;
  await check.click();
  await expect(card).toContainText("Delivered");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghostdrop:pending:v1")!)[0],
    ),
  ).toMatchObject({ id: tx, state: "confirmed" });
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await page.getByRole("button", { name: subject, exact: false }).click();
  await expect(
    dialog.getByRole("heading", { name: "Gift collected", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Check collection in Activity" }),
  ).toHaveCount(0);
  expect(writes).toBe(0);
  expect(await page.evaluate(() => !!(window as any).tari)).toBe(false);
});

test("long unbroken public letters wrap without clipping the hall or reading controls", async ({
  page,
}) => {
  await configure(page);
  const title = "Moonlit".repeat(17);
  const body = `https://example.invalid/${"wandering".repeat(90)}`;
  let writes = 0;
  await page.route(`${deployment.indexerUrl}**`, (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    const data = state(route.request().url());
    if (route.request().url().includes(envelope))
      data.substate!.Component.body.state[3] = JSON.stringify({
        subject: title,
        body,
      });
    return route.fulfill({ json: data });
  });
  await page.goto("./#/hall");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const card = page.getByRole("button", { name: title, exact: false });
    await expect(card).toBeVisible();
    const heading = card.locator("h3");
    await expect(heading).toHaveText(title);
    expect(
      await heading.evaluate(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      ),
    ).toBe(true);
    await card.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("h2")).toHaveText(title);
    await expect(dialog.locator(".letter-body")).toHaveText(body);
    for (const target of [dialog.locator("h2"), dialog.locator(".letter-body")])
      expect(
        await target.evaluate(
          (node) => node.scrollWidth <= node.clientWidth + 1,
        ),
      ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const close = dialog.getByRole("button", {
      name: "Close letter",
      exact: true,
    });
    const size = await close.boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(44);
    expect(size!.height).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(dialog).toHaveCount(0);
  }
  expect(writes).toBe(0);
});
