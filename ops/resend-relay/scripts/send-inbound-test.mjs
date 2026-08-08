import { readFile } from "node:fs/promises";
import { Resend } from "resend";

const environmentPath = process.argv[2] ?? "/etc/sarbato-resend-relay.env";
const environment = parseEnvironment(await readFile(environmentPath, "utf8"));
const apiKey = environment.RESEND_API_KEY;
if (!apiKey?.startsWith("re_"))
  throw new Error("RESEND_API_KEY is not configured");

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send(
  {
    from: "Sarbato Test <test@sarbato.space>",
    to: "billing@sarbato.space",
    subject: "Test tehnic Sarbato — Resend inbound",
    text: [
      "Acesta este un test tehnic pentru verificarea fluxului",
      "Resend inbound → webhook Sarbato → Gmail.",
    ].join("\n"),
  },
  {
    idempotencyKey: "sarbato-inbound-smoke/2026-07-31-v1",
  },
);

if (error)
  throw new Error(
    `Resend test send failed: ${error.name ?? error.message ?? "unknown"}`,
  );
console.log(JSON.stringify({ sent: true, emailId: data?.id ?? null }));

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
