import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseApiEnvironment } from "@weddingos/config";
import {
  createMessageCreditCheckoutSchema,
  createWorkspaceSubscriptionCheckoutSchema,
  overrideInputSchema,
} from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { ProblemException } from "../src/common/problem";
import {
  PaddleRequestOutcomeUnknownError,
  PaddleService,
} from "../src/workspace-billing/paddle.service";
import {
  billingTransactionUpdate,
  messageCreditAdjustment,
  resolveEventPlan,
  subscriptionUpdate,
  WorkspaceBillingService,
} from "../src/workspace-billing/workspace-billing.service";
import {
  allocateMessageCreditConsumption,
  MessageCreditService,
} from "../src/workspace-billing/message-credit.service";
import {
  capabilityAllowedByWorkspacePlan,
  effectiveWorkspacePlanKey,
  minimumPlanForCapability,
  resolvePlanCapabilities,
  MESSAGE_CREDIT_PACKS,
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
    PADDLE_MESSAGE_CREDITS_100_PRICE_ID: "pri_messages100",
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
    expect(workspacePlan("PLUS").amountMinor).toBe(2700);
    expect(workspacePlan("PRO").amountMinor).toBe(5900);
    expect(
      WORKSPACE_SUBSCRIPTION_PLANS.every(
        (plan) => plan.currency === "EUR" && plan.interval === "month",
      ),
    ).toBe(true);
  });

  it("includes the agreed messaging allowances and €12.50 add-on", () => {
    expect(workspacePlan("FREE").entitlements.MESSAGING_CREDITS).toBe(10);
    expect(workspacePlan("PLUS").entitlements.MESSAGING_CREDITS).toBe(50);
    expect(workspacePlan("PRO").entitlements.MESSAGING_CREDITS).toBe(100);
    expect(MESSAGE_CREDIT_PACKS).toEqual([
      expect.objectContaining({
        key: "MESSAGES_100",
        credits: 100,
        amountMinor: 1250,
        currency: "EUR",
      }),
    ]);
    expect(
      createMessageCreditCheckoutSchema.safeParse({ pack: "MESSAGES_100" })
        .success,
    ).toBe(true);
    expect(
      createMessageCreditCheckoutSchema.safeParse({ pack: "MESSAGES_500" })
        .success,
    ).toBe(false);
  });

  it("consumes included credits before purchased credits", () => {
    expect(allocateMessageCreditConsumption(10, 100, 7)).toEqual({
      includedUsed: 7,
      purchasedUsed: 0,
      includedAfter: 3,
      purchasedAfter: 100,
    });
    expect(allocateMessageCreditConsumption(3, 100, 8)).toEqual({
      includedUsed: 3,
      purchasedUsed: 5,
      includedAfter: 0,
      purchasedAfter: 95,
    });
    expect(() => allocateMessageCreditConsumption(1, 1, 3)).toThrow(
      "Insufficient message credits",
    );
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

  it("does not classify a failed provider read as a possibly-created charge", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("provider unavailable"));
    try {
      await expect(
        new PaddleService(environment()).getSubscription("sub_test"),
      ).rejects.toMatchObject({
        name: "PaddleRequestOutcomeUnknownError",
        mayHaveCommitted: false,
      });
    } finally {
      fetchMock.mockRestore();
    }
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

  it("uses Paddle's transaction query parameter and recognizes only the exact credit pack price", () => {
    const service = new PaddleService(environment());
    expect(service.checkoutUrl("txn_test/with spaces")).toBe(
      "http://127.0.0.1:3000/checkout?_ptxn=txn_test%2Fwith%20spaces",
    );
    expect(
      service.messageCreditPackFromProviderData({
        items: [{ price_id: "pri_messages100", quantity: 1 }],
        custom_data: { credit_pack_key: "something-else" },
      }),
    ).toEqual({
      packKey: "MESSAGES_100",
      priceId: "pri_messages100",
    });
    expect(
      service.messageCreditPackFromProviderData({
        items: [
          { price_id: "pri_messages100", quantity: 1 },
          { price_id: "pri_plus123", quantity: 1 },
        ],
      }),
    ).toBeNull();
  });

  it("revokes only approved Paddle credit-pack adjustments", () => {
    const checkout = {
      id: "00000000-0000-4000-8000-000000000003",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      createdById: "00000000-0000-4000-8000-000000000002",
      kind: "MESSAGE_CREDITS" as const,
      planKey: null,
      creditPackKey: "MESSAGES_100",
      creditQuantity: 100,
      providerPriceId: "pri_messages100",
      assignmentTokenHash: "a".repeat(64),
    };
    expect(
      messageCreditAdjustment(
        {
          id: "adj_pending",
          action: "refund",
          status: "pending_approval",
          type: "full",
        },
        checkout,
      ),
    ).toMatchObject({ approved: false, quantity: 0 });
    expect(
      messageCreditAdjustment(
        {
          id: "adj_full",
          action: "refund",
          status: "approved",
          type: "full",
        },
        checkout,
      ),
    ).toMatchObject({ approved: true, quantity: 100 });
    expect(
      messageCreditAdjustment(
        {
          id: "adj_partial",
          action: "refund",
          status: "approved",
          type: "partial",
          totals: { total: "625", currency_code: "EUR" },
        },
        checkout,
      ),
    ).toMatchObject({ approved: true, quantity: 50 });
    expect(
      messageCreditAdjustment(
        {
          id: "adj_rejected",
          action: "refund",
          status: "rejected",
          type: "full",
        },
        checkout,
      ),
    ).toMatchObject({ approved: false, quantity: 0 });
    expect(
      messageCreditAdjustment(
        {
          id: "adj_full",
          action: "refund",
          status: "reversed",
          type: "full",
        },
        checkout,
      ),
    ).toMatchObject({ approved: false, reversed: true, quantity: 0 });
  });

  it("revokes purchased credits idempotently without making the balance negative", async () => {
    const account = {
      id: "00000000-0000-4000-8000-000000000010",
      includedBalance: 5,
      purchasedBalance: 40,
      allowancePlanKey: "FREE",
      allowancePeriodStart: null,
    };
    const entryFind = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ quantity: -40 });
    const accountUpdate = vi.fn(async () => ({
      ...account,
      purchasedBalance: 0,
    }));
    const entryCreate = vi.fn(async () => ({}));
    const transaction = {
      $queryRaw: vi.fn(async () => [{ locked: "1" }]),
      workspaceMessageCreditEntry: {
        findUnique: entryFind,
        create: entryCreate,
      },
      workspaceSubscription: {
        upsert: vi.fn(async () => ({
          planKey: "FREE",
          status: "FREE",
          currentPeriodStart: null,
          currentPeriodEnd: null,
        })),
      },
      workspaceMessageCreditAccount: {
        findUnique: vi.fn(async () => account),
        update: accountUpdate,
      },
    } as unknown as Prisma.TransactionClient;
    const service = new MessageCreditService({} as never);
    const input = {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      quantity: 100,
      providerTransactionId: "txn_01m209dxm0s6enw4mrj4r4xvyv",
      providerAdjustmentId: "adj_01m209dxm0s6enw4mrj4r4xvyv",
      action: "refund",
    };

    await expect(service.revokePurchase(transaction, input)).resolves.toEqual({
      revoked: true,
      quantity: 40,
    });
    await expect(service.revokePurchase(transaction, input)).resolves.toEqual({
      revoked: false,
      quantity: 40,
    });
    expect(accountUpdate).toHaveBeenCalledTimes(1);
    expect(entryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "REFUND",
          quantity: -40,
          balanceAfter: 0,
          metadata: expect.objectContaining({ unrecoveredQuantity: 60 }),
        }),
      }),
    );
  });

  it("restores only the credits removed by a reversed Paddle adjustment", async () => {
    const account = {
      id: "00000000-0000-4000-8000-000000000010",
      includedBalance: 0,
      purchasedBalance: 15,
      allowancePlanKey: "FREE",
      allowancePeriodStart: null,
    };
    const entryFind = vi
      .fn()
      .mockResolvedValueOnce({ quantity: -40 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ quantity: -40 })
      .mockResolvedValueOnce({ quantity: 40 });
    const accountUpdate = vi.fn(async () => ({
      ...account,
      purchasedBalance: 55,
    }));
    const entryCreate = vi.fn(async () => ({}));
    const transaction = {
      $queryRaw: vi.fn(async () => [{ locked: "1" }]),
      workspaceMessageCreditEntry: {
        findUnique: entryFind,
        create: entryCreate,
      },
      workspaceSubscription: {
        upsert: vi.fn(async () => ({
          planKey: "FREE",
          status: "FREE",
          currentPeriodStart: null,
          currentPeriodEnd: null,
        })),
      },
      workspaceMessageCreditAccount: {
        findUnique: vi.fn(async () => account),
        update: accountUpdate,
      },
    } as unknown as Prisma.TransactionClient;
    const service = new MessageCreditService({} as never);
    const input = {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      providerTransactionId: "txn_01m209dxm0s6enw4mrj4r4xvyv",
      providerAdjustmentId: "adj_01m209dxm0s6enw4mrj4r4xvyv",
      action: "refund",
    };

    await expect(
      service.restoreReversedPurchase(transaction, input),
    ).resolves.toEqual({ restored: true, quantity: 40 });
    await expect(
      service.restoreReversedPurchase(transaction, input),
    ).resolves.toEqual({ restored: false, quantity: 40 });
    expect(accountUpdate).toHaveBeenCalledTimes(1);
    expect(entryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "ADJUSTMENT",
          quantity: 40,
          balanceAfter: 55,
        }),
      }),
    );
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
          kind: "SUBSCRIPTION",
          planKey: "PLUS",
          creditPackKey: null,
          creditQuantity: null,
          providerPriceId: "pri_plus123",
          assignmentTokenHash: "a".repeat(64),
        },
        currentPlan: "FREE",
        currentProviderPriceId: null,
      }),
    ).toThrow(ProblemException);
  });

  it("accepts an allowlisted price change for the already bound Paddle subscription", () => {
    expect(
      resolveEventPlan({
        eventType: "subscription.updated",
        providerPlan: { planKey: "PRO", priceId: "pri_pro123" },
        checkout: {
          id: "00000000-0000-4000-8000-000000000003",
          workspaceId: "00000000-0000-4000-8000-000000000001",
          createdById: "00000000-0000-4000-8000-000000000002",
          kind: "SUBSCRIPTION",
          planKey: "PLUS",
          creditPackKey: null,
          creditQuantity: null,
          providerPriceId: "pri_plus123",
          assignmentTokenHash: "a".repeat(64),
        },
        currentPlan: "PLUS",
        currentProviderPriceId: "pri_plus123",
        establishedSubscription: true,
      }),
    ).toEqual({ planKey: "PRO", priceId: "pri_pro123" });
  });

  it("combines role capabilities with the workspace plan and preserves reads on downgrade", () => {
    const capabilities = [
      "wedding_day.read",
      "wedding_day.write",
      "automation.read",
      "automation.write",
      "guest.write",
      "campaign.send",
      "online_payment.create_checkout",
    ] as const;
    expect(resolvePlanCapabilities(capabilities, "FREE")).toEqual([
      "wedding_day.read",
      "automation.read",
      "guest.write",
      "campaign.send",
    ]);
    expect(resolvePlanCapabilities(capabilities, "PLUS")).toEqual([
      "wedding_day.read",
      "automation.read",
      "automation.write",
      "guest.write",
      "campaign.send",
    ]);
    expect(resolvePlanCapabilities(capabilities, "PRO")).toEqual([
      "wedding_day.read",
      "wedding_day.write",
      "automation.read",
      "automation.write",
      "guest.write",
      "campaign.send",
    ]);
    expect(
      capabilityAllowedByWorkspacePlan("online_payment.create_checkout", "PRO"),
    ).toBe(false);
    expect(minimumPlanForCapability("automation.write")).toBe("PLUS");
    expect(minimumPlanForCapability("wedding_day.write")).toBe("PRO");
    expect(capabilityAllowedByWorkspacePlan("campaign.send", "FREE")).toBe(
      true,
    );
    expect(minimumPlanForCapability("campaign.send")).toBeNull();
  });

  it("keeps paid access for exactly the configured past-due grace window", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    expect(effectiveWorkspacePlanKey("PRO", "ACTIVE")).toBe("PRO");
    expect(
      effectiveWorkspacePlanKey(
        "PLUS",
        "PAST_DUE",
        new Date("2026-09-07T12:00:00.000Z"),
        now,
      ),
    ).toBe("PLUS");
    expect(
      effectiveWorkspacePlanKey(
        "PLUS",
        "PAST_DUE",
        new Date("2026-09-07T11:59:59.999Z"),
        new Date("2026-09-07T12:00:00.000Z"),
      ),
    ).toBe("FREE");
    expect(effectiveWorkspacePlanKey("PLUS", "PAST_DUE", null, now)).toBe(
      "FREE",
    );
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
    const pastDue = subscriptionUpdate(
      {
        event_id: "evt_sub_past_due",
        event_type: "subscription.past_due",
        occurred_at: "2026-09-04T12:00:00.000Z",
        payloadHash: "c".repeat(64),
        data: { status: "past_due" },
      },
      "PRO",
      "pri_pro123",
      "ctm_123",
      "sub_123",
      72,
      { pastDueAt: null, gracePeriodEndAt: null },
    );
    expect(pastDue).toMatchObject({
      status: "PAST_DUE",
      pastDueAt: new Date("2026-09-04T12:00:00.000Z"),
      gracePeriodEndAt: new Date("2026-09-07T12:00:00.000Z"),
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

  it("publishes the agreed recipient delivery quotas and Pro-only priority support", () => {
    expect(workspacePlan("FREE").entitlements.EMAIL_DELIVERIES_MONTHLY).toBe(
      200,
    );
    expect(workspacePlan("PLUS").entitlements.EMAIL_DELIVERIES_MONTHLY).toBe(
      2_000,
    );
    expect(workspacePlan("PRO").entitlements.EMAIL_DELIVERIES_MONTHLY).toBe(
      10_000,
    );
    expect(workspacePlan("FREE").entitlements.PRIORITY_SUPPORT).toBe(false);
    expect(workspacePlan("PLUS").entitlements.PRIORITY_SUPPORT).toBe(false);
    expect(workspacePlan("PRO").entitlements.PRIORITY_SUPPORT).toBe(true);
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

  it("serializes capacity checks for one workspace and metric", async () => {
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspaceSubscription: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ planKey: "PLUS", status: "ACTIVE" }),
      },
    } as unknown as Prisma.TransactionClient;
    const entitlements = new WorkspaceEntitlementService();
    await entitlements.lockCapacity(
      transaction,
      "00000000-0000-4000-8000-000000000001",
      "MAX_GUESTS",
    );
    await entitlements.assertCapacity(
      transaction,
      "00000000-0000-4000-8000-000000000001",
      "MAX_GUESTS",
      199,
    );
    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("creates a fresh checkout after a terminal canceled subscription", async () => {
    const checkout = {
      id: "00000000-0000-4000-8000-000000000003",
      providerTransactionId: null,
    };
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspaceSubscription: {
        upsert: vi.fn().mockResolvedValue({
          status: "CANCELED",
          providerCustomerId: "ctm_old",
          providerSubscriptionId: "sub_old",
        }),
      },
      workspaceBillingCheckout: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(checkout),
        update: vi.fn().mockResolvedValue({
          ...checkout,
          providerTransactionId: "txn_new",
        }),
      },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          action: (transaction: typeof tx) => unknown,
        ) => action(tx),
      ),
    };
    const paddle = {
      priceId: vi.fn().mockReturnValue("pri_pro123"),
      createAssignmentToken: vi
        .fn()
        .mockReturnValue({ rawToken: "assignment", tokenHash: "a".repeat(64) }),
      createPortalSession: vi.fn(),
      createTransaction: vi.fn().mockResolvedValue({
        transactionId: "txn_new",
        checkoutUrl: "https://checkout.test/txn_new",
        priceId: "pri_pro123",
      }),
    };
    const service = new WorkspaceBillingService(
      database as never,
      paddle as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.startCheckout(
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000001",
        "PRO",
        "repurchase",
      ),
    ).resolves.toMatchObject({ mode: "checkout", transactionId: "txn_new" });
    expect(paddle.createPortalSession).not.toHaveBeenCalled();
    expect(paddle.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("blocks a retry when Paddle's create outcome is unknown", async () => {
    const statusUpdates: unknown[] = [];
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      workspaceSubscription: {
        upsert: vi.fn().mockResolvedValue({ status: "FREE" }),
      },
      workspaceBillingCheckout: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(async ({ data }) => data),
        update: vi.fn().mockImplementation(async ({ data }) => {
          statusUpdates.push(data);
          return data;
        }),
      },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          action: (transaction: typeof tx) => unknown,
        ) => action(tx),
      ),
    };
    const paddle = {
      priceId: vi.fn().mockReturnValue("pri_plus123"),
      createAssignmentToken: vi
        .fn()
        .mockReturnValue({ rawToken: "assignment", tokenHash: "a".repeat(64) }),
      createTransaction: vi
        .fn()
        .mockRejectedValue(new PaddleRequestOutcomeUnknownError()),
    };
    const service = new WorkspaceBillingService(
      database as never,
      paddle as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.startCheckout(
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000001",
        "PLUS",
        "unknown-outcome",
      ),
    ).rejects.toMatchObject({ code: "CHECKOUT_RECOVERY_PENDING" });
    expect(statusUpdates).toEqual([
      expect.objectContaining({ status: "RECOVERY_PENDING" }),
    ]);
  });

  it("contains asynchronous webhook drain failures", async () => {
    const database = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    const paddle = {
      enabled: true,
      verifyWebhook: vi.fn().mockReturnValue({
        event_id: "evt_async_failure",
        event_type: "subscription.activated",
        occurred_at: "2026-09-09T16:11:40.509Z",
        payloadHash: "a".repeat(64),
        data: { id: "sub_async_failure", status: "active" },
      }),
    };
    const service = new WorkspaceBillingService(
      database as never,
      paddle as never,
      {} as never,
      {} as never,
    );
    const drain = vi
      .spyOn(
        service as unknown as { drainBillingEvents: () => Promise<void> },
        "drainBillingEvents",
      )
      .mockRejectedValue(new Error("drain failed"));
    const logger = vi
      .spyOn(
        (
          service as unknown as {
            logger: { error: (message: string, stack?: string) => void };
          }
        ).logger,
        "error",
      )
      .mockImplementation(() => undefined);

    await expect(
      service.webhook(Buffer.from("{}"), "valid-signature"),
    ).resolves.toEqual({ accepted: true, ignored: true });
    await vi.waitFor(() => {
      expect(drain).toHaveBeenCalledTimes(1);
      expect(logger).toHaveBeenCalledWith(
        "Workspace billing webhook-event-drain failed",
        expect.stringContaining("drain failed"),
      );
    });
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
