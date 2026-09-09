import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { parseApiEnvironment, type ApiEnvironment } from "@weddingos/config";
import { openPhoneMessage, phoneHash } from "@weddingos/jobs";
import { AppModule } from "../src/app.module";
import { API_ENVIRONMENT } from "../src/common/environment.module";
import { DatabaseService } from "../src/common/database.service";
import { SessionService } from "../src/auth/session.service";
import { ProblemFilter } from "../src/common/problem.filter";

describe.sequential(
  "Guest messaging: real PostgreSQL RLS and signed delivery callbacks",
  () => {
    const owner = new PrismaClient({
      datasourceUrl: process.env.DATABASE_OWNER_URL,
    });
    let app: INestApplication;
    let db: DatabaseService;
    let env: ApiEnvironment;
    const fixtures: Array<{
      userId: string;
      workspaceId: string;
      guestId: string;
      householdId: string;
      groupId: string;
      cookie: string;
    }> = [];
    const to = "+40700000001";
    let messageId: string;
    const path = (index = 0) =>
      `/api/v1/workspaces/${fixtures[index]!.workspaceId}/guest-messaging`;
    const headers = (index = 0) => ({ Cookie: fixtures[index]!.cookie });
    const input = () => ({
      guestIds: [fixtures[0]!.guestId],
      channel: "SMS",
      body: "Notificare de test",
      template: "event_update",
    });
    const signature = (url: string, form: Record<string, string>) =>
      createHmac("sha1", env.TWILIO_AUTH_TOKEN)
        .update(
          url +
            Object.keys(form)
              .sort()
              .map((k) => k + form[k])
              .join(""),
        )
        .digest("base64");
    beforeAll(async () => {
      const identity = await owner.$queryRaw<
        { database_purpose: string }[]
      >`SELECT database_purpose FROM database_identities WHERE id='singleton'`;
      expect(identity[0]?.database_purpose).toBe("integration");
      env = parseApiEnvironment({
        ...process.env,
        TWILIO_ENABLED: "true",
        TWILIO_ACCOUNT_SID: `AC${"1".repeat(32)}`,
        TWILIO_AUTH_TOKEN: "test-token-01234567890123456789012",
        TWILIO_SMS_FROM: "+12025550123",
        TWILIO_WHATSAPP_FROM: "+12025550124",
        TWILIO_STATUS_CALLBACK_URL:
          "https://sarbato.space/api/v1/webhooks/twilio/status",
        TWILIO_INBOUND_URL:
          "https://sarbato.space/api/v1/webhooks/twilio/inbound",
        TWILIO_CONTENT_TEMPLATES: JSON.stringify({
          event_update: `HX${"2".repeat(32)}`,
        }),
        TWILIO_TEST_RECIPIENTS: to,
        TWILIO_WORKSPACE_DAILY_LIMIT: "5",
      });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(API_ENVIRONMENT)
        .useValue(env)
        .compile();
      app = module.createNestApplication();
      app.use(cookieParser());
      app.useGlobalFilters(new ProblemFilter());
      await app.init();
      db = app.get(DatabaseService);
      const role = await owner.roleTemplate.findUniqueOrThrow({
        where: { key: "couple_owner" },
      });
      for (let i = 0; i < 2; i++) {
        const user = await owner.user.create({
          data: {
            email: `sms-${randomUUID()}@example.test`,
            emailVerifiedAt: new Date(),
          },
        });
        const workspace = await owner.workspace.create({
          data: {
            title: `Messaging test ${i}`,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await owner.workspaceMembership.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            roleTemplateId: role.id,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await owner.workspaceSubscription.create({
          data: {
            workspaceId: workspace.id,
            planKey: "PRO",
            status: "ACTIVE",
            createdById: user.id,
            updatedById: user.id,
          },
        });
        const household = await owner.household.create({
          data: { workspaceId: workspace.id, name: "Test household" },
        });
        const guest = await owner.guest.create({
          data: {
            workspaceId: workspace.id,
            householdId: household.id,
            firstName: "Invitat",
            lastName: `Test ${i}`,
            phoneE164: to,
          },
        });
        const group = await owner.guestTag.create({
          data: {
            workspaceId: workspace.id,
            name: i === 0 ? "Familie apropiată" : "Prieteni",
            color: i === 0 ? "#4a174b" : "#2f7f62",
          },
        });
        await owner.guestTagAssignment.create({
          data: {
            workspaceId: workspace.id,
            guestId: guest.id,
            tagId: group.id,
          },
        });
        const session = await app.get(SessionService).create(user.id, false);
        fixtures.push({
          userId: user.id,
          workspaceId: workspace.id,
          guestId: guest.id,
          householdId: household.id,
          groupId: group.id,
          cookie: `weddingos_session=${session.rawToken}`,
        });
      }
    }, 60000);
    afterAll(async () => {
      await app?.close();
      await owner.$disconnect();
    });
    it("requires login and rejects the other organizer's workspace", async () => {
      await request(app.getHttpServer()).get(path()).expect(401);
      await request(app.getHttpServer())
        .get(path())
        .set(headers(1))
        .expect(403);
      await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers(1))
        .set("Idempotency-Key", randomUUID())
        .send(input())
        .expect(403);
    });
    it("rejects missing consent and mismatched guest ids without enqueuing", async () => {
      await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", randomUUID())
        .send(input())
        .expect(409);
      await request(app.getHttpServer())
        .put(`${path()}/consents/${fixtures[1]!.guestId}`)
        .set(headers())
        .send({
          channel: "SMS",
          allowed: true,
          evidence: "Confirmed in the test form.",
        })
        .expect(404);
      await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", randomUUID())
        .send({ ...input(), guestIds: [fixtures[1]!.guestId] })
        .expect(404);
      expect(
        await owner.workspaceMessageCreditAccount.findUnique({
          where: { workspaceId: fixtures[0]!.workspaceId },
        }),
      ).toBeNull();
    });
    it("queues once, encrypts content, records the outbox and handles idempotent replay", async () => {
      await request(app.getHttpServer())
        .put(`${path()}/consents/${fixtures[0]!.guestId}`)
        .set(headers())
        .send({
          channel: "SMS",
          allowed: true,
          evidence: "Confirmed in the test form.",
        })
        .expect(200);
      const key = randomUUID();
      const a = await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", key)
        .send(input())
        .expect(201);
      messageId = a.body.data.ids[0];
      const b = await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", key)
        .send(input())
        .expect(201);
      expect(b.body.data).toMatchObject({ ids: [messageId], replayed: true });
      expect(
        await owner.workspaceMessageCreditAccount.findUniqueOrThrow({
          where: { workspaceId: fixtures[0]!.workspaceId },
          select: { includedBalance: true, purchasedBalance: true },
        }),
      ).toEqual({ includedBalance: 99, purchasedBalance: 0 });
      await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", key)
        .send({ ...input(), body: "Different" })
        .expect(409);
      const row = await owner.guestMessage.findUniqueOrThrow({
        where: { id: messageId },
      });
      expect(row.encryptedPayload).not.toContain(to);
      expect(row.encryptedPayload).not.toContain("Notificare");
      expect(
        openPhoneMessage(
          row.encryptedPayload,
          env.OUTBOX_ENCRYPTION_KEY,
          `${row.workspaceId}:${row.id}`,
        ).to,
      ).toBe(to);
      const outbox = await owner.outboxMessage.findFirstOrThrow({
        where: { aggregateId: messageId },
        select: { id: true },
      });
      expect(
        await owner.outboxConsumerExecution.count({
          where: {
            outboxMessageId: outbox.id,
            consumerName: "guest_message_delivery",
          },
        }),
      ).toBe(1);
    });
    it("RLS hides both messages and consent even with a forged workspace context", async () => {
      const rows = await db.withContext(
        { userId: fixtures[1]!.userId, workspaceId: fixtures[0]!.workspaceId },
        async (tx) => ({
          messages: await tx.guestMessage.findMany({}),
          consents: await tx.guestMessageConsent.findMany({}),
        }),
      );
      expect(rows).toEqual({ messages: [], consents: [] });
    });
    it("rejects a guest reference from another workspace at the database boundary", async () => {
      await expect(
        owner.guestMessageConsent.create({
          data: {
            workspaceId: fixtures[0]!.workspaceId,
            guestId: fixtures[1]!.guestId,
            channel: "WHATSAPP",
            destinationHash: phoneHash(to),
            allowed: true,
            evidence: "Cross-workspace invariant test.",
            recordedById: fixtures[0]!.userId,
          },
        }),
      ).rejects.toMatchObject({ code: "P2003" });
    });
    it("history never exposes encrypted content, hashes or provider credentials", async () => {
      const result = await request(app.getHttpServer())
        .get(path())
        .set(headers())
        .expect(200);
      expect(result.body.data.messages).toHaveLength(1);
      expect(JSON.stringify(result.body)).not.toContain("encryptedPayload");
      expect(JSON.stringify(result.body)).not.toContain(env.TWILIO_AUTH_TOKEN);
      const other = await request(app.getHttpServer())
        .get(path(1))
        .set(headers(1))
        .expect(200);
      expect(other.body.data.messages).toEqual([]);
    });
    it("returns organizer groups, households, contacts and an accurate daily allowance", async () => {
      const result = await request(app.getHttpServer())
        .get(path())
        .set(headers())
        .expect(200);
      expect(result.body.data).toMatchObject({
        dailyLimit: 5,
        usedToday: 1,
        remainingToday: 4,
        groups: [
          {
            id: fixtures[0]!.groupId,
            name: "Familie apropiată",
            color: "#4a174b",
            guestIds: [fixtures[0]!.guestId],
          },
        ],
        households: [
          {
            id: fixtures[0]!.householdId,
            name: "Test household",
            guestIds: [fixtures[0]!.guestId],
          },
        ],
      });
      expect(result.body.data.guests[0]).toMatchObject({
        id: fixtures[0]!.guestId,
        email: null,
        phone: to,
        householdId: fixtures[0]!.householdId,
        householdName: "Test household",
        groups: [
          {
            id: fixtures[0]!.groupId,
            name: "Familie apropiată",
            color: "#4a174b",
          },
        ],
        sms: true,
        whatsapp: false,
      });
    });
    it("rejects forged signatures and destination changes", async () => {
      const url = `${env.TWILIO_STATUS_CALLBACK_URL}?messageId=${messageId}`;
      const form = {
        AccountSid: env.TWILIO_ACCOUNT_SID,
        MessageSid: `SM${messageId.replaceAll("-", "")}`,
        From: env.TWILIO_SMS_FROM,
        To: to,
        MessageStatus: "delivered",
      };
      await request(app.getHttpServer())
        .post(`/api/v1/webhooks/twilio/status?messageId=${messageId}`)
        .type("form")
        .set("X-Twilio-Signature", "bad")
        .send(form)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/api/v1/webhooks/twilio/status?messageId=${messageId}`)
        .type("form")
        .set("X-Twilio-Signature", signature(url, form))
        .send({ ...form, To: "+40700000002" })
        .expect(403);
    });
    it("accepts signed callbacks, tolerates duplicates, prevents regression", async () => {
      await owner.guestMessage.update({
        where: { id: messageId },
        data: { status: "SENDING" },
      });
      const url = `${env.TWILIO_STATUS_CALLBACK_URL}?messageId=${messageId}`;
      const form = {
        AccountSid: env.TWILIO_ACCOUNT_SID,
        MessageSid: `SM${messageId.replaceAll("-", "")}`,
        From: env.TWILIO_SMS_FROM,
        To: to,
        MessageStatus: "delivered",
      };
      for (const state of ["delivered", "delivered", "sent", "failed"]) {
        const body = { ...form, MessageStatus: state };
        await request(app.getHttpServer())
          .post(`/api/v1/webhooks/twilio/status?messageId=${messageId}`)
          .type("form")
          .set("X-Twilio-Signature", signature(url, body))
          .send(body)
          .expect(204);
      }
      expect(
        (
          await owner.guestMessage.findUniqueOrThrow({
            where: { id: messageId },
          })
        ).status,
      ).toBe("DELIVERED");
    });
    it("STOP blocks future sends and cannot be cleared by a forged webhook", async () => {
      const form = {
        AccountSid: env.TWILIO_ACCOUNT_SID,
        From: to,
        To: env.TWILIO_SMS_FROM,
        Body: "STOP",
      };
      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/inbound")
        .type("form")
        .set("X-Twilio-Signature", signature(env.TWILIO_INBOUND_URL, form))
        .send(form)
        .expect(201);
      await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", randomUUID())
        .send(input())
        .expect(409);
      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/inbound")
        .type("form")
        .set("X-Twilio-Signature", signature(env.TWILIO_INBOUND_URL, form))
        .send({ ...form, Body: "START" })
        .expect(403);
      const start = { ...form, Body: "START" };
      await request(app.getHttpServer())
        .post("/api/v1/webhooks/twilio/inbound")
        .type("form")
        .set("X-Twilio-Signature", signature(env.TWILIO_INBOUND_URL, start))
        .send(start)
        .expect(201);
    });
    it("phone changes invalidate old consent", async () => {
      await owner.guest.update({
        where: { id: fixtures[0]!.guestId },
        data: { phoneE164: "+40700000002" },
      });
      const result = await request(app.getHttpServer())
        .get(path())
        .set(headers())
        .expect(200);
      expect(result.body.data.guests[0].sms).toBe(false);
      await owner.guest.update({
        where: { id: fixtures[0]!.guestId },
        data: { phoneE164: to },
      });
    });
    it("serializes simultaneous requests and enforces the daily cap", async () => {
      const key = randomUUID();
      const results = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post(`${path()}/messages`)
            .set(headers())
            .set("Idempotency-Key", key)
            .send(input()),
        ),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(results[0]!.body.data.ids).toEqual(results[1]!.body.data.ids);
      for (let i = 0; i < 3; i++)
        await request(app.getHttpServer())
          .post(`${path()}/messages`)
          .set(headers())
          .set("Idempotency-Key", randomUUID())
          .send(input())
          .expect(201);
      await request(app.getHttpServer())
        .post(`${path()}/messages`)
        .set(headers())
        .set("Idempotency-Key", randomUUID())
        .send(input())
        .expect(429);
    });
    it("requires a separate consent for WhatsApp and a configured template", async () => {
      await request(app.getHttpServer())
        .post(`${path(1)}/messages`)
        .set(headers(1))
        .set("Idempotency-Key", randomUUID())
        .send({
          ...input(),
          guestIds: [fixtures[1]!.guestId],
          channel: "WHATSAPP",
        })
        .expect(409);
      await request(app.getHttpServer())
        .post(`${path(1)}/messages`)
        .set(headers(1))
        .set("Idempotency-Key", randomUUID())
        .send({
          ...input(),
          guestIds: [fixtures[1]!.guestId],
          channel: "WHATSAPP",
          template: "reminder",
        })
        .expect(400);
    });
  },
);
