export type AiVerificationEnvironment = Record<string, string | undefined>;

export function resolveAiVerificationSettingsPath(input: {
  env: AiVerificationEnvironment;
  root: string;
}): string;

export function loadAiVerificationSettings(input: {
  env: AiVerificationEnvironment;
  root: string;
}): {
  settings: Record<string, unknown>;
  settingsPath: string;
};
