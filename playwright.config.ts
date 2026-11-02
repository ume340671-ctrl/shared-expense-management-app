import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.browser.ts",
  workers: 1,
  timeout: 60_000,
  use: { headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
  reporter: "list",
});