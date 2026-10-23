import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { createHash, randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";
import { assertDestructiveDatabasePurpose } from "./database-identity";

const database = new PrismaClient({
  datasourceUrl: process.env.DATABASE_OWNER_URL!,
});
const origin = process.env.WEB_URL!;

describe.sequential(
  "workspace checkout return integration without provider transactions",
  () => {
    let app: INestApplication;
    let agent: ReturnType<typeof request.agent>;
    let workspaceId: string;
    let otherWorkspaceId: string;
    let userId: string;
    const subscriptionId = `txn_${randomUUID().replaceAll("-", "").slice(0, 26)}`;
    const creditsId = `txn_${randomUUID().replaceAll("-", "").slice(0, 26)}`;
    beforeAll(async () => {
      await assertDestructiveDatabasePurpose(database, "integration");
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.use(cookieParser());
      app.useGlobalFilters(new ProblemFilter());
      await app.init();
      const email = `billing-return-${randomUUID()}@example.test`;
      const password = "WeddingOS2026!";
      const registration = await request(app.getHttpServer())
        .post("/api/v1/auth/registrations")
        .set("Origin", origin)
        .send({
          firstName: "Test",
          lastName: "Billing",
          email,
          password,
          acceptedTermsVersion: "2026-07-18",
          marketingConsent: false,
        })
        .expect(201);
      userId = registration.body.data.userId;
      await database.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
      agent = request.agent(app.getHttpServer());
      await agent
        .post("/api/v1/auth/sessions")
        .set("Origin", origin)
        .send({ email, password, remember: true })
        .expect(200);
      const create = async () =>
        (
          await agent
            .post("/api/v1/workspaces")
            .set("Origin", origin)
            .set("Idempotency-Key", randomUUID())
            .send({
              title: "Local billing return fixture",
              partnerOneName: "Test",
              partnerTwoName: "Audit",
              weddingDate: "2027-09-12",
              location: "București",
              timezone: "Europe/Bucharest",
            })
            .expect(201)
        ).body.data.id as string;
      workspaceId = await create();
      otherWorkspaceId = await create();
      for (const [kind, providerTransactionId] of [
        ["SUBSCRIPTION", subscriptionId],
        ["MESSAGE_CREDITS", creditsId],
      ] as const) {
        await database.workspaceBillingCheckout.create({
          data: {
            workspaceId,
            createdById: userId,
            kind,
            planKey: kind === "SUBSCRIPTION" ? "PLUS" : null,
            creditQuantity: kind === "MESSAGE_CREDITS" ? 100 : null,
            creditPackKey: kind === "MESSAGE_CREDITS" ? "MESSAGES_100" : null,
            provider: "integration-test",
            providerPriceId: "pri_local_fixture",
            providerTransactionId,
            idempotencyKey: randomUUID(),
            assignmentTokenHash: createHash("sha256")
              .update(randomUUID())
              .digest("hex"),
            status: "COMPLETED",
            completedAt: new Date(),
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      }
    }, 180000);

    afterAll(async () => {
      await app?.close();
      await database.$disconnect();
    });

    it("returns the backend kind and credit quantity for both checkout kinds", async () => {
      const subscription = await agent
        .get(
          `/api/v1/workspaces/${workspaceId}/billing/checkouts/${subscriptionId}/status`,
        )
        .expect(200);
      expect(subscription.body.data).toMatchObject({
        kind: "SUBSCRIPTION",
        status: "COMPLETED",
        plan: "PLUS",
        credits: 0,
      });
      const credits = await agent
        .get(
          `/api/v1/workspaces/${workspaceId}/billing/checkouts/${creditsId}/status`,
        )
        .expect(200);
      expect(credits.body.data).toMatchObject({
        kind: "MESSAGE_CREDITS",
        status: "COMPLETED",
        plan: null,
        credits: 100,
      });
    });

    it("does not reveal another workspace checkout even to its same owner", async () => {
      await agent
        .get(
          `/api/v1/workspaces/${otherWorkspaceId}/billing/checkouts/${subscriptionId}/status`,
        )
        .expect(404);
    });

    it("requires authentication and rejects malformed transaction identifiers", async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/workspaces/${workspaceId}/billing/checkouts/${subscriptionId}/status`,
        )
        .expect(401);
      await agent
        .get(
          `/api/v1/workspaces/${workspaceId}/billing/checkouts/txn_invalid/status`,
        )
        .expect(400);
    });

    it("keeps pending and failed checkouts distinct from a completed payment", async () => {
      for (const status of [
        "CREATED",
        "RECOVERY_PENDING",
        "FAILED",
        "EXPIRED",
      ] as const) {
        await database.workspaceBillingCheckout.update({
          where: { providerTransactionId: subscriptionId },
          data: { status, completedAt: null },
        });
        const response = await agent
          .get(
            `/api/v1/workspaces/${workspaceId}/billing/checkouts/${subscriptionId}/status`,
          )
          .expect(200);
        expect(response.body.data).toMatchObject({ status, completedAt: null });
      }
      const subscription =
        await database.workspaceSubscription.findUniqueOrThrow({
          where: { workspaceId },
        });
      expect(subscription.planKey).toBe("FREE");
    });

    it("does not create a credit checkout while messaging is disabled", async () => {
      const before = await database.workspaceBillingCheckout.count({
        where: { workspaceId },
      });
      await agent
        .post(
          `/api/v1/workspaces/${workspaceId}/billing/message-credits/checkout`,
        )
        .set("Origin", origin)
        .set("Idempotency-Key", randomUUID())
        .send({ pack: "MESSAGES_100" })
        .expect(503);
      expect(
        await database.workspaceBillingCheckout.count({
          where: { workspaceId },
        }),
      ).toBe(before);
    });
  },
);
