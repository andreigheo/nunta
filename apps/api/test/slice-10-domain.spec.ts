import { describe, expect, it } from "vitest";
import {
  cookiePreferenceSchema,
  createBackupSchema,
  createDataSubjectRequestSchema,
  createFeatureFlagSchema,
  createLegalHoldSchema,
  createRestoreSchema,
  createSupportCaseSchema,
  capabilityKeys,
  platformReasonSchema,
  problemCodes,
  recordConsentSchema,
  semanticEvents,
} from "@weddingos/contracts";
import { parseApiEnvironment } from "@weddingos/config";

describe("Slice 10 platform, privacy and production contracts", () => {
  it("requires an explicit administrative reason and version", () => {
    expect(
      platformReasonSchema.safeParse({ reason: "short", version: 1 }).success,
    ).toBe(false);
    expect(
      platformReasonSchema.parse({ reason: "Reason reviewed", version: 2 })
        .version,
    ).toBe(2);
  });

  it("exposes atomic platform capabilities without wildcard grants", () => {
    expect(capabilityKeys).toContain("platform.user.suspend");
    expect(capabilityKeys).toContain("platform.privacy.override_hold");
    expect(capabilityKeys.some((capability) => capability.includes("*"))).toBe(
      false,
    );
  });

  it("keeps cookie categories opt-in except essential", () => {
    expect(cookiePreferenceSchema.parse({})).toEqual({
      preferences: false,
      analytics: false,
      marketing: false,
    });
  });

  it("versions consent purpose and source contracts", () => {
    expect(
      recordConsentSchema.parse({
        purpose: "AI_EXTERNAL_DATA",
        granted: false,
        source: "SETTINGS",
      }).granted,
    ).toBe(false);
  });

  it("validates DSAR scope instead of accepting arbitrary tenant types", () => {
    expect(
      createDataSubjectRequestSchema.safeParse({
        type: "EXPORT",
        scopeType: "GLOBAL",
      }).success,
    ).toBe(false);
  });

  it("requires legal-hold reason and a supported target", () => {
    expect(
      createLegalHoldSchema.safeParse({
        targetType: "USER",
        targetId: crypto.randomUUID(),
        reason: "too few",
      }).success,
    ).toBe(false);
  });

  it("separates backup and restore request contracts", () => {
    expect(
      createBackupSchema.parse({
        backupType: "DATABASE",
        reason: "Scheduled database backup",
      }).backupType,
    ).toBe("DATABASE");
    expect(
      createRestoreSchema.safeParse({
        backupRunId: crypto.randomUUID(),
        target: "x",
        reason: "Isolated restore validation",
      }).success,
    ).toBe(false);
  });

  it("validates scoped feature-flag rules", () => {
    const flag = createFeatureFlagSchema.parse({
      key: "slice10.flag",
      description: "Controlled flag",
      valueType: "BOOLEAN",
      defaultValue: false,
      rules: [{ scope: "PERCENTAGE", percentage: 10, value: true }],
      reason: "Controlled rollout reason",
    });
    expect(flag.rules).toHaveLength(1);
  });

  it("supports private operational support cases", () => {
    expect(
      createSupportCaseSchema.parse({
        type: "SECURITY",
        subject: "Investigate signal",
        description: "Bounded security investigation",
      }).priority,
    ).toBe("NORMAL");
  });

  it("registers Slice 10 errors and semantic events", () => {
    expect(problemCodes).toContain("PLATFORM_CAPABILITY_REQUIRED");
    expect(semanticEvents).toContain("privacy.deletion_requested.v1");
    expect(semanticEvents).toContain("backup.requested.v1");
  });

  it("rejects insecure production environment defaults", () => {
    expect(() =>
      parseApiEnvironment({
        NODE_ENV: "production",
        WEB_URL: "http://example.test",
        API_URL: "http://example.test",
        DATABASE_URL: "postgres://db",
        SESSION_SECRET: "replace-with-an-actually-secure-session-secret",
        EMAIL_FROM: "a@b.test",
        SMTP_HOST: "smtp",
        SMTP_PORT: "25",
        REDIS_URL: "redis://redis:6379",
        OUTBOX_ENCRYPTION_KEY: "12345678901234567890123456789012",
        LOG_LEVEL: "info",
      }),
    ).toThrow();
  });
});
