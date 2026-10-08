import { describe, expect, it } from "vitest";
import { buildElectronDevEnvironment } from "../../../scripts/electron-dev-environment";

describe("Electron development environment", () => {
  it("gives the Next server the Electron userData AI settings path", () => {
    const baseEnv = {
      SAMPLE_FLAG: "preserved",
      AI_SETTINGS_PATH: "C:\\outside\\ai-settings.json"
    };

    const environment = buildElectronDevEnvironment({
      baseEnv,
      root: "C:\\workspace\\web",
      port: 4321
    });

    expect(environment).toMatchObject({
      SAMPLE_FLAG: "preserved",
      PORT: "4321",
      ELECTRON_START_URL: "http://127.0.0.1:4321",
      ELECTRON_USER_DATA_DIR:
        "C:\\workspace\\web\\.electron-user-data",
      AI_SETTINGS_PATH:
        "C:\\workspace\\web\\.electron-user-data\\ai-settings.json"
    });
    expect(baseEnv.AI_SETTINGS_PATH).toBe("C:\\outside\\ai-settings.json");
  });
});
