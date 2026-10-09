import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { encodeMailboxCapsule } from "../../src/core/capsules";
import { sealMailbox } from "../../src/core/mailbox";
import { readable } from "./support/contrast";
import ledger from "../fixtures/capsule-carrier.json" with { type: "json" };

// Connection, wallet-view and public-ledger fixtures. Never sign or broadcast.
async function mailboxFixture(page: Page, firstId = "note-01") {
  const owner = generateKeypair(),
    view = generateKeypair(),
    key = generateKeypair();
  const controller = Buffer.from(owner.public_key).toString("hex");
  const address = generateOotleAddress(owner.public_key, view.public_key, 38);
  owner.free();
  view.free();
  const account = `component_${"d".repeat(64)}`;
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    indexerUrl: "https://mailbox-fixture.invalid/",
  };
  const resource = Object.keys(ledger).find((id) =>
    id.startsWith("resource_"),
  )!;
  const utxo = Object.keys(ledger).find((id) => id.startsWith("utxo_"))!;
  const context = { ...d, controller, postbox: "home", keyVersion: 1 };
  const secret = key.secret_key;
  key.free();
  const encoded = await encodeMailboxCapsule(context, secret);
  secret.fill(0);
  const descriptor = {
    ...encoded.descriptor,
    recovery: "sapient-capsule-1" as const,
    capsule: { resource, commitment: utxo.slice(-64) },
  };
  const states: Record<string, unknown[]> = {};
  const references: Record<string, string> = Object.create(null);
  for (let i = 1; i <= 27; i++) {
    const id = i === 1 ? firstId : `note-${String(i).padStart(2, "0")}`;
    const child = `component_${(i + 100).toString(16).padStart(64, "0")}`;
    references[id] = child;
    const payload = await sealMailbox(
      {
        subject: i === 1 ? "A quiet midnight hello" : `Letter ${i}`,
        body:
          i === 1
            ? "A private note for your eyes only."
            : `Encrypted letter ${i} from the post office.`,
      },
      context,
      id,
      descriptor,
    );
    states[child] = [
      38,
      id,
      2,
      JSON.stringify(payload),
      i <= 6 ? "25000" : "0",
      i <= 6 ? "25000" : "0",
      i <= 2,
      controller,
      "home",
      "",
      "f".repeat(64),
      "",
    ];
  }
  const outgoing = `component_${"9".repeat(64)}`;
  references["outgoing"] = outgoing;
  states[outgoing] = [
    38,
    "outgoing",
    0,
    JSON.stringify({
      subject: "Public dispatch",
      body: "A public outgoing note.",
    }),
    "0",
    "0",
    false,
    "",
    "",
    "home",
    controller,
    "",
  ];
  const unrelated = `component_${"8".repeat(64)}`;
  references["unrelated"] = unrelated;
  states[unrelated] = [
    38,
    "unrelated",
    0,
    JSON.stringify({
      subject: "Someone else’s letter",
      body: "Not from this wallet.",
    }),
    "0",
    "0",
    false,
    "",
    "",
    "home",
    "7".repeat(64),
    "",
  ];
  let writes = 0;
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    const url = r.request().url();
    const carrier = url.includes(utxo)
      ? utxo
      : url.includes(resource)
        ? resource
        : undefined;
    if (carrier)
      return r.fulfill({
        json: structuredClone(ledger[carrier as keyof typeof ledger]),
      });
    const child = Object.keys(states).find((id) => url.includes(id));
    const state = child
      ? states[child]
      : [
          38,
          references,
          {
            home: [
              "home",
              "Moonlit home",
              controller,
              JSON.stringify(descriptor),
              true,
            ],
            work: [
              "work",
              "Night shift",
              controller,
              JSON.stringify(descriptor),
              false,
            ],
            foreign: [
              "foreign",
              "Someone else",
              "7".repeat(64),
              JSON.stringify(descriptor),
              true,
            ],
          },
          `template_${d.envelopeTemplate}`,
        ];
    return r.fulfill({
      json: {
        substate: {
          Component: {
            header: {
              owner_rule: "None",
              template_address: child ? d.envelopeTemplate : d.template,
            },
            body: { state },
          },
        },
      },
    });
  });
  await page.addInitScript(
    ({ account, address, resource, commitment, memo }) => {
      const w = window as any;
      w.mailboxMethods = [];
      let connected = false,
        granted = false;
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: any) => {
          w.mailboxMethods.push(method);
          if (method === "tari_getNetwork") return "esmeralda";
          if (method === "tari_requestAccounts") {
            connected = true;
            return [account];
          }
          if (method === "tari_getAccounts") return connected ? [account] : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_requestViewAccess") {
            granted = true;
            return { granted };
          }
          if (method === "tari_getViewAccess") return { granted };
          if (method === "tari_getShieldedOutputs") {
            if (!granted) throw new Error("View access required");
            return [
              { resourceAddress: resource, commitment, amount: "1", memo },
            ];
          }
          if (method === "tari_disconnect") {
            connected = false;
            granted = false;
            return null;
          }
          throw new Error(`Unexpected wallet method: ${method}`);
        },
      };
    },
    {
      account,
      address,
      resource,
      commitment: descriptor.capsule.commitment,
      memo: encoded.memo.Message,
    },
  );
  return () => writes;
}
async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "My postboxes", exact: true }),
  ).toHaveValue("home");
}
async function unlock(page: Page) {
  await page
    .getByRole("checkbox", {
      name: "I understand the account-wide private view permission",
    })
    .check();
  await page
    .getByRole("button", { name: "Approve postbox view access" })
    .click();
  await page
    .getByRole("button", { name: "Unlock 27 loaded letters", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    }),
  ).toBeVisible();
}
async function assertReadOnly(page: Page, writes: () => number) {
  expect(writes()).toBe(0);
  expect(
    await page.evaluate(() =>
      (window as any).mailboxMethods.filter((method: string) =>
        /sign|Transaction|submit|claimPrivate/.test(method),
      ),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toMatch(
    /A quiet midnight hello|A private note for your eyes only|ghostdrop:mailbox/,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("chain-backed mailbox handles 27 letters, gift folders, search, sent scope and an inline reader", async ({
  page,
}) => {
  const writes = await mailboxFixture(page);
  await page.goto("./#/postboxes");
  await connect(page);
  const folders = page.getByRole("navigation", { name: "Mailbox folders" });
  await expect(folders.getByRole("button", { name: /Inbox/ })).toContainText(
    "27",
  );
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–12 of 27 loaded letters",
  );
  await expect(
    page.getByRole("button", { name: "Unlock 27 loaded letters" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".mailbox-range")).toHaveText(
    "13–24 of 27 loaded letters",
  );
  await expect(page.locator(".mailbox-range")).toBeFocused();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await unlock(page);
  await page
    .getByRole("searchbox", { name: "Search this folder" })
    .fill("for your eyes");
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–1 of 1 loaded letters",
  );
  for (const selector of [
    ".mailbox-row-preview",
    ".mailbox-row-meta",
    ".mailbox-range",
  ])
    await readable(page.locator(selector).first());
  await page
    .getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    })
    .click();
  const reader = page.getByRole("region", {
    name: "A quiet midnight hello",
    exact: true,
  });
  await expect(reader).toContainText("A private note for your eyes only.");
  for (const selector of [
    ".mailbox-identity small",
    ".mailbox-device-note",
    ".mailbox-reading-tools span",
    ".mailbox-letter .letter-body",
    ".mailbox-letter .kicker",
  ])
    await readable(page.locator(selector).first());
  await page
    .locator(".mailbox-workspace")
    .screenshot({ path: test.info().outputPath("mailbox-reading.png") });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    reader.getByRole("heading", {
      name: "A quiet midnight hello",
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    }),
  ).toBeFocused();
  await page.getByRole("searchbox", { name: "Search this folder" }).clear();
  await folders.getByRole("button", { name: /Available gifts/ }).click();
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–4 of 4 loaded letters",
  );
  await folders.getByRole("button", { name: /Collected gifts/ }).click();
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–2 of 2 loaded letters",
  );
  await folders.getByRole("button", { name: /Sent/ }).click();
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–1 of 1 loaded letters",
  );
  await page
    .getByRole("button", { name: "Open letter: Public dispatch" })
    .click();
  await expect(page.locator(".mailbox-sent-detail")).toContainText(
    "A public outgoing note.",
  );
  await page
    .getByRole("combobox", { name: "My postboxes", exact: true })
    .selectOption("work");
  await expect(page.locator(".mailbox-range")).toHaveText(
    "No loaded letters in this view",
  );
  await expect(page.locator(".mailbox-sent-detail")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "My postboxes", exact: true })
    .selectOption("home");
  await page
    .getByRole("button", { name: "Compose letter", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Verified owned reply postbox" }),
  ).toHaveValue("home");
  await expect(
    page.getByRole("checkbox", {
      name: "Include my postbox for replies (optional)",
    }),
  ).toBeChecked();
  await assertReadOnly(page, writes);
});

test("fresh wallet sessions recover the same chain mailbox without stored plaintext or device folders", async ({
  page,
}) => {
  const writes = await mailboxFixture(page);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await page
    .getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "A quiet midnight hello", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await expect(page.locator(".mailbox-letter")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "My inbox", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "A quiet midnight hello", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await expect(
    page.getByText("A private note for your eyes only.", { exact: true }),
  ).toHaveCount(0);
  await connect(page);
  await expect(
    page.getByRole("button", { name: "Sealed letter · note-01", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.reload();
  await connect(page);
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–12 of 27 loaded letters",
  );
  await unlock(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page
    .getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "A quiet midnight hello", exact: true }),
  ).toContainText("A private note for your eyes only.");
  await assertReadOnly(page, writes);
});

for (const id of ["constructor", "__proto__"]) {
  test(`a real encrypted payload with letter ID ${id} must unlock normally`, async ({
    page,
  }) => {
    const writes = await mailboxFixture(page, id);
    await page.goto("./#/postboxes");
    await connect(page);
    await expect(
      page.getByRole("button", {
        name: "Unlock 27 loaded letters",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: `Sealed letter · ${id}`, exact: true }),
    ).toBeVisible();
    await unlock(page);
    await page
      .getByRole("button", {
        name: "Open letter: A quiet midnight hello",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "A quiet midnight hello", exact: true }),
    ).toContainText("A private note for your eyes only.");
    await assertReadOnly(page, writes);
  });
}
