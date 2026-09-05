import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  CapabilityOverrideInput,
  CreateTeamInvitationRequest,
  UpdateMemberRequest,
} from "@weddingos/contracts";
import { nonDelegableCapabilityKeys } from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { AuditService } from "../audit/audit.service";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { createOpaqueToken, hashSecret } from "../auth/auth.crypto";
import { resolveCapabilities } from "../workspaces/capability.guard";
import {
  effectiveWorkspacePlanKey,
  resolvePlanCapabilities,
} from "../workspace-billing/workspace-billing.catalog";
import { WorkspaceEntitlementService } from "../workspace-billing/workspace-entitlement.service";
import { assertPendingInvitation } from "./invitation-state";

@Injectable()
export class TeamService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(WorkspaceEntitlementService)
    private readonly entitlements: WorkspaceEntitlementService,
  ) {}

  async list(userId: string, workspaceId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const [memberships, invitations, subscription] = await Promise.all([
          transaction.workspaceMembership.findMany({
            where: { workspaceId, status: "ACTIVE" },
            include: {
              user: {
                include: {
                  profile: true,
                  sessions: { orderBy: { lastSeenAt: "desc" }, take: 1 },
                },
              },
              roleTemplate: true,
              overrides: true,
            },
            orderBy: { createdAt: "asc" },
          }),
          transaction.teamInvitation.findMany({
            where: { workspaceId, status: "PENDING" },
            include: { workspace: true, roleTemplate: true },
            orderBy: { createdAt: "desc" },
          }),
          transaction.workspaceSubscription.findUnique({
            where: { workspaceId },
            select: { planKey: true, status: true, gracePeriodEndAt: true },
          }),
        ]);
        const effectivePlan = effectiveWorkspacePlanKey(
          subscription?.planKey,
          subscription?.status,
          subscription?.gracePeriodEndAt,
        );
        const inviterProfiles = await this.database.userProfile.findMany({
          where: {
            userId: {
              in: invitations.map((invitation) => invitation.invitedById),
            },
          },
        });
        const profileByUser = new Map(
          inviterProfiles.map((profile) => [profile.userId, profile]),
        );
        return {
          members: memberships.map((membership) => ({
            id: membership.id,
            userId: membership.userId,
            name: [
              membership.user.profile?.firstName,
              membership.user.profile?.lastName,
            ]
              .filter(Boolean)
              .join(" "),
            email: membership.user.email,
            role: membership.roleTemplate.key,
            status: "active" as const,
            capabilities: resolvePlanCapabilities(
              resolveCapabilities(
                membership.roleTemplate.capabilities,
                membership.overrides.map((override) => ({
                  capability: override.capability,
                  effect: override.effect,
                })),
              ),
              effectivePlan,
            ),
            lastActiveAt:
              membership.user.sessions[0]?.lastSeenAt.toISOString() ?? null,
            version: membership.version,
          })),
          invitations: invitations.map((invitation) =>
            this.invitationSummary(
              invitation,
              profileByUser.get(invitation.invitedById),
            ),
          ),
        };
      },
    );
  }

  async invite(
    actorUserId: string,
    workspaceId: string,
    input: CreateTeamInvitationRequest,
    requestId: string,
    correlationId: string,
  ) {
    assertNoReservedOverrides(input.capabilityOverrides);
    const email = input.email.trim().toLowerCase();
    const token = createOpaqueToken();
    const created = await this.database.withContext(
      { userId: actorUserId, workspaceId },
      async (transaction) => {
        const [workspace, role, actor, existingUser] = await Promise.all([
          transaction.workspace.findUnique({ where: { id: workspaceId } }),
          transaction.roleTemplate.findUnique({
            where: { key: input.roleTemplate },
          }),
          transaction.user.findUnique({
            where: { id: actorUserId },
            include: { profile: true },
          }),
          transaction.user.findUnique({ where: { email } }),
        ]);
        if (!workspace || !role || !actor)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Resource not found");
        if (existingUser) {
          const membership = await transaction.workspaceMembership.findUnique({
            where: {
              workspaceId_userId: { workspaceId, userId: existingUser.id },
            },
          });
          if (membership?.status === "ACTIVE") {
            problem(
              "VERSION_CONFLICT",
              HttpStatus.CONFLICT,
              "User already belongs to workspace",
            );
          }
        }
        const pending = await transaction.teamInvitation.findFirst({
          where: {
            workspaceId,
            email,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
        });
        if (pending)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Invitation already pending",
          );
        await this.entitlements.lockCapacity(
          transaction,
          workspaceId,
          "MAX_COLLABORATORS",
        );
        const [activeCollaborators, pendingInvitations] = await Promise.all([
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
        ]);
        await this.entitlements.assertCapacity(
          transaction,
          workspaceId,
          "MAX_COLLABORATORS",
          activeCollaborators + pendingInvitations,
        );
        const invitation = await transaction.teamInvitation.create({
          data: {
            workspaceId,
            email,
            roleTemplateId: role.id,
            tokenHash: hashSecret(token),
            capabilityOverrides:
              input.capabilityOverrides as Prisma.InputJsonValue,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            invitedById: actorUserId,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
          include: { workspace: true, roleTemplate: true },
        });
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId,
            action: "membership.invited.v1",
            entityType: "team_invitation",
            entityId: invitation.id,
            requestId,
            correlationId,
            metadata: { targetEmailDomain: email.split("@")[1] ?? "" },
          },
        });
        const inviterName = [actor.profile?.firstName, actor.profile?.lastName]
          .filter(Boolean)
          .join(" ");
        await this.asyncEvents.record(transaction, {
          eventName: "membership.invited.v1",
          aggregateType: "TeamInvitation",
          aggregateId: invitation.id,
          workspaceId,
          actorUserId,
          correlationId,
          deduplicationKey: `membership-invited:${invitation.id}:v${invitation.version}`,
          payload: {
            subject: { invitationId: invitation.id },
            notification: {
              recipientUserId: actorUserId,
              module: "system",
              kind: "team",
              title: "Invitație de echipă livrată",
              body: `Invitația către domeniul ${email.split("@")[1] ?? "necunoscut"} a fost procesată.`,
              actionUrl: "/team",
            },
            activity: {
              category: "team",
              action: "invited",
              summary: `A fost trimisă o invitație către domeniul ${email.split("@")[1] ?? "necunoscut"}.`,
              actorName: inviterName,
              entityType: "TeamInvitation",
              entityId: invitation.id,
            },
          },
          email: {
            kind: "team-invitation",
            recipient: email,
            values: {
              inviterName,
              workspaceTitle: invitation.workspace.title,
              roleName: invitation.roleTemplate.name,
              token,
            },
          },
        });
        return { invitation, actor };
      },
    );
    return this.invitationSummary(
      created.invitation,
      created.actor.profile ?? undefined,
    );
  }

  async publicInvitation(rawToken: string) {
    const tokenHash = hashSecret(rawToken);
    const invitation = await this.database.withContext(
      { invitationTokenHash: tokenHash },
      (transaction) =>
        transaction.teamInvitation.findUnique({
          where: { tokenHash },
          include: { roleTemplate: true },
        }),
    );
    if (!invitation)
      problem("TOKEN_INVALID", HttpStatus.NOT_FOUND, "Invitation not found");
    assertPendingInvitation(invitation);
    const workspace = await this.database.withContext(
      { invitationTokenHash: tokenHash },
      (transaction) =>
        transaction.workspace.findUnique({
          where: { id: invitation.workspaceId },
          include: { eventProfile: true },
        }),
    );
    if (!workspace)
      problem(
        "TOKEN_INVALID",
        HttpStatus.NOT_FOUND,
        "Invitation workspace not found",
      );
    const inviter = await this.database.userProfile.findUnique({
      where: { userId: invitation.invitedById },
    });
    return {
      ...this.invitationSummary(
        { ...invitation, workspace },
        inviter ?? undefined,
      ),
      eventDate: workspace.eventProfile?.eventDate
        ? workspace.eventProfile.eventDate.toISOString().slice(0, 10)
        : null,
      weddingDate: workspace.eventProfile?.eventDate
        ? workspace.eventProfile.eventDate.toISOString().slice(0, 10)
        : null,
    };
  }

  async accept(
    userId: string,
    userEmail: string,
    rawToken: string,
    requestId: string,
    correlationId: string,
  ) {
    const tokenHash = hashSecret(rawToken);
    return this.database.withContext(
      { userId, invitationTokenHash: tokenHash },
      async (transaction) => {
        const invitation = await transaction.teamInvitation.findUnique({
          where: { tokenHash },
          include: { roleTemplate: true },
        });
        if (!invitation)
          problem(
            "TOKEN_INVALID",
            HttpStatus.NOT_FOUND,
            "Invitation not found",
          );
        assertPendingInvitation(invitation);
        if (invitation.email !== userEmail.trim().toLowerCase()) {
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Invitation belongs to another email",
          );
        }
        await transaction.$executeRaw`
          SELECT set_config('app.current_workspace_id', ${invitation.workspaceId}, true)
        `;
        const membership = await transaction.workspaceMembership.upsert({
          where: {
            workspaceId_userId: { workspaceId: invitation.workspaceId, userId },
          },
          update: {
            status: "ACTIVE",
            removedAt: null,
            roleTemplateId: invitation.roleTemplateId,
            updatedById: userId,
            version: { increment: 1 },
          },
          create: {
            workspaceId: invitation.workspaceId,
            userId,
            roleTemplateId: invitation.roleTemplateId,
            createdById: invitation.invitedById,
            updatedById: userId,
          },
        });
        await transaction.membershipCapabilityOverride.deleteMany({
          where: { membershipId: membership.id },
        });
        const overrides = parseOverrides(invitation.capabilityOverrides);
        if (overrides.length) {
          await transaction.membershipCapabilityOverride.createMany({
            data: overrides.map((override) => ({
              workspaceId: invitation.workspaceId,
              membershipId: membership.id,
              capability: override.capability,
              effect: override.effect === "allow" ? "ALLOW" : "DENY",
              createdById: invitation.invitedById,
              updatedById: userId,
            })),
          });
        }
        const consumed = await transaction.teamInvitation.updateMany({
          where: {
            id: invitation.id,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
          data: {
            status: "ACCEPTED",
            acceptedAt: new Date(),
            acceptedById: userId,
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        if (consumed.count !== 1)
          problem(
            "TOKEN_INVALID",
            HttpStatus.CONFLICT,
            "Invitation already used",
          );
        await transaction.userPreference.update({
          where: { userId },
          data: {
            lastActiveWorkspaceId: invitation.workspaceId,
            version: { increment: 1 },
          },
        });
        await transaction.auditEvent.create({
          data: {
            workspaceId: invitation.workspaceId,
            actorUserId: userId,
            action: "membership.invitation_accepted.v1",
            entityType: "workspace_membership",
            entityId: membership.id,
            requestId,
            correlationId,
          },
        });
        return {
          workspaceId: invitation.workspaceId,
          membershipId: membership.id,
        };
      },
    );
  }

  async decline(
    userId: string,
    userEmail: string,
    rawToken: string,
    requestId: string,
    correlationId: string,
  ) {
    const tokenHash = hashSecret(rawToken);
    return this.database.withContext(
      { userId, invitationTokenHash: tokenHash },
      async (transaction) => {
        const invitation = await transaction.teamInvitation.findUnique({
          where: { tokenHash },
        });
        if (!invitation)
          problem(
            "TOKEN_INVALID",
            HttpStatus.NOT_FOUND,
            "Invitation not found",
          );
        assertPendingInvitation(invitation);
        if (invitation.email !== userEmail.trim().toLowerCase()) {
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Invitation belongs to another email",
          );
        }
        await transaction.$executeRaw`
          SELECT set_config('app.current_workspace_id', ${invitation.workspaceId}, true)
        `;
        await transaction.auditEvent.create({
          data: {
            workspaceId: invitation.workspaceId,
            actorUserId: userId,
            action: "membership.invitation_declined.v1",
            entityType: "team_invitation",
            entityId: invitation.id,
            requestId,
            correlationId,
          },
        });
        await transaction.teamInvitation.update({
          where: { id: invitation.id },
          data: {
            status: "DECLINED",
            declinedAt: new Date(),
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        return { declined: true as const };
      },
    );
  }

  async resend(
    actorUserId: string,
    workspaceId: string,
    invitationId: string,
    requestId: string,
    correlationId: string,
  ) {
    const token = createOpaqueToken();
    const result = await this.database.withContext(
      { userId: actorUserId, workspaceId },
      async (transaction) => {
        const invitation = await transaction.teamInvitation.findFirst({
          where: { id: invitationId, workspaceId },
          include: { workspace: true, roleTemplate: true },
        });
        if (!invitation)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found");
        if (invitation.status !== "PENDING") {
          problem(
            "INVITATION_REVOKED",
            HttpStatus.GONE,
            "Invitation is not pending",
          );
        }
        const actor = await transaction.user.findUniqueOrThrow({
          where: { id: actorUserId },
          include: { profile: true },
        });
        const updated = await transaction.teamInvitation.update({
          where: { id: invitation.id },
          data: {
            tokenHash: hashSecret(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            lastSentAt: new Date(),
            updatedById: actorUserId,
            version: { increment: 1 },
          },
          include: { workspace: true, roleTemplate: true },
        });
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId,
            action: "membership.invitation_resent.v1",
            entityType: "team_invitation",
            entityId: invitation.id,
            requestId,
            correlationId,
          },
        });
        const inviterName = [actor.profile?.firstName, actor.profile?.lastName]
          .filter(Boolean)
          .join(" ");
        await this.asyncEvents.record(transaction, {
          eventName: "membership.invitation_resent.v1",
          aggregateType: "TeamInvitation",
          aggregateId: updated.id,
          workspaceId,
          actorUserId,
          correlationId,
          deduplicationKey: `membership-invitation-resent:${updated.id}:v${updated.version}`,
          payload: {
            subject: { invitationId: updated.id },
            notification: {
              recipientUserId: actorUserId,
              module: "system",
              kind: "team",
              title: "Invitație retrimisă",
              body: "Invitația de echipă a fost procesată din nou.",
              actionUrl: "/team",
            },
            activity: {
              category: "team",
              action: "invitation_resent",
              summary: "Invitația de echipă a fost retrimisă.",
              actorName: inviterName,
              entityType: "TeamInvitation",
              entityId: updated.id,
            },
          },
          email: {
            kind: "team-invitation",
            recipient: updated.email,
            values: {
              inviterName,
              workspaceTitle: updated.workspace.title,
              roleName: updated.roleTemplate.name,
              token,
            },
          },
        });
        return { invitation: updated, actor };
      },
    );
    return this.invitationSummary(
      result.invitation,
      result.actor.profile ?? undefined,
    );
  }

  async revokeInvitation(
    actorUserId: string,
    workspaceId: string,
    invitationId: string,
    requestId: string,
    correlationId: string,
  ) {
    await this.database.withContext(
      { userId: actorUserId, workspaceId },
      async (transaction) => {
        const result = await transaction.teamInvitation.updateMany({
          where: { id: invitationId, workspaceId, status: "PENDING" },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            updatedById: actorUserId,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found");
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId,
            action: "membership.invitation_revoked.v1",
            entityType: "team_invitation",
            entityId: invitationId,
            requestId,
            correlationId,
          },
        });
      },
    );
  }

  async updateMember(
    actorUserId: string,
    workspaceId: string,
    memberId: string,
    input: UpdateMemberRequest,
    requestId: string,
    correlationId: string,
  ) {
    assertNoReservedOverrides(input.capabilityOverrides);
    return this.database.withContext(
      { userId: actorUserId, workspaceId },
      async (transaction) => {
        const target = await transaction.workspaceMembership.findFirst({
          where: { id: memberId, workspaceId, status: "ACTIVE" },
          include: { roleTemplate: true },
        });
        if (!target)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Member not found");
        if (target.version !== input.version) {
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Member version conflict",
          );
        }
        const nextRole = input.roleTemplate
          ? await transaction.roleTemplate.findUnique({
              where: { key: input.roleTemplate },
            })
          : target.roleTemplate;
        if (!nextRole)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Role template not found");
        if (
          target.roleTemplate.key === "couple_owner" &&
          nextRole.key !== "couple_owner"
        ) {
          if (target.userId === actorUserId) {
            problem(
              "LAST_OWNER_PROTECTED",
              HttpStatus.CONFLICT,
              "Ownership transfer required",
              "Proprietarul nu își poate reduce propriul rol fără transfer explicit.",
            );
          }
          await this.assertAnotherOwner(transaction, workspaceId, target.id);
        }
        const updated = await transaction.workspaceMembership.update({
          where: { id: target.id },
          data: {
            roleTemplateId: nextRole.id,
            updatedById: actorUserId,
            version: { increment: 1 },
          },
          include: {
            user: { include: { profile: true } },
            roleTemplate: true,
            overrides: true,
          },
        });
        if (input.capabilityOverrides) {
          await transaction.membershipCapabilityOverride.deleteMany({
            where: { membershipId: target.id },
          });
          if (input.capabilityOverrides.length) {
            await transaction.membershipCapabilityOverride.createMany({
              data: input.capabilityOverrides.map((override) => ({
                workspaceId,
                membershipId: target.id,
                capability: override.capability,
                effect: override.effect === "allow" ? "ALLOW" : "DENY",
                createdById: actorUserId,
                updatedById: actorUserId,
              })),
            });
          }
        }
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId,
            action: "membership.role_changed.v1",
            entityType: "workspace_membership",
            entityId: target.id,
            requestId,
            correlationId,
          },
        });
        const [refreshed, subscription] = await Promise.all([
          transaction.workspaceMembership.findUniqueOrThrow({
            where: { id: updated.id },
            include: {
              user: { include: { profile: true } },
              roleTemplate: true,
              overrides: true,
            },
          }),
          transaction.workspaceSubscription.findUnique({
            where: { workspaceId },
            select: { planKey: true, status: true, gracePeriodEndAt: true },
          }),
        ]);
        return {
          id: refreshed.id,
          userId: refreshed.userId,
          name: [
            refreshed.user.profile?.firstName,
            refreshed.user.profile?.lastName,
          ]
            .filter(Boolean)
            .join(" "),
          email: refreshed.user.email,
          role: refreshed.roleTemplate.key,
          status: "active" as const,
          capabilities: resolvePlanCapabilities(
            resolveCapabilities(
              refreshed.roleTemplate.capabilities,
              refreshed.overrides.map((override) => ({
                capability: override.capability,
                effect: override.effect,
              })),
            ),
            effectiveWorkspacePlanKey(
              subscription?.planKey,
              subscription?.status,
              subscription?.gracePeriodEndAt,
            ),
          ),
          lastActiveAt: null,
          version: refreshed.version,
        };
      },
    );
  }

  async removeMember(
    actorUserId: string,
    workspaceId: string,
    memberId: string,
    requestId: string,
    correlationId: string,
  ) {
    await this.database.withContext(
      { userId: actorUserId, workspaceId },
      async (transaction) => {
        const target = await transaction.workspaceMembership.findFirst({
          where: { id: memberId, workspaceId, status: "ACTIVE" },
          include: { roleTemplate: true },
        });
        if (!target)
          problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Member not found");
        if (target.userId === actorUserId) {
          problem(
            "LAST_OWNER_PROTECTED",
            HttpStatus.CONFLICT,
            "Self-removal requires ownership transfer",
          );
        }
        if (target.roleTemplate.key === "couple_owner") {
          await this.assertAnotherOwner(transaction, workspaceId, target.id);
        }
        await transaction.workspaceMembership.update({
          where: { id: target.id },
          data: {
            status: "REMOVED",
            removedAt: new Date(),
            updatedById: actorUserId,
            version: { increment: 1 },
          },
        });
        await transaction.auditEvent.create({
          data: {
            workspaceId,
            actorUserId,
            action: "membership.removed.v1",
            entityType: "workspace_membership",
            entityId: target.id,
            requestId,
            correlationId,
          },
        });
      },
    );
  }

  private async assertAnotherOwner(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    excludedMembershipId: string,
  ) {
    const ownerRole = await transaction.roleTemplate.findUnique({
      where: { key: "couple_owner" },
    });
    if (!ownerRole)
      problem(
        "INTERNAL_ERROR",
        HttpStatus.INTERNAL_SERVER_ERROR,
        "Owner role missing",
      );
    const otherOwners = await transaction.workspaceMembership.count({
      where: {
        workspaceId,
        id: { not: excludedMembershipId },
        status: "ACTIVE",
        roleTemplateId: ownerRole.id,
      },
    });
    if (otherOwners < 1) {
      problem(
        "LAST_OWNER_PROTECTED",
        HttpStatus.CONFLICT,
        "Last owner protected",
        "Spațiul trebuie să păstreze cel puțin un proprietar activ.",
      );
    }
  }

  private invitationSummary(
    invitation: {
      id: string;
      workspaceId: string;
      email: string;
      status: string;
      expiresAt: Date;
      version: number;
      invitedById: string;
      workspace: { title: string };
      roleTemplate: { key: string };
    },
    inviter?: { firstName: string; lastName: string },
  ) {
    return {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      workspaceTitle: invitation.workspace.title,
      email: invitation.email,
      role: invitation.roleTemplate.key,
      status:
        invitation.status === "PENDING" && invitation.expiresAt <= new Date()
          ? ("expired" as const)
          : (invitation.status.toLowerCase() as
              "pending" | "accepted" | "declined" | "revoked"),
      expiresAt: invitation.expiresAt.toISOString(),
      invitedByName: inviter
        ? `${inviter.firstName} ${inviter.lastName}`.trim()
        : "Sarbato",
      version: invitation.version,
    };
  }
}

function parseOverrides(value: Prisma.JsonValue): CapabilityOverrideInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return [];
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.capability !== "string" ||
      !["allow", "deny"].includes(String(item.effect)) ||
      nonDelegableCapabilityKeys.includes(
        item.capability as (typeof nonDelegableCapabilityKeys)[number],
      )
    )
      return [];
    return [
      { capability: item.capability, effect: item.effect as "allow" | "deny" },
    ] as CapabilityOverrideInput[];
  });
}

function assertNoReservedOverrides(
  overrides: readonly CapabilityOverrideInput[] | undefined,
): void {
  if (
    overrides?.some((override) =>
      nonDelegableCapabilityKeys.includes(
        override.capability as (typeof nonDelegableCapabilityKeys)[number],
      ),
    )
  ) {
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Capability cannot be delegated",
      "Consimțământul pentru agregare publică poate fi administrat doar de proprietar.",
    );
  }
}
