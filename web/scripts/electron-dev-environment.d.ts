export function buildElectronDevEnvironment(input: {
  baseEnv: NodeJS.ProcessEnv;
  root: string;
  port: number;
}): NodeJS.ProcessEnv;
