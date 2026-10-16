import type { Page } from "@playwright/test";

export async function connectFromVisibleControl(page: Page) {
  const inline = page
    .locator(".compose")
    .getByRole("button", { name: "Connect to send", exact: true });
  if (new URL(page.url()).hash === "#/compose") await inline.click();
  else
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
}

export async function minimizeComposer(page: Page) {
  const minimize = page.getByRole("button", {
    name: "Minimize composer",
    exact: true,
  });
  if (await minimize.isVisible()) await minimize.click();
}

export async function openDeliveryOptions(page: Page) {
  const options = page.locator(".compose-options");
  if ((await options.getAttribute("open")) === null)
    await options.locator(":scope > summary").click();
}

export async function chooseMailMode(page: Page, name: string) {
  await openDeliveryOptions(page);
  await page.getByRole("button", { name, exact: true }).click();
}

export async function selectRecipient(page: Page, id: string) {
  await page
    .getByRole("combobox", { name: "Recipient postbox", exact: true })
    .fill(id);
  await page
    .getByRole("option")
    .and(page.getByTitle(id, { exact: true }))
    .click();
}
