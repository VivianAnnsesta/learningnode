const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

let serverProcess = null;
let serverPort = null;
let mainWindow = null;
let localApiToken = null;
const runtimeVerificationEnabled = process.env.ELECTRON_VERIFY_RUNTIME === "1";
const securityVerificationEnabled = process.env.ELECTRON_VERIFY_SECURITY === "1";

app.setName("Antigravity");
app.disableHardwareAcceleration();

const localAppDataDir =
  process.env.LOCALAPPDATA ||
  process.env.APPDATA ||
  path.join(app.getPath("home"), "AppData", "Local");

const configuredDevelopmentUserDataDir =
  process.env.ELECTRON_USER_DATA_DIR?.trim();
const userDataDir = app.isPackaged
  ? path.join(localAppDataDir, "Antigravity")
  : configuredDevelopmentUserDataDir ||
    path.join(__dirname, ".electron-user-data");

if (securityVerificationEnabled) {
  // Validate isolation before touching a database or a real user's data directory.
  const verificationRoot = process.env.ENGLISHNODE_SECURITY_VERIFICATION_ROOT;
  const temporaryRoot = fs.realpathSync(require("os").tmpdir());
  if (!app.isPackaged || !verificationRoot ||
      path.dirname(fs.realpathSync(verificationRoot)) !== temporaryRoot ||
      !path.basename(verificationRoot).startsWith("englishnode-electron-security-") ||
      path.resolve(userDataDir) !== path.join(fs.realpathSync(verificationRoot), "Antigravity") ||
      !fs.existsSync(path.join(verificationRoot, ".englishnode-security-isolation"))) {
    throw new Error("Packaged security verification requires its isolated temporary user directory.");
  }
}

app.setPath("userData", userDataDir);
fs.mkdirSync(userDataDir, { recursive: true });
const startupLogPath = path.join(userDataDir, "backend-error.log");
const logStartupFailure = (error) => {
  try { fs.appendFileSync(startupLogPath, `[STARTUP ${new Date().toISOString()}]: ${error.stack || error.message || String(error)}\n`); }
  catch (logError) { console.error("Failed to preserve startup error:", logError.message); }
};

const runtimeVerificationResultPath =
  process.env.ELECTRON_VERIFY_RESULT ||
  path.join(userDataDir, "electron-runtime-verification.json");

const writeRuntimeVerificationResult = (payload) => {
  if (!runtimeVerificationEnabled) return;
  try {
    fs.mkdirSync(path.dirname(runtimeVerificationResultPath), { recursive: true });
    fs.writeFileSync(
      runtimeVerificationResultPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          ...payload
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.error("Failed to write runtime verification result:", error);
  }
};

process.on("uncaughtException", (error) => {
  logStartupFailure(error);
  if (app.isReady()) {
    dialog.showErrorBox("程序启动错误", error.stack || error.message);
  }
});

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

const getAvailablePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("无法获取端口"));
          return;
        }
        resolve(address.port);
      });
    });
  });

const ensureDatabase = async () => {
  const dataDir = app.getPath("userData");
  const serverDir = path.join(process.resourcesPath, "app-server");
  const { ensureTeachingDatabase } = require(path.join(serverDir, "scripts", "teaching-database.js"));
  return ensureTeachingDatabase({ userDataDir: dataDir, serverDir });
};

const projectHistorySources = () => {
  const projectWebRoot = app.isPackaged
    ? path.resolve(path.dirname(process.execPath), "..", "..")
    : __dirname;
  // A portable build may sit inside the original project. Offer its old library
  // for explicit read-only viewing; never use it as the new installation seed.
  if (!fs.existsSync(path.join(projectWebRoot, "scripts", "teaching-database.js")) ||
      !fs.existsSync(path.join(projectWebRoot, "prisma", "schema.prisma"))) return [];
  return [path.join(projectWebRoot, "prisma", "dev.db")];
};

const waitForServer = (url) =>
  new Promise((resolve) => {
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
            return;
          }
          setTimeout(check, 500);
        })
        .on("error", () => setTimeout(check, 500));
    };

    check();
  });

const requestStatus = (url, headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.get(url, { headers }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", reject);
  });

const isLocalAppUrl = (url) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      Number(parsed.port) === serverPort
    );
  } catch {
    return false;
  }
};

const isSafeExternalUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

const protectRendererRequests = (window) => {
  window.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!localApiToken || !isLocalAppUrl(details.url)) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    callback({
      requestHeaders: {
        ...details.requestHeaders,
        "X-EnglishNode-Local-Token": localApiToken
      }
    });
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isLocalAppUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
};

const startServer = async () => {
  const isProd = app.isPackaged;
  const serverDir = isProd
    ? path.join(process.resourcesPath, "app-server")
    : path.join(app.getAppPath(), ".next", "standalone");
  const serverPath = path.join(serverDir, "server.js");

  if (isProd && !fs.existsSync(serverPath)) {
    throw new Error(`找不到服务端文件: ${serverPath}`);
  }

  const dbPath = isProd
    ? await ensureDatabase()
    : await require(path.join(app.getAppPath(), "scripts", "teaching-database.js")).ensureTeachingDatabase({
        userDataDir: app.getPath("userData"), serverDir: app.getAppPath(),
        legacyPaths: [path.join(app.getAppPath(), "prisma", "dev.db")]
      });
  const dbUrl = `file:${dbPath.replace(/\\/g, "/")}`;
  const prismaEnginePath = isProd
    ? path.join(
        serverDir,
        "node_modules",
        ".prisma",
        "client",
        "query_engine-windows.dll.node"
      )
    : undefined;

  console.log("Server Path:", serverPath);
  console.log("Database URL:", dbUrl);

  if (isProd && prismaEnginePath && !fs.existsSync(prismaEnginePath)) {
    console.error("Prisma Engine not found at:", prismaEnginePath);
    dialog.showErrorBox(
      "关键文件缺失",
      `Prisma 查询引擎未找到：\n${prismaEnginePath}`
    );
  }

  const logPath = startupLogPath;

  try {
    fs.appendFileSync(logPath, `=== Backend Server Started ${new Date().toISOString()} ===\n`);
  } catch (error) {
    console.error("Failed to init log file:", error);
  }

  const port = await getAvailablePort();
  serverPort = port;

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    ENGLISHNODE_LOCAL_API_TOKEN: crypto.randomBytes(32).toString("base64url"),
    AI_SETTINGS_PATH: path.join(app.getPath("userData"), "ai-settings.json"),
    ENGLISHNODE_LEGACY_DATABASE_PATHS: process.env.ENGLISHNODE_LEGACY_DATABASE_PATHS || JSON.stringify(projectHistorySources()),
    NODE_ENV: isProd ? "production" : "development",
    DATABASE_URL: dbUrl,
    NODE_PATH: isProd ? path.join(serverDir, "node_modules") : undefined,
    PRISMA_QUERY_ENGINE_LIBRARY: prismaEnginePath
  };
  localApiToken = env.ENGLISHNODE_LOCAL_API_TOKEN;

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: serverDir,
    env,
    stdio: "pipe"
  });

  let nextErrorLog = "";

  serverProcess.stdout.on("data", (data) => {
    const message = data.toString();
    console.log(`[NextJS]: ${message}`);
    try {
      fs.appendFileSync(logPath, `[OUT]: ${message}`);
    } catch {}
  });

  serverProcess.stderr.on("data", (data) => {
    const message = data.toString();
    console.error(`[NextJS Err]: ${message}`);
    nextErrorLog += `${message}\n`;
    try {
      fs.appendFileSync(logPath, `[ERR]: ${message}`);
    } catch {}
  });

  serverProcess.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      dialog.showErrorBox(
        "Next.js Server Crashed!",
        `Exit Code: ${code}\nSignal: ${signal}\n\nError Log:\n${nextErrorLog.substring(0, 1000)}`
      );
    }
  });

  serverProcess.on("error", (error) => {
    dialog.showErrorBox("服务启动失败", error.message);
  });
};

const createWindow = async () => {
  try {
    if (app.isPackaged) {
      await startServer();
    }

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      show: !runtimeVerificationEnabled,
      autoHideMenuBar: true,
      webPreferences: {
        sandbox: true,
        webgl: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    });
    protectRendererRequests(mainWindow);

    const url = app.isPackaged
      ? `http://127.0.0.1:${serverPort}`
      : process.env.ELECTRON_START_URL || "http://127.0.0.1:3000";

    console.log(`Loading URL: ${url}`);

    if (app.isPackaged) {
      await waitForServer(url);
    }

    await mainWindow.loadURL(url);
    let clipSecurity;
    if (securityVerificationEnabled) {
      const apiUrl = new URL("/api/domains", url);
      const rendererStatus = await mainWindow.webContents.executeJavaScript(
        "fetch('/api/domains').then((response) => response.status)"
      );
      const unauthenticatedStatus = await requestStatus(apiUrl);
      const foreignHostStatus = await requestStatus(apiUrl, {
        Host: `example.invalid:${serverPort}`
      });
      const foreignOriginStatus = await requestStatus(apiUrl, {
        Origin: "http://127.0.0.1:1",
        "X-EnglishNode-Local-Token": localApiToken
      });
      const originalUrl = mainWindow.webContents.getURL();
      const unsafeUrls = [
        "javascript:document.body.textContent='blocked'",
        "data:text/html,blocked",
        "file:///C:/Windows/win.ini"
      ];
      for (const unsafeUrl of unsafeUrls) {
        await mainWindow.webContents.executeJavaScript(
          `window.open(${JSON.stringify(unsafeUrl)})`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      const unsafeNewWindowBlocked = mainWindow.webContents.getURL() === originalUrl;
      for (const unsafeUrl of unsafeUrls) {
        await mainWindow.webContents.executeJavaScript(
          `window.location.assign(${JSON.stringify(unsafeUrl)})`
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const unsafeNavigationBlocked =
        unsafeNewWindowBlocked && mainWindow.webContents.getURL() === originalUrl;

      if (
        rendererStatus !== 200 ||
        unauthenticatedStatus !== 401 ||
        foreignHostStatus !== 403 ||
        foreignOriginStatus !== 403 ||
        !unsafeNavigationBlocked
      ) {
        throw new Error(
          `Security verification failed: renderer=${rendererStatus}, direct=${unauthenticatedStatus}, foreignHost=${foreignHostStatus}, foreignOrigin=${foreignOriginStatus}, unsafeNavigationBlocked=${unsafeNavigationBlocked}`
        );
      }
      const clipApiUrl = new URL("/api/knowledge-points/clip-preview", url);
      const clipDirect = await requestStatus(clipApiUrl);
      const clipHost = await requestStatus(clipApiUrl, { Host: `example.invalid:${serverPort}` });
      const clipOrigin = await requestStatus(clipApiUrl, { Origin: "http://127.0.0.1:1", "X-EnglishNode-Local-Token": localApiToken });
      if (clipDirect !== 401 || clipHost !== 403 || clipOrigin !== 403) throw new Error("Packaged clipping authentication verification failed.");
      const verifyClipRoutes = async () => {
        const assert = (value, message) => { if (!value) throw new Error(message); };
        const call = async (path, method = "GET", body, expected = 200) => {
          const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
          const data = await response.json();
          assert(response.status === expected, `Clipping route ${method} ${path} returned ${response.status}; expected ${expected}`);
          return data;
        };
        const preview = async text => (await call("/api/knowledge-points/clip-preview", "POST", { mode: "pasted", title: "Packaged clip source", text })).preview;
        const source = capture => ({ kind: "clip", snapshotKey: capture.snapshotKey, receiptId: capture.receiptId, fragmentIds: capture.fragments.map(fragment => fragment.id) });
        const first = await preview("Packaged first paragraph.\n\nPackaged second paragraph.");
        assert(first.mode === "pasted" && first.obtained === false && first.fragments.length === 2, "Packaged preview identity or fragments changed");
        const before = await call("/api/knowledge-points?limit=1");
        assert(before.page.total === 0, "Security verification database must start empty; preview must not create records");
        const command = { requestId: crypto.randomUUID(), title: "Packaged cross-route clipping", body: "Explicitly saved clipped text", kind: "note", sourceType: "user", aliases: ["package alias"], recordDate: { date: "2026-11-09", timeZone: "UTC" }, sources: [source(first)] };
        const created = await call("/api/knowledge-points", "POST", command), point = created.knowledgePoint;
        assert(created.reused === false && created.savedRevisionId === point.currentRevisionId && point.sources[0].snapshotKey === first.snapshotKey && point.sources[0].obtained === false && !Object.hasOwn(point.sources[0], "receiptId"), "Packaged create did not resolve the original preview receipt");
        const originalRawSources = created.revisions[0].sourcesJson;
        const second = await preview("Packaged replacement source, selected for a new revision.");
        const revised = await call(`/api/knowledge-points/${point.id}`, "PATCH", { title: point.title, body: "Explicitly revised clipped text", kind: "note", sourceType: "user", expectedRevisionId: point.currentRevisionId, sources: [{ kind: "retained", sourceIndex: 0 }, source(second)] });
        const history = await call(`/api/knowledge-points/${point.id}`), old = history.revisions.find(revision => revision.id === created.savedRevisionId);
        assert(history.revisions.length === 2 && old.sourcesJson === originalRawSources && old.body === command.body && revised.knowledgePoint.sources.length === 2 && revised.knowledgePoint.sources[1].snapshotKey === second.snapshotKey && revised.knowledgePoint.aliases[0] === "package alias" && revised.knowledgePoint.recordDate.date === "2026-11-09", "Packaged immutable clip history or inherited fields changed");
        const forged = { ...source(first), snapshotKey: first.snapshotKey === "0".repeat(64) ? "1".repeat(64) : "0".repeat(64) };
        await call("/api/knowledge-points", "POST", { ...command, requestId: crypto.randomUUID(), sources: [forged] }, 400);
        // More than the bounded store capacity evicts the old pending capture, not its saved history.
        for (let index = 0; index < 64; index++) await preview(`Isolated eviction capture ${index}.`);
        await call("/api/knowledge-points", "POST", { ...command, requestId: crypto.randomUUID() }, 410);
        const replay = await call("/api/knowledge-points", "POST", command);
        assert(replay.reused === true && replay.savedRevisionId === created.savedRevisionId && replay.knowledgePoint.currentRevisionId === revised.knowledgePoint.currentRevisionId, "Packaged creation replay did not retain original saved-revision identity after receipt eviction");
        const after = await call("/api/knowledge-points?limit=1");
        const final = await call(`/api/knowledge-points/${point.id}`);
        assert(after.page.total === 1 && final.revisions.length === 2 && final.revisions.find(revision => revision.id === created.savedRevisionId).sourcesJson === originalRawSources, "Packaged preview, rejection or replay changed saved facts");
        return { crossRouteCapture: true, immutableHistory: true, tamperRejected: true, evictedReceiptRejected: true, creationReplay: true };
      };
      clipSecurity = { ...await mainWindow.webContents.executeJavaScript(`(${verifyClipRoutes.toString()})()`), authenticationBoundary: true };
    }
    if (runtimeVerificationEnabled) {
      writeRuntimeVerificationResult({
        ok: true,
        packaged: app.isPackaged,
        loadedUrl: url,
        serverPort,
        userDataDir,
        security: securityVerificationEnabled
          ? {
              rendererTokenInjection: true,
              directRequestRejected: true,
              foreignHostRejected: true,
              foreignOriginRejected: true,
              unsafeNavigationBlocked: true,
              clipping: clipSecurity
            }
          : undefined
      });
      setTimeout(() => app.quit(), 250);
      return;
    }
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools();
    }
  } catch (error) {
    logStartupFailure(error);
    console.error("createWindow error:", error);
    if (runtimeVerificationEnabled) {
      writeRuntimeVerificationResult({
        ok: false,
        packaged: app.isPackaged,
        error: error.stack || error.message
      });
      app.exit(1);
      return;
    }
    dialog.showErrorBox("窗口创建错误", error.stack || error.message);
  }
};

if (singleInstanceLock) {
  app.whenReady().then(createWindow);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
