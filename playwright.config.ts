import { defineConfig } from "@playwright/test";
const hosted = process.env.GHOSTDROP_TEST_BASE_URL;
if (hosted && (!hosted.startsWith("https://") || !hosted.endsWith("/"))) {
  throw new Error("Hosted checks require an HTTPS base URL ending in /");
}
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: hosted || "http://127.0.0.1:4173/GhostDrop/",
    headless: true,
  },
  webServer: hosted
    ? undefined
    : {
        command: "node tools/static-server.mjs",
        url: "http://127.0.0.1:4173/GhostDrop/",
        reuseExistingServer: false,
      },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1100 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
