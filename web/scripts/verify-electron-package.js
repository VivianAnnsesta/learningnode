const fs = require("fs");
const path = require("path");

const webRoot = path.resolve(__dirname, "..");
const distRoot = path.join(webRoot, "dist-electron", "win-unpacked");
const resourcesRoot = path.join(distRoot, "resources");
const appServerRoot = path.join(resourcesRoot, "app-server");

const checks = [
  {
    label: "Electron executable",
    path: path.join(distRoot, "Antigravity.exe"),
    type: "file"
  },
  {
    label: "Packaged Electron shell",
    path: path.join(resourcesRoot, "app.asar"),
    type: "file"
  },
  {
    label: "Next standalone server",
    path: path.join(appServerRoot, "server.js"),
    type: "file"
  },
  {
    label: "Runtime package manifest",
    path: path.join(appServerRoot, "package.json"),
    type: "file"
  },
  {
    label: "Next static assets",
    path: path.join(appServerRoot, ".next", "static"),
    type: "dir"
  },
  {
    label: "Public assets",
    path: path.join(appServerRoot, "public"),
    type: "dir"
  },
  {
    label: "Prisma schema directory",
    path: path.join(appServerRoot, "prisma"),
    type: "dir"
  },
  {
    label: "Versioned empty SQLite seed",
    path: path.join(appServerRoot, "prisma", "seed.db"),
    type: "file",
    minBytes: 1024
  },
  {
    label: "Prisma migration CLI",
    path: path.join(appServerRoot, "node_modules", "prisma", "build", "index.js"),
    type: "file"
  },
  {
    label: "Database lifecycle runtime",
    path: path.join(appServerRoot, "scripts", "database-lifecycle.js"),
    type: "file"
  },
  {
    label: "Prisma query engine",
    path: path.join(
      appServerRoot,
      "node_modules",
      ".prisma",
      "client",
      "query_engine-windows.dll.node"
    ),
    type: "file"
  }
];

const missing = [];

const forbiddenRuntimeFiles = [];
const embeddedSecretFindings = [];
const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /(?:api[_-]?key|authorization)\s*[:=]\s*["'][^"'\s]{12,}["']/gi
];

const inspectRuntimeFileForSecrets = (filePath) => {
  const descriptor = fs.openSync(filePath, "r");
  const probe = Buffer.alloc(8192);
  const read = fs.readSync(descriptor, probe, 0, probe.length, 0);
  fs.closeSync(descriptor);
  if (probe.subarray(0, read).includes(0)) return;

  const content = fs.readFileSync(filePath);
  const text = content.toString("utf8");
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      embeddedSecretFindings.push({ filePath, match: match[0].slice(0, 8) });
      return;
    }
  }
};

const findForbiddenRuntimeFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      findForbiddenRuntimeFiles(entryPath);
    } else if (
      entry.name === "ai-settings.json" ||
      entry.name === ".env" ||
      entry.name.startsWith(".env.")
    ) {
      forbiddenRuntimeFiles.push(entryPath);
    } else {
      inspectRuntimeFileForSecrets(entryPath);
    }
  }
};

const collectFiles = (directory, files = []) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(entryPath, files);
    else files.push(entryPath);
  }
  return files;
};

for (const check of checks) {
  const exists = fs.existsSync(check.path);
  const stats = exists ? fs.statSync(check.path) : null;
  const typeOk =
    check.type === "dir" ? stats?.isDirectory() : stats?.isFile();
  const sizeOk =
    !check.minBytes || (stats?.isFile() && stats.size >= check.minBytes);

  if (!exists || !typeOk || !sizeOk) {
    missing.push({
      label: check.label,
      path: check.path,
      reason: !exists
        ? "missing"
        : !typeOk
          ? `expected ${check.type}`
          : `smaller than ${check.minBytes} bytes`
    });
    continue;
  }

  const size = stats.isFile() ? ` (${stats.size} bytes)` : "";
  console.log(`[ok] ${check.label}: ${check.path}${size}`);
}

if (missing.length > 0) {
  console.error("Electron package verification failed:");
  for (const item of missing) {
    console.error(`- ${item.label}: ${item.reason}: ${item.path}`);
  }
  process.exit(1);
}

findForbiddenRuntimeFiles(appServerRoot);
if (forbiddenRuntimeFiles.length > 0) {
  console.error("Electron package contains forbidden runtime secret inputs:");
  for (const filePath of forbiddenRuntimeFiles) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

if (embeddedSecretFindings.length > 0) {
  console.error("Electron package contains a likely embedded credential:");
  for (const finding of embeddedSecretFindings) {
    console.error(`- ${finding.filePath} (${finding.match}...)`);
  }
  process.exit(1);
}

const packagedDevelopmentDatabase = path.join(appServerRoot, "prisma", "dev.db");
if (fs.existsSync(packagedDevelopmentDatabase)) {
  console.error(`Electron package contains a development database: ${packagedDevelopmentDatabase}`);
  process.exit(1);
}

const packagedMigrationFixtures = path.join(appServerRoot, "prisma", "fixtures");
if (fs.existsSync(packagedMigrationFixtures)) {
  console.error(`Electron package contains migration test fixtures: ${packagedMigrationFixtures}`);
  process.exit(1);
}

const sqliteSidecars = collectFiles(path.join(appServerRoot, "prisma")).filter((filePath) =>
  [".db-journal", ".db-wal", ".db-shm"].some((suffix) => filePath.endsWith(suffix))
);
if (sqliteSidecars.length > 0) {
  console.error(`Electron package contains SQLite sidecar files: ${sqliteSidecars.join(", ")}`);
  process.exit(1);
}

console.log("Electron package verification passed.");
