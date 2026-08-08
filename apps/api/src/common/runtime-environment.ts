import { readFileSync } from "node:fs";
import { join } from "node:path";

const paddleCredentials = {
  PADDLE_API_KEY: "paddle-api-key",
  PADDLE_CLIENT_TOKEN: "paddle-client-token",
  PADDLE_WEBHOOK_SECRET: "paddle-webhook-secret",
} as const;

export function apiRuntimeEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const credentialDirectory = source.CREDENTIALS_DIRECTORY;
  if (!credentialDirectory) return source;
  const resolved = { ...source };
  for (const [environmentKey, credentialName] of Object.entries(
    paddleCredentials,
  )) {
    if (resolved[environmentKey]) continue;
    resolved[environmentKey] = readFileSync(
      join(credentialDirectory, credentialName),
      "utf8",
    ).trim();
  }
  return resolved;
}
