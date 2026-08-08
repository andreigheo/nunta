DROP FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text);

CREATE FUNCTION public.weddingos_begin_consumer_execution(
  target_execution uuid,
  target_outbox uuid,
  target_consumer text,
  claim_worker_id text
)
RETURNS TABLE (
  execution_id uuid,
  outbox_message_id uuid,
  consumer_name text,
  background_job_id uuid,
  workspace_id uuid,
  vendor_organization_id uuid,
  actor_user_id uuid,
  correlation_id text,
  event_name text,
  aggregate_type text,
  aggregate_id text,
  payload jsonb,
  encrypted_headers text,
  attempt_number integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH started AS (
    UPDATE public.outbox_consumer_executions execution
    SET status = 'PROCESSING', attempts = execution.attempts + 1,
        locked_at = now(), locked_by = claim_worker_id,
        started_at = COALESCE(execution.started_at, now()), heartbeat_at = now(),
        last_error_code = NULL, last_error_message = NULL,
        updated_at = now(), version = execution.version + 1
    WHERE execution.id = target_execution
      AND execution.outbox_message_id = target_outbox
      AND execution.consumer_name = target_consumer
      AND execution.status NOT IN ('COMPLETED', 'DEAD_LETTER')
    RETURNING execution.*
  )
  SELECT started.id, outbox.id, started.consumer_name::text,
    started.background_job_id, outbox.workspace_id,
    outbox.vendor_organization_id, outbox.actor_user_id,
    outbox.correlation_id::text, outbox.event_name::text,
    outbox.aggregate_type::text, outbox.aggregate_id::text,
    outbox.payload, outbox.encrypted_headers,
    started.attempts, started.max_attempts
  FROM started
  JOIN public.outbox_messages outbox ON outbox.id = started.outbox_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text) TO weddingos_worker;
