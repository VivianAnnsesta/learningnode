import { defineConfig } from "@playwright/test";

const port = process.env.E2E_PORT || "3100";
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const configuredWorkers = Number(process.env.E2E_WORKERS || "2");
const workers =
  Number.isInteger(configuredWorkers) && configuredWorkers > 0
    ? configuredWorkers
    : 2;

export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.E2E_OUTPUT_DIR || "./test-results/playwright",
  reporter: [['list'], ['html', { outputFolder: process.env.E2E_REPORT_DIR || './test-results/browser-report', open: 'never' }]],
  timeout: 60000,
  // The runner shares one isolated SQLite file across workers; two workers
  // retain parallel coverage without turning normal gates into DB contention.
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
