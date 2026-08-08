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
  | "MAX_ACTIVE_AUTOMATIONS"
  | "STORAGE_BYTES";

@Injectable()
export class WorkspaceEntitlementService {
  async numeric(
    transaction: Transaction,
    workspaceId: string,
    key: NumericWorkspaceEntitlement,
  ): Promise<number> {
    const subscription = await transaction.workspaceSubscription.findUnique({
      where: { workspaceId },
      select: { planKey: true, status: true },
    });
    const planKey = effectiveWorkspacePlanKey(
      subscription?.planKey,
      subscription?.status,
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
}
