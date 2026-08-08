import { createServer } from "node:http";

const portArgumentIndex = process.argv.indexOf("--port");
const port = Number(
  portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : 4117,
);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("Port invalid pentru fixture-ul landing fallback.");
}

const server = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.url === "/api/v1/status") {
    response.writeHead(200);
    response.end(JSON.stringify({ data: { maintenance: null } }));
    return;
  }

  if (request.url === "/api/v1/public/product-proof") {
    response.writeHead(503);
    response.end(
      JSON.stringify({
        error: {
          code: "PUBLIC_PROOF_UNAVAILABLE",
          message: "Dovada publică nu este disponibilă în acest fixture.",
        },
      }),
    );
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: { code: "NOT_FOUND" } }));
});

server.listen(port, "127.0.0.1");

function close() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", close);
process.on("SIGTERM", close);
