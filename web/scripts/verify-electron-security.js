const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const unpackedDir = path.join(root, "dist-electron", "win-unpacked");
const executablePath = path.join(unpackedDir, "Antigravity.exe");
const resultDir = path.join(root, "test-results");
const resultPath = path.join(resultDir, "electron-security-verification.json");
const timeoutMs = Number(process.env.ELECTRON_SECURITY_TIMEOUT_MS || 45000);
const verificationUserRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "englishnode-electron-security-")
);

const cleanupVerificationUserRoot = () => {
  fs.rmSync(verificationUserRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
};

const fail = (message, extra) => {
  console.error(`Electron security verification failed: ${message}`);
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
  fail(`missing executable at ${executablePath}; run npm run build:app first`);
}

fs.mkdirSync(resultDir, { recursive: true });
fs.rmSync(resultPath, { force: true });

console.log(`Starting packaged Electron security verification: ${executablePath}`);
const child = spawn(executablePath, [], {
  cwd: unpackedDir,
  env: {
    ...process.env,
    LOCALAPPDATA: verificationUserRoot,
    APPDATA: verificationUserRoot,
    ELECTRON_VERIFY_RUNTIME: "1",
    ELECTRON_VERIFY_SECURITY: "1",
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
    fail("verification result was not written", stderr || stdout);
  }

  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  if (code !== 0 || !result.ok || result.packaged !== true) {
    fail(result.error || `Electron exited with code ${code}`, JSON.stringify(result, null, 2));
  }

  const security = result.security;
  if (
    !security ||
    !security.rendererTokenInjection ||
    !security.directRequestRejected ||
    !security.foreignHostRejected ||
    !security.foreignOriginRejected ||
    !security.unsafeNavigationBlocked
  ) {
    fail("one or more packaged security checks did not pass", JSON.stringify(result, null, 2));
  }

  cleanupVerificationUserRoot();
  console.log("Electron security verification passed.");
  console.log("- renderer token injection accepted by the local API");
  console.log("- direct, foreign-Host, and foreign-Origin local API requests were rejected");
  console.log("- javascript:, data:, and file: navigation were isolated from the app window");
});
