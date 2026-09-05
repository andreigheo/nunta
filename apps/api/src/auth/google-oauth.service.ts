import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import { TERMS_VERSION, type RegistrationIntent } from "@weddingos/contracts";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CodeChallengeMethod,
  OAuth2Client,
  type TokenPayload,
} from "google-auth-library";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { DatabaseService } from "../common/database.service";
import type { WeddingOsRequest } from "../common/http.types";
import { createOpaqueToken } from "./auth.crypto";
import { SessionService, type CreatedSession } from "./session.service";

const FLOW_TTL_MS = 10 * 60 * 1000;

const googleOAuthFlowSchema = z.object({
  state: z.string().min(32).max(256),
  verifier: z.string().min(43).max(128),
  nonce: z.string().min(32).max(256),
  mode: z.enum(["sign-in", "register"]),
  returnTo: z.string().nullable(),
  registrationIntent: z
    .enum(["EVENT_ORGANIZER", "SERVICE_PROVIDER", "INVITED_MEMBER"])
    .nullable(),
  marketingConsent: z.boolean(),
  termsAccepted: z.boolean(),
  expiresAt: z.number().int().positive(),
});

export type GoogleOAuthFlow = z.infer<typeof googleOAuthFlowSchema>;
export type GoogleOAuthErrorCode =
  | "unavailable"
  | "cancelled"
  | "invalid_flow"
  | "not_registered"
  | "account_link_required"
  | "account_unavailable"
  | "failed";

export class GoogleOAuthError extends Error {
  constructor(public readonly code: GoogleOAuthErrorCode) {
    super(code);
    this.name = "GoogleOAuthError";
  }
}

export function safeOAuthReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return character === "\\" || code < 32 || code === 127;
    })
  ) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("//") ||
      [...decoded].some((character) => {
        const code = character.charCodeAt(0);
        return character === "\\" || code < 32 || code === 127;
      })
      ? null
      : value;
  } catch {
    return null;
  }
}

export function encodeGoogleOAuthFlow(
  flow: GoogleOAuthFlow,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(flow)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function decodeGoogleOAuthFlow(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): GoogleOAuthFlow | null {
  if (!token || token.length > 4096) return null;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac("sha256", secret)
    .update(payload)
    .digest();
  let receivedSignature: Buffer;
  try {
    receivedSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return null;
  }
  try {
    const flow = googleOAuthFlowSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return flow.expiresAt > now && flow.expiresAt <= now + FLOW_TTL_MS
      ? flow
      : null;
  } catch {
    return null;
  }
}

export function googleCanAuthoritativelyLinkEmail(
  email: string,
  hostedDomain: string | undefined,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized.endsWith("@gmail.com")) return true;
  if (!hostedDomain) return false;
  return normalized.endsWith(`@${hostedDomain.trim().toLowerCase()}`);
}

function claimName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return (normalized || fallback).slice(0, 80);
}

@Injectable()
export class GoogleOAuthService {
  readonly flowCookieName = "sarbato_google_oauth";

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  flowCookieOptions() {
    return {
      httpOnly: true,
      secure: this.environment.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/api/v1/auth/google",
      maxAge: FLOW_TTL_MS,
    };
  }

  clearFlowCookieOptions() {
    const { maxAge: _maxAge, ...options } = this.flowCookieOptions();
    return options;
  }

  flowMode(cookie: string | undefined): "sign-in" | "register" {
    return (
      decodeGoogleOAuthFlow(cookie, this.environment.SESSION_SECRET)?.mode ??
      "sign-in"
    );
  }

  async begin(input: {
    mode: "sign-in" | "register";
    returnTo?: string;
    registrationIntent?: RegistrationIntent;
    marketingConsent?: boolean;
    termsAccepted?: boolean;
  }) {
    const client = this.configuredClient();
    const isRegistration = input.mode === "register";
    if (isRegistration && (!input.termsAccepted || !input.registrationIntent)) {
      throw new GoogleOAuthError("invalid_flow");
    }
    const { codeVerifier, codeChallenge } =
      await client.generateCodeVerifierAsync();
    const flow: GoogleOAuthFlow = {
      state: createOpaqueToken(),
      verifier: codeVerifier,
      nonce: createOpaqueToken(),
      mode: input.mode,
      returnTo: safeOAuthReturnTo(input.returnTo),
      registrationIntent: isRegistration
        ? (input.registrationIntent ?? null)
        : null,
      marketingConsent: isRegistration
        ? Boolean(input.marketingConsent)
        : false,
      termsAccepted: isRegistration && Boolean(input.termsAccepted),
      expiresAt: Date.now() + FLOW_TTL_MS,
    };
    const authorizationUrl = client.generateAuthUrl({
      access_type: "online",
      scope: ["openid", "email", "profile"],
      include_granted_scopes: true,
      prompt: "select_account",
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    return {
      authorizationUrl,
      cookie: encodeGoogleOAuthFlow(flow, this.environment.SESSION_SECRET),
    };
  }

  async complete(
    input: { code?: string; state?: string; error?: string },
    flowCookie: string | undefined,
    request: WeddingOsRequest,
  ): Promise<{ session: CreatedSession; returnTo: string | null }> {
    if (input.error) throw new GoogleOAuthError("cancelled");
    if (!input.code || !input.state) throw new GoogleOAuthError("invalid_flow");
    const flow = decodeGoogleOAuthFlow(
      flowCookie,
      this.environment.SESSION_SECRET,
    );
    if (!flow || flow.state !== input.state)
      throw new GoogleOAuthError("invalid_flow");

    const client = this.configuredClient();
    let payload: TokenPayload;
    try {
      const { tokens } = await client.getToken({
        code: input.code,
        codeVerifier: flow.verifier,
        redirect_uri: this.environment.GOOGLE_OAUTH_REDIRECT_URI,
      });
      if (!tokens.id_token) throw new Error("Missing ID token");
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: this.environment.GOOGLE_OAUTH_CLIENT_ID,
      });
      const verified = ticket.getPayload();
      if (!verified) throw new Error("Missing verified payload");
      payload = verified;
    } catch {
      throw new GoogleOAuthError("failed");
    }

    if (
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      payload.nonce !== flow.nonce
    ) {
      throw new GoogleOAuthError("failed");
    }

    const email = payload.email.trim().toLowerCase();
    const now = new Date();
    const user = await this.database.$transaction(async (transaction) => {
      const googleIdentity = await transaction.identity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "GOOGLE",
            providerSubject: payload.sub,
          },
        },
        include: { user: true },
      });
      if (googleIdentity) return googleIdentity.user;

      const existing = await transaction.user.findUnique({
        where: { email },
        include: { identities: true },
      });
      if (existing) {
        if (existing.status !== "ACTIVE")
          throw new GoogleOAuthError("account_unavailable");
        const conflictingGoogleIdentity = existing.identities.find(
          (identity) =>
            identity.provider === "GOOGLE" &&
            identity.providerSubject !== payload.sub,
        );
        if (conflictingGoogleIdentity)
          throw new GoogleOAuthError("account_link_required");
        if (!googleCanAuthoritativelyLinkEmail(email, payload.hd))
          throw new GoogleOAuthError("account_link_required");
        await transaction.identity.create({
          data: {
            userId: existing.id,
            provider: "GOOGLE",
            providerSubject: payload.sub,
            lastUsedAt: now,
          },
        });
        if (!existing.emailVerifiedAt) {
          return transaction.user.update({
            where: { id: existing.id },
            data: { emailVerifiedAt: now, version: { increment: 1 } },
          });
        }
        return existing;
      }

      if (flow.mode !== "register")
        throw new GoogleOAuthError("not_registered");
      if (!flow.termsAccepted || !flow.registrationIntent)
        throw new GoogleOAuthError("invalid_flow");

      const fullName = payload.name?.trim().split(/\s+/).filter(Boolean) ?? [];
      const firstName = claimName(
        payload.given_name,
        fullName.at(0) ?? email.split("@")[0] ?? "Utilizator",
      );
      const lastName = claimName(
        payload.family_name,
        fullName.slice(1).join(" ") || "Google",
      );
      return transaction.user.create({
        data: {
          email,
          emailVerifiedAt: now,
          acceptedTermsVersion: TERMS_VERSION,
          acceptedTermsAt: now,
          marketingConsent: flow.marketingConsent,
          profile: {
            create: {
              firstName,
              lastName,
              avatarUrl: payload.picture?.slice(0, 2048),
            },
          },
          identities: {
            create: {
              provider: "GOOGLE",
              providerSubject: payload.sub,
              lastUsedAt: now,
            },
          },
          preference: {
            create: { registrationIntent: flow.registrationIntent },
          },
          notificationPreference: {
            create: { marketingEmail: flow.marketingConsent },
          },
        },
      });
    });

    if (user.status !== "ACTIVE")
      throw new GoogleOAuthError("account_unavailable");

    const session = await this.sessions.create(
      user.id,
      true,
      request.headers["user-agent"],
      request.ip,
    );
    await this.database.identity.update({
      where: {
        userId_provider: { userId: user.id, provider: "GOOGLE" },
      },
      data: { lastUsedAt: now, version: { increment: 1 } },
    });
    await this.audit.record({
      action: "session.google_oauth_created.v1",
      actorUserId: user.id,
      entityType: "session",
      entityId: session.id,
      requestId: request.requestId,
      correlationId: request.correlationId,
      ipAddress: request.ip,
    });
    return { session, returnTo: flow.returnTo };
  }

  successRedirect(returnTo: string | null): string {
    const url = new URL("/sign-in", this.environment.WEB_URL);
    url.searchParams.set("google", "1");
    if (returnTo) url.searchParams.set("returnTo", returnTo);
    return url.toString();
  }

  errorRedirect(
    code: GoogleOAuthErrorCode,
    mode: "sign-in" | "register" = "sign-in",
  ): string {
    const url = new URL(
      mode === "register" ? "/create-account" : "/sign-in",
      this.environment.WEB_URL,
    );
    url.searchParams.set("oauthError", code);
    return url.toString();
  }

  errorCode(error: unknown): GoogleOAuthErrorCode {
    return error instanceof GoogleOAuthError ? error.code : "failed";
  }

  private configuredClient(): OAuth2Client {
    if (
      !this.environment.FEATURE_GOOGLE_OAUTH_ENABLED ||
      !this.environment.GOOGLE_OAUTH_CLIENT_ID ||
      !this.environment.GOOGLE_OAUTH_CLIENT_SECRET ||
      !this.environment.GOOGLE_OAUTH_REDIRECT_URI
    ) {
      throw new GoogleOAuthError("unavailable");
    }
    return new OAuth2Client({
      clientId: this.environment.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: this.environment.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: this.environment.GOOGLE_OAUTH_REDIRECT_URI,
    });
  }
}
