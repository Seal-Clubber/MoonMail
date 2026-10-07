import { test, expect, type Page } from "@playwright/test";
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
async function connectFixture(page: Page) {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  const controller = Buffer.from(owner.public_key).toString("hex");
  owner.free();
  view.free();
  await page.addInitScript(
    ({ address, account, transaction }) => {
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
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_signAndSubmitTransaction") {
            if (!params.dryRun)
              throw new Error("Fixture forbids direct broadcasts");
            return {
              result: {
                finalize: {
                  result: { Accept: {} },
                  total_fees_required: "1000",
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
    { address, account, transaction },
  );
  return { controller };
}
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
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
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
  const publish = page.getByRole("button", { name: "Fund & publish letter" });
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
  await expect(page.locator(".delivery-card")).toContainText("Delivered");
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
  await page
    .getByRole("button", { name: "Write a letter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "✧ Public mail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
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
    page.getByRole("button", { name: "Fund & publish letter" }),
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
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page.getByRole("button", { name: /new-home · key 1/ }).click();
  await expect(
    page.getByText("Your recovery backup is ready.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open my postbox", exact: true }),
  ).toBeDisabled();
  expect(receipts).toBe(1);
  const approval = page.getByRole("button", {
    name: "Approve postbox view access",
  });
  await expect(approval).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I understand the account-wide private view permission",
    })
    .check();
  await approval.click();
  await expect(
    page.getByRole("button", { name: "Open my postbox", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Postbox name", { exact: true })
    .fill("My moonlit corner");
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
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
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
  const publish = page.getByRole("button", { name: "Fund & publish letter" });
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
    await page.goto("./");
    await expect(
      page.getByRole("heading", {
        name: "A little mystery. A little generosity.",
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
    await page
      .getByRole("button", { name: "Write a letter", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Connect Sapient", exact: true })
      .click();
    await page.getByRole("button", { name: "Activity", exact: true }).click();
    const resume = page.getByRole("button", {
      name: "Resume Sapient approval",
    });
    if (denied === "writes") await expect(resume).toBeDisabled();
    else await expect(resume).toHaveCount(0);
    await page
      .getByRole("button", { name: "Write a letter", exact: true })
      .click();
    await page.getByLabel("Subject", { exact: true }).fill("A fixture letter");
    await page.getByLabel("Your letter").fill("Read without writable storage");
    await page
      .getByRole("button", { name: "Review letter", exact: false })
      .click();
    await page
      .getByRole("checkbox", { name: "I saved my private link somewhere safe" })
      .check();
    const publish = page.getByRole("button", { name: "Fund & publish letter" });
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
    await other.goto("./");
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
