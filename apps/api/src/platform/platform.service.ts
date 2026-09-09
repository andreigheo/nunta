import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Algorithm, hash as hashPassword } from "@node-rs/argon2";
import type { ApiEnvironment } from "@weddingos/config";
import type {
  CapabilityKey,
  RegistrationIntent,
  RoleTemplateKey,
} from "@weddingos/contracts";
import { Prisma } from "@weddingos/database";
import { AsyncService } from "../async/async.service";
import { createOpaqueToken, hashSecret } from "../auth/auth.crypto";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { problem } from "../common/problem";

type Transaction = Prisma.TransactionClient;

type SupportCaseInput = {
  type: string;
  subject: string;
  description: string;
  priority: string;
  requesterUserId?: string;
  workspaceId?: string;
  vendorOrganizationId?: string;
};

type FeatureFlagInput = {
  key?: string;
  description?: string;
  valueType?: string;
  defaultValue?: unknown;
  rules?: unknown[];
  killSwitch?: boolean;
  expiresAt?: string | null;
  reason: string;
};

type DataSubjectInput = {
  type: string;
  scopeType: string;
  scopeId?: string | null;
  details?: string;
};

type MaintenanceWindowInput = {
  scope: "FULL_PLATFORM" | "MUTATIONS" | "MODULE" | "PROVIDER";
  scopeKey?: string | null;
  message: string;
  supportUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  reason: string;
};

type PlatformListQuery = {
  query?: string;
  status?: string;
  page: number;
  pageSize: number;
};

type PlatformRange = "7d" | "30d" | "90d";

type PlatformLabelInput = {
  name: string;
  description?: string | null;
  color: "plum" | "coral" | "amber" | "sage" | "blue";
  reason: string;
};

type PlatformLabelAssignmentInput = {
  targetType: "USER" | "WORKSPACE" | "VENDOR_ORGANIZATION" | "SUPPORT_CASE";
  targetId: string;
  reason: string;
};

type PlatformCreateUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  registrationIntent: RegistrationIntent;
  platformRoleKey?: string | null;
  reason: string;
};

type PlatformUpdateUserInput = {
  firstName: string;
  lastName: string;
  registrationIntent: RegistrationIntent;
  version: number;
  reason: string;
};

type PlatformUserGrantInput = {
  roleKey: string;
  active: boolean;
  validUntil?: string | null;
  version?: number | null;
  reason: string;
};

type PlatformMembershipRoleInput = {
  roleTemplateKey: RoleTemplateKey;
  version: number;
  reason: string;
};

type PlatformCreateMembershipInput = {
  workspaceId: string;
  roleTemplateKey: RoleTemplateKey;
  reason: string;
};

const PASSWORD_HASH_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

@Injectable()
export class PlatformService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async overview(userId: string, range: PlatformRange) {
    return this.platformContext(
      userId,
      "platform.dashboard.read",
      async (tx) => {
        const since = rangeStart(range);
        const [
          users,
          activeUsers,
          workspaces,
          activeWorkspaces,
          vendors,
          supportOpen,
          incidentsOpen,
          alertsOpen,
          failedJobs,
          deadBillingEvents,
          recentUsers,
          recentWorkspaces,
          recentTransactions,
          recentActions,
        ] = await Promise.all([
          tx.user.count(),
          tx.user.count({ where: { status: "ACTIVE" } }),
          tx.workspace.count(),
          tx.workspace.count({ where: { status: "ACTIVE" } }),
          tx.vendorOrganization.count(),
          tx.platformSupportCase.count({
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
          }),
          tx.platformIncident.count({
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
          }),
          tx.securityAlert.count({ where: { status: "OPEN" } }),
          tx.backgroundJob.count({
            where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
          }),
          tx.workspaceBillingProviderEvent.count({
            where: { status: "DEAD_LETTER" },
          }),
          tx.user.findMany({
            where: { createdAt: { gte: since } },
            select: { createdAt: true },
          }),
          tx.workspace.findMany({
            where: { createdAt: { gte: since } },
            select: { createdAt: true },
          }),
          tx.workspaceBillingTransaction.findMany({
            where: { createdAt: { gte: since } },
            select: {
              createdAt: true,
              totalMinor: true,
              currency: true,
              status: true,
            },
          }),
          tx.platformAdminAction.findMany({
            where: { environment: this.environment.NODE_ENV },
            orderBy: { createdAt: "desc" },
            take: 8,
          }),
        ]);
        return this.safe({
          range,
          generatedAt: new Date(),
          counts: {
            users,
            activeUsers,
            workspaces,
            activeWorkspaces,
            vendors,
            supportOpen,
            incidentsOpen,
            alertsOpen,
            failedJobs,
            deadBillingEvents,
          },
          trend: buildDailyTrend(
            range,
            recentUsers,
            recentWorkspaces,
            recentTransactions,
          ),
          recentActions,
        });
      },
    );
  }

  async traffic(userId: string, range: PlatformRange) {
    return this.platformContext(
      userId,
      "platform.dashboard.read",
      async (tx) => {
        const since = rangeStart(range);
        const [
          registrations,
          workspaces,
          invitationSites,
          publishedInvitations,
          rsvpSubmissions,
        ] = await Promise.all([
          tx.user.count({ where: { createdAt: { gte: since } } }),
          tx.workspace.count({ where: { createdAt: { gte: since } } }),
          tx.invitationSite.count({ where: { createdAt: { gte: since } } }),
          tx.invitationSite.count({ where: { publishedAt: { gte: since } } }),
          tx.rsvpSubmission.count({ where: { createdAt: { gte: since } } }),
        ]);
        return {
          range,
          generatedAt: new Date().toISOString(),
          analytics: {
            status: "NOT_CONNECTED",
            provider: "Google Analytics 4",
            detail:
              "Datele externe de trafic apar după configurarea accesului server-side la GA4 Data API.",
          },
          firstPartyFunnel: [
            {
              key: "registrations",
              label: "Conturi create",
              value: registrations,
            },
            {
              key: "workspaces",
              label: "Evenimente create",
              value: workspaces,
            },
            {
              key: "invitationSites",
              label: "Invitații începute",
              value: invitationSites,
            },
            {
              key: "publishedInvitations",
              label: "Invitații publicate",
              value: publishedInvitations,
            },
            {
              key: "rsvpSubmissions",
              label: "Răspunsuri RSVP",
              value: rsvpSubmissions,
            },
          ],
        };
      },
    );
  }

  async commerce(userId: string, range: PlatformRange) {
    return this.platformContext(userId, "platform.finance.read", async (tx) => {
      const since = rangeStart(range);
      const [
        subscriptions,
        checkouts,
        transactions,
        volumeByCurrency,
        failedEvents,
        recentTransactions,
        recentCheckouts,
      ] = await Promise.all([
        tx.workspaceSubscription.groupBy({
          by: ["planKey", "status"],
          _count: true,
        }),
        tx.workspaceBillingCheckout.groupBy({
          by: ["status"],
          where: { createdAt: { gte: since } },
          _count: true,
        }),
        tx.workspaceBillingTransaction.aggregate({
          where: { createdAt: { gte: since } },
          _count: true,
          _sum: { totalMinor: true, taxMinor: true, feeMinor: true },
        }),
        tx.workspaceBillingTransaction.groupBy({
          by: ["currency"],
          where: { createdAt: { gte: since } },
          _count: true,
          _sum: { totalMinor: true, taxMinor: true, feeMinor: true },
          orderBy: { currency: "asc" },
        }),
        tx.workspaceBillingProviderEvent.count({
          where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
        }),
        tx.workspaceBillingTransaction.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: { workspace: { select: { title: true } } },
        }),
        tx.workspaceBillingCheckout.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 40,
          include: { workspace: { select: { title: true } } },
        }),
      ]);
      return this.safe({
        range,
        generatedAt: new Date(),
        subscriptions,
        checkouts,
        transactions,
        volumeByCurrency,
        failedEvents,
        recentTransactions,
        recentCheckouts,
      });
    });
  }

  async auditActions(userId: string, query: PlatformListQuery) {
    return this.platformContext(userId, "platform.audit.read", async (tx) => {
      const where: Prisma.PlatformAdminActionWhereInput = {
        environment: this.environment.NODE_ENV,
        ...(query.query
          ? {
              OR: [
                { action: { contains: query.query, mode: "insensitive" } },
                { capability: { contains: query.query, mode: "insensitive" } },
                { targetType: { contains: query.query, mode: "insensitive" } },
                { targetId: { contains: query.query, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [items, total] = await Promise.all([
        tx.platformAdminAction.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.platformAdminAction.count({ where }),
      ]);
      return {
        items: items.map((item) => this.safe(item)),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  async access(userId: string) {
    return this.platformContext(userId, "platform.audit.read", async (tx) => {
      const [roles, grants] = await Promise.all([
        tx.platformRole.findMany({ orderBy: { name: "asc" } }),
        tx.platformGrant.findMany({
          where: { environment: this.environment.NODE_ENV },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      const [users, grantRoles] = await Promise.all([
        tx.user.findMany({
          where: {
            id: { in: [...new Set(grants.map((grant) => grant.userId))] },
          },
          select: { id: true, email: true, profile: true },
        }),
        tx.platformRole.findMany({
          where: {
            id: { in: [...new Set(grants.map((grant) => grant.roleId))] },
          },
        }),
      ]);
      const userById = new Map(users.map((row) => [row.id, row]));
      const roleById = new Map(grantRoles.map((row) => [row.id, row]));
      return {
        roles: roles.map((row) => this.safe(row)),
        grants: grants.map((row) =>
          this.safe({
            ...row,
            user: userById.get(row.userId) ?? null,
            role: roleById.get(row.roleId) ?? null,
          }),
        ),
      };
    });
  }

  async labels(userId: string) {
    return this.platformContext(
      userId,
      "platform.feature_flag.read",
      async (tx) => ({
        items: (
          await tx.platformLabel.findMany({
            where: { environment: this.environment.NODE_ENV },
            include: {
              assignments: { orderBy: { createdAt: "desc" }, take: 50 },
            },
            orderBy: { name: "asc" },
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createLabel(
    actorUserId: string,
    input: PlatformLabelInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = "platform.label.create";
    return this.platformContext(
      actorUserId,
      "platform.feature_flag.write",
      async (tx) => {
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const row = await tx.platformLabel.create({
          data: {
            name: input.name,
            description: input.description,
            color: input.color,
            environment: this.environment.NODE_ENV,
            createdById: actorUserId,
            updatedById: actorUserId,
          },
        });
        await this.action(
          tx,
          actorUserId,
          "platform.feature_flag.write",
          operation,
          "PLATFORM_LABEL",
          row.id,
          input.reason,
          null,
          row,
          correlationId,
        );
        const response = this.safe(row);
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async assignLabel(
    actorUserId: string,
    labelId: string,
    input: PlatformLabelAssignmentInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = "platform.label.assign";
    return this.platformContext(
      actorUserId,
      "platform.feature_flag.write",
      async (tx) => {
        const request = { labelId, ...input };
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
        );
        if (replay) return replay;
        const label = await tx.platformLabel.findFirst({
          where: { id: labelId, environment: this.environment.NODE_ENV },
        });
        if (!label) this.notFound("Eticheta nu există în mediul curent.");
        await this.assertLabelTarget(tx, input.targetType, input.targetId);
        const assignment = await tx.platformLabelAssignment.upsert({
          where: {
            labelId_targetType_targetId: {
              labelId,
              targetType: input.targetType,
              targetId: input.targetId,
            },
          },
          create: {
            labelId,
            targetType: input.targetType,
            targetId: input.targetId,
            assignedById: actorUserId,
            reason: input.reason,
          },
          update: { assignedById: actorUserId, reason: input.reason },
        });
        await this.action(
          tx,
          actorUserId,
          "platform.feature_flag.write",
          operation,
          input.targetType,
          input.targetId,
          input.reason,
          null,
          { labelId, assignmentId: assignment.id },
          correlationId,
        );
        const response = this.safe({ ...assignment, label });
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
          response,
        );
        return response;
      },
    );
  }

  async dashboard(userId: string) {
    return this.platformContext(
      userId,
      "platform.dashboard.read",
      async (tx) => {
        const [
          users,
          workspaces,
          vendors,
          supportOpen,
          incidentsOpen,
          alertsOpen,
          backups,
        ] = await Promise.all([
          tx.user.count(),
          tx.workspace.count(),
          tx.vendorOrganization.count(),
          tx.platformSupportCase.count({
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
          }),
          tx.platformIncident.count({
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
          }),
          tx.securityAlert.count({ where: { status: "OPEN" } }),
          tx.backupRun.findFirst({ orderBy: { createdAt: "desc" } }),
        ]);
        return {
          environment: this.environment.NODE_ENV,
          identity: "Platform Admin",
          counts: {
            users,
            workspaces,
            vendors,
            supportOpen,
            incidentsOpen,
            alertsOpen,
          },
          latestBackup: backups ? this.safe(backups) : null,
          productionReadiness: {
            gitProvenance: false,
            stagingConfigured: false,
            tlsConfigured: false,
            offHostBackupConfigured: false,
            verdict: "CONTROLLED_BETA_ONLY",
          },
        };
      },
    );
  }

  async systemStatus(userId: string) {
    return this.platformContext(
      userId,
      "platform.dashboard.read",
      async (tx) => {
        const [
          heartbeat,
          pendingOutbox,
          deadJobs,
          billingDeadLetters,
          maintenance,
          latestBackup,
          latestRestore,
        ] = await Promise.all([
          tx.workerHeartbeat.findFirst({ orderBy: { lastSeenAt: "desc" } }),
          tx.outboxMessage.count({
            where: { status: { in: ["PENDING", "PROCESSING"] } },
          }),
          tx.backgroundJob.count({
            where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
          }),
          tx.workspaceBillingProviderEvent.count({
            where: { status: "DEAD_LETTER" },
          }),
          tx.platformMaintenanceWindow.findFirst({
            where: { environment: this.environment.NODE_ENV, status: "ACTIVE" },
            orderBy: { startsAt: "desc" },
          }),
          tx.backupRun.findFirst({ orderBy: { createdAt: "desc" } }),
          tx.restoreRun.findFirst({ orderBy: { createdAt: "desc" } }),
        ]);
        const workerHealthy = Boolean(
          heartbeat &&
          Date.now() - heartbeat.lastSeenAt.getTime() <=
            this.environment.WORKER_STALE_AFTER_SECONDS * 1_000,
        );
        return {
          status:
            workerHealthy && billingDeadLetters === 0
              ? "OPERATIONAL"
              : "DEGRADED",
          environment: this.environment.NODE_ENV,
          services: {
            api: { status: "UP" },
            database: { status: "UP" },
            worker: {
              status: workerHealthy ? "UP" : "STALE",
              lastHeartbeat: heartbeat?.lastSeenAt.toISOString() ?? null,
            },
            outbox: {
              status: pendingOutbox > 100 ? "DEGRADED" : "UP",
              pending: pendingOutbox,
            },
            jobs: {
              status: deadJobs > 0 ? "DEGRADED" : "UP",
              failedOrDeadLetter: deadJobs,
            },
            billingEvents: {
              status: billingDeadLetters > 0 ? "DEGRADED" : "UP",
              deadLetter: billingDeadLetters,
            },
          },
          maintenance: maintenance ? this.safe(maintenance) : null,
          latestBackup: latestBackup ? this.safe(latestBackup) : null,
          latestRestore: latestRestore ? this.safe(latestRestore) : null,
          providers: {
            email: this.environment.EMAIL_PROVIDER,
            payment: this.environment.PAYMENT_PROVIDER,
            signature: this.environment.SIGNATURE_PROVIDER,
            subscription: this.environment.SUBSCRIPTION_PROVIDER,
            payout: this.environment.PAYOUT_PROVIDER,
          },
        };
      },
    );
  }

  async maintenanceWindows(userId: string) {
    return this.platformContext(
      userId,
      "platform.feature_flag.read",
      async (tx) => ({
        items: (
          await tx.platformMaintenanceWindow.findMany({
            where: { environment: this.environment.NODE_ENV },
            orderBy: { startsAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createMaintenanceWindow(
    userId: string,
    input: MaintenanceWindowInput,
    correlationId: string,
  ) {
    if (
      (input.scope === "MODULE" || input.scope === "PROVIDER") &&
      !input.scopeKey
    ) {
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "scopeKey is required for scoped maintenance",
      );
    }
    return this.platformContext(
      userId,
      "platform.feature_flag.write",
      async (tx) => {
        const row = await tx.platformMaintenanceWindow.create({
          data: {
            environment: this.environment.NODE_ENV,
            scope: input.scope,
            scopeKey: input.scopeKey ?? null,
            message: input.message,
            supportUrl: input.supportUrl ?? null,
            startsAt: new Date(input.startsAt),
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            createdById: userId,
            reason: input.reason,
          },
        });
        await this.action(
          tx,
          userId,
          "platform.feature_flag.write",
          "maintenance.create",
          "PlatformMaintenanceWindow",
          row.id,
          input.reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async transitionMaintenanceWindow(
    userId: string,
    windowId: string,
    status: "ACTIVE" | "COMPLETED",
    version: number,
    reason: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.feature_flag.write",
      async (tx) => {
        const before = await tx.platformMaintenanceWindow.findUnique({
          where: { id: windowId },
        });
        if (!before) this.notFound("Maintenance window nu există.");
        const result = await tx.platformMaintenanceWindow.updateMany({
          where: { id: windowId, version },
          data: {
            status,
            version: { increment: 1 },
            ...(status === "COMPLETED" ? { endsAt: new Date() } : {}),
          },
        });
        if (!result.count)
          problem(
            "VERSION_CONFLICT",
            HttpStatus.CONFLICT,
            "Maintenance window changed concurrently",
          );
        const row = await tx.platformMaintenanceWindow.findUniqueOrThrow({
          where: { id: windowId },
        });
        await this.action(
          tx,
          userId,
          "platform.feature_flag.write",
          `maintenance.${status.toLowerCase()}`,
          "PlatformMaintenanceWindow",
          row.id,
          reason,
          before,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async createUser(
    actorUserId: string,
    input: PlatformCreateUserInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      actorUserId,
      "platform.user.create",
      async (tx) => {
        const operation = "platform.user.provision";
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          input,
        );
        if (replay) return replay;

        const email = input.email.trim().toLowerCase();
        if (await tx.user.count({ where: { email } })) {
          problem(
            "EMAIL_ALREADY_REGISTERED",
            HttpStatus.CONFLICT,
            "Email already registered",
            "Există deja un cont pentru această adresă de email.",
          );
        }

        const requestedRole = input.platformRoleKey
          ? await tx.platformRole.findUnique({
              where: { key: input.platformRoleKey },
            })
          : null;
        if (input.platformRoleKey && !requestedRole) {
          this.notFound("Rolul de platformă selectat nu există.");
        }
        if (requestedRole) {
          await this.assertPlatformCapability(
            tx,
            "platform.user.manage_access",
          );
        }

        const setupToken = createOpaqueToken();
        const passwordHash = await hashPassword(
          createOpaqueToken(),
          PASSWORD_HASH_OPTIONS,
        );
        const created = await tx.user.create({
          data: {
            email,
            acceptedTermsVersion: null,
            acceptedTermsAt: null,
            marketingConsent: false,
            profile: {
              create: {
                firstName: input.firstName.trim(),
                lastName: input.lastName.trim(),
              },
            },
            identities: {
              create: { provider: "PASSWORD", passwordHash },
            },
            preference: {
              create: { registrationIntent: input.registrationIntent },
            },
            notificationPreference: { create: { marketingEmail: false } },
            oneTimeTokens: {
              create: {
                purpose: "PASSWORD_RESET",
                tokenHash: hashSecret(setupToken),
                expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1_000),
                metadata: this.json({
                  adminProvisioned: true,
                  registrationIntent: input.registrationIntent,
                  returnTo: registrationIntentRoute(input.registrationIntent),
                }),
              },
            },
          },
          include: { profile: true, preference: true },
        });

        if (requestedRole) {
          await tx.platformGrant.create({
            data: {
              userId: created.id,
              roleId: requestedRole.id,
              environment: this.environment.NODE_ENV,
              active: true,
              mfaVerifiedAt: new Date(),
              grantedById: actorUserId,
              reason: input.reason,
            },
          });
        }

        const response = {
          id: created.id,
          email: created.email,
          status: created.status,
          emailVerified: false,
          setupEmailSent: true,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
          version: created.version,
          registrationIntent: created.preference?.registrationIntent,
          platformRoleKeys: requestedRole ? [requestedRole.key] : [],
          profile: created.profile
            ? {
                firstName: created.profile.firstName,
                lastName: created.profile.lastName,
              }
            : null,
          membershipCount: 0,
          sessionCount: 0,
        };

        await this.action(
          tx,
          actorUserId,
          "platform.user.create",
          operation,
          "USER",
          created.id,
          input.reason,
          null,
          response,
          correlationId,
        );
        await this.asyncEvents.record(tx, {
          eventName: "platform.user_provisioned.v1",
          aggregateType: "User",
          aggregateId: created.id,
          aggregateVersion: created.version,
          actorUserId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `platform-user-provisioned:${created.id}`,
          payload: {
            subject: { userId: created.id },
            activity: {
              category: "platform",
              action: "platform.user_provisioned.v1",
              summary:
                "Cont creat de administrator; configurarea parolei este în așteptare.",
              entityType: "User",
              entityId: created.id,
            },
          },
          email: {
            kind: "password-reset",
            recipient: created.email,
            values: {
              firstName: created.profile?.firstName ?? "",
              token: setupToken,
              provisioned: "1",
            },
          },
        });
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateUser(
    actorUserId: string,
    targetUserId: string,
    input: PlatformUpdateUserInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      actorUserId,
      "platform.user.update",
      async (tx) => {
        const operation = "platform.user.update";
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          { targetUserId, ...input },
        );
        if (replay) return replay;
        const before = await tx.user.findUnique({
          where: { id: targetUserId },
          include: { profile: true, preference: true },
        });
        if (!before) this.notFound("Utilizatorul nu există.");
        const touched = await tx.user.updateMany({
          where: { id: targetUserId, version: input.version },
          data: { version: { increment: 1 } },
        });
        if (touched.count !== 1) this.conflict();
        await Promise.all([
          tx.userProfile.upsert({
            where: { userId: targetUserId },
            update: {
              firstName: input.firstName.trim(),
              lastName: input.lastName.trim(),
              version: { increment: 1 },
            },
            create: {
              userId: targetUserId,
              firstName: input.firstName.trim(),
              lastName: input.lastName.trim(),
            },
          }),
          tx.userPreference.upsert({
            where: { userId: targetUserId },
            update: {
              registrationIntent: input.registrationIntent,
              version: { increment: 1 },
            },
            create: {
              userId: targetUserId,
              registrationIntent: input.registrationIntent,
            },
          }),
        ]);
        const row = await tx.user.findUniqueOrThrow({
          where: { id: targetUserId },
          include: { profile: true, preference: true },
        });
        const response = {
          id: row.id,
          email: row.email,
          status: row.status,
          version: row.version,
          updatedAt: row.updatedAt.toISOString(),
          registrationIntent: row.preference?.registrationIntent,
          profile: row.profile
            ? {
                firstName: row.profile.firstName,
                lastName: row.profile.lastName,
              }
            : null,
        };
        await this.action(
          tx,
          actorUserId,
          "platform.user.update",
          operation,
          "USER",
          targetUserId,
          input.reason,
          before,
          response,
          correlationId,
        );
        await this.event(tx, {
          eventName: "platform.user_updated.v1",
          aggregateType: "User",
          aggregateId: targetUserId,
          actorUserId,
          correlationId,
          idempotencyKey,
          summary:
            "Profilul și tipul contului au fost actualizate de administrator.",
        });
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          { targetUserId, ...input },
          response,
        );
        return response;
      },
    );
  }

  async setUserPlatformGrant(
    actorUserId: string,
    targetUserId: string,
    input: PlatformUserGrantInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      actorUserId,
      "platform.user.manage_access",
      async (tx) => {
        const operation = "platform.user.platform_access";
        const request = { targetUserId, ...input };
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
        );
        if (replay) return replay;
        if (!(await tx.user.count({ where: { id: targetUserId } }))) {
          this.notFound("Utilizatorul nu există.");
        }
        const role = await tx.platformRole.findUnique({
          where: { key: input.roleKey },
        });
        if (!role) this.notFound("Rolul de platformă nu există.");
        const validUntil = input.validUntil ? new Date(input.validUntil) : null;
        if (input.active && validUntil && validUntil.getTime() <= Date.now()) {
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Invalid grant validity",
            "Data de expirare trebuie să fie în viitor.",
          );
        }
        const unique = {
          userId_roleId_environment: {
            userId: targetUserId,
            roleId: role.id,
            environment: this.environment.NODE_ENV,
          },
        };
        const before = await tx.platformGrant.findUnique({ where: unique });
        if (!input.active) {
          if (!before) this.notFound("Acordarea rolului nu există.");
          if (!input.version) {
            problem(
              "PRECONDITION_REQUIRED",
              HttpStatus.PRECONDITION_REQUIRED,
              "Version required",
            );
          }
          if (targetUserId === actorUserId) {
            problem(
              "FORBIDDEN",
              HttpStatus.CONFLICT,
              "Self revocation denied",
              "Nu îți poți revoca propriul acces de platformă.",
            );
          }
          if (role.key === "PLATFORM_SUPER_ADMIN" && before.active) {
            const activeSuperAdmins = await tx.platformGrant.count({
              where: {
                roleId: role.id,
                environment: this.environment.NODE_ENV,
                active: true,
                OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
              },
            });
            if (activeSuperAdmins <= 1) {
              problem(
                "LAST_OWNER_PROTECTED",
                HttpStatus.CONFLICT,
                "Last platform administrator protected",
                "Ultimul super administrator activ nu poate fi revocat.",
              );
            }
          }
          const changed = await tx.platformGrant.updateMany({
            where: { id: before.id, version: input.version ?? -1 },
            data: {
              active: false,
              revokedAt: new Date(),
              revokedById: actorUserId,
              reason: input.reason,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) this.conflict();
        } else if (before) {
          if (input.version && input.version !== before.version)
            this.conflict();
          await tx.platformGrant.update({
            where: { id: before.id },
            data: {
              active: true,
              validFrom: new Date(),
              validUntil,
              revokedAt: null,
              revokedById: null,
              grantedById: actorUserId,
              mfaVerifiedAt: new Date(),
              reason: input.reason,
              version: { increment: 1 },
            },
          });
        } else {
          await tx.platformGrant.create({
            data: {
              userId: targetUserId,
              roleId: role.id,
              environment: this.environment.NODE_ENV,
              active: true,
              validUntil,
              grantedById: actorUserId,
              mfaVerifiedAt: new Date(),
              reason: input.reason,
            },
          });
        }
        const row = await tx.platformGrant.findUniqueOrThrow({ where: unique });
        const response = {
          id: row.id,
          roleKey: role.key,
          roleName: role.name,
          critical: role.critical,
          active: row.active,
          validFrom: row.validFrom.toISOString(),
          validUntil: row.validUntil?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() ?? null,
          version: row.version,
        };
        await this.action(
          tx,
          actorUserId,
          "platform.user.manage_access",
          operation,
          "PLATFORM_GRANT",
          row.id,
          input.reason,
          before,
          response,
          correlationId,
        );
        await this.event(tx, {
          eventName: "platform.user_platform_access_changed.v1",
          aggregateType: "PlatformGrant",
          aggregateId: row.id,
          actorUserId,
          correlationId,
          idempotencyKey,
          summary: input.active
            ? `Rolul ${role.name} a fost acordat.`
            : `Rolul ${role.name} a fost revocat.`,
        });
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
          response,
        );
        return response;
      },
    );
  }

  async setUserMembershipRole(
    actorUserId: string,
    targetUserId: string,
    membershipId: string,
    input: PlatformMembershipRoleInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      actorUserId,
      "platform.user.manage_access",
      async (tx) => {
        const operation = "platform.user.membership_role";
        const request = { targetUserId, membershipId, ...input };
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
        );
        if (replay) return replay;
        const before = await tx.workspaceMembership.findFirst({
          where: { id: membershipId, userId: targetUserId },
          include: { roleTemplate: true, workspace: true },
        });
        if (!before) this.notFound("Apartenența la eveniment nu există.");
        const nextRole = await tx.roleTemplate.findUnique({
          where: { key: input.roleTemplateKey },
        });
        if (!nextRole) this.notFound("Rolul de eveniment nu există.");
        if (before.roleTemplate.key === input.roleTemplateKey) {
          return {
            id: before.id,
            roleTemplateKey: before.roleTemplate.key,
            roleTemplateName: before.roleTemplate.name,
            version: before.version,
          };
        }
        if (
          before.status === "ACTIVE" &&
          before.roleTemplate.key === "couple_owner" &&
          input.roleTemplateKey !== "couple_owner"
        ) {
          const activeOwners = await tx.workspaceMembership.count({
            where: {
              workspaceId: before.workspaceId,
              status: "ACTIVE",
              roleTemplate: { key: "couple_owner" },
            },
          });
          if (activeOwners <= 1) {
            problem(
              "LAST_OWNER_PROTECTED",
              HttpStatus.CONFLICT,
              "Last workspace owner protected",
              "Adaugă un alt proprietar activ înainte de a schimba acest rol.",
            );
          }
        }
        const changed = await tx.workspaceMembership.updateMany({
          where: { id: membershipId, version: input.version },
          data: {
            roleTemplateId: nextRole.id,
            updatedById: actorUserId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) this.conflict();
        const row = await tx.workspaceMembership.findUniqueOrThrow({
          where: { id: membershipId },
          include: { roleTemplate: true, workspace: true },
        });
        const response = {
          id: row.id,
          workspaceId: row.workspaceId,
          workspaceTitle: row.workspace.title,
          roleTemplateKey: row.roleTemplate.key,
          roleTemplateName: row.roleTemplate.name,
          status: row.status,
          version: row.version,
        };
        await this.action(
          tx,
          actorUserId,
          "platform.user.manage_access",
          operation,
          "WORKSPACE_MEMBERSHIP",
          row.id,
          input.reason,
          before,
          response,
          correlationId,
        );
        await this.event(tx, {
          eventName: "platform.user_membership_role_changed.v1",
          aggregateType: "WorkspaceMembership",
          aggregateId: row.id,
          actorUserId,
          correlationId,
          idempotencyKey,
          summary: `Rolul în ${row.workspace.title} a devenit ${row.roleTemplate.name}.`,
        });
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
          response,
        );
        return response;
      },
    );
  }

  async createUserMembership(
    actorUserId: string,
    targetUserId: string,
    input: PlatformCreateMembershipInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      actorUserId,
      "platform.user.manage_access",
      async (tx) => {
        const operation = "platform.user.membership_add";
        const request = { targetUserId, ...input };
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
        );
        if (replay) return replay;
        const [user, workspace, role] = await Promise.all([
          tx.user.findUnique({ where: { id: targetUserId } }),
          tx.workspace.findUnique({ where: { id: input.workspaceId } }),
          tx.roleTemplate.findUnique({
            where: { key: input.roleTemplateKey },
          }),
        ]);
        if (!user) this.notFound("Utilizatorul nu există.");
        if (!workspace) this.notFound("Evenimentul nu există.");
        if (!role) this.notFound("Rolul de eveniment nu există.");
        const existing = await tx.workspaceMembership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: input.workspaceId,
              userId: targetUserId,
            },
          },
        });
        if (existing) {
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Membership already exists",
            "Utilizatorul aparține deja acestui eveniment. Schimbă rolul existent.",
          );
        }
        const row = await tx.workspaceMembership.create({
          data: {
            workspaceId: input.workspaceId,
            userId: targetUserId,
            roleTemplateId: role.id,
            status: "ACTIVE",
            createdById: actorUserId,
            updatedById: actorUserId,
          },
          include: { roleTemplate: true, workspace: true },
        });
        const response = {
          id: row.id,
          workspaceId: row.workspaceId,
          workspaceTitle: row.workspace.title,
          workspaceStatus: row.workspace.status,
          roleTemplateKey: row.roleTemplate.key,
          roleTemplateName: row.roleTemplate.name,
          status: row.status,
          version: row.version,
        };
        await this.action(
          tx,
          actorUserId,
          "platform.user.manage_access",
          operation,
          "WORKSPACE_MEMBERSHIP",
          row.id,
          input.reason,
          null,
          response,
          correlationId,
        );
        await this.event(tx, {
          eventName: "platform.user_membership_added.v1",
          aggregateType: "WorkspaceMembership",
          aggregateId: row.id,
          actorUserId,
          correlationId,
          idempotencyKey,
          summary: `Utilizatorul a fost adăugat în ${row.workspace.title} ca ${row.roleTemplate.name}.`,
        });
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
          response,
        );
        return response;
      },
    );
  }

  async users(
    userId: string,
    query: PlatformListQuery = { page: 1, pageSize: 100 },
  ) {
    return this.platformContext(userId, "platform.user.read", async (tx) => {
      const where: Prisma.UserWhereInput = {
        ...(query.status &&
        ["ACTIVE", "SUSPENDED", "DISABLED"].includes(query.status)
          ? { status: query.status as "ACTIVE" | "SUSPENDED" | "DISABLED" }
          : {}),
        ...(query.query
          ? {
              OR: [
                { email: { contains: query.query, mode: "insensitive" } },
                {
                  profile: {
                    is: {
                      firstName: { contains: query.query, mode: "insensitive" },
                    },
                  },
                },
                {
                  profile: {
                    is: {
                      lastName: { contains: query.query, mode: "insensitive" },
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.user.findMany({
          where,
          include: {
            profile: true,
            preference: true,
            _count: { select: { memberships: true, sessions: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        tx.user.count({ where }),
      ]);
      const grants = rows.length
        ? await tx.platformGrant.findMany({
            where: {
              userId: { in: rows.map((row) => row.id) },
              environment: this.environment.NODE_ENV,
              active: true,
              OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
            },
          })
        : [];
      const roleIds = [...new Set(grants.map((grant) => grant.roleId))];
      const roles = roleIds.length
        ? await tx.platformRole.findMany({ where: { id: { in: roleIds } } })
        : [];
      const roleKeyById = new Map(roles.map((role) => [role.id, role.key]));
      return {
        items: rows.map((row) => ({
          id: row.id,
          email: row.email,
          status: row.status,
          emailVerified: Boolean(row.emailVerifiedAt),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          version: row.version,
          profile: row.profile
            ? {
                firstName: row.profile.firstName,
                lastName: row.profile.lastName,
              }
            : null,
          registrationIntent:
            row.preference?.registrationIntent ?? "EVENT_ORGANIZER",
          platformRoleKeys: grants
            .filter((grant) => grant.userId === row.id)
            .map((grant) => roleKeyById.get(grant.roleId))
            .filter((key): key is string => Boolean(key)),
          membershipCount: row._count.memberships,
          sessionCount: row._count.sessions,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  async user(userId: string, targetUserId: string) {
    return this.platformContext(userId, "platform.user.read", async (tx) => {
      const row = await tx.user.findUnique({
        where: { id: targetUserId },
        include: {
          profile: true,
          preference: true,
          sessions: true,
          memberships: {
            include: {
              roleTemplate: true,
              workspace: { include: { subscription: true } },
            },
          },
        },
      });
      if (!row) this.notFound("Utilizatorul nu există.");
      const [platformRoles, platformGrants, workspaceRoles] = await Promise.all(
        [
          tx.platformRole.findMany({ orderBy: { name: "asc" } }),
          tx.platformGrant.findMany({
            where: {
              userId: targetUserId,
              environment: this.environment.NODE_ENV,
            },
            orderBy: { createdAt: "asc" },
          }),
          tx.roleTemplate.findMany({ orderBy: { name: "asc" } }),
        ],
      );
      const platformRoleById = new Map(
        platformRoles.map((role) => [role.id, role]),
      );
      return {
        id: row.id,
        email: row.email,
        status: row.status,
        emailVerified: Boolean(row.emailVerifiedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
        registrationIntent:
          row.preference?.registrationIntent ?? "EVENT_ORGANIZER",
        termsAccepted: Boolean(row.acceptedTermsAt && row.acceptedTermsVersion),
        profile: row.profile
          ? { firstName: row.profile.firstName, lastName: row.profile.lastName }
          : null,
        memberships: row.memberships.map((membership) => ({
          id: membership.id,
          workspaceId: membership.workspaceId,
          workspaceTitle: membership.workspace.title,
          workspaceStatus: membership.workspace.status,
          status: membership.status,
          version: membership.version,
          roleTemplateKey: membership.roleTemplate.key,
          roleTemplateName: membership.roleTemplate.name,
          planKey: membership.workspace.subscription?.planKey ?? "FREE",
          subscriptionStatus:
            membership.workspace.subscription?.status ?? "FREE",
          subscriptionProviderManaged: Boolean(
            membership.workspace.subscription?.providerSubscriptionId,
          ),
          workspaceVersion: membership.workspace.version,
        })),
        platformGrants: platformGrants.map((grant) => {
          const role = platformRoleById.get(grant.roleId);
          return {
            id: grant.id,
            roleKey: role?.key ?? grant.roleId,
            roleName: role?.name ?? "Rol indisponibil",
            critical: role?.critical ?? false,
            active:
              grant.active &&
              (!grant.validUntil || grant.validUntil.getTime() > Date.now()),
            validFrom: grant.validFrom.toISOString(),
            validUntil: grant.validUntil?.toISOString() ?? null,
            revokedAt: grant.revokedAt?.toISOString() ?? null,
            version: grant.version,
          };
        }),
        availablePlatformRoles: platformRoles.map((role) => ({
          key: role.key,
          name: role.name,
          description: role.description,
          critical: role.critical,
        })),
        availableWorkspaceRoles: workspaceRoles.map((role) => ({
          key: role.key,
          name: role.name,
          description: role.description,
        })),
        sessions: row.sessions.map((session) => ({
          id: session.id,
          active: !session.revokedAt && session.expiresAt > new Date(),
          lastSeenAt: session.lastSeenAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
        })),
      };
    });
  }

  async userUsage(userId: string, targetUserId: string, range: PlatformRange) {
    return this.platformContext(userId, "platform.usage.read", async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!target) this.notFound("Utilizatorul nu există.");

      const since = rangeStart(range);
      const ownerMemberships = await tx.workspaceMembership.findMany({
        where: {
          userId: targetUserId,
          status: "ACTIVE",
          roleTemplate: { key: "couple_owner" },
        },
        select: {
          workspaceId: true,
          workspace: {
            select: {
              title: true,
              subscription: { select: { planKey: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });
      const ownerWorkspaceIds = ownerMemberships.map(
        (membership) => membership.workspaceId,
      );

      const [aiGroups, personalObjectGroups, ownedObjectGroups, guestGroups] =
        await Promise.all([
          tx.copilotUsageRecord.groupBy({
            by: ["workspaceId"],
            where: { userId: targetUserId, createdAt: { gte: since } },
            _count: { _all: true },
            _sum: {
              inputUnits: true,
              outputUnits: true,
              estimatedCostMinor: true,
            },
          }),
          tx.storedObject.groupBy({
            by: ["contentTypeDetected", "contentTypeClaimed", "status"],
            where: {
              createdByUserId: targetUserId,
              deletedAt: null,
              status: { not: "DELETED" },
            },
            _count: { _all: true },
            _sum: { sizeBytes: true },
          }),
          ownerWorkspaceIds.length
            ? tx.storedObject.groupBy({
                by: ["workspaceId"],
                where: {
                  workspaceId: { in: ownerWorkspaceIds },
                  deletedAt: null,
                  status: { not: "DELETED" },
                },
                _count: { _all: true },
                _sum: { sizeBytes: true },
              })
            : Promise.resolve([]),
          ownerWorkspaceIds.length
            ? tx.guestMomentMedia.groupBy({
                by: ["workspaceId", "mediaType", "moderationStatus"],
                where: { workspaceId: { in: ownerWorkspaceIds } },
                _count: { _all: true },
              })
            : Promise.resolve([]),
        ]);

      const guestBytes = ownerWorkspaceIds.length
        ? await tx.$queryRaw<
            Array<{ workspaceId: string; sizeBytes: bigint }>
          >(Prisma.sql`
            SELECT media.workspace_id AS "workspaceId",
                   COALESCE(SUM(
                     COALESCE(source.size_bytes, 0) +
                     CASE WHEN derivative.deleted_at IS NULL THEN COALESCE(derivative.size_bytes, 0) ELSE 0 END
                   ), 0)::bigint AS "sizeBytes"
            FROM guest_moment_media media
            JOIN stored_objects source ON source.id = media.stored_object_id
            LEFT JOIN stored_objects derivative ON derivative.id = media.derivative_object_id
            WHERE media.workspace_id IN (${Prisma.join(
              ownerWorkspaceIds.map((id) => Prisma.sql`${id}::uuid`),
            )})
              AND source.deleted_at IS NULL
            GROUP BY media.workspace_id
          `)
        : [];

      const aiByWorkspace = new Map(
        aiGroups.map((group) => [
          group.workspaceId,
          {
            runs: group._count._all,
            inputUnits: group._sum.inputUnits ?? 0,
            outputUnits: group._sum.outputUnits ?? 0,
            estimatedCostMinor: group._sum.estimatedCostMinor ?? 0,
          },
        ]),
      );
      const ownedObjectsByWorkspace = new Map(
        ownedObjectGroups.map((group) => [
          group.workspaceId,
          {
            files: group._count._all,
            bytes: Number(group._sum.sizeBytes ?? 0n),
          },
        ]),
      );
      const guestBytesByWorkspace = new Map(
        guestBytes.map((group) => [group.workspaceId, Number(group.sizeBytes)]),
      );
      const guestByWorkspace = new Map<
        string,
        {
          items: number;
          bytes: number;
          images: number;
          videos: number;
          pending: number;
          approved: number;
          rejected: number;
        }
      >();
      for (const group of guestGroups) {
        const value = guestByWorkspace.get(group.workspaceId) ?? {
          items: 0,
          bytes: guestBytesByWorkspace.get(group.workspaceId) ?? 0,
          images: 0,
          videos: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        };
        value.items += group._count._all;
        if (group.mediaType === "IMAGE") value.images += group._count._all;
        if (group.mediaType === "VIDEO") value.videos += group._count._all;
        if (
          group.moderationStatus === "PENDING" ||
          group.moderationStatus === "REQUIRES_REVIEW"
        )
          value.pending += group._count._all;
        if (
          group.moderationStatus === "APPROVED" ||
          group.moderationStatus === "AUTOMATED_SAFE"
        )
          value.approved += group._count._all;
        if (
          group.moderationStatus === "REJECTED" ||
          group.moderationStatus === "HIDDEN"
        )
          value.rejected += group._count._all;
        guestByWorkspace.set(group.workspaceId, value);
      }

      const emptyAi = {
        runs: 0,
        inputUnits: 0,
        outputUnits: 0,
        estimatedCostMinor: 0,
      };
      const emptyGuest = {
        items: 0,
        bytes: 0,
        images: 0,
        videos: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      };
      const events = ownerMemberships.map((membership) => ({
        workspaceId: membership.workspaceId,
        title: membership.workspace.title,
        planKey: membership.workspace.subscription?.planKey ?? "FREE",
        storedObjects:
          ownedObjectsByWorkspace.get(membership.workspaceId)?.files ?? 0,
        totalBytes:
          ownedObjectsByWorkspace.get(membership.workspaceId)?.bytes ?? 0,
        guestMedia: guestByWorkspace.get(membership.workspaceId) ?? emptyGuest,
        ai: aiByWorkspace.get(membership.workspaceId) ?? emptyAi,
      }));

      const ai = aiGroups.reduce(
        (total, group) => ({
          runs: total.runs + group._count._all,
          inputUnits: total.inputUnits + (group._sum.inputUnits ?? 0),
          outputUnits: total.outputUnits + (group._sum.outputUnits ?? 0),
          estimatedCostMinor:
            total.estimatedCostMinor + (group._sum.estimatedCostMinor ?? 0),
        }),
        { ...emptyAi },
      );
      const personalUploads = personalObjectGroups.reduce(
        (total, group) => {
          const type = (
            group.contentTypeDetected ?? group.contentTypeClaimed
          ).toLowerCase();
          total.files += group._count._all;
          total.bytes += Number(group._sum.sizeBytes ?? 0n);
          if (group.status === "AVAILABLE")
            total.availableFiles += group._count._all;
          if (group.status === "QUARANTINED")
            total.quarantinedFiles += group._count._all;
          if (type.startsWith("image/")) total.imageFiles += group._count._all;
          else if (type.startsWith("video/"))
            total.videoFiles += group._count._all;
          else total.otherFiles += group._count._all;
          return total;
        },
        {
          files: 0,
          bytes: 0,
          availableFiles: 0,
          quarantinedFiles: 0,
          imageFiles: 0,
          videoFiles: 0,
          otherFiles: 0,
        },
      );
      const ownedEvents = events.reduce(
        (total, event) => {
          total.storedObjects += event.storedObjects;
          total.totalBytes += event.totalBytes;
          total.guestMedia.items += event.guestMedia.items;
          total.guestMedia.bytes += event.guestMedia.bytes;
          total.guestMedia.images += event.guestMedia.images;
          total.guestMedia.videos += event.guestMedia.videos;
          total.guestMedia.pending += event.guestMedia.pending;
          total.guestMedia.approved += event.guestMedia.approved;
          total.guestMedia.rejected += event.guestMedia.rejected;
          return total;
        },
        {
          count: events.length,
          storedObjects: 0,
          totalBytes: 0,
          guestMedia: { ...emptyGuest },
        },
      );

      return {
        range,
        since: since.toISOString(),
        generatedAt: new Date().toISOString(),
        attribution: {
          personalStorage: "Fișiere create direct de utilizator.",
          ownedEventStorage:
            "Spațiul evenimentelor unde utilizatorul este proprietar activ; nu este atribuit colaboratorilor.",
          accountingNote:
            "Sunt două perspective asupra acelorași date și se pot suprapune; valorile nu trebuie adunate între ele.",
        },
        ai,
        personalUploads,
        ownedEvents,
        events,
      };
    });
  }

  async changeUserStatus(
    actorUserId: string,
    targetUserId: string,
    status: "ACTIVE" | "SUSPENDED",
    version: number,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const capability: CapabilityKey =
      status === "SUSPENDED"
        ? "platform.user.suspend"
        : "platform.user.reactivate";
    const operation =
      status === "SUSPENDED"
        ? "platform.user.suspend"
        : "platform.user.reactivate";
    return this.platformContext(actorUserId, capability, async (tx) => {
      const replay = await this.replay(
        tx,
        actorUserId,
        operation,
        idempotencyKey,
        {
          targetUserId,
          status,
          version,
          reason,
        },
      );
      if (replay) return replay;
      if (actorUserId === targetUserId && status === "SUSPENDED") {
        problem(
          "SELF_SUSPENSION_DENIED",
          HttpStatus.CONFLICT,
          "Self suspension denied",
        );
      }
      const before = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!before) this.notFound("Utilizatorul nu există.");
      const updated = await tx.user.updateMany({
        where: { id: targetUserId, version },
        data: { status, version: { increment: 1 } },
      });
      if (updated.count !== 1) this.conflict();
      if (status === "SUSPENDED") {
        await tx.session.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date(), version: { increment: 1 } },
        });
      }
      const row = await tx.user.findUniqueOrThrow({
        where: { id: targetUserId },
      });
      await this.action(
        tx,
        actorUserId,
        capability,
        operation,
        "USER",
        targetUserId,
        reason,
        before,
        row,
        correlationId,
      );
      await this.event(tx, {
        eventName:
          status === "SUSPENDED"
            ? "platform.user_suspended.v1"
            : "platform.user_reactivated.v1",
        aggregateType: "User",
        aggregateId: targetUserId,
        actorUserId,
        correlationId,
        idempotencyKey,
        summary:
          status === "SUSPENDED"
            ? "Cont suspendat de Platform Admin."
            : "Cont reactivat de Platform Admin.",
      });
      const response = this.safe(row);
      await this.saveReplay(
        tx,
        actorUserId,
        operation,
        idempotencyKey,
        { targetUserId, status, version, reason },
        response,
      );
      return response;
    });
  }

  async workspaces(
    userId: string,
    query: PlatformListQuery = { page: 1, pageSize: 100 },
  ) {
    return this.platformContext(
      userId,
      "platform.workspace.read",
      async (tx) => {
        const where: Prisma.WorkspaceWhereInput = {
          ...(query.status &&
          ["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(query.status)
            ? { status: query.status as "ACTIVE" | "SUSPENDED" | "ARCHIVED" }
            : {}),
          ...(query.query
            ? { title: { contains: query.query, mode: "insensitive" } }
            : {}),
        };
        const [rows, total] = await Promise.all([
          tx.workspace.findMany({
            where,
            include: {
              _count: { select: { memberships: true } },
              eventProfile: true,
              subscription: true,
            },
            orderBy: { createdAt: "desc" },
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.workspace.count({ where }),
        ]);
        return {
          items: rows.map((row) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            timezone: row.timezone,
            createdAt: row.createdAt.toISOString(),
            membershipCount: row._count.memberships,
            weddingDate: row.eventProfile?.eventDate?.toISOString() ?? null,
            eventType: row.eventProfile?.eventType ?? null,
            subscription: row.subscription ? this.safe(row.subscription) : null,
            version: row.version,
          })),
          page: query.page,
          pageSize: query.pageSize,
          total,
        };
      },
    );
  }

  async workspace(userId: string, workspaceId: string) {
    return this.platformContext(
      userId,
      "platform.workspace.read",
      async (tx) => {
        const row = await tx.workspace.findUnique({
          where: { id: workspaceId },
          include: { memberships: true, eventProfile: true },
        });
        if (!row) this.notFound("Workspace-ul nu există.");
        return this.safe({
          ...row,
          ownerIds: row.memberships.map((item) => item.userId),
        });
      },
    );
  }

  async setWorkspaceSubscriptionPlan(
    actorUserId: string,
    workspaceId: string,
    planKey: "FREE" | "PLUS" | "PRO",
    version: number,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const operation = "platform.workspace.subscription.override";
    return this.platformContext(
      actorUserId,
      "platform.subscription.manage",
      async (tx) => {
        const request = { workspaceId, planKey, version, reason };
        const replay = await this.replay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
        );
        if (replay) return replay;

        const workspace = await tx.workspace.findUnique({
          where: { id: workspaceId },
          include: { subscription: true },
        });
        if (!workspace) this.notFound("Workspace-ul nu există.");
        if (workspace.version !== version) this.conflict();
        if (workspace.subscription?.providerSubscriptionId) {
          problem(
            "SUBSCRIPTION_PROVIDER_MANAGED",
            HttpStatus.CONFLICT,
            "Subscription is provider managed",
            "Abonamentul are o subscripție activă la furnizor. Schimbarea trebuie făcută prin fluxul furnizorului pentru a evita taxarea și drepturile divergente.",
          );
        }

        await tx.workspace.update({
          where: { id: workspaceId },
          data: { version: { increment: 1 }, updatedById: actorUserId },
        });
        const subscriptionData = {
          planKey,
          status: planKey === "FREE" ? ("FREE" as const) : ("ACTIVE" as const),
          provider: planKey === "FREE" ? null : "admin",
          updatedById: actorUserId,
          lastReconciledAt: new Date(),
        };
        // Avoid an INSERT ... ON CONFLICT path under RLS. An explicit branch
        // keeps the policy decision unambiguous for both existing and legacy
        // workspaces without a subscription row.
        const subscription = workspace.subscription
          ? await tx.workspaceSubscription.update({
              where: { id: workspace.subscription.id },
              data: {
                ...subscriptionData,
                version: { increment: 1 },
              },
            })
          : await tx.workspaceSubscription.create({
              data: {
                workspaceId,
                ...subscriptionData,
                createdById: actorUserId,
              },
            });
        const after = await tx.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          include: { subscription: true },
        });
        await this.action(
          tx,
          actorUserId,
          "platform.subscription.manage",
          operation,
          "WORKSPACE_SUBSCRIPTION",
          subscription.id,
          reason,
          workspace.subscription,
          subscription,
          correlationId,
        );
        await this.event(tx, {
          eventName: "platform.workspace_subscription_overridden.v1",
          aggregateType: "WorkspaceSubscription",
          aggregateId: subscription.id,
          actorUserId,
          correlationId,
          idempotencyKey,
          summary: `Planul workspace-ului a fost setat la ${planKey} de un administrator.`,
        });
        const response = this.safe(after);
        await this.saveReplay(
          tx,
          actorUserId,
          operation,
          idempotencyKey,
          request,
          response,
        );
        return response;
      },
    );
  }

  async changeWorkspaceStatus(
    actorUserId: string,
    workspaceId: string,
    status: "ACTIVE" | "SUSPENDED",
    version: number,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const capability: CapabilityKey =
      status === "SUSPENDED"
        ? "platform.workspace.suspend"
        : "platform.workspace.reactivate";
    const operation = `platform.workspace.${status.toLowerCase()}`;
    return this.platformContext(actorUserId, capability, async (tx) => {
      const request = { workspaceId, status, version, reason };
      const replay = await this.replay(
        tx,
        actorUserId,
        operation,
        idempotencyKey,
        request,
      );
      if (replay) return replay;
      const before = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });
      if (!before) this.notFound("Workspace-ul nu există.");
      const changed = await tx.workspace.updateMany({
        where: { id: workspaceId, version },
        data: { status, version: { increment: 1 }, updatedById: actorUserId },
      });
      if (changed.count !== 1) this.conflict();
      const row = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      await this.action(
        tx,
        actorUserId,
        capability,
        operation,
        "WORKSPACE",
        workspaceId,
        reason,
        before,
        row,
        correlationId,
      );
      await this.event(tx, {
        eventName:
          status === "SUSPENDED"
            ? "platform.workspace_suspended.v1"
            : "platform.workspace_reactivated.v1",
        aggregateType: "Workspace",
        aggregateId: workspaceId,
        actorUserId,
        correlationId,
        idempotencyKey,
        summary:
          status === "SUSPENDED"
            ? "Workspace suspendat."
            : "Workspace reactivat.",
      });
      const response = this.safe(row);
      await this.saveReplay(
        tx,
        actorUserId,
        operation,
        idempotencyKey,
        request,
        response,
      );
      return response;
    });
  }

  async vendors(userId: string) {
    return this.platformContext(userId, "platform.vendor.read", async (tx) => ({
      items: (
        await tx.vendorOrganization.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      ).map((row) => ({
        id: row.id,
        displayName: row.displayName,
        legalName: row.legalName,
        country: row.country,
        contactEmail: row.contactEmail,
        status: row.status,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
      })),
    }));
  }

  async vendor(userId: string, organizationId: string) {
    return this.platformContext(userId, "platform.vendor.read", async (tx) => {
      const row = await tx.vendorOrganization.findUnique({
        where: { id: organizationId },
      });
      if (!row) this.notFound("Organizația furnizorului nu există.");
      return this.safe(row);
    });
  }

  async changeVendorStatus(
    actorUserId: string,
    organizationId: string,
    status: "ACTIVE" | "SUSPENDED",
    version: number,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    const capability: CapabilityKey =
      status === "SUSPENDED"
        ? "platform.vendor.suspend"
        : "platform.vendor.reactivate";
    const operation = `platform.vendor.${status.toLowerCase()}`;
    return this.platformContext(actorUserId, capability, async (tx) => {
      const request = { organizationId, status, version, reason };
      const replay = await this.replay(
        tx,
        actorUserId,
        operation,
        idempotencyKey,
        request,
      );
      if (replay) return replay;
      const before = await tx.vendorOrganization.findUnique({
        where: { id: organizationId },
      });
      if (!before) this.notFound("Organizația furnizorului nu există.");
      const changed = await tx.vendorOrganization.updateMany({
        where: { id: organizationId, version },
        data: { status, version: { increment: 1 }, updatedById: actorUserId },
      });
      if (changed.count !== 1) this.conflict();
      const row = await tx.vendorOrganization.findUniqueOrThrow({
        where: { id: organizationId },
      });
      await this.action(
        tx,
        actorUserId,
        capability,
        operation,
        "VENDOR_ORGANIZATION",
        organizationId,
        reason,
        before,
        row,
        correlationId,
      );
      await this.event(tx, {
        eventName:
          status === "SUSPENDED"
            ? "platform.vendor_suspended.v1"
            : "platform.vendor_reactivated.v1",
        aggregateType: "VendorOrganization",
        aggregateId: organizationId,
        actorUserId,
        correlationId,
        idempotencyKey,
        summary:
          status === "SUSPENDED"
            ? "Furnizor suspendat și ascuns public."
            : "Furnizor reactivat.",
      });
      const response = this.safe(row);
      await this.saveReplay(
        tx,
        actorUserId,
        operation,
        idempotencyKey,
        request,
        response,
      );
      return response;
    });
  }

  async supportCases(userId: string) {
    return this.platformContext(
      userId,
      "platform.support.read",
      async (tx) => ({
        items: (
          await tx.platformSupportCase.findMany({
            orderBy: [{ priorityRank: "desc" }, { createdAt: "asc" }],
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createSupportCase(
    userId: string,
    input: SupportCaseInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.support.write",
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "platform.support.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const row = await tx.platformSupportCase.create({
          data: {
            requesterUserId: input.requesterUserId,
            type: input.type,
            subject: input.subject,
            description: input.description,
            priority: input.priority,
            priorityRank: supportPriorityRank(input.priority),
            workspaceId: input.workspaceId,
            vendorOrganizationId: input.vendorOrganizationId,
          },
        });
        await this.event(tx, {
          eventName: "support.case_created.v1",
          aggregateType: "PlatformSupportCase",
          aggregateId: row.id,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          summary: `Caz suport creat: ${row.subject}`,
        });
        const response = this.safe(row);
        await this.saveReplay(
          tx,
          userId,
          "platform.support.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async supportCase(userId: string, caseId: string) {
    return this.platformContext(userId, "platform.support.read", async (tx) => {
      const row = await tx.platformSupportCase.findUnique({
        where: { id: caseId },
      });
      if (!row) this.notFound("Cazul nu există.");
      const notes = await tx.platformSupportNote.findMany({
        where: { caseId },
        orderBy: { createdAt: "asc" },
      });
      return { ...this.safe(row), notes: notes.map((note) => this.safe(note)) };
    });
  }

  async transitionSupportCase(
    userId: string,
    caseId: string,
    input: {
      status: string;
      reason: string;
      assignedUserId?: string | null;
      version: number;
    },
    correlationId: string,
  ) {
    const capability: CapabilityKey =
      input.status === "CLOSED"
        ? "platform.support.close"
        : "platform.support.write";
    return this.platformContext(userId, capability, async (tx) => {
      const changed = await tx.platformSupportCase.updateMany({
        where: { id: caseId, version: input.version },
        data: {
          status: input.status,
          assignedUserId: input.assignedUserId,
          resolvedAt: input.status === "RESOLVED" ? new Date() : undefined,
          closedAt: input.status === "CLOSED" ? new Date() : undefined,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) this.conflict();
      const row = await tx.platformSupportCase.findUniqueOrThrow({
        where: { id: caseId },
      });
      await this.action(
        tx,
        userId,
        capability,
        "support.case.transition",
        "SUPPORT_CASE",
        caseId,
        input.reason,
        null,
        row,
        correlationId,
      );
      await this.event(tx, {
        eventName:
          input.status === "RESOLVED"
            ? "support.case_resolved.v1"
            : "support.case_updated.v1",
        aggregateType: "PlatformSupportCase",
        aggregateId: caseId,
        actorUserId: userId,
        correlationId,
        summary: `Caz suport actualizat la ${input.status}.`,
      });
      return this.safe(row);
    });
  }

  async addSupportNote(
    userId: string,
    caseId: string,
    body: string,
    privateNote: boolean,
  ) {
    return this.platformContext(
      userId,
      "platform.support.write",
      async (tx) => {
        const exists = await tx.platformSupportCase.count({
          where: { id: caseId },
        });
        if (!exists) this.notFound("Cazul nu există.");
        return this.safe(
          await tx.platformSupportNote.create({
            data: { caseId, authorUserId: userId, body, private: privateNote },
          }),
        );
      },
    );
  }

  async incidents(userId: string) {
    return this.platformContext(
      userId,
      "platform.security.read",
      async (tx) => ({
        items: (
          await tx.platformIncident.findMany({
            orderBy: { startedAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async securityAlerts(userId: string) {
    return this.platformContext(
      userId,
      "platform.security.read",
      async (tx) => ({
        items: (
          await tx.securityAlert.findMany({
            orderBy: { lastSeenAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async featureFlags(userId: string) {
    return this.platformContext(
      userId,
      "platform.feature_flag.read",
      async (tx) => ({
        items: (
          await tx.platformFeatureFlag.findMany({
            where: { environment: this.environment.NODE_ENV },
            orderBy: { key: "asc" },
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createFeatureFlag(
    userId: string,
    input: FeatureFlagInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.feature_flag.write",
      async (tx) => {
        const row = await tx.platformFeatureFlag.create({
          data: {
            key: input.key!,
            environment: this.environment.NODE_ENV,
            description: input.description!,
            valueType: input.valueType!,
            defaultValue: this.json(input.defaultValue),
            rules: this.json(input.rules ?? []),
            killSwitch: input.killSwitch ?? false,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            reason: input.reason,
            createdById: userId,
            updatedById: userId,
          },
        });
        await this.action(
          tx,
          userId,
          "platform.feature_flag.write",
          "platform.feature_flag.create",
          "FEATURE_FLAG",
          row.id,
          input.reason,
          null,
          row,
          correlationId,
        );
        await this.event(tx, {
          eventName: "platform.feature_flag_changed.v1",
          aggregateType: "PlatformFeatureFlag",
          aggregateId: row.id,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          summary: `Feature flag ${row.key} creat.`,
        });
        return this.safe(row);
      },
    );
  }

  async updateFeatureFlag(
    userId: string,
    flagId: string,
    version: number,
    input: FeatureFlagInput,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.feature_flag.write",
      async (tx) => {
        const changed = await tx.platformFeatureFlag.updateMany({
          where: {
            id: flagId,
            environment: this.environment.NODE_ENV,
            version,
          },
          data: {
            description: input.description,
            valueType: input.valueType,
            defaultValue:
              input.defaultValue === undefined
                ? undefined
                : this.json(input.defaultValue),
            rules:
              input.rules === undefined ? undefined : this.json(input.rules),
            killSwitch: input.killSwitch,
            expiresAt:
              input.expiresAt === undefined
                ? undefined
                : input.expiresAt
                  ? new Date(input.expiresAt)
                  : null,
            reason: input.reason,
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) this.conflict();
        const row = await tx.platformFeatureFlag.findUniqueOrThrow({
          where: { id: flagId },
        });
        await this.action(
          tx,
          userId,
          "platform.feature_flag.write",
          "platform.feature_flag.update",
          "FEATURE_FLAG",
          flagId,
          input.reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async legalDocuments(userId: string) {
    return this.platformContext(
      userId,
      "platform.privacy.read",
      async (tx) => ({
        items: (
          await tx.legalDocument.findMany({ orderBy: { key: "asc" } })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createLegalDocument(
    userId: string,
    input: {
      type: string;
      key: string;
      name: string;
      description: string;
      version: string;
      language: string;
      content: string;
      effectiveAt?: string | null;
    },
  ) {
    return this.platformContext(
      userId,
      "platform.privacy.process",
      async (tx) => {
        const document = await tx.legalDocument.upsert({
          where: { key: input.key },
          update: { name: input.name, description: input.description },
          create: {
            type: input.type,
            key: input.key,
            name: input.name,
            description: input.description,
          },
        });
        const version = await tx.legalDocumentVersion.create({
          data: {
            documentId: document.id,
            version: input.version,
            language: input.language,
            content: input.content,
            contentHash: createHash("sha256")
              .update(input.content)
              .digest("hex"),
            effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
            createdById: userId,
          },
        });
        return { document: this.safe(document), version: this.safe(version) };
      },
    );
  }

  async publishLegalDocument(
    userId: string,
    documentId: string,
    version: number,
    reason: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.privacy.process",
      async (tx) => {
        const candidate = await tx.legalDocumentVersion.findFirst({
          where: { documentId, status: "DRAFT" },
          orderBy: { createdAt: "desc" },
        });
        if (!candidate) this.notFound("Nu există o versiune draft.");
        if (version !== 1) this.conflict();
        const row = await tx.legalDocumentVersion.update({
          where: { id: candidate.id },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            effectiveAt: candidate.effectiveAt ?? new Date(),
          },
        });
        await this.action(
          tx,
          userId,
          "platform.privacy.process",
          "legal_document.publish",
          "LEGAL_DOCUMENT",
          documentId,
          reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async dataSubjectRequests(userId: string) {
    return this.platformContext(
      userId,
      "platform.privacy.read",
      async (tx) => ({
        items: (
          await tx.dataSubjectRequest.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async transitionDataSubjectRequest(
    userId: string,
    requestId: string,
    input: { status: string; reason: string; version: number },
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.privacy.process",
      async (tx) => {
        const changed = await tx.dataSubjectRequest.updateMany({
          where: { id: requestId, version: input.version },
          data: {
            status: input.status,
            rejectionReason:
              input.status === "REJECTED" ? input.reason : undefined,
            completedAt: input.status === "COMPLETED" ? new Date() : undefined,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) this.conflict();
        const row = await tx.dataSubjectRequest.findUniqueOrThrow({
          where: { id: requestId },
        });
        await this.action(
          tx,
          userId,
          "platform.privacy.process",
          "privacy.request.transition",
          "DATA_SUBJECT_REQUEST",
          requestId,
          input.reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async createLegalHold(
    userId: string,
    input: {
      targetType: string;
      targetId: string;
      reason: string;
      expiresAt?: string | null;
    },
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.privacy.process",
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "platform.legal_hold.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const row = await tx.legalHold.create({
          data: {
            targetType: input.targetType,
            targetId: input.targetId,
            reason: input.reason,
            createdById: userId,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        });
        await this.action(
          tx,
          userId,
          "platform.privacy.process",
          "legal_hold.create",
          input.targetType,
          input.targetId,
          input.reason,
          null,
          row,
          correlationId,
        );
        await this.event(tx, {
          eventName: "legal_hold.created.v1",
          aggregateType: "LegalHold",
          aggregateId: row.id,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          summary: "Legal hold aplicat; purge-ul este blocat.",
        });
        const response = this.safe(row);
        await this.saveReplay(
          tx,
          userId,
          "platform.legal_hold.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async releaseLegalHold(
    userId: string,
    holdId: string,
    version: number,
    reason: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.privacy.override_hold",
      async (tx) => {
        const changed = await tx.legalHold.updateMany({
          where: { id: holdId, version, status: "ACTIVE" },
          data: {
            status: "RELEASED",
            releasedAt: new Date(),
            releasedById: userId,
            releaseReason: reason,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) this.conflict();
        const row = await tx.legalHold.findUniqueOrThrow({
          where: { id: holdId },
        });
        await this.action(
          tx,
          userId,
          "platform.privacy.override_hold",
          "legal_hold.release",
          "LEGAL_HOLD",
          holdId,
          reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async retentionRuns(userId: string) {
    return this.platformContext(
      userId,
      "platform.privacy.read",
      async (tx) => ({
        policies: (
          await tx.dataRetentionPolicy.findMany({
            where: { environment: this.environment.NODE_ENV, active: true },
            orderBy: [{ entityType: "asc" }, { version: "desc" }],
          })
        ).map((row) => this.safe(row)),
        items: (
          await tx.retentionExecution.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createRetentionRun(
    userId: string,
    input: {
      policyId: string;
      mode: "DRY_RUN" | "EXECUTE";
      limit: number;
      confirmation?: "EXECUTE_RETENTION";
      reason: string;
    },
    policyVersion: number,
    idempotencyKey: string,
    correlationId: string,
  ) {
    if (input.mode === "EXECUTE" && input.confirmation !== "EXECUTE_RETENTION")
      problem(
        "RETENTION_CONFIRMATION_REQUIRED",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Explicit retention confirmation required",
      );
    return this.platformContext(
      userId,
      "platform.privacy.process",
      async (tx) => {
        const replay = await tx.retentionExecution.findUnique({
          where: { idempotencyKey },
        });
        if (replay) return this.safe(replay);
        const policy = await tx.dataRetentionPolicy.findFirst({
          where: {
            id: input.policyId,
            environment: this.environment.NODE_ENV,
            active: true,
            version: policyVersion,
          },
        });
        if (!policy) this.conflict();
        this.assertRetentionAllowlisted(policy.entityType);
        const queryTo = new Date();
        const queryFrom = new Date(
          queryTo.getTime() - policy.retentionDays * 86_400_000,
        );
        const candidates = await this.retentionCandidates(
          tx,
          policy.entityType,
          queryFrom,
          input.limit,
        );
        const holds = candidates.length
          ? await tx.legalHold.findMany({
              where: {
                status: "ACTIVE",
                targetId: { in: candidates.map((item) => item.id) },
                OR: [
                  { targetType: policy.entityType },
                  { targetType: policy.entityType.toUpperCase() },
                  { targetType: "RETENTION_ITEM" },
                ],
              },
              select: { targetId: true },
            })
          : [];
        const heldIds = new Set(holds.map((hold) => hold.targetId));
        const eligible = candidates.filter((item) => !heldIds.has(item.id));
        const evidence = {
          allowlistKey: this.retentionAllowlistKey(policy.entityType),
          dryRun: input.mode === "DRY_RUN",
          candidateIdsSha256: this.hash(candidates.map((item) => item.id)),
          reason: input.reason,
          sharedDataBlocks: 0,
          categories: { eligible: eligible.length, legalHold: heldIds.size },
          mutated: false,
        };
        const run = await tx.retentionExecution.create({
          data: {
            policyId: policy.id,
            policyVersion: policy.version,
            entityType: policy.entityType,
            requestedById: userId,
            mode: input.mode,
            status: input.mode === "DRY_RUN" ? "SCANNING" : "PURGING",
            queryFrom,
            queryTo,
            candidateCount: candidates.length,
            scannedCount: candidates.length,
            heldCount: heldIds.size,
            estimatedBytes: candidates.reduce(
              (total, item) => total + BigInt(item.estimatedBytes),
              0n,
            ),
            idempotencyKey,
            startedAt: new Date(),
            evidence: this.json(evidence),
          },
        });
        let purgedCount = 0;
        let archivedCount = 0;
        if (input.mode === "EXECUTE" && eligible.length) {
          const outcome = await this.executeRetentionAllowlisted(
            tx,
            policy.entityType,
            eligible.map((item) => item.id),
          );
          purgedCount = outcome.purged;
          archivedCount = outcome.archived;
        }
        const completed = await tx.retentionExecution.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            purgedCount,
            archivedCount,
            completedAt: new Date(),
            evidence: this.json({
              ...evidence,
              mutated: input.mode === "EXECUTE",
              purgedCount,
              archivedCount,
            }),
          },
        });
        await this.action(
          tx,
          userId,
          "platform.privacy.process",
          input.mode === "DRY_RUN" ? "retention.dry_run" : "retention.execute",
          "RETENTION_EXECUTION",
          run.id,
          `${input.mode} policy ${policy.key}`,
          null,
          completed,
          correlationId,
        );
        return this.safe(completed);
      },
    );
  }

  async executeDeletion(
    userId: string,
    requestId: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.privacy.process",
      async (tx) => {
        const replay = await tx.deletionExecution.findUnique({
          where: { idempotencyKey },
        });
        if (replay) return this.safe(replay);
        const request = await tx.deletionRequest.findUnique({
          where: { id: requestId },
        });
        if (!request) this.notFound("Cererea de ștergere nu există.");
        const plan = await tx.deletionPlan.findUnique({
          where: { deletionRequestId: requestId },
        });
        if (!plan) this.notFound("Planul de ștergere nu există.");
        if (plan.graceEndsAt > new Date())
          problem(
            "DELETION_GRACE_ACTIVE",
            HttpStatus.CONFLICT,
            "Deletion grace period is still active",
          );
        const holds = await tx.legalHold.count({
          where: {
            targetId: request.targetId,
            status: "ACTIVE",
            OR: [
              { targetType: request.targetType },
              { targetType: request.targetType.replace("_ACCOUNT", "") },
            ],
          },
        });
        if (holds)
          problem(
            "LEGAL_HOLD_ACTIVE",
            HttpStatus.CONFLICT,
            "Legal hold blocks deletion execution",
          );
        await tx.$queryRaw`
          SELECT set_config('app.current_deletion_target_id', ${request.targetId}, true)
        `;
        const execution = await tx.deletionExecution.create({
          data: {
            deletionPlanId: plan.id,
            requestedById: userId,
            status: "RUNNING",
            idempotencyKey,
            startedAt: new Date(),
          },
        });
        const outcome = await this.executeDeletionPlan(
          tx,
          request.targetType,
          request.targetId,
        );
        const completed = await tx.deletionExecution.update({
          where: { id: execution.id },
          data: {
            status: "COMPLETED",
            anonymizedCount: outcome.anonymized,
            purgedCount: outcome.purged,
            preservedCount: outcome.preserved,
            result: this.json(outcome.result),
            completedAt: new Date(),
          },
        });
        await tx.deletionPlan.update({
          where: { id: plan.id },
          data: { status: "COMPLETED", version: { increment: 1 } },
        });
        await tx.deletionRequest.update({
          where: { id: request.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            tombstone: this.json(outcome.result),
            version: { increment: 1 },
          },
        });
        await this.action(
          tx,
          userId,
          "platform.privacy.process",
          "deletion.execute",
          request.targetType,
          request.targetId,
          reason,
          plan,
          completed,
          correlationId,
        );
        return this.safe(completed);
      },
    );
  }

  async backups(userId: string) {
    return this.platformContext(
      userId,
      "platform.release.read",
      async (tx) => ({
        items: (
          await tx.backupRun.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async backupSchedules(userId: string) {
    return this.platformContext(
      userId,
      "platform.release.read",
      async (tx) => ({
        destination: "SEPARATE_LOCAL_DESTINATION",
        productionDestination: "PRODUCTION_CONFIGURATION_REQUIRED",
        items: (
          await tx.backupSchedule.findMany({
            where: { environment: this.environment.NODE_ENV },
            orderBy: { key: "asc" },
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async updateBackupSchedule(
    userId: string,
    scheduleId: string,
    input: {
      cronExpression: string;
      timezone: string;
      retentionDays: number;
      minimumVerified: number;
      reason: string;
      version: number;
    },
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.release.approve",
      async (tx) => {
        const before = await tx.backupSchedule.findFirst({
          where: {
            id: scheduleId,
            environment: this.environment.NODE_ENV,
          },
        });
        if (!before) this.notFound("Programarea de backup nu există.");
        const changed = await tx.backupSchedule.updateMany({
          where: { id: scheduleId, version: input.version },
          data: {
            cronExpression: input.cronExpression,
            timezone: input.timezone,
            retentionDays: input.retentionDays,
            minimumVerified: input.minimumVerified,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) this.conflict();
        const after = await tx.backupSchedule.findUniqueOrThrow({
          where: { id: scheduleId },
        });
        await this.action(
          tx,
          userId,
          "platform.release.approve",
          "backup.schedule.update",
          "BACKUP_SCHEDULE",
          scheduleId,
          input.reason,
          before,
          after,
          correlationId,
        );
        return this.safe(after);
      },
    );
  }

  async setBackupScheduleEnabled(
    userId: string,
    scheduleId: string,
    version: number,
    enabled: boolean,
    reason: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.release.approve",
      async (tx) => {
        const changed = await tx.backupSchedule.updateMany({
          where: {
            id: scheduleId,
            environment: this.environment.NODE_ENV,
            version,
          },
          data: {
            enabled,
            leaseOwner: null,
            leaseExpiresAt: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) this.conflict();
        const row = await tx.backupSchedule.findUniqueOrThrow({
          where: { id: scheduleId },
        });
        await this.action(
          tx,
          userId,
          "platform.release.approve",
          enabled ? "backup.schedule.resume" : "backup.schedule.pause",
          "BACKUP_SCHEDULE",
          scheduleId,
          reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async createBackup(
    userId: string,
    backupType: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.release.approve",
      async (tx) => {
        const existing = await tx.backupRun.findUnique({
          where: {
            environment_idempotencyKey: {
              environment: this.environment.NODE_ENV,
              idempotencyKey,
            },
          },
        });
        if (existing) return this.safe(existing);
        const row = await tx.backupRun.create({
          data: {
            environment: this.environment.NODE_ENV,
            requestedById: userId,
            idempotencyKey,
            backupType,
            manifest: this.json({
              reason,
              execution: "managed-local-runner",
              encrypted: true,
            }),
          },
        });
        await this.action(
          tx,
          userId,
          "platform.release.approve",
          "backup.request",
          "BACKUP_RUN",
          row.id,
          reason,
          null,
          row,
          correlationId,
        );
        await this.event(tx, {
          eventName: "backup.requested.v1",
          aggregateType: "BackupRun",
          aggregateId: row.id,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          summary: "Backup criptat solicitat.",
        });
        return this.safe(row);
      },
    );
  }

  async backup(userId: string, backupId: string) {
    return this.platformContext(userId, "platform.release.read", async (tx) => {
      const row = await tx.backupRun.findUnique({ where: { id: backupId } });
      if (!row) this.notFound("Backup-ul nu există.");
      const artifacts = await tx.backupArtifact.findMany({
        where: { backupRunId: backupId },
      });
      const verifications = await tx.backupVerification.findMany({
        where: { backupRunId: backupId },
      });
      return {
        ...this.safe(row),
        artifacts: artifacts.map((item) => this.safe(item)),
        verifications: verifications.map((item) => this.safe(item)),
      };
    });
  }

  async verifyBackup(
    userId: string,
    backupId: string,
    reason: string,
    correlationId: string,
  ) {
    return this.platformContext(
      userId,
      "platform.release.approve",
      async (tx) => {
        const backup = await tx.backupRun.findUnique({
          where: { id: backupId },
        });
        if (!backup) this.notFound("Backup-ul nu există.");
        const artifacts = await tx.backupArtifact.count({
          where: { backupRunId: backupId },
        });
        const status =
          backup.status === "COMPLETED" && artifacts > 0
            ? "VERIFIED"
            : "FAILED";
        const row = await tx.backupVerification.create({
          data: {
            backupRunId: backupId,
            status,
            checks: this.json({
              completed: backup.status === "COMPLETED",
              artifacts,
            }),
            verifiedById: userId,
          },
        });
        await this.action(
          tx,
          userId,
          "platform.release.approve",
          "backup.verify",
          "BACKUP_RUN",
          backupId,
          reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async restores(userId: string) {
    return this.platformContext(
      userId,
      "platform.release.read",
      async (tx) => ({
        items: (
          await tx.restoreRun.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async createRestore(
    userId: string,
    backupRunId: string,
    target: string,
    reason: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    if (
      this.environment.NODE_ENV === "production" &&
      !target.startsWith("isolated-")
    ) {
      problem(
        "RESTORE_TARGET_DENIED",
        HttpStatus.CONFLICT,
        "Production restore must target an isolated environment",
      );
    }
    return this.platformContext(
      userId,
      "platform.release.approve",
      async (tx) => {
        const backup = await tx.backupRun.findUnique({
          where: { id: backupRunId },
        });
        if (!backup || backup.status !== "COMPLETED")
          problem(
            "BACKUP_NOT_RESTORABLE",
            HttpStatus.CONFLICT,
            "Backup not restorable",
          );
        const row = await tx.restoreRun.create({
          data: {
            backupRunId,
            environment: this.environment.NODE_ENV,
            target,
            requestedById: userId,
            reason,
            idempotencyKey,
          },
        });
        await this.action(
          tx,
          userId,
          "platform.release.approve",
          "restore.request",
          "RESTORE_RUN",
          row.id,
          reason,
          null,
          row,
          correlationId,
        );
        return this.safe(row);
      },
    );
  }

  async restore(userId: string, restoreId: string) {
    return this.platformContext(userId, "platform.release.read", async (tx) => {
      const row = await tx.restoreRun.findUnique({ where: { id: restoreId } });
      if (!row) this.notFound("Restore-ul nu există.");
      const validations = await tx.restoreValidation.findMany({
        where: { restoreRunId: restoreId },
      });
      return {
        ...this.safe(row),
        validations: validations.map((item) => this.safe(item)),
      };
    });
  }

  async releaseCandidates(userId: string) {
    return this.platformContext(
      userId,
      "platform.release.read",
      async (tx) => ({
        items: (
          await tx.releaseCandidate.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        ).map((row) => this.safe(row)),
      }),
    );
  }

  async privacyOverview(userId: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const [consents, withdrawals, cookie, requests, deletions, sessions] =
        await Promise.all([
          tx.userConsentRecord.findMany({
            where: { userId },
            orderBy: { occurredAt: "desc" },
          }),
          tx.consentWithdrawal.findMany({
            where: { userId },
            orderBy: { occurredAt: "desc" },
          }),
          tx.cookiePreference.findUnique({ where: { userId } }),
          tx.dataSubjectRequest.findMany({
            where: { requesterUserId: userId },
            orderBy: { createdAt: "desc" },
          }),
          tx.deletionRequest.findMany({
            where: { requesterUserId: userId },
            orderBy: { createdAt: "desc" },
          }),
          tx.session.findMany({
            where: { userId },
            orderBy: { lastSeenAt: "desc" },
          }),
        ]);
      return {
        consents: consents.map((row) => this.safe(row)),
        withdrawals: withdrawals.map((row) => this.safe(row)),
        cookie: cookie
          ? this.safe(cookie)
          : {
              essential: true,
              preferences: false,
              analytics: false,
              marketing: false,
            },
        requests: requests.map((row) => this.safe(row)),
        deletions: deletions.map((row) => this.safe(row)),
        sessions: sessions.map((row) => ({
          id: row.id,
          active: !row.revokedAt && row.expiresAt > new Date(),
          lastSeenAt: row.lastSeenAt.toISOString(),
        })),
        retentionNotice:
          "Unele date pot fi păstrate pentru obligații contractuale, financiare, de securitate sau legale.",
      };
    });
  }

  async recordConsent(
    userId: string,
    input: {
      purpose: string;
      granted: boolean;
      legalDocumentVersionId?: string | null;
      source: string;
    },
    correlationId: string,
  ) {
    return this.database.withContext({ userId, correlationId }, async (tx) => {
      const row = await tx.userConsentRecord.create({
        data: {
          userId,
          purpose: input.purpose,
          processingBasis: "CONSENT",
          legalDocumentVersionId: input.legalDocumentVersionId,
          status: input.granted ? "GRANTED" : "WITHDRAWN",
          source: input.source,
          withdrawnAt: input.granted ? null : new Date(),
        },
      });
      await this.event(tx, {
        eventName: "privacy.consent_recorded.v1",
        aggregateType: "UserConsentRecord",
        aggregateId: row.id,
        actorUserId: userId,
        correlationId,
        summary: `Preferința ${input.purpose} a fost înregistrată.`,
      });
      return this.safe(row);
    });
  }

  async withdrawConsent(
    userId: string,
    consentId: string,
    reason: string | undefined,
    correlationId: string,
  ) {
    return this.database.withContext({ userId, correlationId }, async (tx) => {
      const consent = await tx.userConsentRecord.findFirst({
        where: { id: consentId, userId },
      });
      if (!consent) this.notFound("Consimțământul nu există.");
      const row = await tx.consentWithdrawal.create({
        data: { consentId, userId, reason },
      });
      await this.event(tx, {
        eventName: "privacy.consent_withdrawn.v1",
        aggregateType: "UserConsentRecord",
        aggregateId: consentId,
        actorUserId: userId,
        correlationId,
        summary: `Consimțământul ${consent.purpose} a fost retras.`,
      });
      return this.safe(row);
    });
  }

  async saveCookiePreference(
    userId: string,
    input: { preferences: boolean; analytics: boolean; marketing: boolean },
  ) {
    return this.database.withContext({ userId }, async (tx) =>
      this.safe(
        await tx.cookiePreference.upsert({
          where: { userId },
          update: {
            ...input,
            essential: true,
            source: "SETTINGS",
            version: { increment: 1 },
          },
          create: { userId, ...input, essential: true, source: "SETTINGS" },
        }),
      ),
    );
  }

  async createDataSubjectRequest(
    userId: string,
    input: DataSubjectInput,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext({ userId, correlationId }, async (tx) => {
      const existing = await tx.dataSubjectRequest.findUnique({
        where: {
          requesterUserId_idempotencyKey: {
            requesterUserId: userId,
            idempotencyKey,
          },
        },
      });
      if (existing) return this.safe(existing);
      const row = await tx.dataSubjectRequest.create({
        data: {
          requesterUserId: userId,
          type: input.type,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          details: input.details,
          idempotencyKey,
          dueAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      if (input.type === "EXPORT") {
        await this.asyncEvents.record(tx, {
          eventName: "privacy.export_requested.v1",
          aggregateType: "DataSubjectRequest",
          aggregateId: row.id,
          aggregateVersion: row.version,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `privacy-export:${row.id}`,
          userVisibleJob: true,
          payload: {
            subject: { requestId: row.id, requestedByUserId: userId },
            privacyExport: { requestId: row.id, requestedByUserId: userId },
          },
        });
      } else {
        await this.event(tx, {
          eventName: "privacy.request_submitted.v1",
          aggregateType: "DataSubjectRequest",
          aggregateId: row.id,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          summary: `Cerere privacy ${input.type} înregistrată pentru verificare.`,
        });
      }
      return this.safe(row);
    });
  }

  async myDataSubjectRequests(userId: string) {
    return this.database.withContext({ userId }, async (tx) => ({
      items: (
        await tx.dataSubjectRequest.findMany({
          where: { requesterUserId: userId },
          orderBy: { createdAt: "desc" },
        })
      ).map((row) => this.safe(row)),
    }));
  }

  async myDataSubjectRequest(userId: string, requestId: string) {
    return this.database.withContext({ userId }, async (tx) => {
      const row = await tx.dataSubjectRequest.findFirst({
        where: { id: requestId, requesterUserId: userId },
      });
      if (!row) this.notFound("Cererea nu există.");
      return this.safe(row);
    });
  }

  async createDeletionRequest(
    userId: string,
    input: { targetType: string; targetId: string; reason: string },
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext({ userId, correlationId }, async (tx) => {
      const existing = await tx.deletionRequest.findUnique({
        where: {
          requesterUserId_idempotencyKey: {
            requesterUserId: userId,
            idempotencyKey,
          },
        },
      });
      if (existing) return this.safe(existing);
      const holds = await tx.legalHold.count({
        where: {
          targetType: input.targetType.replace("_ACCOUNT", ""),
          targetId: input.targetId,
          status: "ACTIVE",
        },
      });
      const row = await tx.deletionRequest.create({
        data: {
          requesterUserId: userId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          idempotencyKey,
          impact: this.json({
            requiresVerification: true,
            legalHoldCount: holds,
            sharedDataReview: true,
          }),
          plan: this.json({ gracePeriodDays: 14, immediateDeletion: false }),
        },
      });
      const blockers = await this.deletionBlockers(
        tx,
        input.targetType,
        input.targetId,
      );
      const durablePlan = await tx.deletionPlan.create({
        data: {
          deletionRequestId: row.id,
          targetType: input.targetType,
          targetId: input.targetId,
          status: blockers.length ? "BLOCKED" : "GRACE",
          graceEndsAt: new Date(Date.now() + 14 * 86_400_000),
          steps: this.json(this.deletionSteps(input.targetType)),
          preservation: this.json(this.deletionPreservation(input.targetType)),
          blockers: this.json(blockers),
        },
      });
      await this.event(tx, {
        eventName: "privacy.deletion_requested.v1",
        aggregateType: "DeletionRequest",
        aggregateId: row.id,
        actorUserId: userId,
        correlationId,
        idempotencyKey,
        summary:
          "Cererea de ștergere a fost înregistrată pentru verificare și impact analysis.",
      });
      return this.safe({ ...row, durablePlan });
    });
  }

  async assertScopedPrivacyOwner(
    userId: string,
    scopeType: "WORKSPACE" | "VENDOR_ORGANIZATION",
    scopeId: string,
  ) {
    if (scopeType === "WORKSPACE") {
      return this.database.withContext(
        { userId, workspaceId: scopeId },
        async (tx) => {
          const membership = await tx.workspaceMembership.findFirst({
            where: { workspaceId: scopeId, userId, status: "ACTIVE" },
            include: { roleTemplate: true },
          });
          if (!membership || membership.roleTemplate.key !== "couple_owner") {
            problem(
              "FORBIDDEN",
              HttpStatus.FORBIDDEN,
              "Workspace owner required",
            );
          }
          return true;
        },
      );
    }
    return this.database.withContext(
      { userId, vendorOrganizationId: scopeId },
      async (tx) => {
        const organization = await tx.vendorOrganization.findFirst({
          where: { id: scopeId, createdById: userId, deletedAt: null },
          select: { id: true },
        });
        if (!organization) {
          problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Vendor owner required");
        }
        return true;
      },
    );
  }

  private retentionAllowlistKey(entityType: string) {
    const allowlist: Record<string, string> = {
      sessions: "EXPIRED_SESSION",
      auth_one_time_tokens: "AUTH_TOKEN",
      notifications: "NOTIFICATION",
      activity_items: "ACTIVITY",
      provider_events: "PROVIDER_EVENT",
      copilot_records: "COPILOT_CONVERSATION",
      generated_artifacts: "DOCUMENT_OBJECT",
      platform_support_cases: "SUPPORT_CASE",
      check_in_events: "CHECK_IN_EVENT",
      guest_moments: "GUEST_MOMENT",
    };
    return allowlist[entityType];
  }

  private assertRetentionAllowlisted(entityType: string) {
    if (!this.retentionAllowlistKey(entityType))
      problem(
        "RETENTION_ENTITY_DENIED",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Retention entity is not in the executable allowlist",
      );
  }

  private async retentionCandidates(
    tx: Transaction,
    entityType: string,
    before: Date,
    limit: number,
  ): Promise<Array<{ id: string; estimatedBytes: number }>> {
    const map = (rows: Array<{ id: string }>) =>
      rows.map(({ id }) => ({ id, estimatedBytes: 0 }));
    switch (entityType) {
      case "sessions":
        return map(
          await tx.session.findMany({
            where: { expiresAt: { lt: before } },
            select: { id: true },
            orderBy: { expiresAt: "asc" },
            take: limit,
          }),
        );
      case "auth_one_time_tokens":
        return map(
          await tx.authOneTimeToken.findMany({
            where: { expiresAt: { lt: before } },
            select: { id: true },
            orderBy: { expiresAt: "asc" },
            take: limit,
          }),
        );
      case "notifications":
        return map(
          await tx.notification.findMany({
            where: { createdAt: { lt: before } },
            select: { id: true },
            orderBy: { createdAt: "asc" },
            take: limit,
          }),
        );
      case "activity_items":
        return map(
          await tx.activityItem.findMany({
            where: { occurredAt: { lt: before } },
            select: { id: true },
            orderBy: { occurredAt: "asc" },
            take: limit,
          }),
        );
      case "generated_artifacts": {
        const rows = await tx.generatedArtifact.findMany({
          where: { expiresAt: { lt: before }, deletedAt: null },
          select: { id: true, sizeBytes: true },
          orderBy: { expiresAt: "asc" },
          take: limit,
        });
        return rows.map(({ id, sizeBytes }) => ({
          id,
          estimatedBytes: Number(sizeBytes ?? 0n),
        }));
      }
      case "provider_events":
        return map(
          await tx.providerWebhookEvent.findMany({
            where: { processedAt: { lt: before } },
            select: { id: true },
            orderBy: { processedAt: "asc" },
            take: limit,
          }),
        );
      case "copilot_records":
        return map(
          await tx.copilotConversation.findMany({
            where: { updatedAt: { lt: before }, status: "ACTIVE" },
            select: { id: true },
            orderBy: { updatedAt: "asc" },
            take: limit,
          }),
        );
      case "platform_support_cases":
        return map(
          await tx.platformSupportCase.findMany({
            where: { closedAt: { lt: before } },
            select: { id: true },
            orderBy: { closedAt: "asc" },
            take: limit,
          }),
        );
      case "guest_moments":
        return map(
          await tx.guestMoment.findMany({
            where: { createdAt: { lt: before }, status: "REJECTED" },
            select: { id: true },
            orderBy: { createdAt: "asc" },
            take: limit,
          }),
        );
      default:
        return [];
    }
  }

  private async executeRetentionAllowlisted(
    tx: Transaction,
    entityType: string,
    ids: string[],
  ): Promise<{ purged: number; archived: number }> {
    switch (entityType) {
      case "sessions":
        return {
          purged: (await tx.session.deleteMany({ where: { id: { in: ids } } }))
            .count,
          archived: 0,
        };
      case "auth_one_time_tokens":
        return {
          purged: (
            await tx.authOneTimeToken.deleteMany({ where: { id: { in: ids } } })
          ).count,
          archived: 0,
        };
      case "notifications":
        return {
          purged: (
            await tx.notification.deleteMany({ where: { id: { in: ids } } })
          ).count,
          archived: 0,
        };
      case "provider_events":
        return {
          purged: (
            await tx.providerWebhookEvent.deleteMany({
              where: { id: { in: ids } },
            })
          ).count,
          archived: 0,
        };
      case "activity_items": {
        const result = await tx.activityItem.updateMany({
          where: { id: { in: ids } },
          data: {
            actorUserId: null,
            actorName: null,
            summary: "[retention anonymized]",
            metadata: this.json({ retained: true, personalData: false }),
          },
        });
        return { purged: 0, archived: result.count };
      }
      case "generated_artifacts": {
        const result = await tx.generatedArtifact.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: new Date() },
        });
        return { purged: 0, archived: result.count };
      }
      case "copilot_records": {
        const result = await tx.copilotConversation.updateMany({
          where: { id: { in: ids } },
          data: { status: "ARCHIVED", version: { increment: 1 } },
        });
        return { purged: 0, archived: result.count };
      }
      case "platform_support_cases": {
        const result = await tx.platformSupportCase.updateMany({
          where: { id: { in: ids } },
          data: {
            requesterUserId: null,
            subject: "[retention anonymized]",
            description: "[retention anonymized]",
            version: { increment: 1 },
          },
        });
        return { purged: 0, archived: result.count };
      }
      default:
        return { purged: 0, archived: 0 };
    }
  }

  private async deletionBlockers(
    tx: Transaction,
    targetType: string,
    targetId: string,
  ) {
    const blockers: string[] = [];
    const holds = await tx.legalHold.count({
      where: {
        targetId,
        status: "ACTIVE",
        OR: [
          { targetType },
          { targetType: targetType.replace("_ACCOUNT", "") },
        ],
      },
    });
    if (holds) blockers.push("ACTIVE_LEGAL_HOLD");
    if (targetType === "USER_ACCOUNT") {
      const ownerships = await tx.workspaceMembership.count({
        where: {
          userId: targetId,
          status: "ACTIVE",
          roleTemplate: { key: "couple_owner" },
          workspace: { status: "ACTIVE" },
        },
      });
      if (ownerships) blockers.push("WORKSPACE_OWNERSHIP_TRANSFER_REQUIRED");
    }
    return blockers;
  }

  private deletionSteps(targetType: string) {
    const common = ["RECHECK_LEGAL_HOLD", "REVOKE_ACCESS", "WRITE_TOMBSTONE"];
    if (targetType === "USER_ACCOUNT")
      return [
        ...common,
        "REMOVE_AUTH_SECRETS",
        "ANONYMIZE_PROFILE",
        "ANONYMIZE_AUTHORED_CONTENT",
      ];
    if (targetType === "WORKSPACE" || targetType === "WEDDING_WORKSPACE")
      return [
        ...common,
        "PURGE_WEDDING_PRIVATE_DATA",
        "RETAIN_SHARED_CONTRACTS",
        "RETAIN_FINANCIAL_LEDGER",
      ];
    return [
      ...common,
      "UNPUBLISH_VENDOR_PROFILE",
      "RETAIN_SHARED_BOOKINGS",
      "RETAIN_PAYOUT_LEDGER",
    ];
  }

  private deletionPreservation(targetType: string) {
    return targetType === "USER_ACCOUNT"
      ? ["PAYMENT_FACTS", "SIGNED_CONTRACTS", "SECURITY_AUDIT"]
      : targetType === "WORKSPACE" || targetType === "WEDDING_WORKSPACE"
        ? ["SHARED_VENDOR_CONTRACTS", "PAYMENT_LEDGER", "PUBLIC_REVIEWS"]
        : ["WEDDING_CONTRACTS", "SETTLEMENTS", "TAX_PROVIDER_METADATA"];
  }

  private async executeDeletionPlan(
    tx: Transaction,
    targetType: string,
    targetId: string,
  ) {
    if (targetType === "USER_ACCOUNT") {
      await tx.session.deleteMany({ where: { userId: targetId } });
      await tx.authOneTimeToken.deleteMany({ where: { userId: targetId } });
      await tx.identity.updateMany({
        where: { userId: targetId },
        data: { passwordHash: null, providerSubject: null },
      });
      await tx.userProfile.updateMany({
        where: { userId: targetId },
        data: {
          firstName: "Deleted",
          lastName: "User",
          avatarUrl: null,
          version: { increment: 1 },
        },
      });
      await tx.workspaceMembership.updateMany({
        where: { userId: targetId, status: "ACTIVE" },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await tx.user.update({
        where: { id: targetId },
        data: {
          email: `deleted+${targetId}@invalid.weddingos.local`,
          status: "DISABLED",
          marketingConsent: false,
          version: { increment: 1 },
        },
      });
      return {
        anonymized: 1,
        purged: 2,
        preserved: 3,
        result: {
          targetType,
          tombstoneId: targetId,
          financialFacts: "retained",
        },
      };
    }
    if (targetType === "WORKSPACE" || targetType === "WEDDING_WORKSPACE") {
      const expenses = await tx.expenseRecord.deleteMany({
        where: { workspaceId: targetId },
      });
      const items = await tx.budgetItem.deleteMany({
        where: { workspaceId: targetId },
      });
      const categories = await tx.budgetCategory.deleteMany({
        where: { workspaceId: targetId },
      });
      const plans = await tx.budgetPlan.deleteMany({
        where: { workspaceId: targetId },
      });
      await tx.workspaceMembership.updateMany({
        where: { workspaceId: targetId, status: "ACTIVE" },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await tx.workspace.update({
        where: { id: targetId },
        data: {
          status: "ARCHIVED",
          title: "Deleted workspace",
          imageUrl: null,
          version: { increment: 1 },
        },
      });
      return {
        anonymized: 1,
        purged: expenses.count + items.count + categories.count + plans.count,
        preserved: 2,
        result: {
          targetType,
          tombstoneId: targetId,
          sharedContracts: "retained",
          financialLedger: "retained",
          privateBudget: "purged",
        },
      };
    }
    if (targetType === "VENDOR_ORGANIZATION") {
      await tx.vendorOrganizationMembership.updateMany({
        where: { vendorOrganizationId: targetId, status: "ACTIVE" },
        data: { status: "REMOVED", removedAt: new Date() },
      });
      await tx.vendorOrganization.update({
        where: { id: targetId },
        data: {
          status: "ARCHIVED",
          displayName: "Deleted vendor",
          contactEmail: `deleted+${targetId}@invalid.weddingos.local`,
          contactPhoneEncrypted: null,
          billingEmailEncrypted: null,
          registrationNumberEncrypted: null,
          taxIdEncrypted: null,
          websiteUrl: null,
          deletedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return {
        anonymized: 1,
        purged: 0,
        preserved: 3,
        result: {
          targetType,
          tombstoneId: targetId,
          sharedWeddingContracts: "retained",
          payoutLedger: "retained",
        },
      };
    }
    problem(
      "DELETION_TARGET_DENIED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Deletion target type is not supported",
    );
  }

  private async platformContext<T>(
    userId: string,
    capability: CapabilityKey,
    operation: (tx: Transaction) => Promise<T>,
  ) {
    return this.database.withContext({ userId }, async (tx) => {
      await this.assertPlatformCapability(tx, capability);
      return operation(tx);
    });
  }

  private async assertPlatformCapability(
    tx: Transaction,
    capability: CapabilityKey,
  ) {
    const result = await tx.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT public.weddingos_has_platform_capability(${capability}) AS allowed
    `;
    if (!result[0]?.allowed) {
      problem(
        "PLATFORM_CAPABILITY_REQUIRED",
        HttpStatus.FORBIDDEN,
        "Platform capability required",
        undefined,
        undefined,
        { requiredCapability: capability },
      );
    }
  }

  private async assertLabelTarget(
    tx: Transaction,
    targetType: PlatformLabelAssignmentInput["targetType"],
    targetId: string,
  ) {
    const exists =
      targetType === "USER"
        ? await tx.user.count({ where: { id: targetId } })
        : targetType === "WORKSPACE"
          ? await tx.workspace.count({ where: { id: targetId } })
          : targetType === "VENDOR_ORGANIZATION"
            ? await tx.vendorOrganization.count({ where: { id: targetId } })
            : await tx.platformSupportCase.count({ where: { id: targetId } });
    if (!exists)
      this.notFound(
        "Ținta etichetei nu există sau nu este vizibilă rolului curent.",
      );
  }

  private async action(
    tx: Transaction,
    actorUserId: string,
    capability: CapabilityKey,
    action: string,
    targetType: string,
    targetId: string,
    reason: string,
    before: unknown,
    after: unknown,
    correlationId: string,
  ) {
    await tx.platformAdminAction.create({
      data: {
        actorUserId,
        capability,
        action,
        targetType,
        targetId,
        environment: this.environment.NODE_ENV,
        reason,
        beforeRedacted:
          before == null ? undefined : this.json(this.safe(before)),
        afterRedacted: after == null ? undefined : this.json(this.safe(after)),
        outcome: "SUCCESS",
        correlationId,
      },
    });
  }

  private async event(
    tx: Transaction,
    input: {
      eventName: string;
      aggregateType: string;
      aggregateId: string;
      actorUserId: string;
      correlationId: string;
      summary: string;
      idempotencyKey?: string;
    },
  ) {
    await this.asyncEvents.record(tx, {
      ...input,
      deduplicationKey: `platform:${input.eventName}:${input.aggregateId}:${input.idempotencyKey ?? randomUUID()}`,
      payload: {
        subject: { id: input.aggregateId },
        activity: {
          category: "platform",
          action: input.eventName,
          summary: input.summary,
          entityType: input.aggregateType,
          entityId: input.aggregateId,
        },
      },
    });
  }

  private async replay(
    tx: Transaction,
    actorUserId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const existing = await tx.idempotencyRecord.findUnique({
      where: { actorUserId_operation_key: { actorUserId, operation, key } },
    });
    if (!existing) return null;
    if (existing.requestHash !== this.hash(request)) {
      problem(
        "IDEMPOTENCY_KEY_REUSED",
        HttpStatus.CONFLICT,
        "Idempotency key reused with different payload",
      );
    }
    return this.safe(existing.responseBody);
  }

  private async saveReplay(
    tx: Transaction,
    actorUserId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        actorUserId,
        operation,
        key,
        requestHash: this.hash(request),
        responseStatus: 200,
        responseBody: this.json(response),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  private hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private safe<T>(value: T): T {
    return JSON.parse(
      JSON.stringify(value, (_key, item: unknown) =>
        typeof item === "bigint" ? item.toString() : item,
      ),
    ) as T;
  }

  private conflict(): never {
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Version conflict",
      "Resursa a fost modificată între timp.",
    );
  }

  private notFound(detail: string): never {
    problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Not found", detail);
  }
}

function supportPriorityRank(priority: string) {
  return { LOW: 0, NORMAL: 10, HIGH: 20, URGENT: 30 }[priority] ?? 10;
}

function registrationIntentRoute(intent: RegistrationIntent) {
  return intent === "SERVICE_PROVIDER" ? "/vendor" : "/overview";
}

function rangeStart(range: PlatformRange) {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

function buildDailyTrend(
  range: PlatformRange,
  users: Array<{ createdAt: Date }>,
  workspaces: Array<{ createdAt: Date }>,
  transactions: Array<{
    createdAt: Date;
    totalMinor: bigint;
    currency: string;
    status: string;
  }>,
) {
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const buckets = new Map<
    string,
    { date: string; users: number; workspaces: number; revenueMinor: bigint }
  >();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { date: key, users: 0, workspaces: 0, revenueMinor: 0n });
  }
  for (const item of users) {
    const bucket = buckets.get(item.createdAt.toISOString().slice(0, 10));
    if (bucket) bucket.users += 1;
  }
  for (const item of workspaces) {
    const bucket = buckets.get(item.createdAt.toISOString().slice(0, 10));
    if (bucket) bucket.workspaces += 1;
  }
  for (const item of transactions) {
    if (!/COMPLETED|PAID|SUCCESS/i.test(item.status)) continue;
    const bucket = buckets.get(item.createdAt.toISOString().slice(0, 10));
    if (bucket) bucket.revenueMinor += item.totalMinor;
  }
  return [...buckets.values()];
}
