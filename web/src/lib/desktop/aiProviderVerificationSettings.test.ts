import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAiVerificationSettingsPath
} from "../../../scripts/ai-provider-verification-settings";

describe("AI provider verification settings", () => {
  it("uses the Electron development userData settings by default", () => {
    const root = path.join("C:\\workspace", "web");

    expect(
      resolveAiVerificationSettingsPath({ env: {}, root })
    ).toBe(path.join(root, ".electron-user-data", "ai-settings.json"));
  });

  it("respects an explicit runtime AI_SETTINGS_PATH", () => {
    const root = path.join("C:\\workspace", "web");
    const settingsPath = path.join(
      "C:\\runtime-user-data",
      "ai-settings.json"
    );

    expect(
      resolveAiVerificationSettingsPath({
        env: { AI_SETTINGS_PATH: settingsPath },
        root
      })
    ).toBe(settingsPath);
  });
});
