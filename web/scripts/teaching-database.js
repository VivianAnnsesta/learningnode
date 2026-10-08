const fs = require("fs");
const path = require("path");
const { databaseUrl, runUserDatabaseLifecycle } = require("./database-lifecycle");

const TEACHING_DATABASE_NAME = "englishnode-teaching-v2.db";

function claimDatabaseStartup(directory) {
  const lock = path.join(directory, "teaching-database-startup.lock");
  const acquire = () => {
    const fd = fs.openSync(lock, "wx");
    try { fs.writeFileSync(fd, JSON.stringify({pid:process.pid})); }
    finally { fs.closeSync(fd); }
  };
  try { acquire(); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try { owner = JSON.parse(fs.readFileSync(lock, "utf8")).pid; } catch {}
    let alive = false;
    if (Number.isInteger(owner) && owner > 0) {
      try { process.kill(owner, 0); alive = true; }
      catch (checkError) { alive = checkError.code !== "ESRCH"; }
    } else alive = Date.now() - fs.statSync(lock).mtimeMs < 30000;
    if (alive) throw new Error("Another startup is preparing the learning database. Retry after it finishes.");
    fs.unlinkSync(lock);
    acquire();
  }
  return () => fs.unlinkSync(lock);
}

// The old database is only read to make a consistent SQLite backup. It is never
// the input to the new curriculum migrations, and is never removed.
async function preserveLegacyDatabase(source, directory, PrismaClient) {
  if (!fs.existsSync(source)) return;
  const backup = path.join(directory, `${path.basename(source)}.before-teaching-v2.db`);
  if (fs.existsSync(backup)) return;
  const temporary = `${backup}.${process.pid}.pending`;
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl(source) } } });
  try {
    await client.$executeRawUnsafe("VACUUM INTO ?", temporary);
    const copy = new PrismaClient({ datasources: { db: { url: databaseUrl(temporary) } } });
    try {
      const result = await copy.$queryRawUnsafe("PRAGMA integrity_check");
      if (result.some(row => Object.values(row).some(value => value !== "ok"))) {
        throw new Error("The retained database backup did not pass SQLite integrity checking.");
      }
    } finally {
      await copy.$disconnect();
    }
    fs.renameSync(temporary, backup);
  } finally {
    await client.$disconnect();
  }
}

async function ensureTeachingDatabase({ userDataDir, serverDir, legacyPaths = [] }) {
  const { PrismaClient } = require(path.join(serverDir, "node_modules", "@prisma", "client"));
  fs.mkdirSync(userDataDir, { recursive: true });
  const release = claimDatabaseStartup(userDataDir);
  try {
  const target = path.join(userDataDir, TEACHING_DATABASE_NAME);
  if (!fs.existsSync(target)) {
    for (const source of new Set([path.join(userDataDir, "englishnode.db"), ...legacyPaths])) {
      await preserveLegacyDatabase(source, userDataDir, PrismaClient);
    }
  }
  // Existing data keeps the established backup / migrate / fidelity / FK gates.
  await runUserDatabaseLifecycle({
    userDatabasePath: target,
    seedDatabasePath: path.join(serverDir, "prisma", "seed.db"),
    schemaPath: path.join(serverDir, "prisma", "schema.prisma"),
    prismaCliPath: path.join(serverDir, "node_modules", "prisma", "build", "index.js"),
    PrismaClient
  });
  return target;
  } finally {
    release();
  }
}

module.exports = { TEACHING_DATABASE_NAME, ensureTeachingDatabase };
