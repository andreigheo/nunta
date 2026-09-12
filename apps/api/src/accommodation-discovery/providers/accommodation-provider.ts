export type AccommodationProviderId =
  "openstreetmap" | "foursquare" | "google_places" | "booking_com" | "expedia";

export type AccommodationProviderCapabilities = {
  liveAvailability: boolean;
  livePricing: boolean;
  bookingRedirect: boolean;
  dateAndOccupancySearch: boolean;
};

export type AccommodationProviderDescriptor = {
  id: AccommodationProviderId;
  enabled: boolean;
  capabilities: AccommodationProviderCapabilities;
};

/**
 * Provider descriptors are product truth, not feature flags. New adapters must
 * only be enabled after credentials, contract terms, attribution and launch
 * checks are in place. The discovery service fails closed by using only an
 * enabled adapter; it never fabricates price or availability data.
 */
export const ACCOMMODATION_PROVIDERS: Record<
  AccommodationProviderId,
  AccommodationProviderDescriptor
> = {
  openstreetmap: {
    id: "openstreetmap",
    enabled: true,
    capabilities: {
      liveAvailability: false,
      livePricing: false,
      bookingRedirect: false,
      dateAndOccupancySearch: false,
    },
  },
  foursquare: {
    id: "foursquare",
    enabled: false,
    capabilities: {
      liveAvailability: false,
      livePricing: false,
      bookingRedirect: false,
      dateAndOccupancySearch: false,
    },
  },
  google_places: {
    id: "google_places",
    enabled: false,
    capabilities: {
      liveAvailability: false,
      livePricing: false,
      bookingRedirect: false,
      dateAndOccupancySearch: false,
    },
  },
  booking_com: {
    id: "booking_com",
    enabled: false,
    capabilities: {
      liveAvailability: true,
      livePricing: true,
      bookingRedirect: true,
      dateAndOccupancySearch: true,
    },
  },
  expedia: {
    id: "expedia",
    enabled: false,
    capabilities: {
      liveAvailability: true,
      livePricing: true,
      bookingRedirect: true,
      dateAndOccupancySearch: true,
    },
  },
};

export const ACTIVE_ACCOMMODATION_PROVIDER =
  ACCOMMODATION_PROVIDERS.openstreetmap;
