BEGIN;

CREATE TYPE "MarketingSnapshotRunStatus" AS ENUM ('RUNNING', 'PUBLISHED', 'UNCHANGED', 'SKIPPED_LOCKED', 'FAILED');

CREATE TABLE "public_aggregate_consents" (
  "workspace_id" uuid PRIMARY KEY REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "policy_version" varchar(80) NOT NULL,
  "consented_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "consented_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "revoked_by" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "public_aggregate_consent_policy" CHECK ("policy_version" = 'public-aggregate-v1'),
  CONSTRAINT "public_aggregate_consent_version_positive" CHECK ("version" > 0)
);
CREATE INDEX "public_aggregate_consent_active_idx"
  ON "public_aggregate_consents" ("policy_version", "revoked_at", "consented_at");

CREATE TABLE "public_marketing_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schema_version" varchar(20) NOT NULL,
  "capability_manifest_hash" char(64) NOT NULL,
  "window_started_at" timestamptz NOT NULL,
  "window_ended_at" timestamptz NOT NULL,
  "generated_at" timestamptz NOT NULL,
  "minimum_cohort" integer NOT NULL,
  "eligible_workspace_count" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "payload_hash" char(64) NOT NULL,
  "worker_id" varchar(128) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "public_marketing_snapshot_minimum_cohort" CHECK ("minimum_cohort" >= 20),
  CONSTRAINT "public_marketing_snapshot_window_order" CHECK ("window_ended_at" > "window_started_at"),
  CONSTRAINT "public_marketing_snapshot_eligible_count" CHECK ("eligible_workspace_count" >= 0)
);
CREATE INDEX "public_marketing_snapshots_generated_idx" ON "public_marketing_snapshots" ("generated_at" DESC);
CREATE INDEX "public_marketing_snapshots_payload_hash_idx" ON "public_marketing_snapshots" ("payload_hash");

CREATE TABLE "marketing_snapshot_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" "MarketingSnapshotRunStatus" NOT NULL DEFAULT 'RUNNING',
  "worker_id" varchar(128) NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "window_started_at" timestamptz NOT NULL,
  "window_ended_at" timestamptz NOT NULL,
  "minimum_cohort" integer NOT NULL,
  "eligible_workspace_count" integer,
  "snapshot_id" uuid REFERENCES "public_marketing_snapshots"("id") ON DELETE SET NULL,
  "error_code" varchar(120),
  "error_message" varchar(500),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "marketing_snapshot_run_minimum_cohort" CHECK ("minimum_cohort" >= 20),
  CONSTRAINT "marketing_snapshot_run_window_order" CHECK ("window_ended_at" > "window_started_at")
);
CREATE INDEX "marketing_snapshot_runs_started_idx" ON "marketing_snapshot_runs" ("started_at" DESC);
CREATE INDEX "marketing_snapshot_runs_status_idx" ON "marketing_snapshot_runs" ("status", "started_at");

GRANT SELECT, INSERT, UPDATE ON TABLE "public_aggregate_consents" TO weddingos_app;
GRANT SELECT ON TABLE "public_marketing_snapshots" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public_marketing_snapshots", "marketing_snapshot_runs" TO weddingos_worker;

ALTER TABLE "public_aggregate_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public_aggregate_consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "public_aggregate_consent_workspace" ON "public_aggregate_consents"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );
ALTER TABLE "public_marketing_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public_marketing_snapshots" FORCE ROW LEVEL SECURITY;
CREATE POLICY "public_marketing_snapshot_app_read" ON "public_marketing_snapshots"
  FOR SELECT TO weddingos_app USING (true);
CREATE POLICY "public_marketing_snapshot_worker" ON "public_marketing_snapshots"
  FOR ALL TO weddingos_worker
  USING (NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL)
  WITH CHECK (NULLIF(current_setting('app.current_worker_id', true), '') = "worker_id");

ALTER TABLE "marketing_snapshot_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marketing_snapshot_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "marketing_snapshot_runs_worker" ON "marketing_snapshot_runs"
  FOR ALL TO weddingos_worker
  USING (NULLIF(current_setting('app.current_worker_id', true), '') = "worker_id")
  WITH CHECK (NULLIF(current_setting('app.current_worker_id', true), '') = "worker_id");

UPDATE "role_templates"
SET "capabilities" = "capabilities" || '["workspace.manage_public_aggregation"]'::jsonb,
    "updated_at" = now(),
    "version" = "version" + 1
WHERE "key" = 'couple_owner'
  AND NOT "capabilities" @> '["workspace.manage_public_aggregation"]'::jsonb;

CREATE FUNCTION public.weddingos_public_proof_metric(
  metric_value numeric,
  contributor_count bigint,
  minimum_cohort integer
) RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN contributor_count < minimum_cohort THEN jsonb_build_object(
      'state', 'suppressed', 'value', NULL, 'unit', 'percent',
      'contributingWorkspaceBucket', NULL, 'suppressionReason', 'minimum_cohort'
    )
    WHEN metric_value IS NULL THEN jsonb_build_object(
      'state', 'suppressed', 'value', NULL, 'unit', 'percent',
      'contributingWorkspaceBucket', NULL, 'suppressionReason', 'insufficient_denominator'
    )
    ELSE jsonb_build_object(
      'state', 'published',
      'value', LEAST(100, GREATEST(0, round(metric_value / 5.0) * 5))::integer,
      'unit', 'percent',
      'contributingWorkspaceBucket', floor(contributor_count / 10.0)::integer * 10,
      'suppressionReason', NULL
    )
  END
$$;
REVOKE ALL ON FUNCTION public.weddingos_public_proof_metric(numeric, bigint, integer) FROM PUBLIC;

CREATE FUNCTION public.weddingos_compute_public_marketing_metrics(
  window_started_at timestamptz,
  window_ended_at timestamptz,
  minimum_cohort integer
) RETURNS TABLE (eligible_workspace_count integer, metrics jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  IF minimum_cohort < 20 THEN
    RAISE EXCEPTION 'minimum cohort must be at least 20' USING ERRCODE = '22023';
  END IF;
  IF window_ended_at <= window_started_at THEN
    RAISE EXCEPTION 'invalid aggregation window' USING ERRCODE = '22023';
  END IF;
  IF window_ended_at - window_started_at <> interval '365 days' THEN
    RAISE EXCEPTION 'aggregation window must be exactly 365 days' USING ERRCODE = '22023';
  END IF;
  IF window_ended_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'aggregation window end is in the future' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH eligible AS MATERIALIZED (
    SELECT workspace.id
    FROM public.workspaces workspace
    JOIN public.public_aggregate_consents consent
      ON consent.workspace_id = workspace.id
    WHERE workspace.status = 'ACTIVE'
      AND workspace.deleted_at IS NULL
      AND consent.policy_version = 'public-aggregate-v1'
      AND consent.revoked_at IS NULL
      AND consent.consented_at <= window_ended_at
  ),
  planning_workspace AS (
    SELECT task.workspace_id,
      100.0 * count(*) FILTER (WHERE task.status = 'COMPLETED') / NULLIF(count(*), 0) AS progress,
      CASE WHEN count(*) FILTER (WHERE task.status NOT IN ('COMPLETED', 'ARCHIVED')) > 0 THEN 100.0 ELSE 0.0 END AS next_action
    FROM public.planning_tasks task JOIN eligible ON eligible.id = task.workspace_id
    WHERE task.deleted_at IS NULL AND task.updated_at >= window_started_at AND task.updated_at <= window_ended_at
    GROUP BY task.workspace_id
  ),
  planning_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY progress)::numeric AS progress,
      avg(next_action)::numeric AS next_action, count(*)::bigint AS contributors FROM planning_workspace
  ),
  rsvp_workspace AS (
    SELECT response.workspace_id,
      100.0 * count(*) FILTER (WHERE response.attendance <> 'NO_RESPONSE') / NULLIF(count(*), 0) AS response_rate
    FROM public.guest_event_responses response JOIN eligible ON eligible.id = response.workspace_id
    WHERE response.responded_at >= window_started_at AND response.responded_at <= window_ended_at
    GROUP BY response.workspace_id
  ),
  rsvp_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY response_rate)::numeric AS value,
      count(*)::bigint AS contributors FROM rsvp_workspace
  ),
  logistics_request AS (
    SELECT request.workspace_id, request.guest_id,
      EXISTS (SELECT 1 FROM public.guest_transport_assignments assignment
        WHERE assignment.workspace_id = request.workspace_id AND assignment.guest_id = request.guest_id
          AND assignment.status NOT IN ('CANCELLED')) AS assigned
    FROM public.transport_requests request JOIN eligible ON eligible.id = request.workspace_id
    WHERE request.requested AND request.updated_at >= window_started_at AND request.updated_at <= window_ended_at
    UNION ALL
    SELECT request.workspace_id, request.guest_id,
      EXISTS (SELECT 1 FROM public.accommodation_allocations allocation
        WHERE allocation.workspace_id = request.workspace_id AND allocation.guest_id = request.guest_id
          AND allocation.status NOT IN ('CANCELLED')) AS assigned
    FROM public.accommodation_requests request JOIN eligible ON eligible.id = request.workspace_id
    WHERE request.requested AND request.updated_at >= window_started_at AND request.updated_at <= window_ended_at
  ),
  logistics_workspace AS (
    SELECT workspace_id, 100.0 * count(*) FILTER (WHERE assigned) / NULLIF(count(*), 0) AS value
    FROM logistics_request GROUP BY workspace_id
  ),
  logistics_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::numeric AS value,
      count(*)::bigint AS contributors FROM logistics_workspace
  ),
  rfq_workspace AS (
    SELECT rfq.workspace_id,
      CASE WHEN EXISTS (SELECT 1 FROM public.vendor_bookings booking
        WHERE booking.rfq_id = rfq.id AND booking.status NOT IN ('CANCELLED', 'ARCHIVED')) THEN 100.0 ELSE 0.0 END AS converted
    FROM public.requests_for_quote rfq JOIN eligible ON eligible.id = rfq.workspace_id
    WHERE rfq.deleted_at IS NULL AND rfq.sent_at >= window_started_at AND rfq.sent_at <= window_ended_at
  ),
  rfq_by_workspace AS (
    SELECT workspace_id, max(converted) AS converted FROM rfq_workspace GROUP BY workspace_id
  ),
  rfq_metric AS (
    SELECT avg(converted)::numeric AS value, count(*)::bigint AS contributors FROM rfq_by_workspace
  ),
  budget_workspace AS (
    SELECT budget.workspace_id,
      LEAST(100.0, 100.0 * COALESCE(sum(booking.total_minor), 0) / NULLIF(budget.target_total_minor, 0)) AS value
    FROM public.budget_plans budget JOIN eligible ON eligible.id = budget.workspace_id
    LEFT JOIN public.vendor_bookings booking ON booking.workspace_id = budget.workspace_id
      AND booking.status NOT IN ('CANCELLED', 'ARCHIVED')
      AND booking.created_at >= window_started_at AND booking.created_at <= window_ended_at
    WHERE budget.status = 'ACTIVE' AND budget.target_total_minor > 0
    GROUP BY budget.workspace_id, budget.target_total_minor
  ),
  budget_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::numeric AS value,
      count(*)::bigint AS contributors FROM budget_workspace
  ),
  run_workspace AS (
    SELECT item.workspace_id,
      100.0 * count(*) FILTER (WHERE item.status = 'COMPLETED') / NULLIF(count(*), 0) AS value
    FROM public.run_of_show_items item JOIN eligible ON eligible.id = item.workspace_id
    WHERE item.updated_at >= window_started_at AND item.updated_at <= window_ended_at
    GROUP BY item.workspace_id
  ),
  run_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::numeric AS value,
      count(*)::bigint AS contributors FROM run_workspace
  ),
  checkin_workspace AS (
    SELECT checkin.workspace_id,
      100.0 * count(*) FILTER (WHERE checkin.status IN ('CHECKED_IN', 'CHECKED_OUT')) / NULLIF(count(*), 0) AS value
    FROM public.guest_check_ins checkin JOIN eligible ON eligible.id = checkin.workspace_id
    WHERE checkin.updated_at >= window_started_at AND checkin.updated_at <= window_ended_at
    GROUP BY checkin.workspace_id
  ),
  checkin_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::numeric AS value,
      count(*)::bigint AS contributors FROM checkin_workspace
  ),
  incident_workspace AS (
    SELECT incident.workspace_id,
      100.0 * count(*) FILTER (WHERE incident.status IN ('RESOLVED', 'CLOSED')) / NULLIF(count(*), 0) AS value
    FROM public.wedding_day_incidents incident JOIN eligible ON eligible.id = incident.workspace_id
    WHERE incident.started_at >= window_started_at AND incident.started_at <= window_ended_at
    GROUP BY incident.workspace_id
  ),
  incident_metric AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::numeric AS value,
      count(*)::bigint AS contributors FROM incident_workspace
  )
  SELECT (SELECT count(*)::integer FROM eligible), jsonb_build_object(
    'planning', jsonb_build_object(
      'medianPlanProgressPercent', public.weddingos_public_proof_metric(planning_metric.progress, planning_metric.contributors, minimum_cohort),
      'nextActionCoveragePercent', public.weddingos_public_proof_metric(planning_metric.next_action, planning_metric.contributors, minimum_cohort)
    ),
    'rsvpAndLogistics', jsonb_build_object(
      'rsvpResponseRatePercent', public.weddingos_public_proof_metric(rsvp_metric.value, rsvp_metric.contributors, minimum_cohort),
      'logisticsAssignmentRatePercent', public.weddingos_public_proof_metric(logistics_metric.value, logistics_metric.contributors, minimum_cohort)
    ),
    'procurementAndBudget', jsonb_build_object(
      'rfqToBookingWorkspaceRatePercent', public.weddingos_public_proof_metric(rfq_metric.value, rfq_metric.contributors, minimum_cohort),
      'medianBudgetCommittedPercent', public.weddingos_public_proof_metric(budget_metric.value, budget_metric.contributors, minimum_cohort)
    ),
    'weddingDay', jsonb_build_object(
      'runOfShowCompletionRatePercent', public.weddingos_public_proof_metric(run_metric.value, run_metric.contributors, minimum_cohort),
      'checkInRatePercent', public.weddingos_public_proof_metric(checkin_metric.value, checkin_metric.contributors, minimum_cohort),
      'incidentResolutionRatePercent', public.weddingos_public_proof_metric(incident_metric.value, incident_metric.contributors, minimum_cohort)
    )
  )
  FROM planning_metric, rsvp_metric, logistics_metric, rfq_metric, budget_metric, run_metric, checkin_metric, incident_metric;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_compute_public_marketing_metrics(timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_compute_public_marketing_metrics(timestamptz, timestamptz, integer) TO weddingos_worker;

COMMIT;
