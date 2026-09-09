import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import {
  buildTwilioMessage,
  normalizedPhone,
  openPhoneMessage,
  phoneChannelReady,
  phoneHash,
  sealPhoneMessage,
  validTwilioForm,
} from "@weddingos/jobs";
import { deliverGuestMessage } from "../src/guest-messaging";

const env = {
  TWILIO_ENABLED: true,
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "token-that-only-exists-in-tests-123",
  TWILIO_SMS_FROM: "+12025550101",
  TWILIO_WHATSAPP_FROM: "+12025550102",
  TWILIO_STATUS_CALLBACK_URL:
    "https://sarbato.space/api/v1/webhooks/twilio/status",
  TWILIO_INBOUND_URL: "https://sarbato.space/api/v1/webhooks/twilio/inbound",
  TWILIO_CONTENT_TEMPLATES: JSON.stringify({
    event_update: `HX${"b".repeat(32)}`,
  }),
  TWILIO_TEST_RECIPIENTS: "+40700000001",
  OUTBOX_ENCRYPTION_KEY: "test-encryption-key-01234567890123456789",
} as ApiEnvironment;
const payload = {
  to: "+40700000001",
  body: "Programul începe la 18:00.",
  template: "event_update",
};
function fixture(status = "QUEUED", allowed = true) {
  const row = {
    id: "message-1",
    workspaceId: "workspace-1",
    guestId: "guest-1",
    createdById: "user-1",
    channel: "SMS",
    status,
    destinationHash: phoneHash(payload.to),
    encryptedPayload: sealPhoneMessage(
      payload,
      env.OUTBOX_ENCRYPTION_KEY,
      "workspace-1:message-1",
    ),
    createdAt: new Date(),
    errorCode: null as string | null,
  };
  const tx = {
    guestMessage: {
      findFirst: vi.fn(async () => row),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { status?: string | { in: string[] } };
          data: Partial<typeof row>;
        }) => {
          const match =
            !where.status ||
            (typeof where.status === "string"
              ? row.status === where.status
              : where.status.in.includes(row.status));
          if (match) Object.assign(row, data);
          return { count: match ? 1 : 0 };
        },
      ),
    },
    guest: { findFirst: vi.fn(async () => ({ phoneE164: payload.to })) },
    workspaceMembership: {
      findFirst: vi.fn(async () => ({
        roleTemplate: { capabilities: ["campaign.send"] },
        overrides: [],
      })),
    },
    user: { findUnique: vi.fn(async () => ({ status: "ACTIVE" })) },
    workspace: { findUnique: vi.fn(async () => ({ status: "ACTIVE" })) },
    guestMessageConsent: {
      findUnique: vi.fn(async () => ({
        allowed,
        destinationHash: row.destinationHash,
      })),
    },
    guestMessageSuppression: { findUnique: vi.fn(async () => null) },
    $executeRaw: vi.fn(async () => 0),
  };
  const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    fn(tx as unknown as Prisma.TransactionClient);
  return { row, tx, run };
}
describe("Twilio guest delivery safety", () => {
  it("normalizes only valid international phone numbers", () => {
    expect(normalizedPhone("+40 700 000 001")).toBe(payload.to);
    expect(normalizedPhone("0700000001")).toBeNull();
    expect(normalizedPhone("https://example.test")).toBeNull();
  });
  it("binds encrypted content to the message and workspace", () => {
    const sealed = sealPhoneMessage(
      payload,
      env.OUTBOX_ENCRYPTION_KEY,
      "workspace-1:message-1",
    );
    expect(
      openPhoneMessage(
        sealed,
        env.OUTBOX_ENCRYPTION_KEY,
        "workspace-1:message-1",
      ),
    ).toEqual(payload);
    expect(() =>
      openPhoneMessage(
        sealed,
        env.OUTBOX_ENCRYPTION_KEY,
        "workspace-2:message-1",
      ),
    ).toThrow();
    expect(() =>
      openPhoneMessage(sealed, "other-key", "workspace-1:message-1"),
    ).toThrow();
  });
  it("uses approved content IDs for WhatsApp, never arbitrary free text", () => {
    const request = buildTwilioMessage(env, "id", "WHATSAPP", payload);
    expect(request).toMatchObject({
      contentSid: `HX${"b".repeat(32)}`,
      to: `whatsapp:${payload.to}`,
    });
    expect(request).not.toHaveProperty("body");
    expect(() =>
      buildTwilioMessage(env, "id", "WHATSAPP", {
        ...payload,
        template: "missing",
      }),
    ).toThrow();
    expect(() =>
      buildTwilioMessage(env, "id", "SMS", { ...payload, to: "+40700000002" }),
    ).toThrow();
  });
  it("does not expose a channel until signed status and opt-out callbacks are configured", () => {
    expect(phoneChannelReady({ ...env, TWILIO_INBOUND_URL: "" }, "SMS")).toBe(
      false,
    );
    expect(
      phoneChannelReady(
        { ...env, TWILIO_STATUS_CALLBACK_URL: "http://local.test/status" },
        "SMS",
      ),
    ).toBe(false);
  });
  it("validates the signed URL, every field, and the account", () => {
    const form = {
      AccountSid: env.TWILIO_ACCOUNT_SID,
      MessageStatus: "delivered",
      To: payload.to,
    };
    const url = env.TWILIO_STATUS_CALLBACK_URL + "?messageId=one";
    const signature = createHmac("sha1", env.TWILIO_AUTH_TOKEN)
      .update(
        url +
          Object.keys(form)
            .sort()
            .map((k) => k + form[k as keyof typeof form])
            .join(""),
      )
      .digest("base64");
    expect(validTwilioForm(env, url, signature, form)).toBe(true);
    expect(validTwilioForm(env, url + "x", signature, form)).toBe(false);
    expect(
      validTwilioForm(env, url, signature, {
        ...form,
        MessageStatus: "failed",
      }),
    ).toBe(false);
  });
  it("submits once and distinguishes accepted from delivered", async () => {
    const f = fixture();
    const send = vi.fn(async () => ({
      sid: `SM${"c".repeat(32)}`,
      status: "queued",
    }));
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(f.row.status).toBe("ACCEPTED");
  });
  it("never resubmits an ambiguous timeout", async () => {
    const f = fixture();
    const send = vi.fn(async () => {
      throw new Error("timeout");
    });
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(f.row.status).toBe("UNKNOWN");
  });
  it("recovers a crash after submission without duplicating the message", async () => {
    const f = fixture("SENDING");
    const send = vi.fn();
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(send).not.toHaveBeenCalled();
    expect(f.row.status).toBe("UNKNOWN");
  });
  it("cancels when consent was withdrawn while queued", async () => {
    const f = fixture("QUEUED", false);
    const send = vi.fn();
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(send).not.toHaveBeenCalled();
    expect(f.row.status).toBe("CANCELLED");
  });
  it("cancels when the actor is suspended or membership removed", async () => {
    const f = fixture();
    f.tx.user.findUnique.mockResolvedValue({ status: "SUSPENDED" });
    const send = vi.fn();
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(send).not.toHaveBeenCalled();
    expect(f.row.status).toBe("CANCELLED");
  });
  it("keeps explicit provider rejection separate from unknown delivery", async () => {
    const f = fixture();
    const send = vi.fn(async () => {
      throw { status: 400, code: 21608 };
    });
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(f.row.status).toBe("FAILED");
    expect(f.row.errorCode).toBe("TWILIO_21608");
  });
  it("does not overwrite a delivery callback that arrives before the API response", async () => {
    const f = fixture();
    const send = vi.fn(async () => {
      f.row.status = "DELIVERED";
      return { sid: `SM${"c".repeat(32)}`, status: "queued" };
    });
    await deliverGuestMessage(f.run, env, "workspace-1", "message-1", send);
    expect(f.row.status).toBe("DELIVERED");
  });
});
