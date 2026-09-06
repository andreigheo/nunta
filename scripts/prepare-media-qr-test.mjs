import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = require("pg");
const databaseName = "sarbato_media_qr_integration_20260906";
const admin = new Client({
  connectionString: "postgresql://weddingos:weddingos@127.0.0.1:54339/postgres",
});
await admin.connect();
try {
  if (
    !(
      await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
        databaseName,
      ])
    ).rowCount
  )
    await admin.query(`CREATE DATABASE "${databaseName}" OWNER weddingos`);
} finally {
  await admin.end();
}
const url = `postgresql://weddingos:weddingos@127.0.0.1:54339/${databaseName}?schema=public`;
for (const action of ["migrate", "seed"]) {
  const result = spawnSync(
    "corepack",
    ["pnpm", "--filter", "@weddingos/database", action],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, DATABASE_URL: url, DATABASE_OWNER_URL: url },
      stdio: "inherit",
    },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Prepared isolated database: ${databaseName}`);
