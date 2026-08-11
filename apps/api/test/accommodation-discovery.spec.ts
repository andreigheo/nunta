import { randomUUID } from "node:crypto";
import {
  accommodationDiscoveryQuerySchema,
  createAccommodationRecommendationSchema,
  guestAccommodationRecommendationSchema,
  guestCompanionBootstrapSchema,
  orderAccommodationRecommendationsSchema,
} from "@weddingos/contracts";
import { describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../src/common/database.service";
import { ProblemException } from "../src/common/problem";
import type { SafeOutboundHttpClient } from "../src/common/safe-outbound-http.client";
import {
  AccommodationDiscoveryService,
  assertRecommendationPublishable,
  buildOverpassQuery,
  haversineDistanceKm,
  mapOsmElement,
  validateRecommendationOrderSet,
} from "../src/accommodation-discovery/accommodation-discovery.service";

type CacheRow = {
  workspaceId: string;
  kind: "GEOCODING" | "DISCOVERY";
  cacheKey: string;
  response: unknown;
  fetchedAt: Date;
  expiresAt: Date;
};

function harness(httpJson = vi.fn()) {
  const cache = new Map<string, CacheRow>();
  const key = (workspaceId: string, kind: string, cacheKey: string) =>
    `${workspaceId}:${kind}:${cacheKey}`;
  const tx = {
    accommodationDiscoveryCache: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        const row = cache.get(
          key(
            String(where.workspaceId),
            String(where.kind),
            String(where.cacheKey),
          ),
        );
        if (!row) return null;
        if (where.expiresAt && row.expiresAt <= new Date()) return null;
        return row;
      }),
      upsert: vi.fn(({ create }: { create: Record<string, unknown> }) => {
        const row = create as unknown as CacheRow;
        cache.set(key(row.workspaceId, row.kind, row.cacheKey), row);
        return row;
      }),
      deleteMany: vi.fn(),
    },
    weddingEvent: { findFirst: vi.fn() },
    accommodationRecommendation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    idempotencyRecord: { findUnique: vi.fn() },
    $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ acquired: true }]),
  };
  const database = {
    withContext: vi.fn(
      (_context: unknown, operation: (transaction: typeof tx) => unknown) =>
        operation(tx),
    ),
  } as unknown as DatabaseService;
  const http = { json: httpJson } as unknown as SafeOutboundHttpClient;
  return {
    cache,
    tx,
    httpJson,
    service: new AccommodationDiscoveryService(database, http),
  };
}

function query(input: Record<string, unknown>) {
  return accommodationDiscoveryQuerySchema.parse(input);
}

function overpassElements() {
  return {
    elements: [
      {
        type: "node",
        id: 1,
        lat: 44.43,
        lon: 26.1,
        timestamp: "2026-08-11T10:00:00.000Z",
        tags: {
          tourism: "hotel",
          name: "Hotel Central",
          website: "https://hotel.example/",
          phone: "+40 700 000 001",
          parking: "yes",
        },
      },
      {
        type: "node",
        id: 2,
        lat: 44.44,
        lon: 26.11,
        tags: { tourism: "hostel", name: "Hostel Verde" },
      },
    ],
  };
}

describe("accommodation discovery contracts and provider mapping", () => {
  it("rejects unsafe or malformed recommendation URLs without throwing", () => {
    const base = {
      weddingEventId: randomUUID(),
      source: "organizer",
      name: "Pensiune",
      type: "guest_house",
    };
    expect(
      createAccommodationRecommendationSchema.safeParse({
        ...base,
        bookingUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      createAccommodationRecommendationSchema.safeParse({
        ...base,
        bookingUrl: "not a url",
      }).success,
    ).toBe(false);
  });

  it("maps only source-backed OSM fields and does not invent country or price", () => {
    const item = mapOsmElement(
      {
        type: "node",
        id: 42,
        lat: 44.43,
        lon: 26.1,
        tags: {
          tourism: "hotel",
          name: "Hotel Test",
          reservation: "yes",
          website: "https://hotel.example",
          "contact:phone": "+40 700 000 000",
          "addr:street": "Strada Florilor",
          "addr:housenumber": "10",
          "addr:city": "București",
        },
      },
      {
        latitude: 44.43,
        longitude: 26.1,
        label: "București",
        source: "coordinates",
      },
      "2026-08-11T10:00:00.000Z",
    );
    expect(item).toMatchObject({
      bookingUrl: null,
      contactUrl: "https://hotel.example/",
      contactPhone: "+40 700 000 000",
      address: "Strada Florilor 10",
      city: "București",
      country: null,
      priceSnapshot: null,
      distanceKm: 0,
    });
  });

  it("builds a bounded Overpass query and calculates useful distances", () => {
    const overpass = buildOverpassQuery(
      {
        latitude: 44.43,
        longitude: 26.1,
        label: null,
        source: "coordinates",
      },
      20,
    );
    expect(overpass).toContain("around:20000");
    expect(overpass).toContain(
      "hotel|guest_house|hostel|motel|apartment|chalet",
    );
    expect(haversineDistanceKm(44.43, 26.1, 44.44, 26.1)).toBeGreaterThan(1);
  });
});

describe("accommodation discovery cache and graceful degradation", () => {
  it("reuses one provider snapshot across type/facility/budget filters", async () => {
    const httpJson = vi.fn().mockResolvedValue(overpassElements());
    const { service } = harness(httpJson);
    const workspaceId = randomUUID();
    const first = await service.discover(
      randomUUID(),
      workspaceId,
      query({ lat: 44.43, lng: 26.1, radiusKm: 10, types: "hotel" }),
    );
    const second = await service.discover(
      randomUUID(),
      workspaceId,
      query({
        lat: 44.43,
        lng: 26.1,
        radiusKm: 10,
        facilities: "parking",
        budgetMaxMinor: 40_000,
        currency: "RON",
      }),
    );
    expect(httpJson).toHaveBeenCalledTimes(1);
    expect(first.items.map((item) => item.name)).toEqual(["Hotel Central"]);
    expect(second.items).toHaveLength(1);
    expect(second.metadata.cache).toBe("hit");
    expect(second.metadata.status).toBe("available");
    expect(second.metadata.warnings.join(" ")).toMatch(/fără preț public/i);
  });

  it("returns an explicit empty degraded result for malformed Overpass data", async () => {
    const { service } = harness(vi.fn().mockResolvedValue({ invalid: true }));
    const result = await service.discover(
      randomUUID(),
      randomUUID(),
      query({ lat: 44.43, lng: 26.1 }),
    );
    expect(result.items).toEqual([]);
    expect(result.metadata.status).toBe("unavailable");
    expect(result.metadata.warnings.join(" ")).toMatch(/nu răspunde/i);
  });

  it("uses an expired snapshot when Overpass times out", async () => {
    const workspaceId = randomUUID();
    const httpJson = vi.fn().mockResolvedValueOnce(overpassElements());
    const { service, cache } = harness(httpJson);
    await service.discover(
      randomUUID(),
      workspaceId,
      query({ lat: 44.43, lng: 26.1 }),
    );
    for (const row of cache.values()) row.expiresAt = new Date(0);
    httpJson.mockRejectedValueOnce(new Error("OUTBOUND_TIMEOUT"));
    const result = await service.discover(
      randomUUID(),
      workspaceId,
      query({ lat: 44.43, lng: 26.1 }),
    );
    expect(result.metadata.cache).toBe("stale");
    expect(result.metadata.status).toBe("degraded");
    expect(result.items).toHaveLength(2);
  });

  it("refuses a stale provider snapshot older than seven days", async () => {
    const workspaceId = randomUUID();
    const httpJson = vi.fn().mockResolvedValueOnce(overpassElements());
    const { service, cache } = harness(httpJson);
    await service.discover(
      randomUUID(),
      workspaceId,
      query({ lat: 44.43, lng: 26.1 }),
    );
    for (const row of cache.values()) {
      row.expiresAt = new Date(0);
      row.fetchedAt = new Date(0);
    }
    httpJson.mockRejectedValueOnce(new Error("OUTBOUND_TIMEOUT"));
    const result = await service.discover(
      randomUUID(),
      workspaceId,
      query({ lat: 44.43, lng: 26.1 }),
    );
    expect(result.items).toEqual([]);
    expect(result.metadata.status).toBe("unavailable");
  });

  it.each([
    [[], "NOT_FOUND"],
    [{ invalid: true }, "EXTERNAL_DATA_UNAVAILABLE"],
  ])("returns a clear geocoding problem for %j", async (payload, code) => {
    const { service } = harness(vi.fn().mockResolvedValue(payload));
    await expect(
      service.discover(
        randomUUID(),
        randomUUID(),
        query({ query: `Zona ${randomUUID()}` }),
      ),
    ).rejects.toMatchObject({ code });
  });

  it("converts a Nominatim transport failure into a provider problem", async () => {
    const { service } = harness(
      vi.fn().mockRejectedValue(new Error("HTTP 429")),
    );
    await expect(
      service.discover(
        randomUUID(),
        randomUUID(),
        query({ query: `Zona ${randomUUID()}` }),
      ),
    ).rejects.toMatchObject({ code: "EXTERNAL_DATA_UNAVAILABLE" });
  });
});

describe("accommodation recommendation integrity", () => {
  it("projects only least-data published recommendation fields to guests", () => {
    const publicRecommendation = guestAccommodationRecommendationSchema.parse({
      id: randomUUID(),
      workspaceId: randomUUID(),
      weddingEventId: randomUUID(),
      source: "osm",
      provenance: {
        externalId: "node/42",
        sourceUrl: "https://www.openstreetmap.org/node/42",
        sourceUpdatedAt: null,
        fetchedAt: "2026-08-11T10:00:00.000Z",
        attribution: "© OpenStreetMap contributors",
      },
      name: "Hotel Test",
      type: "hotel",
      address: null,
      city: null,
      country: null,
      latitude: null,
      longitude: null,
      distanceKm: null,
      bookingUrl: null,
      contactUrl: null,
      contactPhone: null,
      facilities: [],
      priceSnapshot: null,
      organizerNote: null,
      groupCode: null,
      deadline: null,
      status: "published",
      position: 0,
      version: 7,
      createdAt: "2026-08-11T10:00:00.000Z",
      updatedAt: "2026-08-11T10:00:00.000Z",
    });
    expect(publicRecommendation).not.toHaveProperty("workspaceId");
    expect(publicRecommendation).not.toHaveProperty("version");
    expect(publicRecommendation.provenance).not.toHaveProperty("externalId");
    expect(
      guestCompanionBootstrapSchema.shape.accommodationRecommendations.parse([
        publicRecommendation,
      ]),
    ).toHaveLength(1);
  });

  it("rejects publishing for hidden, draft or cancelled events", () => {
    expect(() =>
      assertRecommendationPublishable(
        { guestVisible: false, status: "CONFIRMED" },
        null,
      ),
    ).toThrow(ProblemException);
    expect(() =>
      assertRecommendationPublishable(
        { guestVisible: true, status: "DRAFT" },
        null,
      ),
    ).toThrow(ProblemException);
    expect(() =>
      assertRecommendationPublishable(
        { guestVisible: true, status: "CANCELLED" },
        null,
      ),
    ).toThrow(ProblemException);
    expect(() =>
      assertRecommendationPublishable(
        { guestVisible: true, status: "CONFIRMED" },
        null,
      ),
    ).not.toThrow();
  });

  it("rejects duplicate ids or positions in one atomic order request", () => {
    const id = randomUUID();
    expect(
      orderAccommodationRecommendationsSchema.safeParse({
        items: [
          { id, version: 1, position: 0 },
          { id, version: 1, position: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      orderAccommodationRecommendationsSchema.safeParse({
        items: [
          { id: randomUUID(), version: 1, position: 0 },
          { id: randomUUID(), version: 1, position: 0 },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates complete, single-event and current-version order sets", () => {
    const first = randomUUID();
    const second = randomUUID();
    const eventId = randomUUID();
    const rows = [
      { id: first, weddingEventId: eventId, version: 2 },
      { id: second, weddingEventId: eventId, version: 4 },
    ];
    const items = [
      { id: second, version: 4, position: 0 },
      { id: first, version: 2, position: 1 },
    ];
    expect(validateRecommendationOrderSet(rows, items, 2)).toBe(eventId);
    expect(() => validateRecommendationOrderSet(rows, items, 3)).toThrow(
      ProblemException,
    );
    expect(() =>
      validateRecommendationOrderSet(
        [rows[0], { ...rows[1], weddingEventId: randomUUID() }],
        items,
        2,
      ),
    ).toThrow(ProblemException);
    expect(() =>
      validateRecommendationOrderSet(
        rows,
        [items[0], { ...items[1], version: 1 }],
        2,
      ),
    ).toThrow(ProblemException);
  });

  it("translates a concurrent external-id uniqueness race into a conflict", async () => {
    const { service, tx } = harness();
    tx.weddingEvent.findFirst.mockResolvedValue({
      id: randomUUID(),
      latitude: null,
      longitude: null,
    });
    tx.accommodationRecommendation.findFirst.mockResolvedValue(null);
    tx.accommodationRecommendation.create.mockRejectedValue({ code: "P2002" });
    await expect(
      service.createRecommendation(
        randomUUID(),
        randomUUID(),
        "create-1",
        createAccommodationRecommendationSchema.parse({
          weddingEventId: randomUUID(),
          source: "osm",
          externalId: "node/42",
          name: "Hotel Test",
          type: "hotel",
        }),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
