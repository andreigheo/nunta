import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseApiEnvironment } from "@weddingos/config";
import {
  createWorkspaceSubscriptionCheckoutSchema,
  overrideInputSchema,
} from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { ProblemException } from "../src/common/problem";
import { PaddleService } from "../src/workspace-billing/paddle.service";
import {
  billingTransactionUpdate,
  resolveEventPlan,
  subscriptionUpdate,
} from "../src/workspace-billing/workspace-billing.service";
import {
  capabilityAllowedByWorkspacePlan,
  effectiveWorkspacePlanKey,
  minimumPlanForCapability,
  resolvePlanCapabilities,
  WORKSPACE_SUBSCRIPTION_PLANS,
  WORKSPACE_SUBSCRIPTION_ROLE_POLICY,
  workspacePlan,
} from "../src/workspace-billing/workspace-billing.catalog";
import { WorkspaceEntitlementService } from "../src/workspace-billing/workspace-entitlement.service";

const webhookSecret = "paddle-webhook-secret-at-least-16-characters";

function environment() {
  return parseApiEnvironment({
    NODE_ENV: "test",
    WEB_URL: "http://127.0.0.1:3000",
    API_URL: "http://127.0.0.1:4000",
    DATABASE_URL: "postgresql://example",
    SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
    EMAIL_FROM: "Sarbato <hello@example.test>",
    EMAIL_PROVIDER: "console",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: "1025",
    REDIS_URL: "redis://127.0.0.1:56379",
    OUTBOX_ENCRYPTION_KEY:
      "test-outbox-encryption-key-with-at-least-32-characters",
    LOG_LEVEL: "silent",
    WORKSPACE_BILLING_PROVIDER: "paddle",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_API_KEY: "pdl_sdbx_apikey_with_enough_characters",
    PADDLE_CLIENT_TOKEN: "test_client_token",
    PADDLE_WEBHOOK_SECRET: webhookSecret,
    PADDLE_PLUS_PRICE_ID: "pri_plus123",
    PADDLE_PRO_PRICE_ID: "pri_pro123",
  });
}

describe("Sarbato workspace subscriptions", () => {
  it("keeps the confirmed public amounts in EUR minor units", () => {
    expect(WORKSPACE_SUBSCRIPTION_PLANS.map((plan) => plan.key)).toEqual([
      "FREE",
      "PLUS",
      "PRO",
    ]);
    expect(workspacePlan("FREE").amountMinor).toBe(0);
    expect(workspacePlan("PLUS").amountMinor).toBe(700);
    expect(workspacePlan("PRO").amountMinor).toBe(1700);
    expect(
      WORKSPACE_SUBSCRIPTION_PLANS.every(
        (plan) => plan.currency === "EUR" && plan.interval === "month",
      ),
    ).toBe(true);
  });

  it("accepts only paid plans when creating a Paddle checkout", () => {
    expect(
      createWorkspaceSubscriptionCheckoutSchema.safeParse({ plan: "PLUS" })
        .success,
    ).toBe(true);
    expect(
      createWorkspaceSubscriptionCheckoutSchema.safeParse({ plan: "PRO" })
        .success,
    ).toBe(true);
    expect(
      createWorkspaceSubscriptionCheckoutSchema.safeParse({ plan: "FREE" })
        .success,
    ).toBe(false);
  });

  it("keeps checkout disabled until webhook verification is configured", () => {
    const incomplete = {
      ...environment(),
      PADDLE_WEBHOOK_SECRET: undefined,
    };
    expect(new PaddleService(incomplete).enabled).toBe(false);
    expect(new PaddleService(environment()).enabled).toBe(true);
  });

  it("maps every workspace role without granting billing management beyond the owner", () => {
    expect(
      WORKSPACE_SUBSCRIPTION_ROLE_POLICY.map((policy) => policy.role),
    ).toEqual([
      "couple_owner",
      "couple_partner",
      "wedding_planner",
      "family_collaborator",
      "viewer",
    ]);
    expect(
      WORKSPACE_SUBSCRIPTION_ROLE_POLICY.filter(
        (policy) => policy.billing === "manage",
      ).map((policy) => policy.role),
    ).toEqual(["couple_owner"]);
    expect(
      overrideInputSchema.safeParse({
        capability: "workspace.billing.manage",
        effect: "allow",
      }).success,
    ).toBe(false);
    expect(
      overrideInputSchema.safeParse({
        capability: "workspace.billing.read",
        effect: "allow",
      }).success,
    ).toBe(false);
  });

  it("creates a deterministic, non-reversible assignment token for one checkout", () => {
    const service = new PaddleService(environment());
    const input = {
      plan: "PLUS" as const,
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      checkoutId: "00000000-0000-4000-8000-000000000003",
    };
    const first = service.createAssignmentToken(input);
    const retry = service.createAssignmentToken(input);
    const otherPlan = service.createAssignmentToken({ ...input, plan: "PRO" });
    expect(first).toEqual(retry);
    expect(first.rawToken).not.toContain(input.checkoutId);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(otherPlan.tokenHash).not.toBe(first.tokenHash);
  });

  it("maps webhook access from the exact live Paddle price rather than mutable metadata", () => {
    const service = new PaddleService(environment());
    expect(
      service.planFromProviderData({
        items: [{ price: { id: "pri_plus123" }, quantity: 1 }],
        custom_data: { plan_key: "PRO" },
      }),
    ).toEqual({ planKey: "PLUS", priceId: "pri_plus123" });
    expect(
      service.planFromProviderData({
        items: [{ price_id: "pri_pro123", quantity: 1 }],
      }),
    ).toEqual({ planKey: "PRO", priceId: "pri_pro123" });
  });

  it("rejects a provider payload that contains both paid plan prices", () => {
    const service = new PaddleService(environment());
    expect(() =>
      service.planFromProviderData({
        items: [
          { price_id: "pri_plus123", quantity: 1 },
          { price_id: "pri_pro123", quantity: 1 },
        ],
      }),
    ).toThrow(ProblemException);
  });

  it("fails closed when a checkout token and Paddle price disagree", () => {
    expect(() =>
      resolveEventPlan({
        eventType: "transaction.completed",
        providerPlan: { planKey: "PRO", priceId: "pri_pro123" },
        checkout: {
          id: "00000000-0000-4000-8000-000000000003",
          workspaceId: "00000000-0000-4000-8000-000000000001",
          createdById: "00000000-0000-4000-8000-000000000002",
          planKey: "PLUS",
          providerPriceId: "pri_plus123",
          assignmentTokenHash: "a".repeat(64),
        },
        currentPlan: "FREE",
        currentProviderPriceId: null,
      }),
    ).toThrow(ProblemException);
  });

  it("combines role capabilities with the workspace plan and preserves reads on downgrade", () => {
    const capabilities = [
      "wedding_day.read",
      "wedding_day.write",
      "automation.read",
      "automation.write",
      "guest.write",
      "online_payment.create_checkout",
    ] as const;
    expect(resolvePlanCapabilities(capabilities, "FREE")).toEqual([
      "wedding_day.read",
      "automation.read",
      "guest.write",
    ]);
    expect(resolvePlanCapabilities(capabilities, "PLUS")).toEqual([
      "wedding_day.read",
      "automation.read",
      "automation.write",
      "guest.write",
    ]);
    expect(resolvePlanCapabilities(capabilities, "PRO")).toEqual([
      "wedding_day.read",
      "wedding_day.write",
      "automation.read",
      "automation.write",
      "guest.write",
    ]);
    expect(
      capabilityAllowedByWorkspacePlan("online_payment.create_checkout", "PRO"),
    ).toBe(false);
    expect(minimumPlanForCapability("automation.write")).toBe("PLUS");
    expect(minimumPlanForCapability("wedding_day.write")).toBe("PRO");
  });

  it("falls back to Free for incomplete, paused and canceled subscriptions", () => {
    expect(effectiveWorkspacePlanKey("PRO", "ACTIVE")).toBe("PRO");
    expect(effectiveWorkspacePlanKey("PLUS", "PAST_DUE")).toBe("PLUS");
    expect(effectiveWorkspacePlanKey("PRO", "INCOMPLETE")).toBe("FREE");
    expect(effectiveWorkspacePlanKey("PRO", "PAUSED")).toBe("FREE");
    expect(effectiveWorkspacePlanKey("PRO", "CANCELED")).toBe("FREE");
  });

  it("verifies the official Paddle ts:h1 signature over the raw body", () => {
    const service = new PaddleService(environment());
    const rawBody = Buffer.from(
      JSON.stringify({
        event_id: "evt_123",
        event_type: "subscription.activated",
        occurred_at: new Date().toISOString(),
        data: { id: "sub_123", status: "active" },
      }),
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", webhookSecret)
      .update(`${timestamp}:${rawBody.toString("utf8")}`)
      .digest("hex");
    expect(
      service.verifyWebhook(rawBody, `ts=${timestamp};h1=${signature}`),
    ).toMatchObject({
      event_id: "evt_123",
      event_type: "subscription.activated",
    });
  });

  it("rejects a forged Paddle signature", () => {
    const service = new PaddleService(environment());
    const rawBody = Buffer.from(
      JSON.stringify({
        event_id: "evt_123",
        event_type: "subscription.activated",
        occurred_at: new Date().toISOString(),
        data: { id: "sub_123" },
      }),
    );
    const timestamp = Math.floor(Date.now() / 1000);
    expect(() =>
      service.verifyWebhook(rawBody, `ts=${timestamp};h1=${"0".repeat(64)}`),
    ).toThrow(ProblemException);
  });

  it("extracts accounting totals from a completed Paddle transaction without payment instrument data", () => {
    const occurredAt = new Date("2026-08-08T12:00:00.000Z");
    const result = billingTransactionUpdate(
      {
        event_id: "evt_accounting_123",
        event_type: "transaction.completed",
        occurred_at: occurredAt.toISOString(),
        payloadHash: "a".repeat(64),
        data: {
          id: "txn_accounting_123",
          status: "completed",
          customer_id: "ctm_123",
          subscription_id: "sub_123",
          invoice_number: "INV-1001",
          billed_at: "2026-08-08T11:59:00.000Z",
          custom_data: { plan_key: "PLUS" },
          items: [{ price: { id: "pri_plus123" }, quantity: 1 }],
          details: {
            totals: {
              subtotal: "700",
              discount: "0",
              tax: "133",
              total: "833",
              fee: "80",
              earnings: "620",
              currency_code: "EUR",
            },
          },
          card: { number: "must-not-be-read" },
        },
      },
      "00000000-0000-4000-8000-000000000001",
      "PLUS",
      "txn_accounting_123",
      "ctm_123",
      "sub_123",
      occurredAt,
    );
    expect(result).toMatchObject({
      planKey: "PLUS",
      subtotalMinor: 700n,
      taxMinor: 133n,
      totalMinor: 833n,
      feeMinor: 80n,
      earningsMinor: 620n,
      invoiceNumber: "INV-1001",
    });
    expect(result).not.toHaveProperty("card");
  });

  it("updates and revokes access from subscription lifecycle state", () => {
    const activated = subscriptionUpdate(
      {
        event_id: "evt_sub_active",
        event_type: "subscription.updated",
        occurred_at: "2026-08-08T12:00:00.000Z",
        payloadHash: "a".repeat(64),
        data: {
          status: "active",
          current_billing_period: {
            starts_at: "2026-08-08T12:00:00.000Z",
            ends_at: "2026-09-08T12:00:00.000Z",
          },
        },
      },
      "PRO",
      "pri_pro123",
      "ctm_123",
      "sub_123",
    );
    expect(activated).toMatchObject({
      planKey: "PRO",
      status: "ACTIVE",
      providerPriceId: "pri_pro123",
    });
    const canceled = subscriptionUpdate(
      {
        event_id: "evt_sub_canceled",
        event_type: "subscription.canceled",
        occurred_at: "2026-09-08T12:00:00.000Z",
        payloadHash: "b".repeat(64),
        data: { status: "canceled" },
      },
      "PRO",
      "pri_pro123",
      "ctm_123",
      "sub_123",
    );
    expect(canceled).toMatchObject({ planKey: "FREE", status: "CANCELED" });
  });

  it("enforces persisted plan limits and falls back to Free after cancellation", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ planKey: "PLUS", status: "ACTIVE" })
      .mockResolvedValueOnce({ planKey: "PRO", status: "CANCELED" });
    const transaction = {
      workspaceSubscription: { findUnique },
    } as unknown as Prisma.TransactionClient;
    const entitlements = new WorkspaceEntitlementService();
    await expect(
      entitlements.numeric(
        transaction,
        "00000000-0000-4000-8000-000000000001",
        "MAX_GUESTS",
      ),
    ).resolves.toBe(200);
    await expect(
      entitlements.numeric(
        transaction,
        "00000000-0000-4000-8000-000000000001",
        "MAX_GUESTS",
      ),
    ).resolves.toBe(50);
  });

  it("rejects legacy marketplace money movement in production", () => {
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        WEB_URL: "https://sarbato.space",
        API_URL: "https://sarbato.space",
        DATABASE_URL: "postgresql://example",
        DATABASE_PURPOSE: "production",
        STORAGE_PURPOSE: "production",
        SESSION_SECRET: "production-session-secret-with-32-characters",
        EMAIL_FROM: "Sarbato <hello@sarbato.space>",
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        REDIS_URL: "rediss://user:password@redis.example.com:6380",
        OUTBOX_ENCRYPTION_KEY:
          "production-outbox-encryption-key-with-32-characters",
        LOG_LEVEL: "silent",
        PAYMENT_PROVIDER: "fake",
        SUBSCRIPTION_PROVIDER: "fake",
        PAYOUT_PROVIDER: "fake",
      }),
    ).toThrow(/couple-to-vendor payment processing must remain disabled/);
  });
});
