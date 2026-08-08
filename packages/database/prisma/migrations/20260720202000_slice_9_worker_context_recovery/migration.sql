BEGIN;

-- A Slice 9 consumer may only use the workspace persisted on its claimed outbox
-- execution. The BullMQ payload supplies identifiers, never tenant authority.
CREATE OR REPLACE FUNCTION public.weddingos_slice9_worker_execution_matches(
  expected_consumer text,
  expected_aggregate_id uuid,
  expected_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM outbox_consumer_executions execution
    JOIN outbox_messages message ON message.id = execution.outbox_message_id
    WHERE execution.id = NULLIF(current_setting('app.current_consumer_execution_id', true), '')::uuid
      AND execution.consumer_name = expected_consumer
      AND execution.status IN ('PROCESSING', 'COMPLETED')
      AND message.aggregate_id = expected_aggregate_id::text
      AND message.workspace_id = expected_workspace_id
      AND message.workspace_id = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  );
$$;

REVOKE ALL ON FUNCTION public.weddingos_slice9_worker_execution_matches(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_slice9_worker_execution_matches(text, uuid, uuid) TO weddingos_worker;

CREATE INDEX IF NOT EXISTS "copilot_runs_pending_recovery_idx"
  ON "copilot_runs" ("status", "created_at") WHERE "status" IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS "risk_detection_pending_recovery_idx"
  ON "risk_detection_runs" ("status", "created_at") WHERE "status" IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS "automation_execution_pending_recovery_idx"
  ON "automation_executions" ("status", "created_at") WHERE "status" IN ('QUEUED','RUNNING');
CREATE INDEX IF NOT EXISTS "contingency_simulation_pending_recovery_idx"
  ON "contingency_simulations" ("status", "created_at") WHERE "status" IN ('QUEUED','RUNNING');

COMMIT;
