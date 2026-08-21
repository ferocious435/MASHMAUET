import { join } from "node:path";

import { defineConfig } from "@playwright/test";

const port = Number(process.env.MASHMAUET_E2E_PORT ?? 34173);
const dataRootPath = join(process.cwd(), ".tmp", "playwright", `run-${process.pid}`);

process.env.MASHMAUET_E2E_DATA_ROOT = dataRootPath;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "line",
  outputDir: "test-results/playwright",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    url: `http://127.0.0.1:${port}/local/health`,
    env: {
      MASHMAUET_LOCAL_DATA: dataRootPath,
      PORT: String(port),
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
