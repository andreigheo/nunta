import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccommodationDiscoveryItem } from "@weddingos/contracts";
import { describe, expect, it } from "vitest";
import {
  deduplicateAccommodationListings,
  mapGeoapifyFeature,
} from "../src/accommodation-discovery/accommodation-discovery.service";

const center = {
  latitude: 44.4355,
  longitude: 26.1025,
  label: null,
  source: "coordinates" as const,
};
const fetchedAt = "2026-10-23T12:00:00.000Z";
const fixtures = JSON.parse(
  readFileSync(join(__dirname, "fixtures/geoapify-mil-pasos.json"), "utf8"),
) as unknown[];
const realItems = fixtures.map((feature) =>
  mapGeoapifyFeature(feature, center, fetchedAt)!,
);
const hostel = realItems.find((item) => item.type === "hostel")!;
function other(
  patch: Partial<AccommodationDiscoveryItem> = {},
): AccommodationDiscoveryItem {
  return {
    ...hostel,
    id: "geoapify:other",
    externalId: "other",
    sourceUrl: "https://www.openstreetmap.org/node/999",
    ...patch,
  };
}

describe("conservative accommodation source deduplication", () => {
  it("collapses the three real Hostel rows while preserving the separate Penthouse", () => {
    const result = deduplicateAccommodationListings(realItems);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name).sort()).toEqual([
      "Mil Pasos Hostel",
      "Mil Pasos Penthouse",
    ]);
    expect(result.find((item) => item.name === "Mil Pasos Hostel")).toBe(
      hostel,
    );
    expect(realItems).toHaveLength(4);
  });

  it("chooses the same intact representative regardless of provider row order", () => {
    expect(deduplicateAccommodationListings([...realItems].reverse())).toEqual(
      deduplicateAccommodationListings(realItems),
    );
  });

  it("recognizes identical provider IDs and explicit OSM entity IDs", () => {
    expect(deduplicateAccommodationListings([hostel, { ...hostel }])).toEqual([
      hostel,
    ]);
    expect(
      deduplicateAccommodationListings([
        hostel,
        other({ sourceUrl: hostel.sourceUrl }),
      ]),
    ).toHaveLength(1);
  });

  it.each([
    ["different property name", { name: "Alt Hostel" }],
    ["different unit", { name: "Mil Pasos Hostel (Apartment 2)" }],
    ["different building number", { address: "Strada Preot Vasile Lucaciu 4" }],
    ["different unit address", { address: `${hostel.address}, ap. 2` }],
    ["missing address", { address: null }],
    ["incomplete street", { address: "Strada Preot Vasile Lucaciu" }],
    ["missing phone", { contactPhone: null }],
    ["conflicting phone", { contactPhone: "+40762000111" }],
    ["short phone", { contactPhone: "12345" }],
    ["phone with extension", { contactPhone: "+40762567221 ext 2" }],
    ["different city", { city: "Brașov" }],
    ["missing city", { city: null }],
    ["different country", { country: "Germania" }],
    ["missing country", { country: null }],
    ["different location", { latitude: hostel.latitude + 0.001 }],
    ["different provider", { source: "osm" }],
  ] satisfies [string, Partial<AccommodationDiscoveryItem>][])(
    "preserves %s even with otherwise matching evidence",
    (_reason, patch) => {
      expect(
        deduplicateAccommodationListings([hostel, other(patch)]),
      ).toHaveLength(2);
    },
  );

  it("keeps conflicting websites and never unions facilities", () => {
    const first = {
      ...hostel,
      contactUrl: "https://one.example/",
      facilities: ["wifi" as const],
    };
    const second = other({
      contactUrl: "https://two.example/",
      facilities: ["parking"],
    });
    expect(deduplicateAccommodationListings([first, second])).toHaveLength(2);
    const same = { ...second, contactUrl: first.contactUrl };
    const [winner] = deduplicateAccommodationListings([first, same]);
    expect([first, same]).toContain(winner);
    expect(winner.facilities).toHaveLength(1);
  });

  it("normalizes RO international prefixes, formatting, case and diacritics", () => {
    for (const contactPhone of [
      "0762567221",
      "0040 762 567 221",
      "+40 (762) 567-221",
    ]) {
      expect(
        deduplicateAccommodationListings([
          hostel,
          other({ contactPhone, name: "MIL PASOS HOSTEL", city: "Bucuresti" }),
        ]),
      ).toHaveLength(1);
    }
  });

  it("does not use a bridge record to join properties more than 25m apart", () => {
    const a = { ...hostel, latitude: 44.43 };
    const b = other({ latitude: 44.4302, externalId: "b" });
    const c = other({
      latitude: 44.4304,
      externalId: "c",
      sourceUrl: "https://www.openstreetmap.org/node/998",
    });
    expect(deduplicateAccommodationListings([a, b, c])).toHaveLength(2);
  });

  it("preserves meaningful unit punctuation in addresses", () => {
    expect(
      deduplicateAccommodationListings([
        { ...hostel, address: "Strada Test 1/2" },
        other({ address: "Strada Test 1-2" }),
      ]),
    ).toHaveLength(2);
  });

  it("preserves meaningful unit punctuation in names", () => {
    expect(
      deduplicateAccommodationListings([
        { ...hostel, name: "Mil Pasos Apartment 1/2" },
        other({ name: "Mil Pasos Apartment 1-2" }),
      ]),
    ).toHaveLength(2);
  });

  it("does not treat missing provider IDs or generic source URLs as identity", () => {
    expect(
      deduplicateAccommodationListings([
        { ...hostel, externalId: null, sourceUrl: "https://www.geoapify.com/" },
        other({
          externalId: null,
          sourceUrl: "https://www.geoapify.com/",
          name: "Alt Hostel",
        }),
      ]),
    ).toHaveLength(2);
  });

  it("uses precise distance rather than a rounded display distance at the 25m boundary", () => {
    expect(
      deduplicateAccommodationListings([
        hostel,
        other({ latitude: hostel.latitude + 25.4 / 111195.08 }),
      ]),
    ).toHaveLength(2);
  });
});

const reviewedFeatures = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/geoapify-reviewed-properties.json"),
    "utf8",
  ),
) as unknown[];
const reviewed = reviewedFeatures.map((feature) =>
  mapGeoapifyFeature(feature, center, fetchedAt)!,
);
const kristaBuilding = reviewed.find(
  (item) => item.sourceUrl === "https://www.openstreetmap.org/way/273526667",
)!;
const kristaNode = reviewed.find(
  (item) => item.sourceUrl === "https://www.openstreetmap.org/node/6054061686",
)!;

describe("officially reviewed identity pair, without widening generic deduplication", () => {
  it("keeps the reviewed building identity even if the point later has richer compatible facts", () => {
    const richerNode: AccommodationDiscoveryItem = {
      ...kristaNode,
      contactPhone: kristaBuilding.contactPhone,
      contactUrl: "https://krista.example/",
      facilities: ["wifi", "parking"],
    };
    expect(
      deduplicateAccommodationListings([richerNode, kristaBuilding]),
    ).toEqual([kristaBuilding]);
  });

  it("keeps the intact Krista building/contact record and leaves both ambiguous Urban Bliss records", () => {
    const distinct = deduplicateAccommodationListings(reviewed);
    expect(distinct).toHaveLength(3);
    expect(distinct.filter((item) => item.name === "Vila Krista")).toEqual([
      kristaBuilding,
    ]);
    expect(distinct.filter((item) => item.name === "Urban Bliss")).toHaveLength(
      2,
    );
    expect(deduplicateAccommodationListings([...reviewed].reverse())).toEqual(
      distinct,
    );
  });

  it("never hides a lone Krista point when the confirmed building is absent", () => {
    expect(deduplicateAccommodationListings([kristaNode])).toEqual([
      kristaNode,
    ]);
  });

  it.each([
    [
      "unknown source entity",
      { sourceUrl: "https://www.openstreetmap.org/node/123" },
    ],
    ["another property name", { name: "Vila Krista Nouă" }],
    ["another unit", { name: "Vila Krista (Apartament 2)" }],
    ["another city", { city: "Brașov" }],
    ["another country", { country: "Germania" }],
    ["another street", { address: "Strada Valea Porții 55" }],
    [
      "contradictory house number",
      { address: "Strada General Traian Moșoiu 53" },
    ],
    [
      "specific apartment",
      { address: "Strada General Traian Moșoiu 55 ap. 2" },
    ],
    ["missing street", { address: null }],
    ["conflicting phone", { contactPhone: "+40740081418" }],
    ["malformed contact", { contactPhone: "recepție" }],
    ["shifted coordinates", { latitude: kristaNode.latitude + 0.001 }],
    ["different source", { source: "osm" }],
    ["changed type", { type: "apartment" }],
  ] satisfies [string, Partial<AccommodationDiscoveryItem>][])(
    "preserves %s in the reviewed pair",
    (_reason, patch) => {
      expect(
        deduplicateAccommodationListings([
          kristaBuilding,
          { ...kristaNode, ...patch },
        ]),
      ).toHaveLength(2);
    },
  );

  it("requires the verified building's phone and rejects conflicting websites", () => {
    for (const contactPhone of [null, "+40740081418"]) {
      expect(
        deduplicateAccommodationListings([
          { ...kristaBuilding, contactPhone },
          kristaNode,
        ]),
      ).toHaveLength(2);
    }
    expect(
      deduplicateAccommodationListings([
        { ...kristaBuilding, contactUrl: "https://one.example/" },
        { ...kristaNode, contactUrl: "https://two.example/" },
      ]),
    ).toHaveLength(2);
  });

  it("does not apply the exception to another same-name property in the same place", () => {
    const another = {
      ...kristaNode,
      id: "geoapify:unreviewed",
      externalId: "unreviewed",
      sourceUrl: "https://www.openstreetmap.org/node/999",
    };
    expect(
      deduplicateAccommodationListings([kristaNode, kristaBuilding, another]),
    ).toHaveLength(2);
  });
});
