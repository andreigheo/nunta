import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type {
  CapabilityKey,
  UpdateNotificationPreference,
  UpdateUserPreference,
} from "@weddingos/contracts";
import { capabilityKeySchema } from "@weddingos/contracts";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { AuditService } from "../audit/audit.service";
import { API_ENVIRONMENT } from "../common/environment.module";

const themeFromDatabase = {
  LIGHT: "light",
  DARK: "dark",
  SYSTEM: "system",
} as const;

const themeToDatabase = {
  light: "LIGHT",
  dark: "DARK",
  system: "SYSTEM",
} as const;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async currentUser(userId: string) {
    const [user, workspaceCount, vendorOrganizationCount, globalCapabilities] =
      await Promise.all([
        this.database.user.findUnique({
          where: { id: userId },
          include: { profile: true, preference: true },
        }),
        this.database.withContext({ userId }, (transaction) =>
          transaction.workspaceMembership.count({
            where: { userId, status: "ACTIVE" },
          }),
        ),
        this.database.withContext({ userId }, (transaction) =>
          transaction.vendorOrganizationMembership.count({
            where: { userId, status: "ACTIVE" },
          }),
        ),
        this.platformCapabilities(userId),
      ]);
    if (!user || !user.profile || !user.preference) {
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "User not found");
    }
    return {
      user: {
        id: user.id,
        firstName: user.profile.firstName,
        lastName: user.profile.lastName,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      preferences: {
        locale: user.preference.locale,
        timezone: user.preference.timezone,
        theme: themeFromDatabase[user.preference.theme],
        registrationIntent: user.preference.registrationIntent,
      },
      globalCapabilities,
      contexts: {
        workspaces: workspaceCount > 0,
        vendorOrganizations: vendorOrganizationCount > 0,
        platform: globalCapabilities.length > 0,
      },
    };
  }

  private async platformCapabilities(userId: string): Promise<CapabilityKey[]> {
    return this.database.withContext({ userId }, async (transaction) => {
      const now = new Date();
      const [roleGrants, directGrants] = await Promise.all([
        transaction.platformGrant.findMany({
          where: {
            userId,
            environment: this.environment.NODE_ENV,
            active: true,
            revokedAt: null,
            validFrom: { lte: now },
            OR: [{ validUntil: null }, { validUntil: { gt: now } }],
          },
          select: { roleId: true },
        }),
        transaction.platformCapabilityGrant.findMany({
          where: { userId, active: true, revokedAt: null },
          select: { capability: true },
        }),
      ]);
      const roles = roleGrants.length
        ? await transaction.platformRole.findMany({
            where: { id: { in: roleGrants.map((grant) => grant.roleId) } },
            select: { capabilities: true },
          })
        : [];
      const effective = new Set<CapabilityKey>();
      for (const value of [
        ...directGrants.map((grant) => grant.capability),
        ...roles.flatMap((role) =>
          Array.isArray(role.capabilities) ? role.capabilities.map(String) : [],
        ),
      ]) {
        const parsed = capabilityKeySchema.safeParse(value);
        if (parsed.success) effective.add(parsed.data);
      }
      return [...effective].sort();
    });
  }

  async updateProfile(userId: string, firstName: string, lastName: string) {
    const profile = await this.database.userProfile.update({
      where: { userId },
      data: {
        firstName,
        lastName,
        version: { increment: 1 },
      },
    });
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      version: profile.version,
    };
  }

  async sessions(userId: string, currentSessionId: string) {
    const sessions = await this.database.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
    return sessions.map((session) => ({
      id: session.id,
      current: session.id === currentSessionId,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    requestId: string,
    correlationId: string,
  ) {
    const result = await this.database.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count !== 1) {
      problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Session not found");
    }
    await this.audit.record({
      action: "session.revoked.v1",
      actorUserId: userId,
      entityType: "session",
      entityId: sessionId,
      requestId,
      correlationId,
    });
  }

  async preference(userId: string) {
    const preference = await this.database.userPreference.findUniqueOrThrow({
      where: { userId },
    });
    return {
      locale: preference.locale,
      timezone: preference.timezone,
      theme: themeFromDatabase[preference.theme],
      registrationIntent: preference.registrationIntent,
      lastActiveWorkspaceId: preference.lastActiveWorkspaceId,
    };
  }

  async updatePreference(userId: string, input: UpdateUserPreference) {
    if (input.lastActiveWorkspaceId) {
      const workspaceId = input.lastActiveWorkspaceId;
      const active = await this.database.withContext(
        { userId, workspaceId },
        (transaction) =>
          transaction.workspaceMembership.count({
            where: { workspaceId, userId, status: "ACTIVE" },
          }),
      );
      if (active !== 1)
        problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Workspace access denied");
    }
    const preference = await this.database.userPreference.update({
      where: { userId },
      data: {
        locale: input.locale,
        timezone: input.timezone,
        theme: input.theme ? themeToDatabase[input.theme] : undefined,
        registrationIntent: input.registrationIntent,
        lastActiveWorkspaceId: input.lastActiveWorkspaceId,
        version: { increment: 1 },
      },
    });
    return {
      locale: preference.locale,
      timezone: preference.timezone,
      theme: themeFromDatabase[preference.theme],
      registrationIntent: preference.registrationIntent,
      lastActiveWorkspaceId: preference.lastActiveWorkspaceId,
    };
  }

  async notificationPreference(userId: string) {
    const preference =
      await this.database.notificationPreference.findUniqueOrThrow({
        where: { userId },
      });
    return {
      securityEmail: preference.securityEmail,
      tasksEmail: preference.tasksEmail,
      paymentsEmail: preference.paymentsEmail,
      rsvpEmail: preference.rsvpEmail,
      vendorsEmail: preference.vendorsEmail,
      digestEmail: preference.digestEmail,
      marketingEmail: preference.marketingEmail,
      productPush: preference.productPush,
      quietHoursStart: preference.quietHoursStart,
      quietHoursEnd: preference.quietHoursEnd,
    };
  }

  async updateNotificationPreference(
    userId: string,
    input: UpdateNotificationPreference,
  ) {
    const preference = await this.database.notificationPreference.update({
      where: { userId },
      data: { ...input, version: { increment: 1 } },
    });
    return {
      securityEmail: preference.securityEmail,
      tasksEmail: preference.tasksEmail,
      paymentsEmail: preference.paymentsEmail,
      rsvpEmail: preference.rsvpEmail,
      vendorsEmail: preference.vendorsEmail,
      digestEmail: preference.digestEmail,
      marketingEmail: preference.marketingEmail,
      productPush: preference.productPush,
      quietHoursStart: preference.quietHoursStart,
      quietHoursEnd: preference.quietHoursEnd,
    };
  }

  mfaFoundation(): never {
    const detail = this.environment.FEATURE_MFA_ENABLED
      ? "Fluxul MFA nu este activat pentru utilizatorii couple în Slice 1."
      : "MFA este dezactivat prin feature flag.";
    return problem(
      "FEATURE_DISABLED",
      HttpStatus.NOT_IMPLEMENTED,
      "MFA disabled",
      detail,
    );
  }
}
