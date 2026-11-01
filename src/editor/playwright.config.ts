import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const editorDirectory = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./browser-tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node --experimental-strip-types tests/start-backend.ts",
      cwd: editorDirectory,
      url: "http://127.0.0.1:3000/editor/product.json",
      timeout: 30_000,
      reuseExistingServer: false,
      env: {
        PORT: "3000",
        CODOGMA_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      },
    },
    {
      command: "npm run dev",
      cwd: editorDirectory,
      url: "http://127.0.0.1:5173/",
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
