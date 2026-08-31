import { z } from "zod";
import { guestAccommodationRecommendationSchema } from "./accommodation-discovery";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const guestSideSchema = z.enum([
  "PARTNER_ONE",
  "PARTNER_TWO",
  "COMMON",
  "VENDOR",
  "OTHER",
]);
export const guestStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "REMOVED"]);
export const guestAttendanceSchema = z.enum([
  "CONFIRMED",
  "DECLINED",
  "UNSURE",
  "NO_RESPONSE",
]);

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(180),
  preferredLanguage: z.string().trim().min(2).max(16).default("ro"),
  city: nullableText(120),
  country: nullableText(120),
  address: nullableText(500),
  category: nullableText(80),
  side: guestSideSchema.default("COMMON"),
  notesPrivate: nullableText(4000),
});
export const updateHouseholdSchema = createHouseholdSchema.partial().extend({
  primaryGuestId: uuid.nullable().optional(),
});
export type CreateHousehold = z.infer<typeof createHouseholdSchema>;
export type UpdateHousehold = z.infer<typeof updateHouseholdSchema>;

export const householdSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  name: z.string(),
  primaryGuestId: uuid.nullable(),
  preferredLanguage: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  address: z.string().nullable(),
  category: z.string().nullable(),
  side: z.enum(["partner_one", "partner_two", "common", "vendor", "other"]),
  invitationStatus: z.enum([
    "NOT_PREPARED",
    "READY",
    "QUEUED",
    "SENT",
    "OPENED",
    "PARTIALLY_RESPONDED",
    "RESPONDED",
  ]),
  guestsCount: z.number().int().nonnegative(),
  deletedAt: z.string().datetime().nullable(),
  version,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createGuestSchema = z.object({
  householdId: uuid,
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  displayName: nullableText(220),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(32)
    .regex(/^[+\d][\d\s().-]{5,31}$/)
    .nullable()
    .optional(),
  preferredLanguage: z.string().trim().min(2).max(16).default("ro"),
  relationship: nullableText(80),
  side: guestSideSchema.default("COMMON"),
  category: nullableText(80),
  isChild: z.boolean().default(false),
  dateOfBirth: z.string().date().nullable().optional(),
  isPlusOne: z.boolean().default(false),
  primaryGuestId: uuid.nullable().optional(),
  plusOneAllowed: z.boolean().default(false),
  accessibilityNotes: nullableText(4000),
  needsTransport: z.boolean().default(false),
  needsAccommodation: z.boolean().default(false),
  notesPrivate: nullableText(4000),
  tagIds: z.array(uuid).max(30).optional(),
});
export const updateGuestSchema = createGuestSchema.partial().extend({
  status: guestStatusSchema.optional(),
});
export type CreateGuest = z.infer<typeof createGuestSchema>;
export type UpdateGuest = z.infer<typeof updateGuestSchema>;

export const guestSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  householdId: uuid,
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string(),
  relationship: z.string().nullable(),
  side: z.enum(["partner_one", "partner_two", "common", "vendor", "other"]),
  category: z.string().nullable(),
  isChild: z.boolean(),
  isPlusOne: z.boolean(),
  primaryGuestId: uuid.nullable(),
  plusOneAllowed: z.boolean(),
  needsTransport: z.boolean(),
  needsAccommodation: z.boolean(),
  status: z.enum(["active", "archived", "removed"]),
  householdName: z.string().optional(),
  invitationStatus: z.string().optional(),
  rsvpStatus: z.string().optional(),
  menuName: z.string().nullable().optional(),
  tags: z
    .array(
      z.object({ id: uuid, name: z.string(), color: z.string().nullable() }),
    )
    .default([]),
  version,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createGuestTagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .optional(),
});
export const updateGuestTagSchema = createGuestTagSchema.partial();
export const guestTagSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  name: z.string(),
  color: z.string().nullable(),
  assignedGuests: z.number().int().nonnegative(),
  version,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const guestTagListSchema = z.object({ items: z.array(guestTagSchema) });

export const guestCrmSummarySchema = z.object({
  totalGuests: z.number().int().nonnegative(),
  totalHouseholds: z.number().int().nonnegative(),
  invitation: z.record(z.number().int().nonnegative()),
  rsvp: z.record(z.number().int().nonnegative()),
  people: z.object({
    adults: z.number().int(),
    children: z.number().int(),
    plusOnes: z.number().int(),
  }),
  menu: z.object({
    complete: z.number().int(),
    incomplete: z.number().int(),
    allergyIssues: z.number().int(),
  }),
  logistics: z.object({
    transportRequested: z.number().int(),
    accommodationRequested: z.number().int(),
  }),
});
export const householdListSchema = z.object({
  items: z.array(householdSchema),
  nextCursor: z.string().nullable(),
  summary: guestCrmSummarySchema,
});
export const guestListSchema = z.object({
  items: z.array(guestSchema),
  nextCursor: z.string().nullable(),
  summary: guestCrmSummarySchema,
});

export const createWeddingEventSchema = z.object({
  type: z.enum([
    "CIVIL_CEREMONY",
    "RELIGIOUS_CEREMONY",
    "RECEPTION",
    "WELCOME_DINNER",
    "BRUNCH",
    "CUSTOM",
  ]),
  title: z.string().trim().min(1).max(200),
  description: nullableText(2000),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  timezone: z.string().min(1).max(80),
  locationName: nullableText(240),
  locationAddress: nullableText(500),
  dressCode: nullableText(240),
  guestVisible: z.boolean().default(true),
  rsvpEnabled: z.boolean().default(true),
  position: z.number().int().nonnegative().default(0),
});

export const guestBulkCommandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("ADD_TAG"),
    guestIds: z.array(uuid).min(1).max(500),
    tagId: uuid,
  }),
  z.object({
    command: z.literal("REMOVE_TAG"),
    guestIds: z.array(uuid).min(1).max(500),
    tagId: uuid,
  }),
  z.object({
    command: z.literal("ARCHIVE"),
    guestIds: z.array(uuid).min(1).max(500),
  }),
  z.object({
    command: z.literal("MOVE_TO_HOUSEHOLD"),
    guestIds: z.array(uuid).min(1).max(500),
    householdId: uuid,
  }),
  z.object({
    command: z.literal("CREATE_INVITATION_RECIPIENTS"),
    guestIds: z.array(uuid).min(1).max(500),
  }),
  z.object({
    command: z.literal("ADD_TO_CAMPAIGN"),
    guestIds: z.array(uuid).min(1).max(500),
    campaignId: uuid,
  }),
  z.object({
    command: z.literal("SEND_RSVP_REMINDER"),
    guestIds: z.array(uuid).min(1).max(500),
  }),
]);

export const invitationDocumentSchema = z
  .object({
    sections: z
      .array(
        z.object({
          id: z.string().min(1).max(80),
          type: z.enum([
            "hero",
            "story",
            "countdown",
            "schedule",
            "locations",
            "rsvp",
            "dress_code",
            "transport",
            "accommodation",
            "faq",
            "contact",
            "registry",
            "custom",
          ]),
          title: z.string().max(240).optional(),
          visible: z.boolean().default(true),
          content: z.record(z.unknown()).default({}),
        }),
      )
      .max(50),
  })
  .passthrough()
  .superRefine((document, context) => {
    const unsafe = findUnsafeInvitationUrl(document);
    if (unsafe)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsafe invitation URL at ${unsafe}`,
      });
  });

export const invitationStarterContentValues = [
  "Ana & Mihai",
  "12 septembrie 2027",
  "Conacul Ambient · Cristian",
  "Ne-am cunoscut într-o seară de septembrie, iar de atunci fiecare drum important l-am făcut împreună.",
  "Acum vrem să vă avem aproape la începutul următorului capitol.",
  "Până spunem «da»",
  "2027-09-12T16:00",
  "Biserica Sf. Nicolae",
  "Conacul Ambient",
  "Biserica Sf. Nicolae, Brașov",
  "15 iunie 2027",
  "Vei fi alături de noi?",
  "Răspunsul tău ne ajută să pregătim fiecare detaliu.",
  "Garden formal",
  "Ținute elegante și confortabile, potrivite unei seri în grădină.",
  "Asigurăm transport dus-întors din centrul Brașovului.",
  "Plecarea: 17:00 · Piața Sfatului. Întoarceri: 01:00 și 03:00.",
  "Ambient Guest House",
  "La 3 minute · cod SARBATO",
  "Pot veni cu copiii?",
  "Există parcare?",
  "Andreea",
  "+40 700 000 000",
] as const;

const invitationStarterContentSet = new Set<string>(
  invitationStarterContentValues,
);

export function invitationContainsStarterContent(value: unknown): boolean {
  return invitationStarterContentMatches(value).size >= 2;
}

function invitationStarterContentMatches(
  value: unknown,
  matches = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (invitationStarterContentSet.has(normalized)) matches.add(normalized);
    return matches;
  }
  if (Array.isArray(value)) {
    for (const item of value) invitationStarterContentMatches(item, matches);
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  for (const item of Object.values(value as Record<string, unknown>))
    invitationStarterContentMatches(item, matches);
  return matches;
}

export const invitationExperienceSchema = z.object({
  enabled: z.boolean().default(false),
  style: z.enum(["split_panels", "envelope"]).default("split_panels"),
  replay: z.literal("first_visit").default("first_visit"),
  panelColor: z.string().trim().max(40).default("#3b183f"),
  backgroundColor: z.string().trim().max(40).default("#f7f7f3"),
  accentColor: z.string().trim().max(40).default("#f06449"),
  sealStyle: z
    .enum(["monogram", "botanical", "sunburst", "knot"])
    .default("monogram"),
  texture: z.enum(["paper", "linen", "smooth"]).default("paper"),
  monogram: z.string().trim().max(12).nullable().default(null),
  frontMessage: z.string().trim().max(160).nullable().default(null),
  coverImageUrl: z
    .string()
    .trim()
    .url()
    .refine((value) => isSafeInvitationUrl(value), "Unsafe cover image URL")
    .nullable()
    .default(null),
  coverMediaId: uuid.nullable().default(null),
  durationMs: z.number().int().min(700).max(3200).default(1800),
});
export const invitationSettingsSchema = z
  .object({
    colors: z.record(z.string()).default({}),
    typography: z.record(z.string()).default({}),
    spacing: z.enum(["compact", "comfortable", "airy"]).default("comfortable"),
    template: z.string().max(80).default("classic"),
    experience: invitationExperienceSchema.optional(),
  })
  .passthrough();
export const saveInvitationDraftSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  defaultLanguage: z.string().min(2).max(16).default("ro"),
  availableLanguages: z.array(z.string().min(2).max(16)).min(1).max(10),
  accessPolicy: z
    .enum(["TOKEN_ONLY", "TOKEN_OR_ACCESS_CODE"])
    .default("TOKEN_ONLY"),
  document: invitationDocumentSchema,
  settings: invitationSettingsSchema,
});
export const invitationSiteSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  slug: z.string(),
  status: z.enum(["draft", "published", "unpublished", "archived"]),
  defaultLanguage: z.string(),
  availableLanguages: z.array(z.string()),
  accessPolicy: z.enum(["token_only", "token_or_access_code"]),
  draft: z
    .object({
      id: uuid,
      versionNumber: z.number().int(),
      document: invitationDocumentSchema,
      settings: invitationSettingsSchema,
      language: z.string(),
      contentHash: z.string(),
    })
    .nullable(),
  published: z
    .object({
      id: uuid,
      versionNumber: z.number().int(),
      document: invitationDocumentSchema,
      settings: invitationSettingsSchema,
      language: z.string(),
      contentHash: z.string(),
      publishedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  publishedAt: z.string().datetime().nullable(),
  version,
});

export const createInvitationRecipientsSchema = z
  .object({
    householdIds: z.array(uuid).max(500).default([]),
    guestIds: z.array(uuid).max(500).default([]),
    invitationVersionId: uuid.optional(),
    invitationVariantId: uuid.nullable().optional(),
  })
  .refine(
    (value) => value.householdIds.length + value.guestIds.length > 0,
    "At least one recipient is required",
  );

export const invitationVariantOverridesSchema = z
  .object({
    document: z
      .object({
        sections: z
          .array(
            z.object({
              id: z.string().trim().min(1).max(80),
              title: z.string().max(240).nullable().optional(),
              visible: z.boolean().optional(),
              content: z.record(z.unknown()).optional(),
            }),
          )
          .max(50)
          .optional(),
      })
      .strict()
      .optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((overrides, context) => {
    const unsafe = findUnsafeInvitationUrl(overrides, "overrides");
    if (unsafe)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Unsafe invitation URL at ${unsafe}`,
      });
  });

export const invitationVariantCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const createInvitationVariantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: invitationVariantCodeSchema,
  overrides: invitationVariantOverridesSchema.default({}),
});
export const saveInvitationVariantDraftSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  overrides: invitationVariantOverridesSchema,
});
export const assignInvitationVariantSchema = z.object({
  variantId: uuid.nullable(),
});
export const recipientAccessChannelSchema = z.enum(["MANUAL", "WHATSAPP"]);
export const createRecipientAccessLinksSchema = z.object({
  channels: z.array(recipientAccessChannelSchema).min(1).max(2),
});
export const guestInvitationOpenSchema = z.object({
  token: z.string().min(32).max(1000),
  idempotencyKey: z.string().trim().min(8).max(200),
  source: z.enum(["cover", "skip", "direct", "replay"]),
});
export const guestLinkAccessSchema = z.object({
  token: z.string().min(32).max(1000),
  idempotencyKey: z.string().trim().min(8).max(200),
  source: z.literal("guest_page").default("guest_page"),
});

export const invitationSyncPathSchema = z.enum([
  "hero.names",
  "hero.date",
  "hero.venue",
  "schedule.items",
  "locations.items",
  "rsvp.deadline",
  "accommodation.items",
]);
export const invitationSyncDifferenceSchema = z.object({
  path: invitationSyncPathSchema,
  sectionId: z.string().min(1).max(80),
  source: z.enum([
    "wedding_profile",
    "wedding_events",
    "rsvp_form",
    "accommodation_recommendations",
  ]),
  currentValue: z.unknown(),
  sourceValue: z.unknown(),
});
export const invitationSyncPreviewSchema = z.object({
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  draftVersionId: uuid,
  differences: z.array(invitationSyncDifferenceSchema),
});
export const applyInvitationSyncSchema = z.object({
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  paths: z.array(invitationSyncPathSchema).min(1).max(7),
});

export const campaignPurposeSchema = z.enum([
  "INVITATION",
  "RSVP_REMINDER",
  "INFORMATION_UPDATE",
  "THANK_YOU",
  "CUSTOM",
]);
export const campaignAudienceFilterSchema = z
  .object({
    guestIds: z.array(uuid).max(500).optional(),
    householdIds: z.array(uuid).max(500).optional(),
    tagIds: z.array(uuid).max(30).optional(),
    sides: z.array(guestSideSchema).max(5).optional(),
    categories: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    countries: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    preferredLanguages: z
      .array(z.string().trim().min(2).max(16))
      .max(30)
      .optional(),
    invitationStatuses: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .optional(),
    rsvpStatuses: z.array(guestAttendanceSchema).max(4).optional(),
    includeChildren: z.boolean().optional(),
    includePlusOnes: z.boolean().optional(),
  })
  .strict();
export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(180),
  purpose: campaignPurposeSchema,
  channel: z.literal("EMAIL"),
  invitationVersionId: uuid.nullable().optional(),
  template: z.object({
    subject: z.string().trim().min(1).max(240),
    body: z.string().trim().min(1).max(10000),
  }),
  audienceFilter: campaignAudienceFilterSchema.default({}),
  scheduledAt: z.string().datetime().nullable().optional(),
});
export const updateCampaignSchema = createCampaignSchema.partial();
export const campaignTransitionSchema = z
  .object({
    transition: z.enum([
      "SCHEDULE",
      "SEND_NOW",
      "CANCEL",
      "RETRY_FAILED",
      "ARCHIVE",
    ]),
    scheduledAt: z.string().datetime().optional(),
    audienceRevision: z.string().length(64).optional(),
  })
  .superRefine((input, context) => {
    if (
      ["SEND_NOW", "SCHEDULE"].includes(input.transition) &&
      !input.audienceRevision
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audienceRevision"],
        message: "Confirm the current campaign audience before sending",
      });
  });

export const rsvpFormConfigSchema = z.object({
  deadline: z.string().datetime().nullable(),
  attendanceEnabled: z.boolean().default(true),
  perEventAttendance: z.boolean().default(true),
  plusOneQuestion: z.boolean().default(true),
  childrenConfirmation: z.boolean().default(true),
  menuSelection: z.boolean().default(true),
  allergyCollection: z.boolean().default(true),
  accessibilityCollection: z.boolean().default(true),
  transportQuestion: z.boolean().default(true),
  accommodationQuestion: z.boolean().default(true),
  guestMessage: z.boolean().default(true),
  allowEdits: z.boolean().default(true),
  closedMessage: z.string().max(1000).default("RSVP închis"),
  languages: z.array(z.string().min(2).max(16)).min(1).max(10),
});
export const saveRsvpFormSchema = z.object({ config: rsvpFormConfigSchema });

export const guestRsvpRequestSchema = z.object({
  token: z.string().min(32).max(1000),
  version,
  idempotencyKey: z.string().min(8).max(200),
  members: z
    .array(
      z.object({
        guestId: uuid,
        events: z
          .array(
            z.object({
              eventId: uuid,
              attendance: z.enum(["CONFIRMED", "DECLINED", "UNSURE"]),
            }),
          )
          .min(1),
        menuId: uuid.optional(),
        allergies: z
          .array(z.string().trim().min(1).max(120))
          .max(20)
          .optional(),
        allergyDetails: z.string().max(2000).optional(),
        needsTransport: z.boolean().optional(),
        needsAccommodation: z.boolean().optional(),
        accessibilityNotes: z.string().max(2000).optional(),
      }),
    )
    .min(1),
  plusOne: z
    .object({
      attending: z.boolean(),
      firstName: z.string().trim().max(100).optional(),
      lastName: z.string().trim().max(100).optional(),
      menuId: uuid.optional(),
      allergies: z.array(z.string().max(120)).max(20).optional(),
    })
    .optional(),
  message: z.string().max(2000).optional(),
});

export const adminRsvpOverrideSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  members: guestRsvpRequestSchema.shape.members,
  message: z.string().max(2000).optional(),
});

export const createMenuSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: nullableText(2000),
  audience: z.enum(["ADULT", "CHILD", "ALL"]).default("ALL"),
  priceMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .optional(),
  vendorNameSnapshot: nullableText(180),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE"]).default("DRAFT"),
  position: z.number().int().nonnegative().default(0),
  courses: z
    .array(
      z.object({
        courseType: z.string().min(1).max(80),
        name: z.string().min(1).max(180),
        description: nullableText(1000),
        position: z.number().int().nonnegative(),
      }),
    )
    .max(30)
    .default([]),
  dietaryTags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
export const updateMenuSchema = createMenuSchema.partial();
export const organizerMenuSelectionSchema = z.object({
  menuId: uuid.nullable(),
  selectionVersion: z.number().int().positive().nullable().optional(),
});
export const organizerMenuSelectionResourceSchema = z.object({
  id: uuid.optional(),
  guestId: uuid,
  menuId: uuid.nullable(),
  menuName: z.string().nullable(),
  selectedAt: z.string().datetime().optional(),
  source: z.string().optional(),
  version: z.number().int().positive().nullable(),
});
export const resolveAllergyIssueSchema = z.object({
  status: z.enum([
    "UNREVIEWED",
    "REVIEWING",
    "CONFIRMED_WITH_CATERER",
    "RESOLVED",
  ]),
  assignedToMembershipId: uuid.nullable().optional(),
  resolutionNote: z.string().max(2000).nullable().optional(),
});

export const exportRequestSchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  selectedGuestIds: z.array(uuid).max(5000).optional(),
  filters: z.record(z.unknown()).optional(),
  includeContactData: z.boolean().default(false),
  includeRsvp: z.boolean().default(true),
  includeMenu: z.boolean().default(true),
  includeAllergies: z.boolean().default(false),
  includeLogistics: z.boolean().default(true),
});

export const importMappingSchema = z.object({
  mapping: z.record(z.string().max(120)),
});
export const importRowDecisionSchema = z.object({
  decision: z.enum(["CREATE_NEW", "MERGE_WITH_EXISTING", "SKIP"]),
  mergeGuestId: uuid.optional(),
});

export const guestImportSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  sourceFileName: z.string(),
  status: z.enum([
    "uploaded",
    "parsing",
    "ready_for_mapping",
    "ready_for_review",
    "committing",
    "completed",
    "failed",
    "expired",
  ]),
  mapping: z.record(z.unknown()),
  totalRows: z.number().int().nonnegative(),
  validRows: z.number().int().nonnegative(),
  invalidRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  committedRows: z.number().int().nonnegative(),
  expiresAt: z.string().datetime(),
  version,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const guestImportRowSchema = z.object({
  id: uuid,
  rowNumber: z.number().int().positive(),
  rawDataRedacted: z.record(z.unknown()),
  normalizedData: z.record(z.unknown()),
  validationErrors: z.array(z.unknown()),
  duplicateGuestId: uuid.nullable(),
  duplicateHouseholdId: uuid.nullable(),
  decision: z.enum(["create_new", "merge_with_existing", "skip"]).nullable(),
  resultGuestId: uuid.nullable(),
  version,
});
export const guestImportRowListSchema = z.object({
  items: z.array(guestImportRowSchema),
  nextCursor: z.string().nullable(),
});

export const invitationRecipientSchema = z
  .object({
    id: uuid,
    invitationSiteId: uuid,
    householdId: uuid.nullable(),
    householdName: z.string().nullable().optional(),
    guestId: uuid.nullable(),
    guestName: z.string().nullable().optional(),
    invitationVersionId: uuid,
    invitationVariantId: uuid.nullable(),
    invitationVariantName: z.string().nullable().optional(),
    preferredLanguage: z.string(),
    status: z.string(),
    openedAt: z.string().datetime().nullable(),
    lastAccessedAt: z.string().datetime().nullable(),
    rsvpCompletedAt: z.string().datetime().nullable(),
    version,
  })
  .passthrough();
export const invitationRecipientListSchema = z.object({
  items: z.array(invitationRecipientSchema),
  nextCursor: z.string().nullable(),
});

export const invitationVariantVersionSchema = z.object({
  id: uuid,
  versionNumber: z.number().int().positive(),
  baseInvitationVersionId: uuid,
  overrides: invitationVariantOverridesSchema,
  contentHash: z.string(),
  publishedAt: z.string().datetime().nullable(),
});
export const invitationVariantSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  invitationSiteId: uuid,
  name: z.string(),
  code: invitationVariantCodeSchema,
  status: z.enum(["active", "archived"]),
  assignedRecipients: z.number().int().nonnegative(),
  draft: invitationVariantVersionSchema.nullable(),
  published: invitationVariantVersionSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version,
});
export const invitationVariantListSchema = z.object({
  items: z.array(invitationVariantSchema),
});

export const invitationVersionHistoryItemSchema = z.object({
  id: uuid,
  versionNumber: z.number().int().positive(),
  document: invitationDocumentSchema,
  settings: invitationSettingsSchema,
  language: z.string(),
  contentHash: z.string(),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  isCurrentDraft: z.boolean(),
  isPublished: z.boolean(),
});
export const invitationVersionHistorySchema = z.object({
  items: z.array(invitationVersionHistoryItemSchema),
  nextCursor: uuid.nullable(),
});

export const invitationPreflightIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  recipientId: uuid.optional(),
  variantId: uuid.optional(),
});
export const invitationPreflightSchema = z.object({
  ready: z.boolean(),
  errors: z.array(invitationPreflightIssueSchema),
  warnings: z.array(invitationPreflightIssueSchema),
  baseVersionId: uuid.nullable(),
  activeVariants: z.number().int().nonnegative(),
  assignedRecipients: z.number().int().nonnegative(),
});

export const recipientAccessLinkSchema = z.object({
  channel: recipientAccessChannelSchema,
  url: z.string().url(),
  reused: z.boolean(),
});
export const recipientAccessLinkListSchema = z.object({
  items: z.array(recipientAccessLinkSchema),
});
export const guestInvitationOpenResultSchema = z.object({
  recipientId: uuid,
  invitationOpenedAt: z.string().datetime(),
  duplicate: z.boolean(),
});
export const guestLinkAccessResultSchema = z.object({
  recipientId: uuid,
  linkAccessedAt: z.string().datetime(),
  duplicate: z.boolean(),
});

export const campaignSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  name: z.string(),
  purpose: z.enum([
    "invitation",
    "rsvp_reminder",
    "information_update",
    "thank_you",
    "custom",
  ]),
  channel: z.literal("email"),
  status: z.enum([
    "draft",
    "scheduled",
    "queued",
    "sending",
    "completed",
    "partial",
    "failed",
    "paused",
    "cancelled",
    "archived",
  ]),
  invitationVersionId: uuid.nullable(),
  template: z.record(z.unknown()),
  audienceFilter: z.record(z.unknown()),
  scheduledAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  backgroundJobId: uuid.nullable(),
  statistics: z.object({
    total: z.number().int().nonnegative(),
    byStatus: z.record(z.number().int().nonnegative()),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version,
});
export const campaignListSchema = z.object({
  items: z.array(campaignSchema),
  nextCursor: z.string().nullable(),
});
export const campaignRecipientSchema = z.object({
  id: uuid,
  invitationRecipientId: uuid,
  guestId: uuid.nullable(),
  householdId: uuid.nullable(),
  address: z.string(),
  status: z.enum([
    "pending",
    "queued",
    "sent",
    "delivered",
    "opened",
    "failed",
    "cancelled",
    "unsubscribed",
  ]),
  queuedAt: z.string().datetime().nullable(),
  sentAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  openedAt: z.string().datetime().nullable(),
  failedAt: z.string().datetime().nullable(),
  failureCode: z.string().nullable(),
  version,
});
export const campaignRecipientListSchema = z.object({
  items: z.array(campaignRecipientSchema),
  nextCursor: z.string().nullable(),
});
export const campaignStatisticsSchema = z.object({
  campaignId: uuid,
  total: z.number().int().nonnegative(),
  byStatus: z.record(z.number().int().nonnegative()),
});

export const rsvpFormVersionSchema = z.object({
  id: uuid,
  versionNumber: z.number().int().positive(),
  config: rsvpFormConfigSchema,
  contentHash: z.string().length(64),
  immutable: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
});
export const rsvpFormSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  status: z.enum(["draft", "published", "unpublished"]),
  draft: rsvpFormVersionSchema.nullable(),
  published: rsvpFormVersionSchema.nullable(),
  version,
});
export const rsvpDashboardStatusSchema = z.enum([
  "confirmed",
  "declined",
  "unsure",
  "mixed",
  "incomplete",
  "no_response",
]);
export const rsvpDashboardQuerySchema = z.object({
  search: z.string().trim().max(180).optional(),
  status: rsvpDashboardStatusSchema.optional(),
  cursor: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const rsvpDashboardEventSchema = z.object({
  id: uuid,
  title: z.string(),
  startAt: z.string().datetime().nullable(),
});
export const rsvpDashboardMemberSchema = z.object({
  guestId: uuid,
  name: z.string(),
  isChild: z.boolean(),
  isPlusOne: z.boolean(),
  status: rsvpDashboardStatusSchema,
  responses: z.array(
    z.object({
      eventId: uuid,
      attendance: z.enum(["confirmed", "declined", "unsure"]).nullable(),
    }),
  ),
  menuId: uuid.nullable(),
  menuName: z.string().nullable(),
  needsTransport: z.boolean(),
  needsAccommodation: z.boolean(),
});
export const rsvpDashboardHouseholdSchema = z.object({
  householdId: uuid,
  householdName: z.string(),
  status: rsvpDashboardStatusSchema,
  members: z.array(rsvpDashboardMemberSchema),
  submission: z
    .object({
      id: uuid,
      version,
      source: z.enum(["guest", "admin_override"]),
      message: z.string().nullable(),
      submittedAt: z.string().datetime().nullable(),
      lastModifiedAt: z.string().datetime().nullable(),
    })
    .nullable(),
});
export const rsvpDashboardSchema = z.object({
  events: z.array(rsvpDashboardEventSchema),
  items: z.array(rsvpDashboardHouseholdSchema),
  nextCursor: uuid.nullable(),
  matchedHouseholds: z.number().int().nonnegative(),
  summary: z.object({
    totalGuests: z.number().int().nonnegative(),
    totalHouseholds: z.number().int().nonnegative(),
    respondedHouseholds: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    unsure: z.number().int().nonnegative(),
    mixed: z.number().int().nonnegative(),
    incomplete: z.number().int().nonnegative(),
    noResponse: z.number().int().nonnegative(),
    menuIncomplete: z.number().int().nonnegative(),
    transportRequested: z.number().int().nonnegative(),
    accommodationRequested: z.number().int().nonnegative(),
  }),
});
export const rsvpSubmissionSchema = z.object({
  id: uuid,
  status: z.string(),
  source: z.string(),
  message: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  lastModifiedAt: z.string().datetime().nullable(),
  responses: z.array(
    z.object({ guestId: uuid, eventId: uuid, attendance: z.string() }),
  ),
  selections: z.array(z.object({ guestId: uuid, menuId: uuid })),
  version,
});
export const guestCompanionBootstrapSchema = z
  .object({
    couple: z.record(z.unknown()),
    invitation: z.object({
      siteId: uuid,
      document: invitationDocumentSchema,
      settings: invitationSettingsSchema,
      language: z.string(),
      baseVersionId: uuid,
      variant: z
        .object({
          id: uuid,
          name: z.string(),
          code: invitationVariantCodeSchema,
          versionId: uuid,
        })
        .nullable(),
      experience: invitationExperienceSchema.nullable(),
    }),
    interaction: z.object({
      invitationOpenedAt: z.string().datetime().nullable(),
      lastAccessedAt: z.string().datetime().nullable(),
      shouldPlayReveal: z.boolean(),
    }),
    events: z.array(z.record(z.unknown())),
    household: z.object({
      id: uuid,
      name: z.string(),
      members: z.array(z.record(z.unknown())),
    }),
    rsvp: z.record(z.unknown()),
    rsvpConfig: rsvpFormConfigSchema,
    menus: z.array(z.record(z.unknown())),
    accommodationRecommendations: z.array(
      guestAccommodationRecommendationSchema,
    ),
    deadline: z.string().datetime().nullable(),
    allowEdits: z.boolean(),
    closedMessage: z.string(),
  })
  .passthrough();

export const guestInvitationBootstrapSchema = z.object({
  invitation: guestCompanionBootstrapSchema.shape.invitation,
  interaction: guestCompanionBootstrapSchema.shape.interaction,
  household: z.object({
    id: uuid,
    name: z.string(),
  }),
  events: z.array(z.record(z.unknown())),
});

export const guestRsvpBootstrapSchema = z.object({
  household: guestCompanionBootstrapSchema.shape.household,
  events: guestCompanionBootstrapSchema.shape.events,
  rsvp: guestCompanionBootstrapSchema.shape.rsvp,
  rsvpConfig: guestCompanionBootstrapSchema.shape.rsvpConfig,
  menus: guestCompanionBootstrapSchema.shape.menus,
  deadline: guestCompanionBootstrapSchema.shape.deadline,
  allowEdits: guestCompanionBootstrapSchema.shape.allowEdits,
  closedMessage: guestCompanionBootstrapSchema.shape.closedMessage,
});

export const menuSchema = z
  .object({
    id: uuid,
    workspaceId: uuid,
    name: z.string(),
    description: z.string().nullable(),
    audience: z.enum(["adult", "child", "all"]),
    priceMinor: z.number().int().nullable(),
    currency: z.string().nullable(),
    status: z.enum(["draft", "active", "inactive"]),
    position: z.number().int(),
    version: version.optional(),
  })
  .passthrough();
export const menuListSchema = z.object({ items: z.array(menuSchema) });
export const cursorRecordListSchema = z.object({
  items: z.array(z.record(z.unknown())),
  nextCursor: z.string().nullable(),
});

export type SaveInvitationDraft = z.infer<typeof saveInvitationDraftSchema>;
export type InvitationExperience = z.infer<typeof invitationExperienceSchema>;
export type CreateInvitationVariant = z.infer<
  typeof createInvitationVariantSchema
>;
export type SaveInvitationVariantDraft = z.infer<
  typeof saveInvitationVariantDraftSchema
>;
export type InvitationVariantOverrides = z.infer<
  typeof invitationVariantOverridesSchema
>;
export type ApplyInvitationSync = z.infer<typeof applyInvitationSyncSchema>;
export type GuestInvitationOpen = z.infer<typeof guestInvitationOpenSchema>;
export type GuestLinkAccess = z.infer<typeof guestLinkAccessSchema>;
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
export type CreateGuestTag = z.infer<typeof createGuestTagSchema>;
export type UpdateGuestTag = z.infer<typeof updateGuestTagSchema>;

function findUnsafeInvitationUrl(
  value: unknown,
  path = "document",
): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const unsafe = findUnsafeInvitationUrl(value[index], `${path}[${index}]`);
      if (unsafe) return unsafe;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (
      typeof child === "string" &&
      /(url|uri|href|link|meeting|map)/i.test(key) &&
      child.trim() &&
      !isSafeInvitationUrl(child)
    )
      return childPath;
    const nested = findUnsafeInvitationUrl(child, childPath);
    if (nested) return nested;
  }
  return null;
}

function isSafeInvitationUrl(value: string) {
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
export type GuestRsvpRequest = z.infer<typeof guestRsvpRequestSchema>;
export type CreateMenu = z.infer<typeof createMenuSchema>;
export type OrganizerMenuSelection = z.infer<
  typeof organizerMenuSelectionSchema
>;
export type OrganizerMenuSelectionResource = z.infer<
  typeof organizerMenuSelectionResourceSchema
>;
export type HouseholdResource = z.infer<typeof householdSchema>;
export type HouseholdListResource = z.infer<typeof householdListSchema>;
export type GuestResource = z.infer<typeof guestSchema>;
export type GuestListResource = z.infer<typeof guestListSchema>;
export type GuestTagResource = z.infer<typeof guestTagSchema>;
export type GuestImportResource = z.infer<typeof guestImportSchema>;
export type GuestImportRowResource = z.infer<typeof guestImportRowSchema>;
export type InvitationSiteResource = z.infer<typeof invitationSiteSchema>;
export type InvitationRecipientResource = z.infer<
  typeof invitationRecipientSchema
>;
export type InvitationVariantResource = z.infer<typeof invitationVariantSchema>;
export type InvitationVersionHistoryItemResource = z.infer<
  typeof invitationVersionHistoryItemSchema
>;
export type InvitationVersionHistoryResource = z.infer<
  typeof invitationVersionHistorySchema
>;
export type InvitationPreflightResource = z.infer<
  typeof invitationPreflightSchema
>;
export type InvitationSyncPreviewResource = z.infer<
  typeof invitationSyncPreviewSchema
>;
export type InvitationSyncPath = z.infer<typeof invitationSyncPathSchema>;
export type RecipientAccessLinkResource = z.infer<
  typeof recipientAccessLinkSchema
>;
export type CampaignResource = z.infer<typeof campaignSchema>;
export type CampaignRecipientResource = z.infer<typeof campaignRecipientSchema>;
export type RsvpFormResource = z.infer<typeof rsvpFormSchema>;
export type RsvpDashboardStatus = z.infer<typeof rsvpDashboardStatusSchema>;
export type RsvpDashboardQuery = z.infer<typeof rsvpDashboardQuerySchema>;
export type RsvpDashboardResource = z.infer<typeof rsvpDashboardSchema>;
export type RsvpDashboardHouseholdResource = z.infer<
  typeof rsvpDashboardHouseholdSchema
>;
export type RsvpSubmissionResource = z.infer<typeof rsvpSubmissionSchema>;
export type GuestCompanionBootstrapResource = z.infer<
  typeof guestCompanionBootstrapSchema
>;
export type GuestInvitationBootstrapResource = z.infer<
  typeof guestInvitationBootstrapSchema
>;
export type GuestRsvpBootstrapResource = z.infer<
  typeof guestRsvpBootstrapSchema
>;
export type MenuResource = z.infer<typeof menuSchema>;
