-- Additive only: existing OSM recommendations and identifiers are preserved.
ALTER TYPE "AccommodationDiscoverySource" ADD VALUE IF NOT EXISTS 'GEOAPIFY';
