const path = require("path");
const { spawn } = require("child_process");
const { ensureTeachingDatabase } = require("./teaching-database");
const { databaseUrl } = require("./database-lifecycle");

(async () => {
  const root = path.resolve(__dirname, "..");
  const args = process.argv.slice(2);
  const production = args.includes("--production");
  const database = await ensureTeachingDatabase({
    userDataDir: path.join(root, ".electron-user-data"),
    serverDir: root,
    legacyPaths: [path.join(root, "prisma", "dev.db")]
  });
  const command = production
    ? [path.join(root, ".next", "standalone", "server.js")]
    : [path.join(root, "node_modules", "next", "dist", "bin", "next"), "dev", ...args, "-H", "127.0.0.1"];
  const child = spawn(process.execPath, command, {
    cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl(database), HOSTNAME:"127.0.0.1", ...(production?{NODE_ENV:"production"}:{}) }, stdio: "inherit", shell: false
  });
  child.on("error", error => { console.error(error); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 1; });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
})().catch(error => { console.error(error); process.exitCode = 1; });
