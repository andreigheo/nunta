import { z } from "zod";

export const PUBLIC_PRODUCT_PROOF_SCHEMA_VERSION = "1.0" as const;
export const PUBLIC_PRODUCT_PROOF_MINIMUM_COHORT = 20 as const;
export const PUBLIC_PRODUCT_PROOF_ROUNDING_INCREMENT = 5 as const;
export const PUBLIC_PRODUCT_PROOF_COHORT_BUCKET = 10 as const;

export const publicProofMetricSchema = z
  .object({
    state: z.enum(["published", "suppressed"]),
    value: z.number().int().min(0).max(100).multipleOf(5).nullable(),
    unit: z.literal("percent"),
    contributingWorkspaceBucket: z
      .number()
      .int()
      .min(PUBLIC_PRODUCT_PROOF_MINIMUM_COHORT)
      .multipleOf(PUBLIC_PRODUCT_PROOF_COHORT_BUCKET)
      .nullable(),
    suppressionReason: z
      .enum(["minimum_cohort", "insufficient_denominator"])
      .nullable(),
  })
  .strict()
  .superRefine((metric, context) => {
    if (
      metric.state === "published" &&
      (metric.value === null ||
        metric.contributingWorkspaceBucket === null ||
        metric.suppressionReason !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published metrics require a value and cohort bucket.",
      });
    }
    if (
      metric.state === "suppressed" &&
      (metric.value !== null || metric.contributingWorkspaceBucket !== null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Suppressed metrics must not expose a value or cohort size.",
      });
    }
  });

export type PublicProofMetric = z.infer<typeof publicProofMetricSchema>;

export const publicProductCapabilityStatusSchema = z.enum([
  "implemented",
  "partial",
  "unavailable",
]);

export const publicProductProofV1Schema = z
  .object({
    schemaVersion: z.literal(PUBLIC_PRODUCT_PROOF_SCHEMA_VERSION),
    generatedAt: z.string().datetime({ offset: true }),
    window: z
      .object({
        startedAt: z.string().datetime({ offset: true }),
        endedAt: z.string().datetime({ offset: true }),
        days: z.literal(365),
      })
      .strict(),
    freshness: z.enum(["fresh", "stale"]),
    privacy: z
      .object({
        minimumCohort: z.literal(PUBLIC_PRODUCT_PROOF_MINIMUM_COHORT),
        percentageRoundingIncrement: z.literal(
          PUBLIC_PRODUCT_PROOF_ROUNDING_INCREMENT,
        ),
        cohortBucketSize: z.literal(PUBLIC_PRODUCT_PROOF_COHORT_BUCKET),
      })
      .strict(),
    capabilities: z
      .object({
        planning: publicProductCapabilityStatusSchema,
        rsvpAndLogistics: publicProductCapabilityStatusSchema,
        procurementAndBudget: publicProductCapabilityStatusSchema,
        weddingDay: publicProductCapabilityStatusSchema,
      })
      .strict(),
    flow: z
      .object({
        planning: z
          .object({
            medianPlanProgressPercent: publicProofMetricSchema,
            nextActionCoveragePercent: publicProofMetricSchema,
          })
          .strict(),
        rsvpAndLogistics: z
          .object({
            rsvpResponseRatePercent: publicProofMetricSchema,
            logisticsAssignmentRatePercent: publicProofMetricSchema,
          })
          .strict(),
        procurementAndBudget: z
          .object({
            rfqToBookingWorkspaceRatePercent: publicProofMetricSchema,
            medianBudgetCommittedPercent: publicProofMetricSchema,
          })
          .strict(),
        weddingDay: z
          .object({
            runOfShowCompletionRatePercent: publicProofMetricSchema,
            checkInRatePercent: publicProofMetricSchema,
            incidentResolutionRatePercent: publicProofMetricSchema,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type PublicProductProofV1 = z.infer<typeof publicProductProofV1Schema>;

export const PUBLIC_AGGREGATE_POLICY_VERSION = "public-aggregate-v1" as const;

export const updatePublicAggregateConsentSchema = z
  .object({
    enabled: z.boolean(),
    policyVersion: z.literal(PUBLIC_AGGREGATE_POLICY_VERSION),
  })
  .strict();

export type UpdatePublicAggregateConsent = z.infer<
  typeof updatePublicAggregateConsentSchema
>;

export const publicAggregateConsentSchema = z
  .object({
    workspaceId: z.string().uuid(),
    enabled: z.boolean(),
    policyVersion: z.literal(PUBLIC_AGGREGATE_POLICY_VERSION),
    consentedAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    version: z.number().int().nonnegative(),
  })
  .strict();

export type PublicAggregateConsent = z.infer<
  typeof publicAggregateConsentSchema
>;
