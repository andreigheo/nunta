import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import twilio from "twilio";

export type PhoneChannel = "SMS" | "WHATSAPP";
export type TwilioSettings = {
  TWILIO_ENABLED: boolean;
  TWILIO_ACCOUNT_SID: string;
  TWILIO_AUTH_TOKEN: string;
  TWILIO_SMS_FROM: string;
  TWILIO_WHATSAPP_FROM: string;
  TWILIO_STATUS_CALLBACK_URL: string;
  TWILIO_INBOUND_URL: string;
  TWILIO_CONTENT_TEMPLATES: string;
  TWILIO_TEST_RECIPIENTS: string;
};
export type PhoneMessagePayload = {
  to: string;
  body: string;
  template: string;
};
export function normalizedPhone(value: string): string | null {
  const phone = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
export function phoneHash(phone: string) {
  return createHash("sha256").update(phone).digest("hex");
}
export function messageTemplates(
  config: TwilioSettings,
): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(config.TWILIO_CONTENT_TEMPLATES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          ["event_update", "invitation", "reminder"].includes(key) &&
          typeof value === "string" &&
          /^HX[0-9a-f]{32}$/i.test(value),
      ),
    );
  } catch {
    return {};
  }
}
export function phoneChannelReady(
  config: TwilioSettings,
  channel: PhoneChannel,
) {
  return (
    config.TWILIO_ENABLED &&
    /^AC[0-9a-f]{32}$/i.test(config.TWILIO_ACCOUNT_SID) &&
    config.TWILIO_AUTH_TOKEN.length >= 16 &&
    /^https:\/\//.test(config.TWILIO_STATUS_CALLBACK_URL) &&
    /^https:\/\//.test(config.TWILIO_INBOUND_URL) &&
    Boolean(
      normalizedPhone(
        channel === "SMS"
          ? config.TWILIO_SMS_FROM
          : config.TWILIO_WHATSAPP_FROM,
      ),
    ) &&
    (channel !== "WHATSAPP" || Object.keys(messageTemplates(config)).length > 0)
  );
}
export function testRecipientAllowed(config: TwilioSettings, phone: string) {
  const allowed = config.TWILIO_TEST_RECIPIENTS.split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return !allowed.length || allowed.includes(phone);
}
export function sealPhoneMessage(
  payload: PhoneMessagePayload,
  secret: string,
  context: string,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), bytes]
    .map((v) => v.toString("base64url"))
    .join(".");
}
export function openPhoneMessage(
  value: string,
  secret: string,
  context: string,
): PhoneMessagePayload {
  const [iv, tag, data] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv!,
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(tag!);
  return JSON.parse(
    Buffer.concat([cipher.update(data!), cipher.final()]).toString("utf8"),
  ) as PhoneMessagePayload;
}
export function validTwilioForm(
  config: TwilioSettings,
  url: string,
  signature: string,
  form: Record<string, string>,
) {
  return Boolean(
    config.TWILIO_AUTH_TOKEN &&
    form.AccountSid === config.TWILIO_ACCOUNT_SID &&
    twilio.validateRequest(config.TWILIO_AUTH_TOKEN, signature, url, form),
  );
}
export function buildTwilioMessage(
  config: TwilioSettings,
  id: string,
  channel: PhoneChannel,
  payload: PhoneMessagePayload,
) {
  if (
    !phoneChannelReady(config, channel) ||
    !testRecipientAllowed(config, payload.to)
  )
    throw new Error("CHANNEL_UNAVAILABLE");
  const callback = new URL(config.TWILIO_STATUS_CALLBACK_URL);
  callback.searchParams.set("messageId", id);
  if (channel === "WHATSAPP") {
    const sid = messageTemplates(config)[payload.template];
    if (!sid) throw new Error("TEMPLATE_UNAVAILABLE");
    return {
      to: `whatsapp:${payload.to}`,
      from: `whatsapp:${config.TWILIO_WHATSAPP_FROM}`,
      contentSid: sid,
      contentVariables: JSON.stringify({ "1": payload.body }),
      statusCallback: callback.toString(),
    };
  }
  return {
    to: payload.to,
    from: config.TWILIO_SMS_FROM,
    body: payload.body,
    statusCallback: callback.toString(),
  };
}
export async function sendTwilioMessage(
  config: TwilioSettings,
  id: string,
  channel: PhoneChannel,
  payload: PhoneMessagePayload,
) {
  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, {
    autoRetry: false,
    timeout: 15000,
  });
  const result = await client.messages.create(
    buildTwilioMessage(config, id, channel, payload),
  );
  return { sid: result.sid, status: result.status };
}
export function callbackStatus(value: string): string | null {
  return (
    (
      {
        queued: "ACCEPTED",
        accepted: "ACCEPTED",
        sending: "ACCEPTED",
        sent: "SENT",
        delivered: "DELIVERED",
        read: "READ",
        failed: "FAILED",
        undelivered: "FAILED",
        canceled: "FAILED",
      } as Record<string, string>
    )[value] ?? null
  );
}
