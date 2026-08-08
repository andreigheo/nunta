import { z } from "zod";

export const platformReasonSchema = z.object({
  reason: z.string().trim().min(8).max(2000),
  version: z.number().int().positive(),
});

export const createSupportCaseSchema = z.object({
  type: z.enum([
    "ACCOUNT_ACCESS",
    "BILLING",
    "PAYMENT",
    "PAYOUT",
    "DOCUMENT",
    "SIGNATURE",
    "MARKETPLACE",
    "REVIEW",
    "PRIVACY",
    "SECURITY",
    "BUG",
    "BETA_PRODUCT_FEEDBACK",
    "BETA_TECHNICAL_ISSUE",
    "BETA_ACCOUNT_ACCESS",
    "BETA_DATA_CORRECTION",
    "BETA_PRIVACY_REQUEST",
    "BETA_PAYMENT_SANDBOX",
    "BETA_VENDOR_WORKFLOW",
    "BETA_URGENT_BLOCKER",
    "OTHER",
  ]),
  subject: z.string().trim().min(3).max(240),
  description: z.string().trim().min(3).max(4000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  requesterUserId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  vendorOrganizationId: z.string().uuid().optional(),
});

export const supportCaseTransitionSchema = z.object({
  status: z.enum([
    "TRIAGED",
    "IN_PROGRESS",
    "WAITING_USER",
    "WAITING_PROVIDER",
    "RESOLVED",
    "CLOSED",
  ]),
  reason: z.string().trim().min(3).max(2000),
  assignedUserId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
});

export const supportNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  private: z.boolean().default(true),
});

const featureFlagRuleSchema = z.object({
  scope: z.enum([
    "GLOBAL",
    "ENVIRONMENT",
    "USER",
    "WORKSPACE",
    "VENDOR_ORGANIZATION",
    "PERCENTAGE",
  ]),
  target: z.string().trim().max(160).optional(),
  percentage: z.number().int().min(0).max(100).optional(),
  value: z.unknown(),
  expiresAt: z.string().datetime().optional(),
});

export const createFeatureFlagSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9._-]{2,119}$/),
  description: z.string().trim().min(3).max(1000),
  valueType: z.enum(["BOOLEAN", "STRING", "NUMBER", "JSON"]),
  defaultValue: z.unknown(),
  rules: z.array(featureFlagRuleSchema).max(100).default([]),
  killSwitch: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(8).max(1000),
});

export const updateFeatureFlagSchema = createFeatureFlagSchema
  .omit({ key: true })
  .partial()
  .extend({ reason: z.string().trim().min(8).max(1000) });

export const createMaintenanceWindowSchema = z.object({
  scope: z.enum(["FULL_PLATFORM", "API_MUTATIONS", "PROVIDER", "MODULE"]),
  scopeKey: z.string().trim().max(120).nullable().optional(),
  message: z.string().trim().min(3).max(1000),
  supportUrl: z.string().url().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().min(8).max(1000),
});

export const createLegalDocumentSchema = z.object({
  type: z.enum([
    "TERMS",
    "PRIVACY_POLICY",
    "COOKIE_POLICY",
    "AI_DATA_POLICY",
    "VENDOR_TERMS",
    "PAYMENT_TERMS",
    "BETA_TERMS",
    "BETA_PRIVACY_NOTICE",
    "BETA_KNOWN_LIMITATIONS",
  ]),
  key: z.string().regex(/^[a-z][a-z0-9-]{2,119}$/),
  name: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(1000),
  version: z.string().trim().min(1).max(40),
  language: z.string().trim().min(2).max(16).default("ro-RO"),
  content: z.string().min(20).max(200_000),
  effectiveAt: z.string().datetime().nullable().optional(),
});

export const recordConsentSchema = z.object({
  purpose: z.enum([
    "MARKETING",
    "ANALYTICS",
    "AI_EXTERNAL_DATA",
    "PRODUCT_RESEARCH",
    "BETA_PARTICIPATION",
    "BETA_PRODUCT_ANALYTICS",
  ]),
  granted: z.boolean(),
  legalDocumentVersionId: z.string().uuid().nullable().optional(),
  source: z.enum([
    "SETTINGS",
    "REGISTRATION",
    "COOKIE_BANNER",
    "ADMIN_MIGRATION",
    "BETA_INVITATION",
  ]),
});

export const withdrawConsentSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const cookiePreferenceSchema = z.object({
  preferences: z.boolean().default(false),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
});

export const createDataSubjectRequestSchema = z.object({
  type: z.enum([
    "ACCESS",
    "EXPORT",
    "RECTIFICATION",
    "DELETION",
    "RESTRICTION",
    "OBJECTION",
    "PORTABILITY",
  ]),
  scopeType: z.enum(["USER", "WORKSPACE", "VENDOR_ORGANIZATION"]),
  scopeId: z.string().uuid().nullable().optional(),
  details: z.string().trim().max(4000).optional(),
});

export const dataSubjectTransitionSchema = z.object({
  status: z.enum([
    "VERIFYING",
    "VERIFIED",
    "IN_REVIEW",
    "PROCESSING",
    "AWAITING_INFORMATION",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
  ]),
  reason: z.string().trim().min(3).max(2000),
  version: z.number().int().positive(),
});

export const createDeletionRequestSchema = z.object({
  targetType: z.enum([
    "USER_ACCOUNT",
    "WEDDING_WORKSPACE",
    "VENDOR_ORGANIZATION",
    "DOCUMENT",
    "COPILOT_CONVERSATION",
  ]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(8).max(2000),
});

export const createLegalHoldSchema = z.object({
  targetType: z.enum([
    "USER",
    "WORKSPACE",
    "VENDOR_ORGANIZATION",
    "BOOKING",
    "CONTRACT",
    "PAYMENT",
    "PAYOUT",
    "DOCUMENT",
    "SUPPORT_CASE",
  ]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(8).max(2000),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const releaseLegalHoldSchema = z.object({
  reason: z.string().trim().min(8).max(2000),
  version: z.number().int().positive(),
});

export const createBackupSchema = z.object({
  backupType: z.enum(["DATABASE", "OBJECT_INVENTORY", "FULL"]),
  reason: z.string().trim().min(8).max(2000),
});

export const createRestoreSchema = z.object({
  backupRunId: z.string().uuid(),
  target: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(8).max(2000),
});

export const createReleaseCandidateSchema = z.object({
  releaseId: z.string().regex(/^[a-zA-Z0-9._-]{3,120}$/),
  testEvidence: z.record(z.string(), z.unknown()),
  checksums: z.record(z.string(), z.string()),
  securityScans: z.record(z.string(), z.unknown()),
  backupVerificationId: z.string().uuid().nullable().optional(),
});

export const betaParticipantTypeSchema = z.enum([
  "COUPLE",
  "WEDDING_PLANNER",
  "VENDOR",
  "INTERNAL_OPERATOR",
  "TEST_GUEST",
]);
export const betaParticipantStatusSchema = z.enum([
  "INVITED",
  "ACCEPTED",
  "ONBOARDING",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "REMOVED",
]);
export const createBetaProgramSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  name: z.string().trim().min(3).max(160),
  status: z
    .enum(["DRAFT", "READY", "ACTIVE", "PAUSED", "CLOSED"])
    .default("DRAFT"),
  releaseVersion: z.string().trim().min(1).max(80),
  termsDocumentVersionId: z.string().uuid().nullable().optional(),
  privacyDocumentVersionId: z.string().uuid().nullable().optional(),
  limitsDocumentVersionId: z.string().uuid().nullable().optional(),
});
export const createBetaCohortSchema = z.object({
  programId: z.string().uuid(),
  key: z.string().regex(/^[a-z][a-z0-9-]{2,79}$/),
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().min(8).max(1000),
  targetCounts: z
    .object({
      couples: z.number().int().min(0).max(100).default(0),
      planners: z.number().int().min(0).max(100).default(0),
      vendors: z.number().int().min(0).max(100).default(0),
      testGuests: z.number().int().min(0).max(500).default(0),
    })
    .default({ couples: 0, planners: 0, vendors: 0, testGuests: 0 }),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});
export const createBetaInvitationSchema = z.object({
  programId: z.string().uuid(),
  cohortId: z.string().uuid(),
  organizationId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email().max(320),
  participantType: betaParticipantTypeSchema,
  expiresInHours: z.number().int().min(1).max(336).default(72),
});
export const acceptBetaInvitationSchema = z.object({
  token: z.string().min(32).max(500),
  betaTermsAccepted: z.literal(true),
  privacyNoticeAcknowledged: z.literal(true),
  knownLimitationsAcknowledged: z.literal(true),
  analyticsConsent: z.boolean().default(false),
});
export const updateBetaOnboardingSchema = z.object({
  version: z.number().int().positive(),
  checklist: z
    .object({
      profileReviewed: z.boolean(),
      sandboxAcknowledged: z.boolean(),
      supportPathReviewed: z.boolean(),
      feedbackPathReviewed: z.boolean(),
    })
    .strict(),
});
export const removeBetaParticipantSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(8).max(2000),
});
export const betaFeedbackTypeSchema = z.enum([
  "BUG",
  "CONFUSION",
  "MISSING_FEATURE",
  "PERFORMANCE",
  "DESIGN",
  "COPY",
  "DATA_PROBLEM",
  "SECURITY_CONCERN",
  "OTHER",
]);
export const betaFeedbackSeveritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export const betaFeedbackStatusSchema = z.enum([
  "NEW",
  "TRIAGED",
  "NEEDS_INFORMATION",
  "PLANNED",
  "IN_PROGRESS",
  "RESOLVED",
  "DECLINED",
  "DUPLICATE",
]);
export const safeBetaBrowserMetadataSchema = z
  .object({
    browserFamily: z.string().trim().max(60).optional(),
    browserMajor: z.string().trim().max(12).optional(),
    osFamily: z.string().trim().max(60).optional(),
    deviceClass: z.enum(["desktop", "tablet", "mobile"]).optional(),
    viewport: z
      .object({
        width: z.number().int().min(240).max(10_000),
        height: z.number().int().min(240).max(10_000),
      })
      .optional(),
    locale: z.string().trim().max(24).optional(),
    timezone: z.string().trim().max(80).optional(),
  })
  .strict();
export const createBetaFeedbackSchema = z.object({
  type: betaFeedbackTypeSchema,
  severity: betaFeedbackSeveritySchema,
  currentRoute: z.string().trim().startsWith("/").max(500),
  browserMetadata: safeBetaBrowserMetadataSchema.default({}),
  description: z.string().trim().min(8).max(4000),
  expectedBehavior: z.string().trim().min(3).max(4000),
  actualBehavior: z.string().trim().min(3).max(4000),
  screenshotObjectId: z.string().uuid().nullable().optional(),
  correlationId: z.string().trim().max(120).nullable().optional(),
});
export const betaFeedbackMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  version: z.number().int().positive(),
});
export const triageBetaFeedbackSchema = z.object({
  status: betaFeedbackStatusSchema.exclude(["NEW"]),
  severity: betaFeedbackSeveritySchema.optional(),
  duplicateOfId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(8).max(2000),
  version: z.number().int().positive(),
});
export const betaProductEventNameSchema = z.enum([
  "account_verified",
  "workspace_created",
  "onboarding_completed",
  "plan_generated",
  "plan_applied",
  "task_completed",
  "guest_import_completed",
  "invitation_published",
  "rsvp_received",
  "seating_plan_published",
  "rfq_sent",
  "offer_received",
  "contract_agreed",
  "budget_created",
  "payment_sandbox_completed",
  "wedding_day_plan_created",
  "check_in_completed",
  "copilot_used",
  "risk_created",
  "support_case_created",
  "feedback_submitted",
]);
export const betaProductEventSchema = z.object({
  eventName: betaProductEventNameSchema,
  route: z.string().trim().startsWith("/").max(500).nullable().optional(),
  sessionId: z.string().trim().min(8).max(200).nullable().optional(),
  properties: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
  occurredAt: z.string().datetime().optional(),
});

export type CreateSupportCaseInput = z.infer<typeof createSupportCaseSchema>;
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;
export type CreateDataSubjectRequestInput = z.infer<
  typeof createDataSubjectRequestSchema
>;
export type CreateDeletionRequestInput = z.infer<
  typeof createDeletionRequestSchema
>;
