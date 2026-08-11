-- Accommodation discovery remains informational. Recommendations are separate
-- from the operational accommodation property/room inventory.
CREATE TYPE "AccommodationDiscoverySource" AS ENUM ('OSM', 'ORGANIZER', 'OTHER');
CREATE TYPE "AccommodationDiscoveryType" AS ENUM ('HOTEL', 'GUEST_HOUSE', 'HOSTEL', 'MOTEL', 'APARTMENT', 'CHALET', 'OTHER');
CREATE TYPE "AccommodationRecommendationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AccommodationDiscoveryCacheKind" AS ENUM ('GEOCODING', 'DISCOVERY');

CREATE TABLE "accommodation_recommendations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "wedding_event_id" UUID NOT NULL,
  "source" "AccommodationDiscoverySource" NOT NULL,
  "external_id" VARCHAR(180),
  "source_url" VARCHAR(2048),
  "source_updated_at" TIMESTAMPTZ,
  "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attribution" VARCHAR(240),
  "name" VARCHAR(180) NOT NULL,
  "type" "AccommodationDiscoveryType" NOT NULL,
  "address" VARCHAR(500),
  "city" VARCHAR(120),
  "country" VARCHAR(120),
  "latitude" DECIMAL(10,7),
  "longitude" DECIMAL(10,7),
  "distance_km" DECIMAL(8,3),
  "booking_url" VARCHAR(2048),
  "contact_url" VARCHAR(2048),
  "contact_phone" VARCHAR(80),
  "facilities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "price_snapshot" JSONB,
  "organizer_note" VARCHAR(2000),
  "group_code" VARCHAR(120),
  "deadline" TIMESTAMPTZ,
  "status" "AccommodationRecommendationStatus" NOT NULL DEFAULT 'DRAFT',
  "position" INTEGER NOT NULL DEFAULT 0,
  "published_at" TIMESTAMPTZ,
  "archived_at" TIMESTAMPTZ,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accommodation_recommendations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accommodation_recommendations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_recommendations_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_recommendations_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_recommendations_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id"),
  CONSTRAINT "accommodation_recommendations_coordinates_ck" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  CONSTRAINT "accommodation_recommendations_distance_ck" CHECK ("distance_km" IS NULL OR "distance_km" >= 0),
  CONSTRAINT "accommodation_recommendations_position_ck" CHECK ("position" >= 0),
  CONSTRAINT "accommodation_recommendations_version_ck" CHECK ("version" > 0)
);

CREATE INDEX "accommodation_recommendations_workspace_event_status_position_idx"
  ON "accommodation_recommendations"("workspace_id", "wedding_event_id", "status", "position");
CREATE INDEX "accommodation_recommendations_workspace_source_external_idx"
  ON "accommodation_recommendations"("workspace_id", "source", "external_id");
CREATE UNIQUE INDEX "accommodation_recommendations_active_external_key"
  ON "accommodation_recommendations"("workspace_id", "wedding_event_id", "source", "external_id")
  WHERE "deleted_at" IS NULL AND "external_id" IS NOT NULL;

CREATE TABLE "accommodation_discovery_cache" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "kind" "AccommodationDiscoveryCacheKind" NOT NULL,
  "cache_key" CHAR(64) NOT NULL,
  "request" JSONB NOT NULL,
  "response" JSONB NOT NULL,
  "attribution" VARCHAR(240) NOT NULL,
  "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accommodation_discovery_cache_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "accommodation_discovery_cache_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "accommodation_discovery_cache_expiry_ck" CHECK ("expires_at" > "fetched_at"),
  CONSTRAINT "accommodation_discovery_cache_version_ck" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "accommodation_discovery_cache_workspace_kind_key_key"
  ON "accommodation_discovery_cache"("workspace_id", "kind", "cache_key");
CREATE INDEX "accommodation_discovery_cache_workspace_kind_expiry_idx"
  ON "accommodation_discovery_cache"("workspace_id", "kind", "expires_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "accommodation_recommendations", "accommodation_discovery_cache"
TO weddingos_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "accommodation_recommendations", "accommodation_discovery_cache"
TO weddingos_worker;

ALTER TABLE "accommodation_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_recommendations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_discovery_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accommodation_discovery_cache" FORCE ROW LEVEL SECURITY;

CREATE POLICY "accommodation_recommendations_organizer_policy"
ON "accommodation_recommendations" FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "accommodation_recommendations_guest_policy"
ON "accommodation_recommendations" FOR SELECT TO weddingos_app
USING (
  "status" = 'PUBLISHED'
  AND "deleted_at" IS NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1
    FROM "wedding_events" event
    WHERE event."id" = "accommodation_recommendations"."wedding_event_id"
      AND event."workspace_id" = "accommodation_recommendations"."workspace_id"
      AND event."guest_visible"
      AND event."deleted_at" IS NULL
      AND event."status" <> 'CANCELLED'
  )
);

CREATE POLICY "accommodation_discovery_cache_organizer_policy"
ON "accommodation_discovery_cache" FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "accommodation_recommendations_worker_policy"
ON "accommodation_recommendations" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "accommodation_discovery_cache_worker_policy"
ON "accommodation_discovery_cache" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));
