import { describe, expect, it } from "vitest";
import type { AccommodationDiscoveryItem } from "@weddingos/contracts";
import {
  discoveryItemToRecommendation,
  formatDistance,
  safeExternalUrl,
  sortDiscoveryItems,
} from "./model";

const baseItem: AccommodationDiscoveryItem = {
  id: "osm:node:1",
  source: "osm",
  externalId: "node:1",
  sourceUrl: "https://www.openstreetmap.org/node/1",
  name: "Hotel verificabil",
  type: "hotel",
  address: null,
  city: "Brașov",
  country: "România",
  latitude: 45.65,
  longitude: 25.6,
  distanceKm: 3.2,
  bookingUrl: null,
  contactUrl: "https://hotel.example/contact",
  contactPhone: "+40 700 000 000",
  facilities: ["parking"],
  priceSnapshot: null,
  sourceUpdatedAt: null,
  fetchedAt: "2026-08-11T10:00:00.000Z",
};

describe("accommodation discovery model", () => {
  it("keeps unknown prices visible and places them after known prices when sorting by price", () => {
    const known: AccommodationDiscoveryItem = {
      ...baseItem,
      id: "osm:node:2",
      distanceKm: 7,
      priceSnapshot: {
        amountMinor: 42000,
        currency: "RON",
        unit: "per_night",
        observedAt: "2026-08-11T10:00:00.000Z",
        note: null,
      },
    };

    expect(sortDiscoveryItems([baseItem, known], "price").map((item) => item.id)).toEqual([
      "osm:node:2",
      "osm:node:1",
    ]);
  });

  it("sorts known prices only within a comparable unit chosen by the caller", () => {
    const nightly: AccommodationDiscoveryItem = {
      ...baseItem,
      id: "nightly",
      priceSnapshot: {
        amountMinor: 30000,
        currency: "RON",
        unit: "per_night",
        observedAt: "2026-08-11T10:00:00.000Z",
        note: null,
      },
    };
    const secondNightly: AccommodationDiscoveryItem = {
      ...baseItem,
      id: "second-nightly",
      priceSnapshot: {
        amountMinor: 25000,
        currency: "RON",
        unit: "per_night",
        observedAt: "2026-08-11T10:00:00.000Z",
        note: null,
      },
    };

    expect(sortDiscoveryItems([nightly, secondNightly], "price").map((item) => item.id)).toEqual([
      "second-nightly",
      "nightly",
    ]);
  });

  it("does not compare prices with different units or currencies", () => {
    const totalEuro: AccommodationDiscoveryItem = {
      ...baseItem,
      id: "total-euro",
      distanceKm: 7,
      priceSnapshot: {
        amountMinor: 10000,
        currency: "EUR",
        unit: "total_stay",
        observedAt: "2026-08-11T10:00:00.000Z",
        note: null,
      },
    };
    const nightlyRon: AccommodationDiscoveryItem = {
      ...baseItem,
      id: "nightly-ron",
      distanceKm: 2,
      priceSnapshot: {
        amountMinor: 45000,
        currency: "RON",
        unit: "per_night",
        observedAt: "2026-08-11T10:00:00.000Z",
        note: null,
      },
    };

    expect(sortDiscoveryItems([totalEuro, nightlyRon], "price").map((item) => item.id)).toEqual([
      "nightly-ron",
      "total-euro",
    ]);
  });

  it("maps only sourced discovery data into a recommendation", () => {
    const recommendation = discoveryItemToRecommendation(
      baseItem,
      "11111111-1111-4111-8111-111111111111",
      2,
    );

    expect(recommendation).toMatchObject({
      name: "Hotel verificabil",
      source: "osm",
      externalId: "node:1",
      city: "Brașov",
      position: 2,
      attribution: "© OpenStreetMap contributors",
    });
    expect(recommendation).not.toHaveProperty("distanceKm");
  });

  it("formats short distances without rounding them to zero", () => {
    expect(formatDistance(0.12)).toBe("120 m");
  });

  it("accepts only HTTP(S) external actions", () => {
    expect(safeExternalUrl("https://example.com")).toBe("https://example.com/");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
  });
});
