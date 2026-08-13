import { z } from "zod";

export const vendorCategories = [
  "VENUE",
  "PHOTOGRAPHY",
  "VIDEOGRAPHY",
  "CATERING",
  "ENTERTAINMENT",
  "MUSIC",
  "DECOR",
  "FLOWERS",
  "PLANNING",
  "ATTIRE",
  "BEAUTY",
  "TRANSPORT",
  "ACCOMMODATION",
  "INVITATIONS",
  "CAKE",
  "RENTALS",
  "LIGHTING",
  "CEREMONY",
  "OTHER",
] as const;
export const vendorCategorySchema = z.enum(vendorCategories);
export type VendorCategory = z.infer<typeof vendorCategorySchema>;

const uuid = z.string().uuid();
const currency = z.string().regex(/^[A-Z]{3}$/);
const minor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const nullableMinor = minor.nullable().optional();
const boundedText = z.string().trim().min(1).max(10_000);
const nullableText = z.string().trim().max(10_000).nullable().optional();
const isoDateTime = z.string().datetime({ offset: true });

export const createVendorOrganizationSchema = z.object({
  legalName: z.string().trim().min(2).max(180),
  displayName: z.string().trim().min(2).max(180),
  country: z.string().trim().min(2).max(80),
  registrationNumber: z.string().trim().max(120).nullable().optional(),
  taxId: z.string().trim().max(120).nullable().optional(),
  billingEmail: z.string().email().nullable().optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().trim().max(50).nullable().optional(),
  websiteUrl: z.string().url().max(2048).nullable().optional(),
});
export const updateVendorOrganizationSchema =
  createVendorOrganizationSchema.partial();

export const vendorInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum([
    "vendor_owner",
    "vendor_manager",
    "vendor_sales",
    "vendor_operations",
    "vendor_viewer",
  ]),
});
export const vendorInvitationTokenSchema = z.object({
  token: z.string().min(32).max(500),
});
export const updateVendorMemberSchema = z.object({
  role: z
    .enum([
      "vendor_owner",
      "vendor_manager",
      "vendor_sales",
      "vendor_operations",
      "vendor_viewer",
    ])
    .optional(),
  status: z.enum(["ACTIVE", "REMOVED"]).optional(),
});

const vendorPublicMediaUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      if (
        /^\/api\/v1\/marketplace\/portfolio-assets\/[0-9a-f-]{36}$/i.test(value)
      )
        return true;
      try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Media URL must use HTTP(S) or a Sarbato portfolio asset URL" },
  );

export const upsertVendorProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  headline: z.string().trim().min(3).max(180),
  description: boundedText,
  shortDescription: z.string().trim().min(3).max(500),
  logoUrl: vendorPublicMediaUrlSchema.nullable().optional(),
  coverImageUrl: vendorPublicMediaUrlSchema.nullable().optional(),
  categories: z.array(vendorCategorySchema).min(1).max(8),
  customCategoryLabel: z.string().trim().max(100).nullable().optional(),
  languages: z.array(z.string().trim().min(2).max(16)).min(1).max(12),
  yearsExperience: z.number().int().min(0).max(100).nullable().optional(),
  pricingVisibility: z.enum([
    "STARTING_FROM",
    "RANGE",
    "REQUEST_QUOTE",
    "HIDDEN",
  ]),
  startingPriceMinor: nullableMinor,
  currency,
  responseTimeLabel: z.string().trim().max(80).nullable().optional(),
  publicEmail: z.string().email().nullable().optional(),
  publicPhone: z.string().trim().max(50).nullable().optional(),
});

export const createVendorServiceSchema = z.object({
  category: vendorCategorySchema,
  customCategoryLabel: z.string().trim().max(100).nullable().optional(),
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().min(2).max(3000),
  pricingModel: z.enum(["FIXED", "PER_GUEST", "PER_HOUR", "PER_DAY", "CUSTOM"]),
  startingPriceMinor: nullableMinor,
  currency,
  active: z.boolean().default(true),
});
export const updateVendorServiceSchema = createVendorServiceSchema.partial();

export const createVendorPackageSchema = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().min(2).max(3000),
  basePriceMinor: nullableMinor,
  currency,
  includedItems: z
    .array(z.string().trim().min(1).max(500))
    .max(100)
    .default([]),
  excludedItems: z
    .array(z.string().trim().min(1).max(500))
    .max(100)
    .default([]),
  guestLimit: z.number().int().positive().nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
  position: z.number().int().nonnegative().default(0),
});
export const updateVendorPackageSchema = createVendorPackageSchema.partial();

const vendorAvailabilityBaseSchema = z.object({
  startAt: isoDateTime,
  endAt: isoDateTime,
  status: z.enum(["AVAILABLE", "TENTATIVE", "UNAVAILABLE", "BOOKED"]),
  source: z.enum(["MANUAL", "BOOKING"]),
  notePrivate: z.string().trim().max(1000).nullable().optional(),
});
export const createVendorAvailabilitySchema =
  vendorAvailabilityBaseSchema.superRefine((value, context) => {
    if (Date.parse(value.endAt) <= Date.parse(value.startAt))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Sfârșitul trebuie să fie după început.",
      });
  });
export const updateVendorAvailabilitySchema = vendorAvailabilityBaseSchema
  .partial()
  .superRefine((value, context) => {
    if (
      value.startAt &&
      value.endAt &&
      Date.parse(value.endAt) <= Date.parse(value.startAt)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "Sfârșitul trebuie să fie după început.",
      });
  });

export const createShortlistSchema = z.object({
  name: z.string().trim().min(2).max(180),
  category: vendorCategorySchema.nullable().optional(),
});
export const updateShortlistSchema = createShortlistSchema.partial();
export const replaceShortlistItemsSchema = z.object({
  vendorOrganizationIds: z.array(uuid).max(100),
});

export const rfqRequirementSchema = z.object({
  type: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(180),
  description: nullableText,
  required: z.boolean(),
  value: z.unknown().optional(),
  position: z.number().int().nonnegative(),
});
export const rfqQuestionSchema = z.object({
  question: z.string().trim().min(2).max(1000),
  responseType: z.enum([
    "TEXT",
    "NUMBER",
    "BOOLEAN",
    "DATE",
    "CHOICE",
    "MULTI_CHOICE",
  ]),
  options: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  required: z.boolean(),
  position: z.number().int().nonnegative(),
});
const rfqBaseSchema = z.object({
  title: z.string().trim().min(3).max(180),
  category: vendorCategorySchema,
  description: boundedText,
  weddingEventId: uuid.nullable().optional(),
  eventDate: z.string().date().nullable().optional(),
  guestCount: z.number().int().positive().nullable().optional(),
  locationSnapshot: z.record(z.unknown()).default({}),
  budgetRangeMinMinor: nullableMinor,
  budgetRangeMaxMinor: nullableMinor,
  currency,
  awardPolicy: z.literal("SINGLE_AWARD").default("SINGLE_AWARD"),
  responseDeadline: isoDateTime,
  requirements: z.array(rfqRequirementSchema).max(100).default([]),
  questions: z.array(rfqQuestionSchema).max(100).default([]),
});
export const createRfqSchema = rfqBaseSchema.superRefine((value, context) => {
  if (
    value.budgetRangeMinMinor != null &&
    value.budgetRangeMaxMinor != null &&
    value.budgetRangeMinMinor > value.budgetRangeMaxMinor
  )
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["budgetRangeMaxMinor"],
      message: "Bugetul maxim trebuie să fie cel puțin bugetul minim.",
    });
});
export const updateRfqSchema = rfqBaseSchema
  .partial()
  .superRefine((value, context) => {
    if (
      value.budgetRangeMinMinor != null &&
      value.budgetRangeMaxMinor != null &&
      value.budgetRangeMinMinor > value.budgetRangeMaxMinor
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budgetRangeMaxMinor"],
        message: "Bugetul maxim trebuie să fie cel puțin bugetul minim.",
      });
  });
export const replaceRfqRecipientsSchema = z.object({
  vendorOrganizationIds: z.array(uuid).min(1).max(50),
});
export const rfqTransitionSchema = z.object({
  transition: z.enum([
    "MARK_READY",
    "SEND",
    "CLOSE",
    "CANCEL",
    "ARCHIVE",
    "REOPEN",
  ]),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const offerLineItemSchema = z.object({
  type: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).default(""),
  quantity: z.number().int().positive().max(1_000_000),
  unit: z.enum(["FIXED", "GUEST", "HOUR", "DAY", "ITEM", "PERCENT", "CUSTOM"]),
  unitPriceMinor: minor,
  optional: z.boolean().default(false),
  selected: z.boolean().default(true),
  position: z.number().int().nonnegative(),
});
export const offerAnswerSchema = z.object({
  questionId: uuid,
  value: z.unknown(),
});
export const createOfferSchema = z.object({
  currency,
  lineItems: z.array(offerLineItemSchema).min(1).max(200),
  answers: z.array(offerAnswerSchema).max(100).default([]),
  discountMinor: minor.default(0),
  taxRateBasisPoints: z.number().int().min(0).max(100_000).default(0),
  depositMinor: nullableMinor,
  pricingNotes: nullableText,
  terms: z.record(z.unknown()).default({}),
  availabilityConfirmation: z.string().trim().max(1000),
  deliveryTimeline: z.string().trim().max(2000),
  cancellationTerms: z.string().trim().max(3000),
  validUntil: isoDateTime.nullable().optional(),
});
export const updateOfferDraftSchema = createOfferSchema.partial();
export const offerReviewTransitionSchema = z.object({
  transition: z.enum([
    "START_REVIEW",
    "REQUEST_REVISION",
    "ACCEPT",
    "REJECT",
    "ARCHIVE",
  ]),
  reason: z.string().trim().max(2000).nullable().optional(),
  selectedOptionalLineItemIds: z.array(uuid).max(200).optional(),
});

export const negotiationMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export const bookingTransitionSchema = z.object({
  transition: z.enum(["CANCEL", "DISPUTE", "ARCHIVE", "START", "COMPLETE"]),
  reason: z.string().trim().max(2000).nullable().optional(),
});
export const updateBookingSchema = z.object({
  title: z.string().trim().min(2).max(180).optional(),
  serviceStartAt: isoDateTime.nullable().optional(),
  serviceEndAt: isoDateTime.nullable().optional(),
});

export const contractDocumentSchema = z.object({
  parties: z.record(z.unknown()),
  event: z.record(z.unknown()),
  services: z.array(z.record(z.unknown())),
  scope: z.array(z.string().max(2000)),
  exclusions: z.array(z.string().max(2000)),
  dates: z.record(z.unknown()),
  location: z.record(z.unknown()),
  total: z.record(z.unknown()),
  deposit: z.record(z.unknown()).nullable(),
  paymentSchedule: z.array(z.record(z.unknown())),
  cancellation: z.string().max(10_000),
  rescheduling: z.string().max(10_000),
  responsibilities: z.array(z.string().max(3000)),
  forceMajeure: z.string().max(10_000),
  dataPrivacy: z.string().max(10_000),
  customClauses: z.array(z.string().max(10_000)),
});
export const updateContractDraftSchema = z.object({
  document: contractDocumentSchema,
  summary: z.string().trim().min(1).max(10_000),
  cancellationTerms: z.string().trim().max(10_000),
  paymentTerms: z.record(z.unknown()),
  serviceScope: z.record(z.unknown()),
});
export const contractTransitionSchema = z.object({
  transition: z.enum([
    "SUBMIT_FOR_REVIEW",
    "REQUEST_CHANGES",
    "MARK_READY",
    "START_AMENDMENT",
    "CANCEL",
  ]),
  reason: z.string().trim().max(2000).nullable().optional(),
});
export const contractAcknowledgementSchema = z.object({
  typedName: z.string().trim().min(2).max(180),
  statementVersion: z.literal("weddingos-contract-ack-v1"),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const contractExportSchema = z.object({
  format: z.enum(["html", "pdf"]),
  contractVersionId: uuid,
});

export const updateBudgetPlanSchema = z.object({
  name: z.string().trim().min(2).max(180),
  targetTotalMinor: minor,
  contingencyPercent: z.number().int().min(0).max(100),
  status: z.enum(["DRAFT", "ACTIVE", "LOCKED", "ARCHIVED"]).default("ACTIVE"),
});
export const createBudgetCategorySchema = z.object({
  parentCategoryId: uuid.nullable().optional(),
  name: z.string().trim().min(2).max(180),
  canonicalType: z
    .enum([
      "VENUE",
      "CATERING",
      "PHOTO_VIDEO",
      "ENTERTAINMENT",
      "DECOR_FLOWERS",
      "ATTIRE_BEAUTY",
      "INVITATIONS",
      "TRANSPORT",
      "ACCOMMODATION",
      "CEREMONY",
      "CAKE",
      "RENTALS",
      "PLANNER",
      "GIFTS",
      "LEGAL",
      "MISCELLANEOUS",
      "CONTINGENCY",
    ])
    .nullable()
    .optional(),
  allocatedMinor: minor,
  position: z.number().int().nonnegative(),
});
export const updateBudgetCategorySchema = createBudgetCategorySchema.partial();
export const createBudgetItemSchema = z.object({
  categoryId: uuid,
  name: z.string().trim().min(2).max(180),
  description: nullableText,
  estimatedMinor: minor,
  quotedMinor: nullableMinor,
  committedMinor: nullableMinor,
  dueAt: isoDateTime.nullable().optional(),
  vendorOrganizationId: uuid.nullable().optional(),
});
export const updateBudgetItemSchema = createBudgetItemSchema.partial().extend({
  manualOverrideMinor: nullableMinor,
  manualOverrideReason: z
    .string()
    .trim()
    .min(2)
    .max(1000)
    .nullable()
    .optional(),
});
export const createExpenseSchema = z.object({
  budgetItemId: uuid,
  description: z.string().trim().min(2).max(1000),
  amountMinor: minor,
  expenseDate: z.string().date(),
  status: z.enum(["PLANNED", "INCURRED", "PAID", "CANCELLED", "REFUNDED"]),
  paymentMethodLabel: z.string().trim().max(120).nullable().optional(),
  reference: z.string().trim().max(180).nullable().optional(),
  notesPrivate: z.string().trim().max(5000).nullable().optional(),
});
export const updateExpenseSchema = createExpenseSchema.partial();
export const createPaymentScheduleSchema = z.object({
  budgetItemId: uuid,
  bookingId: uuid.nullable().optional(),
  contractId: uuid.nullable().optional(),
  vendorOrganizationId: uuid.nullable().optional(),
  name: z.string().trim().min(2).max(180),
  amountMinor: minor,
  currency: currency.optional(),
  dueAt: isoDateTime,
  sequence: z.number().int().positive(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const updatePaymentScheduleSchema =
  createPaymentScheduleSchema.partial();
export const createPaymentSchema = z.object({
  paymentScheduleEntryId: uuid.nullable().optional(),
  budgetItemId: uuid,
  bookingId: uuid.nullable().optional(),
  contractId: uuid.nullable().optional(),
  vendorOrganizationId: uuid.nullable().optional(),
  amountMinor: minor.refine(
    (value) => value > 0,
    "Suma trebuie să fie pozitivă.",
  ),
  currency: currency.optional(),
  paidAt: isoDateTime,
  method: z.enum(["BANK_TRANSFER", "CARD_EXTERNAL", "CASH", "CHECK", "OTHER"]),
  reference: z.string().trim().max(180).nullable().optional(),
  notesPrivate: z.string().trim().max(5000).nullable().optional(),
});
export const updatePaymentSchema = createPaymentSchema.partial();
export const paymentTransitionSchema = z.object({
  transition: z.enum(["CONFIRM", "REVERSE", "REFUND", "DISPUTE", "RESOLVE"]),
  reason: z.string().trim().min(2).max(2000),
  amountMinor: minor
    .refine((value) => value > 0, "Suma trebuie să fie pozitivă.")
    .optional(),
});
export const commercialExportSchema = z.object({
  type: z.enum(["budget", "payment_schedule", "booking", "offer_comparison"]),
  format: z.enum(["csv", "xlsx"]),
  resourceId: uuid.nullable().optional(),
});

export type OfferLineInput = z.infer<typeof offerLineItemSchema>;
export function calculateOfferTotals(input: {
  lineItems: OfferLineInput[];
  discountMinor?: number;
  taxRateBasisPoints?: number;
}) {
  const subtotalMinor = input.lineItems.reduce((sum, line) => {
    const total =
      line.optional && !line.selected
        ? 0
        : checkedMultiply(line.quantity, line.unitPriceMinor);
    return checkedAdd(sum, total);
  }, 0);
  const discountMinor = Math.min(input.discountMinor ?? 0, subtotalMinor);
  const taxableBaseMinor = subtotalMinor - discountMinor;
  const taxMinor = Math.round(
    checkedMultiply(taxableBaseMinor, input.taxRateBasisPoints ?? 0) / 10_000,
  );
  return {
    subtotalMinor,
    discountMinor,
    taxableBaseMinor,
    taxMinor,
    totalMinor: checkedAdd(taxableBaseMinor, taxMinor),
  };
}

export function calculateBudgetSummary(input: {
  targetTotalMinor: number;
  categories: Array<{ allocatedMinor: number; deleted?: boolean }>;
  items: Array<{
    status: string;
    estimatedMinor: number;
    quotedMinor?: number | null;
    committedMinor?: number | null;
    paidMinor: number;
    deleted?: boolean;
  }>;
}) {
  const categories = input.categories.filter((item) => !item.deleted);
  const items = input.items.filter(
    (item) => !item.deleted && item.status !== "CANCELLED",
  );
  const allocatedMinor = checkedSum(
    categories.map((item) => item.allocatedMinor),
  );
  const estimatedMinor = checkedSum(items.map((item) => item.estimatedMinor));
  const quotedMinor = checkedSum(items.map((item) => item.quotedMinor ?? 0));
  const committedMinor = checkedSum(
    items.map((item) => item.committedMinor ?? 0),
  );
  const paidMinor = checkedSum(items.map((item) => item.paidMinor));
  const outstandingMinor = Math.max(committedMinor - paidMinor, 0);
  const remainingMinor = input.targetTotalMinor - committedMinor;
  const forecastMinor = checkedAdd(
    committedMinor,
    checkedSum(
      items
        .filter((item) => !(item.committedMinor && item.committedMinor > 0))
        .map((item) => item.estimatedMinor),
    ),
  );
  return {
    targetTotalMinor: input.targetTotalMinor,
    allocatedMinor,
    estimatedMinor,
    quotedMinor,
    committedMinor,
    paidMinor,
    outstandingMinor,
    remainingMinor,
    forecastMinor,
    overBudget: committedMinor > input.targetTotalMinor,
    overAllocated: allocatedMinor > input.targetTotalMinor,
  };
}

function checkedSum(values: number[]) {
  return values.reduce(checkedAdd, 0);
}
function checkedAdd(left: number, right: number) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new RangeError("MONEY_OVERFLOW");
  return value;
}
function checkedMultiply(left: number, right: number) {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError("MONEY_OVERFLOW");
  return value;
}
