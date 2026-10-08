import { test, expect } from "@playwright/test";
import {
  generateKeypair,
  generateOotleAddress,
} from "@tari-project/ootle-wasm";
import { emptyDeployment } from "../../src/core/config";
import { encodeMailboxCapsule } from "../../src/core/capsules";
import { sealMailbox } from "../../src/core/mailbox";
import ledger from "../fixtures/capsule-carrier.json" with { type: "json" };

// Synthetic wallet state and a real engine carrier fixture. No live keys or funds.
test("a stalled private inbox read can retry in its letter without signing or losing its contents", async ({
  page,
}) => {
  const owner = generateKeypair(),
    view = generateKeypair(),
    key = generateKeypair();
  const controller = Buffer.from(owner.public_key).toString("hex"),
    address = generateOotleAddress(owner.public_key, view.public_key, 38);
  owner.free();
  view.free();
  const d = {
    ...emptyDeployment,
    network: 38,
    registry: `component_${"a".repeat(64)}`,
    template: "b".repeat(64),
    envelopeTemplate: "c".repeat(64),
    indexerUrl: "https://inbox-fixture.invalid/",
  };
  const account = `component_${"d".repeat(64)}`,
    child = `component_${"e".repeat(64)}`,
    id = "private-note";
  const resource = Object.keys(ledger).find((id) =>
      id.startsWith("resource_"),
    )!,
    utxo = Object.keys(ledger).find((id) => id.startsWith("utxo_"))!;
  const context = { ...d, controller, postbox: "box", keyVersion: 1 };
  const secret = key.secret_key;
  key.free();
  const encoded = await encodeMailboxCapsule(context, secret);
  secret.fill(0);
  const descriptor = {
    ...encoded.descriptor,
    recovery: "sapient-capsule-1" as const,
    capsule: { resource, commitment: utxo.slice(-64) },
  };
  const payload = await sealMailbox(
    {
      subject: "A recovered kindness",
      body: "Your note is still waiting behind the seal.",
    },
    context,
    id,
    descriptor,
  );
  await page.addInitScript(
    ({ account, address, resource, commitment, memo }) => {
      const w = window as any;
      let connected = false;
      w.walletMethods = [];
      w.tari = {
        isTariWallet: true,
        info: {
          name: "Sapient fixture",
          rdns: "mw.tari.sapient",
          embedded: false,
        },
        request: async ({ method }: any) => {
          w.walletMethods.push(method);
          if (method === "tari_getNetwork") return "esmeralda";
          if (method === "tari_requestAccounts") {
            connected = true;
            return [account];
          }
          if (method === "tari_getAccounts") return connected ? [account] : [];
          if (method === "tari_getWalletAddress") return address;
          if (method === "tari_getCapabilities")
            return { transactionRequests: true, walletAddress: true };
          if (method === "tari_getViewAccess") return { granted: true };
          if (method === "tari_getShieldedOutputs")
            return [
              { resourceAddress: resource, commitment, amount: "1", memo },
            ];
          throw new Error("Unexpected wallet method");
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
  await page.route("**/deployment.json", (r) => r.fulfill({ json: d }));
  let hold = true,
    writes = 0,
    release!: () => void,
    started!: () => void;
  const pending = new Promise<void>((r) => (release = r)),
    requested = new Promise<void>((r) => (started = r));
  await page.route(`${d.indexerUrl}**`, async (r) => {
    if (r.request().method() !== "GET") writes++;
    const url = r.request().url();
    if (url.includes(resource) || url.includes(utxo)) {
      const ref = url.includes(utxo) ? utxo : resource;
      if (hold && ref === resource) {
        started();
        await pending;
      }
      return r.fulfill({
        json: structuredClone(ledger[ref as keyof typeof ledger]),
      });
    }
    return r.fulfill({
      json: {
        substate: {
          Component: {
            header: {
              owner_rule: "None",
              template_address: url.includes(d.registry)
                ? d.template
                : d.envelopeTemplate,
            },
            body: {
              state: url.includes(d.registry)
                ? [
                    38,
                    { [id]: child },
                    {
                      box: [
                        "box",
                        "Moonlit box",
                        controller,
                        JSON.stringify(descriptor),
                        true,
                      ],
                    },
                    `template_${d.envelopeTemplate}`,
                  ]
                : [
                    38,
                    id,
                    2,
                    JSON.stringify(payload),
                    "0",
                    "0",
                    false,
                    controller,
                    "box",
                    "",
                    "f".repeat(64),
                    "",
                  ],
            },
          },
        },
      },
    });
  });
  await page.goto("./#/postboxes");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Connect Sapient", exact: true })
    .click();
  await page.clock.install();
  await page
    .getByRole("button", { name: /Sealed letter · private-note/ })
    .click();
  const dialog = page.getByRole("dialog");
  await requested;
  await page.clock.runFor(15_001);
  await expect(dialog.getByRole("alert")).toContainText("read timed out");
  const retry = dialog.getByRole("button", {
    name: "Retry opening letter",
    exact: true,
  });
  await expect(retry).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).walletMethods.includes("tari_getShieldedOutputs"),
    ),
  ).toBe(false);
  const done = page.waitForResponse((r) => r.url().includes(resource));
  release();
  await done;
  await expect(dialog.locator(".letter-body")).toHaveCount(0);
  hold = false;
  await retry.click();
  await expect(dialog).toHaveAccessibleName("A recovered kindness");
  await expect(dialog).toContainText(
    "Your note is still waiting behind the seal.",
  );
  await expect(
    dialog.getByRole("heading", { name: "A recovered kindness", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      (window as any).walletMethods.filter((method: string) =>
        /sign|Transaction|requestView|claimPrivate/.test(method),
      ),
    ),
  ).toEqual([]);
  expect(writes).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("ghostdrop:pending:v1")),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
