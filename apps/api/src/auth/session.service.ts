import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import { DatabaseService } from "../common/database.service";
import type { AuthenticatedSession } from "../common/http.types";
import { API_ENVIRONMENT } from "../common/environment.module";
import { createOpaqueToken, hashSecret } from "./auth.crypto";

export type CreatedSession = {
  id: string;
  rawToken: string;
  expiresAt: Date;
};

@Injectable()
export class SessionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  get cookieName(): string {
    return this.environment.SESSION_COOKIE_NAME;
  }

  cookieOptions(expiresAt: Date) {
    return {
      httpOnly: true,
      secure: this.environment.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      expires: expiresAt,
      ...(this.environment.COOKIE_DOMAIN
        ? { domain: this.environment.COOKIE_DOMAIN }
        : {}),
    };
  }

  clearCookieOptions() {
    return {
      httpOnly: true,
      secure: this.environment.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      ...(this.environment.COOKIE_DOMAIN
        ? { domain: this.environment.COOKIE_DOMAIN }
        : {}),
    };
  }

  async create(
    userId: string,
    remember: boolean,
    userAgent?: string,
    ipAddress?: string,
  ): Promise<CreatedSession> {
    const rawToken = createOpaqueToken();
    const expiresAt = new Date(
      Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000,
    );
    const session = await this.database.session.create({
      data: {
        userId,
        tokenHash: hashSecret(rawToken),
        remember,
        expiresAt,
        userAgent: userAgent?.slice(0, 512),
        ipAddress: ipAddress?.slice(0, 64),
      },
    });
    return { id: session.id, rawToken, expiresAt };
  }

  async authenticate(
    rawToken: string | undefined,
  ): Promise<AuthenticatedSession | null> {
    if (!rawToken || rawToken.length < 32) return null;
    const session = await this.database.session.findUnique({
      where: { tokenHash: hashSecret(rawToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE"
    ) {
      return null;
    }
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      await this.database.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), version: { increment: 1 } },
      });
    }
    return {
      sessionId: session.id,
      userId: session.userId,
      email: session.user.email,
      emailVerified: Boolean(session.user.emailVerifiedAt),
    };
  }

  async revokeRawToken(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.database.session.updateMany({
      where: { tokenHash: hashSecret(rawToken), revokedAt: null },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
  }
}
