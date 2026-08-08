import { describe, expect, it } from "vitest";
import {
  capabilityKeys,
  createTeamInvitationRequestSchema,
  defaultRoleTemplates,
  moneySchema,
  registerRequestSchema,
  semanticEvents,
  isOnboardingComplete,
  workspaceStatusSchema,
} from "@weddingos/contracts";
import { parseApiEnvironment } from "@weddingos/config";
import { createOpaqueToken, hashSecret } from "../src/auth/auth.crypto";
import { assertUsableOneTimeToken } from "../src/auth/one-time-token";
import { ProblemException } from "../src/common/problem";
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
    expect(environment.FEATURE_MFA_ENABLED).toBe(false);
  });

  it("normalizes email and enforces the shared password policy", () => {
    const parsed = registerRequestSchema.parse({
      firstName: " Ana ",
      lastName: " Pop ",
      email: " ANA.POP@EXAMPLE.TEST ",
      password: "WeddingOS2026!",
      registrationIntent: "EVENT_ORGANIZER",
      acceptedTermsVersion: "2026-07-18",
    });
    expect(parsed.email).toBe("ana.pop@example.test");
    expect(parsed.firstName).toBe("Ana");
    expect(() =>
      registerRequestSchema.parse({ ...parsed, password: "alllowercase" }),
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
