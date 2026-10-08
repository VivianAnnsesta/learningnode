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
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("disable-direct-composition");
app.commandLine.appendSwitch("disable-features", "Vulkan,UseSkiaRenderer");
app.commandLine.appendSwitch("use-angle", "swiftshader");
app.commandLine.appendSwitch("use-gl", "swiftshader");
app.commandLine.appendSwitch("enable-unsafe-swiftshader");
app.commandLine.appendSwitch("in-process-gpu");

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

app.setPath("userData", userDataDir);
fs.mkdirSync(userDataDir, { recursive: true });

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

  const logPath = isProd
    ? path.join(process.resourcesPath, "..", "backend-error.log")
    : path.join(__dirname, "backend-error.log");

  try {
    fs.writeFileSync(logPath, "=== Backend Server Log Started ===\n");
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
              unsafeNavigationBlocked: true
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
