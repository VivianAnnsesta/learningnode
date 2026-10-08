const { spawn, spawnSync } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const {
  buildElectronDevEnvironment
} = require("./electron-dev-environment");

const root = path.join(__dirname, "..");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
const electronBinary = require("electron");
const { ensureTeachingDatabase } = require("./teaching-database");

const getAvailablePort = (preferredPort = 3000) =>
  new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = net.createServer();
      server.unref();
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" || error.code === "EACCES") {
          tryPort(0);
          return;
        }
        reject(error);
      });
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          if (!address || typeof address === "string") {
            reject(new Error("Unable to resolve an available development port."));
            return;
          }
          resolve(address.port);
        });
      });
    };

    tryPort(preferredPort);
  });

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

const stopProcess = (child) => {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      timeout: 5000
    });
    return;
  }
  child.kill("SIGTERM");
};

(async () => {
  const port = Number(process.env.PORT || process.env.ELECTRON_DEV_PORT || "3000");
  const resolvedPort = await getAvailablePort(port);
  const appUrl = `http://127.0.0.1:${resolvedPort}`;
  const sharedEnv = buildElectronDevEnvironment({
    baseEnv: process.env,
    root,
    port: resolvedPort
  });

  await ensureTeachingDatabase({
    userDataDir: sharedEnv.ELECTRON_USER_DATA_DIR,
    serverDir: root,
    legacyPaths: [path.join(root, "prisma", "dev.db")]
  });

  console.log(`Starting Next dev server at ${appUrl}`);

  const nextServer = spawn(
    process.execPath,
    [nextCli, "dev", "-H", "127.0.0.1", "-p", String(resolvedPort)],
    {
      cwd: root,
      env: sharedEnv,
      stdio: "inherit",
      shell: false
    }
  );

  let electronApp;

  const cleanup = () => {
    stopProcess(electronApp);
    stopProcess(nextServer);
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  nextServer.on("exit", (code) => {
    if (electronApp && !electronApp.killed) {
      stopProcess(electronApp);
    }
    process.exit(code ?? 0);
  });

  try {
    await waitForServer(appUrl);
    console.log(`Starting Electron UI for ${appUrl}`);
    electronApp = spawn(electronBinary, ["."], {
      cwd: root,
      env: sharedEnv,
      stdio: "inherit",
      shell: false
    });

    electronApp.on("exit", (code) => {
      stopProcess(nextServer);
      process.exit(code ?? 0);
    });
  } catch (error) {
    console.error(error);
    cleanup();
    process.exit(1);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
