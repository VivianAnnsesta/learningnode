const fs = require("fs");
const path = require("path");
const {
  buildElectronDevEnvironment
} = require("./electron-dev-environment");

const resolveAiVerificationSettingsPath = ({ env, root }) => {
  const configuredPath =
    typeof env.AI_SETTINGS_PATH === "string"
      ? env.AI_SETTINGS_PATH.trim()
      : "";

  if (configuredPath) {
    return path.resolve(root, configuredPath);
  }

  return buildElectronDevEnvironment({
    baseEnv: env,
    root,
    port: Number(env.PORT) || 3000
  }).AI_SETTINGS_PATH;
};

const loadAiVerificationSettings = ({ env, root }) => {
  const settingsPath = resolveAiVerificationSettingsPath({ env, root });
  if (!fs.existsSync(settingsPath)) {
    return { settings: {}, settingsPath };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    return {
      settings:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : {},
      settingsPath
    };
  } catch {
    return { settings: {}, settingsPath };
  }
};

module.exports = {
  loadAiVerificationSettings,
  resolveAiVerificationSettingsPath
};
