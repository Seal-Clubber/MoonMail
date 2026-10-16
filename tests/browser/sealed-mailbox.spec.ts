import { selectRecipient, openDeliveryOptions } from "./support/composer";
import { test, expect, type Page } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import type { Deployment } from "../../src/core/types";
import { hex } from "../../src/core/crypto";
import { encodeMailboxCapsule } from "../../src/core/capsules";
import {
  sealPrivateMail,
  type SealedMessage,
} from "../../src/core/sealed-mail";
import { conversationReplyKey } from "../../src/core/sealed-addressing";
import { readable } from "./support/contrast";
import ledger from "../fixtures/capsule-carrier.json" with { type: "json" };

// Synthetic browser/provider fixture. No real wallet, signature or broadcast.
async function fixture(page: Page, enabled = true, payments = false) {
  const owner = generateKeypair(),
    view = generateKeypair(),
    own = generateKeypair(),
    other = generateKeypair(),
    otherOwner = generateKeypair();
  const foreignAddress = generateOotleAddress(
      otherOwner.public_key,
      view.public_key,
      38,
    ),
    foreignController = payments ? hex(otherOwner.public_key) : "77".repeat(32);
  const controller = hex(owner.public_key),
    address = generateOotleAddress(owner.public_key, view.public_key, 38),
    ownSecret = new Uint8Array(own.secret_key),
    otherSecret = new Uint8Array(other.secret_key),
    ownPub = hex(own.public_key),
    otherPub = hex(other.public_key);
  for (const pair of [owner, view, own, other, otherOwner]) pair.free();
  const account = `component_${"dd".repeat(32)}`,
    resource = Object.keys(ledger).find((k) => k.startsWith("resource_"))!,
    utxo = Object.keys(ledger).find((k) => k.startsWith("utxo_"))!;
  const d: Deployment = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"aa".repeat(32)}`,
    template: "bb".repeat(32),
    envelopeTemplate: "bb".repeat(32),
    indexerUrl: "https://sealed-fixture.invalid/",
    resource: `resource_${"01".repeat(32)}`,
    contractProtocol: "unified-2",
    postboxClaimProtocol: "sapient-proof-1",
    capsule: {
      template: "bb".repeat(32),
      component: `component_${"aa".repeat(32)}`,
      resource,
    },
    sealedDelivery: {
      engine: enabled,
      recovery: enabled,
      stockSapient: enabled,
      sentAndReplies: enabled,
    },
    evidence: {
      ...emptyDeployment.evidence,
      engineClaims: true,
      guestPayout: true,
      sapientWallet: true,
      mailboxRecovery: true,
      postboxClaims: true,
      mailboxState: true,
      nativePrivatePostage: true,
      nativePrivatePayments: payments,
    },
  };
  const home = { postbox: "home", keyVersion: 1, publicKey: ownPub },
    foreign = { postbox: "foreign", keyVersion: 1, publicKey: otherPub };
  const encoded = await encodeMailboxCapsule(
      { ...d, controller, postbox: home.postbox, keyVersion: 1 },
      ownSecret,
    ),
    descriptor = {
      ...encoded.descriptor,
      recovery: "sapient-capsule-1",
      capsule: { resource, commitment: utxo.slice(-64) },
    };
  const otherDescriptor = {
    ...descriptor,
    publicKey: otherPub,
    capsule: { resource, commitment: "cd".repeat(32) },
  };
  const states: Record<string, unknown[]> = {},
    refs: Record<string, string> = {};
  const conversation = "ef".repeat(32),
    reply = await conversationReplyKey(ownSecret, d, conversation);
  const messages: SealedMessage[] = [
    {
      version: payments ? "mm-message-2" : "mm-message-1",
      sender: { ...foreign, controller: foreignController },
      recipient: home,
      letter: {
        subject: "A sealed hello",
        body: "Your recipient address stays inside this ciphertext.",
        ...(payments
          ? {
              privatePayment: {
                version: "mm-payment-1" as const,
                kind: "request" as const,
                nonce: "a1".repeat(32),
                resource: `resource_${"01".repeat(32)}`,
                amount: "12345",
                destination: foreignAddress,
              },
            }
          : {}),
      },
    },
    {
      version: "mm-message-1",
      sender: { ...home, controller },
      recipient: foreign,
      letter: {
        subject: "My recoverable sent letter",
        body: "A different computer can restore this Sent copy.",
      },
      reply: { conversation, publicKey: reply.publicKey },
    },
    {
      version: "mm-message-1",
      sender: { ...foreign, controller: foreignController },
      recipient: { ...home, conversation, publicKey: reply.publicKey },
      letter: {
        subject: "A conversation reply",
        body: "Recovered using a conversation-specific key.",
        thread: {
          version: "gd-thread-1",
          root: "02".repeat(32),
          parent: "02".repeat(32),
        },
      },
    },
  ];
  try {
    for (let i = 0; i < messages.length; i++) {
      const id = (i + 1).toString(16).padStart(2, "0").repeat(32),
        child = `component_${(i + 40).toString(16).padStart(64, "0")}`,
        message = messages[i],
        payload = await sealPrivateMail(
          message,
          { ...d, senderPublicKey: message.sender.controller },
          id,
        );
      refs[id] = child;
      states[child] = [
        38,
        {},
        {},
        `template_${d.template}`,
        {},
        {},
        [
          id,
          38,
          d.registry,
          JSON.stringify(payload),
          message.sender.controller,
        ],
        3,
      ];
    }
  } finally {
    ownSecret.fill(0);
    otherSecret.fill(0);
    reply.secret.fill(0);
  }
  const root = [
    38,
    {},
    {
      home: [
        "home",
        "Moonlit home",
        controller,
        JSON.stringify(descriptor),
        true,
        [],
      ],
      foreign: [
        "foreign",
        "Other spirit",
        foreignController,
        JSON.stringify(otherDescriptor),
        true,
        [],
      ],
    },
    `template_${d.template}`,
    {},
    refs,
    [],
    0,
    [],
    [],
    resource,
  ];
  let writes = 0;
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  await page.route(`${d.indexerUrl}**`, (r) => {
    if (r.request().method() !== "GET") {
      writes++;
      return r.abort();
    }
    const url = r.request().url(),
      carrier =
        url.includes(utxo) ||
        url.includes(`utxo_${resource.slice(9)}_${"cd".repeat(32)}`)
          ? utxo
          : url.includes(resource)
            ? resource
            : undefined;
    if (carrier)
      return r.fulfill({
        json: structuredClone(ledger[carrier as keyof typeof ledger]),
      });
    if (new URL(url).pathname === "/epoch-manager/stats")
      return r.fulfill({ json: { current_epoch: 100 } });
    const child = Object.keys(states).find((k) => url.includes(k));
    return r.fulfill({
      json: {
        version: 0,
        substate: {
          Component: {
            header: { template_address: d.template, owner_rule: "None" },
            body: { state: child ? states[child] : root },
          },
        },
      },
    });
  });
  await page.addInitScript(
    ({ account, address, resource, commitment, memo }) => {
      const w = window as any;
      w.sealedMethods = [];
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Stock protocol fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: { method: string }) => {
          w.sealedMethods.push(method);
          if (method === "tari_getNetwork") return "esmeralda";
          if (method === "tari_requestAccounts") {
            sessionStorage.setItem("fixture:sealed-connected", "1");
            return [account];
          }
          if (method === "tari_getAccounts")
            return sessionStorage.getItem("fixture:sealed-connected") === "1"
              ? [account]
              : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return {
              transactionRequests: true,
              walletAddress: true,
              supportsPrivateFees: true,
              privateSpend: true,
              privateScan: true,
            };
          if (method === "tari_requestViewAccess") {
            sessionStorage.setItem("fixture:sealed-grant", "1");
            return { granted: true };
          }
          if (method === "tari_getViewAccess")
            return {
              granted: sessionStorage.getItem("fixture:sealed-grant") === "1",
            };
          if (method === "tari_getShieldedOutputs") {
            if (sessionStorage.getItem("fixture:sealed-grant") !== "1")
              throw new Error("No private view grant");
            return [
              { resourceAddress: resource, commitment, amount: "1", memo },
            ];
          }
          if (method === "tari_disconnect") {
            sessionStorage.removeItem("fixture:sealed-connected");
            sessionStorage.removeItem("fixture:sealed-grant");
            return null;
          }
          throw new Error(
            `Unexpected spending/unsupported wallet method ${method}`,
          );
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
  return {
    foreignAddress,
    writes: () => writes,
    privateMarkers: messages.map((m) => m.letter.body),
  };
}
async function connect(page: Page) {
  await page.goto("./#/postboxes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Unlock your private inbox",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue in Sapient", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Open letter: A sealed hello",
      exact: true,
    }),
  ).toBeVisible();
}
async function readOnly(page: Page, writes: () => number) {
  expect(writes()).toBe(0);
  expect(
    await page.evaluate(() =>
      (window as any).sealedMethods.filter((m: string) =>
        /sign|submit|TransactionRequest|claimPrivate/.test(m),
      ),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("connecting from the composer requests private view once and keeps spending separate", async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto("./#/compose");
  await page
    .getByRole("button", { name: "Connect to send", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  const permission = page.getByRole("dialog", {
    name: "Unlock your private inbox",
    exact: true,
  });
  await expect(permission).toHaveCount(1);
  await expect(permission).toBeVisible();
  expect(await page.locator("dialog[open]").count()).toBe(1);
  await permission
    .getByRole("button", { name: "Continue in Sapient", exact: true })
    .click();
  await expect(permission).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Recipient postbox", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Minimize composer", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Open letter: A sealed hello",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await page.evaluate(() => (window as any).sealedMethods)).filter(
      (method: string) => method === "tari_requestViewAccess",
    ),
  ).toHaveLength(1);
  await readOnly(page, f.writes);
});

test("sealed discovery fills Inbox and Sent and keeps mailbox actions and replies in the familiar workspace", async ({
  page,
}) => {
  const f = await fixture(page);
  await connect(page);
  await page
    .getByRole("button", { name: "Open letter: A sealed hello", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "A sealed hello", exact: true })
      .getByText("Your recipient address stays inside this ciphertext.", {
        exact: true,
      }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ghost View/ }).click();
  await page.screenshot({
    path: test.info().outputPath("sealed-inbox.png"),
    fullPage: true,
  });
  await expect(
    page.getByText(/Access-slot keys and local decrypted addressing/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to messages", exact: true })
    .click();
  await page.getByRole("button", { name: /^Sent/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Open letter: My recoverable sent letter",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open letter: My recoverable sent letter",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".mailbox-sent-detail")
      .getByText("A different computer can restore this Sent copy.", {
        exact: true,
      }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("sealed-sent.png"),
    fullPage: true,
  });
  await readOnly(page, f.writes);
});
test("sending above an open conversation keeps approval controls locked and returns to Activity once", async ({
  page,
}) => {
  const f = await fixture(page);
  await connect(page);
  await page
    .getByRole("button", { name: "Open letter: A sealed hello", exact: true })
    .click();
  await expect(page.locator(".letter-body")).toBeVisible();
  await page.getByRole("button", { name: "Compose", exact: true }).click();
  await selectRecipient(page, "foreign");
  await page.getByLabel("Subject", { exact: true }).fill("One simulated reply");
  await page
    .getByLabel("Your letter", { exact: true })
    .fill("Synthetic transaction fixture; never sent to a network.");
  await page
    .getByRole("button", { name: "Review letter", exact: false })
    .click();
  await page.evaluate(() => {
    const w = window as any,
      previous = w.tari.request;
    w.composerRequests = [];
    w.tari.request = async (args: any) => {
      if (args.method === "tari_createTransactionRequest") {
        w.composerRequests.push(args.method);
        return { requestId: "request_composer_fixture" };
      }
      if (args.method === "tari_getTransactionRequest")
        return { requestId: "request_composer_fixture", status: "approved" };
      if (args.method === "tari_submitTransactionRequest") {
        w.composerRequests.push(args.method);
        return new Promise((resolve) => {
          w.finishComposerSubmission = () =>
            resolve({ transactionId: "9".repeat(64) });
        });
      }
      return previous(args);
    };
  });
  await page
    .getByRole("button", { name: "Send encrypted letter", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => typeof (window as any).finishComposerSubmission),
    )
    .toBe("function");
  await expect(
    page.getByRole("button", { name: "Close composer", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Minimize composer", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .locator(".topbar")
      .getByRole("button", { name: "Activity", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => (window as any).finishComposerSubmission());
  await expect(
    page.getByRole("heading", { name: "Your activity." }),
  ).toBeVisible();
  await expect(page.locator(".compose-window")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).composerRequests)).toEqual([
    "tari_createTransactionRequest",
    "tari_submitTransactionRequest",
  ]);
  expect(f.writes()).toBe(0);
});

test("sealed composition includes recoverable Sent and automatic reply identities without a spend permission", async ({
  page,
}) => {
  const f = await fixture(page);
  await connect(page);
  await page
    .getByRole("button", { name: "Compose", exact: true })
    .last()
    .click();
  await selectRecipient(page, "foreign");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("A quiet reply");
  await page
    .getByRole("textbox", { name: "Your letter", exact: true })
    .fill("A message written under cover of night.");
  await openDeliveryOptions(page);
  await expect(
    page.getByRole("checkbox", {
      name: "Use a conversation-specific reply key",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Conversation-specific reply keys are automatic.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Gift amount (optional)" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: /Review/ })
    .last()
    .click();
  await expect(
    page.getByText("Encrypted copy saved with this letter", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Subject, body, recipient and reply addressing are encrypted/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send encrypted letter", exact: true }),
  ).toBeEnabled();
  await readOnly(page, f.writes);
});
test("reloading restores sealed mail with the actual fixture grant and revocation clears readable mail", async ({
  page,
}) => {
  const f = await fixture(page);
  await connect(page);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Open letter: A sealed hello",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).sealedMethods.filter(
        (m: string) => m === "tari_requestViewAccess",
      ),
    ),
  ).toEqual([]);
  for (const marker of f.privateMarkers)
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain(marker);
  await page.evaluate(() => {
    sessionStorage.removeItem("fixture:sealed-grant");
    window.dispatchEvent(new Event("focus"));
  });
  await expect(
    page.getByRole("button", {
      name: "Open letter: A sealed hello",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", {
      name: "Unlock your private inbox",
      exact: true,
    }),
  ).toBeVisible();
  await readOnly(page, f.writes);
});
test("private payment requests open read-only and require a separate three-approval review", async ({
  page,
}) => {
  const f = await fixture(page, true, true);
  await connect(page);
  await page
    .getByRole("button", { name: "Open letter: A sealed hello", exact: true })
    .click();
  const card = page.getByRole("region", {
    name: "Private payment",
    exact: true,
  });
  await expect(card).toContainText("0.012345 test TARI");
  const reviewButton = card.getByRole("button", {
    name: "Review private payment",
    exact: true,
  });
  await readable(reviewButton);
  await reviewButton.hover();
  await readable(reviewButton);
  await reviewButton.click();
  await expect(
    card.getByRole("group", { name: "Private payment review", exact: true }),
  ).toContainText("Three Sapient approvals");
  await expect(card).toContainText(
    "not an atomic mail-and-payment transaction",
  );
  await readable(
    card.getByRole("button", { name: "Continue with Sapient", exact: true }),
  );
  await readable(
    card.getByRole("button", { name: "Cancel payment review", exact: true }),
  );
  await expect(
    card.getByRole("textbox", { name: "Payment fee limit", exact: true }),
  ).toHaveCount(0);
  await expect(card).toContainText("up to 0.03 TARI per step and attempt");

  await card
    .getByRole("button", { name: "Cancel payment review", exact: true })
    .click();
  await expect(
    card.getByRole("group", { name: "Private payment review", exact: true }),
  ).toHaveCount(0);
  await readOnly(page, f.writes);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(f.foreignAddress);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("composing an encrypted payment request includes an address and amount without requesting a spend", async ({
  page,
}) => {
  const f = await fixture(page, true, true);
  await connect(page);
  await page
    .getByRole("button", { name: "Compose", exact: true })
    .last()
    .click();
  await selectRecipient(page, "foreign");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Private invoice fixture");
  await page
    .getByRole("textbox", { name: "Your letter", exact: true })
    .fill("Pay only after reviewing the encrypted request.");
  await openDeliveryOptions(page);
  await page
    .getByRole("checkbox", { name: "Request a private payment", exact: true })
    .check();
  await page
    .getByRole("textbox", { name: "Requested private payment", exact: true })
    .fill("0.12");
  await page.getByRole("button", { name: /Review letter/ }).click();
  await expect(
    page
      .locator(".review")
      .getByRole("region", { name: "Private payment", exact: true }),
  ).toContainText("0.12 test TARI");
  await expect(
    page.getByRole("button", { name: "Send encrypted letter", exact: true }),
  ).toBeEnabled();
  await readOnly(page, f.writes);
});
test("unverified V4 evidence cannot enable sending or silently switch back to legacy routing", async ({
  page,
}) => {
  const f = await fixture(page, false);
  await connect(page);
  await page
    .getByRole("button", { name: "Compose", exact: true })
    .last()
    .click();
  await selectRecipient(page, "foreign");
  await page
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("Disabled evidence");
  await page
    .getByRole("textbox", { name: "Your letter", exact: true })
    .fill("This fixture must not enable financial requests.");
  await page
    .getByRole("button", { name: /Review/ })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Send encrypted letter", exact: true }),
  ).toBeDisabled();
  await readOnly(page, f.writes);
});

test("a private payment fee failure stays tied to its original request and never offers a replacement", async ({
  page,
}) => {
  const f = await fixture(page, true, true);
  await connect(page);
  await page.evaluate(() => {
    const w = window as any,
      prior = w.tari.request;
    w.failedFeeCreates = 0;
    w.tari.request = async (args: any) => {
      if (args.method === "tari_createTransactionRequest") {
        w.failedFeeCreates++;
        throw Error("fee budget too low: PRIVATE_PROVIDER_DETAIL");
      }
      return prior(args);
    };
  });
  await page
    .getByRole("button", { name: "Open letter: A sealed hello", exact: true })
    .click();
  const card = page.getByRole("region", {
    name: "Private payment",
    exact: true,
  });
  await card
    .getByRole("button", { name: "Review private payment", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Continue with Sapient", exact: true })
    .click();
  const warning = card.getByRole("alert", {
    name: "Payment fee limit warning",
    exact: true,
  });
  await expect(warning).toContainText("Keep the original request");
  await readable(warning.locator("p"));
  await expect(warning.getByRole("button", { name: /Adjust/ })).toHaveCount(0);
  await expect(
    card.getByRole("textbox", { name: "Payment fee limit", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    "PRIVATE_PROVIDER_DETAIL",
  );
  await card
    .getByRole("button", { name: "Continue with Sapient", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => (window as any).failedFeeCreates))
    .toBe(1);
  expect(f.writes()).toBe(0);
});
