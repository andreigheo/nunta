import { createHash } from "node:crypto";
import { normalizeAddress } from "./config.mjs";

export const MAX_WEBHOOK_BYTES = 1_048_576;

export function createWebhookHandler({
  verifyWebhook,
  forwardEmail,
  eventStore,
  allowedRecipients,
  forwardTo,
  forwardFrom,
  logger = console,
}) {
  return async function handle({ body, headers }) {
    const eventId = header(headers, "svix-id");
    const timestamp = header(headers, "svix-timestamp");
    const signature = header(headers, "svix-signature");
    if (!eventId || !timestamp || !signature)
      return response(400, { accepted: false, reason: "missing_signature" });

    let event;
    try {
      event = verifyWebhook({
        payload: body,
        headers: { id: eventId, timestamp, signature },
      });
    } catch {
      return response(400, { accepted: false, reason: "invalid_signature" });
    }

    if (event?.type !== "email.received")
      return response(200, { accepted: true, forwarded: false });

    const providerEmailId = String(event?.data?.email_id ?? "").trim();
    if (!providerEmailId)
      return response(400, { accepted: false, reason: "invalid_payload" });

    if (await eventStore.has(eventId))
      return response(200, {
        accepted: true,
        forwarded: true,
        duplicate: true,
      });

    const recipients = Array.isArray(event?.data?.to) ? event.data.to : [];
    const matchedAliases = [
      ...new Set(
        recipients
          .map((value) => normalizeAddress(value))
          .filter((value) => allowedRecipients.has(value)),
      ),
    ].sort();

    if (matchedAliases.length === 0) {
      await eventStore.mark(eventId, {
        status: "ignored",
        providerEmailId,
        processedAt: new Date().toISOString(),
      });
      return response(200, { accepted: true, forwarded: false });
    }

    const idempotencyKey = `sarbato-inbound/${createHash("sha256")
      .update(providerEmailId)
      .update("\0")
      .update(matchedAliases.join(","))
      .digest("hex")}`;

    const result = await forwardEmail(
      {
        emailId: providerEmailId,
        to: forwardTo,
        from: forwardFrom,
      },
      { idempotencyKey },
    );
    if (result?.error) {
      logger.error({
        event: "resend.inbound_forward_failed",
        eventIdHash: hash(eventId),
        providerEmailIdHash: hash(providerEmailId),
        code: result.error.name ?? result.error.code ?? "resend_error",
      });
      return response(502, { accepted: false, reason: "forward_failed" });
    }

    await eventStore.mark(eventId, {
      status: "forwarded",
      providerEmailId,
      matchedAliases,
      forwardedAt: new Date().toISOString(),
      forwardedEmailId: result?.data?.id ?? null,
    });
    logger.info({
      event: "resend.inbound_forwarded",
      eventIdHash: hash(eventId),
      providerEmailIdHash: hash(providerEmailId),
      aliases: matchedAliases,
    });
    return response(200, { accepted: true, forwarded: true });
  };
}

function header(headers, name) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value ?? "").trim();
}

function response(status, body) {
  return { status, body };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
