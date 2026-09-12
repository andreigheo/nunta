ALTER TYPE "AccommodationDiscoverySource" ADD VALUE IF NOT EXISTS 'FOURSQUARE';
ALTER TYPE "AccommodationDiscoverySource" ADD VALUE IF NOT EXISTS 'GOOGLE_PLACES';
ALTER TYPE "AccommodationDiscoverySource" ADD VALUE IF NOT EXISTS 'BOOKING_COM';
ALTER TYPE "AccommodationDiscoverySource" ADD VALUE IF NOT EXISTS 'EXPEDIA';

BEGIN;

ALTER TABLE "accommodation_requests"
  ADD COLUMN "wedding_event_id" UUID,
  ADD COLUMN "booking_mode" VARCHAR(40) NOT NULL DEFAULT 'organizer_managed',
  ADD COLUMN "budget_max_minor" INTEGER,
  ADD COLUMN "currency" CHAR(3);

ALTER TABLE "accommodation_stays"
  ADD COLUMN "wedding_event_id" UUID,
  ADD COLUMN "source_recommendation_id" UUID;

ALTER TABLE "guest_event_responses"
  ADD COLUMN "accommodation_requested" BOOLEAN,
  ADD COLUMN "accommodation_arrival_date" DATE,
  ADD COLUMN "accommodation_departure_date" DATE,
  ADD COLUMN "accommodation_room_preference" VARCHAR(500),
  ADD COLUMN "accommodation_booking_mode" VARCHAR(40),
  ADD COLUMN "accommodation_budget_max_minor" INTEGER,
  ADD COLUMN "accommodation_currency" CHAR(3),
  ADD CONSTRAINT "guest_event_responses_accommodation_dates_ck"
    CHECK ("accommodation_departure_date" IS NULL OR "accommodation_arrival_date" IS NULL OR "accommodation_departure_date" > "accommodation_arrival_date"),
  ADD CONSTRAINT "guest_event_responses_accommodation_budget_ck"
    CHECK ("accommodation_budget_max_minor" IS NULL OR "accommodation_budget_max_minor" >= 0),
  ADD CONSTRAINT "guest_event_responses_accommodation_currency_ck"
    CHECK ("accommodation_currency" IS NULL OR "accommodation_currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "guest_event_responses_accommodation_mode_ck"
    CHECK ("accommodation_booking_mode" IS NULL OR "accommodation_booking_mode" IN ('recommendations_only', 'organizer_managed'));

-- Legacy requests were guest-scoped. Prefer the RSVP event that produced the
-- request, then another confirmed response, then the workspace's first event.
UPDATE "accommodation_requests" request
SET "wedding_event_id" = COALESCE(
  (
    SELECT response."wedding_event_id"
    FROM "guest_event_responses" response
    WHERE response."workspace_id" = request."workspace_id"
      AND response."guest_id" = request."guest_id"
      AND response."submission_id" = request."source_submission_id"
      AND response."attendance" = 'CONFIRMED'
    ORDER BY response."responded_at" DESC, response."id"
    LIMIT 1
  ),
  (
    SELECT response."wedding_event_id"
    FROM "guest_event_responses" response
    WHERE response."workspace_id" = request."workspace_id"
      AND response."guest_id" = request."guest_id"
      AND response."attendance" = 'CONFIRMED'
    ORDER BY response."responded_at" DESC, response."id"
    LIMIT 1
  ),
  (
    SELECT event."id"
    FROM "wedding_events" event
    WHERE event."workspace_id" = request."workspace_id"
    ORDER BY event."deleted_at" NULLS FIRST, event."start_at" NULLS LAST, event."created_at", event."id"
    LIMIT 1
  )
);

-- Infer the event of an existing stay from its allocated requests whenever
-- possible. Date proximity is only a deterministic legacy fallback.
UPDATE "accommodation_stays" stay
SET "wedding_event_id" = COALESCE(
  (
    SELECT request."wedding_event_id"
    FROM "accommodation_allocations" allocation
    JOIN "accommodation_requests" request
      ON request."id" = allocation."accommodation_request_id"
    WHERE allocation."stay_id" = stay."id"
      AND request."wedding_event_id" IS NOT NULL
    GROUP BY request."wedding_event_id"
    ORDER BY COUNT(*) DESC, request."wedding_event_id"
    LIMIT 1
  ),
  (
    SELECT event."id"
    FROM "wedding_events" event
    WHERE event."workspace_id" = stay."workspace_id"
    ORDER BY
      ABS(EXTRACT(EPOCH FROM (COALESCE(event."start_at", stay."check_in_date"::timestamp) - stay."check_in_date"::timestamp))),
      event."deleted_at" NULLS FIRST,
      event."id"
    LIMIT 1
  )
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "accommodation_requests" WHERE "wedding_event_id" IS NULL)
    OR EXISTS (SELECT 1 FROM "accommodation_stays" WHERE "wedding_event_id" IS NULL) THEN
    RAISE EXCEPTION 'Accommodation event backfill failed: a workspace with accommodation data has no event';
  END IF;
END $$;

DROP INDEX "accommodation_requests_guest_id_key";
DROP INDEX "accommodation_requests_workspace_id_status_arrival_date_idx";
DROP INDEX "accommodation_stays_workspace_id_property_id_status_idx";

ALTER TABLE "accommodation_requests"
  ALTER COLUMN "wedding_event_id" SET NOT NULL,
  ADD CONSTRAINT "accommodation_requests_event_fk"
    FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "accommodation_requests_budget_ck"
    CHECK ("budget_max_minor" IS NULL OR "budget_max_minor" >= 0),
  ADD CONSTRAINT "accommodation_requests_currency_ck"
    CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "accommodation_requests_booking_mode_ck"
    CHECK ("booking_mode" IN ('recommendations_only', 'organizer_managed'));

ALTER TABLE "accommodation_stays"
  ALTER COLUMN "wedding_event_id" SET NOT NULL,
  ADD CONSTRAINT "accommodation_stays_event_fk"
    FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "accommodation_stays_source_recommendation_fk"
    FOREIGN KEY ("source_recommendation_id") REFERENCES "accommodation_recommendations"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "accommodation_requests_guest_id_wedding_event_id_key"
  ON "accommodation_requests"("guest_id", "wedding_event_id");
CREATE INDEX "accommodation_requests_workspace_event_status_arrival_idx"
  ON "accommodation_requests"("workspace_id", "wedding_event_id", "status", "arrival_date");
CREATE UNIQUE INDEX "accommodation_stays_workspace_source_recommendation_key"
  ON "accommodation_stays"("workspace_id", "source_recommendation_id")
  WHERE "source_recommendation_id" IS NOT NULL;
CREATE INDEX "accommodation_stays_workspace_event_status_check_in_idx"
  ON "accommodation_stays"("workspace_id", "wedding_event_id", "status", "check_in_date");
CREATE INDEX "accommodation_stays_workspace_property_status_idx"
  ON "accommodation_stays"("workspace_id", "property_id", "status");

CREATE OR REPLACE FUNCTION public.weddingos_guest_workspace_currency()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
DECLARE
  v_currency text;
BEGIN
  SELECT workspace."currency" INTO v_currency
  FROM public."guest_access_grants" grant_row
  JOIN public."workspaces" workspace ON workspace."id" = grant_row."workspace_id"
  WHERE grant_row."id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row."token_hash" = NULLIF(current_setting('app.current_guest_token_hash', true), '')
    AND grant_row."revoked_at" IS NULL
    AND (grant_row."expires_at" IS NULL OR grant_row."expires_at" > now());

  IF v_currency IS NULL THEN
    RAISE EXCEPTION 'guest currency grant is invalid' USING ERRCODE = '42501';
  END IF;
  RETURN v_currency;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_guest_workspace_currency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_workspace_currency() TO weddingos_app;

COMMIT;
