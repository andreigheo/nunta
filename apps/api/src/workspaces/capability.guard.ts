import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  capabilityKeySchema,
  nonDelegableCapabilityKeys,
  type CapabilityKey,
} from "@weddingos/contracts";
import { DatabaseService } from "../common/database.service";
import type { WeddingOsRequest } from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid } from "../common/validation";
import {
  capabilityAllowedByWorkspacePlan,
  effectiveWorkspacePlanKey,
  minimumPlanForCapability,
  resolvePlanCapabilities,
  workspacePlan,
} from "../workspace-billing/workspace-billing.catalog";
import { REQUIRED_CAPABILITY } from "./capability.decorator";

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<CapabilityKey>(
      REQUIRED_CAPABILITY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    if (!request.auth) {
      problem(
        "UNAUTHENTICATED",
        HttpStatus.UNAUTHORIZED,
        "Authentication required",
      );
    }
    const workspaceParameter = request.params.workspaceId;
    const workspaceId = parseUuid(
      Array.isArray(workspaceParameter)
        ? (workspaceParameter[0] ?? "")
        : (workspaceParameter ?? ""),
      "workspaceId",
    );
    const membership = await this.database.withContext(
      { userId: request.auth.userId, workspaceId },
      (transaction) =>
        transaction.workspaceMembership.findFirst({
          where: {
            workspaceId,
            userId: request.auth!.userId,
            status: "ACTIVE",
          },
          include: {
            roleTemplate: true,
            overrides: true,
            workspace: { include: { subscription: true } },
          },
        }),
    );
    if (!membership) {
      problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Workspace access denied");
    }
    if (membership.workspace.status === "ARCHIVED") {
      problem("WORKSPACE_ARCHIVED", HttpStatus.LOCKED, "Workspace archived");
    }

    const roleCapabilities = resolveCapabilities(
      membership.roleTemplate.capabilities,
      membership.overrides.map((override) => ({
        capability: override.capability,
        effect: override.effect,
      })),
    );
    if (!roleCapabilities.includes(required)) {
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Capability required",
        `Este necesară capabilitatea ${required}.`,
        undefined,
        { requiredCapability: required },
      );
    }
    const effectivePlan = effectiveWorkspacePlanKey(
      membership.workspace.subscription?.planKey,
      membership.workspace.subscription?.status,
      membership.workspace.subscription?.gracePeriodEndAt,
    );
    if (!capabilityAllowedByWorkspacePlan(required, effectivePlan)) {
      const minimumPlan = minimumPlanForCapability(required);
      problem(
        "PLAN_UPGRADE_REQUIRED",
        HttpStatus.PAYMENT_REQUIRED,
        "Funcția nu este inclusă în planul curent",
        minimumPlan
          ? `Acțiunea necesită planul ${workspacePlan(minimumPlan).name}. Datele existente rămân disponibile pentru citire.`
          : "Această acțiune nu este disponibilă prin abonamentele Sarbato.",
        undefined,
        { requiredCapability: required },
      );
    }
    const capabilities = resolvePlanCapabilities(
      roleCapabilities,
      effectivePlan,
    );
    request.membership = {
      membershipId: membership.id,
      workspaceId,
      roleTemplate: membership.roleTemplate.key,
      capabilities,
      version: membership.version,
    };
    return true;
  }
}

export function resolveCapabilities(
  roleCapabilities: unknown,
  overrides: Array<{ capability: string; effect: "ALLOW" | "DENY" }>,
): CapabilityKey[] {
  const effective = new Set<CapabilityKey>();
  if (Array.isArray(roleCapabilities)) {
    for (const candidate of roleCapabilities) {
      const parsed = capabilityKeySchema.safeParse(candidate);
      if (parsed.success) effective.add(parsed.data);
    }
  }
  for (const override of overrides) {
    const parsed = capabilityKeySchema.safeParse(override.capability);
    if (!parsed.success) continue;
    if (
      nonDelegableCapabilityKeys.includes(
        parsed.data as (typeof nonDelegableCapabilityKeys)[number],
      )
    )
      continue;
    if (override.effect === "ALLOW") effective.add(parsed.data);
    else effective.delete(parsed.data);
  }
  return [...effective].sort();
}
