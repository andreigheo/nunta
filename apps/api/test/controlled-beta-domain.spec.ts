import { describe, expect, it } from "vitest";
import {
  acceptBetaInvitationSchema,
  betaProductEventSchema,
  capabilityKeys,
  createBetaCohortSchema,
  createBetaFeedbackSchema,
  createBetaInvitationSchema,
  createBetaProgramSchema,
  removeBetaParticipantSchema,
  triageBetaFeedbackSchema,
  updateBetaOnboardingSchema,
} from "@weddingos/contracts";

describe("Controlled Beta Operations contracts", () => {
  it("adds bounded platform beta capabilities without wildcard access", () => {
    expect(capabilityKeys).toEqual(
      expect.arrayContaining([
        "platform.beta.read",
        "platform.beta.manage",
        "platform.beta.invite",
        "platform.beta.triage",
      ]),
    );
    expect(capabilityKeys.some((key) => key.includes("*"))).toBe(false);
  });

  it("requires a release version for every beta program", () => {
    expect(
      createBetaProgramSchema.safeParse({
        key: "controlled-beta",
        name: "Sarbato Controlled Beta",
        releaseVersion: "",
      }).success,
    ).toBe(false);
    expect(
      createBetaProgramSchema.parse({
        key: "controlled-beta",
        name: "Sarbato Controlled Beta",
        releaseVersion: "beta.1",
      }).status,
    ).toBe("DRAFT");
  });

  it("bounds cohort capacity by participant category", () => {
    expect(
      createBetaCohortSchema.safeParse({
        programId: crypto.randomUUID(),
        key: "pilot-one",
        name: "Pilot one",
        description: "Controlled first cohort",
        targetCounts: { couples: 101, planners: 0, vendors: 0, testGuests: 0 },
      }).success,
    ).toBe(false);
  });

  it("accepts an invitation only with all mandatory acknowledgements", () => {
    expect(
      acceptBetaInvitationSchema.safeParse({
        token: "x".repeat(40),
        betaTermsAccepted: true,
        privacyNoticeAcknowledged: true,
        knownLimitationsAcknowledged: false,
        analyticsConsent: false,
      }).success,
    ).toBe(false);
  });

  it("keeps analytics consent optional and disabled by default", () => {
    expect(
      acceptBetaInvitationSchema.parse({
        token: "x".repeat(40),
        betaTermsAccepted: true,
        privacyNoticeAcknowledged: true,
        knownLimitationsAcknowledged: true,
      }).analyticsConsent,
    ).toBe(false);
  });

  it("rejects raw user agent and arbitrary browser metadata", () => {
    const result = createBetaFeedbackSchema.safeParse({
      type: "BUG",
      severity: "MEDIUM",
      currentRoute: "/overview",
      browserMetadata: {
        browserFamily: "Chromium",
        rawUserAgent: "sensitive raw header",
      },
      description: "A reproducible beta issue",
      expectedBehavior: "Expected behavior",
      actualBehavior: "Actual behavior",
    });
    expect(result.success).toBe(false);
  });

  it("allows only privacy-reviewed product events and scalar properties", () => {
    expect(
      betaProductEventSchema.safeParse({
        eventName: "page_content_captured",
        properties: {},
      }).success,
    ).toBe(false);
    expect(
      betaProductEventSchema.safeParse({
        eventName: "feedback_submitted",
        properties: { count: 1, body: { secret: true } },
      }).success,
    ).toBe(false);
  });

  it("requires optimistic versions for onboarding, removal and triage", () => {
    expect(
      updateBetaOnboardingSchema.safeParse({ checklist: {} }).success,
    ).toBe(false);
    expect(
      removeBetaParticipantSchema.safeParse({
        reason: "Controlled removal",
      }).success,
    ).toBe(false);
    expect(
      triageBetaFeedbackSchema.safeParse({
        status: "TRIAGED",
        reason: "Reviewed by beta operator",
      }).success,
    ).toBe(false);
  });

  it("does not accept an unbounded invitation lifetime", () => {
    expect(
      createBetaInvitationSchema.safeParse({
        programId: crypto.randomUUID(),
        cohortId: crypto.randomUUID(),
        email: "participant@example.test",
        participantType: "COUPLE",
        expiresInHours: 337,
      }).success,
    ).toBe(false);
  });
});
