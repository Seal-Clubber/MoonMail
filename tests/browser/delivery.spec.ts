import {
  openInboxComposer,
  chooseMailMode,
  openDeliveryOptions,
  connectFromVisibleControl,
  minimizeComposer,
} from "./support/composer";
import { readable } from "./support/contrast";
import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";

// These are UI/provider fixtures, never real transactions or wallet secrets.
const d = {
  ...emptyDeployment,
  network: 38,
  registry: `component_${"a".repeat(64)}`,
  template: "b".repeat(64),
  envelopeTemplate: "c".repeat(64),
  resource: `resource_${"01".repeat(32)}`,
  indexerUrl: "https://fixture-indexer.invalid/",
  evidence: {
    ...emptyDeployment.evidence,
    engineClaims: true,
    guestPayout: true,
    sapientWallet: true,
  },
};
const account = `component_${"d".repeat(64)}`,
  transaction = "e".repeat(64);
function ledger(url: string) {
  const path = new URL(url).pathname;
  if (path === "/epoch-manager/stats") return { current_epoch: 100 };
  if (path === "/network")
    return { network: "Esmeralda", network_byte: 38, epoch: 100 };
  return {
    version: 0,
    substate: {
      Component: {
        header: {
          template_address: path.includes(d.registry)
            ? d.template
            : "0".repeat(64),
          owner_rule: "None",
        },
        body: {
          state: path.includes(d.registry)
            ? [38, {}, {}, `template_${d.envelopeTemplate}`]
            : [],
        },
      },
    },
  };
}
async function configure(page: Page) {
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
}
async function connectFixture(page: Page, privateFees = false) {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  const controller = Buffer.from(owner.public_key).toString("hex");
  owner.free();
  view.free();
  await page.addInitScript(
    ({ address, account, transaction, privateFees }) => {
      const state = window as any;
      state.walletCalls = [];
      let connected = false,
        granted = false;
      state.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method, params }: any) => {
          state.walletCalls.push({ method, params });
          if (method === "tari_getNetwork") return "esmeralda";
          if (method === "tari_requestAccounts") {
            connected = true;
            return [account];
          }
          if (method === "tari_getAccounts") return connected ? [account] : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getBalances") {
            if (state.walletBalanceError)
              throw new Error("Provider detail must not be displayed");
            const result = state.walletBalanceResponse ?? [];
            if (state.holdWalletBalance)
              return new Promise((resolve) => {
                state.releaseWalletBalance = () => resolve(result);
              });
            return result;
          }
          if (method === "tari_getCapabilities")
            return {
              transactionRequests: true,
              walletAddress: true,
              supportsPrivateFees: privateFees,
            };
          if (method === "tari_signAndSubmitTransaction") {
            if (!params.dryRun)
              throw new Error("Fixture forbids direct broadcasts");
            return {
              result: {
                finalize: {
                  result: { Accept: {} },
                  total_fees_required: state.walletSimulationFee ?? "1000",
                },
              },
            };
          }
          if (method === "tari_createTransactionRequest")
            return { requestId: "request_fixture" };
          if (method === "tari_getTransactionRequest")
            return { requestId: "request_fixture", status: "approved" };
          if (method === "tari_submitTransactionRequest")
            return { transactionId: transaction };
          if (method === "tari_getViewAccess") return { granted };
          if (method === "tari_requestViewAccess") {
            granted = true;
            return { granted };
          }
          if (method === "tari_disconnect") return null;
          throw new Error("Unexpected wallet method " + method);
        },
      };
    },
    { address, account, transaction, privateFees },
  );
  return { controller, address };
}

for (const verified of [false, true])
  test(`native postage requires deployment evidence (${verified}) and never requests mail-read permission`, async ({
    page,
  }) => {
    await connectFixture(page, true);
    await page.route("**/deployment.json", (r) =>
      r.fulfill({
        json: {
          ...d,
          evidence: { ...d.evidence, nativePrivatePostage: verified },
        },
      }),
    );
    await page.route(`${d.indexerUrl}**`, (r) =>
      r.fulfill({ json: ledger(r.request().url()) }),
    );
    await page.goto("./#/compose");
    await connectFromVisibleControl(page);
    await page
      .getByRole("button", { name: "Connect Sapient", exact: true })
      .click();
    await openDeliveryOptions(page);
    const source = page.getByRole("combobox", {
      name: "Postage source",
      exact: true,
    });
    if (verified) {
      await expect(source).toHaveValue("private");
      await source.selectOption("transparent");
      await expect(source).toHaveValue("transparent");
    } else await expect(source).toHaveCount(0);
    expect(
      (await page.evaluate(() => (window as any).walletCalls)).some((c: any) =>
        [
          "tari_requestViewAccess",
          "tari_getPrivateBalances",
          "tari_getShieldedOutputs",
          "tari_createTransactionRequest",
          "tari_submitTransactionRequest",
        ].includes(c.method),
      ),
    ).toBe(false);
  });

test("a connected funded public review stays gated until explicit publication choice and resets after navigation", async ({
  page,
}) => {
  await configure(page);
  await connectFixture(page);
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./#/compose");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await chooseMailMode(page, "✧ Public mail");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Deliberate public publication");
  await page
    .getByLabel("Your letter", { exact: true })
    .fill("A public review must be an explicit choice.");
  await page.getByRole("button", { name: "Review letter" }).click();
  const publish = page.getByRole("button", {
      name: "Publish publicly",
      exact: true,
    }),
    consent = page.getByRole("checkbox", {
      name: "I choose to publish this subject",
    });
  await expect(publish).toBeDisabled();
  await consent.check();
  await expect(publish).toBeEnabled();
  await minimizeComposer(page);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await openInboxComposer(page);
  await page.getByRole("button", { name: "Review letter" }).click();
  await expect(consent).not.toBeChecked();
  await expect(publish).toBeDisabled();
  expect(
    (await page.evaluate(() => (window as any).walletCalls)).some((c: any) =>
      c.method.includes("Transaction"),
    ),
  ).toBe(false);
  expect(writes).toBe(0);
});
test("private link must be saved before one approved publication; confirmation reveals the same link", async ({
  page,
}) => {
  await configure(page);
  await connectFixture(page);
  let receiptReady = false,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    return r.fulfill({
      json: r.request().url().includes(`/transactions/${transaction}/result`)
        ? {
            result: receiptReady
              ? { Finalized: { final_decision: "Commit" } }
              : "Pending",
          }
        : ledger(r.request().url()),
    });
  });
  await page.goto("./#/compose");
  await chooseMailMode(page, "⌘ Private link");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Private subject stays on device");
  await page.getByLabel("Your letter").fill("A private thought for a friend");
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  const link = await page
    .getByLabel("Private link to save", { exact: true })
    .inputValue();
  const publish = page.getByRole("button", {
    name: /Send encrypted letter|Publish publicly/,
  });
  await expect(publish).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.some(
        (c: any) => c.method === "tari_createTransactionRequest",
      ),
    ),
  ).toBe(false);
  await page
    .getByRole("checkbox", { name: "I saved my private link somewhere safe" })
    .check();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(
    page.getByRole("heading", { name: "Your activity." }),
  ).toBeVisible();
  await expect(page.locator(".delivery-card")).toContainText(
    "Awaiting confirmation",
  );
  receiptReady = true;
  await page.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(page.locator(".delivery-card")).toContainText("Delivered");
  await expect(
    page.getByLabel("Confirmed private link", { exact: true }),
  ).toHaveValue(link);
  const journal = await page.evaluate(
    () => localStorage.getItem("ghostdrop:pending:v1")!,
  );
  expect(journal).not.toContain("Private subject");
  expect(journal).not.toContain(link.split("/").pop()!.split("?")[0]);
  const calls = await page.evaluate(() => (window as any).walletCalls);
  expect(
    calls.filter((c: any) => c.method === "tari_createTransactionRequest"),
  ).toHaveLength(1);
  expect(
    calls.filter((c: any) => c.method === "tari_submitTransactionRequest"),
  ).toHaveLength(1);
  expect(writes).toBe(0);
});

test("known receipt confirms automatically with no wallet or transaction submission", async ({
  page,
}) => {
  await configure(page);
  let receiptReads = 0,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const receipt = r
      .request()
      .url()
      .includes(`/transactions/${transaction}/result`);
    if (receipt) receiptReads++;
    return r.fulfill({
      json: receipt
        ? { result: { Finalized: { final_decision: "Commit" } } }
        : ledger(r.request().url()),
    });
  });
  await page.addInitScript(
    ({ network, registry, transaction }) => {
      localStorage.setItem(
        "ghostdrop:pending:v1",
        JSON.stringify([
          {
            id: transaction,
            network,
            registry,
            operation: "claim",
            envelopeId: "gift",
            state: "submitted",
          },
        ]),
      );
    },
    { ...d, transaction },
  );
  await page.goto("./#/activity");
  await expect(page.locator(".delivery-card")).toContainText("Confirmed");
  expect(receiptReads).toBe(1);
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  expect(await page.evaluate(() => (window as any).tari)).toBeUndefined();
});

test("damaged delivery history is retained, explained and cannot authorize sending", async ({
  page,
}) => {
  await configure(page);
  await connectFixture(page);
  await page.route(`${d.indexerUrl}**`, (r) =>
    r.fulfill({ json: ledger(r.request().url()) }),
  );
  await page.addInitScript(() =>
    localStorage.setItem("ghostdrop:pending:v1", "{damaged"),
  );
  await page.goto("./#/activity");
  await expect(page.getByRole("alert")).toContainText(
    "Your delivery history needs attention",
  );
  await expect(
    page.getByRole("heading", { name: "No deliveries yet." }),
  ).toHaveCount(0);
  await openInboxComposer(page);
  await chooseMailMode(page, "✧ Public mail");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Do not repeat uncertain funds");
  await page.getByLabel("Your letter").fill("Keep the damaged journal.");
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await expect(
    page.getByRole("button", {
      name: /Send encrypted letter|Publish publicly/,
    }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBe("{damaged");
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.some((c: any) =>
        /Transaction/.test(c.method),
      ),
    ),
  ).toBe(false);
});

test("a receipt that finishes after a network change cannot confirm the old delivery", async ({
  page,
}) => {
  await configure(page);
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().url().includes(`/transactions/${transaction}/result`)) {
      started();
      await held;
      return r.fulfill({
        json: { result: { Finalized: { final_decision: "Commit" } } },
      });
    }
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.addInitScript(
    ({ network, registry, transaction }) =>
      localStorage.setItem(
        "ghostdrop:pending:v1",
        JSON.stringify([
          {
            id: transaction,
            network,
            registry,
            operation: "publish",
            envelopeId: "old-office",
            state: "submitted",
          },
        ]),
      ),
    { ...d, transaction },
  );
  await page.goto("./#/activity");
  await requested;
  await page.getByRole("button", { name: /Settings/ }).click();
  await page.getByText("Advanced connection settings", { exact: true }).click();
  await page.getByLabel("Ootle test network").selectOption("16");
  const returned = page.waitForResponse((r) =>
    r.url().includes(`/transactions/${transaction}/result`),
  );
  release();
  await returned;
  await minimizeComposer(page);
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No deliveries yet." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghostdrop:pending:v1")!)[0].state,
    ),
  ).toBe("submitted");
});

test("automatic receipt checks stop after two minutes and leave pending funds alone", async ({
  page,
}) => {
  await configure(page);
  await page.clock.install();
  let reads = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    const receipt = r
      .request()
      .url()
      .includes(`/transactions/${transaction}/result`);
    if (receipt) reads++;
    return r.fulfill({
      json: receipt ? { result: "Pending" } : ledger(r.request().url()),
    });
  });
  await page.addInitScript(
    ({ network, registry, transaction }) =>
      localStorage.setItem(
        "ghostdrop:pending:v1",
        JSON.stringify([
          {
            id: transaction,
            network,
            registry,
            operation: "claim",
            envelopeId: "pending-gift",
            state: "submitted",
          },
        ]),
      ),
    { ...d, transaction },
  );
  await page.goto("./#/activity");
  await expect.poll(() => reads).toBe(1);
  await expect(
    page.getByText("Checking delivery automatically.", { exact: false }),
  ).toBeVisible();
  await page.clock.fastForward(121_000);
  await expect(
    page.getByText("Checking delivery automatically.", { exact: false }),
  ).toHaveCount(0);
  const stoppedReads = reads;
  await page.clock.fastForward(12_000);
  expect(reads).toBe(stoppedReads);
  await expect(
    page.getByRole("button", { name: "Check status", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("ghostdrop:pending:v1")!)[0].state,
    ),
  ).toBe("submitted");
});

test("saved postbox backup confirms read-only; opening needs separate view consent and a second approval", async ({
  page,
}) => {
  const { controller } = await connectFixture(page);
  const capsule = {
    template: "1".repeat(64),
    component: `component_${"2".repeat(64)}`,
    resource: `resource_${"3".repeat(64)}`,
  };
  const profile = {
    ...d,
    capsule,
    evidence: { ...d.evidence, mailboxRecovery: true },
  };
  await page.route("**/deployment.json", (r) => r.fulfill({ json: profile }));
  let receipts = 0,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const receipt = r
      .request()
      .url()
      .includes(`/transactions/${transaction}/result`);
    if (receipt) receipts++;
    return r.fulfill({
      json: receipt
        ? { result: { Finalized: { final_decision: "Commit" } } }
        : ledger(r.request().url()),
    });
  });
  const pending = {
    id: transaction,
    network: d.network,
    registry: d.registry,
    operation: "capsule",
    envelopeId: "capsule:new-home:1",
    state: "submitted",
    capsule: {
      account,
      context: {
        network: d.network,
        registry: d.registry,
        template: d.template,
        postbox: "new-home",
        controller,
        keyVersion: 1,
      },
      descriptor: {
        version: "gd-postbox-1",
        keyVersion: 1,
        publicKey: "4".repeat(64),
        recovery: "sapient-capsule-1",
        capsule: { resource: capsule.resource, commitment: "5".repeat(64) },
      },
      deployment: capsule,
    },
  };
  await page.addInitScript(
    (p) => localStorage.setItem("ghostdrop:pending:v1", JSON.stringify([p])),
    pending,
  );
  await page.goto("./#/postboxes");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page.getByRole("button", { name: /new-home · key 1/ }).click();
  await expect(
    page.getByText("Your recovery backup is ready.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".setup-steps li")).toHaveCount(2);
  await expect(page.locator(".setup-steps")).toContainText("Approval 1 of 2");
  await expect(page.locator(".setup-steps")).toContainText("Approval 2 of 2");
  await expect(
    page.getByRole("button", { name: "2 of 2 · Open my postbox", exact: true }),
  ).toBeDisabled();
  expect(receipts).toBe(1);
  const approval = page.getByRole("button", {
    name: "Continue in Sapient",
  });
  await expect(approval).toBeEnabled();
  await approval.click();
  await expect(
    page.getByRole("button", { name: "2 of 2 · Open my postbox", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Postbox name", { exact: true })
    .fill("My moonlit corner");
  await expect(
    page.getByRole("button", { name: "2 of 2 · Open my postbox", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".setup-summary")).toContainText(
    "My moonlit corner",
  );
  await expect(page.locator(".setup-summary")).toContainText(
    "Ready for your second approval",
  );
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.filter((c: any) =>
        /Transaction/.test(c.method),
      ),
    ),
  ).toEqual([]);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("postbox-setup.png"),
    fullPage: true,
  });
});

test("private-link copying has a manual fallback and never acknowledges saving automatically", async ({
  page,
}) => {
  await configure(page);
  await connectFixture(page);
  await page.route(`${d.indexerUrl}**`, (r) =>
    r.fulfill({ json: ledger(r.request().url()) }),
  );
  await page.addInitScript(() => {
    const state = window as any;
    state.allowCopy = false;
    state.copiedValues = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          if (!state.allowCopy)
            throw new DOMException(
              "Fixture permission denial",
              "NotAllowedError",
            );
          state.copiedValues.push(value);
        },
      },
    });
  });
  await page.goto("./#/compose");
  await chooseMailMode(page, "⌘ Private link");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page.getByLabel("Subject", { exact: true }).fill("A private fixture");
  await page.getByLabel("Your letter").fill("Keep this note safe");
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  const field = page.getByLabel("Private link to save", { exact: true });
  const link = await field.inputValue();
  const save = page.getByRole("checkbox", {
    name: "I saved my private link somewhere safe",
  });
  const publish = page.getByRole("button", {
    name: /Send encrypted letter|Publish publicly/,
  });
  await page.getByRole("button", { name: "Copy secret link" }).click();
  await expect(page.locator(".copy-field")).toContainText("copy it manually");
  await expect(field).toBeFocused();
  expect(
    await field.evaluate(
      (element: HTMLTextAreaElement) =>
        element.selectionEnd! - element.selectionStart!,
    ),
  ).toBe(link.length);
  await expect(field).toHaveValue(link);
  await expect(save).not.toBeChecked();
  await expect(publish).toBeDisabled();
  await page.evaluate(() => {
    (window as any).allowCopy = true;
  });
  await page.getByRole("button", { name: "Copy secret link" }).click();
  await expect(page.locator(".copy-field")).toContainText(
    "Private link copied",
  );
  expect(await page.evaluate(() => (window as any).copiedValues)).toEqual([
    link,
  ]);
  await expect(save).not.toBeChecked();
  await expect(publish).toBeDisabled();
  expect(
    (await page.evaluate(() => (window as any).walletCalls)).some((c: any) =>
      c.method.includes("Transaction"),
    ),
  ).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});

for (const denied of ["getter", "writes"] as const) {
  test(`blocked storage ${denied} preserves guest reading and pauses wallet submissions until rechecked`, async ({
    page,
  }) => {
    await configure(page);
    await connectFixture(page);
    await page.route(`${d.indexerUrl}**`, (r) =>
      r.fulfill({ json: ledger(r.request().url()) }),
    );
    const records = [
      {
        id: "attempt:storage-fixture",
        network: d.network,
        registry: d.registry,
        operation: "publish",
        envelopeId: "old-letter",
        state: "unknown",
        walletRequest: { provider: "sapient", id: "request_fixture", account },
      },
    ];
    await page.addInitScript(
      ({ denied, records }) => {
        const state = window as any;
        const realStorage = window.localStorage;
        realStorage.setItem("ghostdrop:pending:v1", JSON.stringify(records));
        state.originalStorage = realStorage;
        state.storageAllowed = false;
        if (denied === "getter")
          Object.defineProperty(window, "localStorage", {
            configurable: true,
            get: () => {
              if (!state.storageAllowed)
                throw new DOMException(
                  "Fixture storage denial",
                  "SecurityError",
                );
              return realStorage;
            },
          });
        else {
          const originalSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key: string, value: string) {
            if (!state.storageAllowed)
              throw new DOMException(
                "Fixture storage full",
                "QuotaExceededError",
              );
            return originalSetItem.call(this, key, value);
          };
        }
      },
      { denied, records },
    );
    await page.goto("./#/hall");
    await expect(
      page.getByRole("heading", {
        name: "Letters for anyone.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Mail is up to date" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Browser storage needs permission" }),
    ).toBeVisible();
    await openInboxComposer(page);
    await connectFromVisibleControl(page);
    await page
      .getByRole("button", { name: "Connect Sapient", exact: true })
      .click();
    await minimizeComposer(page);
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    const resume = page.getByRole("button", {
      name: "Resume Sapient approval",
    });
    if (denied === "writes") await expect(resume).toBeDisabled();
    else await expect(resume).toHaveCount(0);
    await openInboxComposer(page);
    await chooseMailMode(page, "⌘ Private link");
    await page.getByLabel("Subject", { exact: true }).fill("A fixture letter");
    await page.getByLabel("Your letter").fill("Read without writable storage");
    await page
      .getByRole("button", { name: "Review letter", exact: false })
      .click();
    await page
      .getByRole("checkbox", { name: "I saved my private link somewhere safe" })
      .check();
    const publish = page.getByRole("button", {
      name: /Send encrypted letter|Publish publicly/,
    });
    await expect(publish).toBeDisabled();
    await page.evaluate(() => {
      (window as any).storageAllowed = true;
    });
    await page.getByRole("button", { name: "Recheck browser storage" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Browser storage needs permission" }),
    ).toHaveCount(0);
    await expect(publish).toBeEnabled();
    expect(
      await page.evaluate(() =>
        (window as any).originalStorage.getItem("ghostdrop:pending:v1"),
      ),
    ).toBe(JSON.stringify(records));
    expect(
      (await page.evaluate(() => (window as any).walletCalls)).some((c: any) =>
        c.method.includes("Transaction"),
      ),
    ).toBe(false);
    expect(await page.evaluate(() => localStorage.length)).toBe(1);
  });
}

test("Activity notices delivery journal changes from another tab without submitting", async ({
  page,
}) => {
  await configure(page);
  const records = [
    {
      id: transaction,
      network: d.network,
      registry: d.registry,
      operation: "publish",
      envelopeId: "old-letter",
      state: "rejected",
    },
  ];
  await page.route(`${d.indexerUrl}**`, (r) =>
    r.fulfill({ json: ledger(r.request().url()) }),
  );
  await page.addInitScript(
    (records) =>
      localStorage.setItem("ghostdrop:pending:v1", JSON.stringify(records)),
    records,
  );
  await page.goto("./#/activity");
  await expect(page.locator(".delivery-card")).toContainText("Not completed");
  const other = await page.context().newPage();
  try {
    await other.route("**/deployment.json", (r) =>
      r.fulfill({ json: emptyDeployment }),
    );
    await other.goto("./#/hall");
    await other.evaluate(
      (records) =>
        localStorage.setItem(
          "ghostdrop:pending:v1",
          JSON.stringify(records.map((r) => ({ ...r, state: "confirmed" }))),
        ),
      records,
    );
    await expect(page.locator(".delivery-card")).toContainText("Delivered");
    await expect(
      page.getByRole("button", { name: "Resume Sapient approval" }),
    ).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test("wallet details expose only public receiving information without requesting signatures", async ({
  page,
}) => {
  await configure(page);
  const fixture = await connectFixture(page);
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (route) => {
    if (route.request().method() !== "GET") {
      writes++;
      return route.abort();
    }
    return route.fulfill({ json: ledger(route.request().url()) });
  });
  await page.goto("./#/compose");
  await chooseMailMode(page, "⌘ Private link");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("A draft stays at the writing desk");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  const methods = await page.evaluate(() =>
    (window as any).walletCalls.map((c: any) => c.method),
  );
  await minimizeComposer(page);
  const trigger = page.getByRole("button", {
    name: "Wallet details",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Your Sapient wallet",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Your receiving address", { exact: true }),
  ).toHaveValue(fixture.address);
  await expect(dialog).toContainText("Esmeralda testnet");
  await dialog.getByText("Receiving account details", { exact: true }).click();
  await expect(
    dialog.getByLabel("Your receiving account", { exact: true }),
  ).toHaveValue(account);
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.map((c: any) => c.method),
    ),
  ).toEqual(methods);
  await dialog.screenshot({
    path: test.info().outputPath("wallet-details.png"),
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "A draft stays at the writing desk",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await trigger.click();
  await dialog
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeVisible();
  await expect(trigger).toHaveCount(0);
  expect(
    (await page.evaluate(() => (window as any).walletCalls)).filter(
      (c: any) => c.method === "tari_disconnect",
    ),
  ).toHaveLength(1);
  expect(writes).toBe(0);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

async function openWalletFunds(page: Page) {
  await configure(page);
  await connectFixture(page);
  await page.route(`${d.indexerUrl}**`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: ledger(route.request().url()) })
      : route.abort(),
  );
  await page.goto("./#/compose");
  await chooseMailMode(page, "⌘ Private link");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await minimizeComposer(page);
  await page
    .getByRole("button", { name: "Wallet details", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Your Sapient wallet", exact: true });
}
async function assertReadOnlyFunds(page: Page) {
  const calls = await page.evaluate(() => (window as any).walletCalls);
  expect(
    calls.filter((call: any) =>
      /ViewAccess|sign|TransactionRequest/.test(call.method),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
}
async function expectReachableWalletControl(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.click({ trial: true });
  await control.focus();
  await expect(control).toBeFocused();
  // Font/scroll metrics can round a fractional edge differently across Chromium platforms.
  await expect(control).toBeInViewport({ ratio: 0.99 });
  const bounds = await control.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
}

test("public funds distinguish zero public balance from private holdings and recheck without signing", async ({
  page,
}) => {
  const dialog = await openWalletFunds(page);
  await dialog
    .getByRole("button", { name: "Check public funds", exact: true })
    .click();
  await expect(dialog).toContainText("Public funds: 0 TARI.");
  await expect(dialog).toContainText(
    "If your funds are private, use Unshield in Sapient",
  );
  await dialog
    .getByText("My Sapient balance shows zero", { exact: true })
    .click();
  await expect(dialog).toContainText("Receive → Claim a private payment");
  await page.evaluate(() => {
    (window as any).walletBalanceResponse = [
      {
        resourceAddress: `resource_${"01".repeat(32)}`,
        kind: "Stealth",
        divisibility: 6,
        amount: "1500001",
        confidentialAmount: "5010000000",
        privateVisible: false,
      },
    ];
  });
  await dialog
    .getByRole("button", { name: "Recheck public funds", exact: true })
    .click();
  await expect(dialog).toContainText("Public funds: 1.500001 TARI.");
  await expect(dialog).not.toContainText("No public TARI is available");
  await expect(dialog).not.toContainText("5010 TARI");
  await page.screenshot({
    path: test.info().outputPath("wallet-public-funds-viewport.png"),
  });
  const disconnect = dialog.getByRole("button", {
    name: "Disconnect wallet",
    exact: true,
  });
  await expectReachableWalletControl(page, disconnect);
  await page.screenshot({
    path: test.info().outputPath("wallet-public-funds-bottom.png"),
  });
  const close = dialog.getByRole("button", {
    name: "Close wallet details",
    exact: true,
  });
  await expectReachableWalletControl(page, close);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await assertReadOnlyFunds(page);
});
test("a public funds read failure stays unknown and can retry without leaking provider detail", async ({
  page,
}) => {
  const dialog = await openWalletFunds(page);
  await page.evaluate(() => {
    (window as any).walletBalanceError = true;
  });
  await dialog
    .getByRole("button", { name: "Check public funds", exact: true })
    .click();
  await expect(dialog).toContainText("Public funds could not be checked.");
  await expect(dialog).not.toContainText("Public funds: 0 TARI");
  await expect(dialog).not.toContainText("Provider detail");
  await page.evaluate(() => {
    (window as any).walletBalanceError = false;
  });
  await dialog
    .getByRole("button", { name: "Recheck public funds", exact: true })
    .click();
  await expect(dialog).toContainText("Public funds: 0 TARI.");
  await assertReadOnlyFunds(page);
});
test("closing wallet details discards a late public funds read", async ({
  page,
}) => {
  const dialog = await openWalletFunds(page);
  await page.evaluate(() => {
    (window as any).holdWalletBalance = true;
  });
  await dialog
    .getByRole("button", { name: "Check public funds", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => typeof (window as any).releaseWalletBalance),
    )
    .toBe("function");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.evaluate(() => {
    const state = window as any;
    state.holdWalletBalance = false;
    state.walletBalanceResponse = [
      {
        resourceAddress: `resource_${"01".repeat(32)}`,
        kind: "Stealth",
        divisibility: 6,
        amount: "2000000",
      },
    ];
  });
  await page
    .getByRole("button", { name: "Wallet details", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Check public funds", exact: true })
    .click();
  await expect(dialog).toContainText("Public funds: 2 TARI.");
  await page.evaluate(() => (window as any).releaseWalletBalance());
  await expect(dialog).toContainText("Public funds: 2 TARI.");
  await assertReadOnlyFunds(page);
});

test("postbox names respect the chain byte limit before the first backup approval", async ({
  page,
}) => {
  await connectFixture(page);
  const profile = {
    ...d,
    capsule: {
      template: "1".repeat(64),
      component: `component_${"2".repeat(64)}`,
      resource: `resource_${"3".repeat(64)}`,
    },
    evidence: { ...d.evidence, mailboxRecovery: true },
  };
  await page.route("**/deployment.json", (r) => r.fulfill({ json: profile }));
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./#/postboxes");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create my postbox", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue in Sapient" }).click();
  const name = page.getByLabel("Postbox name", { exact: true }),
    backup = page.getByRole("button", {
      name: "1 of 2 · Save recovery backup",
      exact: true,
    });
  await expect(
    page.getByRole("checkbox", {
      name: "Let people find this postbox in the directory",
    }),
  ).toHaveCount(0);
  await expect(page.locator(".postbox-setup")).toContainText(
    "Your postbox name, ID and controlling public key are public",
  );
  await name.fill("👻".repeat(21));
  await expect(backup).toBeDisabled();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toContainText(
    "Choose a shorter postbox name",
  );
  for (const valid of ["👻".repeat(20), "é".repeat(40), "a".repeat(80)]) {
    await name.fill(valid);
    await expect(backup).toBeEnabled();
    await expect(name).toHaveAttribute("aria-invalid", "false");
  }
  await name.fill("é".repeat(41));
  await expect(backup).toBeDisabled();
  await name.fill("   ");
  await expect(backup).toBeDisabled();
  await name.fill("");
  await expect(backup).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.filter((c: any) =>
        /Transaction|sign/.test(c.method),
      ),
    ),
  ).toEqual([]);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
});

test("a stalled manual delivery check preserves the original attempt and ignores a late receipt", async ({
  page,
}) => {
  await configure(page);
  await connectFixture(page);
  await page.clock.install();
  let hold = true,
    writes = 0,
    release!: () => void,
    started!: () => void;
  const pending = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (started = r));
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") writes++;
    if (r.request().url().includes(`/transactions/${transaction}/result`)) {
      if (hold) {
        started();
        await pending;
      }
      return r.fulfill({
        json: { result: { Finalized: { final_decision: "Commit" } } },
      });
    }
    await r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.addInitScript(
    ({ network, registry, transaction }) => {
      // Isolate the explicit check from automatic foreground receipt polling.
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      localStorage.setItem(
        "ghostdrop:pending:v1",
        JSON.stringify([
          {
            id: transaction,
            network,
            registry,
            operation: "publish",
            envelopeId: "pending-letter",
            state: "submitted",
          },
        ]),
      );
    },
    { ...d, transaction },
  );
  await page.goto("./#/activity");
  const check = page.getByRole("button", { name: "Check status", exact: true });
  await expect(check).toBeEnabled();
  const before = await page.evaluate(() =>
    localStorage.getItem("ghostdrop:pending:v1"),
  );
  await check.click();
  await requested;
  await page.clock.runFor(15_001);
  await expect(check).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText("read timed out");
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBe(before);
  const done = page.waitForResponse((r) =>
    r.url().includes(`/transactions/${transaction}/result`),
  );
  release();
  await done;
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBe(before);
  await expect(page.locator(".delivery-card")).toContainText(
    "Awaiting confirmation",
  );
  hold = false;
  await check.click();
  await expect(page.locator(".delivery-card")).toContainText("Delivered");
  expect(await page.evaluate(() => (window as any).walletCalls)).toEqual([]);
  expect(writes).toBe(0);
});

test("automatic fees reveal an adjustment only after a low preflight estimate, without auto-submitting", async ({
  page,
}) => {
  await configure(page);
  await connectFixture(page);
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./#/compose");
  await connectFromVisibleControl(page);
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await chooseMailMode(page, "✧ Public mail");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Automatic fee fixture");
  await page
    .getByLabel("Your letter", { exact: true })
    .fill("This is an isolated browser fixture; no real transaction.");
  await expect(
    page.getByRole("textbox", { name: "Sending fee limit", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).walletSimulationFee = "200000";
  });
  await page.getByRole("button", { name: "Review letter" }).click();
  await page
    .getByRole("checkbox", { name: "I choose to publish this subject" })
    .check();
  await page
    .getByRole("button", { name: "Publish publicly", exact: true })
    .click();
  const warning = page.getByRole("alert", {
    name: "Sending fee limit warning",
    exact: true,
  });
  await expect(warning).toContainText("Nothing was submitted");
  await expect(warning).toContainText("at least 0.2 TARI");
  await readable(warning.locator("p"));
  await readable(
    warning.getByRole("button", {
      name: "Adjust sending fee limit",
      exact: true,
    }),
  );
  await page.screenshot({
    path: test.info().outputPath("automatic-fee-warning.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(() =>
      (window as any).walletCalls.filter((c: any) =>
        /createTransactionRequest|submitTransactionRequest/.test(c.method),
      ),
    ),
  ).toEqual([]);
  await warning
    .getByRole("button", { name: "Adjust sending fee limit", exact: true })
    .click();
  await warning
    .getByRole("textbox", { name: "Sending fee limit", exact: true })
    .fill("0.3");
  await expect(
    page.getByRole("button", { name: "Publish publicly", exact: true }),
  ).toHaveCount(0);
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Review letter" }).click();
  await page
    .getByRole("checkbox", { name: "I choose to publish this subject" })
    .check();
  await page
    .getByRole("button", { name: "Publish publicly", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).walletCalls.filter(
            (c: any) => c.method === "tari_createTransactionRequest",
          ).length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as any).walletCalls.find(
          (c: any) => c.method === "tari_createTransactionRequest",
        ).params.maxFee,
    ),
  ).toBe("300000");
  expect(writes).toBe(0);
});

test("postbox submission stays in My inbox and confirms without opening Activity", async ({
  page,
}) => {
  const { controller } = await connectFixture(page);
  const capsule = {
    template: "1".repeat(64),
    component: `component_${"2".repeat(64)}`,
    resource: `resource_${"3".repeat(64)}`,
  };
  await page.route("**/deployment.json", (r) =>
    r.fulfill({
      json: {
        ...d,
        capsule,
        evidence: { ...d.evidence, mailboxRecovery: true },
      },
    }),
  );
  const key = JSON.stringify({
    version: "gd-postbox-1",
    keyVersion: 1,
    publicKey: "4".repeat(64),
    recovery: "sapient-capsule-1",
    capsule: { resource: capsule.resource, commitment: "5".repeat(64) },
  });
  let confirmed = false,
    writes = 0;
  let releaseReceipt!: () => void;
  const receiptReady = new Promise<void>((resolve) => {
    releaseReceipt = resolve;
  });
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    if (r.request().url().includes(`/transactions/${transaction}/result`)) {
      await receiptReady;
      confirmed = true;
      return r.fulfill({
        json: { result: { Finalized: { final_decision: "Commit" } } },
      });
    }
    const result: any = ledger(r.request().url());
    if (r.request().url().includes(d.registry))
      result.substate.Component.body.state[2] = {
        home: [
          "home",
          confirmed ? "Moonlit home" : "My home",
          controller,
          key,
          true,
        ],
      };
    return r.fulfill({ json: result });
  });
  await page.goto("./#/postboxes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "My postboxes", exact: true }),
  ).toHaveValue("home");
  const notNow = page.getByRole("button", { name: "Not now", exact: true });
  if (await notNow.isVisible()) await notNow.click();
  await page.getByText("Postbox options", { exact: true }).click();
  await page
    .getByRole("button", { name: "Edit selected postbox", exact: true })
    .click();
  await page.getByLabel("Postbox name", { exact: true }).fill("Moonlit home");
  await page
    .getByRole("button", { name: "Save postbox changes", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/postboxes$/);
  await expect(page.locator(".postbox-confirmation")).toContainText(
    "Your postbox change is on its way",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("ghostdrop:pending:v1") || "[]").find(
          (p: any) => p.operation === "postbox",
        ).state,
    ),
  ).toBe("submitted");
  releaseReceipt();
  await expect(
    page.getByRole("status").filter({
      hasText: /Your postbox change is confirmed|Mail is up to date\./,
    }),
  ).toContainText(/Your postbox change is confirmed|Mail is up to date\./);
  await expect(
    page.getByRole("heading", { name: "Your activity.", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "My postboxes", exact: true }),
  ).toContainText("Moonlit home");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("ghostdrop:pending:v1") || "[]")
          .filter((p: any) => p.operation === "postbox")
          .map((p: any) => p.state),
      ),
    )
    .toEqual(["confirmed"]);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as any).walletCalls.filter(
          (c: any) => c.method === "tari_submitTransactionRequest",
        ).length,
    ),
  ).toBe(1);
});
