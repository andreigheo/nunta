import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@weddingos/database";
import type { WorkspaceSubscriptionPlanKey } from "@weddingos/contracts";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import {
  effectiveWorkspacePlanKey,
  workspacePlan,
} from "./workspace-billing.catalog";

type SubscriptionState = {
  planKey: WorkspaceSubscriptionPlanKey;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
};

export type MessageCreditBalance = {
  included: number;
  purchased: number;
  available: number;
  planAllowance: number;
  resetsAt: string | null;
};

@Injectable()
export class MessageCreditService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async balance(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    subscription: SubscriptionState,
  ): Promise<MessageCreditBalance> {
    await this.lock(transaction, workspaceId);
    const account = await this.syncLocked(
      transaction,
      workspaceId,
      subscription,
    );
    const planKey = effectiveWorkspacePlanKey(
      subscription.planKey,
      subscription.status,
    );
    return {
      included: account.includedBalance,
      purchased: account.purchasedBalance,
      available: account.includedBalance + account.purchasedBalance,
      planAllowance: allowanceFor(planKey),
      resetsAt:
        planKey === "FREE"
          ? null
          : (subscription.currentPeriodEnd?.toISOString() ?? null),
    };
  }

  async consume(
    userId: string,
    workspaceId: string,
    quantity: number,
    idempotencyKey: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    if (!Number.isInteger(quantity) || quantity <= 0)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Numărul de credite trebuie să fie pozitiv",
      );
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        await this.lock(transaction, workspaceId);
        const subscription = await transaction.workspaceSubscription.upsert({
          where: { workspaceId },
          create: { workspaceId, createdById: userId, updatedById: userId },
          update: {},
        });
        const account = await this.syncLocked(
          transaction,
          workspaceId,
          subscription,
        );
        const previous =
          await transaction.workspaceMessageCreditEntry.findFirst({
            where: {
              workspaceId,
              idempotencyKey: { startsWith: `${idempotencyKey}:` },
            },
          });
        if (previous)
          return {
            included: account.includedBalance,
            purchased: account.purchasedBalance,
            available: account.includedBalance + account.purchasedBalance,
            reused: true,
          };
        if (account.includedBalance + account.purchasedBalance < quantity)
          problem(
            "USAGE_LIMIT_REACHED",
            HttpStatus.CONFLICT,
            "Credite de mesagerie insuficiente",
            "Cumpără un pachet nou sau așteaptă reînnoirea creditelor incluse.",
          );

        const allocation = allocateMessageCreditConsumption(
          account.includedBalance,
          account.purchasedBalance,
          quantity,
        );
        const updated = await transaction.workspaceMessageCreditAccount.update({
          where: { id: account.id },
          data: {
            includedBalance: allocation.includedAfter,
            purchasedBalance: allocation.purchasedAfter,
            version: { increment: 1 },
          },
        });
        const entries: Prisma.WorkspaceMessageCreditEntryCreateManyInput[] = [];
        if (allocation.includedUsed > 0)
          entries.push({
            workspaceId,
            accountId: account.id,
            bucket: "INCLUDED",
            type: "CONSUMPTION",
            quantity: -allocation.includedUsed,
            balanceAfter: allocation.includedAfter,
            idempotencyKey: `${idempotencyKey}:included`,
            metadata,
          });
        if (allocation.purchasedUsed > 0)
          entries.push({
            workspaceId,
            accountId: account.id,
            bucket: "PURCHASED",
            type: "CONSUMPTION",
            quantity: -allocation.purchasedUsed,
            balanceAfter: allocation.purchasedAfter,
            idempotencyKey: `${idempotencyKey}:purchased`,
            metadata,
          });
        await transaction.workspaceMessageCreditEntry.createMany({
          data: entries,
        });
        return {
          included: updated.includedBalance,
          purchased: updated.purchasedBalance,
          available: updated.includedBalance + updated.purchasedBalance,
          reused: false,
        };
      },
    );
  }

  async grantPurchase(
    transaction: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      userId: string;
      quantity: number;
      providerTransactionId: string;
      packKey: string;
    },
  ) {
    await this.lock(transaction, input.workspaceId);
    const existing = await transaction.workspaceMessageCreditEntry.findFirst({
      where: { providerTransactionId: input.providerTransactionId },
    });
    if (existing) return { granted: false };
    const subscription = await transaction.workspaceSubscription.upsert({
      where: { workspaceId: input.workspaceId },
      create: {
        workspaceId: input.workspaceId,
        createdById: input.userId,
        updatedById: input.userId,
      },
      update: {},
    });
    const account = await this.syncLocked(
      transaction,
      input.workspaceId,
      subscription,
    );
    const nextBalance = account.purchasedBalance + input.quantity;
    await transaction.workspaceMessageCreditAccount.update({
      where: { id: account.id },
      data: { purchasedBalance: nextBalance, version: { increment: 1 } },
    });
    await transaction.workspaceMessageCreditEntry.create({
      data: {
        workspaceId: input.workspaceId,
        accountId: account.id,
        bucket: "PURCHASED",
        type: "PURCHASE",
        quantity: input.quantity,
        balanceAfter: nextBalance,
        idempotencyKey: `purchase:${input.providerTransactionId}`,
        providerTransactionId: input.providerTransactionId,
        metadata: { packKey: input.packKey },
      },
    });
    return { granted: true };
  }

  private async lock(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
  ) {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(
      hashtextextended(${`sarbato-message-credits:${workspaceId}`}, 0)
    )`;
  }

  private async syncLocked(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    subscription: SubscriptionState,
  ) {
    const planKey = effectiveWorkspacePlanKey(
      subscription.planKey,
      subscription.status,
    );
    const allowance = allowanceFor(planKey);
    const periodStart =
      planKey === "FREE" ? null : subscription.currentPeriodStart;
    const account = await transaction.workspaceMessageCreditAccount.findUnique({
      where: { workspaceId },
    });
    if (!account) {
      return transaction.workspaceMessageCreditAccount.create({
        data: {
          workspaceId,
          includedBalance: allowance,
          allowancePlanKey: planKey,
          allowancePeriodStart: periodStart,
          entries: {
            create: {
              workspaceId,
              bucket: "INCLUDED",
              type: "PLAN_GRANT",
              quantity: allowance,
              balanceAfter: allowance,
              idempotencyKey: allowanceKey(planKey, periodStart, "initial"),
              metadata: { planKey },
            },
          },
        },
      });
    }

    const planChanged = account.allowancePlanKey !== planKey;
    const periodChanged =
      planKey !== "FREE" &&
      account.allowancePeriodStart !== null &&
      periodStart !== null &&
      account.allowancePeriodStart.getTime() !== periodStart.getTime();
    if (planChanged || periodChanged) {
      const updated = await transaction.workspaceMessageCreditAccount.update({
        where: { id: account.id },
        data: {
          includedBalance: planKey === "FREE" ? 0 : allowance,
          allowancePlanKey: planKey,
          allowancePeriodStart: periodStart,
          version: { increment: 1 },
        },
      });
      const delta = updated.includedBalance - account.includedBalance;
      if (delta !== 0)
        await transaction.workspaceMessageCreditEntry.create({
          data: {
            workspaceId,
            accountId: account.id,
            bucket: "INCLUDED",
            type: delta > 0 ? "PLAN_GRANT" : "ADJUSTMENT",
            quantity: delta,
            balanceAfter: updated.includedBalance,
            idempotencyKey: allowanceKey(planKey, periodStart, "reset"),
            metadata: { planKey },
          },
        });
      return updated;
    }
    if (
      planKey !== "FREE" &&
      account.allowancePeriodStart === null &&
      periodStart !== null
    )
      return transaction.workspaceMessageCreditAccount.update({
        where: { id: account.id },
        data: { allowancePeriodStart: periodStart, version: { increment: 1 } },
      });
    return account;
  }
}

export function allowanceFor(planKey: WorkspaceSubscriptionPlanKey): number {
  return Number(workspacePlan(planKey).entitlements.MESSAGING_CREDITS ?? 0);
}

export function allocateMessageCreditConsumption(
  included: number,
  purchased: number,
  quantity: number,
) {
  const includedUsed = Math.min(included, quantity);
  const purchasedUsed = quantity - includedUsed;
  if (purchasedUsed > purchased)
    throw new Error("Insufficient message credits");
  return {
    includedUsed,
    purchasedUsed,
    includedAfter: included - includedUsed,
    purchasedAfter: purchased - purchasedUsed,
  };
}

function allowanceKey(
  planKey: WorkspaceSubscriptionPlanKey,
  periodStart: Date | null,
  reason: string,
) {
  return `allowance:${reason}:${planKey}:${periodStart?.toISOString() ?? "once"}`;
}
