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
              include: { subscription: true },
            },
            roleTemplate: true,
            overrides: true,
          },
          orderBy: { workspace: { updatedAt: "desc" } },
        }),
    );
    // Listing workspaces intentionally runs without a selected workspace. The
    // The legacy wedding_profiles RLS policy, however, is scoped to
    // app.current_workspace_id, so an included relation is empty here even for
    // a legitimate member. Resolve each lightweight profile inside its own
    // workspace context so the switcher receives the real date and location.
    const profiles = new Map(
      await Promise.all(
        memberships.map(
          async (membership) =>
            [
              membership.workspaceId,
              await this.database.withContext(
                { userId, workspaceId: membership.workspaceId },
                (transaction) =>
                  transaction.eventProfile.findUnique({
                    where: { workspaceId: membership.workspaceId },
                    select: {
                      eventType: true,
                      organizerName: true,
                      eventDate: true,
                      location: true,
                    },
                  }),
              ),
            ] as const,
        ),
      ),
    );
    return memberships.map((membership) => {
      const profile = profiles.get(membership.workspaceId);
      return {
        id: membership.workspace.id,
        title: membership.workspace.title,
        eventType: eventType(profile?.eventType),
        eventDate: dateOnly(profile?.eventDate),
        organizerName: profile?.organizerName ?? null,
        weddingDate: dateOnly(profile?.eventDate),
        location: profile?.location ?? null,
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
      };
    });
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
        const eventProfile = await transaction.eventProfile.create({
          data: {
            workspaceId,
            eventType: input.eventType ?? "wedding",
            organizerName: input.organizerName,
            partnerOneName: input.partnerOneName,
            partnerTwoName: input.partnerTwoName,
            eventDate:
              (input.eventDate ?? input.weddingDate)
                ? new Date(
                    `${input.eventDate ?? input.weddingDate}T00:00:00.000Z`,
                  )
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
          eventType: eventType(eventProfile.eventType),
          eventDate: dateOnly(eventProfile.eventDate),
          organizerName: eventProfile.organizerName,
          weddingDate: dateOnly(eventProfile.eventDate),
          location: eventProfile.location,
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
              title: "Spațiul evenimentului este pregătit",
              body: "Continuă onboardingul pentru a salva detaliile evenimentului.",
              actionUrl: "/onboarding",
            },
            activity: {
              category: "workspace",
              action: "created",
              summary: "Spațiul de lucru al evenimentului a fost creat.",
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
              include: { eventProfile: true, subscription: true },
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
        eventType: eventType(
          result.membership.workspace.eventProfile?.eventType,
        ),
        eventDate: dateOnly(
          result.membership.workspace.eventProfile?.eventDate,
        ),
        weddingDate: dateOnly(
          result.membership.workspace.eventProfile?.eventDate,
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
          input.eventType !== undefined ||
          input.eventDate !== undefined ||
          input.organizerName !== undefined ||
          input.weddingDate !== undefined ||
          input.location !== undefined
        ) {
          await transaction.eventProfile.update({
            where: { workspaceId },
            data: {
              eventType: input.eventType,
              organizerName: input.organizerName,
              partnerOneName: input.partnerOneName,
              partnerTwoName: input.partnerTwoName,
              eventDate:
                input.eventDate === undefined && input.weddingDate === undefined
                  ? undefined
                  : (input.eventDate ?? input.weddingDate) === null
                    ? null
                    : new Date(
                        `${input.eventDate ?? input.weddingDate}T00:00:00.000Z`,
                      ),
              location: input.location,
              updatedById: userId,
              version: { increment: 1 },
            },
          });
        }
        const workspace = await transaction.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          include: { eventProfile: true },
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
              summary: "Detaliile spațiului evenimentului au fost actualizate.",
              entityType: "Workspace",
              entityId: workspaceId,
            },
          },
        });
        return {
          id: workspace.id,
          title: workspace.title,
          eventType: eventType(workspace.eventProfile?.eventType),
          eventDate: dateOnly(workspace.eventProfile?.eventDate),
          organizerName: workspace.eventProfile?.organizerName ?? null,
          weddingDate: dateOnly(workspace.eventProfile?.eventDate),
          location: workspace.eventProfile?.location ?? null,
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

function eventType(value: string | null | undefined) {
  return (value ?? "wedding") as
    | "wedding"
    | "baptism"
    | "birthday"
    | "corporate"
    | "conference"
    | "anniversary"
    | "private_party"
    | "festival"
    | "fundraiser"
    | "other";
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
