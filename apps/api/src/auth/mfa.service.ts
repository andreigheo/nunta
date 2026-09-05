import { randomBytes, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import { verify as verifyPassword } from "@node-rs/argon2";
import QRCode from "qrcode";
import { AuditService } from "../audit/audit.service";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import type { WeddingOsRequest } from "../common/http.types";
import { problem } from "../common/problem";
import {
  createRecoveryCodes,
  createTotpSecret,
  decryptMfaSecret,
  encryptMfaSecret,
  hashMfaValue,
  verifyTotp,
} from "./mfa.crypto";

@Injectable()
export class MfaService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async status(userId: string) {
    const [authenticator, grant] = await Promise.all([
      this.database.mfaAuthenticator.findFirst({
        where: { userId, status: { in: ["PENDING", "ACTIVE"] } },
        orderBy: { createdAt: "desc" },
      }),
      this.database.platformGrant.findFirst({
        where: { userId, active: true, revokedAt: null },
      }),
    ]);
    const role = grant
      ? await this.database.platformRole.findUnique({
          where: { id: grant.roleId },
        })
      : null;
    const recoveryCodesRemaining = authenticator
      ? await this.database.mfaRecoveryCode.count({
          where: {
            authenticatorId: authenticator.id,
            usedAt: null,
            revokedAt: null,
          },
        })
      : 0;
    return {
      required: Boolean(role?.critical),
      enrolled: authenticator?.status === "ACTIVE",
      pendingEnrollmentId:
        authenticator?.status === "PENDING" ? authenticator.id : null,
      authenticatorId:
        authenticator?.status === "ACTIVE" ? authenticator.id : null,
      recoveryCodesRemaining,
    };
  }

  async enroll(
    userId: string,
    email: string,
    label: string,
    request: WeddingOsRequest,
  ) {
    const secret = createTotpSecret();
    const encrypted = encryptMfaSecret(
      secret,
      this.environment.MFA_ENCRYPTION_KEY,
      this.environment.MFA_ENCRYPTION_KEY_ID,
    );
    const enrollment = await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(
        hashtextextended(${`sarbato-mfa-enrollment:${userId}`}, 0)
      )`;
      const active = await tx.mfaAuthenticator.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (active)
        problem(
          "VERSION_CONFLICT",
          HttpStatus.CONFLICT,
          "MFA este deja activ",
          "Dezactivează autentificatorul existent cu parola și codul curent înainte de a configura unul nou.",
        );
      await tx.mfaAuthenticator.updateMany({
        where: { userId, status: "PENDING" },
        data: {
          status: "DISABLED",
          disabledAt: new Date(),
          version: { increment: 1 },
        },
      });
      return tx.mfaAuthenticator.create({
        data: {
          userId,
          label: label.trim() || "Authenticator",
          secretCiphertext: encrypted,
          encryptionKeyId: this.environment.MFA_ENCRYPTION_KEY_ID,
        },
      });
    });
    const issuer = this.environment.MFA_TOTP_ISSUER;
    const provisioningUri = `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    await this.audit.record({
      action: "mfa.enrollment_started.v1",
      actorUserId: userId,
      entityType: "mfa_authenticator",
      entityId: enrollment.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return {
      enrollmentId: enrollment.id,
      secret,
      provisioningUri,
      qrDataUrl: await QRCode.toDataURL(provisioningUri, {
        errorCorrectionLevel: "M",
      }),
      expiresInSeconds: 600,
    };
  }

  async confirm(
    userId: string,
    enrollmentId: string,
    code: string,
    request: WeddingOsRequest,
  ) {
    const enrollment = await this.database.mfaAuthenticator.findFirst({
      where: {
        id: enrollmentId,
        userId,
        status: "PENDING",
        createdAt: { gt: new Date(Date.now() - 600_000) },
      },
    });
    if (!enrollment)
      problem(
        "MFA_ENROLLMENT_INVALID",
        HttpStatus.CONFLICT,
        "MFA enrollment invalid",
      );
    const secret = this.decrypt(enrollment.secretCiphertext);
    const counter = verifyTotp(secret, code);
    if (counter == null)
      problem("MFA_CODE_INVALID", HttpStatus.UNAUTHORIZED, "MFA code invalid");
    const recoveryCodes = createRecoveryCodes();
    const batchId = randomUUID();
    await this.database.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(
        hashtextextended(${`sarbato-mfa-enrollment:${userId}`}, 0)
      )`;
      const active = await tx.mfaAuthenticator.findFirst({
        where: { userId, status: "ACTIVE" },
        select: { id: true },
      });
      if (active)
        problem(
          "VERSION_CONFLICT",
          HttpStatus.CONFLICT,
          "MFA este deja activ",
          "Configurarea în așteptare nu poate înlocui autentificatorul activ.",
        );
      await tx.mfaAuthenticator.updateMany({
        where: {
          userId,
          status: "PENDING",
          id: { not: enrollment.id },
        },
        data: {
          status: "DISABLED",
          disabledAt: new Date(),
          version: { increment: 1 },
        },
      });
      const activated = await tx.mfaAuthenticator.updateMany({
        where: { id: enrollment.id, userId, status: "PENDING" },
        data: {
          status: "ACTIVE",
          confirmedAt: new Date(),
          lastAcceptedCounter: counter,
          version: { increment: 1 },
        },
      });
      if (activated.count !== 1)
        problem(
          "MFA_ENROLLMENT_INVALID",
          HttpStatus.CONFLICT,
          "MFA enrollment invalid",
        );
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((raw) => ({
          userId,
          authenticatorId: enrollment.id,
          batchId,
          codeHash: hashMfaValue(raw),
        })),
      });
      await tx.platformGrant.updateMany({
        where: { userId, active: true, revokedAt: null },
        data: { mfaVerifiedAt: new Date(), version: { increment: 1 } },
      });
    });
    await this.audit.record({
      action: "mfa.enrollment_confirmed.v1",
      actorUserId: userId,
      entityType: "mfa_authenticator",
      entityId: enrollment.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return { enrolled: true as const, recoveryCodes };
  }

  async regenerateRecoveryCodes(
    userId: string,
    code: string,
    request: WeddingOsRequest,
  ) {
    const authenticator = await this.activeAuthenticator(userId);
    await this.verifyAuthenticatorCode(authenticator, code);
    const codes = createRecoveryCodes();
    const batchId = randomUUID();
    await this.database.$transaction(async (tx) => {
      await tx.mfaRecoveryCode.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.mfaRecoveryCode.createMany({
        data: codes.map((raw) => ({
          userId,
          authenticatorId: authenticator.id,
          batchId,
          codeHash: hashMfaValue(raw),
        })),
      });
    });
    await this.audit.record({
      action: "mfa.recovery_codes_regenerated.v1",
      actorUserId: userId,
      entityType: "mfa_authenticator",
      entityId: authenticator.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return { recoveryCodes: codes };
  }

  async disable(
    userId: string,
    password: string,
    code: string,
    request: WeddingOsRequest,
  ) {
    await this.verifyUserPassword(userId, password);
    const authenticator = await this.activeAuthenticator(userId);
    await this.verifyAuthenticatorCode(authenticator, code);
    await this.database.$transaction(async (tx) => {
      await tx.mfaAuthenticator.update({
        where: { id: authenticator.id },
        data: {
          status: "DISABLED",
          disabledAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.mfaRecoveryCode.updateMany({
        where: { authenticatorId: authenticator.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.adminStepUpSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.platformGrant.updateMany({
        where: { userId, active: true },
        data: { mfaVerifiedAt: null, version: { increment: 1 } },
      });
    });
    await this.audit.record({
      action: "mfa.disabled.v1",
      actorUserId: userId,
      entityType: "mfa_authenticator",
      entityId: authenticator.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return { enrolled: false as const };
  }

  async createStepUpChallenge(
    userId: string,
    sessionId: string,
    purpose: string,
    password: string,
    request: WeddingOsRequest,
  ) {
    await this.verifyUserPassword(userId, password);
    await this.activeAuthenticator(userId);
    const nonce = randomBytes(32).toString("base64url");
    const challenge = await this.database.mfaChallenge.create({
      data: {
        userId,
        sessionId,
        purpose,
        nonceHash: hashMfaValue(nonce),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    await this.audit.record({
      action: "admin.step_up_challenge_created.v1",
      actorUserId: userId,
      entityType: "mfa_challenge",
      entityId: challenge.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return {
      challengeId: challenge.id,
      purpose,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async verifyStepUp(
    userId: string,
    sessionId: string,
    challengeId: string,
    code: string,
    request: WeddingOsRequest,
  ) {
    const challenge = await this.database.mfaChallenge.findFirst({
      where: {
        id: challengeId,
        userId,
        sessionId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (!challenge)
      problem(
        "STEP_UP_CHALLENGE_INVALID",
        HttpStatus.CONFLICT,
        "Step-up challenge invalid",
      );
    const authenticator = await this.activeAuthenticator(userId);
    const accepted = await this.verifyAuthenticatorOrRecoveryCode(
      authenticator,
      code,
    );
    if (!accepted) {
      await this.database.mfaChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: { increment: 1 },
          status: challenge.attempts >= 4 ? "FAILED" : "PENDING",
        },
      });
      problem("MFA_CODE_INVALID", HttpStatus.UNAUTHORIZED, "MFA code invalid");
    }
    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(
      Date.now() + this.environment.ADMIN_STEP_UP_TTL_SECONDS * 1000,
    );
    await this.database.$transaction(async (tx) => {
      await tx.mfaChallenge.update({
        where: { id: challenge.id },
        data: { status: "VERIFIED", consumedAt: new Date() },
      });
      await tx.adminStepUpSession.create({
        data: {
          userId,
          sessionId,
          authenticatorId: authenticator.id,
          purpose: challenge.purpose,
          nonceHash: hashMfaValue(rawToken),
          expiresAt,
        },
      });
    });
    await this.audit.record({
      action: "admin.step_up_verified.v1",
      actorUserId: userId,
      entityType: "mfa_challenge",
      entityId: challenge.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
    });
    return {
      stepUpToken: rawToken,
      purpose: challenge.purpose,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async stepUpStatus(userId: string, sessionId: string) {
    const sessions = await this.database.adminStepUpSession.findMany({
      where: {
        userId,
        sessionId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { purpose: true, issuedAt: true, expiresAt: true },
      orderBy: { expiresAt: "desc" },
    });
    return {
      active: sessions.map((item) => ({
        ...item,
        issuedAt: item.issuedAt.toISOString(),
        expiresAt: item.expiresAt.toISOString(),
      })),
    };
  }

  private async activeAuthenticator(userId: string) {
    const authenticator = await this.database.mfaAuthenticator.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (!authenticator)
      problem("MFA_REQUIRED", HttpStatus.FORBIDDEN, "MFA enrollment required");
    return authenticator;
  }

  private decrypt(ciphertext: string) {
    return decryptMfaSecret(
      ciphertext,
      this.environment.MFA_ENCRYPTION_KEY,
      this.environment.MFA_ENCRYPTION_KEY_ID,
    );
  }

  private async verifyAuthenticatorCode(
    authenticator: {
      id: string;
      secretCiphertext: string;
      lastAcceptedCounter: bigint | null;
    },
    code: string,
  ) {
    const counter = verifyTotp(
      this.decrypt(authenticator.secretCiphertext),
      code,
      Date.now(),
      authenticator.lastAcceptedCounter,
    );
    if (counter == null)
      problem("MFA_CODE_INVALID", HttpStatus.UNAUTHORIZED, "MFA code invalid");
    const updated = await this.database.mfaAuthenticator.updateMany({
      where: {
        id: authenticator.id,
        lastAcceptedCounter: authenticator.lastAcceptedCounter,
      },
      data: { lastAcceptedCounter: counter, version: { increment: 1 } },
    });
    if (updated.count !== 1)
      problem("MFA_CODE_REPLAYED", HttpStatus.CONFLICT, "MFA code replayed");
  }

  private async verifyAuthenticatorOrRecoveryCode(
    authenticator: {
      id: string;
      userId: string;
      secretCiphertext: string;
      lastAcceptedCounter: bigint | null;
    },
    code: string,
  ) {
    if (/^\d{6}$/.test(code)) {
      const counter = verifyTotp(
        this.decrypt(authenticator.secretCiphertext),
        code,
        Date.now(),
        authenticator.lastAcceptedCounter,
      );
      if (counter == null) return false;
      const result = await this.database.mfaAuthenticator.updateMany({
        where: {
          id: authenticator.id,
          lastAcceptedCounter: authenticator.lastAcceptedCounter,
        },
        data: { lastAcceptedCounter: counter, version: { increment: 1 } },
      });
      return result.count === 1;
    }
    const result = await this.database.mfaRecoveryCode.updateMany({
      where: {
        authenticatorId: authenticator.id,
        userId: authenticator.userId,
        codeHash: hashMfaValue(code.toUpperCase()),
        usedAt: null,
        revokedAt: null,
      },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  private async verifyUserPassword(userId: string, password: string) {
    const identity = await this.database.identity.findFirst({
      where: { userId, provider: "PASSWORD" },
    });
    const valid = identity?.passwordHash
      ? await verifyPassword(identity.passwordHash, password).catch(() => false)
      : false;
    if (!valid)
      problem(
        "RECENT_AUTH_REQUIRED",
        HttpStatus.UNAUTHORIZED,
        "Recent password authentication required",
      );
  }
}
