import { z } from "zod";

export const planningGenerationModeSchema = z.enum([
  "deterministic",
  "ai_enriched",
  "auto",
]);
export type PlanningGenerationMode = z.infer<
  typeof planningGenerationModeSchema
>;

export const createPlanGenerationRequestSchema = z.object({
  mode: planningGenerationModeSchema.optional().default("auto"),
});
export type CreatePlanGenerationRequest = z.input<
  typeof createPlanGenerationRequestSchema
>;

export const planningJobSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  status: z.enum([
    "queued",
    "running",
    "retrying",
    "completed",
    "failed",
    "cancelled",
    "dead_letter",
  ]),
  progress: z.number().int().min(0).max(100),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  result: z.record(z.unknown()).nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createPlanGenerationResponseSchema = z.object({
  job: planningJobSchema,
  generationRunId: z.string().uuid(),
  existingProposalId: z.string().uuid().optional(),
});
export type CreatePlanGenerationResponse = z.infer<
  typeof createPlanGenerationResponseSchema
>;

export const proposalItemTypeSchema = z.enum(["phase", "milestone", "task"]);
export const proposalStatusSchema = z.enum([
  "generating",
  "ready_for_review",
  "rejected",
  "applied",
  "superseded",
  "failed",
]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const taskStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "archived",
]);

export const planProposalItemCoreSchema = z.object({
  id: z.string().uuid(),
  type: proposalItemTypeSchema,
  parentItemId: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  priority: taskPrioritySchema.nullable(),
  relativeStartOffsetDays: z.number().int().nullable(),
  relativeDueOffsetDays: z.number().int().nullable(),
  absoluteStartAt: z.string().datetime().nullable(),
  absoluteDueAt: z.string().datetime().nullable(),
  estimatedEffortMinutes: z.number().int().positive().nullable(),
  suggestedOwnerType: z.string().nullable(),
  required: z.boolean(),
  included: z.boolean(),
  position: z.number().int(),
  metadata: z.record(z.unknown()).nullable(),
  version: z.number().int().positive(),
});

export const planProposalItemSchema: z.ZodType<PlanProposalItemResource> =
  z.lazy(() =>
    planProposalItemCoreSchema.extend({
      items: z.array(planProposalItemSchema),
    }),
  );
export type PlanProposalItemResource = {
  id: string;
  type: "phase" | "milestone" | "task";
  parentItemId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  priority: "low" | "medium" | "high" | "urgent" | null;
  relativeStartOffsetDays: number | null;
  relativeDueOffsetDays: number | null;
  absoluteStartAt: string | null;
  absoluteDueAt: string | null;
  estimatedEffortMinutes: number | null;
  suggestedOwnerType: string | null;
  required: boolean;
  included: boolean;
  position: number;
  metadata: Record<string, unknown> | null;
  version: number;
  items: PlanProposalItemResource[];
};

export const planProposalSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  onboardingDraftId: z.string().uuid(),
  onboardingVersion: z.number().int().positive(),
  generationRunId: z.string().uuid(),
  status: proposalStatusSchema,
  title: z.string(),
  summary: z.string(),
  assumptions: z.array(z.string()),
  warnings: z.array(z.string()),
  coverage: z.object({
    required: z.array(z.string()),
    covered: z.array(z.string()),
    missing: z.array(z.string()),
  }),
  generatorType: z.enum(["deterministic", "ai_enriched", "fallback"]),
  provider: z.string(),
  model: z.string().nullable(),
  rulesVersion: z.string(),
  fallbackUsed: z.boolean(),
  items: z.array(planProposalItemSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
  appliedAt: z.string().datetime().nullable(),
  supersededAt: z.string().datetime().nullable(),
});
export type PlanProposalResource = z.infer<typeof planProposalSchema>;

export const planProposalListSchema = z.object({
  items: z.array(planProposalSchema.omit({ items: true })),
  nextCursor: z.string().nullable(),
});

const proposalItemPatchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  included: z.boolean().optional(),
  priority: taskPrioritySchema.nullable().optional(),
  relativeDueOffsetDays: z
    .number()
    .int()
    .min(-3650)
    .max(3650)
    .nullable()
    .optional(),
  absoluteDueAt: z.string().datetime().nullable().optional(),
  suggestedOwnerType: z.string().max(80).nullable().optional(),
  position: z.number().int().min(0).optional(),
  confirmRequiredExclusion: z.boolean().optional(),
  exclusionReason: z.string().trim().min(3).max(500).optional(),
});

export const addProposalItemSchema = z.object({
  parentItemId: z.string().uuid().nullable().optional(),
  type: proposalItemTypeSchema,
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(80).optional(),
  priority: taskPrioritySchema.optional(),
  relativeDueOffsetDays: z.number().int().min(-3650).max(3650).optional(),
  absoluteDueAt: z.string().datetime().optional(),
  suggestedOwnerType: z.string().max(80).optional(),
  required: z.literal(false).default(false),
  included: z.boolean().default(true),
  position: z.number().int().min(0),
});

export const updatePlanProposalSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    summary: z.string().trim().min(1).max(4000).optional(),
    itemUpdates: z.array(proposalItemPatchSchema).max(200).optional(),
    addItems: z.array(addProposalItemSchema).max(50).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "No proposal changes supplied",
  );
export type UpdatePlanProposal = z.infer<typeof updatePlanProposalSchema>;

export const rejectPlanProposalSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const applyPlanProposalRequestSchema = z.object({
  confirmWarnings: z.boolean().default(false),
});
export const applyPlanProposalResponseSchema = z.object({
  proposalId: z.string().uuid(),
  phaseCount: z.number().int().nonnegative(),
  milestoneCount: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  appliedAt: z.string().datetime(),
});
export type ApplyPlanProposalResponse = z.infer<
  typeof applyPlanProposalResponseSchema
>;

export const planningPhaseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  position: z.number().int(),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  relativeStartOffsetDays: z.number().int().nullable(),
  relativeEndOffsetDays: z.number().int().nullable(),
  status: z.enum(["not_started", "in_progress", "completed"]),
  version: z.number().int().positive(),
});

export const timelineMilestoneSchema = z.object({
  id: z.string().uuid(),
  phaseId: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  targetAt: z.string().datetime().nullable(),
  relativeOffsetDays: z.number().int().nullable(),
  status: z.enum(["upcoming", "in_progress", "completed", "missed"]),
  position: z.number().int(),
  version: z.number().int().positive(),
});
export type TimelineMilestone = z.infer<typeof timelineMilestoneSchema>;

export const taskSummarySchema = z.object({
  id: z.string().uuid(),
  parentTaskId: z.string().uuid().nullable(),
  phaseId: z.string().uuid().nullable(),
  milestoneId: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  startAt: z.string().datetime().nullable(),
  dueAt: z.string().datetime().nullable(),
  relativeStartOffsetDays: z.number().int().nullable(),
  relativeDueOffsetDays: z.number().int().nullable(),
  assigneeMembershipId: z.string().uuid().nullable(),
  assigneeName: z.string().nullable(),
  blockedReason: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  estimatedEffortMinutes: z.number().int().positive().nullable(),
  isPrivate: z.boolean(),
  position: z.number().int(),
  subtaskTotal: z.number().int().nonnegative(),
  subtaskCompleted: z.number().int().nonnegative(),
  dependencyCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TaskSummary = z.infer<typeof taskSummarySchema>;

export const taskResourceSchema = taskSummarySchema.extend({
  subtasks: z.array(taskSummarySchema).default([]),
  dependencies: z.array(z.string().uuid()).default([]),
});
export type TaskResource = z.infer<typeof taskResourceSchema>;

export const taskListSchema = z.object({
  items: z.array(taskSummarySchema),
  nextCursor: z.string().nullable(),
});
export type TaskList = z.infer<typeof taskListSchema>;

export const reminderInputSchema = z.object({
  scheduledAt: z.string().datetime(),
  channel: z.enum(["in_app", "email"]),
  recipientUserId: z.string().uuid().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().min(1).max(80).default("planning"),
  priority: taskPrioritySchema.default("medium"),
  phaseId: z.string().uuid().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assigneeMembershipId: z.string().uuid().nullable().optional(),
  estimatedEffortMinutes: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .nullable()
    .optional(),
  isPrivate: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  reminder: reminderInputSchema.optional(),
});
export type CreateTask = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    category: z.string().trim().min(1).max(80).optional(),
    priority: taskPrioritySchema.optional(),
    phaseId: z.string().uuid().nullable().optional(),
    milestoneId: z.string().uuid().nullable().optional(),
    startAt: z.string().datetime().nullable().optional(),
    dueAt: z.string().datetime().nullable().optional(),
    assigneeMembershipId: z.string().uuid().nullable().optional(),
    estimatedEffortMinutes: z
      .number()
      .int()
      .min(1)
      .max(100_000)
      .nullable()
      .optional(),
    isPrivate: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
    reminder: reminderInputSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No task changes supplied");
export type UpdateTask = z.infer<typeof updateTaskSchema>;

export const taskTransitionSchema = z.object({
  transition: z.enum([
    "START",
    "WAIT",
    "BLOCK",
    "UNBLOCK",
    "COMPLETE",
    "REOPEN",
    "ARCHIVE",
    "POSTPONE",
  ]),
  reason: z.string().trim().max(1000).optional(),
  postponeUntil: z.string().datetime().optional(),
  version: z.number().int().positive(),
  confirmIncompleteSubtasks: z.boolean().optional(),
});
export type TaskTransitionRequest = z.infer<typeof taskTransitionSchema>;

export const replaceTaskDependenciesSchema = z.object({
  dependsOnTaskIds: z.array(z.string().uuid()).max(100),
  version: z.number().int().positive(),
});
export const dependencyImpactSchema = z.object({
  task: taskResourceSchema,
  added: z.array(z.string().uuid()),
  removed: z.array(z.string().uuid()),
  blockedByIncomplete: z.array(z.string().uuid()),
});

export const copyTaskSchema = z.object({
  includeSubtasks: z.boolean().default(false),
  includeDependencies: z.boolean().default(false),
  dueDateShiftDays: z.number().int().min(-3650).max(3650).optional(),
});

export const taskCommentSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  authorUserId: z.string().uuid(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export const taskCommentListSchema = z.object({
  items: z.array(taskCommentSchema),
});
export const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
export const updateTaskCommentSchema = createTaskCommentSchema.extend({
  version: z.number().int().positive(),
});

export const calendarItemSchema = z.object({
  id: z.string(),
  sourceType: z.enum([
    "native_event",
    "task_due",
    "task_start",
    "milestone",
    "wedding_event",
    "payment_schedule",
    "booking",
    "contract",
    "signature_envelope",
    "payment_checkout",
  ]),
  sourceId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  allDay: z.boolean(),
  timezone: z.string(),
  location: z.string().nullable(),
  editable: z.boolean(),
  href: z.string(),
  version: z.number().int().positive().nullable(),
});
export type CalendarItem = z.infer<typeof calendarItemSchema>;
export const calendarListSchema = z.object({
  items: z.array(calendarItemSchema),
});

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  eventType: z.string().trim().min(1).max(80).default("meeting"),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().default(false),
  timezone: z.string().min(1).max(80),
  location: z.string().trim().max(500).optional(),
  meetingUrl: z.string().url().max(2048).nullable().optional(),
  ownerMembershipId: z.string().uuid().nullable().optional(),
  reminderMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
});
export type CreateCalendarEvent = z.infer<typeof createCalendarEventSchema>;
export const updateCalendarEventSchema = createCalendarEventSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "No calendar changes supplied",
  );

export const calendarEventResourceSchema = calendarItemSchema.extend({
  sourceType: z.literal("native_event"),
  editable: z.literal(true),
  meetingUrl: z.string().nullable(),
  ownerMembershipId: z.string().uuid().nullable(),
  reminderMinutes: z.number().int().nullable(),
});

export const createMilestoneSchema = z.object({
  phaseId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(4000).optional(),
  targetAt: z.string().datetime().nullable().optional(),
  relativeOffsetDays: z
    .number()
    .int()
    .min(-3650)
    .max(3650)
    .nullable()
    .optional(),
  position: z.number().int().min(0).default(0),
});
export const updateMilestoneSchema = createMilestoneSchema
  .partial()
  .extend({
    status: z.enum(["upcoming", "in_progress", "completed"]).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "No milestone changes supplied",
  );

export const timelineSchema = z.object({
  phases: z.array(
    planningPhaseSchema.extend({
      milestones: z.array(timelineMilestoneSchema),
      taskTotal: z.number().int().nonnegative(),
      taskCompleted: z.number().int().nonnegative(),
      progressPercent: z.number().min(0).max(100),
      delayedItems: z.number().int().nonnegative(),
    }),
  ),
  unphasedMilestones: z.array(timelineMilestoneSchema),
  criticalTaskIds: z.array(z.string().uuid()),
});

export const timelineRecalculationRequestSchema = z.object({
  applyRelativeDates: z.boolean().default(false),
});
export const timelineRecalculationSchema = z.object({
  preview: z.boolean(),
  proposedChanges: z.array(
    z.object({
      resourceType: z.enum(["task", "milestone", "phase"]),
      resourceId: z.string().uuid(),
      currentAt: z.string().datetime().nullable(),
      proposedAt: z.string().datetime(),
      applied: z.boolean(),
    }),
  ),
  overdueTaskIds: z.array(z.string().uuid()),
  blockedTaskIds: z.array(z.string().uuid()),
});

export const planningDashboardSchema = z.object({
  wedding: z.object({
    title: z.string(),
    date: z.string().nullable(),
    location: z.string().nullable(),
    countdownDays: z.number().int().nullable(),
  }),
  planning: z.object({
    totalTasks: z.number().int().nonnegative(),
    completedTasks: z.number().int().nonnegative(),
    progressPercent: z.number().min(0).max(100),
    overdueTasks: z.number().int().nonnegative(),
    blockedTasks: z.number().int().nonnegative(),
    dueThisWeek: z.number().int().nonnegative(),
  }),
  nextBestAction: z
    .object({
      type: z.string(),
      title: z.string(),
      reason: z.string(),
      impact: z.string(),
      href: z.string().startsWith("/").optional(),
      taskId: z.string().uuid().optional(),
      dueAt: z.string().datetime().optional(),
      priority: taskPrioritySchema,
    })
    .nullable(),
  urgentTasks: z.array(taskSummarySchema),
  upcomingDates: z.array(calendarItemSchema),
  phases: z.array(planningPhaseSchema),
  recentActivity: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      summary: z.string(),
      occurredAt: z.string().datetime(),
    }),
  ),
  guestCrm: z.object({
    estimatedGuests: z.number().int().nonnegative().nullable(),
    activeGuests: z.number().int().nonnegative(),
    invited: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    noResponse: z.number().int().nonnegative(),
    rsvpDeadline: z.string().datetime().nullable(),
    menuIncomplete: z.number().int().nonnegative(),
    allergyIssues: z.number().int().nonnegative(),
    transportRequests: z.number().int().nonnegative(),
    accommodationRequests: z.number().int().nonnegative(),
  }),
  operations: z.object({
    seating: z.object({
      plans: z.number().int().nonnegative(),
      eligibleGuests: z.number().int().nonnegative(),
      assignedGuests: z.number().int().nonnegative(),
      unassignedGuests: z.number().int().nonnegative(),
      openIssues: z.number().int().nonnegative(),
    }),
    transport: z.object({
      requests: z.number().int().nonnegative(),
      assignedGuests: z.number().int().nonnegative(),
      routes: z.number().int().nonnegative(),
      seatsAvailable: z.number().int().nonnegative(),
      openIssues: z.number().int().nonnegative(),
    }),
    accommodation: z.object({
      requests: z.number().int().nonnegative(),
      assignedGuests: z.number().int().nonnegative(),
      rooms: z.number().int().nonnegative(),
      bedsAvailable: z.number().int().nonnegative(),
      openIssues: z.number().int().nonnegative(),
    }),
  }),
  commercial: z.object({
    currency: z.string().length(3),
    budget: z.object({
      configured: z.boolean(),
      targetTotalMinor: z.number().int().nonnegative(),
      estimatedMinor: z.number().int().nonnegative(),
      committedMinor: z.number().int().nonnegative(),
      paidMinor: z.number().int().nonnegative(),
    }),
    payments: z.object({
      scheduled: z.number().int().nonnegative(),
      overdue: z.number().int().nonnegative(),
      recordedMinor: z.number().int().nonnegative(),
    }),
    procurement: z.object({
      rfqs: z.record(z.string(), z.number().int().nonnegative()),
      offers: z.record(z.string(), z.number().int().nonnegative()),
      bookings: z.record(z.string(), z.number().int().nonnegative()),
      contracts: z.record(z.string(), z.number().int().nonnegative()),
    }),
  }),
  documents: z.object({
    processing: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
    contractsAwaitingSignature: z.number().int().nonnegative(),
    signatureEnvelopesInProgress: z.number().int().nonnegative(),
    signatureEnvelopesFailed: z.number().int().nonnegative(),
  }),
  onlinePayments: z.object({
    openCheckouts: z.number().int().nonnegative(),
    capturedThisMonthMinor: z.number().int().nonnegative(),
    failedPayments: z.number().int().nonnegative(),
    refundsProcessingMinor: z.number().int().nonnegative(),
    disputedPayments: z.number().int().nonnegative(),
    currency: z.string().length(3),
  }),
  unavailableModules: z.object({
    budget: z.boolean(),
    vendors: z.boolean(),
    payments: z.boolean(),
    risks: z.boolean(),
  }),
});
export type PlanningDashboard = z.infer<typeof planningDashboardSchema>;

export const searchResultSchema = z.object({
  id: z.string(),
  type: z.enum([
    "task",
    "milestone",
    "phase",
    "calendar_event",
    "member",
    "guest",
    "household",
    "campaign",
    "invitation",
    "menu",
    "allergy_issue",
    "seating_plan",
    "seating_table",
    "transport_route",
    "transport_stop",
    "accommodation_property",
    "accommodation_room",
    "shortcut",
  ]),
  title: z.string(),
  subtitle: z.string().nullable(),
  href: z.string(),
});
export const searchResponseSchema = z.object({
  items: z.array(searchResultSchema),
});

export const planningExportRequestSchema = z.object({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  phaseId: z.string().uuid().optional(),
});
