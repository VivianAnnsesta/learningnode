import { AiConfigurationError } from "../ai/provider";

export async function readOptionalJsonBody<T extends object>(
  request: Request
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export function buildAiRouteErrorResponse(
  error: unknown,
  fallbackMessage: string
) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const status = error instanceof AiConfigurationError ? 503 : 500;
  return Response.json({ error: message }, { status });
}

export async function runAiRoute<T>(
  action: () => Promise<T>,
  fallbackMessage: string
) {
  try {
    return Response.json(await action());
  } catch (error) {
    return buildAiRouteErrorResponse(error, fallbackMessage);
  }
}
