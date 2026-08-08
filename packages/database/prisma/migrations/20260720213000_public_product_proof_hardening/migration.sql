BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_public_aggregator') THEN
    CREATE ROLE weddingos_public_aggregator
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END
$$;

ALTER ROLE weddingos_public_aggregator
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;

GRANT USAGE ON SCHEMA public TO weddingos_public_aggregator;
GRANT SELECT ON TABLE
  public.workspaces,
  public.public_aggregate_consents,
  public.planning_tasks,
  public.guest_event_responses,
  public.transport_requests,
  public.guest_transport_assignments,
  public.accommodation_requests,
  public.accommodation_allocations,
  public.requests_for_quote,
  public.vendor_bookings,
  public.budget_plans,
  public.run_of_show_items,
  public.guest_check_ins,
  public.wedding_day_incidents
TO weddingos_public_aggregator;

ALTER FUNCTION public.weddingos_public_proof_metric(numeric, bigint, integer)
  OWNER TO weddingos_public_aggregator;
ALTER FUNCTION public.weddingos_compute_public_marketing_metrics(timestamptz, timestamptz, integer)
  OWNER TO weddingos_public_aggregator;

REVOKE ALL ON FUNCTION public.weddingos_public_proof_metric(numeric, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weddingos_compute_public_marketing_metrics(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_compute_public_marketing_metrics(timestamptz, timestamptz, integer)
  TO weddingos_worker;

CREATE TABLE "public_marketing_snapshot_invalidations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invalidated_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "public_marketing_snapshot_invalidations_invalidated_idx"
  ON "public_marketing_snapshot_invalidations" ("invalidated_at" DESC);

GRANT SELECT, INSERT ON TABLE "public_marketing_snapshot_invalidations" TO weddingos_app;

ALTER TABLE "public_marketing_snapshot_invalidations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public_marketing_snapshot_invalidations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "public_marketing_snapshot_invalidation_app_read"
  ON "public_marketing_snapshot_invalidations"
  FOR SELECT TO weddingos_app
  USING (true);

CREATE POLICY "public_marketing_snapshot_invalidation_app_insert"
  ON "public_marketing_snapshot_invalidations"
  FOR INSERT TO weddingos_app
  WITH CHECK (true);

COMMIT;
