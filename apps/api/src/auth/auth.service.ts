import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type {
  CreateSessionRequest,
  EmailVerification,
  RegisterRequest,
} from "@weddingos/contracts";
import {
  Algorithm,
  hash as hashPassword,
  verify as verifyPassword,
} from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../common/database.service";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { AuditService } from "../audit/audit.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { AsyncService } from "../async/async.service";
import {
  createOpaqueToken,
  createSixDigitCode,
  hashSecret,
  hashVerificationCode,
} from "./auth.crypto";
import { SessionService } from "./session.service";
import { SecurityDetectionService } from "../common/security-detection.service";
import { assertUsableOneTimeToken } from "./one-time-token";

const PASSWORD_HASH_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

@Injectable()
export class AuthService {
  private readonly dummyPasswordHash = hashPassword(
    "WeddingOS-Dummy-Password-2026",
    PASSWORD_HASH_OPTIONS,
  );

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(SecurityDetectionService)
    private readonly securityDetection: SecurityDetectionService,
  ) {}

  async register(input: RegisterRequest, request: WeddingOsRequest) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.database.user.findUnique({ where: { email } });
    if (existing) {
      await this.audit.record({
        action: "user.registration_rejected.v1",
        actorUserId: existing.id,
        entityType: "user",
        entityId: existing.id,
        outcome: "DENIED",
        requestId: request.requestId,
        correlationId: request.correlationId,
        ipAddress: request.ip,
      });
      return { userId: randomUUID(), emailVerificationRequired: true as const };
    }

    const passwordHash = await hashPassword(
      input.password,
      PASSWORD_HASH_OPTIONS,
    );
    const token = createOpaqueToken();
    const code = createSixDigitCode();
    const user = await this.database.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          email,
          acceptedTermsVersion: input.acceptedTermsVersion,
          acceptedTermsAt: new Date(),
          marketingConsent: input.marketingConsent ?? false,
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
            create: {
              registrationIntent: input.registrationIntent ?? "EVENT_ORGANIZER",
            },
          },
          notificationPreference: {
            create: { marketingEmail: input.marketingConsent ?? false },
          },
        },
        include: { profile: true },
      });
      await this.database.setTransactionContext(transaction, {
        userId: created.id,
        correlationId: request.correlationId,
      });
      await transaction.authOneTimeToken.create({
        data: {
          userId: created.id,
          purpose: "EMAIL_VERIFICATION",
          tokenHash: hashSecret(token),
          codeHash: hashVerificationCode(email, code),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      await this.asyncEvents.record(transaction, {
        eventName: "user.registered.v1",
        aggregateType: "User",
        aggregateId: created.id,
        actorUserId: created.id,
        correlationId: request.correlationId,
        deduplicationKey: `user-registered:${created.id}`,
        payload: {
          subject: { userId: created.id },
          notification: {
            recipientUserId: created.id,
            kind: "security",
            title: "Confirmă adresa de email",
            body: "Verifică mesajul trimis pentru a activa contul Sarbato.",
          },
        },
        email: {
          kind: "email-verification",
          recipient: email,
          values: {
            firstName: created.profile?.firstName ?? "",
            token,
            code,
          },
        },
      });
      return created;
    });
    await this.audit.record({
      action: "user.registered.v1",
      actorUserId: user.id,
      entityType: "user",
      entityId: user.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
      ipAddress: request.ip,
    });
    return { userId: user.id, emailVerificationRequired: true as const };
  }

  async requestEmailVerification(
    emailInput: string,
    request: WeddingOsRequest,
  ) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (user && !user.emailVerifiedAt) {
      const last = await this.database.authOneTimeToken.findFirst({
        where: { userId: user.id, purpose: "EMAIL_VERIFICATION" },
        orderBy: { createdAt: "desc" },
      });
      if (!last || Date.now() - last.createdAt.getTime() >= 60_000) {
        await this.issueEmailVerification(
          user.id,
          email,
          user.profile?.firstName ?? "",
          request,
        );
        await this.audit.record({
          action: "user.email_verification_requested.v1",
          actorUserId: user.id,
          requestId: request.requestId,
          correlationId: request.correlationId,
        });
      }
    }
    return { accepted: true as const };
  }

  private async issueEmailVerification(
    userId: string,
    email: string,
    firstName: string,
    request: WeddingOsRequest,
  ) {
    const user = await this.database.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const token = createOpaqueToken();
    const code = createSixDigitCode();
    await this.database.$transaction(async (transaction) => {
      await this.database.setTransactionContext(transaction, {
        userId,
        correlationId: request.correlationId,
      });
      await transaction.authOneTimeToken.updateMany({
        where: {
          userId,
          purpose: "EMAIL_VERIFICATION",
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), version: { increment: 1 } },
      });
      const created = await transaction.authOneTimeToken.create({
        data: {
          userId,
          purpose: "EMAIL_VERIFICATION",
          tokenHash: hashSecret(token),
          codeHash: hashVerificationCode(user.email, code),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      await this.asyncEvents.record(transaction, {
        eventName: "user.email_verification_requested.v1",
        aggregateType: "AuthOneTimeToken",
        aggregateId: created.id,
        actorUserId: userId,
        correlationId: request.correlationId,
        deduplicationKey: `email-verification:${created.id}`,
        payload: { subject: { userId, tokenId: created.id } },
        email: {
          kind: "email-verification",
          recipient: email,
          values: { firstName, token, code },
        },
      });
    });
  }

  async verifyEmail(input: EmailVerification, request: WeddingOsRequest) {
    const tokenRecord = input.token
      ? await this.database.authOneTimeToken.findUnique({
          where: { tokenHash: hashSecret(input.token) },
          include: { user: true },
        })
      : await this.database.authOneTimeToken.findFirst({
          where: {
            codeHash: hashVerificationCode(input.email ?? "", input.code ?? ""),
            purpose: "EMAIL_VERIFICATION",
          },
          include: { user: true },
          orderBy: { createdAt: "desc" },
        });
    assertUsableOneTimeToken(tokenRecord, "EMAIL_VERIFICATION");
    if (
      input.email &&
      tokenRecord.user.email !== input.email.trim().toLowerCase()
    ) {
      problem("TOKEN_INVALID", HttpStatus.BAD_REQUEST, "Invalid token");
    }

    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.authOneTimeToken.updateMany({
        where: {
          id: tokenRecord.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now, version: { increment: 1 } },
      });
      if (consumed.count !== 1) {
        problem("TOKEN_INVALID", HttpStatus.BAD_REQUEST, "Token already used");
      }
      await transaction.user.update({
        where: { id: tokenRecord.userId },
        data: { emailVerifiedAt: now, version: { increment: 1 } },
      });
    });
    await this.audit.record({
      action: "user.email_verified.v1",
      actorUserId: tokenRecord.userId,
      entityType: "user",
      entityId: tokenRecord.userId,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return { verified: true as const };
  }

  async createSession(input: CreateSessionRequest, request: WeddingOsRequest) {
    const user = await this.database.user.findUnique({
      where: { email: input.email.trim().toLowerCase() },
      include: { identities: true },
    });
    const identity = user?.identities.find(
      (candidate) => candidate.provider === "PASSWORD",
    );
    const passwordHash =
      identity?.passwordHash ?? (await this.dummyPasswordHash);
    const valid = await verifyPassword(passwordHash, input.password).catch(
      () => false,
    );
    if (!user || !identity || !valid) {
      await this.securityDetection.record({
        type: "LOGIN_FAILURE_BURST",
        subject: input.email,
        targetType: "AUTH_SESSION",
        correlationId: request.correlationId,
        context: { reason: "invalid_credentials" },
        threshold: 5,
        windowSeconds: 600,
        severity: "HIGH",
      });
      if (user) {
        await this.audit.record({
          action: "session.login_failed.v1",
          actorUserId: user.id,
          entityType: "user",
          entityId: user.id,
          outcome: "DENIED",
          requestId: request.requestId,
          correlationId: request.correlationId,
          ipAddress: request.ip,
        });
      }
      problem(
        "INVALID_CREDENTIALS",
        HttpStatus.UNAUTHORIZED,
        "Invalid credentials",
        "Email sau parolă incorectă.",
      );
    }
    if (!user.emailVerifiedAt) {
      problem(
        "EMAIL_NOT_VERIFIED",
        HttpStatus.FORBIDDEN,
        "Email not verified",
        "Confirmă adresa de email înainte de conectare.",
      );
    }
    const session = await this.sessions.create(
      user.id,
      input.remember ?? false,
      request.headers["user-agent"],
      request.ip,
    );
    await this.database.identity.update({
      where: { id: identity.id },
      data: { lastUsedAt: new Date(), version: { increment: 1 } },
    });
    await this.audit.record({
      action: "session.created.v1",
      actorUserId: user.id,
      entityType: "session",
      entityId: session.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
      ipAddress: request.ip,
    });
    return session;
  }

  async logout(
    current: AuthenticatedSession,
    rawToken: string | undefined,
    request: WeddingOsRequest,
  ) {
    await this.sessions.revokeRawToken(rawToken);
    await this.audit.record({
      action: "session.revoked.v1",
      actorUserId: current.userId,
      entityType: "session",
      entityId: current.sessionId,
      requestId: request.requestId,
      correlationId: request.correlationId,
      ipAddress: request.ip,
    });
  }

  async requestPasswordReset(emailInput: string, request: WeddingOsRequest) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (user) {
      const token = await this.issueTokenWithCooldown(
        user.id,
        "PASSWORD_RESET",
        30,
        request,
        {
          kind: "password-reset",
          recipient: email,
          values: { firstName: user.profile?.firstName ?? "" },
        },
      );
      if (token) {
        await this.audit.record({
          action: "password.reset_requested.v1",
          actorUserId: user.id,
          requestId: request.requestId,
          correlationId: request.correlationId,
        });
      }
    }
    return { accepted: true as const };
  }

  async resetPassword(
    token: string,
    password: string,
    request: WeddingOsRequest,
  ) {
    const record = await this.database.authOneTimeToken.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { user: { include: { profile: true } } },
    });
    assertUsableOneTimeToken(record, "PASSWORD_RESET");
    const passwordHash = await hashPassword(password, PASSWORD_HASH_OPTIONS);
    const now = new Date();
    await this.database.$transaction(async (transaction) => {
      await this.database.setTransactionContext(transaction, {
        userId: record.userId,
        correlationId: request.correlationId,
      });
      const consumed = await transaction.authOneTimeToken.updateMany({
        where: {
          id: record.id,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { consumedAt: now, version: { increment: 1 } },
      });
      if (consumed.count !== 1)
        problem("TOKEN_INVALID", HttpStatus.BAD_REQUEST, "Invalid token");
      await transaction.identity.update({
        where: {
          userId_provider: { userId: record.userId, provider: "PASSWORD" },
        },
        data: { passwordHash, version: { increment: 1 } },
      });
      await transaction.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now, version: { increment: 1 } },
      });
      await this.asyncEvents.record(transaction, {
        eventName: "password.changed.v1",
        aggregateType: "User",
        aggregateId: record.userId,
        actorUserId: record.userId,
        correlationId: request.correlationId,
        deduplicationKey: `password-changed:${record.id}`,
        payload: {
          subject: { userId: record.userId },
          notification: {
            recipientUserId: record.userId,
            kind: "security",
            title: "Parola a fost schimbată",
            body: "Toate sesiunile existente au fost revocate.",
          },
        },
        email: {
          kind: "password-changed",
          recipient: record.user.email,
          values: { firstName: record.user.profile?.firstName ?? "" },
        },
      });
    });
    await this.audit.record({
      action: "password.changed.v1",
      actorUserId: record.userId,
      entityType: "user",
      entityId: record.userId,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return { reset: true as const };
  }

  async requestMagicLink(emailInput: string, request: WeddingOsRequest) {
    if (!this.environment.FEATURE_MAGIC_LINK_ENABLED) {
      problem(
        "FEATURE_DISABLED",
        HttpStatus.NOT_IMPLEMENTED,
        "Magic link disabled",
      );
    }
    const email = emailInput.trim().toLowerCase();
    const user = await this.database.user.findUnique({
      where: { email },
      include: { profile: true },
    });
    if (user?.emailVerifiedAt) {
      const token = await this.issueTokenWithCooldown(
        user.id,
        "MAGIC_LINK",
        15,
        request,
        {
          kind: "magic-link",
          recipient: email,
          values: { firstName: user.profile?.firstName ?? "" },
        },
      );
      if (token) {
        await this.audit.record({
          action: "magic_link.requested.v1",
          actorUserId: user.id,
          requestId: request.requestId,
          correlationId: request.correlationId,
        });
      }
    }
    return { accepted: true as const };
  }

  async exchangeMagicLink(token: string, request: WeddingOsRequest) {
    if (!this.environment.FEATURE_MAGIC_LINK_ENABLED) {
      problem(
        "FEATURE_DISABLED",
        HttpStatus.NOT_IMPLEMENTED,
        "Magic link disabled",
      );
    }
    const record = await this.database.authOneTimeToken.findUnique({
      where: { tokenHash: hashSecret(token) },
      include: { user: true },
    });
    assertUsableOneTimeToken(record, "MAGIC_LINK");
    const consumed = await this.database.authOneTimeToken.updateMany({
      where: {
        id: record.id,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date(), version: { increment: 1 } },
    });
    if (consumed.count !== 1)
      problem("TOKEN_INVALID", HttpStatus.BAD_REQUEST, "Invalid token");
    const session = await this.sessions.create(
      record.userId,
      true,
      request.headers["user-agent"],
      request.ip,
    );
    await this.audit.record({
      action: "magic_link.exchanged.v1",
      actorUserId: record.userId,
      entityType: "session",
      entityId: session.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return session;
  }

  private async issueTokenWithCooldown(
    userId: string,
    purpose: "PASSWORD_RESET" | "MAGIC_LINK",
    ttlMinutes: number,
    request: WeddingOsRequest,
    email: {
      kind: "password-reset" | "magic-link";
      recipient: string;
      values: Record<string, string>;
    },
  ) {
    const latest = await this.database.authOneTimeToken.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: "desc" },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < 60_000) return null;
    const token = createOpaqueToken();
    await this.database.$transaction(async (transaction) => {
      await this.database.setTransactionContext(transaction, {
        userId,
        correlationId: request.correlationId,
      });
      await transaction.authOneTimeToken.updateMany({
        where: { userId, purpose, consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date(), version: { increment: 1 } },
      });
      const created = await transaction.authOneTimeToken.create({
        data: {
          userId,
          purpose,
          tokenHash: hashSecret(token),
          expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
        },
      });
      await this.asyncEvents.record(transaction, {
        eventName:
          purpose === "PASSWORD_RESET"
            ? "password.reset_requested.v1"
            : "magic_link.requested.v1",
        aggregateType: "AuthOneTimeToken",
        aggregateId: created.id,
        actorUserId: userId,
        correlationId: request.correlationId,
        deduplicationKey: `${purpose.toLowerCase()}:${created.id}`,
        payload: { subject: { userId, tokenId: created.id } },
        email: {
          ...email,
          values: { ...email.values, token },
        },
      });
    });
    return token;
  }
}
