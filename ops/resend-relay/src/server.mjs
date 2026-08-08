import { createServer } from "node:http";
import { Resend } from "resend";
import { loadConfig } from "./config.mjs";
import { FileEventStore } from "./event-store.mjs";
import { createWebhookHandler, MAX_WEBHOOK_BYTES } from "./handler.mjs";

const config = loadConfig();
const resend = new Resend(config.apiKey);
const eventStore = new FileEventStore(config.eventStoreDirectory);
await eventStore.initialize();

const handleWebhook = createWebhookHandler({
  verifyWebhook: ({ payload, headers }) =>
    resend.webhooks.verify({
      payload,
      headers,
      webhookSecret: config.webhookSecret,
    }),
  forwardEmail: (message, options) =>
    resend.emails.receiving.forward(message, options),
  eventStore,
  allowedRecipients: config.allowedRecipients,
  forwardTo: config.forwardTo,
  forwardFrom: config.forwardFrom,
});

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200);
    response.end('{"status":"ok"}\n');
    return;
  }

  if (
    request.method !== "POST" ||
    request.url !== "/api/v1/webhooks/resend"
  ) {
    response.writeHead(404);
    response.end('{"error":"not_found"}\n');
    return;
  }

  try {
    const body = await readBody(request);
    const result = await handleWebhook({
      body,
      headers: request.headers,
    });
    response.writeHead(result.status);
    response.end(`${JSON.stringify(result.body)}\n`);
  } catch (error) {
    const status = error?.code === "PAYLOAD_TOO_LARGE" ? 413 : 500;
    if (status === 500)
      console.error({
        event: "resend.webhook_unhandled",
        error: error instanceof Error ? error.message : "unknown",
      });
    response.writeHead(status);
    response.end(
      `${JSON.stringify({
        accepted: false,
        reason: status === 413 ? "payload_too_large" : "internal_error",
      })}\n`,
    );
  }
});

server.listen(config.port, config.host, () => {
  console.info({
    event: "resend.relay_started",
    host: config.host,
    port: config.port,
  });
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_WEBHOOK_BYTES) {
        const error = new Error("Webhook body is too large");
        error.code = "PAYLOAD_TOO_LARGE";
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function shutdown(signal) {
  console.info({ event: "resend.relay_stopping", signal });
  server.close((error) => {
    if (error) {
      console.error({ event: "resend.relay_stop_failed", error: error.message });
      process.exitCode = 1;
    }
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
