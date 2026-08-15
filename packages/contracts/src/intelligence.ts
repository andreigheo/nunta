import { z } from "zod";
import {
  copilotProposalActionTypeSchema,
  validateCopilotActionPayload,
} from "./copilot-actions";

export { copilotProposalActionTypeSchema } from "./copilot-actions";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const copilotConversationStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const copilotRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const copilotProposalStatusSchema = z.enum([
  "DRAFT",
  "READY_FOR_REVIEW",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "FAILED",
  "SUPERSEDED",
]);
export const proposalRiskLevelSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const createCopilotConversationSchema = z.object({
  title: z.string().trim().max(180).optional(),
  surface: z.string().trim().max(80).optional().default("general"),
});
export type CreateCopilotConversation = z.input<
  typeof createCopilotConversationSchema
>;

export const updateCopilotConversationSchema = z.object({
  title: boundedText(180).optional(),
  status: copilotConversationStatusSchema.optional(),
});

export const createCopilotMessageSchema = z.object({
  content: boundedText(8_000),
  mode: z.enum(["deterministic", "ai_enriched", "auto"]).default("auto"),
  research: z.boolean().default(true),
  surface: z.string().trim().min(1).max(80).optional(),
  context: z
    .object({
      resourceType: z.string().trim().max(80),
      resourceId: uuid,
    })
    .optional(),
});
export type CreateCopilotMessage = z.input<typeof createCopilotMessageSchema>;

export const createCopilotFeedbackSchema = z.object({
  rating: z.enum(["HELPFUL", "NOT_HELPFUL"]),
  reason: z.string().trim().max(1000).optional(),
});

export const copilotMemoryScopeSchema = z.enum(["WORKSPACE", "USER"]);
export const copilotMemoryKindSchema = z.enum([
  "FACT",
  "PREFERENCE",
  "DECISION",
  "CONSTRAINT",
  "CONVERSATION_SUMMARY",
  "DOCUMENT_NOTE",
  "WEB_RESEARCH",
]);
export const copilotMemorySourceTypeSchema = z.enum([
  "USER_CONFIRMED",
  "CANONICAL_RESOURCE",
  "CONVERSATION",
  "DOCUMENT",
  "WEB",
  "SYSTEM",
]);
export const copilotMemorySensitivitySchema = z.enum(["NORMAL", "SENSITIVE"]);
export const copilotMemoryStatusSchema = z.enum([
  "ACTIVE",
  "SUPERSEDED",
  "DELETED",
]);

export const updateCopilotSettingsSchema = z.object({
  memoryEnabled: z.boolean().optional(),
  webResearchEnabled: z.boolean().optional(),
  proactiveSuggestions: z.boolean().optional(),
  memoryRetentionDays: z.number().int().min(30).max(730).optional(),
  version,
});

export const createCopilotMemorySchema = z
  .object({
    scope: copilotMemoryScopeSchema.default("WORKSPACE"),
    subjectType: z.string().trim().min(1).max(80).optional(),
    subjectId: z.string().trim().min(1).max(160).optional(),
    kind: copilotMemoryKindSchema,
    title: boundedText(180),
    content: boundedText(4_000),
    sourceType: z
      .enum(["USER_CONFIRMED", "CANONICAL_RESOURCE"])
      .default("USER_CONFIRMED"),
    sourceId: z.string().trim().min(1).max(200).optional(),
    confidence: z.number().min(0).max(1).default(1),
    confirmedByUser: z.boolean().default(true),
    sensitivity: copilotMemorySensitivitySchema.default("NORMAL"),
    expiresAt: z.string().datetime().optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((input, context) => {
    if (input.sourceType === "USER_CONFIRMED" && !input.confirmedByUser) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmedByUser"],
        message: "Memoria introdusă de utilizator trebuie confirmată explicit.",
      });
    }
  });
export type CreateCopilotMemory = z.infer<typeof createCopilotMemorySchema>;

export const updateCopilotMemorySchema = z.object({
  title: boundedText(180).optional(),
  content: boundedText(4_000).optional(),
  subjectType: z.string().trim().min(1).max(80).nullable().optional(),
  subjectId: z.string().trim().min(1).max(160).nullable().optional(),
  kind: copilotMemoryKindSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirmedByUser: z.boolean().optional(),
  sensitivity: copilotMemorySensitivitySchema.optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  version,
});

export const copilotMemoryQuerySchema = z.object({
  kind: copilotMemoryKindSchema.optional(),
  scope: copilotMemoryScopeSchema.optional(),
  status: copilotMemoryStatusSchema.default("ACTIVE"),
  cursor: uuid.optional(),
});

export const searchCopilotMemorySchema = z.object({
  query: boundedText(1_000),
  kinds: z.array(copilotMemoryKindSchema).max(7).default([]),
  limit: z.number().int().min(1).max(20).default(8),
});

export const reviewCopilotProposalSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(2000).optional(),
  version,
});

export const executeCopilotProposalSchema = z.object({
  version,
  confirmHighRisk: z.boolean().optional().default(false),
});

export const updateCopilotProposalSchema = z.object({
  title: boundedText(180).optional(),
  summary: boundedText(2000).optional(),
  version,
  actions: z
    .array(
      z
        .object({
          actionType: copilotProposalActionTypeSchema,
          payload: z.record(z.unknown()),
          riskLevel: proposalRiskLevelSchema,
          position: z.number().int().min(0),
        })
        .superRefine((action, context) => {
          const parsed = validateCopilotActionPayload(
            action.actionType,
            action.payload,
          );
          if (!parsed.success)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["payload"],
              message: parsed.error.issues[0]?.message ?? "Payload invalid",
            });
        }),
    )
    .min(1)
    .max(1)
    .optional(),
});

export const riskStatusSchema = z.enum([
  "OPEN",
  "MONITORING",
  "MITIGATING",
  "RESOLVED",
  "ACCEPTED",
  "ARCHIVED",
]);
export const riskCategorySchema = z.enum([
  "SCHEDULE",
  "VENDOR",
  "BUDGET",
  "GUEST",
  "LOGISTICS",
  "WEATHER",
  "SAFETY",
  "OTHER",
]);
export const riskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const createRiskSchema = z.object({
  title: boundedText(180),
  description: z.string().trim().max(4000).optional(),
  category: riskCategorySchema,
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  ownerMembershipId: uuid.optional(),
  dueAt: z.string().datetime().optional(),
  source: z.enum(["MANUAL", "DETECTED", "COPILOT"]).default("MANUAL"),
});
export type CreateRisk = z.input<typeof createRiskSchema>;

export const updateRiskSchema = createRiskSchema.partial().extend({
  status: riskStatusSchema.optional(),
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type UpdateRisk = z.input<typeof updateRiskSchema>;

export const createRiskMitigationSchema = z.object({
  title: boundedText(180),
  description: z.string().trim().max(2000).optional(),
  ownerMembershipId: uuid.optional(),
  dueAt: z.string().datetime().optional(),
});

export const riskTransitionSchema = z.object({
  transition: z.enum([
    "MONITOR",
    "START_MITIGATION",
    "RESOLVE",
    "ACCEPT",
    "ARCHIVE",
    "REOPEN",
  ]),
  reason: boundedText(2000),
  version,
});

export const createRiskAssessmentSchema = z.object({
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  reason: z.string().trim().max(2000).optional(),
  version,
});

export const contingencyPlanStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
]);
export const contingencyTriggerTypeSchema = z.enum([
  "MANUAL",
  "DATE_REACHED",
  "RISK_LEVEL_REACHED",
  "TASK_OVERDUE",
]);

export const createContingencyPlanSchema = z.object({
  riskId: uuid.optional(),
  title: boundedText(180),
  summary: z.string().trim().max(4000).optional(),
  triggers: z
    .array(
      z.object({
        type: contingencyTriggerTypeSchema,
        configuration: z.record(z.unknown()).default({}),
      }),
    )
    .max(20)
    .default([]),
  actions: z
    .array(
      z.object({
        title: boundedText(180),
        description: z.string().trim().max(2000).optional(),
        position: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(100),
});
export type CreateContingencyPlan = z.input<typeof createContingencyPlanSchema>;

export const updateContingencyPlanSchema = createContingencyPlanSchema
  .partial()
  .extend({ status: contingencyPlanStatusSchema.optional() });
export type UpdateContingencyPlan = z.input<typeof updateContingencyPlanSchema>;

export const contingencySimulationSchema = z.object({
  triggerType: contingencyTriggerTypeSchema.default("MANUAL"),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
});

export const activateContingencyPlanSchema = z.object({
  version,
  reason: boundedText(1000),
});

export const contingencyTransitionSchema = z.object({
  version,
  reason: boundedText(1000),
});

export const automationTriggerTypeSchema = z.enum([
  "MANUAL",
  "SCHEDULED",
  "TASK_OVERDUE",
  "RISK_LEVEL_CHANGED",
  "MILESTONE_APPROACHING",
]);
export const automationActionTypeSchema = z.enum([
  "CREATE_TASK",
  "CREATE_NOTIFICATION",
  "CREATE_RISK",
  "UPDATE_RISK_STATUS",
  "CREATE_CALENDAR_EVENT",
]);
export const automationRuleStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
]);

const automationConditionSchema = z.object({
  field: z.enum([
    "priority",
    "status",
    "category",
    "riskLevel",
    "daysUntilDue",
  ]),
  operator: z.enum(["eq", "neq", "gte", "lte", "in"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const automationActionSchema = z.object({
  type: automationActionTypeSchema,
  configuration: z.record(z.unknown()).default({}),
  position: z.number().int().min(0),
});

export const createAutomationRuleSchema = z.object({
  name: boundedText(180),
  description: z.string().trim().max(2000).optional(),
  triggerType: automationTriggerTypeSchema,
  triggerConfiguration: z.record(z.unknown()).default({}),
  conditions: z.array(automationConditionSchema).max(20).default([]),
  actions: z.array(automationActionSchema).min(1).max(20),
  requiresApproval: z.boolean().default(true),
});
export type CreateAutomationRule = z.input<typeof createAutomationRuleSchema>;

export const updateAutomationRuleSchema = createAutomationRuleSchema
  .partial()
  .extend({ status: automationRuleStatusSchema.optional() });

export const executeAutomationRuleSchema = z.object({
  mode: z.enum(["DRY_RUN", "EXECUTE"]).default("DRY_RUN"),
  version,
});

export const automationTransitionSchema = z.object({ version });

export const automationExecutionDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().trim().max(2000).optional(),
});

export const createWeeklyDigestSchema = z.object({
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

export const riskQuerySchema = z.object({
  status: riskStatusSchema.optional(),
  category: riskCategorySchema.optional(),
  level: riskLevelSchema.optional(),
  search: z.string().trim().max(180).optional(),
  cursor: uuid.optional(),
});

export const copilotConversationQuerySchema = z.object({
  cursor: uuid.optional(),
  surface: z.string().trim().min(1).max(80).optional(),
});
export const automationRuleQuerySchema = z.object({
  status: automationRuleStatusSchema.optional(),
  cursor: uuid.optional(),
});

export function riskScore(probability: number, impact: number) {
  const score = probability * impact;
  const level =
    score >= 20
      ? "CRITICAL"
      : score >= 12
        ? "HIGH"
        : score >= 6
          ? "MEDIUM"
          : "LOW";
  return { score, level } as const;
}
