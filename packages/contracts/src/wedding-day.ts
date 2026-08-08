import { z } from "zod";

const uuid = z.string().uuid();
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const weddingDayPlanStatusSchema = z.enum([
  "DRAFT",
  "READY",
  "PUBLISHED",
  "LIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
]);
export const runOfShowStatusSchema = z.enum([
  "NOT_STARTED",
  "READY",
  "IN_PROGRESS",
  "DELAYED",
  "BLOCKED",
  "COMPLETED",
  "SKIPPED",
  "CANCELLED",
]);
export const weddingDayPrioritySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const createWeddingDayPlanSchema = z.object({
  weddingEventId: uuid,
  name: z.string().trim().min(2).max(180),
  title: z.string().trim().min(2).max(200).optional(),
  summary: optionalText(4000),
  timezone: z.string().trim().min(3).max(80),
  operationalDate: z.string().date(),
  settings: z.record(z.unknown()).default({}),
});
export const updateWeddingDayPlanSchema = z
  .object({
    name: z.string().trim().min(2).max(180).optional(),
    title: z.string().trim().min(2).max(200).optional(),
    summary: optionalText(4000),
    timezone: z.string().trim().min(3).max(80).optional(),
    operationalDate: z.string().date().optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required",
  );

export const createRunOfShowItemSchema = z.object({
  type: z
    .enum([
      "MOMENT",
      "CEREMONY",
      "ARRIVAL",
      "SETUP",
      "DELIVERY",
      "SPEECH",
      "MEAL_SERVICE",
      "ENTERTAINMENT",
      "PHOTO_SESSION",
      "TRANSPORT",
      "CHECK_IN",
      "BREAK",
      "CLEANUP",
      "CUSTOM",
    ])
    .default("CUSTOM"),
  title: z.string().trim().min(2).max(240),
  description: optionalText(4000),
  plannedStartAt: z.string().datetime(),
  plannedEndAt: z.string().datetime().nullable().optional(),
  locationName: optionalText(240),
  locationAddress: optionalText(500),
  priority: weddingDayPrioritySchema.default("MEDIUM"),
  position: z.number().int().min(0).default(0),
  isGuestVisible: z.boolean().default(false),
  isCritical: z.boolean().default(false),
  requiresConfirmation: z.boolean().default(false),
  parentItemId: uuid.nullable().optional(),
  sourceType: z.string().trim().min(1).max(80).default("manual"),
  sourceId: uuid.nullable().optional(),
});
export const updateRunOfShowItemSchema = createRunOfShowItemSchema
  .partial()
  .omit({ sourceType: true, sourceId: true });
export const runOfShowTransitionSchema = z.object({
  transition: z.enum([
    "MARK_READY",
    "START",
    "MARK_DELAYED",
    "BLOCK",
    "UNBLOCK",
    "COMPLETE",
    "SKIP",
    "CANCEL",
    "REOPEN",
  ]),
  reason: z.string().trim().min(2).max(1000).optional(),
  delayEstimateMinutes: z.number().int().min(0).max(1440).optional(),
});
export const runOfShowOrderSchema = z.object({
  itemIds: z.array(uuid).min(1).max(500),
});
export const runOfShowDependenciesSchema = z.object({
  dependencies: z
    .array(
      z.object({
        itemId: uuid,
        dependencyType: z
          .enum(["FINISH_TO_START", "START_TO_START"])
          .default("FINISH_TO_START"),
      }),
    )
    .max(100),
});

export const createWeddingDayChecklistSchema = z.object({
  type: z
    .enum([
      "VENUE_SETUP",
      "CEREMONY",
      "RECEPTION",
      "VENDOR_ARRIVAL",
      "GUEST_CHECK_IN",
      "TRANSPORT",
      "ACCOMMODATION",
      "EMERGENCY",
      "CLOSING",
      "CUSTOM",
    ])
    .default("CUSTOM"),
  title: z.string().trim().min(2).max(200),
  description: optionalText(2000),
  position: z.number().int().min(0).default(0),
});
export const createWeddingDayChecklistItemSchema = z.object({
  title: z.string().trim().min(2).max(240),
  description: optionalText(2000),
  priority: weddingDayPrioritySchema.default("MEDIUM"),
  assignedMembershipId: uuid.nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  sourceTaskId: uuid.nullable().optional(),
  position: z.number().int().min(0).default(0),
});
export const updateWeddingDayChecklistItemSchema =
  createWeddingDayChecklistItemSchema.partial();
export const weddingDayChecklistTransitionSchema = z.object({
  transition: z.enum([
    "START",
    "BLOCK",
    "UNBLOCK",
    "COMPLETE",
    "SKIP",
    "REOPEN",
  ]),
  reason: z.string().trim().min(2).max(1000).optional(),
});

export const createWeddingDayIncidentSchema = z.object({
  type: z.enum([
    "SCHEDULE",
    "VENDOR",
    "VENUE",
    "GUEST",
    "MEDICAL",
    "SECURITY",
    "TRANSPORT",
    "ACCOMMODATION",
    "TECHNICAL",
    "WEATHER",
    "FOOD",
    "PAYMENT",
    "OTHER",
  ]),
  severity: weddingDayPrioritySchema,
  title: z.string().trim().min(2).max(240),
  descriptionPrivate: z.string().trim().min(2).max(8000),
  assignedToMembershipId: uuid.nullable().optional(),
  relatedRunOfShowItemId: uuid.nullable().optional(),
  relatedVendorBookingId: uuid.nullable().optional(),
});
export const weddingDayIncidentTransitionSchema = z.object({
  transition: z.enum([
    "ACKNOWLEDGE",
    "INVESTIGATE",
    "MITIGATE",
    "RESOLVE",
    "CLOSE",
    "CANCEL",
    "REOPEN",
  ]),
  reason: z.string().trim().min(2).max(2000).optional(),
});
export const weddingDayIncidentUpdateSchema = z.object({
  updateType: z
    .enum([
      "NOTE",
      "STATUS_CHANGE",
      "ASSIGNMENT",
      "ESCALATION",
      "DECISION",
      "RESOLUTION",
    ])
    .default("NOTE"),
  body: z.string().trim().min(1).max(4000),
});
export const weddingDayDecisionSchema = z.object({
  title: z.string().trim().min(2).max(240),
  decision: z.string().trim().min(2).max(4000),
  reason: optionalText(2000),
  impactSummary: optionalText(2000),
});

export const createWeddingDayAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(2000),
  priority: z.enum(["INFO", "IMPORTANT", "URGENT"]).default("INFO"),
  publishAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  channels: z
    .array(z.enum(["GUEST_COMPANION", "IN_APP", "EMAIL"]))
    .min(1)
    .default(["GUEST_COMPANION", "IN_APP"]),
  audiences: z
    .array(
      z.object({
        type: z.enum([
          "ALL_CONFIRMED_GUESTS",
          "CHECKED_IN_GUESTS",
          "NOT_CHECKED_IN_GUESTS",
          "HOUSEHOLDS",
          "TABLES",
          "TRANSPORT_ROUTES",
          "ACCOMMODATION_PROPERTIES",
          "CUSTOM_GUEST_SET",
        ]),
        selector: z.record(z.unknown()).default({}),
      }),
    )
    .min(1),
});
export const updateWeddingDayAnnouncementSchema =
  createWeddingDayAnnouncementSchema.partial();

export const createWeddingDayContactSchema = z.object({
  type: z.enum([
    "COUPLE",
    "PLANNER",
    "VENUE",
    "VENDOR",
    "DRIVER",
    "ACCOMMODATION",
    "EMERGENCY",
    "MEDICAL",
    "SECURITY",
    "OTHER",
  ]),
  name: z.string().trim().min(2).max(180),
  role: z.string().trim().min(2).max(160),
  organizationName: optionalText(180),
  phone: optionalText(80),
  email: z.string().trim().email().max(320).nullable().optional(),
  notesPrivate: optionalText(2000),
  priority: weddingDayPrioritySchema.default("MEDIUM"),
  guestVisible: z.boolean().default(false),
});
export const updateWeddingDayContactSchema =
  createWeddingDayContactSchema.partial();

export const createCheckInSessionSchema = z.object({
  weddingEventId: uuid,
  planId: uuid.nullable().optional(),
  name: z.string().trim().min(2).max(180),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  allowHouseholdCheckIn: z.boolean().default(true),
  allowManualLookup: z.boolean().default(true),
  allowOffline: z.boolean().default(false),
});
export const updateCheckInSessionSchema = createCheckInSessionSchema
  .omit({ weddingEventId: true })
  .partial();
export const checkInSessionTransitionSchema = z.object({
  transition: z.enum([
    "MARK_READY",
    "OPEN",
    "PAUSE",
    "RESUME",
    "CLOSE",
    "ARCHIVE",
  ]),
});
export const createCheckInStationSchema = z.object({
  name: z.string().trim().min(2).max(180),
  location: optionalText(500),
});
export const updateCheckInStationSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  location: optionalText(500),
  status: z.enum(["ACTIVE", "PAUSED", "CLOSED"]).optional(),
});
export const createCheckInDeviceSchema = z.object({
  stationId: uuid.nullable().optional(),
  name: z.string().trim().min(2).max(180),
});
export const createCheckInCredentialSchema = z.object({
  householdId: uuid.nullable().optional(),
  guestId: uuid.nullable().optional(),
  credentialType: z.enum(["HOUSEHOLD", "INDIVIDUAL", "EVENT_ACCESS"]),
  expiresAt: z.string().datetime(),
});
export const validateCheckInCredentialSchema = z.object({
  token: z.string().min(32).max(512),
});
export const guestCheckInCommandSchema = z.object({
  commandId: uuid,
  credentialToken: z.string().min(32).max(512).optional(),
  guestIds: z.array(uuid).min(1).max(20),
  stationId: uuid.nullable().optional(),
  devicePublicId: z.string().max(120).optional(),
  override: z.boolean().default(false),
  overrideReason: z.string().trim().min(2).max(1000).optional(),
});
export const checkInManifestRequestSchema = z.object({
  devicePublicId: z.string().min(8).max(120),
  deviceSecret: z.string().min(32).max(512),
});
export const checkInOfflineSyncSchema = z.object({
  devicePublicId: z.string().min(8).max(120),
  deviceSecret: z.string().min(32).max(512),
  snapshotId: uuid,
  snapshotVersion: z.number().int().positive(),
  commands: z
    .array(
      z.object({
        commandId: uuid,
        guestId: uuid,
        credentialProof: z.string().length(64),
        action: z.enum(["CHECK_IN", "CHECK_OUT"]),
        occurredAtDevice: z.string().datetime(),
        localSequence: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(200),
});

export const createGuestMomentSchema = z.object({
  weddingEventId: uuid,
  guestId: uuid.nullable().optional(),
  caption: optionalText(1000),
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  originalFileName: z.string().trim().min(1).max(240),
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(250 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export const completeGuestMomentSchema = z.object({
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export const guestMomentTransitionSchema = z.object({
  transition: z.enum([
    "APPROVE",
    "REJECT",
    "HIDE",
    "RESTORE",
    "DELETE_REQUEST",
  ]),
  reason: z.string().trim().min(2).max(1000).optional(),
});
export const guestMomentReportSchema = z.object({
  reason: z.string().trim().min(2).max(120),
  details: optionalText(1000),
});
export const createGalleryCollectionSchema = z.object({
  weddingEventId: uuid,
  name: z.string().trim().min(2).max(180),
  description: optionalText(2000),
  visibility: z
    .enum(["GUESTS_WITH_ACCESS", "HOUSEHOLDS", "PRIVATE_ORGANIZERS"])
    .default("GUESTS_WITH_ACCESS"),
  householdIds: z.array(uuid).max(500).default([]),
});
export const updateGalleryCollectionSchema = createGalleryCollectionSchema
  .omit({ weddingEventId: true })
  .partial();
export const galleryItemsSchema = z.object({
  guestMomentIds: z.array(uuid).max(1000),
});

export const weddingDayExportSchema = z
  .object({
    type: z.enum([
      "RUN_SHEET",
      "CONTACT_SHEET",
      "CHECK_IN_MANIFEST",
      "ATTENDANCE",
      "INCIDENTS",
    ]),
    format: z.enum(["csv", "xlsx"]),
    planId: uuid.nullable().optional(),
    sessionId: uuid.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (
      ["RUN_SHEET", "CONTACT_SHEET", "INCIDENTS"].includes(value.type) &&
      !value.planId
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["planId"],
        message: "planId este obligatoriu pentru acest export.",
      });
    if (
      ["CHECK_IN_MANIFEST", "ATTENDANCE"].includes(value.type) &&
      !value.sessionId
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessionId"],
        message: "sessionId este obligatoriu pentru acest export.",
      });
  });

export const weddingDayLiveEventSchema = z.object({
  id: uuid,
  sequence: z.string(),
  eventType: z.string(),
  createdAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type CreateWeddingDayPlan = z.infer<typeof createWeddingDayPlanSchema>;
export type CreateRunOfShowItem = z.infer<typeof createRunOfShowItemSchema>;
export type RunOfShowTransition = z.infer<typeof runOfShowTransitionSchema>;
export type CreateCheckInSession = z.infer<typeof createCheckInSessionSchema>;
export type GuestCheckInCommand = z.infer<typeof guestCheckInCommandSchema>;
