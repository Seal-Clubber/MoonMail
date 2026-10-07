import { test, expect, type Page } from "@playwright/test";
import { emptyDeployment } from "../../src/core/config";
import { sealLetter } from "../../src/core/crypto";
import { createGiftLink } from "../../src/core/links";

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
  await page.goto("./");
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
  await page.goto("./");
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
    await page.goto("./");
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
  await page.goto("./");
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
  await page.goto("./");
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
  await page.goto("./");
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
