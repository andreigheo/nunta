import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  WorkspaceBillingOverview,
  WorkspaceSubscriptionPlanKey,
} from "@weddingos/contracts";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { PaddleService, type PaddleWebhook } from "./paddle.service";
import {
  effectiveWorkspacePlanKey,
  WORKSPACE_SUBSCRIPTION_PLANS,
  WORKSPACE_SUBSCRIPTION_ROLE_POLICY,
  workspacePlan,
} from "./workspace-billing.catalog";

@Injectable()
export class WorkspaceBillingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PaddleService) private readonly paddle: PaddleService,
  ) {}

  async overview(
    userId: string,
    workspaceId: string,
  ): Promise<
    WorkspaceBillingOverview & {
      clientToken: string | null;
      paddleEnvironment: "sandbox" | "production";
    }
  > {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const result = await this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const subscription = await transaction.workspaceSubscription.upsert({
          where: { workspaceId },
          create: {
            workspaceId,
            createdById: userId,
            updatedById: userId,
          },
          update: {},
        });
        const [
          activeGuests,
          activeCollaborators,
          pendingInvitations,
          aiActions,
          activeAutomations,
          stored,
          billingTransactions,
        ] = await Promise.all([
          transaction.guest.count({
            where: { workspaceId, status: "ACTIVE" },
          }),
          transaction.workspaceMembership.count({
            where: {
              workspaceId,
              status: "ACTIVE",
              roleTemplate: { key: { not: "couple_owner" } },
            },
          }),
          transaction.teamInvitation.count({
            where: {
              workspaceId,
              status: "PENDING",
              expiresAt: { gt: new Date() },
            },
          }),
          transaction.copilotRun.count({
            where: { workspaceId, createdAt: { gte: monthStart } },
          }),
          transaction.automationRule.count({
            where: { workspaceId, status: { not: "ARCHIVED" } },
          }),
          transaction.storedObject.aggregate({
            where: {
              workspaceId,
              deletedAt: null,
              status: { not: "DELETED" },
            },
            _sum: { sizeBytes: true },
          }),
          transaction.workspaceBillingTransaction.findMany({
            where: { workspaceId },
            orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
            take: 12,
          }),
        ]);
        return {
          subscription,
          billingTransactions,
          used: {
            MAX_GUESTS: activeGuests,
            MAX_COLLABORATORS: activeCollaborators + pendingInvitations,
            AI_ACTIONS_MONTHLY: aiActions,
            MAX_ACTIVE_AUTOMATIONS: activeAutomations,
            STORAGE_BYTES: Number(stored._sum.sizeBytes ?? 0n),
          },
        };
      },
    );
    const effectivePlan = effectiveWorkspacePlanKey(
      result.subscription.planKey,
      result.subscription.status,
    );
    const plan = workspacePlan(effectivePlan);
    const usage = Object.fromEntries(
      Object.entries(result.used).map(([key, used]) => [
        key,
        {
          used,
          limit: Number(plan.entitlements[key] ?? 0),
        },
      ]),
    );
    return {
      provider: this.paddle.enabled ? "paddle" : "disabled",
      checkoutAvailable: this.paddle.enabled,
      portalAvailable:
        this.paddle.enabled &&
        Boolean(
          result.subscription.providerCustomerId &&
          result.subscription.providerSubscriptionId,
        ),
      clientToken: this.paddle.clientToken,
      paddleEnvironment: this.paddle.paddleEnvironment,
      plans: [...WORKSPACE_SUBSCRIPTION_PLANS],
      subscription: subscriptionResource(result.subscription),
      transactions: result.billingTransactions.map(billingTransactionResource),
      usage,
      rolePolicy: [...WORKSPACE_SUBSCRIPTION_ROLE_POLICY],
    };
  }

  async startCheckout(
    userId: string,
    workspaceId: string,
    plan: Exclude<WorkspaceSubscriptionPlanKey, "FREE">,
    idempotencyKey: string,
  ) {
    const current = await this.database.withContext(
      { userId, workspaceId },
      (transaction) =>
        transaction.workspaceSubscription.upsert({
          where: { workspaceId },
          create: {
            workspaceId,
            createdById: userId,
            updatedById: userId,
          },
          update: {},
        }),
    );
    if (current.providerCustomerId && current.providerSubscriptionId) {
      return {
        mode: "portal" as const,
        url: await this.paddle.createPortalSession(
          current.providerCustomerId,
          current.providerSubscriptionId,
        ),
      };
    }

    const checkoutId = randomUUID();
    const priceId = this.paddle.priceId(plan);
    const existing = await this.database.withContext(
      { userId, workspaceId },
      (transaction) =>
        transaction.workspaceBillingCheckout.findUnique({
          where: {
            workspaceId_createdById_idempotencyKey: {
              workspaceId,
              createdById: userId,
              idempotencyKey,
            },
          },
        }),
    );
    if (existing?.planKey !== undefined && existing.planKey !== plan)
      problem(
        "IDEMPOTENCY_KEY_REUSED",
        HttpStatus.CONFLICT,
        "Cheia de checkout a fost folosită pentru alt plan",
      );
    if (existing?.providerTransactionId)
      return {
        mode: "checkout" as const,
        url: this.paddle.checkoutUrl(existing.providerTransactionId),
        transactionId: existing.providerTransactionId,
        reused: true,
      };
    if (existing)
      problem(
        "CHECKOUT_RECOVERY_PENDING",
        HttpStatus.CONFLICT,
        "Checkout-ul anterior este încă în curs de reconciliere",
        "Așteaptă confirmarea Paddle înainte de a porni un checkout nou.",
      );

    const assignment = this.paddle.createAssignmentToken({
      plan,
      workspaceId,
      userId,
      checkoutId,
    });

    await this.database.withContext({ userId, workspaceId }, (transaction) =>
      transaction.workspaceBillingCheckout.create({
        data: {
          id: checkoutId,
          workspaceId,
          createdById: userId,
          planKey: plan,
          provider: "paddle",
          providerPriceId: priceId,
          assignmentTokenHash: assignment.tokenHash,
          idempotencyKey,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    );

    try {
      const created = await this.paddle.createTransaction({
        plan,
        workspaceId,
        userId,
        checkoutId,
        assignmentToken: assignment.rawToken,
      });
      await this.database.withContext({ userId, workspaceId }, (transaction) =>
        transaction.workspaceBillingCheckout.update({
          where: { id: checkoutId },
          data: { providerTransactionId: created.transactionId },
        }),
      );
      return {
        mode: "checkout" as const,
        url: created.checkoutUrl,
        transactionId: created.transactionId,
      };
    } catch (error) {
      await this.database.withContext({ userId, workspaceId }, (transaction) =>
        transaction.workspaceBillingCheckout.update({
          where: { id: checkoutId },
          data: { status: "FAILED" },
        }),
      );
      throw error;
    }
  }

  async portal(userId: string, workspaceId: string) {
    const subscription = await this.database.withContext(
      { userId, workspaceId },
      (transaction) =>
        transaction.workspaceSubscription.findUnique({
          where: { workspaceId },
        }),
    );
    if (
      !subscription?.providerCustomerId ||
      !subscription.providerSubscriptionId
    ) {
      problem(
        "SUBSCRIPTION_PORTAL_UNAVAILABLE",
        HttpStatus.CONFLICT,
        "Portalul abonamentului nu este disponibil",
      );
    }
    return {
      url: await this.paddle.createPortalSession(
        subscription.providerCustomerId,
        subscription.providerSubscriptionId,
      ),
    };
  }

  async webhook(rawBody: Buffer, signature: string | undefined) {
    const event = this.paddle.verifyWebhook(rawBody, signature);
    const data = event.data;
    const custom = objectValue(data.custom_data);
    const assignmentToken = stringValue(custom?.assignment_token);
    const assignmentTokenHash = assignmentToken
      ? createHash("sha256").update(assignmentToken).digest("hex")
      : null;
    const checkoutId = uuidValue(custom?.checkout_id);
    const transactionId =
      stringValue(data.transaction_id) ??
      (event.event_type.startsWith("transaction.")
        ? stringValue(data.id)
        : null);
    const customerId = stringValue(data.customer_id);
    const subscriptionId =
      stringValue(data.subscription_id) ??
      (event.event_type.startsWith("subscription.")
        ? stringValue(data.id)
        : null);

    const resolved = await this.database.$queryRaw<
      Array<{
        workspace_id: string;
        checkout_id: string | null;
        actor_user_id: string;
      }>
    >`SELECT * FROM public.weddingos_resolve_workspace_billing_event(
      ${assignmentTokenHash},
      ${checkoutId}::uuid,
      ${transactionId},
      ${subscriptionId}
    )`;
    const binding = resolved[0];
    if (!binding) return { accepted: true, ignored: true };

    return this.database.withContext(
      {
        userId: binding.actor_user_id,
        workspaceId: binding.workspace_id,
      },
      async (transaction) => {
        await transaction.$queryRaw`SELECT pg_advisory_xact_lock(
          hashtextextended(${`sarbato-workspace-billing:${binding.workspace_id}`}, 0)
        )`;
        const duplicate =
          await transaction.workspaceBillingProviderEvent.findUnique({
            where: { providerEventId: event.event_id },
          });
        if (duplicate) {
          if (duplicate.payloadHash !== event.payloadHash)
            problem(
              "PADDLE_EVENT_COLLISION",
              HttpStatus.CONFLICT,
              "Eveniment Paddle duplicat cu alt conținut",
            );
          return { accepted: true, duplicate: true };
        }

        const subscription = await transaction.workspaceSubscription.upsert({
          where: { workspaceId: binding.workspace_id },
          create: {
            workspaceId: binding.workspace_id,
            createdById: binding.actor_user_id,
            updatedById: binding.actor_user_id,
          },
          update: {},
        });
        const checkout = binding.checkout_id
          ? await transaction.workspaceBillingCheckout.findUnique({
              where: { id: binding.checkout_id },
            })
          : null;
        validateBillingBinding({
          custom,
          assignmentTokenHash,
          binding,
          checkout,
        });
        const occurredAt = validDate(event.occurred_at);
        const supported = supportedEvent(event.event_type);
        const stale =
          subscription.lastProviderEventAt !== null &&
          occurredAt <= subscription.lastProviderEventAt;
        const providerPlan = this.paddle.planFromProviderData(data);
        const resolvedPlan = resolveEventPlan({
          eventType: event.event_type,
          providerPlan,
          checkout,
          currentPlan: subscription.planKey,
          currentProviderPriceId: subscription.providerPriceId,
        });

        const accounting = billingTransactionUpdate(
          event,
          binding.workspace_id,
          resolvedPlan.planKey,
          transactionId,
          customerId,
          subscriptionId,
          occurredAt,
        );
        if (accounting) {
          const existingAccounting =
            await transaction.workspaceBillingTransaction.findUnique({
              where: {
                providerTransactionId: accounting.providerTransactionId,
              },
            });
          if (!existingAccounting) {
            await transaction.workspaceBillingTransaction.create({
              data: accounting,
            });
          } else if (occurredAt >= existingAccounting.lastProviderEventAt) {
            const {
              workspaceId: _workspaceId,
              providerTransactionId: _providerTransactionId,
              ...update
            } = accounting;
            await transaction.workspaceBillingTransaction.update({
              where: { id: existingAccounting.id },
              data: update,
            });
          }
        }

        let status: "PROCESSED" | "IGNORED" = "IGNORED";
        const provisionsSubscription =
          supported &&
          !stale &&
          (event.event_type !== "transaction.completed" || Boolean(checkout));
        if (provisionsSubscription) {
          const next = subscriptionUpdate(
            event,
            resolvedPlan.planKey,
            resolvedPlan.priceId,
            customerId,
            subscriptionId,
          );
          await transaction.workspaceSubscription.update({
            where: { id: subscription.id },
            data: {
              ...next,
              provider: "paddle",
              updatedById: binding.actor_user_id,
              lastProviderEventAt: occurredAt,
              version: { increment: 1 },
            },
          });
          if (
            event.event_type === "transaction.completed" &&
            binding.checkout_id
          ) {
            await transaction.workspaceBillingCheckout.updateMany({
              where: { id: binding.checkout_id, status: "CREATED" },
              data: {
                status: "COMPLETED",
                completedAt: occurredAt,
              },
            });
          }
          status = "PROCESSED";
        }
        if (accounting) status = "PROCESSED";

        await transaction.workspaceBillingProviderEvent.create({
          data: {
            workspaceId: binding.workspace_id,
            checkoutId: binding.checkout_id,
            provider: "paddle",
            providerEventId: event.event_id,
            eventType: event.event_type,
            providerTransactionId: transactionId,
            providerCustomerId: customerId,
            providerSubscriptionId: subscriptionId,
            payloadHash: event.payloadHash,
            occurredAt,
            processedAt: new Date(),
            status,
          },
        });
        return { accepted: true, processed: status === "PROCESSED" };
      },
    );
  }
}

function billingTransactionResource(transaction: {
  id: string;
  providerTransactionId: string;
  providerSubscriptionId: string | null;
  planKey: WorkspaceSubscriptionPlanKey;
  status: string;
  currency: string;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  feeMinor: bigint | null;
  earningsMinor: bigint | null;
  invoiceNumber: string | null;
  billedAt: Date | null;
  completedAt: Date | null;
}) {
  return {
    id: transaction.id,
    providerTransactionId: transaction.providerTransactionId,
    providerSubscriptionId: transaction.providerSubscriptionId,
    plan: transaction.planKey,
    status: transaction.status,
    currency: transaction.currency,
    subtotalMinor: safeMoneyNumber(transaction.subtotalMinor),
    discountMinor: safeMoneyNumber(transaction.discountMinor),
    taxMinor: safeMoneyNumber(transaction.taxMinor),
    totalMinor: safeMoneyNumber(transaction.totalMinor),
    feeMinor:
      transaction.feeMinor === null
        ? null
        : safeMoneyNumber(transaction.feeMinor),
    earningsMinor:
      transaction.earningsMinor === null
        ? null
        : safeMoneyNumber(transaction.earningsMinor),
    invoiceNumber: transaction.invoiceNumber,
    billedAt: transaction.billedAt?.toISOString() ?? null,
    completedAt: transaction.completedAt?.toISOString() ?? null,
  };
}

export function billingTransactionUpdate(
  event: PaddleWebhook,
  workspaceId: string,
  planKey: WorkspaceSubscriptionPlanKey,
  transactionId: string | null,
  customerId: string | null,
  subscriptionId: string | null,
  occurredAt: Date,
) {
  if (event.event_type !== "transaction.completed" || !transactionId)
    return null;
  const data = event.data;
  const details = objectValue(data.details);
  const totals = objectValue(details?.totals);
  if (!totals)
    problem(
      "SUBSCRIPTION_EVENT_INVALID",
      HttpStatus.BAD_REQUEST,
      "Totalurile tranzacției Paddle lipsesc",
    );
  const currency = stringValue(totals.currency_code);
  if (!currency || !/^[A-Z]{3}$/.test(currency))
    problem(
      "SUBSCRIPTION_EVENT_INVALID",
      HttpStatus.BAD_REQUEST,
      "Moneda tranzacției Paddle este invalidă",
    );
  return {
    workspaceId,
    provider: "paddle",
    providerTransactionId: transactionId,
    providerSubscriptionId: subscriptionId,
    providerCustomerId: customerId,
    planKey,
    status: stringValue(data.status) ?? "completed",
    currency,
    subtotalMinor: moneyBigInt(totals.subtotal, "subtotal"),
    discountMinor: moneyBigInt(totals.discount, "discount"),
    taxMinor: moneyBigInt(totals.tax, "tax"),
    totalMinor: moneyBigInt(totals.total, "total"),
    feeMinor: optionalMoneyBigInt(totals.fee, "fee"),
    earningsMinor: optionalMoneyBigInt(totals.earnings, "earnings"),
    invoiceNumber: stringValue(data.invoice_number),
    billedAt: optionalDate(data.billed_at),
    completedAt: optionalDate(data.completed_at) ?? occurredAt,
    lastProviderEventAt: occurredAt,
  };
}

export function subscriptionResource(subscription: {
  planKey: WorkspaceSubscriptionPlanKey;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}) {
  const effectivePlan = effectiveWorkspacePlanKey(
    subscription.planKey,
    subscription.status,
  );
  return {
    plan: effectivePlan,
    status: subscription.status as
      "FREE" | "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELED",
    entitlements: workspacePlan(effectivePlan).entitlements,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  };
}

function supportedEvent(eventType: string) {
  return new Set([
    "transaction.completed",
    "subscription.created",
    "subscription.updated",
    "subscription.activated",
    "subscription.past_due",
    "subscription.paused",
    "subscription.resumed",
    "subscription.canceled",
  ]).has(eventType);
}

export function subscriptionUpdate(
  event: PaddleWebhook,
  planKey: WorkspaceSubscriptionPlanKey,
  providerPriceId: string | null,
  customerId: string | null,
  subscriptionId: string | null,
) {
  const data = event.data;
  const providerStatus = stringValue(data.status);
  const status: "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "PAUSED" | "CANCELED" =
    event.event_type === "subscription.canceled" ||
    providerStatus === "canceled"
      ? "CANCELED"
      : event.event_type === "subscription.past_due" ||
          providerStatus === "past_due"
        ? "PAST_DUE"
        : event.event_type === "subscription.paused" ||
            providerStatus === "paused"
          ? "PAUSED"
          : event.event_type === "transaction.completed" ||
              event.event_type === "subscription.activated" ||
              event.event_type === "subscription.resumed" ||
              providerStatus === "active"
            ? "ACTIVE"
            : "INCOMPLETE";
  const period = objectValue(data.current_billing_period);
  const scheduled = objectValue(data.scheduled_change);
  return {
    planKey: status === "CANCELED" ? ("FREE" as const) : planKey,
    status,
    providerCustomerId: customerId ?? undefined,
    providerSubscriptionId: subscriptionId ?? undefined,
    providerPriceId: providerPriceId ?? undefined,
    currentPeriodStart: optionalDate(period?.starts_at),
    currentPeriodEnd: optionalDate(period?.ends_at),
    cancelAtPeriodEnd:
      stringValue(scheduled?.action) === "cancel" && status !== "CANCELED",
  };
}

export type BillingCheckoutBinding = {
  id: string;
  workspaceId: string;
  createdById: string;
  planKey: WorkspaceSubscriptionPlanKey;
  providerPriceId: string;
  assignmentTokenHash: string;
};

function validateBillingBinding(input: {
  custom: Record<string, unknown> | null;
  assignmentTokenHash: string | null;
  binding: {
    workspace_id: string;
    checkout_id: string | null;
    actor_user_id: string;
  };
  checkout: BillingCheckoutBinding | null;
}) {
  const purpose = stringValue(input.custom?.purpose);
  if (purpose && purpose !== "sarbato_workspace_subscription")
    invalidBillingEvent("Scopul tokenului Paddle este invalid.");

  const customWorkspaceId = uuidValue(input.custom?.workspace_id);
  if (customWorkspaceId && customWorkspaceId !== input.binding.workspace_id)
    invalidBillingEvent("Workspace-ul din eveniment nu corespunde tokenului.");

  const customUserId = uuidValue(input.custom?.purchaser_user_id);
  if (customUserId && customUserId !== input.binding.actor_user_id)
    invalidBillingEvent("Utilizatorul din eveniment nu corespunde tokenului.");

  if (!input.checkout) {
    if (input.binding.checkout_id)
      invalidBillingEvent("Checkout-ul asociat evenimentului lipsește.");
    return;
  }
  if (input.checkout.workspaceId !== input.binding.workspace_id)
    invalidBillingEvent("Checkout-ul aparține altui workspace.");
  if (input.checkout.createdById !== input.binding.actor_user_id)
    invalidBillingEvent("Checkout-ul aparține altui utilizator.");
  if (
    input.assignmentTokenHash &&
    input.assignmentTokenHash !== input.checkout.assignmentTokenHash
  )
    invalidBillingEvent("Tokenul de alocare Paddle este invalid.");
  const customPlan = stringValue(input.custom?.plan_key);
  if (customPlan && customPlan !== input.checkout.planKey)
    invalidBillingEvent("Planul din metadata nu corespunde checkout-ului.");
}

export function resolveEventPlan(input: {
  eventType: string;
  providerPlan: {
    planKey: Exclude<WorkspaceSubscriptionPlanKey, "FREE">;
    priceId: string;
  } | null;
  checkout: BillingCheckoutBinding | null;
  currentPlan: WorkspaceSubscriptionPlanKey;
  currentProviderPriceId: string | null;
}): { planKey: WorkspaceSubscriptionPlanKey; priceId: string | null } {
  if (input.checkout) {
    if (!input.providerPlan)
      invalidBillingEvent("Prețul Paddle lipsește din evenimentul checkout.");
    if (
      input.providerPlan.planKey !== input.checkout.planKey ||
      input.providerPlan.priceId !== input.checkout.providerPriceId
    )
      invalidBillingEvent("Prețul Paddle nu corespunde planului cumpărat.");
    return input.providerPlan;
  }
  if (input.providerPlan) return input.providerPlan;
  if (!supportedEvent(input.eventType))
    return {
      planKey: input.currentPlan,
      priceId: input.currentProviderPriceId,
    };
  if (
    input.eventType === "subscription.canceled" &&
    input.currentPlan !== "FREE"
  )
    return {
      planKey: input.currentPlan,
      priceId: input.currentProviderPriceId,
    };
  invalidBillingEvent("Prețul Paddle nu poate fi mapat la Plus sau Pro.");
}

function invalidBillingEvent(detail: string): never {
  problem(
    "PADDLE_PLAN_BINDING_INVALID",
    HttpStatus.BAD_REQUEST,
    "Alocarea abonamentului Paddle este invalidă",
    detail,
  );
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uuidValue(value: unknown): string | null {
  const candidate = stringValue(value);
  return candidate &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate,
    )
    ? candidate
    : null;
}

function validDate(value: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.getTime()))
    problem(
      "SUBSCRIPTION_EVENT_INVALID",
      HttpStatus.BAD_REQUEST,
      "Data evenimentului Paddle este invalidă",
    );
  return result;
}

function optionalDate(value: unknown): Date | undefined {
  const candidate = stringValue(value);
  if (!candidate) return undefined;
  const result = new Date(candidate);
  return Number.isNaN(result.getTime()) ? undefined : result;
}

function moneyBigInt(value: unknown, field: string): bigint {
  const candidate = stringValue(value);
  if (!candidate || !/^\d+$/.test(candidate))
    problem(
      "SUBSCRIPTION_EVENT_INVALID",
      HttpStatus.BAD_REQUEST,
      `Suma Paddle ${field} este invalidă`,
    );
  return BigInt(candidate);
}

function optionalMoneyBigInt(value: unknown, field: string): bigint | null {
  return value === null || value === undefined
    ? null
    : moneyBigInt(value, field);
}

function safeMoneyNumber(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount))
    problem(
      "INTERNAL_ERROR",
      HttpStatus.INTERNAL_SERVER_ERROR,
      "Suma contabilă nu poate fi afișată în siguranță",
    );
  return amount;
}
