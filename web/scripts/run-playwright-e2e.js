const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const port = process.env.E2E_PORT || "3100";
const browsersPath = path.join(root, ".ms-playwright");
const localHeadlessShellAvailable = fs.existsSync(browsersPath) &&
  fs.readdirSync(browsersPath, { withFileTypes: true }).some((entry) =>
    entry.isDirectory() &&
    entry.name.startsWith("chromium_headless_shell-") &&
    fs.existsSync(
      path.join(browsersPath, entry.name, "chrome-headless-shell-win64", "chrome-headless-shell.exe")
    )
  );
const playwrightCli = path.join(
  root,
  "node_modules",
  "playwright",
  "cli.js"
);
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const seedDatabase = path.join(root, "prisma", "seed.db");

const waitForServer = (url, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on("error", retry);
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 250);
    };
    check();
  });

const stopServer = (server) => {
  if (!server || server.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5000
    });
    return;
  }
  server.kill("SIGTERM");
};

(async () => {
  const aiSettingsSource = process.env.E2E_AI_SETTINGS_SOURCE
    ? path.resolve(process.env.E2E_AI_SETTINGS_SOURCE)
    : null;
  if (aiSettingsSource && !fs.existsSync(aiSettingsSource)) {
    throw new Error("E2E_AI_SETTINGS_SOURCE does not exist.");
  }
  const tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "englishnode-e2e-")
  );
  const databasePath = path.join(tempDirectory, "e2e.db");
  fs.copyFileSync(seedDatabase, databasePath);
  const isolatedAiSettingsPath = aiSettingsSource
    ? path.join(tempDirectory, "ai-settings.json")
    : null;
  if (aiSettingsSource) {
    fs.copyFileSync(aiSettingsSource, isolatedAiSettingsPath);
  }
  const env = {
    ...process.env,
    DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
    E2E_PORT: port,
    ...(isolatedAiSettingsPath
      ? { AI_SETTINGS_PATH: isolatedAiSettingsPath }
      : {}),
    ...(localHeadlessShellAvailable
      ? { PLAYWRIGHT_BROWSERS_PATH: browsersPath }
      : process.env.PLAYWRIGHT_BROWSERS_PATH
        ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }
        : {}),
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost"
  };
  let server = null;

  try {
    const migration = spawnSync(
      process.execPath,
      [prismaCli, "migrate", "deploy"],
      { cwd: root, env, stdio: "inherit", shell: false }
    );
    if (migration.error || migration.status !== 0) {
      throw migration.error || new Error("E2E database migration failed.");
    }

    server = spawn(
      process.execPath,
      [nextCli, "dev", "-H", "127.0.0.1", "-p", port],
      {
        cwd: root,
        env,
        stdio: "inherit",
        shell: false
      }
    );
    await waitForServer(`http://127.0.0.1:${port}`);
    const result = spawnSync(
      process.execPath,
      [playwrightCli, "test", ...process.argv.slice(2)],
      {
        cwd: root,
        env,
        stdio: "inherit",
        shell: false
      }
    );

    if (result.error) {
      console.error(result.error);
    }

    process.exitCode =
      typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    stopServer(server);
    fs.rmSync(tempDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200
    });
    process.exit(process.exitCode ?? 0);
  }
})();
