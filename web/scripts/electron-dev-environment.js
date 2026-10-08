const path = require("path");
const { TEACHING_DATABASE_NAME } = require("./teaching-database");
const { databaseUrl } = require("./database-lifecycle");

const buildElectronDevEnvironment = ({ baseEnv, root, port }) => {
  const userDataDir = path.join(root, ".electron-user-data");
  return {
    ...baseEnv,
    PORT: String(port),
    ELECTRON_START_URL: `http://127.0.0.1:${port}`,
    ELECTRON_USER_DATA_DIR: userDataDir,
    DATABASE_URL: databaseUrl(path.join(userDataDir, TEACHING_DATABASE_NAME)),
    AI_SETTINGS_PATH: path.join(userDataDir, "ai-settings.json")
  };
};

module.exports = { buildElectronDevEnvironment };
