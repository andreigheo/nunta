import { z } from "zod";

export * from "./operations";
export * from "./commercial";
export * from "./marketing";
export * from "./marketing-capability-manifest";

export * from "./slice3";

export const DEFAULT_LOCALE = "ro-RO" as const;
export const DEFAULT_TIMEZONE = "Europe/Bucharest" as const;
export const DEFAULT_CURRENCY = "RON" as const;
export const TERMS_VERSION = "2026-07-18" as const;

export const problemCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CURRENCY_MISMATCH",
  "RFQ_ALREADY_AWARDED",
  "AVAILABILITY_NOT_CONFIRMED",
  "PAYMENT_ADJUSTMENT_EXCEEDS_ORIGINAL",
  "VERSION_CONFLICT",
  "PRECONDITION_REQUIRED",
  "RATE_LIMITED",
  "EMAIL_NOT_VERIFIED",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "INVITATION_REVOKED",
  "WORKSPACE_ARCHIVED",
  "LAST_OWNER_PROTECTED",
  "EMAIL_ALREADY_REGISTERED",
  "INVALID_CREDENTIALS",
  "IDEMPOTENCY_CONFLICT",
  "FEATURE_DISABLED",
  "ORIGIN_NOT_ALLOWED",
  "INTERNAL_ERROR",
  "ASYNC_DEPENDENCY_UNAVAILABLE",
  "JOB_NOT_FOUND",
  "ONBOARDING_INCOMPLETE",
  "UPLOAD_EXPIRED",
  "UPLOAD_MISMATCH",
  "UNSUPPORTED_MEDIA_TYPE",
  "DOCUMENT_QUARANTINED",
  "DOCUMENT_NOT_AVAILABLE",
  "SIGNATURE_VERSION_MISMATCH",
  "SIGNATURE_EVENT_INVALID",
  "PAYMENT_PROVIDER_NOT_CONFIGURED",
  "PAYMENT_AMOUNT_INVALID",
  "PAYMENT_EVENT_INVALID",
  "REFUND_EXCEEDS_CAPTURED",
  "REVIEW_NOT_ELIGIBLE",
  "REVIEW_EDIT_WINDOW_CLOSED",
  "REVIEW_ALREADY_EXISTS",
  "ENTITLEMENT_REQUIRED",
  "USAGE_LIMIT_REACHED",
  "SUBSCRIPTION_EVENT_INVALID",
  "BILLING_NOT_CONFIGURED",
  "PADDLE_CHECKOUT_UNAVAILABLE",
  "PADDLE_SIGNATURE_INVALID",
  "PADDLE_PRICE_MISMATCH",
  "PADDLE_PLAN_AMBIGUOUS",
  "PADDLE_PLAN_BINDING_INVALID",
  "PADDLE_REQUEST_FAILED",
  "CHECKOUT_ALREADY_STARTED",
  "CHECKOUT_RECOVERY_PENDING",
  "SUBSCRIPTION_PORTAL_UNAVAILABLE",
  "PADDLE_EVENT_COLLISION",
  "PAYOUT_ACCOUNT_NOT_READY",
  "SETTLEMENT_NOT_PAYABLE",
  "PAYOUT_EVENT_INVALID",
  "SELF_SUSPENSION_DENIED",
  "RESTORE_TARGET_DENIED",
  "BACKUP_NOT_RESTORABLE",
  "PLATFORM_CAPABILITY_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "CSRF_TOKEN_INVALID",
  "MAINTENANCE_ACTIVE",
  "MFA_ENROLLMENT_INVALID",
  "MFA_CODE_INVALID",
  "MFA_CODE_REPLAYED",
  "MFA_REQUIRED",
  "RECENT_AUTH_REQUIRED",
  "STEP_UP_CHALLENGE_INVALID",
  "STEP_UP_REQUIRED",
  "RETENTION_CONFIRMATION_REQUIRED",
  "RETENTION_ENTITY_DENIED",
  "DELETION_GRACE_ACTIVE",
  "DELETION_TARGET_DENIED",
  "LEGAL_HOLD_ACTIVE",
  "PLAN_UPGRADE_REQUIRED",
] as const;

export const apiProblemCodeSchema = z.enum(problemCodes);
export type ApiProblemCode = z.infer<typeof apiProblemCodeSchema>;

export const apiProblemSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int(),
  code: apiProblemCodeSchema,
  detail: z.string().optional(),
  requestId: z.string(),
  fieldErrors: z.record(z.array(z.string())).optional(),
  latestVersion: z.number().int().positive().optional(),
  requiredCapability: z.string().min(1).optional(),
});
export type ApiProblem = z.infer<typeof apiProblemSchema>;

export type ApiResponse<T> = {
  data: T;
  meta: {
    requestId: string;
    version?: number;
    nextCursor?: string;
  };
};

export function apiResponseSchema<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: schema,
    meta: z.object({
      requestId: z.string(),
      version: z.number().int().optional(),
      nextCursor: z.string().optional(),
    }),
  });
}

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export type Money = z.infer<typeof moneySchema>;

export const capabilityKeys = [
  "workspace.read",
  "workspace.update",
  "workspace.billing.read",
  "workspace.billing.manage",
  "workspace.archive",
  "workspace.delete",
  "workspace.manage_members",
  "workspace.transfer_ownership",
  "team.read",
  "team.invite",
  "team.update_role",
  "team.remove",
  "settings.read",
  "settings.update",
  "workspace.manage_public_aggregation",
  "guest.read",
  "guest.read_pii",
  "guest.write",
  "guest.archive",
  "guest.import",
  "guest.export",
  "guest.read_sensitive",
  "invitation.read",
  "invitation.write",
  "invitation.publish",
  "invitation.manage_recipients",
  "campaign.read",
  "campaign.write",
  "campaign.send",
  "campaign.view_delivery",
  "rsvp.read",
  "rsvp.write",
  "rsvp.override",
  "rsvp.configure",
  "menu.read",
  "menu.write",
  "menu.read_allergies",
  "menu.resolve_allergies",
  "menu.export",
  "finance.read",
  "finance.write",
  "contract.read",
  "contract.write",
  "planning.read",
  "planning.write",
  "planning.generate",
  "planning.apply",
  "task.read",
  "task.write",
  "task.assign",
  "task.delete",
  "task.read_private",
  "calendar.read",
  "calendar.write",
  "timeline.read",
  "timeline.write",
  "timeline.recalculate",
  "wedding_day.read",
  "wedding_day.write",
  "wedding_day.publish",
  "wedding_day.go_live",
  "wedding_day.transition",
  "wedding_day.manage_contacts",
  "copilot.read",
  "copilot.use",
  "copilot.review_proposals",
  "copilot.execute_proposals",
  "copilot.create_proposal",
  "copilot.approve_low_risk",
  "copilot.approve_medium_risk",
  "copilot.approve_high_risk",
  "copilot.view_usage",
  "copilot.configure_provider",
  "risk.read",
  "risk.write",
  "risk.detect",
  "risk.assess",
  "risk.assign",
  "risk.accept",
  "risk.resolve",
  "risk.read_sensitive",
  "contingency.read",
  "contingency.write",
  "contingency.approve",
  "contingency.activate",
  "contingency.complete",
  "automation.read",
  "automation.write",
  "automation.execute",
  "automation.activate",
  "automation.pause",
  "automation.approve",
  "automation.view_executions",
  "automation.manage_templates",
  "incident.read",
  "incident.write",
  "incident.assign",
  "incident.resolve",
  "incident.read_sensitive",
  "announcement.read",
  "announcement.write",
  "announcement.publish",
  "check_in.read",
  "check_in.write",
  "check_in.override",
  "check_in.manage_sessions",
  "check_in.manage_devices",
  "check_in.offline_sync",
  "guest_moment.read",
  "guest_moment.upload",
  "guest_moment.moderate",
  "guest_moment.publish",
  "guest_moment.delete",
  "gallery.read",
  "gallery.write",
  "gallery.publish",
  "seating.read",
  "seating.write",
  "seating.assign",
  "seating.publish",
  "seating.generate_suggestion",
  "seating.export",
  "seating.read_sensitive_summary",
  "transport.read",
  "transport.write",
  "transport.assign",
  "transport.publish",
  "transport.export",
  "transport.read_sensitive",
  "accommodation.read",
  "accommodation.write",
  "accommodation.assign",
  "accommodation.publish",
  "accommodation.export",
  "accommodation.read_sensitive",
  "marketplace.read",
  "marketplace.favorite",
  "marketplace.shortlist",
  "rfq.read",
  "rfq.write",
  "rfq.send",
  "rfq.close",
  "offer.read",
  "offer.review",
  "offer.request_revision",
  "offer.accept",
  "offer.reject",
  "booking.read",
  "booking.write",
  "booking.transition",
  "contract.review",
  "contract.acknowledge",
  "contract.cancel",
  "contract.export",
  "budget.read",
  "budget.write",
  "budget.export",
  "expense.read",
  "expense.write",
  "payment.read",
  "payment.write",
  "payment.confirm",
  "payment.reverse",
  "payment.export",
  "document.read",
  "document.write",
  "document.upload",
  "document.download",
  "document.share",
  "document.delete",
  "document.read_sensitive",
  "document.manage_retention",
  "document.view_access_log",
  "signature.read",
  "signature.create",
  "signature.send",
  "signature.cancel",
  "signature.sign",
  "signature.download_evidence",
  "signature.configure_provider",
  "online_payment.read",
  "online_payment.create_checkout",
  "online_payment.expire_checkout",
  "online_payment.request_refund",
  "online_payment.read_provider_details",
  "online_payment.reconcile",
  "online_payment.configure_provider",
  "review.read",
  "review.write",
  "review.publish",
  "review.withdraw",
  "review.report",
  "vendor.organization.read",
  "vendor.organization.write",
  "vendor.members.read",
  "vendor.members.write",
  "vendor.profile.read",
  "vendor.profile.write",
  "vendor.profile.publish",
  "vendor.services.read",
  "vendor.services.write",
  "vendor.availability.read",
  "vendor.availability.write",
  "vendor.rfq.read",
  "vendor.rfq.decline",
  "vendor.offer.read",
  "vendor.offer.write",
  "vendor.offer.submit",
  "vendor.booking.read",
  "vendor.booking.transition",
  "vendor.contract.read",
  "vendor.contract.write",
  "vendor.contract.acknowledge",
  "vendor.review.read",
  "vendor.review.reply",
  "vendor.review.dispute",
  "vendor.review.analytics",
  "vendor.subscription.read",
  "vendor.subscription.checkout",
  "vendor.subscription.manage",
  "vendor.subscription.portal",
  "vendor.subscription.view_usage",
  "vendor.payout.read",
  "vendor.payout.onboard",
  "vendor.payout.request",
  "vendor.payout.export",
  "vendor.payout.read_sensitive_summary",
  "platform.review_moderate",
  "platform.review_view_private",
  "platform.review_decide",
  "platform.vendor_suspend",
  "platform.subscription.read",
  "platform.subscription.write_plans",
  "platform.subscription.manage",
  "platform.subscription.reconcile",
  "platform.settlement.read",
  "platform.settlement.calculate",
  "platform.settlement.finalize",
  "platform.payout.create",
  "platform.payout.reconcile",
  "platform.payout.view_provider_details",
  "platform.dashboard.read",
  "platform.user.read",
  "platform.user.suspend",
  "platform.user.reactivate",
  "platform.user.request_deletion",
  "platform.workspace.read",
  "platform.workspace.suspend",
  "platform.workspace.reactivate",
  "platform.workspace.request_deletion",
  "platform.vendor.read",
  "platform.vendor.suspend",
  "platform.vendor.reactivate",
  "platform.support.read",
  "platform.support.write",
  "platform.support.assign",
  "platform.support.close",
  "platform.trust.read",
  "platform.trust.moderate",
  "platform.finance.read",
  "platform.finance.reconcile",
  "platform.finance.hold",
  "platform.finance.release",
  "platform.provider.read",
  "platform.provider.manage",
  "platform.provider.reconcile",
  "platform.feature_flag.read",
  "platform.feature_flag.write",
  "platform.maintenance.read",
  "platform.maintenance.write",
  "platform.audit.read",
  "platform.audit.export",
  "platform.privacy.read",
  "platform.privacy.process",
  "platform.privacy.override_hold",
  "platform.security.read",
  "platform.security.respond",
  "platform.release.read",
  "platform.release.approve",
  "platform.beta.read",
  "platform.beta.manage",
  "platform.beta.invite",
  "platform.beta.triage",
  "admin.none",
] as const;
export const capabilityKeySchema = z.enum(capabilityKeys);
export type CapabilityKey = z.infer<typeof capabilityKeySchema>;
export const nonDelegableCapabilityKeys = [
  "workspace.manage_public_aggregation",
  "workspace.billing.read",
  "workspace.billing.manage",
] as const satisfies readonly CapabilityKey[];

// Slice 7 — verified marketplace trust and vendor monetization.
export const reviewCriterionRatingsSchema = z.object({
  QUALITY: z.number().int().min(1).max(5),
  COMMUNICATION: z.number().int().min(1).max(5),
  RELIABILITY: z.number().int().min(1).max(5),
  VALUE: z.number().int().min(1).max(5),
  PROFESSIONALISM: z.number().int().min(1).max(5),
  FLEXIBILITY: z.number().int().min(1).max(5),
});
export const createVendorReviewSchema = z.object({
  eligibilityId: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(20).max(4000),
  overallRating: z.number().int().min(1).max(5),
  criteria: reviewCriterionRatingsSchema,
  publicDisplayName: z.string().trim().min(1).max(120).optional(),
  authenticityConfirmed: z.literal(true),
});
export const updateVendorReviewDraftSchema = createVendorReviewSchema
  .omit({ eligibilityId: true, authenticityConfirmed: true })
  .partial();
export const publishVendorReviewSchema = z.object({
  authenticityConfirmed: z.literal(true),
});
export const vendorReviewReplySchema = z.object({
  body: z.string().trim().min(2).max(2000),
});
export const vendorReviewDisputeSchema = z.object({
  reason: z.string().trim().min(2).max(1000),
  statementPrivate: z.string().trim().min(10).max(4000),
});
export const reviewReportSchema = z.object({
  reason: z.string().trim().min(2).max(80),
  details: z.string().trim().max(2000).optional(),
});
export const moderationTransitionSchema = z.object({
  status: z.enum([
    "OPEN",
    "TRIAGED",
    "INVESTIGATING",
    "AWAITING_INFORMATION",
    "RESOLVED",
    "CLOSED",
  ]),
});
export const moderationDecisionSchema = z.object({
  decision: z.enum([
    "NO_ACTION",
    "HIDE_CONTENT",
    "RESTORE_CONTENT",
    "REJECT_REVIEW",
    "SUSPEND_REVIEW",
    "REVOKE_VERIFICATION",
  ]),
  reason: z.string().trim().min(3).max(2000),
});
export const subscriptionCheckoutRequestSchema = z.object({
  planKey: z.string().trim().min(1).max(64),
  priceId: z.string().uuid().optional(),
});
export const subscriptionProductMutationSchema = z.object({
  key: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
});
export const subscriptionPriceMutationSchema = z.object({
  productId: z.string().uuid().optional(),
  provider: z.string().trim().max(80).optional(),
  providerPriceId: z.string().trim().max(180).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  amountMinor: z.number().int().nonnegative().optional(),
  billingInterval: z.enum(["MONTH", "YEAR"]).optional(),
  billingIntervalCount: z.number().int().positive().optional(),
  trialDays: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});
export const payoutAccountRequestSchema = z.object({
  country: z.string().length(2).default("RO"),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("RON"),
});
export const settlementCalculationSchema = z.object({
  vendorOrganizationId: z.string().uuid(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});
export const trustMonetizationResourceSchema = z
  .object({
    id: z.string().uuid().optional(),
    workspaceId: z.string().uuid().optional(),
    vendorOrganizationId: z.string().uuid().optional(),
    status: z.string().optional(),
    version: z.number().int().positive().optional(),
  })
  .passthrough();
export const trustMonetizationListSchema = z
  .object({ items: z.array(trustMonetizationResourceSchema) })
  .passthrough();

export type CreateVendorReview = z.infer<typeof createVendorReviewSchema>;
export type ReviewCriterionRatings = z.infer<
  typeof reviewCriterionRatingsSchema
>;

export const roleTemplateKeys = [
  "couple_owner",
  "couple_partner",
  "wedding_planner",
  "family_collaborator",
  "viewer",
] as const;
export const roleTemplateKeySchema = z.enum(roleTemplateKeys);
export type RoleTemplateKey = z.infer<typeof roleTemplateKeySchema>;

const ownerCapabilities = capabilityKeys.filter(
  (key) => key !== "admin.none" && key !== "copilot.configure_provider",
);

export const defaultRoleTemplates: ReadonlyArray<{
  key: RoleTemplateKey;
  name: string;
  description: string;
  capabilities: readonly CapabilityKey[];
}> = [
  {
    key: "couple_owner",
    name: "Proprietar",
    description: "Administrează integral spațiul de lucru și echipa.",
    capabilities: ownerCapabilities,
  },
  {
    key: "couple_partner",
    name: "Partener",
    description:
      "Administrează planificarea, fără ștergere sau transfer implicit.",
    capabilities: capabilityKeys.filter(
      (key) =>
        ![
          "workspace.delete",
          "workspace.transfer_ownership",
          "workspace.manage_public_aggregation",
          "workspace.billing.manage",
          "copilot.configure_provider",
          "admin.none",
        ].includes(key),
    ),
  },
  {
    key: "wedding_planner",
    name: "Wedding planner",
    description:
      "Acces operațional configurabil, fără date sensibile implicite.",
    capabilities: [
      "workspace.read",
      "team.read",
      "settings.read",
      "guest.read",
      "guest.read_pii",
      "guest.write",
      "guest.import",
      "guest.export",
      "invitation.read",
      "invitation.write",
      "invitation.publish",
      "invitation.manage_recipients",
      "campaign.read",
      "campaign.write",
      "campaign.send",
      "campaign.view_delivery",
      "rsvp.read",
      "rsvp.write",
      "rsvp.override",
      "rsvp.configure",
      "menu.read",
      "menu.write",
      "menu.read_allergies",
      "menu.resolve_allergies",
      "menu.export",
      "planning.read",
      "planning.write",
      "planning.generate",
      "planning.apply",
      "task.read",
      "task.write",
      "task.assign",
      "task.delete",
      "calendar.read",
      "calendar.write",
      "timeline.read",
      "timeline.write",
      "timeline.recalculate",
      "wedding_day.read",
      "wedding_day.write",
      "wedding_day.publish",
      "wedding_day.go_live",
      "wedding_day.transition",
      "wedding_day.manage_contacts",
      "copilot.read",
      "copilot.use",
      "copilot.review_proposals",
      "copilot.execute_proposals",
      "copilot.create_proposal",
      "copilot.approve_low_risk",
      "copilot.approve_medium_risk",
      "copilot.view_usage",
      "risk.read",
      "risk.write",
      "risk.detect",
      "risk.assess",
      "risk.assign",
      "risk.accept",
      "risk.resolve",
      "contingency.read",
      "contingency.write",
      "contingency.approve",
      "contingency.activate",
      "contingency.complete",
      "automation.read",
      "automation.write",
      "automation.execute",
      "automation.activate",
      "automation.pause",
      "automation.approve",
      "automation.view_executions",
      "incident.read",
      "incident.write",
      "incident.assign",
      "incident.resolve",
      "incident.read_sensitive",
      "announcement.read",
      "announcement.write",
      "announcement.publish",
      "check_in.read",
      "check_in.write",
      "check_in.override",
      "check_in.manage_sessions",
      "check_in.manage_devices",
      "check_in.offline_sync",
      "guest_moment.read",
      "guest_moment.upload",
      "guest_moment.moderate",
      "guest_moment.publish",
      "guest_moment.delete",
      "gallery.read",
      "gallery.write",
      "gallery.publish",
      "seating.read",
      "seating.write",
      "seating.assign",
      "seating.publish",
      "seating.generate_suggestion",
      "seating.export",
      "seating.read_sensitive_summary",
      "transport.read",
      "transport.write",
      "transport.assign",
      "transport.publish",
      "transport.export",
      "transport.read_sensitive",
      "accommodation.read",
      "accommodation.write",
      "accommodation.assign",
      "accommodation.publish",
      "accommodation.export",
      "accommodation.read_sensitive",
      "marketplace.read",
      "marketplace.favorite",
      "marketplace.shortlist",
      "rfq.read",
      "rfq.write",
      "rfq.send",
      "rfq.close",
      "offer.read",
      "offer.review",
      "offer.request_revision",
      "offer.accept",
      "offer.reject",
      "booking.read",
      "booking.write",
      "booking.transition",
      "contract.read",
      "contract.write",
      "contract.review",
      "contract.cancel",
      "contract.export",
      "budget.read",
      "budget.write",
      "budget.export",
      "expense.read",
      "expense.write",
      "payment.read",
      "payment.write",
      "payment.export",
      "document.read",
      "document.write",
      "document.upload",
      "document.download",
      "signature.read",
      "signature.create",
      "signature.send",
      "signature.sign",
      "signature.download_evidence",
      "online_payment.read",
      "online_payment.create_checkout",
      "online_payment.expire_checkout",
    ],
  },
  {
    key: "family_collaborator",
    name: "Familie",
    description: "Colaborator cu acces limitat.",
    capabilities: [
      "workspace.read",
      "team.read",
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
    ],
  },
  {
    key: "viewer",
    name: "Vizualizator",
    description: "Acces doar pentru citire la suprafețele permise.",
    capabilities: [
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
    ],
  },
];

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const registrationIntentSchema = z.enum([
  "EVENT_ORGANIZER",
  "SERVICE_PROVIDER",
  "INVITED_MEMBER",
]);
export type RegistrationIntent = z.infer<typeof registrationIntentSchema>;

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "Parola trebuie să conțină o literă mică.")
  .regex(/[A-Z]/, "Parola trebuie să conțină o literă mare.")
  .regex(/[0-9]/, "Parola trebuie să conțină o cifră.");

export const registerRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
  registrationIntent: registrationIntentSchema
    .optional()
    .default("EVENT_ORGANIZER"),
  acceptedTermsVersion: z.string().min(1).max(40),
  marketingConsent: z.boolean().optional().default(false),
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

export const registerResponseSchema = z.object({
  userId: z.string().uuid(),
  emailVerificationRequired: z.literal(true),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const emailVerificationRequestSchema = z.object({
  email: emailSchema,
});
export type EmailVerificationRequest = z.infer<
  typeof emailVerificationRequestSchema
>;

export const emailVerificationSchema = z
  .object({
    token: z.string().min(32).optional(),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    email: emailSchema.optional(),
  })
  .refine((value) => Boolean(value.token || (value.code && value.email)), {
    message: "Furnizează tokenul sau combinația email și cod.",
  });
export type EmailVerification = z.infer<typeof emailVerificationSchema>;

export const createSessionRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  remember: z.boolean().default(false),
});
export type CreateSessionRequest = z.input<typeof createSessionRequestSchema>;

export const sessionCreatedSchema = z.object({
  authenticated: z.literal(true),
  sessionId: z.string().uuid(),
});
export type SessionCreated = z.infer<typeof sessionCreatedSchema>;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetSchema = z.object({
  token: z.string().min(32),
  password: passwordSchema,
});
export type PasswordReset = z.infer<typeof passwordResetSchema>;

export const magicLinkRequestSchema = z.object({ email: emailSchema });
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkExchangeSchema = z.object({ token: z.string().min(32) });
export type MagicLinkExchange = z.infer<typeof magicLinkExchangeSchema>;

export const neutralAuthResponseSchema = z.object({
  accepted: z.literal(true),
});
export type NeutralAuthResponse = z.infer<typeof neutralAuthResponseSchema>;

export const verifiedResponseSchema = z.object({ verified: z.literal(true) });
export const passwordResetResponseSchema = z.object({ reset: z.literal(true) });
export const profileUpdatedSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  version: z.number().int().positive(),
});

export const currentUserSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    emailVerified: z.boolean(),
  }),
  preferences: z.object({
    locale: z.string(),
    timezone: z.string(),
    theme: themePreferenceSchema,
    registrationIntent: registrationIntentSchema,
  }),
  contexts: z.object({
    workspaces: z.boolean(),
    vendorOrganizations: z.boolean(),
    platform: z.boolean(),
  }),
  globalCapabilities: z.array(capabilityKeySchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

export const updateProfileRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const userPreferenceSchema = z.object({
  locale: z.string().min(2).max(16),
  timezone: z.string().min(1).max(80),
  theme: themePreferenceSchema,
  registrationIntent: registrationIntentSchema,
  lastActiveWorkspaceId: z.string().uuid().nullable(),
});
export type UserPreference = z.infer<typeof userPreferenceSchema>;

export const updateUserPreferenceSchema = userPreferenceSchema.partial();
export type UpdateUserPreference = z.infer<typeof updateUserPreferenceSchema>;

export const notificationPreferenceSchema = z.object({
  securityEmail: z.boolean(),
  tasksEmail: z.boolean(),
  paymentsEmail: z.boolean(),
  rsvpEmail: z.boolean(),
  vendorsEmail: z.boolean(),
  digestEmail: z.boolean(),
  marketingEmail: z.boolean(),
  productPush: z.boolean(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});
export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;
export const updateNotificationPreferenceSchema =
  notificationPreferenceSchema.partial();
export type UpdateNotificationPreference = z.infer<
  typeof updateNotificationPreferenceSchema
>;

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  current: z.boolean(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const workspaceStatusSchema = z.enum(["active", "archived"]);
export const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  weddingDate: z.string().date().nullable(),
  location: z.string().nullable(),
  status: workspaceStatusSchema,
  role: roleTemplateKeySchema,
  capabilities: z.array(capabilityKeySchema),
  imageUrl: z.string().url().nullable(),
  progress: z.number().min(0).max(100).nullable(),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const workspaceMutationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  weddingDate: z.string().date().nullable(),
  location: z.string().nullable(),
  timezone: z.string(),
  currency: z.string(),
  version: z.number().int().positive(),
});

export const createWorkspaceRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  partnerOneName: z.string().trim().max(100).optional(),
  partnerTwoName: z.string().trim().max(100).optional(),
  weddingDate: z.string().date().optional(),
  location: z.string().trim().max(160).optional(),
  locale: z.string().min(2).max(16).default(DEFAULT_LOCALE),
  timezone: z.string().min(1).max(80).default(DEFAULT_TIMEZONE),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default(DEFAULT_CURRENCY),
});
export type CreateWorkspaceRequest = z.input<
  typeof createWorkspaceRequestSchema
>;

export const updateWorkspaceRequestSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  partnerOneName: z.string().trim().max(100).nullable().optional(),
  partnerTwoName: z.string().trim().max(100).nullable().optional(),
  weddingDate: z.string().date().nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  locale: z.string().min(2).max(16).optional(),
  timezone: z.string().min(1).max(80).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  version: z.number().int().positive(),
});
export type UpdateWorkspaceRequest = z.infer<
  typeof updateWorkspaceRequestSchema
>;

export const workspaceBootstrapSchema = z.object({
  workspace: z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: workspaceStatusSchema,
    weddingDate: z.string().date().nullable(),
    timezone: z.string(),
    currency: z.string(),
    version: z.number().int(),
  }),
  membership: z.object({
    id: z.string().uuid(),
    roleTemplate: roleTemplateKeySchema,
    capabilities: z.array(capabilityKeySchema),
  }),
  shell: z.object({
    unreadNotifications: z.number().int().nonnegative(),
    pendingAiProposals: z.number().int().nonnegative(),
    urgentTasks: z.number().int().nonnegative(),
    unansweredRsvp: z.number().int().nonnegative(),
    vendorReplies: z.number().int().nonnegative(),
    upcomingPayments: z.number().int().nonnegative(),
  }),
  subscription: z.object({
    plan: z.enum(["FREE", "PLUS", "PRO"]),
    status: z.enum([
      "FREE",
      "INCOMPLETE",
      "ACTIVE",
      "PAST_DUE",
      "PAUSED",
      "CANCELED",
    ]),
    entitlements: z.record(z.union([z.boolean(), z.number()])),
    currentPeriodEnd: z.string().datetime().nullable(),
    cancelAtPeriodEnd: z.boolean(),
  }),
});
export type WorkspaceBootstrap = z.infer<typeof workspaceBootstrapSchema>;

export const workspaceSubscriptionPlanKeySchema = z.enum([
  "FREE",
  "PLUS",
  "PRO",
]);
export type WorkspaceSubscriptionPlanKey = z.infer<
  typeof workspaceSubscriptionPlanKeySchema
>;

export const workspaceSubscriptionUsageSchema = z.record(
  z.object({
    used: z.number().nonnegative(),
    limit: z.number().nonnegative(),
  }),
);
export type WorkspaceSubscriptionUsage = z.infer<
  typeof workspaceSubscriptionUsageSchema
>;

export const workspaceSubscriptionRolePolicySchema = z.object({
  role: roleTemplateKeySchema,
  name: z.string(),
  access: z.enum(["owner", "operate", "collaborate", "view"]),
  billing: z.enum(["manage", "read", "none"]),
  description: z.string(),
});
export type WorkspaceSubscriptionRolePolicy = z.infer<
  typeof workspaceSubscriptionRolePolicySchema
>;

export const workspaceSubscriptionPlanSchema = z.object({
  key: workspaceSubscriptionPlanKeySchema,
  name: z.string(),
  description: z.string(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.literal("EUR"),
  interval: z.literal("month"),
  recommended: z.boolean(),
  features: z.array(z.string()),
  entitlements: z.record(z.union([z.boolean(), z.number()])),
});
export type WorkspaceSubscriptionPlan = z.infer<
  typeof workspaceSubscriptionPlanSchema
>;

export const workspaceBillingTransactionSchema = z.object({
  id: z.string().uuid(),
  providerTransactionId: z.string(),
  providerSubscriptionId: z.string().nullable(),
  plan: workspaceSubscriptionPlanKeySchema,
  status: z.string(),
  currency: z.string().length(3),
  subtotalMinor: z.number().int().nonnegative(),
  discountMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
  totalMinor: z.number().int().nonnegative(),
  feeMinor: z.number().int().nonnegative().nullable(),
  earningsMinor: z.number().int().nonnegative().nullable(),
  invoiceNumber: z.string().nullable(),
  billedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
});
export type WorkspaceBillingTransaction = z.infer<
  typeof workspaceBillingTransactionSchema
>;

export const workspaceBillingOverviewSchema = z.object({
  provider: z.enum(["disabled", "paddle"]),
  checkoutAvailable: z.boolean(),
  portalAvailable: z.boolean(),
  plans: z.array(workspaceSubscriptionPlanSchema),
  subscription: workspaceBootstrapSchema.shape.subscription,
  transactions: z.array(workspaceBillingTransactionSchema),
  usage: workspaceSubscriptionUsageSchema,
  rolePolicy: z.array(workspaceSubscriptionRolePolicySchema),
});
export type WorkspaceBillingOverview = z.infer<
  typeof workspaceBillingOverviewSchema
>;

export const createWorkspaceSubscriptionCheckoutSchema = z.object({
  plan: z.enum(["PLUS", "PRO"]),
});
export type CreateWorkspaceSubscriptionCheckout = z.infer<
  typeof createWorkspaceSubscriptionCheckoutSchema
>;

export const overrideInputSchema = z
  .object({
    capability: capabilityKeySchema,
    effect: z.enum(["allow", "deny"]),
  })
  .refine(
    (override) =>
      !nonDelegableCapabilityKeys.includes(
        override.capability as (typeof nonDelegableCapabilityKeys)[number],
      ),
    { path: ["capability"], message: "Capability cannot be delegated" },
  );
export type CapabilityOverrideInput = z.infer<typeof overrideInputSchema>;

export const teamMemberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: roleTemplateKeySchema,
  status: z.enum(["active", "removed"]),
  capabilities: z.array(capabilityKeySchema),
  lastActiveAt: z.string().datetime().nullable(),
  version: z.number().int(),
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

export const teamInvitationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workspaceTitle: z.string(),
  email: z.string().email(),
  role: roleTemplateKeySchema,
  status: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
  expiresAt: z.string().datetime(),
  invitedByName: z.string(),
  version: z.number().int(),
});
export type TeamInvitation = z.infer<typeof teamInvitationSchema>;

export const teamListSchema = z.object({
  members: z.array(teamMemberSchema),
  invitations: z.array(teamInvitationSchema),
});
export type TeamList = z.infer<typeof teamListSchema>;

export const publicTeamInvitationSchema = teamInvitationSchema.extend({
  weddingDate: z.string().date().nullable(),
});
export const invitationAcceptedSchema = z.object({
  workspaceId: z.string().uuid(),
  membershipId: z.string().uuid(),
});
export const invitationDeclinedSchema = z.object({
  declined: z.literal(true),
});

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("weddingos-api"),
});
export const readinessSchema = z.object({
  status: z.enum(["ready", "degraded"]),
  database: z.literal("connected"),
  redis: z.enum(["connected", "unavailable"]),
  worker: z.enum(["healthy", "stale"]),
  lastWorkerHeartbeat: z.string().datetime().nullable(),
  outbox: z.enum(["dispatching", "buffering"]),
});

export const createTeamInvitationRequestSchema = z.object({
  email: emailSchema,
  roleTemplate: roleTemplateKeySchema.exclude(["couple_owner"]),
  capabilityOverrides: z
    .array(overrideInputSchema)
    .max(capabilityKeys.length)
    .default([]),
});
export type CreateTeamInvitationRequest = z.input<
  typeof createTeamInvitationRequestSchema
>;

export const updateMemberRequestSchema = z.object({
  roleTemplate: roleTemplateKeySchema.optional(),
  capabilityOverrides: z
    .array(overrideInputSchema)
    .max(capabilityKeys.length)
    .optional(),
  version: z.number().int().positive(),
});
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const mfaChallengeRequestSchema = z.object({
  method: z.enum(["totp", "email"]),
});
export const mfaVerificationRequestSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(6).max(10),
});

export const backgroundJobStatusSchema = z.enum([
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
]);

export const backgroundJobSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().nullable(),
  type: z.string(),
  status: backgroundJobStatusSchema,
  progress: z.number().int().min(0).max(100),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  result: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  version: z.number().int().positive(),
});
export type BackgroundJobResource = z.infer<typeof backgroundJobSchema>;

export const notificationSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid().nullable(),
  module: z.string(),
  kind: z.string(),
  priority: z.string(),
  title: z.string(),
  body: z.string(),
  actionUrl: z.string().nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export type NotificationResource = z.infer<typeof notificationSchema>;

export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;
export const unreadNotificationCountSchema = z.object({
  count: z.number().int().nonnegative(),
});
export const updateNotificationRequestSchema = z.object({
  read: z.boolean(),
});
export const markAllNotificationsReadSchema = z.object({
  updated: z.number().int().nonnegative(),
});

export const activityItemSchema = z.object({
  id: z.string().uuid(),
  actorName: z.string().nullable(),
  category: z.string(),
  action: z.string(),
  summary: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  occurredAt: z.string().datetime(),
});
export type ActivityItemResource = z.infer<typeof activityItemSchema>;

export const activityListSchema = z.object({
  items: z.array(activityItemSchema),
  nextCursor: z.string().nullable(),
});
export type ActivityList = z.infer<typeof activityListSchema>;
export const activityExportRequestSchema = z.object({
  category: z.string().max(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ActivityExportRequest = z.infer<typeof activityExportRequestSchema>;

const onboardingSectionSchema = z
  .object({ confirmed: z.boolean().optional() })
  .passthrough();
export const onboardingDraftSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  currentStep: z.number().int().min(1).max(8),
  status: z.enum(["draft", "ready", "superseded"]),
  couple: onboardingSectionSchema,
  dateEvents: onboardingSectionSchema,
  location: onboardingSectionSchema,
  guests: onboardingSectionSchema,
  budget: onboardingSectionSchema,
  style: onboardingSectionSchema,
  existingProgress: onboardingSectionSchema,
  planningPreferences: onboardingSectionSchema,
  completedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export type OnboardingDraftResource = z.infer<typeof onboardingDraftSchema>;

export const updateOnboardingDraftSchema = z
  .object({
    currentStep: z.number().int().min(1).max(8).optional(),
    couple: onboardingSectionSchema.optional(),
    dateEvents: onboardingSectionSchema.optional(),
    location: onboardingSectionSchema.optional(),
    guests: onboardingSectionSchema.optional(),
    budget: onboardingSectionSchema.optional(),
    style: onboardingSectionSchema.optional(),
    existingProgress: onboardingSectionSchema.optional(),
    planningPreferences: onboardingSectionSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cel puțin o secțiune trebuie salvată.",
  });
export type UpdateOnboardingDraft = z.infer<typeof updateOnboardingDraftSchema>;

export function isOnboardingComplete(
  value: Pick<
    OnboardingDraftResource,
    | "couple"
    | "dateEvents"
    | "location"
    | "guests"
    | "budget"
    | "style"
    | "existingProgress"
    | "planningPreferences"
  >,
): boolean {
  return [
    value.couple,
    value.dateEvents,
    value.location,
    value.guests,
    value.budget,
    value.style,
    value.existingProgress,
    value.planningPreferences,
  ].every((section) => section.confirmed === true);
}

export const completeOnboardingResponseSchema = z.object({
  completed: z.literal(true),
  planGeneration: z.literal("not_started"),
  message: z.literal(
    "Date salvate. Generarea planului urmează în etapa următoare.",
  ),
  jobId: z.string().uuid(),
});

export const semanticEvents = [
  "user.registered.v1",
  "user.registration_rejected.v1",
  "user.email_verification_requested.v1",
  "user.email_verified.v1",
  "session.created.v1",
  "session.login_failed.v1",
  "session.revoked.v1",
  "password.reset_requested.v1",
  "password.changed.v1",
  "magic_link.requested.v1",
  "magic_link.exchanged.v1",
  "workspace.created.v1",
  "workspace.updated.v1",
  "workspace.archived.v1",
  "membership.invited.v1",
  "membership.invitation_resent.v1",
  "membership.invitation_revoked.v1",
  "membership.invitation_accepted.v1",
  "membership.invitation_declined.v1",
  "membership.role_changed.v1",
  "membership.removed.v1",
  "workspace.ownership_transferred.v1",
  "onboarding.draft_updated.v1",
  "onboarding.ready_for_plan_generation.v1",
  "notification.read.v1",
  "notification.dismissed.v1",
  "activity.export_requested.v1",
  "planning.plan_generation_requested.v1",
  "planning.plan_proposal_ready.v1",
  "planning.plan_proposal_updated.v1",
  "planning.plan_proposal_rejected.v1",
  "planning.plan_applied.v1",
  "planning.export_requested.v1",
  "task.created.v1",
  "task.updated.v1",
  "task.assigned.v1",
  "task.status_changed.v1",
  "task.due_date_changed.v1",
  "task.deleted.v1",
  "task.reminder_scheduled.v1",
  "task.reminder_due.v1",
  "calendar.event_created.v1",
  "calendar.event_updated.v1",
  "calendar.event_deleted.v1",
  "timeline.milestone_created.v1",
  "timeline.milestone_updated.v1",
  "timeline.milestone_deleted.v1",
  "timeline.recalculated.v1",
  "storage.upload_created.v1",
  "storage.upload_completed.v1",
  "storage.object_verified.v1",
  "storage.object_quarantined.v1",
  "storage.object_deleted.v1",
  "document.created.v1",
  "document.version_created.v1",
  "document.available.v1",
  "document.shared.v1",
  "document.grant_revoked.v1",
  "document.downloaded.v1",
  "document.archived.v1",
  "document.delete_requested.v1",
  "signature.envelope_created.v1",
  "signature.envelope_sent.v1",
  "signature.signer_viewed.v1",
  "signature.signer_signed.v1",
  "signature.signer_declined.v1",
  "signature.envelope_completed.v1",
  "signature.envelope_expired.v1",
  "signature.envelope_cancelled.v1",
  "signature.evidence_available.v1",
  "payment.checkout_created.v1",
  "payment.checkout_expired.v1",
  "payment.transaction_authorized.v1",
  "payment.transaction_captured.v1",
  "payment.transaction_failed.v1",
  "payment.transaction_disputed.v1",
  "payment.refund_requested.v1",
  "payment.refund_completed.v1",
  "payment.refund_failed.v1",
  "payment.reconciliation_completed.v1",
  "wedding_day.plan_created.v1",
  "wedding_day.plan_published.v1",
  "wedding_day.plan_live.v1",
  "wedding_day.plan_paused.v1",
  "wedding_day.plan_completed.v1",
  "wedding_day.item_created.v1",
  "wedding_day.item_started.v1",
  "wedding_day.item_delayed.v1",
  "wedding_day.item_blocked.v1",
  "wedding_day.item_completed.v1",
  "wedding_day.item_cancelled.v1",
  "wedding_day.checklist_updated.v1",
  "wedding_day.incident_created.v1",
  "wedding_day.incident_escalated.v1",
  "wedding_day.incident_resolved.v1",
  "wedding_day.decision_recorded.v1",
  "wedding_day.announcement_published.v1",
  "wedding_day.announcement_cancelled.v1",
  "check_in.session_opened.v1",
  "check_in.session_closed.v1",
  "check_in.guest_checked_in.v1",
  "check_in.guest_checked_out.v1",
  "check_in.denied.v1",
  "check_in.offline_sync_completed.v1",
  "guest_moment.uploaded.v1",
  "guest_moment.scan_completed.v1",
  "guest_moment.approved.v1",
  "guest_moment.rejected.v1",
  "guest_moment.published.v1",
  "guest_moment.reported.v1",
  "gallery.published.v1",
  "gallery.unpublished.v1",
  "copilot.run_requested.v1",
  "copilot.conversation_created.v1",
  "copilot.response_ready.v1",
  "copilot.proposal_ready.v1",
  "copilot.proposal_updated.v1",
  "copilot.proposal_approved.v1",
  "copilot.proposal_rejected.v1",
  "copilot.proposal_executed.v1",
  "risk.created.v1",
  "risk.updated.v1",
  "risk.assessment_created.v1",
  "risk.score_changed.v1",
  "risk.mitigation_started.v1",
  "risk.detect_requested.v1",
  "risk.detected.v1",
  "risk.resolved.v1",
  "contingency.plan_created.v1",
  "contingency.plan_updated.v1",
  "contingency.plan_approved.v1",
  "contingency.plan_simulation_requested.v1",
  "contingency.plan_activated.v1",
  "contingency.plan_completed.v1",
  "contingency.plan_cancelled.v1",
  "automation.rule_created.v1",
  "automation.rule_updated.v1",
  "automation.activated.v1",
  "automation.paused.v1",
  "automation.disabled.v1",
  "automation.triggered.v1",
  "automation.approval_requested.v1",
  "automation.execution_requested.v1",
  "automation.execution_completed.v1",
  "digest.weekly_requested.v1",
  "digest.weekly_ready.v1",
  "digest.weekly_delivered.v1",
  "platform.user_suspended.v1",
  "platform.user_reactivated.v1",
  "platform.workspace_suspended.v1",
  "platform.workspace_reactivated.v1",
  "platform.vendor_suspended.v1",
  "platform.vendor_reactivated.v1",
  "support.case_created.v1",
  "support.case_updated.v1",
  "support.case_resolved.v1",
  "privacy.consent_recorded.v1",
  "privacy.consent_withdrawn.v1",
  "privacy.request_submitted.v1",
  "privacy.request_verified.v1",
  "privacy.export_requested.v1",
  "privacy.export_ready.v1",
  "privacy.deletion_requested.v1",
  "privacy.deletion_scheduled.v1",
  "privacy.deletion_completed.v1",
  "retention.scan_requested.v1",
  "retention.item_archived.v1",
  "retention.item_purged.v1",
  "retention.blocked_by_hold.v1",
  "legal_hold.created.v1",
  "legal_hold.released.v1",
  "security.event_detected.v1",
  "security.alert_opened.v1",
  "security.alert_resolved.v1",
  "backup.requested.v1",
  "backup.completed.v1",
  "backup.failed.v1",
  "backup.verified.v1",
  "restore.requested.v1",
  "restore.completed.v1",
  "restore.failed.v1",
  "platform.incident_created.v1",
  "platform.incident_resolved.v1",
  "platform.feature_flag_changed.v1",
  "platform.maintenance_started.v1",
  "platform.maintenance_ended.v1",
  "release.candidate_created.v1",
  "release.approved.v1",
  "release.rejected.v1",
  "release.deployed.v1",
  "release.rolled_back.v1",
] as const;
export const semanticEventSchema = z.enum(semanticEvents);
export type SemanticEvent = z.infer<typeof semanticEventSchema>;

export * from "./planning";
export * from "./secure-commerce";
export * from "./wedding-day";
export * from "./intelligence";
export * from "./platform";
