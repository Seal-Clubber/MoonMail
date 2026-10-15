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
