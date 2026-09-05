import { describe, expect, it, vi } from "vitest";
import {
  capabilityKeys,
  createWorkspaceRequestSchema,
  createTeamInvitationRequestSchema,
  defaultRoleTemplates,
  moneySchema,
  magicLinkRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
  semanticEvents,
  TERMS_VERSION,
  isOnboardingComplete,
  workspaceStatusSchema,
  updateWorkspaceRequestSchema,
} from "@weddingos/contracts";
import { parseApiEnvironment } from "@weddingos/config";
import { createOpaqueToken, hashSecret } from "../src/auth/auth.crypto";
import {
  decodeGoogleOAuthFlow,
  encodeGoogleOAuthFlow,
  googleCanAuthoritativelyLinkEmail,
  GoogleOAuthService,
  safeOAuthReturnTo,
} from "../src/auth/google-oauth.service";
import { assertUsableOneTimeToken } from "../src/auth/one-time-token";
import { ProblemException } from "../src/common/problem";
import { enabledCopilotWebResearch } from "../src/intelligence/copilot-memory.service";
import { assertPendingInvitation } from "../src/team/invitation-state";
import { resolveCapabilities } from "../src/workspaces/capability.guard";

describe("Slice 0/1 foundation", () => {
  it("creates opaque tokens and stores a deterministic one-way hash", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashSecret(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSecret(first)).toBe(hashSecret(first));
    expect(hashSecret(first)).not.toBe(first);
  });

  it("applies explicit capability allows and denies after the role template", () => {
    const resolved = resolveCapabilities(
      ["workspace.read", "finance.read", "unknown.capability"],
      [
        { capability: "finance.read", effect: "DENY" },
        { capability: "team.read", effect: "ALLOW" },
      ],
    );
    expect(resolved).toEqual(["team.read", "workspace.read"]);
    expect(resolved.every((item) => capabilityKeys.includes(item))).toBe(true);
  });

  it("rejects incomplete production configuration", () => {
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        WEB_URL: "http://example.test",
        API_URL: "http://api.example.test",
        DATABASE_URL: "postgresql://example",
        SESSION_SECRET: "replace-with-at-least-32-random-characters",
        EMAIL_FROM: "Sarbato <hello@example.test>",
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "smtp.example.test",
        SMTP_PORT: "587",
        REDIS_URL: "rediss://user:password@redis.example.test:6380",
        OUTBOX_ENCRYPTION_KEY:
          "production-outbox-encryption-key-with-32-characters",
        LOG_LEVEL: "info",
      }),
    ).toThrow(/Invalid API environment/);
  });

  it("parses textual feature flags without treating false as truthy", () => {
    const environment = parseApiEnvironment({
      NODE_ENV: "test",
      WEB_URL: "http://127.0.0.1:3000",
      API_URL: "http://127.0.0.1:4000",
      DATABASE_URL: "postgresql://example",
      SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
      EMAIL_FROM: "Sarbato <hello@example.test>",
      EMAIL_PROVIDER: "console",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      REDIS_URL: "redis://127.0.0.1:56379",
      OUTBOX_ENCRYPTION_KEY:
        "test-outbox-encryption-key-with-at-least-32-characters",
      LOG_LEVEL: "silent",
      FEATURE_MAGIC_LINK_ENABLED: "true",
      FEATURE_MFA_ENABLED: "false",
    });

    expect(environment.FEATURE_MAGIC_LINK_ENABLED).toBe(true);
    expect(environment.FEATURE_GOOGLE_OAUTH_ENABLED).toBe(false);
    expect(environment.FEATURE_MFA_ENABLED).toBe(false);
  });

  it("requires an exact same-origin Google OAuth callback when enabled", () => {
    const base = {
      NODE_ENV: "test" as const,
      WEB_URL: "https://sarbato.space",
      API_URL: "https://sarbato.space/api",
      DATABASE_URL: "postgresql://example",
      SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
      EMAIL_FROM: "Sarbato <hello@sarbato.space>",
      EMAIL_PROVIDER: "console" as const,
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      REDIS_URL: "redis://127.0.0.1:56379",
      OUTBOX_ENCRYPTION_KEY:
        "test-outbox-encryption-key-with-at-least-32-characters",
      LOG_LEVEL: "silent" as const,
      FEATURE_GOOGLE_OAUTH_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret-value",
    };

    expect(
      parseApiEnvironment({
        ...base,
        GOOGLE_OAUTH_REDIRECT_URI:
          "https://sarbato.space/api/v1/auth/google/callback",
      }).FEATURE_GOOGLE_OAUTH_ENABLED,
    ).toBe(true);
    expect(() =>
      parseApiEnvironment({
        ...base,
        GOOGLE_OAUTH_REDIRECT_URI:
          "http://localhost:4000/api/v1/auth/google/callback",
      }),
    ).toThrow(/Google OAuth redirect URI must be exactly/);
  });

  it("builds a PKCE Google authorization request with only the live callback and identity scopes", async () => {
    const environment = parseApiEnvironment({
      NODE_ENV: "test",
      WEB_URL: "https://sarbato.space",
      API_URL: "https://sarbato.space/api",
      DATABASE_URL: "postgresql://example",
      SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
      EMAIL_FROM: "Sarbato <hello@sarbato.space>",
      EMAIL_PROVIDER: "console",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      REDIS_URL: "redis://127.0.0.1:56379",
      OUTBOX_ENCRYPTION_KEY:
        "test-outbox-encryption-key-with-at-least-32-characters",
      LOG_LEVEL: "silent",
      FEATURE_GOOGLE_OAUTH_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret-value",
      GOOGLE_OAUTH_REDIRECT_URI:
        "https://sarbato.space/api/v1/auth/google/callback",
    });
    const service = new GoogleOAuthService(
      undefined as never,
      undefined as never,
      undefined as never,
      environment,
    );
    const started = await service.begin({
      mode: "sign-in",
      returnTo: "/overview",
    });
    const authorizationUrl = new URL(started.authorizationUrl);
    const flow = decodeGoogleOAuthFlow(
      started.cookie,
      environment.SESSION_SECRET,
    );

    expect(authorizationUrl.origin).toBe("https://accounts.google.com");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      "https://sarbato.space/api/v1/auth/google/callback",
    );
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("state")).toBe(flow?.state);
    expect(authorizationUrl.searchParams.get("nonce")).toBe(flow?.nonce);
    expect(
      new Set(authorizationUrl.searchParams.get("scope")?.split(" ")),
    ).toEqual(new Set(["openid", "email", "profile"]));
    expect(started.authorizationUrl).not.toContain("localhost");
  });

  it("signs, expires and validates the short-lived Google OAuth flow", () => {
    const secret = "test-session-secret-with-at-least-32-characters";
    const now = Date.now();
    const flow = {
      state: "s".repeat(43),
      verifier: "v".repeat(64),
      nonce: "n".repeat(43),
      mode: "register" as const,
      returnTo: "/onboarding?source=google",
      registrationIntent: "EVENT_ORGANIZER" as const,
      marketingConsent: false,
      termsAccepted: true,
      expiresAt: now + 60_000,
    };
    const encoded = encodeGoogleOAuthFlow(flow, secret);

    expect(decodeGoogleOAuthFlow(encoded, secret, now)).toEqual(flow);
    expect(
      decodeGoogleOAuthFlow(`${encoded.slice(0, -1)}x`, secret, now),
    ).toBeNull();
    expect(decodeGoogleOAuthFlow(encoded, secret, now + 60_001)).toBeNull();
    expect(safeOAuthReturnTo("/%2F%2Fevil.example/steal")).toBeNull();
    expect(safeOAuthReturnTo("/overview?tab=plan")).toBe("/overview?tab=plan");
  });

  it("creates a complete Sarbato account from a verified Google registration", async () => {
    const environment = parseApiEnvironment({
      NODE_ENV: "test",
      WEB_URL: "https://sarbato.space",
      API_URL: "https://sarbato.space/api",
      DATABASE_URL: "postgresql://example",
      SESSION_SECRET: "test-session-secret-with-at-least-32-characters",
      EMAIL_FROM: "Sarbato <hello@sarbato.space>",
      EMAIL_PROVIDER: "console",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      REDIS_URL: "redis://127.0.0.1:56379",
      OUTBOX_ENCRYPTION_KEY:
        "test-outbox-encryption-key-with-at-least-32-characters",
      LOG_LEVEL: "silent",
      FEATURE_GOOGLE_OAUTH_ENABLED: "true",
      GOOGLE_OAUTH_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
      GOOGLE_OAUTH_CLIENT_SECRET: "google-client-secret-value",
      GOOGLE_OAUTH_REDIRECT_URI:
        "https://sarbato.space/api/v1/auth/google/callback",
    });
    const state = "s".repeat(43);
    const nonce = "n".repeat(43);
    const flowCookie = encodeGoogleOAuthFlow(
      {
        state,
        verifier: "v".repeat(64),
        nonce,
        mode: "register",
        returnTo: "/onboarding?source=google",
        registrationIntent: "EVENT_ORGANIZER",
        marketingConsent: true,
        termsAccepted: true,
        expiresAt: Date.now() + 60_000,
      },
      environment.SESSION_SECRET,
    );
    const createdUser = {
      id: "user-google-registration",
      email: "ana.popescu@gmail.com",
      status: "ACTIVE",
    };
    const transaction = {
      identity: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(createdUser),
        update: vi.fn(),
      },
    };
    const database = {
      $transaction: vi.fn(
        async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
      identity: { update: vi.fn().mockResolvedValue({}) },
    };
    const session = {
      id: "session-google-registration",
      rawToken: "raw-session-token",
      expiresAt: new Date(Date.now() + 60_000),
    };
    const sessions = { create: vi.fn().mockResolvedValue(session) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new GoogleOAuthService(
      database as never,
      sessions as never,
      audit as never,
      environment,
    );
    const googleClient = {
      getToken: vi.fn().mockResolvedValue({
        tokens: { id_token: "verified-google-id-token" },
      }),
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: "google-subject-123",
          email: "Ana.Popescu@gmail.com",
          email_verified: true,
          nonce,
          given_name: "Ana",
          family_name: "Popescu",
          picture: "https://example.test/avatar.jpg",
        }),
      }),
    };
    Object.defineProperty(service, "configuredClient", {
      value: () => googleClient,
    });

    const result = await service.complete(
      { code: "google-authorization-code", state },
      flowCookie,
      {
        headers: { "user-agent": "Sarbato test browser" },
        ip: "127.0.0.1",
        requestId: "request-google-registration",
        correlationId: "correlation-google-registration",
      } as never,
    );

    expect(result).toEqual({
      session,
      returnTo: "/onboarding?source=google",
    });
    expect(transaction.user.create).toHaveBeenCalledWith({
      data: {
        email: "ana.popescu@gmail.com",
        emailVerifiedAt: expect.any(Date),
        acceptedTermsVersion: TERMS_VERSION,
        acceptedTermsAt: expect.any(Date),
        marketingConsent: true,
        profile: {
          create: {
            firstName: "Ana",
            lastName: "Popescu",
            avatarUrl: "https://example.test/avatar.jpg",
          },
        },
        identities: {
          create: {
            provider: "GOOGLE",
            providerSubject: "google-subject-123",
            lastUsedAt: expect.any(Date),
          },
        },
        preference: {
          create: { registrationIntent: "EVENT_ORGANIZER" },
        },
        notificationPreference: {
          create: { marketingEmail: true },
        },
      },
    });
    expect(sessions.create).toHaveBeenCalledWith(
      createdUser.id,
      true,
      "Sarbato test browser",
      "127.0.0.1",
    );
    expect(database.identity.update).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "session.google_oauth_created.v1",
        actorUserId: createdUser.id,
        entityId: session.id,
      }),
    );
  });

  it("links existing accounts only when Google is authoritative for the email", () => {
    expect(googleCanAuthoritativelyLinkEmail("ana@gmail.com", undefined)).toBe(
      true,
    );
    expect(
      googleCanAuthoritativelyLinkEmail("ana@sarbato.space", "sarbato.space"),
    ).toBe(true);
    expect(
      googleCanAuthoritativelyLinkEmail("ana@example.com", undefined),
    ).toBe(false);
  });

  it("enables Copilot web research only for an explicit available opt-in", () => {
    expect(enabledCopilotWebResearch(undefined, true)).toBe(false);
    expect(enabledCopilotWebResearch(false, true)).toBe(false);
    expect(enabledCopilotWebResearch(true, false)).toBe(false);
    expect(enabledCopilotWebResearch(true, true)).toBe(true);
  });

  it("normalizes email and enforces the shared password policy", () => {
    const parsed = registerRequestSchema.parse({
      firstName: " Ana ",
      lastName: " Pop ",
      email: " ANA.POP@EXAMPLE.TEST ",
      password: "WeddingOS2026!",
      registrationIntent: "EVENT_ORGANIZER",
      returnTo: "/onboarding?source=registration",
      acceptedTermsVersion: "2026-07-18",
    });
    expect(parsed.email).toBe("ana.pop@example.test");
    expect(parsed.firstName).toBe("Ana");
    expect(parsed.returnTo).toBe("/onboarding?source=registration");
    expect(() =>
      registerRequestSchema.parse({ ...parsed, password: "alllowercase" }),
    ).toThrow();
    expect(() =>
      registerRequestSchema.parse({
        ...parsed,
        returnTo: "https://evil.example/provider",
      }),
    ).toThrow();
    expect(() =>
      registerRequestSchema.parse({
        ...parsed,
        returnTo: "/%2F%2Fevil.example/provider",
      }),
    ).toThrow();
  });

  it("accepts only safe internal continuation paths for recovery authentication", () => {
    expect(
      magicLinkRequestSchema.parse({
        email: "ana@example.test",
        returnTo: "/vendor-invitation?token=opaque",
      }).returnTo,
    ).toBe("/vendor-invitation?token=opaque");
    expect(
      passwordResetRequestSchema.parse({
        email: "ana@example.test",
        returnTo: "/invitation?token=opaque",
      }).returnTo,
    ).toBe("/invitation?token=opaque");
    expect(() =>
      magicLinkRequestSchema.parse({
        email: "ana@example.test",
        returnTo: "https://evil.example/steal",
      }),
    ).toThrow();
    expect(() =>
      passwordResetRequestSchema.parse({
        email: "ana@example.test",
        returnTo: "/%2F%2Fevil.example/steal",
      }),
    ).toThrow();
  });

  it("keeps money integer-only and workspace statuses closed", () => {
    expect(moneySchema.parse({ amountMinor: 5900, currency: "RON" })).toEqual({
      amountMinor: 5900,
      currency: "RON",
    });
    expect(() =>
      moneySchema.parse({ amountMinor: 59.5, currency: "RON" }),
    ).toThrow();
    expect(workspaceStatusSchema.options).toEqual(["active", "archived"]);
    expect(() => workspaceStatusSchema.parse("deleted")).toThrow();
  });

  it("accepts generic event workspaces while preserving the legacy date alias", () => {
    expect(
      createWorkspaceRequestSchema.parse({
        title: "Conferința anuală",
        eventType: "conference",
        eventDate: "2027-10-14",
        organizerName: "Sarbato Events",
      }),
    ).toMatchObject({
      eventType: "conference",
      eventDate: "2027-10-14",
      organizerName: "Sarbato Events",
    });
    expect(
      createWorkspaceRequestSchema.parse({
        title: "Nunta Ana și Mihai",
        weddingDate: "2027-09-12",
      }),
    ).toMatchObject({ eventType: "wedding", weddingDate: "2027-09-12" });
    expect(() =>
      updateWorkspaceRequestSchema.parse({
        version: 2,
        eventDate: "2027-10-14",
        weddingDate: "2027-10-15",
      }),
    ).toThrow(/must match/);
  });

  it("defines least-privilege default role templates", () => {
    const owner = defaultRoleTemplates.find(
      (role) => role.key === "couple_owner",
    )!;
    const planner = defaultRoleTemplates.find(
      (role) => role.key === "wedding_planner",
    )!;
    const viewer = defaultRoleTemplates.find((role) => role.key === "viewer")!;
    expect(owner.capabilities).toContain("workspace.transfer_ownership");
    expect(planner.capabilities).not.toContain("finance.read");
    expect(planner.capabilities).not.toContain("workspace.manage_members");
    expect(viewer.capabilities).toEqual([
      "workspace.read",
      "planning.read",
      "wedding_day.read",
      "copilot.read",
      "risk.read",
      "contingency.read",
      "automation.read",
      "incident.read",
      "announcement.read",
      "check_in.read",
      "guest_moment.read",
      "gallery.read",
      "task.read",
      "calendar.read",
      "timeline.read",
      "guest.read",
      "invitation.read",
      "rsvp.read",
      "menu.read",
      "seating.read",
      "transport.read",
      "accommodation.read",
      "marketplace.read",
      "rfq.read",
      "offer.read",
      "booking.read",
      "contract.read",
      "budget.read",
      "expense.read",
      "payment.read",
      "document.read",
      "signature.read",
      "online_payment.read",
      "review.read",
      "review.report",
    ]);
  });

  it("rejects owner invitations while accepting typed capability overrides", () => {
    expect(() =>
      createTeamInvitationRequestSchema.parse({
        email: "partner@example.test",
        roleTemplate: "couple_owner",
        capabilityOverrides: [],
      }),
    ).toThrow();
    expect(
      createTeamInvitationRequestSchema.parse({
        email: "PLANNER@EXAMPLE.TEST",
        roleTemplate: "wedding_planner",
        capabilityOverrides: [
          { capability: "guest.read_pii", effect: "allow" },
        ],
      }).email,
    ).toBe("planner@example.test");
  });

  it("rejects expired, consumed and replayed one-time tokens", () => {
    const base = {
      purpose: "PASSWORD_RESET",
      expiresAt: new Date("2026-07-18T10:30:00.000Z"),
      consumedAt: null,
      revokedAt: null,
    };
    expect(() =>
      assertUsableOneTimeToken(
        base,
        "PASSWORD_RESET",
        new Date("2026-07-18T10:00:00.000Z"),
      ),
    ).not.toThrow();
    expectProblem(
      () =>
        assertUsableOneTimeToken(
          base,
          "PASSWORD_RESET",
          new Date("2026-07-18T11:00:00.000Z"),
        ),
      "TOKEN_EXPIRED",
    );
    expectProblem(
      () =>
        assertUsableOneTimeToken(
          { ...base, consumedAt: new Date() },
          "PASSWORD_RESET",
        ),
      "TOKEN_INVALID",
    );
    expectProblem(
      () =>
        assertUsableOneTimeToken(
          { ...base, revokedAt: new Date() },
          "PASSWORD_RESET",
        ),
      "TOKEN_INVALID",
    );
  });

  it("enforces the invitation state machine", () => {
    const pending = {
      status: "PENDING",
      expiresAt: new Date("2026-07-20T00:00:00.000Z"),
      revokedAt: null,
    };
    expect(() =>
      assertPendingInvitation(pending, new Date("2026-07-18T00:00:00.000Z")),
    ).not.toThrow();
    expectProblem(
      () => assertPendingInvitation({ ...pending, status: "ACCEPTED" }),
      "TOKEN_INVALID",
    );
    expectProblem(
      () =>
        assertPendingInvitation({
          ...pending,
          status: "REVOKED",
          revokedAt: new Date(),
        }),
      "INVITATION_REVOKED",
    );
    expectProblem(
      () =>
        assertPendingInvitation({
          ...pending,
          expiresAt: new Date("2026-07-17T00:00:00.000Z"),
        }),
      "TOKEN_EXPIRED",
    );
  });

  it("uses stable versioned semantic event names", () => {
    expect(semanticEvents).toContain("user.registered.v1");
    expect(semanticEvents).toContain("membership.removed.v1");
    expect(semanticEvents.every((event) => event.endsWith(".v1"))).toBe(true);
  });

  it("validates all eight confirmed onboarding sections before readiness", () => {
    const complete = {
      couple: { confirmed: true },
      dateEvents: { confirmed: true },
      location: { confirmed: true },
      guests: { confirmed: true },
      budget: { confirmed: true },
      style: { confirmed: true },
      existingProgress: { confirmed: true },
      planningPreferences: { confirmed: true },
    };
    expect(isOnboardingComplete(complete)).toBe(true);
    expect(
      isOnboardingComplete({ ...complete, budget: { confirmed: false } }),
    ).toBe(false);
  });
});

function expectProblem(operation: () => void, code: string) {
  try {
    operation();
    throw new Error("Expected a ProblemException");
  } catch (error) {
    expect(error).toBeInstanceOf(ProblemException);
    expect((error as ProblemException).code).toBe(code);
  }
}
