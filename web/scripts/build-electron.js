const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const webRoot = path.resolve(__dirname, "..");
const distDir = path.join(webRoot, "dist-electron");

const forbiddenRuntimeFile = (name) =>
  name === "ai-settings.json" || name === ".env" || name.startsWith(".env.");

const removeForbiddenRuntimeFiles = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeForbiddenRuntimeFiles(entryPath);
    } else if (forbiddenRuntimeFile(entry.name)) {
      fs.rmSync(entryPath, { force: true });
      console.log(`   -> Removed runtime secret input: ${entryPath}`);
    }
  }
};

const removeDevelopmentDatabaseArtifacts = (prismaDirectory) => {
  for (const entry of fs.readdirSync(prismaDirectory, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name === "dev.db" ||
        entry.name.endsWith(".db-journal") ||
        entry.name.endsWith(".db-wal") ||
        entry.name.endsWith(".db-shm"))
    ) {
      fs.rmSync(path.join(prismaDirectory, entry.name), { force: true });
      console.log(`   -> Removed development database artifact: ${entry.name}`);
    }
  }
  const fixturesDirectory = path.join(prismaDirectory, "fixtures");
  if (fs.existsSync(fixturesDirectory)) {
    fs.rmSync(fixturesDirectory, { recursive: true, force: true });
    console.log("   -> Removed synthetic migration fixtures from runtime resources.");
  }
};

console.log("1. Cleaning previous Electron build output...");
if (fs.existsSync(distDir)) {
  try {
    fs.rmSync(distDir, { recursive: true, force: true });
  } catch (e) {
    console.warn("Could not remove output directory directly; renaming it.");
    const fallback = `${distDir}-old-${Date.now()}`;
    fs.renameSync(distDir, fallback);
  }
}

console.log("2. Building Next.js production bundle...");
execSync("npm run build", { cwd: webRoot, stdio: "inherit" });

console.log("3. Preparing standalone runtime...");
const standaloneDir = path.join(webRoot, ".next", "standalone");
removeForbiddenRuntimeFiles(standaloneDir);
const standaloneNodeModulesDir = path.join(standaloneDir, "node_modules");
const pkgPath = path.join(webRoot, "package.json");
if (fs.existsSync(pkgPath)) {
  fs.copyFileSync(pkgPath, path.join(standaloneDir, "package.json"));
}
if (fs.existsSync(standaloneNodeModulesDir)) {
  console.log("   -> Standalone already contains runtime dependencies; skipping npm install.");
} else {
  const npmCacheDir = path.join(webRoot, ".npm-cache");
  fs.mkdirSync(npmCacheDir, { recursive: true });
  execSync(`npm install --omit=dev --no-bin-links --cache "${npmCacheDir}"`, {
    cwd: standaloneDir,
    stdio: "inherit"
  });
}

console.log("4. Creating and validating the versioned empty Prisma seed...");
execSync("npx prisma generate", { cwd: webRoot, stdio: "inherit" });
execSync("node scripts/create-seed-database.js", { cwd: webRoot, stdio: "inherit" });

console.log("5. Generating the fixed synthetic legacy migration fixture...");
execSync("npm run fixture:migration-legacy", { cwd: webRoot, stdio: "inherit" });

console.log("6. Verifying the full synthetic legacy migration lifecycle...");
execSync("npm run verify:migration-fidelity", { cwd: webRoot, stdio: "inherit" });

console.log("7. Packaging Electron shell...");
const electronCacheDir = path.join(webRoot, ".electron-cache");
const electronBuilderCacheDir = path.join(webRoot, ".electron-builder-cache");
fs.mkdirSync(electronCacheDir, { recursive: true });
fs.mkdirSync(electronBuilderCacheDir, { recursive: true });

const mirrors = [
  "https://github.com/electron/electron/releases/download/",
  "https://npmmirror.com/mirrors/electron/"
];

let built = false;
for (const mirror of mirrors) {
  try {
    console.log(`   -> Trying Electron mirror: ${mirror}`);
    execSync("npx electron-builder --win", {
      cwd: webRoot,
      env: {
        ...process.env,
        ELECTRON_MIRROR: mirror,
        ELECTRON_DOWNLOAD_MIRROR: mirror,
        ELECTRON_CACHE: electronCacheDir,
        ELECTRON_BUILDER_CACHE: electronBuilderCacheDir
      },
      stdio: "inherit"
    });
    built = true;
    break;
  } catch (e) {
    console.warn("   -> Mirror failed; trying the next one.");
  }
}

if (!built) {
  console.error("All Electron mirrors failed.");
  process.exit(1);
}

console.log("8. Copying full runtime into packaged resources...");
const targetResourcesDir = path.join(distDir, "win-unpacked", "resources", "app-server");

if (!fs.existsSync(targetResourcesDir)) {
  fs.mkdirSync(targetResourcesDir, { recursive: true });
}

const copyOpts = { recursive: true, force: true };

console.log("   -> Copying standalone server and dependencies...");
fs.cpSync(standaloneDir, targetResourcesDir, copyOpts);
removeForbiddenRuntimeFiles(targetResourcesDir);

console.log("   -> Copying public assets...");
fs.cpSync(path.join(webRoot, "public"), path.join(targetResourcesDir, "public"), copyOpts);

console.log("   -> Copying .next/static assets...");
fs.cpSync(path.join(webRoot, ".next", "static"), path.join(targetResourcesDir, ".next", "static"), copyOpts);

console.log("   -> Copying Prisma database and engines...");
const prismaSource = path.join(webRoot, "prisma"); 
const prismaTarget = path.join(targetResourcesDir, "prisma");

if (fs.existsSync(prismaSource)) {
  console.log(`      Source: ${prismaSource}`);
  fs.cpSync(prismaSource, prismaTarget, copyOpts);
  removeDevelopmentDatabaseArtifacts(prismaTarget);
} else {
  const rootPrismaSource = path.join(webRoot, "..", "prisma");
  if (fs.existsSync(rootPrismaSource)) {
    console.log(`      Fallback source: ${rootPrismaSource}`);
    fs.cpSync(rootPrismaSource, prismaTarget, copyOpts);
  } else {
    console.error("      Could not find a Prisma directory.");
  }
}

console.log("   -> Copying Prisma migration runtime...");
const runtimeNodeModules = path.join(targetResourcesDir, "node_modules");
fs.cpSync(path.join(webRoot, "node_modules", "prisma"), path.join(runtimeNodeModules, "prisma"), copyOpts);
fs.cpSync(path.join(webRoot, "node_modules", "@prisma"), path.join(runtimeNodeModules, "@prisma"), copyOpts);
fs.mkdirSync(path.join(targetResourcesDir, "scripts"), { recursive: true });
fs.copyFileSync(
  path.join(webRoot, "scripts", "database-lifecycle.js"),
  path.join(targetResourcesDir, "scripts", "database-lifecycle.js")
);
fs.copyFileSync(
  path.join(webRoot, "scripts", "teaching-database.js"),
  path.join(targetResourcesDir, "scripts", "teaching-database.js")
);

console.log("Electron packaging finished.");
console.log(`Executable: ${path.join(distDir, "win-unpacked", "Antigravity.exe")}`);

console.log("9. Verifying Electron package output...");
execSync("node scripts/verify-electron-package.js", {
  cwd: webRoot,
  stdio: "inherit"
});
