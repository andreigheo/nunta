import { z } from "zod";

const uuid = z.string().uuid();
const httpUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "URL-ul trebuie să folosească HTTP sau HTTPS.");
const nullableUrl = httpUrl.nullable();
const nullablePhone = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[0-9+().\-;/\s]+$/)
  .nullable();
const nullableDateTime = z.string().datetime().nullable();

export const accommodationDiscoverySourceSchema = z.enum([
  "osm",
  "organizer",
  "other",
]);
export type AccommodationDiscoverySource = z.infer<
  typeof accommodationDiscoverySourceSchema
>;

export const accommodationDiscoveryTypeSchema = z.enum([
  "hotel",
  "guest_house",
  "hostel",
  "motel",
  "apartment",
  "chalet",
  "other",
]);
export type AccommodationDiscoveryType = z.infer<
  typeof accommodationDiscoveryTypeSchema
>;

export const accommodationFacilitySchema = z.enum([
  "parking",
  "wifi",
  "breakfast",
  "restaurant",
  "accessible",
  "air_conditioning",
  "pets_allowed",
  "family_rooms",
  "late_check_in",
  "shuttle",
]);
export type AccommodationFacility = z.infer<typeof accommodationFacilitySchema>;

export const accommodationPriceSnapshotSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  unit: z.enum(["per_night", "total_stay"]),
  observedAt: z.string().datetime(),
  note: z.string().trim().max(240).nullable(),
});
export type AccommodationPriceSnapshot = z.infer<
  typeof accommodationPriceSnapshotSchema
>;

export const accommodationDiscoveryItemSchema = z.object({
  id: z.string().min(1).max(200),
  source: accommodationDiscoverySourceSchema,
  externalId: z.string().max(180).nullable(),
  sourceUrl: nullableUrl,
  name: z.string().trim().min(1).max(180),
  type: accommodationDiscoveryTypeSchema,
  address: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  country: z.string().trim().max(120).nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  distanceKm: z.number().nonnegative(),
  bookingUrl: nullableUrl,
  contactUrl: nullableUrl,
  contactPhone: nullablePhone,
  facilities: z.array(accommodationFacilitySchema).max(20),
  priceSnapshot: accommodationPriceSnapshotSchema.nullable(),
  sourceUpdatedAt: nullableDateTime,
  fetchedAt: z.string().datetime(),
});
export type AccommodationDiscoveryItem = z.infer<
  typeof accommodationDiscoveryItemSchema
>;

const stringList = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : value,
    z.array(item).max(20),
  );

export const accommodationDiscoveryQuerySchema = z
  .object({
    eventId: uuid.optional(),
    query: z.string().trim().min(2).max(240).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(2).max(20).default(10),
    types: stringList(accommodationDiscoveryTypeSchema).default([]),
    facilities: stringList(accommodationFacilitySchema).default([]),
    budgetMaxMinor: z.coerce.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("RON"),
  })
  .superRefine((value, context) => {
    if ((value.lat === undefined) !== (value.lng === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: value.lat === undefined ? ["lat"] : ["lng"],
        message: "lat și lng trebuie trimise împreună.",
      });
    }
    if (!value.eventId && !value.query && value.lat === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["query"],
        message: "Trimite eventId, query sau coordonatele lat/lng.",
      });
    }
  });
export type AccommodationDiscoveryQuery = z.output<
  typeof accommodationDiscoveryQuerySchema
>;

export const accommodationDiscoveryResponseSchema = z.object({
  items: z.array(accommodationDiscoveryItemSchema).max(80),
  center: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(500).nullable(),
    source: z.enum(["event", "coordinates", "geocoded"]),
  }),
  radiusKm: z.number().min(2).max(20),
  metadata: z.object({
    provider: z.literal("openstreetmap"),
    attribution: z.object({
      text: z.literal("© OpenStreetMap contributors"),
      url: z.literal("https://www.openstreetmap.org/copyright"),
    }),
    fetchedAt: z.string().datetime(),
    cache: z.enum(["hit", "miss", "stale"]),
    status: z.enum(["available", "degraded", "unavailable"]),
    resultLimit: z.literal(80),
    budget: z
      .object({
        maxMinor: z.number().int().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/),
        unknownPriceIncluded: z.literal(true),
      })
      .nullable(),
    warnings: z.array(z.string().max(500)),
  }),
});
export type AccommodationDiscoveryResponse = z.infer<
  typeof accommodationDiscoveryResponseSchema
>;

export const accommodationRecommendationStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);
export type AccommodationRecommendationStatus = z.infer<
  typeof accommodationRecommendationStatusSchema
>;

export const accommodationRecommendationResourceSchema = z.object({
  id: uuid,
  workspaceId: uuid,
  weddingEventId: uuid,
  source: accommodationDiscoverySourceSchema,
  provenance: z.object({
    externalId: z.string().max(180).nullable(),
    sourceUrl: nullableUrl,
    sourceUpdatedAt: nullableDateTime,
    fetchedAt: z.string().datetime(),
    attribution: z.string().max(240).nullable(),
  }),
  name: z.string().trim().min(1).max(180),
  type: accommodationDiscoveryTypeSchema,
  address: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  country: z.string().trim().max(120).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  distanceKm: z.number().nonnegative().nullable(),
  bookingUrl: nullableUrl,
  contactUrl: nullableUrl,
  contactPhone: nullablePhone,
  facilities: z.array(accommodationFacilitySchema).max(20),
  priceSnapshot: accommodationPriceSnapshotSchema.nullable(),
  organizerNote: z.string().trim().max(2000).nullable(),
  groupCode: z.string().trim().max(120).nullable(),
  deadline: nullableDateTime,
  status: accommodationRecommendationStatusSchema,
  position: z.number().int().nonnegative(),
  publishedAt: nullableDateTime,
  archivedAt: nullableDateTime,
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AccommodationRecommendationResource = z.infer<
  typeof accommodationRecommendationResourceSchema
>;

export const guestAccommodationRecommendationSchema = z.object({
  id: uuid,
  weddingEventId: uuid,
  source: accommodationDiscoverySourceSchema,
  provenance: z.object({
    sourceUpdatedAt: nullableDateTime,
    fetchedAt: z.string().datetime(),
    attribution: z.string().max(240).nullable(),
  }),
  name: z.string().trim().min(1).max(180),
  type: accommodationDiscoveryTypeSchema,
  address: z.string().trim().max(500).nullable(),
  city: z.string().trim().max(120).nullable(),
  country: z.string().trim().max(120).nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  distanceKm: z.number().nonnegative().nullable(),
  bookingUrl: nullableUrl,
  contactUrl: nullableUrl,
  contactPhone: nullablePhone,
  facilities: z.array(accommodationFacilitySchema).max(20),
  priceSnapshot: accommodationPriceSnapshotSchema.nullable(),
  organizerNote: z.string().trim().max(2000).nullable(),
  groupCode: z.string().trim().max(120).nullable(),
  deadline: nullableDateTime,
  position: z.number().int().nonnegative(),
});
export type GuestAccommodationRecommendationResource = z.infer<
  typeof guestAccommodationRecommendationSchema
>;

export const accommodationRecommendationsQuerySchema = z.object({
  eventId: uuid.optional(),
  status: accommodationRecommendationStatusSchema.optional(),
});
export type AccommodationRecommendationsQuery = z.output<
  typeof accommodationRecommendationsQuerySchema
>;

const recommendationFields = z.object({
  weddingEventId: uuid,
  source: accommodationDiscoverySourceSchema,
  externalId: z.string().trim().max(180).nullable().optional(),
  sourceUrl: nullableUrl.optional(),
  name: z.string().trim().min(1).max(180),
  type: accommodationDiscoveryTypeSchema,
  address: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  country: z.string().trim().min(1).max(120).nullable().default(null),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  bookingUrl: nullableUrl.optional(),
  contactUrl: nullableUrl.optional(),
  contactPhone: nullablePhone.optional(),
  facilities: z.array(accommodationFacilitySchema).max(20).default([]),
  priceSnapshot: accommodationPriceSnapshotSchema.nullable().optional(),
  sourceUpdatedAt: nullableDateTime.optional(),
  fetchedAt: z.string().datetime().optional(),
  attribution: z.string().trim().max(240).nullable().optional(),
  organizerNote: z.string().trim().max(2000).nullable().optional(),
  groupCode: z.string().trim().max(120).nullable().optional(),
  deadline: nullableDateTime.optional(),
  position: z.number().int().nonnegative().default(0),
});

export const createAccommodationRecommendationSchema =
  recommendationFields.superRefine((value, context) => {
    if ((value.latitude == null) !== (value.longitude == null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: value.latitude == null ? ["latitude"] : ["longitude"],
        message: "latitude și longitude trebuie trimise împreună.",
      });
    }
    if (value.source === "osm" && !value.externalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["externalId"],
        message: "externalId este obligatoriu pentru sursa OSM.",
      });
    }
  });
export type CreateAccommodationRecommendation = z.output<
  typeof createAccommodationRecommendationSchema
>;

export const updateAccommodationRecommendationSchema = recommendationFields
  .omit({ source: true, externalId: true, weddingEventId: true })
  .partial()
  .superRefine((value, context) => {
    if ((value.latitude === null) !== (value.longitude === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: value.latitude === null ? ["latitude"] : ["longitude"],
        message: "latitude și longitude trebuie golite împreună.",
      });
    }
  });
export type UpdateAccommodationRecommendation = z.output<
  typeof updateAccommodationRecommendationSchema
>;

export const accommodationRecommendationTransitionSchema = z.object({
  reason: z.string().trim().min(3).max(1000).nullable().optional(),
});
export type AccommodationRecommendationTransition = z.output<
  typeof accommodationRecommendationTransitionSchema
>;

export const orderAccommodationRecommendationsSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: uuid,
          version: z.number().int().positive(),
          position: z.number().int().nonnegative(),
        }),
      )
      .min(1)
      .max(500),
  })
  .superRefine((value, context) => {
    const ids = value.items.map((item) => item.id);
    const positions = value.items.map((item) => item.position);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Fiecare recomandare poate apărea o singură dată.",
      });
    }
    if (new Set(positions).size !== positions.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "Fiecare poziție trebuie să fie unică.",
      });
    }
  });
export type OrderAccommodationRecommendations = z.output<
  typeof orderAccommodationRecommendationsSchema
>;
