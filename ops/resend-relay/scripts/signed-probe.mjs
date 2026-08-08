import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

const environmentPath = process.argv[2] ?? "/etc/sarbato-resend-relay.env";
const endpoint =
  process.argv[3] ?? "https://sarbato.space/api/v1/webhooks/resend";
const environment = parseEnvironment(await readFile(environmentPath, "utf8"));
const secret = environment.RESEND_WEBHOOK_SECRET;
if (!secret?.startsWith("whsec_"))
  throw new Error("RESEND_WEBHOOK_SECRET is not configured");

const body = JSON.stringify({
  type: "domain.updated",
  created_at: new Date().toISOString(),
  data: {},
});
const id = `msg_probe_${randomUUID()}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const key = Buffer.from(secret.slice("whsec_".length), "base64");
const signature = createHmac("sha256", key)
  .update(`${id}.${timestamp}.${body}`)
  .digest("base64");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  },
  body,
});
const responseBody = await response.text();
if (response.status !== 200)
  throw new Error(`Signed probe failed with ${response.status}: ${responseBody}`);
console.log(
  JSON.stringify({
    status: response.status,
    response: JSON.parse(responseBody),
  }),
);

function parseEnvironment(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) return [line, ""];
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}
