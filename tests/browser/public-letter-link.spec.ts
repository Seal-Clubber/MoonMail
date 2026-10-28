import { accountForOwner } from "../../src/core/receiving-address";
import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { sealLetter } from "../../src/core/crypto";
import { createGiftLink } from "../../src/core/links";
import { createPublicLetterLink } from "../../src/core/public-letter-links";
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
    guestAccountCreation: true,
  },
};
const id = "a-public-letter",
  child = `component_${"d".repeat(64)}`,
  subject = "A little light, shared directly",
  body = "This public message is read from the selected office.";
function ledger(url: string, mode = 0) {
  const registry = url.includes(d.registry),
    payload =
      mode === 0
        ? { subject, body }
        : mode === 1
          ? {
              version: "gd-link-1",
              claimPublicKey: "5".repeat(64),
              iv: "",
              ciphertext: "",
              wrapIv: "",
              wrappedClaimKey: "",
            }
          : {
              version: "gd-postbox-1",
              keyVersion: 1,
              recipientKey: "6".repeat(64),
              ephemeralPublicKey: "7".repeat(64),
              iv: "fixture",
              ciphertext: "fixture",
            };
  return {
    version: 0,
    verified: false,
    state: {
      up: {
        substate: {
          Component: {
            header: {
              template_address: registry ? d.template : d.envelopeTemplate,
              owner_rule: "None",
            },
            body: {
              state: registry
                ? [38, { [id]: child }, {}, `template_${d.envelopeTemplate}`]
                : [
                    38,
                    id,
                    mode,
                    JSON.stringify(payload),
                    "1000000",
                    "100000",
                    false,
                    "5".repeat(64),
                    mode === 2 ? "friend" : "",
                    "",
                    "8".repeat(64),
                    "",
                  ],
            },
          },
        },
      },
    },
  };
}
const hash = (context = d, letter = id) =>
  new URL(
    createPublicLetterLink("https://example.com/MoonMail/", {
      id: letter,
      context,
    }),
  ).hash;
async function configure(page: Page) {
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  await page.addInitScript(() => {
    const w = window as any;
    w.walletCalls = 0;
    w.tari = {
      isTariWallet: true,
      info: {
        name: "Sapient fixture",
        rdns: "mw.tari.sapient",
        embedded: false,
      },
      request: async () => {
        w.walletCalls++;
        throw new Error("No wallet request expected");
      },
    };
  });
}
async function noSpending(page: Page, writes: number) {
  expect(writes).toBe(0);
  expect(await page.evaluate(() => (window as any).walletCalls)).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
}

test("a public permalink opens the exact verified letter and gift without signing or claiming", async ({
  page,
}) => {
  await configure(page);
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  const dialog = page.getByRole("dialog", { name: subject });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(body);
  await expect(dialog).toContainText("You receive 1 TARI.");
  const link = await dialog
    .getByLabel("Public link for this letter", { exact: true })
    .inputValue();
  const u = new URL(link);
  expect(u.pathname).toBe("/MoonMail/");
  expect(u.search).toBe("");
  expect(u.hash).toBe(hash());
  expect(link).not.toContain(subject);
  expect(link).not.toContain(body);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("public-letter-link.png"),
  });
  await noSpending(page, writes);
  await dialog.getByRole("button", { name: "Close letter" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(dialog).toBeVisible();
  await noSpending(page, writes);
});

test("the hall supplies a shareable public link and clipboard refusal keeps the complete value", async ({
  page,
}) => {
  await configure(page);
  let writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./#/hall");
  await page.getByRole("button", { name: subject, exact: false }).click();
  const dialog = page.getByRole("dialog", { name: subject }),
    field = dialog.getByLabel("Public link for this letter", { exact: true });
  await expect(field).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("blocked");
        },
      },
    }),
  );
  await dialog
    .getByRole("button", { name: "Copy public letter link", exact: true })
    .click();
  await expect(field).toBeFocused();
  await expect(
    dialog.getByRole("status").filter({ hasText: "copy it manually" }),
  ).toBeVisible();
  expect(new URL(await field.inputValue()).hash).toBe(hash());
  await noSpending(page, writes);
});

for (const mode of [1, 2])
  test(`${mode === 1 ? "private-link" : "postbox"} mail cannot open or expose plaintext through a public permalink`, async ({
    page,
  }) => {
    await configure(page);
    let writes = 0;
    await page.route(`${d.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") writes++;
      return r.fulfill({ json: ledger(r.request().url(), mode) });
    });
    await page.goto("./" + hash());
    const status = page.getByRole("status", { name: "Public letter status" });
    await expect(status).toContainText(
      "Sealed letters require their private link or controlling postbox wallet.",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Public link for this letter")).toHaveCount(0);
    await noSpending(page, writes);
  });

for (const change of [
  { network: 36 },
  { registry: `component_${"e".repeat(64)}` },
  { template: "f".repeat(64) },
])
  test(`a public link from another ${Object.keys(change)[0]} never reads its target or switches settings`, async ({
    page,
  }) => {
    await configure(page);
    let registryReads = 0,
      childReads = 0,
      writes = 0;
    await page.route(`${d.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") writes++;
      if (r.request().url().includes(d.registry)) registryReads++;
      if (r.request().url().includes(child)) childReads++;
      return r.fulfill({ json: ledger(r.request().url()) });
    });
    await page.goto("./" + hash({ ...d, ...change }));
    await expect(
      page.getByRole("status", { name: "Public letter status" }),
    ).toContainText("different post office or network");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(registryReads).toBe(1);
    expect(childReads).toBe(1);
    await noSpending(page, writes);
  });

test("a public letter read outage can retry without a reload or duplicate financial action", async ({
  page,
}) => {
  await configure(page);
  let unavailable = true,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return unavailable && r.request().url().includes(child)
      ? r.fulfill({ status: 503, body: "offline" })
      : r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  const status = page.getByRole("status", { name: "Public letter status" });
  await expect(status).toContainText("This public letter could not open.");
  unavailable = false;
  await status.getByRole("button", { name: "Retry public letter" }).click();
  await expect(page.getByRole("dialog", { name: subject })).toBeVisible();
  await noSpending(page, writes);
});

test("an initial registry outage can be retried into the same public letter", async ({
  page,
}) => {
  await configure(page);
  let unavailable = true,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return unavailable
      ? r.fulfill({ status: 503, body: "offline" })
      : r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  const status = page.getByRole("status", { name: "Public letter status" });
  await expect(status).toContainText("could not be reached");
  unavailable = false;
  await status.getByRole("button", { name: "Retry public letter" }).click();
  await expect(page.getByRole("dialog", { name: subject })).toBeVisible();
  await noSpending(page, writes);
});

test("dismissing a delayed public-letter read cancels its result", async ({
  page,
}) => {
  await configure(page);
  let count = 0,
    writes = 0,
    release!: () => void,
    started!: () => void;
  const wait = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (started = r));
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") writes++;
    if (r.request().url().includes(child) && ++count === 2) {
      started();
      await wait;
    }
    await r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  await requested;
  const status = page.getByRole("status", { name: "Public letter status" });
  await expect(status).toContainText("Opening the public letter");
  await status.getByRole("button", { name: "Dismiss public letter" }).click();
  const done = page.waitForResponse((r) => r.url().includes(child));
  release();
  await done;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status).toHaveCount(0);
  await noSpending(page, writes);
});

for (const bad of ["template", "owner"])
  test(`a public permalink rejects an untrusted envelope ${bad}`, async ({
    page,
  }) => {
    await configure(page);
    let writes = 0;
    await page.route(`${d.indexerUrl}**`, (r) => {
      if (r.request().method() !== "GET") writes++;
      const state = ledger(r.request().url());
      if (r.request().url().includes(child)) {
        if (bad === "template")
          state.state.up.substate.Component.header.template_address =
            "0".repeat(64);
        else state.state.up.substate.Component.header.owner_rule = "Upgradable";
      }
      return r.fulfill({ json: state });
    });
    await page.goto("./" + hash());
    await expect(
      page.getByRole("status", { name: "Public letter status" }),
    ).toContainText("could not open");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await noSpending(page, writes);
  });

test("an unknown public letter stays unavailable and can be dismissed without another target lookup", async ({
  page,
}) => {
  await configure(page);
  let childReads = 0,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    if (r.request().url().includes(child)) childReads++;
    return r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash(d, "unknown"));
  const status = page.getByRole("status", { name: "Public letter status" });
  await expect(status).toContainText("could not open");
  expect(childReads).toBe(1);
  await status.getByRole("button", { name: "Dismiss public letter" }).click();
  await expect(status).toHaveCount(0);
  await noSpending(page, writes);
});

async function receivingDestination(dialog: ReturnType<Page["getByRole"]>) {
  const owner = generateKeypair(),
    view = generateKeypair();
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  const account = accountForOwner(owner.public_key);
  const controller = Buffer.from(owner.public_key).toString("hex");
  owner.free();
  view.free();
  await dialog.page().route("**/*" + account + "*", (r) =>
    r.fulfill({
      json: {
        version: 0,
        verified: false,
        state: {
          up: {
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
        },
      },
    }),
  );
  await dialog
    .getByLabel("Ootle receiving address", { exact: true })
    .fill(address);

  return { address, account };
}

test("collection review discovers an already-collected gift without signing and keeps its letter", async ({
  page,
}) => {
  await configure(page);
  let collected = false,
    writes = 0,
    reads = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const value = ledger(r.request().url());
    if (r.request().url().includes(child)) {
      reads++;
      value.state.up.substate.Component.body.state[6] = collected;
    }
    return r.fulfill({ json: value });
  });
  await page.goto("./" + hash());
  const dialog = page.getByRole("dialog", { name: subject });
  await expect(dialog).toBeVisible();
  await receivingDestination(dialog);
  const before = reads;
  collected = true;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Gift collected", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "This gift has already been collected. You can still read the letter.",
  );
  await expect(dialog).toContainText(body);
  await expect(
    dialog.getByRole("button", { name: "Confirm & collect gift" }),
  ).toHaveCount(0);
  expect(reads).toBeGreaterThan(before);
  await noSpending(page, writes);
});

test("an availability outage preserves the collection destination for a read-only retry", async ({
  page,
}) => {
  await configure(page);
  let unavailable = false,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    return unavailable && r.request().url().includes(child)
      ? r.fulfill({ status: 503, body: "Temporary outage" })
      : r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  const dialog = page.getByRole("dialog", { name: subject });
  await expect(dialog).toBeVisible();
  const destination = await receivingDestination(dialog);
  unavailable = true;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not check this gift right now",
  );
  await expect(dialog).toContainText(body);
  await expect(
    dialog.getByLabel("Ootle receiving address", { exact: true }),
  ).toHaveValue(destination.address);
  await expect(
    dialog.getByLabel("Existing built-in account component", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Confirm & collect gift" }),
  ).toHaveCount(0);
  unavailable = false;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  const review = dialog.getByRole("region", {
    name: "Send this gift to your wallet?",
  });
  await expect(review).toBeVisible();
  await expect(review).toContainText(destination.address);
  await expect(review).not.toContainText("component_");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await noSpending(page, writes);
});

test("leaving a letter during an availability check ignores the late result", async ({
  page,
}) => {
  await configure(page);
  let hold = false,
    writes = 0,
    release!: () => void,
    started!: () => void;
  const pending = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (started = r));
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") writes++;
    if (hold && r.request().url().includes(child)) {
      started();
      await pending;
    }
    await r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  const dialog = page.getByRole("dialog", { name: subject });
  await expect(dialog).toBeVisible();
  await receivingDestination(dialog);
  hold = true;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await requested;
  await expect(
    dialog.getByRole("button", { name: "Checking gift and address…" }),
  ).toBeDisabled();
  await page.evaluate(() => (location.hash = "#/activity"));
  await expect(dialog).toHaveCount(0);
  const done = page.waitForResponse((r) => r.url().includes(child));
  release();
  await done;
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeEnabled();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Send this gift to your wallet?" }),
  ).toHaveCount(0);
  await noSpending(page, writes);
});

test("a private gift availability check preserves decrypted text without leaking its capability", async ({
  page,
}) => {
  await configure(page);
  const sealed = await sealLetter(
    {
      subject: "A private kindness",
      body: "Keep this secret note after collection.",
    },
    d,
    id,
  );
  let collected = false,
    writes = 0;
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const value = ledger(r.request().url(), 1);
    if (r.request().url().includes(child)) {
      const data = value.state.up.substate.Component.body.state;
      data[3] = JSON.stringify(sealed.payload);
      data[6] = collected;
      data[7] = sealed.payload.claimPublicKey;
    }
    return r.fulfill({ json: value });
  });
  await page.goto(
    createGiftLink(String(test.info().project.use.baseURL), {
      id,
      context: d,
      capability: sealed.capability,
    }),
  );
  const dialog = page.getByRole("dialog", { name: "A private kindness" });
  await expect(dialog).toBeVisible();
  await receivingDestination(dialog);
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await expect(
    dialog.getByRole("region", { name: "Send this gift to your wallet?" }),
  ).toBeVisible();
  await expect(dialog).toContainText("Keep this secret note after collection.");
  await dialog.getByRole("button", { name: "Change destination" }).click();
  collected = true;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Gift collected", exact: true }),
  ).toBeVisible();
  await expect(dialog).toContainText("Keep this secret note after collection.");
  expect(page.url().includes(sealed.capability)).toBe(false);
  expect(requests.some((url) => url.includes(sealed.capability))).toBe(false);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await noSpending(page, writes);
});

test("an untrusted availability response cannot replace a verified letter or open collection review", async ({
  page,
}) => {
  await configure(page);
  let untrusted = false,
    writes = 0;
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") writes++;
    const value = ledger(r.request().url());
    if (untrusted && r.request().url().includes(child)) {
      value.state.up.substate.Component.header.owner_rule = "Upgradable";
      value.state.up.substate.Component.body.state[3] = JSON.stringify({
        subject: "Untrusted replacement",
        body: "Do not show this.",
      });
    }
    return r.fulfill({ json: value });
  });
  await page.goto("./" + hash());
  const dialog = page.getByRole("dialog", { name: subject });
  await expect(dialog).toBeVisible();
  await receivingDestination(dialog);
  untrusted = true;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not check this gift right now",
  );
  await expect(dialog).toContainText(body);
  await expect(dialog).not.toContainText("Do not show this.");
  await expect(
    dialog.getByRole("button", { name: "Confirm & collect gift" }),
  ).toHaveCount(0);
  await noSpending(page, writes);
});

test("a stalled availability read releases controls and ignores its eventual response", async ({
  page,
}) => {
  await configure(page);
  let hold = false,
    writes = 0,
    release!: () => void,
    started!: () => void;
  const pending = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (started = r));
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") writes++;
    if (hold && r.request().url().includes(child)) {
      started();
      await pending;
    }
    await r.fulfill({ json: ledger(r.request().url()) });
  });
  await page.goto("./" + hash());
  const dialog = page.getByRole("dialog", { name: subject });
  await expect(dialog).toBeVisible();
  const destination = await receivingDestination(dialog);
  await page.clock.install();
  hold = true;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await requested;
  await page.clock.runFor(15_001);
  await expect(dialog.getByRole("alert")).toContainText(
    "Could not check this gift right now",
  );
  await expect(
    dialog.getByRole("button", { name: "Close letter" }),
  ).toBeEnabled();
  await expect(
    dialog.getByLabel("Ootle receiving address", { exact: true }),
  ).toHaveValue(destination.address);
  const done = page.waitForResponse((r) => r.url().includes(child));
  release();
  await done;
  await expect(
    dialog.getByRole("region", { name: "Send this gift to your wallet?" }),
  ).toHaveCount(0);
  hold = false;
  await dialog.getByRole("button", { name: "Review gift collection" }).click();
  await expect(
    dialog.getByRole("region", { name: "Send this gift to your wallet?" }),
  ).toBeVisible();
  await noSpending(page, writes);
});
