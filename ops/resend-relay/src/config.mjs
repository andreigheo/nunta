const DEFAULT_ALLOWED_RECIPIENTS = [
  "billing@sarbato.space",
  "legal@sarbato.space",
  "support@sarbato.space",
];

export function loadConfig(environment = process.env) {
  return {
    host: required(environment, "BIND_HOST", "127.0.0.1"),
    port: integer(environment, "PORT", 43_211),
    apiKey: required(environment, "RESEND_API_KEY"),
    webhookSecret: required(environment, "RESEND_WEBHOOK_SECRET"),
    forwardTo: email(environment, "FORWARD_TO_EMAIL"),
    forwardFrom: email(
      environment,
      "FORWARD_FROM_EMAIL",
      "Sarbato Mail <forward@sarbato.space>",
    ),
    allowedRecipients: new Set(
      (environment.ALLOWED_RECIPIENTS ?? DEFAULT_ALLOWED_RECIPIENTS.join(","))
        .split(",")
        .map((value) => normalizeAddress(value))
        .filter(Boolean),
    ),
    eventStoreDirectory: required(
      environment,
      "EVENT_STORE_DIRECTORY",
      "/var/lib/sarbato-resend-relay/events",
    ),
  };
}

export function normalizeAddress(value) {
  const match = String(value ?? "")
    .trim()
    .toLowerCase()
    .match(/(?:<)?([a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,})(?:>)?/i);
  return match?.[1] ?? "";
}

function required(environment, name, fallback) {
  const value = environment[name] ?? fallback;
  if (!value || !String(value).trim())
    throw new Error(`${name} is required`);
  return String(value).trim();
}

function integer(environment, name, fallback) {
  const value = Number(environment[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65_535)
    throw new Error(`${name} must be a valid TCP port`);
  return value;
}

function email(environment, name, fallback) {
  const value = required(environment, name, fallback);
  if (!normalizeAddress(value)) throw new Error(`${name} must be an email address`);
  return value;
}
