import { z } from "zod";
import {
  createBudgetCategorySchema,
  createBudgetItemSchema,
  createExpenseSchema,
  createRfqSchema,
  createShortlistSchema,
  updateBudgetCategorySchema,
  updateBudgetItemSchema,
  updateBudgetPlanSchema,
  updateExpenseSchema,
  updateRfqSchema,
} from "./commercial";
import {
  createAccommodationPropertySchema,
  createAccommodationStaySchema,
  createSeatingPlanSchema,
  createSeatingTableSchema,
  createTransportPlanSchema,
  createTransportStopSchema,
  seatingAssignmentBatchSchema,
  updateAccommodationPropertySchema,
  updateAccommodationStaySchema,
  updateSeatingPlanSchema,
  updateSeatingTableSchema,
  updateTransportPlanSchema,
  updateTransportStopSchema,
} from "./operations";
import {
  createCalendarEventSchema,
  createTaskSchema,
  updateCalendarEventSchema,
  updateTaskSchema,
} from "./planning";
import {
  createGuestSchema,
  createHouseholdSchema,
  createMenuSchema,
  createCampaignSchema,
  invitationSyncPathSchema,
  updateCampaignSchema,
  updateGuestSchema,
  updateHouseholdSchema,
  updateMenuSchema,
} from "./slice3";
import {
  createWeddingDayAnnouncementSchema,
  createWeddingDayIncidentSchema,
  updateWeddingDayAnnouncementSchema,
} from "./event-day";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const target = z.object({ targetId: uuid, targetVersion: version });

export const copilotProposalActionTypes = [
  "CREATE_TASK",
  "UPDATE_TASK",
  "CREATE_CALENDAR_EVENT",
  "UPDATE_CALENDAR_EVENT",
  "CREATE_RISK",
  "UPDATE_RISK",
  "CREATE_CONTINGENCY_PLAN",
  "UPSERT_BUDGET_PLAN",
  "CREATE_BUDGET_CATEGORY",
  "UPDATE_BUDGET_CATEGORY",
  "CREATE_BUDGET_ITEM",
  "UPDATE_BUDGET_ITEM",
  "CREATE_EXPENSE",
  "UPDATE_EXPENSE",
  "CREATE_HOUSEHOLD",
  "UPDATE_HOUSEHOLD",
  "CREATE_GUEST",
  "UPDATE_GUEST",
  "CREATE_MENU",
  "UPDATE_MENU",
  "CREATE_SEATING_PLAN",
  "UPDATE_SEATING_PLAN",
  "CREATE_SEATING_TABLE",
  "UPDATE_SEATING_TABLE",
  "REPLACE_SEATING_ASSIGNMENTS",
  "CREATE_VENDOR_SHORTLIST",
  "ADD_VENDOR_TO_SHORTLIST",
  "FAVORITE_VENDOR",
  "SYNC_INVITATION_DATA",
  "CREATE_TRANSPORT_PLAN",
  "UPDATE_TRANSPORT_PLAN",
  "CREATE_TRANSPORT_STOP",
  "UPDATE_TRANSPORT_STOP",
  "CREATE_ACCOMMODATION_PROPERTY",
  "UPDATE_ACCOMMODATION_PROPERTY",
  "CREATE_ACCOMMODATION_STAY",
  "UPDATE_ACCOMMODATION_STAY",
  "CREATE_RFQ",
  "UPDATE_RFQ",
  "CREATE_CAMPAIGN_DRAFT",
  "UPDATE_CAMPAIGN_DRAFT",
  "CREATE_WEDDING_DAY_INCIDENT",
  "CREATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT",
  "UPDATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT",
] as const;

export const copilotProposalActionTypeSchema = z.enum(
  copilotProposalActionTypes,
);
export type CopilotProposalActionType = z.infer<
  typeof copilotProposalActionTypeSchema
>;

const riskCategory = z.enum([
  "SCHEDULE",
  "VENDOR",
  "BUDGET",
  "GUEST",
  "LOGISTICS",
  "WEATHER",
  "SAFETY",
  "OTHER",
]);

const createRiskPayload = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).optional(),
  category: riskCategory,
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  ownerMembershipId: uuid.optional(),
  dueAt: z.string().datetime().optional(),
});

const updateRiskPayload = target.and(
  createRiskPayload.partial().refine((input) => Object.keys(input).length > 0),
);

const createContingencyPlanPayload = z.object({
  riskId: uuid.optional(),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(4000).optional(),
  triggers: z
    .array(
      z.object({
        type: z.enum([
          "MANUAL",
          "DATE_REACHED",
          "RISK_LEVEL_REACHED",
          "TASK_OVERDUE",
        ]),
        configuration: z.record(z.unknown()).default({}),
      }),
    )
    .max(20)
    .default([]),
  actions: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(180),
        description: z.string().trim().max(2000).optional(),
        position: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(100),
});

export const copilotActionPayloadSchemas = {
  CREATE_TASK: createTaskSchema,
  UPDATE_TASK: target.and(updateTaskSchema),
  CREATE_CALENDAR_EVENT: createCalendarEventSchema,
  UPDATE_CALENDAR_EVENT: target.and(updateCalendarEventSchema),
  CREATE_RISK: createRiskPayload,
  UPDATE_RISK: updateRiskPayload,
  CREATE_CONTINGENCY_PLAN: createContingencyPlanPayload,
  UPSERT_BUDGET_PLAN: updateBudgetPlanSchema.extend({
    targetVersion: version.nullable().optional(),
  }),
  CREATE_BUDGET_CATEGORY: createBudgetCategorySchema,
  UPDATE_BUDGET_CATEGORY: target.and(updateBudgetCategorySchema),
  CREATE_BUDGET_ITEM: createBudgetItemSchema,
  UPDATE_BUDGET_ITEM: target.and(updateBudgetItemSchema),
  CREATE_EXPENSE: createExpenseSchema,
  UPDATE_EXPENSE: target.and(updateExpenseSchema),
  CREATE_HOUSEHOLD: createHouseholdSchema,
  UPDATE_HOUSEHOLD: target.and(updateHouseholdSchema),
  CREATE_GUEST: createGuestSchema,
  UPDATE_GUEST: target.and(updateGuestSchema),
  CREATE_MENU: createMenuSchema,
  UPDATE_MENU: target.and(updateMenuSchema),
  CREATE_SEATING_PLAN: createSeatingPlanSchema,
  UPDATE_SEATING_PLAN: target.and(updateSeatingPlanSchema),
  CREATE_SEATING_TABLE: z
    .object({ planId: uuid })
    .and(createSeatingTableSchema),
  UPDATE_SEATING_TABLE: z
    .object({ planId: uuid })
    .and(target)
    .and(updateSeatingTableSchema),
  REPLACE_SEATING_ASSIGNMENTS: z
    .object({ planId: uuid, targetVersion: version })
    .and(seatingAssignmentBatchSchema),
  CREATE_VENDOR_SHORTLIST: createShortlistSchema,
  ADD_VENDOR_TO_SHORTLIST: z.object({
    shortlistId: uuid,
    vendorOrganizationId: uuid,
  }),
  FAVORITE_VENDOR: z.object({ vendorOrganizationId: uuid }),
  SYNC_INVITATION_DATA: z.object({
    targetVersion: version,
    paths: z.array(invitationSyncPathSchema).min(1).max(7),
  }),
  CREATE_TRANSPORT_PLAN: createTransportPlanSchema,
  UPDATE_TRANSPORT_PLAN: target.and(updateTransportPlanSchema),
  CREATE_TRANSPORT_STOP: createTransportStopSchema,
  UPDATE_TRANSPORT_STOP: target.and(updateTransportStopSchema),
  CREATE_ACCOMMODATION_PROPERTY: createAccommodationPropertySchema,
  UPDATE_ACCOMMODATION_PROPERTY: target.and(updateAccommodationPropertySchema),
  CREATE_ACCOMMODATION_STAY: createAccommodationStaySchema,
  UPDATE_ACCOMMODATION_STAY: target.and(updateAccommodationStaySchema),
  CREATE_RFQ: createRfqSchema,
  UPDATE_RFQ: target.and(updateRfqSchema),
  CREATE_CAMPAIGN_DRAFT: createCampaignSchema,
  UPDATE_CAMPAIGN_DRAFT: target.and(updateCampaignSchema),
  CREATE_WEDDING_DAY_INCIDENT: z
    .object({ planId: uuid })
    .and(createWeddingDayIncidentSchema),
  CREATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT: z
    .object({ planId: uuid })
    .and(createWeddingDayAnnouncementSchema),
  UPDATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT: target.and(
    updateWeddingDayAnnouncementSchema,
  ),
} as const satisfies Record<CopilotProposalActionType, z.ZodTypeAny>;

export function parseCopilotActionPayload(
  actionType: CopilotProposalActionType,
  payload: unknown,
) {
  return copilotActionPayloadSchemas[actionType].parse(payload) as Record<
    string,
    unknown
  >;
}

export function validateCopilotActionPayload(
  actionType: CopilotProposalActionType,
  payload: unknown,
) {
  return copilotActionPayloadSchemas[actionType].safeParse(payload);
}
