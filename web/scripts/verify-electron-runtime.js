const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const unpackedDir = path.join(root, "dist-electron", "win-unpacked");
const executablePath = path.join(unpackedDir, "Antigravity.exe");
const resultDir = path.join(root, "test-results");
const resultPath = path.join(resultDir, "electron-runtime-verification.json");
const timeoutMs = Number(process.env.ELECTRON_VERIFY_TIMEOUT_MS || 45000);
const upgradeFixtureFlagIndex = process.argv.indexOf("--upgrade-fixture");
const upgradeFixturePath = upgradeFixtureFlagIndex >= 0
  ? path.resolve(root, process.argv[upgradeFixtureFlagIndex + 1] || "")
  : null;
const verificationUserRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "englishnode-electron-runtime-")
);
const verificationUserDataDir = path.join(verificationUserRoot, "Antigravity");
const verificationDatabasePath = path.join(verificationUserDataDir, "englishnode.db");

const cleanupVerificationUserRoot = () => {
  fs.rmSync(verificationUserRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
};

const fail = (message, extra) => {
  console.error(`Electron runtime verification failed: ${message}`);
  if (extra) console.error(extra);
  cleanupVerificationUserRoot();
  process.exit(1);
};

const stopProcess = (child) => {
  if (!child || child.killed || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5000
    });
    return;
  }
  child.kill("SIGTERM");
};

if (!fs.existsSync(executablePath)) {
  fail(`missing executable at ${executablePath}`);
}
if (upgradeFixturePath && !fs.existsSync(upgradeFixturePath)) {
  fail(`missing upgrade fixture at ${upgradeFixturePath}`);
}

if (upgradeFixturePath) {
  fs.mkdirSync(verificationUserDataDir, { recursive: true });
  fs.copyFileSync(upgradeFixturePath, verificationDatabasePath, fs.constants.COPYFILE_EXCL);
}

fs.mkdirSync(resultDir, { recursive: true });
fs.rmSync(resultPath, { force: true });

console.log(`Starting packaged Electron app: ${executablePath}`);

const child = spawn(executablePath, [], {
  cwd: unpackedDir,
  env: {
    ...process.env,
    LOCALAPPDATA: verificationUserRoot,
    APPDATA: verificationUserRoot,
    ELECTRON_VERIFY_RUNTIME: "1",
    ELECTRON_VERIFY_RESULT: resultPath
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const timeout = setTimeout(() => {
  stopProcess(child);
  fail(`timed out after ${timeoutMs}ms`, stderr || stdout);
}, timeoutMs);

child.on("error", (error) => {
  clearTimeout(timeout);
  fail(error.message);
});

child.on("exit", (code) => {
  clearTimeout(timeout);

  if (!fs.existsSync(resultPath)) {
    fail(
      `verification result was not written at ${resultPath}`,
      stderr || stdout
    );
  }

  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  if (code !== 0) {
    fail(`Electron exited with code ${code}`, JSON.stringify(result, null, 2));
  }
  if (!result.ok) {
    fail(result.error || "runtime reported failure", JSON.stringify(result, null, 2));
  }
  if (result.packaged !== true) {
    fail("runtime did not report app.isPackaged=true", JSON.stringify(result, null, 2));
  }
  if (
    typeof result.loadedUrl !== "string" ||
    !/^http:\/\/127\.0\.0\.1:\d+/.test(result.loadedUrl)
  ) {
    fail("runtime did not load a localhost URL", JSON.stringify(result, null, 2));
  }
  if (typeof result.serverPort !== "number" || result.serverPort <= 0) {
    fail("runtime did not report a valid server port", JSON.stringify(result, null, 2));
  }
  if (!fs.existsSync(verificationDatabasePath)) {
    fail("runtime did not create or upgrade the user database", JSON.stringify(result, null, 2));
  }

  const backupFiles = fs.existsSync(verificationUserDataDir)
    ? fs.readdirSync(verificationUserDataDir).filter((name) =>
        /^englishnode\.backup-.+\.db$/.test(name)
      )
    : [];
  if (upgradeFixturePath && backupFiles.length !== 1) {
    fail(
      `upgrade runtime expected exactly one pre-migration backup, found ${backupFiles.length}`,
      JSON.stringify({ result, backupFiles }, null, 2)
    );
  }
  if (!upgradeFixturePath && backupFiles.length !== 0) {
    fail(
      `clean-seed runtime unexpectedly created ${backupFiles.length} backup(s)`,
      JSON.stringify({ result, backupFiles }, null, 2)
    );
  }

  cleanupVerificationUserRoot();
  console.log("Electron runtime verification passed.");
  console.log(`- databaseScenario: ${upgradeFixturePath ? "upgrade" : "clean-seed"}`);
  console.log(`- backupCount: ${backupFiles.length}`);
  console.log(`- loadedUrl: ${result.loadedUrl}`);
  console.log(`- serverPort: ${result.serverPort}`);
  console.log(`- result: ${resultPath}`);
});
