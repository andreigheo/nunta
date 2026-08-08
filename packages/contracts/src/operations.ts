import { z } from "zod";

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(180);
const optionalText = z.string().trim().max(2000).nullable().optional();
const positive = z.number().int().positive();

export const createVenueSpaceSchema = z.object({
  weddingEventId: uuid,
  name: shortText,
  description: optionalText,
  locationName: z.string().trim().max(240).nullable().optional(),
  widthUnits: z.number().positive(),
  heightUnits: z.number().positive(),
  unit: z.enum(["meters", "centimeters", "arbitrary_grid"]),
  capacity: positive.nullable().optional(),
  backgroundImageUrl: z.string().url().max(2048).nullable().optional(),
});
export const updateVenueSpaceSchema = createVenueSpaceSchema.partial().extend({
  status: z.enum(["draft", "active", "archived"]).optional(),
});

export const createSeatingPlanSchema = z.object({
  weddingEventId: uuid,
  venueSpaceId: uuid,
  name: shortText,
});
export const updateSeatingPlanSchema = z.object({
  name: shortText.optional(),
  venueSpaceId: uuid.optional(),
  status: z.enum(["draft", "ready", "archived"]).optional(),
});

export const createSeatingTableSchema = z.object({
  name: shortText,
  label: z.string().trim().min(1).max(80),
  shape: z.enum(["round", "rectangle", "oval", "square", "custom"]),
  capacity: positive,
  minimumCapacity: z.number().int().min(0).nullable().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(-360).max(360).default(0),
  position: z.number().int().min(0).default(0),
  zone: z.string().trim().max(100).nullable().optional(),
  notesPrivate: z.string().trim().max(2000).nullable().optional(),
  locked: z.boolean().default(false),
  seats: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        position: z.number().int().min(0),
        x: z.number().nullable().optional(),
        y: z.number().nullable().optional(),
        rotation: z.number().nullable().optional(),
        accessible: z.boolean().default(false),
        status: z
          .enum(["available", "blocked", "reserved"])
          .default("available"),
      }),
    )
    .max(100)
    .optional(),
});
export const updateSeatingTableSchema = createSeatingTableSchema
  .omit({ seats: true })
  .partial();
export const updateSeatingSeatSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  rotation: z.number().nullable().optional(),
  accessible: z.boolean().optional(),
  status: z.enum(["available", "blocked", "reserved"]).optional(),
});

export const seatingAssignmentBatchSchema = z.object({
  assignments: z
    .array(
      z.object({
        guestId: uuid,
        tableId: uuid,
        seatId: uuid.nullable().optional(),
        source: z.enum(["manual", "suggestion", "import"]).default("manual"),
        locked: z.boolean().default(false),
        overrideReason: z
          .string()
          .trim()
          .min(3)
          .max(1000)
          .nullable()
          .optional(),
      }),
    )
    .max(500),
  removeAssignmentIds: z.array(uuid).max(500).default([]),
  confirmWarnings: z.boolean().default(false),
  reason: z.string().trim().min(3).max(1000).nullable().optional(),
});

export const seatingConstraintSchema = z.object({
  type: z.enum([
    "keep_together",
    "keep_apart",
    "prefer_together",
    "prefer_apart",
    "must_be_at_table",
    "must_not_be_at_table",
    "accessible_seat_required",
    "near_exit",
    "near_stage",
    "custom",
  ]),
  guestId: uuid.nullable().optional(),
  householdId: uuid.nullable().optional(),
  relatedGuestId: uuid.nullable().optional(),
  tableId: uuid.nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  required: z.boolean().default(false),
  reason: z.string().trim().max(1000).nullable().optional(),
});
export const seatingSuggestionRequestSchema = z.object({
  preserveManualAssignments: z.boolean().default(true),
});
export const seatingSuggestionApplySchema = z.object({
  confirmConflicts: z.boolean().default(false),
  replaceUnlockedAssignments: z.boolean().default(true),
});
export const seatingExportSchema = z.object({
  format: z.enum(["csv", "svg"]),
  kind: z.enum([
    "table_list",
    "guest_by_table",
    "table_cards",
    "visual_plan",
    "catering_summary",
  ]),
  includeSensitive: z.boolean().default(false),
});

export const issueResolutionSchema = z.object({
  status: z.enum(["acknowledged", "resolved", "ignored_with_reason"]),
  reason: z.string().trim().min(3).max(1000),
});

export const updateTransportRequestSchema = z.object({
  requested: z.boolean().optional(),
  pickupArea: z.string().trim().max(180).nullable().optional(),
  pickupAddress: z.string().trim().max(500).nullable().optional(),
  specialRequirements: z.string().trim().max(1000).nullable().optional(),
  status: z
    .enum(["requested", "confirmed", "declined", "cancelled"])
    .optional(),
  overrideReason: z.string().trim().min(3).max(1000),
});
export const createTransportPlanSchema = z.object({
  weddingEventId: uuid,
  name: shortText,
});
export const updateTransportPlanSchema = z.object({
  name: shortText.optional(),
  status: z.enum(["draft", "ready", "completed", "archived"]).optional(),
});
export const createTransportVehicleSchema = z.object({
  name: shortText,
  vehicleType: z.enum(["bus", "minibus", "van", "car", "shuttle", "other"]),
  capacity: positive,
  accessibleCapacity: z.number().int().min(0).default(0),
  registrationLabel: z.string().trim().max(80).nullable().optional(),
  driverName: z.string().trim().max(180).nullable().optional(),
  driverPhone: z.string().trim().max(64).nullable().optional(),
  notesPrivate: z.string().trim().max(2000).nullable().optional(),
});
export const updateTransportVehicleSchema = createTransportVehicleSchema
  .partial()
  .extend({
    status: z.enum(["active", "inactive", "archived"]).optional(),
  });
export const createTransportStopSchema = z.object({
  name: shortText,
  address: z.string().trim().min(1).max(500),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  instructions: z.string().trim().max(1000).nullable().optional(),
  accessible: z.boolean().default(false),
});
export const updateTransportStopSchema = createTransportStopSchema.partial();
export const createTransportRouteSchema = z.object({
  vehicleId: uuid.nullable().optional(),
  name: shortText,
  direction: z.enum(["to_event", "from_event", "round_trip", "custom"]),
  departureAt: z.string().datetime(),
  arrivalAt: z.string().datetime().nullable().optional(),
  originName: z.string().trim().min(1).max(240),
  destinationName: z.string().trim().min(1).max(240),
  capacityOverride: positive.nullable().optional(),
  stops: z
    .array(
      z.object({
        stopId: uuid,
        position: z.number().int().min(0),
        plannedAt: z.string().datetime().nullable().optional(),
        pickupWindowStart: z.string().datetime().nullable().optional(),
        pickupWindowEnd: z.string().datetime().nullable().optional(),
      }),
    )
    .max(100)
    .default([]),
});
export const updateTransportRouteSchema = createTransportRouteSchema.partial();
export const transportAssignmentBatchSchema = z.object({
  assignments: z
    .array(
      z.object({
        routeId: uuid,
        guestId: uuid,
        requestId: uuid.nullable().optional(),
        pickupStopId: uuid.nullable().optional(),
        dropoffStopId: uuid.nullable().optional(),
        seatCount: positive.default(1),
        overrideReason: z
          .string()
          .trim()
          .min(3)
          .max(1000)
          .nullable()
          .optional(),
      }),
    )
    .max(500),
  removeAssignmentIds: z.array(uuid).max(500).default([]),
});
export const transportManifestSchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  includeSensitive: z.boolean().default(false),
});

export const updateAccommodationRequestSchema = z.object({
  requested: z.boolean().optional(),
  arrivalDate: z.string().date().nullable().optional(),
  departureDate: z.string().date().nullable().optional(),
  roomPreference: z.string().trim().max(500).nullable().optional(),
  accessibilityRequirements: z.string().trim().max(1000).nullable().optional(),
  status: z
    .enum(["requested", "confirmed", "declined", "cancelled"])
    .optional(),
  overrideReason: z.string().trim().min(3).max(1000),
});
export const createAccommodationPropertySchema = z.object({
  name: shortText,
  type: z.enum(["hotel", "pension", "apartment", "house", "hostel", "other"]),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  contactName: z.string().trim().max(180).nullable().optional(),
  contactPhone: z.string().trim().max(64).nullable().optional(),
  checkInTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  checkOutTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  instructions: z.string().trim().max(2000).nullable().optional(),
});
export const updateAccommodationPropertySchema =
  createAccommodationPropertySchema.partial().extend({
    status: z.enum(["draft", "active", "full", "archived"]).optional(),
  });
export const createAccommodationRoomSchema = z.object({
  roomTypeId: uuid.nullable().optional(),
  name: shortText,
  floor: z.string().trim().max(80).nullable().optional(),
  capacityAdults: z.number().int().min(0),
  capacityChildren: z.number().int().min(0),
  accessible: z.boolean().default(false),
  status: z
    .enum(["available", "held", "occupied", "unavailable"])
    .default("available"),
  notesPrivate: z.string().trim().max(2000).nullable().optional(),
});
export const updateAccommodationRoomSchema =
  createAccommodationRoomSchema.partial();
export const createAccommodationStaySchema = z.object({
  propertyId: uuid,
  name: shortText,
  checkInDate: z.string().date(),
  checkOutDate: z.string().date(),
});
export const updateAccommodationStaySchema = createAccommodationStaySchema
  .partial()
  .extend({
    status: z.enum(["draft", "ready", "completed", "archived"]).optional(),
  });
export const accommodationAllocationBatchSchema = z.object({
  allocations: z
    .array(
      z.object({
        roomId: uuid,
        guestId: uuid,
        householdId: uuid,
        requestId: uuid.nullable().optional(),
        checkInDate: z.string().date(),
        checkOutDate: z.string().date(),
        overrideReason: z
          .string()
          .trim()
          .min(3)
          .max(1000)
          .nullable()
          .optional(),
      }),
    )
    .max(500),
  removeAllocationIds: z.array(uuid).max(500).default([]),
  confirmHouseholdSplit: z.boolean().default(false),
  reason: z.string().trim().min(3).max(1000).nullable().optional(),
});
export const roomingListSchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  includeSensitive: z.boolean().default(false),
});

export type CreateVenueSpace = z.infer<typeof createVenueSpaceSchema>;
export type CreateSeatingPlan = z.infer<typeof createSeatingPlanSchema>;
export type SeatingAssignmentBatch = z.infer<
  typeof seatingAssignmentBatchSchema
>;
export type CreateTransportPlan = z.infer<typeof createTransportPlanSchema>;
export type TransportAssignmentBatch = z.infer<
  typeof transportAssignmentBatchSchema
>;
export type CreateAccommodationProperty = z.infer<
  typeof createAccommodationPropertySchema
>;
export type AccommodationAllocationBatch = z.infer<
  typeof accommodationAllocationBatchSchema
>;
