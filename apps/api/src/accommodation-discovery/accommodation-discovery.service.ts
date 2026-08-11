import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  AccommodationDiscoveryItem,
  AccommodationDiscoveryQuery,
  AccommodationDiscoveryResponse,
  AccommodationFacility,
  AccommodationRecommendationResource,
  AccommodationRecommendationsQuery,
  CreateAccommodationRecommendation,
  OrderAccommodationRecommendations,
  UpdateAccommodationRecommendation,
} from "@weddingos/contracts";
import {
  accommodationDiscoveryItemSchema,
  accommodationPriceSnapshotSchema,
  accommodationRecommendationResourceSchema,
} from "@weddingos/contracts";
import { Prisma } from "@weddingos/database";
import { z } from "zod";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { SafeOutboundHttpClient } from "../common/safe-outbound-http.client";

type Transaction = Prisma.TransactionClient;
type RecommendationStatus = "PUBLISHED" | "ARCHIVED";
type Center = AccommodationDiscoveryResponse["center"];

const ATTRIBUTION = {
  text: "© OpenStreetMap contributors" as const,
  url: "https://www.openstreetmap.org/copyright" as const,
};
const RESULT_LIMIT = 80 as const;
const PROVIDER_CACHE_LIMIT = 500;
const DEFAULT_DISCOVERY_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_GEOCODING_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_DISCOVERY_STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const NOMINATIM_LOCK_ID = 1_839_602_411;
const inFlightGeocoding = new Map<string, Promise<Center>>();

const nominatimResponseSchema = z.array(
  z.object({
    lat: z.string(),
    lon: z.string(),
    display_name: z.string().max(1000),
  }),
);

const osmElementSchema = z.object({
  type: z.enum(["node", "way", "relation"]),
  id: z.number().int().nonnegative(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  timestamp: z.string().datetime().optional(),
  tags: z.record(z.string()).optional(),
});

const overpassResponseSchema = z.object({
  elements: z.array(osmElementSchema).max(5000),
});

const providerDiscoverySnapshotSchema = z.object({
  items: z.array(accommodationDiscoveryItemSchema).max(PROVIDER_CACHE_LIMIT),
  center: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    label: z.string().max(500).nullable(),
    source: z.enum(["event", "coordinates", "geocoded"]),
  }),
  radiusKm: z.number().min(2).max(20),
  fetchedAt: z.string().datetime(),
  warnings: z.array(z.string().max(500)),
});
type ProviderDiscoverySnapshot = z.infer<
  typeof providerDiscoverySnapshotSchema
>;
type ProviderSnapshotResult = {
  snapshot: ProviderDiscoverySnapshot;
  cache: "miss" | "stale";
  status: "available" | "degraded" | "unavailable";
};
const inFlightDiscovery = new Map<string, Promise<ProviderSnapshotResult>>();

@Injectable()
export class AccommodationDiscoveryService {
  private readonly overpassEndpoint = endpoint(
    "ACCOMMODATION_OVERPASS_URL",
    "https://overpass-api.de/api/interpreter",
  );
  private readonly nominatimEndpoint = endpoint(
    "ACCOMMODATION_NOMINATIM_URL",
    "https://nominatim.openstreetmap.org/search",
  );
  private readonly discoveryTtlMs = duration(
    "ACCOMMODATION_DISCOVERY_TTL_SECONDS",
    DEFAULT_DISCOVERY_TTL_MS,
  );
  private readonly geocodingTtlMs = duration(
    "ACCOMMODATION_GEOCODING_TTL_SECONDS",
    DEFAULT_GEOCODING_TTL_MS,
  );
  private readonly discoveryStaleMaxMs = duration(
    "ACCOMMODATION_DISCOVERY_STALE_MAX_SECONDS",
    DEFAULT_DISCOVERY_STALE_MAX_MS,
  );

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SafeOutboundHttpClient)
    private readonly http: SafeOutboundHttpClient,
  ) {}

  async discover(
    userId: string,
    workspaceId: string,
    query: AccommodationDiscoveryQuery,
  ): Promise<AccommodationDiscoveryResponse> {
    const center = await this.resolveCenter(userId, workspaceId, query);
    const cacheRequest = normalizedDiscoveryRequest(center, query);
    const cacheKey = hash(cacheRequest);
    const cached = await this.readCache(
      userId,
      workspaceId,
      "DISCOVERY",
      cacheKey,
      false,
    );
    if (cached) {
      return filterDiscovery(
        providerDiscoverySnapshotSchema.parse(cached.response),
        query,
        "hit",
        "available",
      );
    }

    const flightKey = `${workspaceId}:${cacheKey}`;
    const existing = inFlightDiscovery.get(flightKey);
    if (existing) {
      const result = await existing;
      return filterDiscovery(
        result.snapshot,
        query,
        result.cache,
        result.status,
      );
    }
    const flight = this.fetchProviderSnapshot(
      userId,
      workspaceId,
      cacheKey,
      cacheRequest,
      center,
      query.radiusKm,
    ).finally(() => inFlightDiscovery.delete(flightKey));
    inFlightDiscovery.set(flightKey, flight);
    const result = await flight;
    return filterDiscovery(result.snapshot, query, result.cache, result.status);
  }

  async recommendations(
    userId: string,
    workspaceId: string,
    query: AccommodationRecommendationsQuery,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.accommodationRecommendation.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            ...(query.eventId ? { weddingEventId: query.eventId } : {}),
            ...(query.status
              ? { status: query.status.toUpperCase() as never }
              : {}),
          },
          orderBy: [
            { weddingEventId: "asc" },
            { position: "asc" },
            { createdAt: "asc" },
          ],
        })
      ).map(recommendationResource),
    }));
  }

  async createRecommendation(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateAccommodationRecommendation,
    correlationId: string,
  ): Promise<AccommodationRecommendationResource> {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const operation = "accommodation.recommendation.create";
        const prior = await replay(
          tx,
          userId,
          workspaceId,
          operation,
          idempotencyKey,
          input,
        );
        if (prior) return recommendationFromReplay(prior);
        const event = await requireEvent(tx, workspaceId, input.weddingEventId);
        if (input.externalId) {
          const duplicate = await tx.accommodationRecommendation.findFirst({
            where: {
              workspaceId,
              weddingEventId: input.weddingEventId,
              source: input.source.toUpperCase() as never,
              externalId: input.externalId,
              deletedAt: null,
            },
          });
          if (duplicate) {
            problem(
              "VERSION_CONFLICT",
              HttpStatus.CONFLICT,
              "Recomandarea există deja",
              "Această cazare este deja în lista evenimentului.",
            );
          }
        }
        const distanceKm = distanceFromEvent(
          event,
          input.latitude,
          input.longitude,
        );
        let row: Prisma.AccommodationRecommendationGetPayload<
          Record<string, never>
        >;
        try {
          row = await tx.accommodationRecommendation.create({
            data: {
              workspaceId,
              weddingEventId: input.weddingEventId,
              source: input.source.toUpperCase() as never,
              externalId: input.externalId ?? null,
              sourceUrl: input.sourceUrl ?? null,
              sourceUpdatedAt: input.sourceUpdatedAt
                ? new Date(input.sourceUpdatedAt)
                : null,
              fetchedAt: input.fetchedAt
                ? new Date(input.fetchedAt)
                : new Date(),
              attribution:
                input.attribution ??
                (input.source === "osm" ? ATTRIBUTION.text : null),
              name: input.name,
              type: input.type.toUpperCase() as never,
              address: input.address ?? null,
              city: input.city ?? null,
              country: input.country,
              latitude: input.latitude ?? null,
              longitude: input.longitude ?? null,
              distanceKm,
              bookingUrl: input.bookingUrl ?? null,
              contactUrl: input.contactUrl ?? null,
              contactPhone: input.contactPhone ?? null,
              facilities: input.facilities as Prisma.InputJsonValue,
              priceSnapshot: input.priceSnapshot
                ? (input.priceSnapshot as Prisma.InputJsonValue)
                : undefined,
              organizerNote: input.organizerNote ?? null,
              groupCode: input.groupCode ?? null,
              deadline: input.deadline ? new Date(input.deadline) : null,
              position: input.position,
              createdById: userId,
              updatedById: userId,
            },
          });
        } catch (error) {
          if (isUniqueConstraint(error)) {
            problem(
              "VERSION_CONFLICT",
              HttpStatus.CONFLICT,
              "Recomandarea există deja",
              "Această cazare este deja în lista evenimentului.",
            );
          }
          throw error;
        }
        const response = recommendationResource(row);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          operation,
          idempotencyKey,
          input,
          response,
        );
        await audit(tx, {
          action: "accommodation.recommendation.created",
          userId,
          workspaceId,
          entityId: row.id,
          correlationId,
          metadata: { source: input.source, eventId: input.weddingEventId },
        });
        return response;
      },
    );
  }

  async updateRecommendation(
    userId: string,
    workspaceId: string,
    recommendationId: string,
    expectedVersion: number,
    input: UpdateAccommodationRecommendation,
    correlationId: string,
  ): Promise<AccommodationRecommendationResource> {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await requireRecommendation(
          tx,
          workspaceId,
          recommendationId,
        );
        assertVersion(current.version, expectedVersion);
        const latitude =
          input.latitude === undefined
            ? decimalNumber(current.latitude)
            : input.latitude;
        const longitude =
          input.longitude === undefined
            ? decimalNumber(current.longitude)
            : input.longitude;
        if ((latitude == null) !== (longitude == null)) {
          validation("Coordonatele trebuie completate sau golite împreună.");
        }
        const event = await requireEvent(
          tx,
          workspaceId,
          current.weddingEventId,
        );
        const row = await tx.accommodationRecommendation.update({
          where: { id: current.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.type !== undefined
              ? { type: input.type.toUpperCase() as never }
              : {}),
            ...(input.address !== undefined ? { address: input.address } : {}),
            ...(input.city !== undefined ? { city: input.city } : {}),
            ...(input.country !== undefined ? { country: input.country } : {}),
            ...(input.latitude !== undefined
              ? { latitude: input.latitude }
              : {}),
            ...(input.longitude !== undefined
              ? { longitude: input.longitude }
              : {}),
            ...(input.latitude !== undefined || input.longitude !== undefined
              ? { distanceKm: distanceFromEvent(event, latitude, longitude) }
              : {}),
            ...(input.sourceUrl !== undefined
              ? { sourceUrl: input.sourceUrl }
              : {}),
            ...(input.sourceUpdatedAt !== undefined
              ? {
                  sourceUpdatedAt: input.sourceUpdatedAt
                    ? new Date(input.sourceUpdatedAt)
                    : null,
                }
              : {}),
            ...(input.fetchedAt !== undefined
              ? { fetchedAt: new Date(input.fetchedAt) }
              : {}),
            ...(input.attribution !== undefined
              ? { attribution: input.attribution }
              : {}),
            ...(input.bookingUrl !== undefined
              ? { bookingUrl: input.bookingUrl }
              : {}),
            ...(input.contactUrl !== undefined
              ? { contactUrl: input.contactUrl }
              : {}),
            ...(input.contactPhone !== undefined
              ? { contactPhone: input.contactPhone }
              : {}),
            ...(input.facilities !== undefined
              ? { facilities: input.facilities as Prisma.InputJsonValue }
              : {}),
            ...(input.priceSnapshot !== undefined
              ? {
                  priceSnapshot: input.priceSnapshot
                    ? (input.priceSnapshot as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
                }
              : {}),
            ...(input.organizerNote !== undefined
              ? { organizerNote: input.organizerNote }
              : {}),
            ...(input.groupCode !== undefined
              ? { groupCode: input.groupCode }
              : {}),
            ...(input.deadline !== undefined
              ? { deadline: input.deadline ? new Date(input.deadline) : null }
              : {}),
            ...(input.position !== undefined
              ? { position: input.position }
              : {}),
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        await audit(tx, {
          action: "accommodation.recommendation.updated",
          userId,
          workspaceId,
          entityId: row.id,
          correlationId,
          metadata: { version: row.version },
        });
        return recommendationResource(row);
      },
    );
  }

  async orderRecommendations(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: OrderAccommodationRecommendations,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const operation = "accommodation.recommendation.order";
        const prior = await replay(
          tx,
          userId,
          workspaceId,
          operation,
          idempotencyKey,
          input,
        );
        if (prior) {
          return z
            .object({
              items: z.array(accommodationRecommendationResourceSchema),
            })
            .parse(prior);
        }
        const rows = await tx.accommodationRecommendation.findMany({
          where: {
            workspaceId,
            id: { in: input.items.map((item) => item.id) },
            deletedAt: null,
          },
        });
        const candidateEventId = rows[0]?.weddingEventId;
        const activeCount = await tx.accommodationRecommendation.count({
          where: {
            workspaceId,
            ...(candidateEventId ? { weddingEventId: candidateEventId } : {}),
            deletedAt: null,
          },
        });
        const weddingEventId = validateRecommendationOrderSet(
          rows,
          input.items,
          activeCount,
        );
        const updated = [];
        for (const item of input.items) {
          updated.push(
            await tx.accommodationRecommendation.update({
              where: { id: item.id },
              data: {
                position: item.position,
                updatedById: userId,
                version: { increment: 1 },
              },
            }),
          );
        }
        const response = {
          items: updated
            .sort((left, right) => left.position - right.position)
            .map(recommendationResource),
        };
        await saveReplay(
          tx,
          userId,
          workspaceId,
          operation,
          idempotencyKey,
          input,
          response,
        );
        await audit(tx, {
          action: "accommodation.recommendation.ordered",
          userId,
          workspaceId,
          entityId: rows[0].id,
          correlationId,
          metadata: { eventId: weddingEventId, count: rows.length },
        });
        return response;
      },
    );
  }

  async deleteRecommendation(
    userId: string,
    workspaceId: string,
    recommendationId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await requireRecommendation(
          tx,
          workspaceId,
          recommendationId,
        );
        assertVersion(current.version, expectedVersion);
        const row = await tx.accommodationRecommendation.update({
          where: { id: current.id },
          data: {
            status: "ARCHIVED",
            archivedAt: new Date(),
            deletedAt: new Date(),
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        await audit(tx, {
          action: "accommodation.recommendation.deleted",
          userId,
          workspaceId,
          entityId: row.id,
          correlationId,
          metadata: { version: row.version },
        });
        return { deleted: true, id: row.id, version: row.version };
      },
    );
  }

  async transitionRecommendation(
    userId: string,
    workspaceId: string,
    recommendationId: string,
    target: RecommendationStatus,
    expectedVersion: number,
    idempotencyKey: string,
    input: { reason?: string | null },
    correlationId: string,
  ): Promise<AccommodationRecommendationResource> {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const operation = `accommodation.recommendation.${target.toLowerCase()}`;
        const request = { recommendationId, target, expectedVersion, ...input };
        const prior = await replay(
          tx,
          userId,
          workspaceId,
          operation,
          idempotencyKey,
          request,
        );
        if (prior) return recommendationFromReplay(prior);
        const current = await requireRecommendation(
          tx,
          workspaceId,
          recommendationId,
        );
        assertVersion(current.version, expectedVersion);
        if (target === "PUBLISHED") {
          const event = await requireEvent(
            tx,
            workspaceId,
            current.weddingEventId,
          );
          assertRecommendationPublishable(event, current.deadline);
        }
        const now = new Date();
        const row = await tx.accommodationRecommendation.update({
          where: { id: current.id },
          data: {
            status: target,
            publishedAt: target === "PUBLISHED" ? now : current.publishedAt,
            archivedAt: target === "ARCHIVED" ? now : null,
            updatedById: userId,
            version: { increment: 1 },
          },
        });
        const response = recommendationResource(row);
        await saveReplay(
          tx,
          userId,
          workspaceId,
          operation,
          idempotencyKey,
          request,
          response,
        );
        await audit(tx, {
          action: `accommodation.recommendation.${target.toLowerCase()}`,
          userId,
          workspaceId,
          entityId: row.id,
          correlationId,
          metadata: { version: row.version, reason: input.reason ?? null },
        });
        return response;
      },
    );
  }

  private async resolveCenter(
    userId: string,
    workspaceId: string,
    query: AccommodationDiscoveryQuery,
  ): Promise<Center> {
    const event = query.eventId
      ? await this.database.withContext({ userId, workspaceId }, (tx) =>
          requireEvent(tx, workspaceId, query.eventId!),
        )
      : null;
    if (query.lat !== undefined && query.lng !== undefined) {
      return {
        latitude: query.lat,
        longitude: query.lng,
        label:
          query.query ?? event?.locationAddress ?? event?.locationName ?? null,
        source: "coordinates",
      };
    }
    if (query.query) {
      return this.geocode(userId, workspaceId, query.query);
    }
    if (event?.latitude != null && event.longitude != null) {
      return {
        latitude: Number(event.latitude),
        longitude: Number(event.longitude),
        label: event.locationAddress ?? event.locationName ?? event.title,
        source: "event",
      };
    }
    const eventQuery = [event?.locationAddress, event?.locationName]
      .filter(Boolean)
      .join(", ");
    if (eventQuery) return this.geocode(userId, workspaceId, eventQuery);
    validation(
      "Evenimentul nu are o locație utilizabilă. Alege o zonă sau trimite coordonatele.",
    );
  }

  private async geocode(
    userId: string,
    workspaceId: string,
    rawQuery: string,
  ): Promise<Center> {
    const normalizedQuery = normalizeText(rawQuery);
    const cacheKey = hash({ query: normalizedQuery });
    const cached = await this.readCache(
      userId,
      workspaceId,
      "GEOCODING",
      cacheKey,
      false,
    );
    if (cached) return geocodingCenter(cached.response);
    const flightKey = `${workspaceId}:${cacheKey}`;
    const existing = inFlightGeocoding.get(flightKey);
    if (existing) return existing;
    const flight = this.fetchGeocoding(
      userId,
      workspaceId,
      cacheKey,
      normalizedQuery,
    ).finally(() => inFlightGeocoding.delete(flightKey));
    inFlightGeocoding.set(flightKey, flight);
    return flight;
  }

  private async fetchGeocoding(
    userId: string,
    workspaceId: string,
    cacheKey: string,
    normalizedQuery: string,
  ): Promise<Center> {
    await this.reserveNominatimSlot(userId, workspaceId);
    const cached = await this.readCache(
      userId,
      workspaceId,
      "GEOCODING",
      cacheKey,
      false,
    );
    if (cached) return geocodingCenter(cached.response);
    try {
      const url = new URL(this.nominatimEndpoint);
      url.searchParams.set("q", normalizedQuery);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("accept-language", "ro");
      const raw = await this.http.json(
        url,
        {
          headers: {
            accept: "application/json",
            "user-agent": userAgent(),
          },
        },
        outboundOptions(url, 4_000, 300_000),
      );
      const match = nominatimResponseSchema.parse(raw)[0];
      if (!match) {
        problem(
          "NOT_FOUND",
          HttpStatus.NOT_FOUND,
          "Zona nu a fost găsită",
          "Încearcă o localitate, o adresă sau coordonate mai precise.",
        );
      }
      const latitude = Number(match.lat);
      const longitude = Number(match.lon);
      if (!validCoordinates(latitude, longitude)) {
        throw new Error("NOMINATIM_INVALID_COORDINATES");
      }
      const center: Center = {
        latitude,
        longitude,
        label: match.display_name.slice(0, 500),
        source: "geocoded",
      };
      await this.writeCache(
        userId,
        workspaceId,
        "GEOCODING",
        cacheKey,
        { query: normalizedQuery },
        center,
        this.geocodingTtlMs,
      );
      return center;
    } catch (error) {
      if (isProblem(error)) throw error;
      problem(
        "EXTERNAL_DATA_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Locația nu poate fi identificată momentan",
        "Serviciul OpenStreetMap pentru identificarea zonei nu a răspuns. Încearcă din nou sau folosește coordonate explicite.",
      );
    }
  }

  private async reserveNominatimSlot(userId: string, workspaceId: string) {
    let acquired = false;
    try {
      acquired = await this.database.withContext(
        { userId, workspaceId },
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<Array<{ acquired: boolean }>>(
            `SELECT pg_try_advisory_xact_lock(${NOMINATIM_LOCK_ID}) AS acquired`,
          );
          if (!rows[0]?.acquired) return false;
          await tx.$executeRawUnsafe("SELECT pg_sleep(1.05)");
          return true;
        },
      );
    } catch {
      problem(
        "EXTERNAL_DATA_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
        "Geocodarea nu este disponibilă",
        "Încearcă din nou peste câteva secunde sau folosește coordonate explicite.",
      );
    }
    if (!acquired) {
      problem(
        "RATE_LIMITED",
        HttpStatus.TOO_MANY_REQUESTS,
        "Geocodarea este ocupată",
        "Încearcă din nou peste o secundă sau folosește coordonate explicite.",
      );
    }
  }

  private async fetchProviderSnapshot(
    userId: string,
    workspaceId: string,
    cacheKey: string,
    cacheRequest: Record<string, unknown>,
    center: Center,
    radiusKm: number,
  ): Promise<ProviderSnapshotResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const overpassQuery = buildOverpassQuery(center, radiusKm);
      const url = new URL(this.overpassEndpoint);
      const raw = await this.http.json(
        url,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
            "user-agent": userAgent(),
          },
          body: new URLSearchParams({ data: overpassQuery }).toString(),
        },
        outboundOptions(url, 7_000, 2_000_000),
      );
      const parsed = overpassResponseSchema.parse(raw);
      let omitted = 0;
      const mapped: AccommodationDiscoveryItem[] = [];
      for (const element of parsed.elements) {
        const item = mapOsmElement(element, center, fetchedAt);
        if (!item) {
          omitted += 1;
          continue;
        }
        mapped.push(item);
      }
      const items = mapped
        .sort(
          (left, right) =>
            left.distanceKm - right.distanceKm ||
            left.name.localeCompare(right.name, "ro"),
        )
        .slice(0, PROVIDER_CACHE_LIMIT);
      const warnings: string[] = [];
      if (mapped.length > PROVIDER_CACHE_LIMIT) {
        warnings.push(
          `Catalogul local a fost limitat la primele ${PROVIDER_CACHE_LIMIT} de listări, ordonate după distanță.`,
        );
      }
      if (omitted) {
        warnings.push(
          `${omitted} listări fără nume sau coordonate publice au fost omise.`,
        );
      }
      const snapshot: ProviderDiscoverySnapshot = {
        items,
        center,
        radiusKm,
        fetchedAt,
        warnings,
      };
      await this.writeCache(
        userId,
        workspaceId,
        "DISCOVERY",
        cacheKey,
        cacheRequest,
        snapshot,
        this.discoveryTtlMs,
      );
      return { snapshot, cache: "miss", status: "available" };
    } catch {
      const stale = await this.readCache(
        userId,
        workspaceId,
        "DISCOVERY",
        cacheKey,
        true,
      );
      if (
        stale &&
        stale.fetchedAt > new Date(Date.now() - this.discoveryStaleMaxMs)
      ) {
        const snapshot = providerDiscoverySnapshotSchema.parse(stale.response);
        snapshot.warnings.push(
          "Sursa OpenStreetMap nu răspunde momentan; sunt afișate ultimele rezultate salvate.",
        );
        return { snapshot, cache: "stale", status: "degraded" };
      }
      return {
        cache: "miss",
        status: "unavailable",
        snapshot: {
          items: [],
          center,
          radiusKm,
          fetchedAt,
          warnings: [
            "Sursa OpenStreetMap nu răspunde momentan. Nu au fost inventate sau completate rezultate.",
          ],
        },
      };
    }
  }

  private async readCache(
    userId: string,
    workspaceId: string,
    kind: "GEOCODING" | "DISCOVERY",
    cacheKey: string,
    allowExpired: boolean,
  ) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      tx.accommodationDiscoveryCache.findFirst({
        where: {
          workspaceId,
          kind,
          cacheKey,
          ...(allowExpired ? {} : { expiresAt: { gt: new Date() } }),
        },
      }),
    );
  }

  private async writeCache(
    userId: string,
    workspaceId: string,
    kind: "GEOCODING" | "DISCOVERY",
    cacheKey: string,
    request: unknown,
    response: unknown,
    ttlMs: number,
  ) {
    const now = new Date();
    await this.database.withContext({ userId, workspaceId }, async (tx) => {
      await tx.accommodationDiscoveryCache.deleteMany({
        where: {
          workspaceId,
          expiresAt: {
            lt: new Date(now.valueOf() - this.discoveryStaleMaxMs),
          },
        },
      });
      return tx.accommodationDiscoveryCache.upsert({
        where: {
          workspaceId_kind_cacheKey: { workspaceId, kind, cacheKey },
        },
        create: {
          workspaceId,
          kind,
          cacheKey,
          request: request as Prisma.InputJsonValue,
          response: response as Prisma.InputJsonValue,
          attribution: ATTRIBUTION.text,
          fetchedAt: now,
          expiresAt: new Date(now.valueOf() + ttlMs),
        },
        update: {
          request: request as Prisma.InputJsonValue,
          response: response as Prisma.InputJsonValue,
          attribution: ATTRIBUTION.text,
          fetchedAt: now,
          expiresAt: new Date(now.valueOf() + ttlMs),
          version: { increment: 1 },
        },
      });
    });
  }
}

export function buildOverpassQuery(center: Center, radiusKm: number) {
  const radiusMeters = Math.round(radiusKm * 1000);
  return `[out:json][timeout:8];(nwr["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet)$"](around:${radiusMeters},${center.latitude.toFixed(7)},${center.longitude.toFixed(7)}););out center tags meta;`;
}

export function mapOsmElement(
  element: z.infer<typeof osmElementSchema>,
  center: Center,
  fetchedAt: string,
): AccommodationDiscoveryItem | null {
  const tags = element.tags ?? {};
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  const name = tags.name ?? tags.brand ?? tags.operator;
  if (!name || latitude === undefined || longitude === undefined) return null;
  if (!validCoordinates(latitude, longitude)) return null;
  const tourism = normalizeOsmType(tags.tourism);
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  return {
    id: `osm:${element.type}:${element.id}`,
    source: "osm",
    externalId: `${element.type}/${element.id}`,
    sourceUrl,
    name: name.slice(0, 180),
    type: tourism,
    address: osmAddress(tags),
    city: nullableTag(tags["addr:city"] ?? tags["addr:town"]),
    country: nullableTag(tags["addr:country"]),
    latitude,
    longitude,
    distanceKm: haversineDistanceKm(
      center.latitude,
      center.longitude,
      latitude,
      longitude,
    ),
    bookingUrl: publicUrl(
      tags["contact:booking"] ?? tags.booking ?? tags.reservation,
    ),
    contactUrl: publicUrl(tags["contact:website"] ?? tags.website),
    contactPhone: publicPhone(tags["contact:phone"] ?? tags.phone),
    facilities: osmFacilities(tags),
    priceSnapshot: null,
    sourceUpdatedAt: element.timestamp ?? null,
    fetchedAt,
  };
}

export function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Number(
    (2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)))).toFixed(3),
  );
}

export function validateRecommendationOrderSet(
  rows: Array<{ id: string; weddingEventId: string; version: number }>,
  items: Array<{ id: string; version: number; position: number }>,
  activeCount: number,
) {
  if (rows.length !== items.length) {
    problem(
      "NOT_FOUND",
      HttpStatus.NOT_FOUND,
      "Una dintre recomandări nu există",
    );
  }
  const eventIds = new Set(rows.map((row) => row.weddingEventId));
  if (eventIds.size !== 1) {
    validation(
      "Ordinea poate fi actualizată numai pentru un singur eveniment.",
    );
  }
  if (activeCount !== rows.length) {
    validation(
      "Trimite lista completă de recomandări a evenimentului pentru o reordonare sigură.",
    );
  }
  for (const item of items) {
    const row = rows.find((candidate) => candidate.id === item.id);
    if (!row) {
      problem(
        "NOT_FOUND",
        HttpStatus.NOT_FOUND,
        "Una dintre recomandări nu există",
      );
    }
    assertVersion(row.version, item.version);
  }
  return rows[0].weddingEventId;
}

export function assertRecommendationPublishable(
  event: { guestVisible: boolean; status: string },
  deadline: Date | null,
  now = new Date(),
) {
  if (!event.guestVisible || event.status !== "CONFIRMED") {
    validation(
      "Recomandarea poate fi publicată numai pentru un eveniment confirmat și vizibil invitaților.",
    );
  }
  if (deadline && deadline <= now) {
    validation(
      "Termenul recomandării este în trecut. Actualizează-l înainte de publicare.",
    );
  }
}

function normalizedDiscoveryRequest(
  center: Center,
  query: AccommodationDiscoveryQuery,
) {
  return {
    latitude: Number(center.latitude.toFixed(5)),
    longitude: Number(center.longitude.toFixed(5)),
    radiusKm: query.radiusKm,
    schemaVersion: 1,
  };
}

function budgetMetadata(query: AccommodationDiscoveryQuery) {
  return query.budgetMaxMinor === undefined
    ? null
    : {
        maxMinor: query.budgetMaxMinor,
        currency: query.currency,
        unknownPriceIncluded: true as const,
      };
}

function normalizeOsmType(value: string | undefined) {
  const result = [
    "hotel",
    "guest_house",
    "hostel",
    "motel",
    "apartment",
    "chalet",
  ].includes(value ?? "")
    ? value
    : "other";
  return result as AccommodationDiscoveryItem["type"];
}

function osmFacilities(tags: Record<string, string>) {
  const facilities = new Set<AccommodationFacility>();
  if (positive(tags.parking) || positive(tags["parking:fee"]))
    facilities.add("parking");
  if (["yes", "wlan", "wifi"].includes(tags.internet_access ?? ""))
    facilities.add("wifi");
  if (positive(tags.breakfast) || tags.breakfast === "included")
    facilities.add("breakfast");
  if (positive(tags.restaurant) || tags.amenity === "restaurant")
    facilities.add("restaurant");
  if (["yes", "limited"].includes(tags.wheelchair ?? ""))
    facilities.add("accessible");
  if (positive(tags.air_conditioning)) facilities.add("air_conditioning");
  if (positive(tags.dog) || positive(tags.pets)) facilities.add("pets_allowed");
  if (positive(tags.family_rooms)) facilities.add("family_rooms");
  if (
    tags.opening_hours === "24/7" ||
    tags["reception:opening_hours"] === "24/7"
  )
    facilities.add("late_check_in");
  if (positive(tags.shuttle) || positive(tags.shuttle_bus))
    facilities.add("shuttle");
  return [...facilities].sort();
}

function osmAddress(tags: Record<string, string>) {
  const street = [tags["addr:street"], tags["addr:housenumber"]]
    .filter(Boolean)
    .join(" ");
  const parts = [street, tags["addr:postcode"]].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 500) : null;
}

function positive(value: string | undefined) {
  return ["yes", "designated", "customers", "included", "free"].includes(
    value ?? "",
  );
}

function publicUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function nullableTag(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function publicPhone(value: string | undefined) {
  if (!value) return null;
  const phone = value.trim().slice(0, 80);
  return /^[0-9+().\-;/\s]{3,80}$/.test(phone) ? phone : null;
}

function filterDiscovery(
  snapshot: ProviderDiscoverySnapshot,
  query: AccommodationDiscoveryQuery,
  cache: "hit" | "miss" | "stale",
  status: "available" | "degraded" | "unavailable",
): AccommodationDiscoveryResponse {
  let unknownPriceCount = 0;
  const filtered = snapshot.items.filter((item) => {
    if (query.types.length && !query.types.includes(item.type)) return false;
    if (
      query.facilities.length &&
      !query.facilities.every((facility) => item.facilities.includes(facility))
    ) {
      return false;
    }
    if (query.budgetMaxMinor === undefined) return true;
    if (!item.priceSnapshot || item.priceSnapshot.currency !== query.currency) {
      unknownPriceCount += 1;
      return true;
    }
    return item.priceSnapshot.amountMinor <= query.budgetMaxMinor;
  });
  const warnings = [...snapshot.warnings];
  if (filtered.length > RESULT_LIMIT) {
    warnings.push(
      `Sunt afișate primele ${RESULT_LIMIT} de rezultate, ordonate după distanță.`,
    );
  }
  if (query.budgetMaxMinor !== undefined && unknownPriceCount) {
    warnings.push(
      `${unknownPriceCount} opțiuni fără preț public comparabil au rămas în rezultate și trebuie verificate direct la proprietate.`,
    );
  }
  return {
    items: filtered.slice(0, RESULT_LIMIT),
    center: snapshot.center,
    radiusKm: snapshot.radiusKm,
    metadata: {
      provider: "openstreetmap",
      attribution: ATTRIBUTION,
      fetchedAt: snapshot.fetchedAt,
      cache,
      status,
      resultLimit: RESULT_LIMIT,
      budget: budgetMetadata(query),
      warnings,
    },
  };
}

function geocodingCenter(value: unknown) {
  return z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      label: z.string().max(500).nullable(),
      source: z.literal("geocoded"),
    })
    .parse(value);
}

function recommendationResource(row: {
  id: string;
  workspaceId: string;
  weddingEventId: string;
  source: string;
  externalId: string | null;
  sourceUrl: string | null;
  sourceUpdatedAt: Date | null;
  fetchedAt: Date;
  attribution: string | null;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  distanceKm: Prisma.Decimal | null;
  bookingUrl: string | null;
  contactUrl: string | null;
  contactPhone: string | null;
  facilities: Prisma.JsonValue;
  priceSnapshot: Prisma.JsonValue | null;
  organizerNote: string | null;
  groupCode: string | null;
  deadline: Date | null;
  status: string;
  position: number;
  publishedAt: Date | null;
  archivedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): AccommodationRecommendationResource {
  return accommodationRecommendationResourceSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    weddingEventId: row.weddingEventId,
    source: row.source.toLowerCase(),
    provenance: {
      externalId: row.externalId,
      sourceUrl: row.sourceUrl,
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      fetchedAt: row.fetchedAt.toISOString(),
      attribution: row.attribution,
    },
    name: row.name,
    type: row.type.toLowerCase(),
    address: row.address,
    city: row.city,
    country: row.country,
    latitude: decimalNumber(row.latitude),
    longitude: decimalNumber(row.longitude),
    distanceKm: decimalNumber(row.distanceKm),
    bookingUrl: row.bookingUrl,
    contactUrl: row.contactUrl,
    contactPhone: row.contactPhone,
    facilities: row.facilities,
    priceSnapshot: row.priceSnapshot
      ? accommodationPriceSnapshotSchema.parse(row.priceSnapshot)
      : null,
    organizerNote: row.organizerNote,
    groupCode: row.groupCode,
    deadline: row.deadline?.toISOString() ?? null,
    status: row.status.toLowerCase(),
    position: row.position,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function recommendationFromReplay(value: Prisma.JsonValue) {
  return accommodationRecommendationResourceSchema.parse(value);
}

async function requireEvent(
  tx: Transaction,
  workspaceId: string,
  eventId: string,
) {
  const event = await tx.weddingEvent.findFirst({
    where: { id: eventId, workspaceId, deletedAt: null },
  });
  if (!event) {
    problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Evenimentul nu există");
  }
  return event;
}

async function requireRecommendation(
  tx: Transaction,
  workspaceId: string,
  recommendationId: string,
) {
  const recommendation = await tx.accommodationRecommendation.findFirst({
    where: { id: recommendationId, workspaceId, deletedAt: null },
  });
  if (!recommendation) {
    problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Recomandarea nu există");
  }
  return recommendation;
}

function distanceFromEvent(
  event: { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  if (
    event.latitude == null ||
    event.longitude == null ||
    latitude == null ||
    longitude == null
  ) {
    return null;
  }
  return haversineDistanceKm(
    Number(event.latitude),
    Number(event.longitude),
    latitude,
    longitude,
  );
}

async function replay(
  tx: Transaction,
  userId: string,
  workspaceId: string,
  operation: string,
  key: string,
  request: unknown,
) {
  const row = await tx.idempotencyRecord.findUnique({
    where: {
      actorUserId_operation_key: { actorUserId: userId, operation, key },
    },
  });
  if (!row) return null;
  if (row.workspaceId !== workspaceId || row.requestHash !== hash(request)) {
    problem(
      "IDEMPOTENCY_CONFLICT",
      HttpStatus.CONFLICT,
      "Idempotency-Key a fost refolosit",
      "Folosește o cheie nouă pentru o cerere diferită.",
    );
  }
  return row.responseBody;
}

async function saveReplay(
  tx: Transaction,
  userId: string,
  workspaceId: string,
  operation: string,
  key: string,
  request: unknown,
  response: unknown,
) {
  await tx.idempotencyRecord.create({
    data: {
      workspaceId,
      actorUserId: userId,
      operation,
      key,
      requestHash: hash(request),
      responseStatus: 200,
      responseBody: response as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

async function audit(
  tx: Transaction,
  input: {
    action: string;
    userId: string;
    workspaceId: string;
    entityId: string;
    correlationId: string;
    metadata: Prisma.InputJsonObject;
  },
) {
  await tx.auditEvent.create({
    data: {
      action: input.action,
      actorUserId: input.userId,
      workspaceId: input.workspaceId,
      entityType: "AccommodationRecommendation",
      entityId: input.entityId,
      correlationId: input.correlationId,
      metadata: input.metadata,
    },
  });
}

function assertVersion(actual: number, expected: number) {
  if (actual !== expected) {
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Versiunea s-a schimbat",
      "Reîncarcă recomandarea și încearcă din nou.",
      undefined,
      { latestVersion: actual },
    );
  }
}

function validation(detail: string): never {
  problem(
    "VALIDATION_FAILED",
    HttpStatus.UNPROCESSABLE_ENTITY,
    "Cererea nu poate fi aplicată",
    detail,
  );
}

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ro-RO");
}

function validCoordinates(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function decimalNumber(value: Prisma.Decimal | null | undefined) {
  return value == null ? null : Number(value);
}

function endpoint(environmentKey: string, fallback: string) {
  const value = process.env[environmentKey] ?? fallback;
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    )
  ) {
    throw new Error(`${environmentKey} must use HTTPS`);
  }
  return url.toString();
}

function duration(environmentKey: string, fallbackMs: number) {
  const seconds = Number(process.env[environmentKey]);
  return Number.isFinite(seconds) && seconds >= 60
    ? Math.round(seconds * 1000)
    : fallbackMs;
}

function outboundOptions(
  url: URL,
  timeoutMs: number,
  maxResponseBytes: number,
) {
  return {
    allowedHostnames: [url.hostname],
    allowHttp:
      url.protocol === "http:" && process.env.NODE_ENV !== "production",
    allowPrivateDevelopmentHosts:
      process.env.NODE_ENV !== "production"
        ? ["localhost", "127.0.0.1", "::1"]
        : [],
    maxRedirects: 0,
    timeoutMs,
    maxResponseBytes,
  };
}

function userAgent() {
  return "Sarbato accommodation discovery/1.0 (+https://sarbato.space)";
}

function isProblem(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function isUniqueConstraint(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
