import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT || "3100";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const configuredWorkers = Number(process.env.E2E_WORKERS || "1");
const workers =
  Number.isInteger(configuredWorkers) && configuredWorkers > 0
    ? configuredWorkers
    : 1;

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.E2E_OUTPUT_DIR || "./test-results/playwright",
  reporter: [['list'], ['html', { outputFolder: process.env.E2E_REPORT_DIR || './test-results/browser-report', open: 'never' }]],
  timeout: 60000,
  // One isolated SQLite file is shared by the suite. Keep files serial so
  // unrelated writes cannot invalidate global read-only before/after checks.
  // Concurrency scenarios within an individual test still run as written.
  workers,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: chromiumExecutablePath
      ? { executablePath: chromiumExecutablePath }
      : undefined
  }
});
