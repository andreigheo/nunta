import { HttpStatus, Injectable } from "@nestjs/common";
import type { Prisma } from "@weddingos/database";
import { problem } from "../common/problem";
import {
  effectiveWorkspacePlanKey,
  workspacePlan,
} from "./workspace-billing.catalog";

type Transaction = Prisma.TransactionClient;

export type NumericWorkspaceEntitlement =
  | "MAX_COLLABORATORS"
  | "MAX_GUESTS"
  | "AI_ACTIONS_MONTHLY"
  | "EMAIL_DELIVERIES_MONTHLY"
  | "MAX_ACTIVE_AUTOMATIONS"
  | "STORAGE_BYTES";

@Injectable()
export class WorkspaceEntitlementService {
  async lockCapacity(
    transaction: Transaction,
    workspaceId: string,
    key: NumericWorkspaceEntitlement,
  ) {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(
      hashtextextended(${`sarbato-workspace-quota:${workspaceId}:${key}`}, 0)
    )`;
  }

  async numeric(
    transaction: Transaction,
    workspaceId: string,
    key: NumericWorkspaceEntitlement,
  ): Promise<number> {
    const subscription = await transaction.workspaceSubscription.findUnique({
      where: { workspaceId },
      select: { planKey: true, status: true, gracePeriodEndAt: true },
    });
    const planKey = effectiveWorkspacePlanKey(
      subscription?.planKey,
      subscription?.status,
      subscription?.gracePeriodEndAt,
    );
    const value = workspacePlan(planKey).entitlements[key];
    if (typeof value !== "number")
      throw new Error(`Numeric workspace entitlement missing: ${key}`);
    return value;
  }

  async assertCapacity(
    transaction: Transaction,
    workspaceId: string,
    key: NumericWorkspaceEntitlement,
    current: number,
    increment = 1,
  ) {
    const limit = await this.numeric(transaction, workspaceId, key);
    if (current + increment > limit)
      problem(
        "USAGE_LIMIT_REACHED",
        HttpStatus.CONFLICT,
        "Limita planului a fost atinsă",
        `Planul curent permite maximum ${limit}. Poți schimba planul din Setări → Abonament.`,
      );
  }

  async reserveEmailDeliveries(
    transaction: Transaction,
    workspaceId: string,
    sourceIds: string[],
    at: Date,
  ) {
    const uniqueSourceIds = [...new Set(sourceIds)];
    if (!uniqueSourceIds.length) return { reserved: 0, limit: 0, used: 0 };
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(
      hashtextextended(${`sarbato-email-quota:${workspaceId}`}, 0)
    )`;
    const limit = await this.numeric(
      transaction,
      workspaceId,
      "EMAIL_DELIVERIES_MONTHLY",
    );
    const periodStart = utcMonthStart(at);
    const period = await transaction.workspaceUsagePeriod.upsert({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId,
          metric: "EMAIL_DELIVERIES_MONTHLY",
          periodStart,
        },
      },
      create: { workspaceId, metric: "EMAIL_DELIVERIES_MONTHLY", periodStart },
      update: {},
    });
    const existing = await transaction.workspaceUsageReservation.findMany({
      where: {
        workspaceId,
        metric: "EMAIL_DELIVERIES_MONTHLY",
        sourceType: "campaign_recipient",
        sourceId: { in: uniqueSourceIds },
      },
    });
    const existingBySource = new Map(
      existing.map((item) => [item.sourceId, item]),
    );
    const toReserve = uniqueSourceIds.filter((sourceId) => {
      const reservation = existingBySource.get(sourceId);
      return !reservation || reservation.status === "RELEASED";
    });
    const used = period.reserved + period.consumed;
    if (used + toReserve.length > limit)
      problem(
        "USAGE_LIMIT_REACHED",
        HttpStatus.CONFLICT,
        "Limita lunară de e-mailuri a fost atinsă",
        `Planul curent permite ${limit.toLocaleString("ro-RO")} livrări comerciale pe lună. Mai sunt disponibile ${Math.max(0, limit - used).toLocaleString("ro-RO")}.`,
      );
    for (const sourceId of toReserve) {
      const reservation = existingBySource.get(sourceId);
      if (reservation) {
        await transaction.workspaceUsageReservation.update({
          where: { id: reservation.id },
          data: {
            periodId: period.id,
            status: "RESERVED",
            consumedAt: null,
            releasedAt: null,
          },
        });
      } else {
        await transaction.workspaceUsageReservation.create({
          data: {
            workspaceId,
            periodId: period.id,
            metric: "EMAIL_DELIVERIES_MONTHLY",
            sourceType: "campaign_recipient",
            sourceId,
          },
        });
      }
    }
    if (toReserve.length)
      await transaction.workspaceUsagePeriod.update({
        where: { id: period.id },
        data: {
          reserved: { increment: toReserve.length },
          version: { increment: 1 },
        },
      });
    return {
      reserved: toReserve.length,
      limit,
      used: used + toReserve.length,
    };
  }

  async releaseEmailDeliveries(
    transaction: Transaction,
    workspaceId: string,
    sourceIds: string[],
  ) {
    if (!sourceIds.length) return;
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(
      hashtextextended(${`sarbato-email-quota:${workspaceId}`}, 0)
    )`;
    const reservations = await transaction.workspaceUsageReservation.findMany({
      where: {
        workspaceId,
        metric: "EMAIL_DELIVERIES_MONTHLY",
        sourceType: "campaign_recipient",
        sourceId: { in: [...new Set(sourceIds)] },
        status: "RESERVED",
      },
    });
    const byPeriod = new Map<string, string[]>();
    for (const item of reservations)
      byPeriod.set(item.periodId, [
        ...(byPeriod.get(item.periodId) ?? []),
        item.id,
      ]);
    for (const [periodId, ids] of byPeriod) {
      await transaction.workspaceUsageReservation.updateMany({
        where: { id: { in: ids }, status: "RESERVED" },
        data: { status: "RELEASED", releasedAt: new Date() },
      });
      await transaction.workspaceUsagePeriod.update({
        where: { id: periodId },
        data: {
          reserved: { decrement: ids.length },
          version: { increment: 1 },
        },
      });
    }
  }
}

function utcMonthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}
