// Isolated local preview. Never reads production credentials or databases.
import "../apps/api/test/setup.ts";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const role = process.argv[2];
const database = "sarbato_media_qr_integration_20260906";
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_PURPOSE: "integration",
  WEB_URL: "http://127.0.0.1:43241",
  API_URL: "http://127.0.0.1:43242",
  PORT: "43242",
  BIND_HOST: "127.0.0.1",
  DATABASE_URL: `postgresql://weddingos_${role === "worker" ? "worker:weddingos_worker" : "app:weddingos_app"}@127.0.0.1:54339/${database}?schema=public`,
  REDIS_URL: "redis://127.0.0.1:56379/13",
  OBJECT_STORAGE_BUCKET: "sarbato-media-qr-test",
  LOG_LEVEL: "warn",
};
if (role !== "api" && role !== "worker")
  throw new Error("Choose api or worker");
const child = spawn(process.execPath, [`apps/${role}/dist/main.js`], {
  cwd: root,
  env,
  stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
