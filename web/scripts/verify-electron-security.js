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
const verificationUserRoot = fs.realpathSync(fs.mkdtempSync(
  path.join(os.tmpdir(), "englishnode-electron-security-")
));
if (path.dirname(verificationUserRoot) !== fs.realpathSync(os.tmpdir()) || !path.basename(verificationUserRoot).startsWith("englishnode-electron-security-")) {
  throw new Error("Security verification root escaped the intended temporary directory.");
}
fs.writeFileSync(path.join(verificationUserRoot, ".englishnode-security-isolation"), "isolated packaged security verification\n", { flag: "wx" });

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
    ENGLISHNODE_SECURITY_VERIFICATION_ROOT: verificationUserRoot,
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
    !security.unsafeNavigationBlocked ||
    !security.clipping?.crossRouteCapture ||
    !security.clipping?.immutableHistory ||
    !security.clipping?.tamperRejected ||
    !security.clipping?.evictedReceiptRejected ||
    !security.clipping?.creationReplay ||
    !security.clipping?.authenticationBoundary ||
    !security.exportDownload?.completed ||
    !security.exportDownload?.cancelled ||
    !security.exportDownload?.windowUnchanged ||
    !security.exportDownload?.businessRecordsUnchanged ||
    !security.exportDownload?.authenticationBoundary
  ) {
    fail("one or more packaged security checks did not pass", JSON.stringify(result, null, 2));
  }

  const exported = security.exportDownload;
  const expectedZip = path.join(verificationUserRoot, "export-downloads", "completed.zip"), cancelledZip = path.join(verificationUserRoot, "export-downloads", "cancelled.zip");
  if (exported.completedPath !== expectedZip || exported.cancelledPath !== cancelledZip || exported.cancelledBytes !== 0 || fs.existsSync(cancelledZip) && fs.statSync(cancelledZip).size !== 0) {
    fail("packaged export did not retain its isolated completed/cancelled paths", JSON.stringify(exported));
  }
  let inspection;
  try {
    // This verification-only outer process uses an independent platform reader after Electron exits.
    inspection = require("./inspect-knowledge-export-zip").inspectKnowledgeExportZip(expectedZip);
    if (inspection.zipSha256 !== exported.completedSha256 || inspection.zipBytes !== exported.completedBytes || inspection.manifest?.records.length !== 1 || inspection.bodySlicesVerified !== 2 || inspection.entries.length !== 4 || inspection.manifest.records[0].revisions.length !== 2) throw new Error("Packaged export ZIP identity/history/body slices did not match the isolated fixture.");
    const savedZip = path.join(resultDir, "electron-security-export.zip");
    fs.copyFileSync(expectedZip, savedZip);
    fs.writeFileSync(path.join(resultDir, "electron-security-export-inspection.json"), JSON.stringify(inspection, null, 2));
    result.security.exportDownload.independentZipVerified = true;
    result.security.exportDownload.reader = inspection.reader;
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));
  } catch (error) { fail(error.message); }
  cleanupVerificationUserRoot();
  console.log("Electron security verification passed.");
  console.log("- renderer token injection accepted by the local API");
  console.log("- direct, foreign-Host, and foreign-Origin local API requests were rejected");
  console.log("- javascript:, data:, and file: navigation were isolated from the app window");
  console.log("- packaged preview/create/revise routes shared clipping receipts and preserved immutable history");
  console.log("- forged and evicted receipts were rejected; frozen creation replay preserved the saved revision");
  console.log("- actual export UI downloads completed and cancelled without navigation or record writes");
  console.log(`- independent platform ZIP reader verified ${inspection.entries.length} files and ${inspection.bodySlicesVerified} exact raw body slices`);
});
