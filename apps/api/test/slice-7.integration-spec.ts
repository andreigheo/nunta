import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { assertDestructiveDatabasePurpose } from "./database-identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";

const origin = process.env.WEB_URL!;
const database = new PrismaClient({
  datasourceUrl: process.env.DATABASE_OWNER_URL!,
});

type Account = {
  email: string;
  userId: string;
  agent: ReturnType<typeof request.agent>;
};

describe.sequential("Slice 7 trust and monetization integration", () => {
  let application!: INestApplication;
  let vendor!: Account;
  let outsider!: Account;
  let organizationId = "";

  beforeAll(async () => {
    if (process.env.WEDDINGOS_INTEGRATION_DATABASE_PREPARED !== "true") {
      await cleanDatabase();
    }
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = testingModule.createNestApplication({ rawBody: true });
    application.use(cookieParser());
    application.useGlobalFilters(new ProblemFilter());
    await application.init();
    vendor = await createAccount("slice7-vendor");
    outsider = await createAccount("slice7-outsider");
    const organization = await vendor.agent
      .post("/api/v1/vendor-organizations")
      .set("Origin", origin)
      .set("Idempotency-Key", `slice7-org-${randomUUID()}`)
      .send({
        legalName: "Slice Seven Trust SRL",
        displayName: "Slice Seven Trust",
        country: "RO",
        registrationNumber: `S7-${randomUUID()}`,
        taxId: `S7-TAX-${randomUUID()}`,
        billingEmail: vendor.email,
        contactEmail: vendor.email,
        contactPhone: "+40700000000",
        websiteUrl: "https://slice7.example.test",
      })
      .expect(201);
    organizationId = organization.body.data.id;
  }, 180_000);

  afterAll(async () => {
    await application?.close();
    await database.$disconnect();
  });

  it("enforces the FREE service limit before any explicit subscription setup and never grants a second trial", async () => {
    const current = await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/subscription`)
      .expect(200);
    const free = await database.subscriptionPlan.findUniqueOrThrow({
      where: { key: "FREE" },
    });
    expect(current.body.data.planId).toBe(free.id);

    await outsider.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/subscription`)
      .expect(403);

    for (let index = 0; index < 2; index += 1) {
      await vendor.agent
        .post(`/api/v1/vendor-organizations/${organizationId}/services`)
        .set("Origin", origin)
        .set("Idempotency-Key", `slice7-free-service-${index}`)
        .send(serviceInput(`Serviciu gratuit ${index + 1}`))
        .expect(201);
    }
    const limited = await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/services`)
      .set("Origin", origin)
      .set("Idempotency-Key", "slice7-free-service-over-limit")
      .send(serviceInput("Serviciu peste limită"))
      .expect(402);
    expect(limited.body.code).toBe("USAGE_LIMIT_REACHED");
    const usage = await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/usage`)
      .expect(200);
    expect(usage.body.data.resources.activeServices).toBe(2);

    const firstKey = `slice7-checkout-${randomUUID()}`;
    const first = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/subscription-checkouts`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", firstKey)
      .send({ planKey: "STARTER" })
      .expect(201);
    const replay = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/subscription-checkouts`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", firstKey)
      .send({ planKey: "STARTER" })
      .expect(201);
    expect(first.body.data.checkout.id).toBe(replay.body.data.checkout.id);
    expect(first.body.data.subscription.status).toBe("TRIALING");

    const second = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/subscription-checkouts`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `slice7-checkout-second-${randomUUID()}`)
      .send({ planKey: "STARTER" })
      .expect(201);
    expect(second.body.data.subscription.status).toBe("ACTIVE");
    expect(
      await database.vendorSubscriptionHistory.count({
        where: {
          vendorOrganizationId: organizationId,
          eventType: "TRIAL_STARTED",
        },
      }),
    ).toBe(1);
  }, 180_000);

  it("processes signed subscription invoices monotonically and expires a past-due grace period", async () => {
    const subscription = await database.vendorSubscription.findUniqueOrThrow({
      where: { vendorOrganizationId: organizationId },
    });
    const periodStart = new Date(Date.now() - 86_400_000).toISOString();
    const periodEnd = new Date(Date.now() + 29 * 86_400_000).toISOString();
    const failedAt = new Date(Date.now() - 10_000).toISOString();
    await sendSignedWebhook(
      "subscriptions",
      "weddingos-subscription-local-secret",
      {
        id: `sub-failed-${randomUUID()}`,
        type: "invoice.failed",
        occurredAt: failedAt,
        data: {
          customerId: subscription.providerCustomerId,
          subscriptionId: subscription.providerSubscriptionId,
          invoiceId: `invoice-failed-${randomUUID()}`,
          amountDueMinor: 9900,
          amountPaidMinor: 0,
          currency: "RON",
          periodStart,
          periodEnd,
        },
      },
    ).expect(201);
    expect(
      (
        await database.vendorSubscription.findUniqueOrThrow({
          where: { id: subscription.id },
        })
      ).status,
    ).toBe("PAST_DUE");
    expect(
      await database.subscriptionInvoiceRecord.count({
        where: { subscriptionId: subscription.id, status: "FAILED" },
      }),
    ).toBe(1);

    const paidAt = new Date().toISOString();
    await sendSignedWebhook(
      "subscriptions",
      "weddingos-subscription-local-secret",
      {
        id: `sub-paid-${randomUUID()}`,
        type: "invoice.paid",
        occurredAt: paidAt,
        data: {
          customerId: subscription.providerCustomerId,
          subscriptionId: subscription.providerSubscriptionId,
          invoiceId: `invoice-paid-${randomUUID()}`,
          amountDueMinor: 9900,
          amountPaidMinor: 9900,
          currency: "RON",
          periodStart,
          periodEnd,
        },
      },
    ).expect(201);
    await sendSignedWebhook(
      "subscriptions",
      "weddingos-subscription-local-secret",
      {
        id: `sub-stale-${randomUUID()}`,
        type: "invoice.failed",
        occurredAt: new Date(Date.parse(failedAt) - 1000).toISOString(),
        data: {
          customerId: subscription.providerCustomerId,
          subscriptionId: subscription.providerSubscriptionId,
          invoiceId: `invoice-stale-${randomUUID()}`,
          amountDueMinor: 9900,
          amountPaidMinor: 0,
          currency: "RON",
        },
      },
    ).expect(201);
    expect(
      (
        await database.vendorSubscription.findUniqueOrThrow({
          where: { id: subscription.id },
        })
      ).status,
    ).toBe("ACTIVE");

    await database.vendorSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "PAST_DUE",
        gracePeriodEndAt: new Date(Date.now() - 1000),
      },
    });
    const expired = await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/subscription`)
      .expect(200);
    expect(expired.body.data.status).toBe("EXPIRED");
    const access = await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/entitlements`)
      .expect(200);
    expect(access.body.data.planId).toBe(
      (
        await database.subscriptionPlan.findUniqueOrThrow({
          where: { key: "FREE" },
        })
      ).id,
    );
  }, 180_000);

  it("isolates connected payout accounts and rejects a forged provider context", async () => {
    const created = await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/payout-account`)
      .set("Origin", origin)
      .set("Idempotency-Key", `slice7-account-${randomUUID()}`)
      .send({ country: "RO", currency: "RON" })
      .expect(201);
    await outsider.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/payout-account`)
      .expect(403);
    const onboarding = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/payout-onboarding-links`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `slice7-onboarding-${randomUUID()}`)
      .send({})
      .expect(201);
    expect(onboarding.body.data.account).toMatchObject({
      status: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
    });

    await sendSignedWebhook("payouts", "weddingos-payout-local-secret", {
      id: `account-updated-${randomUUID()}`,
      type: "account.updated",
      occurredAt: new Date().toISOString(),
      data: { accountId: created.body.data.providerAccountId },
    }).expect(201);
    const eventCount = await database.payoutProviderEvent.count({
      where: { providerAccountId: created.body.data.providerAccountId },
    });
    expect(eventCount).toBe(1);

    await sendSignedWebhook("payouts", "weddingos-payout-local-secret", {
      id: `account-forged-${randomUUID()}`,
      type: "account.updated",
      occurredAt: new Date().toISOString(),
      data: { accountId: `fake-account-${randomUUID()}` },
    }).expect(404);
    expect(
      await database.vendorPayoutAccount.count({
        where: { vendorOrganizationId: organizationId },
      }),
    ).toBe(1);
  }, 180_000);

  function sendSignedWebhook(
    family: "subscriptions" | "payouts",
    secret: string,
    payload: Record<string, unknown>,
  ) {
    const raw = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(raw)
      .digest("hex");
    return request(application.getHttpServer())
      .post(`/api/v1/webhooks/${family}/fake`)
      .set("Content-Type", "application/json")
      .set("x-weddingos-timestamp", timestamp)
      .set("x-weddingos-signature", `sha256=${signature}`)
      .send(raw);
  }

  async function createAccount(label: string): Promise<Account> {
    const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registration = await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Test",
        lastName: label,
        email,
        password: "WeddingOS2026!",
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      })
      .expect(201);
    const token = await waitForVerificationToken(email);
    await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token })
      .expect(200);
    const agent = request.agent(application.getHttpServer());
    await agent
      .post("/api/v1/auth/sessions")
      .set("Origin", origin)
      .send({ email, password: "WeddingOS2026!", remember: true })
      .expect(200);
    return { email, userId: registration.body.data.userId, agent };
  }
});

function serviceInput(name: string) {
  return {
    category: "PHOTOGRAPHY",
    name,
    description:
      "Serviciu persistent pentru verificarea limitei de entitlement.",
    pricingModel: "FIXED",
    startingPriceMinor: 100_000,
    currency: "RON",
    active: true,
  };
}

async function waitForVerificationToken(email: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    for (const summary of list.messages.filter(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    )) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Verification email not delivered to ${email}`);
}

async function cleanDatabase() {
  await assertDestructiveDatabasePurpose(database, "integration");
  const tables = await database.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'database_identities', 'role_templates', 'vendor_role_templates', 'subscription_products', 'subscription_plans', 'subscription_prices', 'subscription_plan_entitlements', 'platform_fee_policies', 'platform_roles', 'legal_documents', 'legal_document_versions', 'consent_purposes', 'data_retention_policies', 'data_retention_rules')
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await database.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}
