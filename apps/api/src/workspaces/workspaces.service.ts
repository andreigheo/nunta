import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
} from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { createHash, randomUUID } from "node:crypto";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import {
  effectiveWorkspacePlanKey,
  resolvePlanCapabilities,
  workspacePlan,
} from "../workspace-billing/workspace-billing.catalog";
import { subscriptionResource } from "../workspace-billing/workspace-billing.service";
import { resolveCapabilities } from "./capability.guard";

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async list(userId: string) {
    const memberships = await this.database.withContext(
      { userId },
      (transaction) =>
        transaction.workspaceMembership.findMany({
          where: { userId, status: "ACTIVE", workspace: { deletedAt: null } },
          include: {
            workspace: {
              include: { weddingProfile: true, subscription: true },
            },
            roleTemplate: true,
            overrides: true,
          },
          orderBy: { workspace: { updatedAt: "desc" } },
        }),
    );
    return memberships.map((membership) => ({
      id: membership.workspace.id,
      title: membership.workspace.title,
      weddingDate: dateOnly(membership.workspace.weddingProfile?.weddingDate),
      location: membership.workspace.weddingProfile?.location ?? null,
      status: membership.workspace.status.toLowerCase() as
        "active" | "archived",
      role: membership.roleTemplate.key,
      capabilities: resolvePlanCapabilities(
        resolveCapabilities(
          membership.roleTemplate.capabilities,
          membership.overrides.map((override) => ({
            capability: override.capability,
            effect: override.effect,
          })),
        ),
        effectiveWorkspacePlanKey(
          membership.workspace.subscription?.planKey,
          membership.workspace.subscription?.status,
        ),
      ),
      imageUrl: membership.workspace.imageUrl,
      progress: null,
    }));
  }

  async create(
    userId: string,
    input: CreateWorkspaceRequest,
    idempotencyKey: string,
  ) {
    const requestHash = createHash("sha256")
      .update(stableJson(input))
      .digest("hex");
    const existing = await this.database.withContext(
      { userId },
      (transaction) =>
        transaction.idempotencyRecord.findUnique({
          where: {
            actorUserId_operation_key: {
              actorUserId: userId,
              operation: "workspace.create",
              key: idempotencyKey,
            },
          },
        }),
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        problem(
          "IDEMPOTENCY_CONFLICT",
          HttpStatus.CONFLICT,
          "Idempotency key conflict",
          "Cheia a fost deja folosită pentru o altă cerere.",
        );
      }
      return existing.responseBody as Prisma.JsonObject;
    }

    const workspaceId = randomUUID();
    const created = await this.database.withContext(
      { userId, workspaceId, bootstrapWorkspaceId: workspaceId },
      async (transaction) => {
        const ownerRole = await transaction.roleTemplate.findUnique({
          where: { key: "couple_owner" },
        });
        if (!ownerRole) {
          problem(
            "INTERNAL_ERROR",
            HttpStatus.INTERNAL_SERVER_ERROR,
            "Owner role missing",
          );
        }
        const workspace = await transaction.workspace.create({
          data: {
            id: workspaceId,
            title: input.title,
            locale: input.locale ?? "ro-RO",
            timezone: input.timezone ?? "Europe/Bucharest",
            currency: input.currency ?? "RON",
            createdById: userId,
            updatedById: userId,
          },
        });
        await transaction.workspaceMembership.create({
          data: {
            workspaceId,
            userId,
            roleTemplateId: ownerRole.id,
            createdById: userId,
            updatedById: userId,
          },
        });
        await transaction.workspaceSubscription.create({
          data: {
            workspaceId,
            createdById: userId,
            updatedById: userId,
          },
        });
        const weddingProfile = await transaction.weddingProfile.create({
          data: {
            workspaceId,
            partnerOneName: input.partnerOneName,
            partnerTwoName: input.partnerTwoName,
            weddingDate: input.weddingDate
              ? new Date(`${input.weddingDate}T00:00:00.000Z`)
              : undefined,
            location: input.location,
            createdById: userId,
            updatedById: userId,
          },
        });
        await transaction.userPreference.update({
          where: { userId },
          data: {
            lastActiveWorkspaceId: workspace.id,
            version: { increment: 1 },
          },
        });
        const response = {
          id: workspace.id,
          title: workspace.title,
          weddingDate: dateOnly(weddingProfile.weddingDate),
          location: weddingProfile.location,
          status: "active" as const,
          role: "couple_owner" as const,
          capabilities: ownerRole.capabilities,
          imageUrl: workspace.imageUrl,
          progress: null,
          version: workspace.version,
        };
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: userId,
            action: "workspace.created.v1",
            entityType: "workspace",
            entityId: workspaceId,
          },
        });
        await this.asyncEvents.record(transaction, {
          eventName: "workspace.created.v1",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          workspaceId,
          actorUserId: userId,
          idempotencyKey,
          deduplicationKey: `workspace-created:${workspaceId}`,
          payload: {
            subject: { workspaceId },
            notification: {
              recipientUserId: userId,
              kind: "workspace",
              title: "Spațiul nunții este pregătit",
              body: "Continuă onboardingul pentru a salva detaliile nunții.",
              actionUrl: "/onboarding",
            },
            activity: {
              category: "workspace",
              action: "created",
              summary: "Spațiul de lucru al nunții a fost creat.",
              entityType: "Workspace",
              entityId: workspaceId,
            },
          },
        });
        await transaction.idempotencyRecord.create({
          data: {
            workspaceId,
            actorUserId: userId,
            operation: "workspace.create",
            key: idempotencyKey,
            requestHash,
            responseStatus: 201,
            responseBody: response as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        return response;
      },
    );
    return created;
  }

  async bootstrap(userId: string, workspaceId: string) {
    const result = await this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const membership = await transaction.workspaceMembership.findFirst({
          where: { userId, workspaceId, status: "ACTIVE" },
          include: {
            workspace: {
              include: { weddingProfile: true, subscription: true },
            },
            roleTemplate: true,
            overrides: true,
          },
        });
        if (!membership)
          problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Workspace access denied");
        const unreadNotifications = await transaction.notification.count({
          where: { userId, readAt: null, dismissedAt: null },
        });
        return { membership, unreadNotifications };
      },
    );
    return {
      workspace: {
        id: result.membership.workspace.id,
        title: result.membership.workspace.title,
        status: result.membership.workspace.status.toLowerCase() as
          "active" | "archived",
        weddingDate: dateOnly(
          result.membership.workspace.weddingProfile?.weddingDate,
        ),
        timezone: result.membership.workspace.timezone,
        currency: result.membership.workspace.currency,
        version: result.membership.workspace.version,
      },
      membership: {
        id: result.membership.id,
        roleTemplate: result.membership.roleTemplate.key,
        capabilities: resolvePlanCapabilities(
          resolveCapabilities(
            result.membership.roleTemplate.capabilities,
            result.membership.overrides.map((override) => ({
              capability: override.capability,
              effect: override.effect,
            })),
          ),
          effectiveWorkspacePlanKey(
            result.membership.workspace.subscription?.planKey,
            result.membership.workspace.subscription?.status,
          ),
        ),
      },
      shell: {
        unreadNotifications: result.unreadNotifications,
        pendingAiProposals: 0,
        urgentTasks: 0,
        unansweredRsvp: 0,
        vendorReplies: 0,
        upcomingPayments: 0,
      },
      subscription: result.membership.workspace.subscription
        ? subscriptionResource(result.membership.workspace.subscription)
        : {
            plan: "FREE" as const,
            status: "FREE" as const,
            entitlements: workspacePlan("FREE").entitlements,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
          },
    };
  }

  async update(
    userId: string,
    workspaceId: string,
    input: UpdateWorkspaceRequest,
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const updated = await transaction.workspace.updateMany({
          where: { id: workspaceId, version: input.version, deletedAt: null },
          data: {
            title: input.title,
            locale: input.locale,
            timezone: input.timezone,
            currency: input.currency,
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Workspace version conflict",
          );
        }
        if (
          input.partnerOneName !== undefined ||
          input.partnerTwoName !== undefined ||
          input.weddingDate !== undefined ||
          input.location !== undefined
        ) {
          await transaction.weddingProfile.update({
            where: { workspaceId },
            data: {
              partnerOneName: input.partnerOneName,
              partnerTwoName: input.partnerTwoName,
              weddingDate:
                input.weddingDate === undefined
                  ? undefined
                  : input.weddingDate === null
                    ? null
                    : new Date(`${input.weddingDate}T00:00:00.000Z`),
              location: input.location,
              updatedById: userId,
              version: { increment: 1 },
            },
          });
        }
        const workspace = await transaction.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          include: { weddingProfile: true },
        });
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId: userId,
            action: "workspace.updated.v1",
            entityType: "workspace",
            entityId: workspaceId,
          },
        });
        await this.asyncEvents.record(transaction, {
          eventName: "workspace.updated.v1",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          workspaceId,
          actorUserId: userId,
          deduplicationKey: `workspace-updated:${workspaceId}:v${workspace.version}`,
          payload: {
            subject: { workspaceId, version: workspace.version },
            activity: {
              category: "workspace",
              action: "updated",
              summary: "Detaliile spațiului nunții au fost actualizate.",
              entityType: "Workspace",
              entityId: workspaceId,
            },
          },
        });
        return {
          id: workspace.id,
          title: workspace.title,
          weddingDate: dateOnly(workspace.weddingProfile?.weddingDate),
          location: workspace.weddingProfile?.location ?? null,
          timezone: workspace.timezone,
          currency: workspace.currency,
          version: workspace.version,
        };
      },
    );
  }
}

function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function stableJson(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return JSON.stringify(value);
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
  );
}
