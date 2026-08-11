import type {
  AccommodationDiscoveryItem,
  AccommodationDiscoveryType,
  AccommodationFacility,
  AccommodationPriceSnapshot,
  CreateAccommodationRecommendation,
} from "@weddingos/contracts";

export const accommodationTypes: Array<{
  value: AccommodationDiscoveryType;
  label: string;
}> = [
  { value: "hotel", label: "Hotel" },
  { value: "guest_house", label: "Pensiune" },
  { value: "apartment", label: "Apartament" },
  { value: "hostel", label: "Hostel" },
  { value: "motel", label: "Motel" },
  { value: "chalet", label: "Cabană" },
  { value: "other", label: "Alt tip" },
];

export const accommodationFacilities: Array<{
  value: AccommodationFacility;
  label: string;
}> = [
  { value: "parking", label: "Parcare" },
  { value: "breakfast", label: "Mic dejun" },
  { value: "accessible", label: "Accesibilitate" },
  { value: "family_rooms", label: "Camere de familie" },
  { value: "late_check_in", label: "Check-in târziu" },
  { value: "shuttle", label: "Transfer" },
  { value: "wifi", label: "Wi-Fi" },
  { value: "restaurant", label: "Restaurant" },
  { value: "air_conditioning", label: "Aer condiționat" },
  { value: "pets_allowed", label: "Acceptă animale" },
];

export const typeLabel = (value: AccommodationDiscoveryType) =>
  accommodationTypes.find((item) => item.value === value)?.label ?? "Cazare";

export const facilityLabel = (value: AccommodationFacility) =>
  accommodationFacilities.find((item) => item.value === value)?.label ??
  value.replaceAll("_", " ");

export type DiscoverySort = "distance" | "price";

export function sortDiscoveryItems(
  items: AccommodationDiscoveryItem[],
  sort: DiscoverySort,
) {
  const knownPrices = items.flatMap((item) =>
    item.priceSnapshot ? [item.priceSnapshot] : [],
  );
  const comparablePrices =
    new Set(knownPrices.map((price) => price.currency)).size <= 1 &&
    new Set(knownPrices.map((price) => price.unit)).size <= 1;
  return [...items].sort((left, right) => {
    if (sort === "price" && comparablePrices) {
      if (!left.priceSnapshot && !right.priceSnapshot)
        return left.distanceKm - right.distanceKm;
      if (!left.priceSnapshot) return 1;
      if (!right.priceSnapshot) return -1;
      const priceDifference =
        left.priceSnapshot.amountMinor - right.priceSnapshot.amountMinor;
      return priceDifference || left.distanceKm - right.distanceKm;
    }
    return left.distanceKm - right.distanceKm;
  });
}

export function discoveryItemToRecommendation(
  item: AccommodationDiscoveryItem,
  weddingEventId: string,
  position: number,
): CreateAccommodationRecommendation {
  return {
    weddingEventId,
    source: item.source,
    externalId: item.externalId,
    sourceUrl: item.sourceUrl,
    name: item.name,
    type: item.type,
    address: item.address,
    city: item.city,
    country: item.country,
    latitude: item.latitude,
    longitude: item.longitude,
    bookingUrl: item.bookingUrl,
    contactUrl: item.contactUrl,
    contactPhone: item.contactPhone,
    facilities: item.facilities,
    priceSnapshot: item.priceSnapshot,
    sourceUpdatedAt: item.sourceUpdatedAt,
    fetchedAt: item.fetchedAt,
    attribution:
      item.source === "osm" ? "© OpenStreetMap contributors" : null,
    position,
  };
}

export function formatDistance(value: number | null | undefined) {
  if (value == null) return "Distanță de verificat";
  if (value < 1) return `${Math.max(1, Math.round(value * 1000))} m`;
  return `${new Intl.NumberFormat("ro-RO", {
    maximumFractionDigits: 1,
  }).format(value)} km`;
}

export function formatPrice(snapshot: AccommodationPriceSnapshot | null) {
  if (!snapshot) return "Preț de verificat";
  const amount = new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: snapshot.currency,
    maximumFractionDigits: 0,
  }).format(snapshot.amountMinor / 100);
  return `${amount}${snapshot.unit === "per_night" ? " / noapte" : " / sejur"}`;
}

export function formatFreshness(value: string | null | undefined) {
  if (!value) return "Sursa nu indică data actualizării";
  return `Actualizat ${new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value))}`;
}

export function addressLabel(item: {
  address: string | null;
  city: string | null;
  country: string | null;
}) {
  return (
    [item.address, item.city, item.country].filter(Boolean).join(", ") ||
    "Adresa se verifică direct cu proprietatea"
  );
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
