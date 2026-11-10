import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./browser-tests",
  testMatch: "**/html5-artifact.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [["list"]],
  outputDir: "test-results-html5",
  use: {
    baseURL: "http://127.0.0.1:4179",
    browserName: "chromium",
    viewport: { width: 960, height: 640 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [{
    command: "node scripts/serve-html5-artifact.mjs",
    url: "http://127.0.0.1:4179/",
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      CODOGMA_HTML5_BUILD_OUTPUT: process.env.CODOGMA_HTML5_BUILD_OUTPUT ?? "",
      CODOGMA_HTML5_ENTRY: process.env.CODOGMA_HTML5_ENTRY ?? "index.html",
      PORT: "4179",
    },
  }],
});
