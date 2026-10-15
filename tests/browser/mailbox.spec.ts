import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { encodeMailboxCapsule } from "../../src/core/capsules";
import { addSentCopy } from "../../src/core/sent-mail";
import { sealLetter } from "../../src/core/crypto";
import type { Envelope } from "../../src/core/types";
import { sealMailbox } from "../../src/core/mailbox";
import {
  sealPreferences,
  READ,
  STAR,
  ARCHIVE,
} from "../../src/core/mailbox-state";
import { readable } from "./support/contrast";
import ledger from "../fixtures/capsule-carrier.json" with { type: "json" };

// Connection, wallet-view and public-ledger fixtures. Never sign or broadcast.
async function mailboxFixture(
  page: Page,
  firstId = "note-01",
  unified = false,
  damaged = false,
  encryptedSent = false,
  threaded = false,
  persistentGrant = false,
  incomingCount = 27,
  visual = false,
) {
  const showcase = [
    [
      "Mara",
      "The midnight delivery",
      "Hi Seal,\n\nThe moon was still out when I passed the old garden. I left a note beneath the lantern, just where we agreed.\n\nIf you find it before sunset, send a reply. I would love to hear what you think.\n\nUntil tonight,\nMara",
    ],
    [
      "Rowan",
      "Re: A place under the moon",
      "That sounds perfect. See you at dusk, near the old gate.",
    ],
    [
      "Night Garden",
      "The lantern walk",
      "The garden gates open at sunset. Bring a lantern and a warm coat.",
    ],
    [
      "Elin",
      "A small favour",
      "Could you look over the invitation? I have left a few notes for you.",
    ],
    [
      "The Spectral Clerk",
      "Welcome to MoonMail",
      "Your first letter has found its way home. May many more follow.",
    ],
    [
      "Orin",
      "Re: Tomorrow's meet",
      "Shall we still plan to meet at the bridge? I will bring the map.",
    ],
    [
      "Lys",
      "Winter market",
      "The stalls will be set up by noon. I saved you a place by the fire.",
    ],
    [
      "Mara",
      "A note for the weekend",
      "There is a little more light in the garden today. Thought you would like to know.",
    ],
  ];
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
  if (unified)
    Object.assign(d, {
      resource: `resource_${"01".repeat(32)}`,
      contractProtocol: "unified-1",
      postboxClaimProtocol: "sapient-proof-1",
      envelopeTemplate: d.template,
      capsule: {
        template: d.template,
        component: d.registry,
        resource,
      },
      evidence: {
        ...d.evidence,
        engineClaims: true,
        guestPayout: true,
        sapientWallet: true,
        mailboxRecovery: true,
        postboxClaims: true,
        mailboxState: true,
      },
    });
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
  for (let i = 1; i <= incomingCount; i++) {
    const id = i === 1 ? firstId : `note-${String(i).padStart(2, "0")}`;
    const child = `component_${(i + 100).toString(16).padStart(64, "0")}`;
    references[id] = child;
    const payload = await sealMailbox(
      {
        subject: visual
          ? showcase[(i - 1) % showcase.length][1] + (i > 8 ? ` · ${i}` : "")
          : i === 1
            ? "A quiet midnight hello"
            : `Letter ${i}`,
        ...(threaded && i === 3
          ? {
              thread: {
                version: "gd-thread-1" as const,
                root: firstId,
                parent: "thread-reply",
              },
            }
          : {}),
        body: visual
          ? showcase[(i - 1) % showcase.length][2]
          : i === 1
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
      !visual && i <= 6 ? "25000" : "0",
      !visual && i <= 6 ? "25000" : "0",
      !visual && i <= 2,
      controller,
      "home",
      visual
        ? `friend-${(i - 1) % showcase.length}`
        : threaded && i <= 3
          ? "foreign"
          : "",
      visual
        ? (((i - 1) % showcase.length) + 1).toString(16).repeat(64)
        : threaded && i <= 3
          ? "7".repeat(64)
          : "f".repeat(64),
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
  if (encryptedSent) {
    const other = generateKeypair();
    const otherDescriptor = {
      version: "gd-postbox-1" as const,
      keyVersion: 1,
      publicKey: Buffer.from(other.public_key).toString("hex"),
    };
    other.free();
    for (const mode of ["postbox", "link"] as const) {
      const id = "sent-" + mode,
        component = `component_${(mode === "postbox" ? "31" : "32").repeat(32)}`;
      const letter = {
        subject:
          mode === "postbox"
            ? "My private sent letter"
            : "My saved link letter",
        body: "Recovered in Sent without the recipient's key.",
      };
      const payload =
        mode === "link"
          ? (await sealLetter(letter, d, id, 32768)).payload
          : await sealMailbox(
              letter,
              {
                ...d,
                postbox: "elsewhere",
                controller: "7".repeat(64),
                keyVersion: 1,
              },
              id,
              otherDescriptor,
              32768,
            );
      const envelope: Envelope = {
        id,
        mode,
        context: d,
        payload,
        sender: controller,
        replyPostbox: "home",
        gift: "0",
        reserve: "0",
        claimed: false,
        ...(mode === "postbox"
          ? { recipientPostbox: "elsewhere", claimAuthority: "7".repeat(64) }
          : {}),
      };
      const saved = await addSentCopy(envelope, letter, {
        id: "home",
        nickname: "Moonlit home",
        controller,
        encryptionKey: JSON.stringify(descriptor),
        discoverable: true,
      });
      references[id] = component;
      states[component] = [
        38,
        id,
        mode === "link" ? 1 : 2,
        JSON.stringify(saved.payload),
        "0",
        "0",
        false,
        mode === "link" ? (payload as any).claimPublicKey : "7".repeat(64),
        mode === "link" ? "" : "elsewhere",
        "home",
        controller,
        "",
      ];
    }
  }
  if (threaded) {
    const id = "thread-reply",
      component = `component_${"41".repeat(32)}`;
    const letter = {
      subject: "Re: A quiet midnight hello",
      body: "My reply, recovered from Sent.",
      thread: {
        version: "gd-thread-1" as const,
        root: firstId,
        parent: firstId,
      },
    };
    const primary = await sealMailbox(
      letter,
      { ...d, postbox: "foreign", controller: "7".repeat(64), keyVersion: 1 },
      id,
      descriptor,
      32768,
    );
    const saved = await addSentCopy(
      {
        id,
        mode: "postbox",
        context: d,
        payload: primary,
        sender: controller,
        replyPostbox: "home",
        recipientPostbox: "foreign",
        claimAuthority: "7".repeat(64),
        gift: "0",
        reserve: "0",
        claimed: false,
      },
      letter,
      {
        id: "home",
        controller,
        nickname: "Moonlit home",
        encryptionKey: JSON.stringify(descriptor),
        discoverable: true,
      },
    );
    references[id] = component;
    states[component] = [
      38,
      id,
      2,
      JSON.stringify(saved.payload),
      "0",
      "0",
      false,
      "7".repeat(64),
      "foreign",
      "home",
      controller,
      "",
    ];
  }
  const stateComponent = `component_${"6".repeat(64)}`;
  const savedState = unified
    ? await sealPreferences(
        {
          marks: visual
            ? [
                ["note-02", READ],
                ["note-05", READ],
                ["note-08", READ],
              ]
            : [
                [firstId, READ | STAR],
                ["note-02", ARCHIVE],
              ],
          favourites: ["home"],
          sort: visual ? "chain" : "subject",
          density: visual ? "comfortable" : "compact",
        },
        context,
        "1",
        descriptor,
      )
    : "";
  if (unified) {
    for (const [id, state] of Object.entries(states))
      states[id] = [
        38,
        {},
        {},
        `template_${d.template}`,
        {},
        1,
        [...state, "vault_fixture", null, d.registry],
        null,
        null,
      ];
    states[stateComponent] = [
      38,
      {},
      {},
      `template_${d.template}`,
      {},
      2,
      null,
      ["home", controller, "1", damaged ? "broken" : savedState, d.registry],
      null,
    ];
  }
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
    let state = child
      ? states[child]
      : [
          38,
          references,
          {
            home: [
              "home",
              visual ? "seal-public" : "Moonlit home",
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
            ...(visual
              ? Object.fromEntries(
                  showcase.map(([name], i) => [
                    `friend-${i}`,
                    [
                      `friend-${i}`,
                      name,
                      (i + 1).toString(16).repeat(64),
                      JSON.stringify(descriptor),
                      true,
                    ],
                  ]),
                )
              : {}),
          },
          `template_${d.envelopeTemplate}`,
        ];
    if (unified && !child)
      state = [...state, { home: stateComponent }, 0, null, null, resource];
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
    ({ account, address, resource, commitment, memo, persistentGrant }) => {
      const w = window as any;
      w.mailboxMethods = [];
      let connected =
          persistentGrant &&
          sessionStorage.getItem("fixture:connected") === "1",
        granted =
          persistentGrant && sessionStorage.getItem("fixture:granted") === "1";
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
            if (persistentGrant)
              sessionStorage.setItem("fixture:connected", "1");
            return [account];
          }
          if (method === "tari_getAccounts") return connected ? [account] : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_requestViewAccess") {
            if (w.delayMailboxGrant)
              await new Promise<void>((resolve) => {
                w.releaseMailboxGrant = resolve;
              });
            granted = !w.declineMailboxGrant;
            if (persistentGrant)
              sessionStorage.setItem("fixture:granted", granted ? "1" : "0");
            return { granted };
          }
          if (method === "tari_getViewAccess") return { granted };
          if (method === "tari_getShieldedOutputs") {
            if (w.denyMailboxRead)
              throw new Error("Private outputs unavailable");
            if (!granted) throw new Error("View access required");
            return [
              { resourceAddress: resource, commitment, amount: "1", memo },
            ];
          }
          if (method === "tari_disconnect") {
            connected = false;
            granted = false;
            sessionStorage.removeItem("fixture:connected");
            sessionStorage.removeItem("fixture:granted");
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
      persistentGrant,
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
  await page.getByRole("button", { name: "Not now", exact: true }).click();
}
async function unlock(page: Page, firstSubject = "A quiet midnight hello") {
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue in Sapient" }).click();
  await page
    .getByRole("button", { name: "Unlock 27 loaded letters", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: `Open letter: ${firstSubject}`,
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
  const viewport = page.viewportSize()!;
  const workspace = await page.locator(".mailbox-workspace").boundingBox();
  expect(workspace).not.toBeNull();
  expect(workspace!.width).toBeGreaterThan(viewport.width - 70);
  if (viewport.width > 900) {
    expect(workspace!.y).toBeLessThan(viewport.height * 0.35);
    expect(workspace!.height).toBeGreaterThan(viewport.height * 0.7);
  }
  await expect(
    page.getByRole("dialog", { name: "Unlock your private inbox" }),
  ).not.toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("inbox-full-page.png"),
  });
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
  await readable(page.locator(".postbox-switcher"));
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
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
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

test("unified mailbox recovers encrypted marks and layout after a fresh browser session without writes", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page.locator(".mailbox-preferences summary").click();
  await expect(
    page.getByText("Matches saved Ootle settings", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await readable(page.locator(".mailbox-state-panel p").first());
  await readable(page.locator(".mailbox-state-panel h3"));
  if (process.env.GHOSTDROP_MAILBOX_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.GHOSTDROP_MAILBOX_SCREENSHOTS}/mailbox-${page.viewportSize()?.width}.png`,
      fullPage: true,
    });
  await expect(page.locator(".mailbox-view-options summary")).toBeVisible();
  await page.locator(".mailbox-view-options summary").click();
  await expect(
    page.getByRole("combobox", { name: "Sort letters" }),
  ).toHaveValue("subject");
  const folders = page.getByRole("navigation", { name: "Mailbox folders" });
  await expect(folders.getByRole("button", { name: /Inbox/ })).toContainText(
    "26",
  );
  await folders.getByRole("button", { name: /Starred/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Open letter: A quiet midnight hello",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Select letter note-01", exact: true })
    .check();
  await page
    .getByRole("combobox", { name: "Actions for selected letters" })
    .selectOption("2:false");
  await expect(
    page.getByText("Unsaved changes · this session only", { exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".mailbox-range")).toHaveText(
    "No loaded letters in this view",
  );
  await page.getByRole("button", { name: "Discard unsaved changes" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select letter note-01", exact: true }),
  ).toBeVisible();
  await folders.getByRole("button", { name: /Archive/ }).click();
  await expect(
    page.getByRole("button", { name: "Open letter: Letter 2", exact: true }),
  ).toBeVisible();
  await assertReadOnly(page, writes);
  await page.reload();
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await folders.getByRole("button", { name: /Starred/ }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select letter note-01", exact: true }),
  ).toBeVisible();
  await assertReadOnly(page, writes);
});
test("damaged encrypted settings do not become an empty editable mailbox", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true, true);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(
    page.getByRole("button", {
      name: "Retry loading mailbox settings",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", {
      name: "Retry loading mailbox settings",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retry loading mailbox settings",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Save mailbox changes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Mailbox folders" })
      .getByRole("button", { name: /Archive/ }),
  ).toHaveCount(0);
  await assertReadOnly(page, writes);
});

test("encrypted Sent recovers addressed and link mail in a fresh wallet session without recipient access or writes", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true, false, true);
  await page.goto("./#/postboxes");
  await connect(page);
  const folders = page.getByRole("navigation", { name: "Mailbox folders" });
  await folders.getByRole("button", { name: /Sent/ }).click();
  await expect(folders.getByRole("button", { name: /Sent/ })).toContainText(
    "3",
  );
  const grant = async () => {
    await page
      .getByRole("button", { name: "Unlock private inbox", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continue in Sapient", exact: true })
      .click();
  };
  await expect(
    page.getByRole("button", { name: "Unlock 2 loaded letters", exact: true }),
  ).toBeDisabled();
  await grant();
  await page
    .getByRole("button", { name: "Unlock 2 loaded letters", exact: true })
    .click();
  for (const subject of ["My private sent letter", "My saved link letter"]) {
    await page
      .getByRole("button", { name: "Open letter: " + subject, exact: true })
      .click();
    await expect(page.locator(".mailbox-sent-detail .letter-body")).toHaveText(
      "Recovered in Sent without the recipient's key.",
    );
    await expect(
      page.getByRole("button", { name: /Confirm.*collect/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Back to messages", exact: true })
      .click();
  }
  await page
    .getByRole("searchbox", { name: "Search this folder" })
    .fill("saved link");
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–1 of 1 loaded letters",
  );
  expect(
    await page.evaluate(() =>
      [...Object.values(localStorage), ...Object.values(sessionStorage)].some(
        (v) =>
          v.includes("Recovered in Sent") ||
          v.includes("My private sent letter"),
      ),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await expect(page.locator(".mailbox-workspace")).toHaveCount(0);
  await page.reload();
  await connect(page);
  await folders.getByRole("button", { name: /Sent/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Open letter: My private sent letter",
      exact: true,
    }),
  ).toHaveCount(0);
  await grant();
  await page
    .getByRole("button", { name: "Unlock 2 loaded letters", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Open letter: My private sent letter",
      exact: true,
    })
    .click();
  await expect(page.locator(".mailbox-sent-detail .letter-body")).toContainText(
    "Recovered in Sent",
  );
  await assertReadOnly(page, writes);
});

test("writing from a postbox includes encrypted Sent in review and changing that choice requires a new review", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await page
    .getByRole("button", { name: "Compose letter", exact: false })
    .click();
  await page
    .getByRole("button", { name: "⌘ Private link", exact: true })
    .click();
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Sender recovery review");
  await page
    .getByLabel("Your letter", { exact: false })
    .fill("A normal sent message, encrypted on Ootle.");
  const save = page.getByRole("checkbox", {
    name: "Save an encrypted copy in Sent",
    exact: true,
  });
  await expect(save).toBeChecked();
  await expect(save).toBeEnabled();
  await page.getByRole("button", { name: /Review letter/ }).click();
  await expect(page.locator(".review")).toContainText(
    "Encrypted copy saved with this letter",
  );
  await save.uncheck();
  await expect(page.locator(".review")).toHaveCount(0);
  await page.getByRole("button", { name: /Review letter/ }).click();
  await expect(page.locator(".review")).toContainText(
    "No recoverable sender copy",
  );
  await assertReadOnly(page, writes);
});

test("bulk selection stages consistent read and archive changes and discard restores saved state", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page
    .getByRole("checkbox", { name: "Select letter note-10", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select letter note-11", exact: true })
    .check();
  await page
    .getByRole("combobox", {
      name: "Actions for selected letters",
      exact: true,
    })
    .selectOption("1:true");
  const folders = page.getByRole("navigation", { name: "Mailbox folders" });
  await folders.getByRole("button", { name: /Unread/ }).click();
  await expect(
    page.getByRole("checkbox", { name: "Select letter note-10", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Select this page", exact: true })
    .check();
  await expect(
    page.getByRole("combobox", {
      name: "Actions for selected letters",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("combobox", {
      name: "Actions for selected letters",
      exact: true,
    })
    .selectOption("4:true");
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Unsaved mailbox changes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await expect(folders.getByRole("button", { name: /Inbox/ })).toContainText(
    "26",
  );
  await expect(folders.getByRole("button", { name: /Unread/ })).toContainText(
    "25",
  );
  await assertReadOnly(page, writes);
});
test("favourites recover encrypted, stage edits and lead the recipient picker", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await expect(page.locator(".mailbox-contacts")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Compose letter", exact: false })
    .click();
  await page.locator(".mailbox-contacts summary").click();
  const favourite = page.getByRole("button", {
    name: "Favourite Moonlit home",
    exact: true,
  });
  await expect(favourite).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("No accidental review");
  await page
    .getByRole("textbox", { name: "Your letter", exact: true })
    .fill("Editing contacts must not submit the composer.");
  await page
    .getByRole("combobox", { name: "Recipient postbox", exact: true })
    .selectOption("foreign");
  await page.locator(".compose form").evaluate((form) => {
    (window as any).composerSubmits = 0;
    form.addEventListener("submit", () => {
      (window as any).composerSubmits++;
    });
  });
  await favourite.click();
  await expect(favourite).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await expect(favourite).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => (window as any).composerSubmits)).toBe(0);
  await expect(page.locator(".review")).toHaveCount(0);
  await page.locator(".mailbox-contact button").first().click();
  await expect(
    page.getByRole("combobox", { name: "Recipient postbox", exact: true }),
  ).toHaveValue("home");
  await expect(
    page.locator("#recipient-postbox optgroup").first(),
  ).toHaveAttribute("label", "Favourite postboxes");
  await assertReadOnly(page, writes);
});

test("encrypted Inbox and Sent replies form a verified conversation and reply keeps its parent", async ({
  page,
}) => {
  const writes = await mailboxFixture(
    page,
    "note-01",
    true,
    false,
    false,
    true,
  );
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);

  const folders = page.getByRole("navigation", { name: "Mailbox folders" });
  await folders.getByRole("button", { name: /Sent/ }).click();
  await page
    .getByRole("button", { name: "Unlock 1 loaded letter", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Open letter: Re: A quiet midnight hello",
      exact: true,
    })
    .click();
  const conversation = page.getByRole("region", {
    name: "Reply conversation",
    exact: true,
  });
  await expect(conversation).toContainText("3 unlocked letters");
  await expect(conversation.locator("summary")).toHaveText([
    "Someone else · A quiet midnight hello",
    "You · Re: A quiet midnight hello",
    "Someone else · Letter 3",
  ]);
  await conversation.locator("summary").last().click();
  await conversation
    .getByRole("button", { name: "Reply to this message", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("combobox", { name: "Recipient postbox", exact: true }),
  ).toHaveValue("foreign");
  await expect(
    page.getByRole("combobox", {
      name: "Verified owned reply postbox",
      exact: true,
    }),
  ).toHaveValue("home");
  await expect(page.locator(".reply-context")).toContainText("note-03");
  await expect(
    page.getByRole("textbox", { name: "Subject", exact: true }),
  ).toHaveValue("Re: Letter 3");
  await page
    .getByRole("button", { name: "Start a separate conversation", exact: true })
    .click();
  await expect(page.locator(".reply-context")).toHaveCount(0);
  await assertReadOnly(page, writes);
});

test("bulk selection keeps messages reachable in a short desktop window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue in Sapient" }).click();
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page
    .getByRole("checkbox", { name: "Select letter note-01", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select letter note-10", exact: true })
    .check();
  await page
    .getByRole("combobox", {
      name: "Actions for selected letters",
      exact: true,
    })
    .selectOption("1:true");
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();
  await assertReadOnly(page, writes);
});

test("guided private inbox permission is explicit, dismissible and retryable", async ({
  page,
}) => {
  const writes = await mailboxFixture(page);
  await page.goto("./#/postboxes");
  await connect(page); // The helper dismisses the automatic explanation with Not now.
  const dialog = page.getByRole("dialog", {
    name: "Unlock your private inbox",
  });
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).mailboxMethods.includes("tari_requestViewAccess"),
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    "including amounts and memos for other resources",
  );
  await page.screenshot({ path: test.info().outputPath("guided-unlock.png") });
  await expect(
    dialog.getByRole("button", { name: "Continue in Sapient", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unlock private inbox", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  await page.evaluate(() => {
    (window as any).declineMailboxGrant = true;
  });
  await dialog
    .getByRole("button", { name: "Continue in Sapient", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Your inbox is still locked",
  );
  await page.evaluate(() => {
    (window as any).declineMailboxGrant = false;
  });
  await dialog
    .getByRole("button", { name: "Continue in Sapient", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unlock 27 loaded letters", exact: true }),
  ).toBeEnabled();
  await assertReadOnly(page, writes);
});

test("dismissing a pending wallet permission ignores its late success", async ({
  page,
}) => {
  const writes = await mailboxFixture(page);
  await page.goto("./#/postboxes");
  await connect(page);
  await page.evaluate(() => {
    (window as any).delayMailboxGrant = true;
  });
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Unlock your private inbox",
  });
  await dialog
    .getByRole("button", { name: "Continue in Sapient", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).releaseMailboxGrant))
    .toBe("function");
  await dialog.getByRole("button", { name: "Not now", exact: true }).click();
  await page.evaluate(() => {
    (window as any).releaseMailboxGrant();
  });
  await expect(
    page.getByRole("button", { name: "Unlock private inbox", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Unlock 27 loaded letters", exact: true }),
  ).toBeDisabled();
  await assertReadOnly(page, writes);
});

test("opening decrypted incoming mail stages read once, keeps edits through compose and leaves previews unread", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page
    .getByRole("searchbox", { name: "Search this folder" })
    .fill("Letter 10");
  const row = page.locator(".mailbox-message").filter({
    has: page.getByRole("button", {
      name: "Open letter: Letter 10",
      exact: true,
      includeHidden: true,
    }),
  });
  await expect(row).toHaveClass(/unread/);
  await readable(row.locator(".mailbox-row-heading strong"));
  await page.locator(".mailbox-preferences summary").click();
  await page
    .getByRole("combobox", { name: "Message spacing" })
    .selectOption("comfortable");
  await readable(row.locator(".mailbox-row-preview"));
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await row
    .getByRole("button", { name: "Open letter: Letter 10", exact: true })
    .click();
  await expect(row).toHaveClass(/read/);
  await expect(row).not.toHaveClass(/unread/);
  await readable(page.locator(".mailbox-save-bar strong"));
  await readable(page.locator(".mailbox-save-bar p").first());
  await page.screenshot({
    path: test.info().outputPath("mailbox-open-save-notice.png"),
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Save mailbox changes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await expect(row).toHaveClass(/unread/); // Discard stays discarded while the reader remains open.
  await page
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
  await row
    .getByRole("button", { name: "Open letter: Letter 10", exact: true })
    .click();
  await expect(row).toHaveClass(/read/);
  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save mailbox changes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await assertReadOnly(page, writes);
});
test("reload resumes only an existing wallet and private grant without repeat permission", async ({
  page,
}) => {
  const writes = await mailboxFixture(
    page,
    "note-01",
    true,
    false,
    false,
    false,
    true,
  );
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "My postboxes", exact: true }),
  ).toHaveValue("home");
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await expect(
    page.getByRole("dialog", { name: "Unlock your private inbox" }),
  ).toHaveCount(0);
  const methods = await page.evaluate(() => (window as any).mailboxMethods);
  expect(methods).not.toContain("tari_requestAccounts");
  expect(methods).not.toContain("tari_requestViewAccess");
  expect(methods).toContain("tari_getViewAccess");
  await assertReadOnly(page, writes);
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => (window as any).mailboxMethods),
  ).not.toContain("tari_getAccounts");
});
test("removed private grant stays locked after reload and asks again explicitly", async ({
  page,
}) => {
  const writes = await mailboxFixture(
    page,
    "note-01",
    true,
    false,
    false,
    false,
    true,
  );
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await page.evaluate(() => sessionStorage.setItem("fixture:granted", "0"));
  await page.reload();
  const dialog = page.getByRole("dialog", {
    name: "Unlock your private inbox",
  });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Unlock 27 loaded letters", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(() => (window as any).mailboxMethods),
  ).not.toContain("tari_requestViewAccess");
  await dialog.getByRole("button", { name: "Continue in Sapient" }).click();
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await assertReadOnly(page, writes);
});

test("a failed private letter read never stages a read mark or save transaction", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue in Sapient", exact: true })
    .click();
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page.evaluate(() => {
    (window as any).denyMailboxRead = true;
  });
  await page
    .getByRole("searchbox", { name: "Search this folder", exact: true })
    .fill("note-10");
  await page
    .getByRole("button", { name: "Sealed letter · note-10", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Mailbox folders" })
      .getByRole("button", { name: /Unread/ }),
  ).toContainText("25");
  await expect(
    page.getByRole("button", { name: "Save mailbox changes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('.mailbox-message:has([data-envelope-id="note-10"])'),
  ).toHaveClass(/unread/);
  await assertReadOnly(page, writes);
});
test("unsaved read changes remain visible on other pages and clear on disconnect", async ({
  page,
}) => {
  const writes = await mailboxFixture(page, "note-01", true);
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  await expect(page.locator(".mailbox-workspace")).toHaveClass(/compact/);
  await page
    .getByRole("checkbox", { name: "Select letter note-10", exact: true })
    .check();
  await page
    .getByRole("combobox", {
      name: "Actions for selected letters",
      exact: true,
    })
    .selectOption("1:true");
  await page.getByRole("button", { name: "Public mail", exact: true }).click();
  await expect(
    page.getByText("1 postbox has unsaved mailbox changes", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to my inbox to save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save mailbox changes", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await expect(page.locator(".mailbox-save-bar")).toHaveCount(0);
  await assertReadOnly(page, writes);
});

test("moonlit mailbox keeps tools optional and uses a focused phone reader", async ({
  page,
}) => {
  const writes = await mailboxFixture(
    page,
    "note-01",
    true,
    false,
    false,
    true,
  );
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page);
  const tools = page.locator(".mailbox-tools");
  await expect(tools).not.toHaveAttribute("open", "");
  await expect(
    page.getByRole("button", { name: "Edit selected postbox" }),
  ).not.toBeVisible();
  await tools.locator(":scope > summary").click();
  await expect(
    page.getByRole("button", { name: "Edit selected postbox" }),
  ).toBeVisible();
  await readable(tools.locator(":scope > summary"));
  await page
    .getByRole("searchbox", { name: "Search this folder" })
    .fill("Letter 3");
  await page
    .getByRole("button", {
      name: "Open letter: Letter 3",
      exact: true,
    })
    .click();
  const reader = page.getByRole("region", {
    name: "Letter 3",
    exact: true,
  });
  await expect(reader.locator(".letter-participants")).toContainText(
    "Someone else",
  );
  await expect(reader.locator(".letter-participants")).toContainText(
    "To Moonlit home",
  );
  await readable(reader.locator(".letter-participants strong"));
  await readable(reader.locator(".letter-participants p"));
  await readable(reader.locator(".letter-private-label"));
  await expect(
    page.getByLabel("Unsaved mailbox changes", { exact: true }),
  ).toBeVisible();
  if (page.viewportSize()!.width <= 600) {
    await expect(page.locator(".mailbox-sidebar")).not.toBeVisible();
    await expect(page.locator(".mailbox-list-panel")).not.toBeVisible();
  }
  await page.screenshot({
    path: test.info().outputPath("moonmail-conversation.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
  await expect(page.locator(".mailbox-sidebar")).toBeVisible();
  await expect(page.locator(".mailbox-list-panel")).toBeVisible();
  await expect(reader).toHaveCount(0);
  await page
    .getByRole("button", { name: "Discard unsaved changes", exact: true })
    .click();
  await page.getByRole("searchbox", { name: "Search this folder" }).clear();
  await page.screenshot({
    path: test.info().outputPath("moonmail-inbox.png"),
    fullPage: true,
  });
  await assertReadOnly(page, writes);
});

test("a hundred encrypted incoming letters remain paged and selectable without writes", async ({
  page,
}) => {
  const writes = await mailboxFixture(
    page,
    "note-01",
    true,
    false,
    false,
    false,
    false,
    100,
  );
  await page.goto("./#/postboxes");
  await connect(page);
  const more = page.getByRole("button", {
    name: "Load more letters",
    exact: true,
  });
  if (await more.isVisible()) await more.click();
  await page
    .getByRole("button", { name: "Unlock private inbox", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue in Sapient" }).click();
  await page
    .getByRole("button", { name: "Unlock 100 loaded letters", exact: true })
    .click();
  await expect(page.locator(".mailbox-range")).toHaveText(
    "1–12 of 99 loaded letters",
  );
  await page
    .getByRole("checkbox", { name: "Select this page", exact: true })
    .check();
  await expect(
    page.getByRole("status").filter({ hasText: /^12 selected$/ }),
  ).toHaveText("12 selected");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".mailbox-range")).toHaveText(
    "13–24 of 99 loaded letters",
  );
  await expect(
    page.getByRole("checkbox", { name: "Select this page", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search this folder" })
    .fill("Encrypted letter 100 from the post office.");
  await expect(
    page.getByRole("button", { name: "Open letter: Letter 100", exact: true }),
  ).toBeVisible();
  await assertReadOnly(page, writes);
});

test("approved concept composition uses real controls, a bundled font and explicitly fictional preview letters", async ({
  page,
}) => {
  const writes = await mailboxFixture(
    page,
    "note-01",
    true,
    false,
    false,
    false,
    false,
    27,
    true,
  );
  if (page.viewportSize()!.width > 900)
    await page.setViewportSize({ width: 1586, height: 992 });
  await page.goto("./#/postboxes");
  await connect(page);
  await unlock(page, "The midnight delivery");
  await expect(
    page
      .locator(".header-search-target")
      .getByRole("searchbox", { name: "Search this folder" }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () =>
      (await document.fonts.load("16px Inter")).some(
        (font) => font.status === "loaded",
      ),
    ),
  ).toBe(true);
  await expect(page.locator(".mailbox-tools")).not.toHaveAttribute("open", "");
  await expect(
    page.getByRole("combobox", { name: "Sort letters" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Open letter: The midnight delivery",
      exact: true,
    })
    .click();
  const reader = page.getByRole("region", {
    name: "The midnight delivery",
    exact: true,
  });
  await expect(reader.locator(".letter-participants strong")).toHaveText(
    "Mara",
  );
  await expect(reader.locator(".letter-participants p")).toHaveText(
    "To seal-public",
  );
  await expect(reader.locator(".claim-panel")).toHaveCount(0);
  await expect(
    reader.getByRole("button", { name: /^Reply to this spirit/ }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Unsaved mailbox changes", { exact: true }),
  ).toBeVisible();
  await readable(reader.locator(".letter-body"));
  await page.evaluate(() => {
    // Mark the screenshot honestly; these valid encrypted test fixtures never become live mail.
    document.querySelector(".eyebrow")!.textContent =
      "DESIGN CHECK · FICTIONAL MAIL · NO TRANSACTIONS";
    scrollTo(0, 0);
  });
  await page.screenshot({
    path: test.info().outputPath("concept-matched-mailbox.png"),
  });
  await page
    .getByRole("button", { name: "Disconnect wallet", exact: true })
    .click();
  await expect(page.locator(".header-search-target")).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "Search this folder" }),
  ).toHaveCount(0);
  await assertReadOnly(page, writes);
});
