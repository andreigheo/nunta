-- Serialize aggregate reconciliation per outbox. Without this lock, two
-- consumer-completion transactions can each observe the other consumer as
-- uncommitted and both leave the aggregate/visible job in PROCESSING/RUNNING.
CREATE OR REPLACE FUNCTION public.weddingos_reconcile_outbox(target_outbox uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  dead_count integer;
  failed_count integer;
  completed_count integer;
  total_count integer;
  max_attempt_count integer;
  linked_job uuid;
  failure_code text;
  failure_message text;
BEGIN
  IF NOT public.weddingos_worker_execution_context_matches(NULL, target_outbox, NULL, NULL, NULL) THEN
    RAISE EXCEPTION 'persisted worker context required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.outbox_messages WHERE id = target_outbox FOR UPDATE;

  SELECT count(*), count(*) FILTER (WHERE status = 'DEAD_LETTER'),
    count(*) FILTER (WHERE status = 'FAILED'), count(*) FILTER (WHERE status = 'COMPLETED'),
    COALESCE(max(attempts), 0), max(background_job_id::text)::uuid,
    (array_agg(last_error_code ORDER BY updated_at DESC) FILTER (WHERE last_error_code IS NOT NULL))[1],
    (array_agg(last_error_message ORDER BY updated_at DESC) FILTER (WHERE last_error_message IS NOT NULL))[1]
  INTO total_count, dead_count, failed_count, completed_count, max_attempt_count,
    linked_job, failure_code, failure_message
  FROM public.outbox_consumer_executions
  WHERE outbox_message_id = target_outbox;

  UPDATE public.outbox_messages
  SET status = CASE
        WHEN dead_count > 0 THEN 'DEAD_LETTER'::"AsyncStatus"
        WHEN completed_count = total_count THEN 'PROCESSED'::"AsyncStatus"
        WHEN failed_count > 0 THEN 'FAILED'::"AsyncStatus"
        ELSE 'PROCESSING'::"AsyncStatus"
      END,
      attempts = max_attempt_count,
      processed_at = CASE WHEN completed_count = total_count THEN now() ELSE NULL END,
      locked_at = NULL, locked_by = NULL,
      last_error_code = failure_code, last_error_message = failure_message,
      updated_at = now(), version = version + 1
  WHERE id = target_outbox;

  IF linked_job IS NOT NULL THEN
    UPDATE public.background_jobs
    SET status = CASE
          WHEN dead_count > 0 THEN 'DEAD_LETTER'::"BackgroundJobStatus"
          WHEN completed_count = total_count THEN 'COMPLETED'::"BackgroundJobStatus"
          WHEN failed_count > 0 THEN 'RETRYING'::"BackgroundJobStatus"
          ELSE 'RUNNING'::"BackgroundJobStatus"
        END,
        attempts = max_attempt_count,
        progress = CASE WHEN total_count = 0 THEN 0 ELSE floor(completed_count * 100.0 / total_count)::integer END,
        started_at = COALESCE(started_at, now()), heartbeat_at = now(),
        finished_at = CASE WHEN dead_count > 0 OR completed_count = total_count THEN now() ELSE NULL END,
        error_code = failure_code, error_message = failure_message,
        updated_at = now(), version = version + 1
    WHERE id = linked_job;
  END IF;
END
$function$;

-- Repair aggregate rows that may have drifted during the pre-lock race window.
WITH consumer_state AS (
  SELECT outbox_message_id,
    count(*) AS total_count,
    count(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_count,
    count(*) FILTER (WHERE status = 'FAILED') AS failed_count,
    count(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
    COALESCE(max(attempts), 0) AS max_attempt_count
  FROM public.outbox_consumer_executions
  GROUP BY outbox_message_id
)
UPDATE public.outbox_messages o
SET status = CASE
      WHEN s.dead_count > 0 THEN 'DEAD_LETTER'::"AsyncStatus"
      WHEN s.completed_count = s.total_count THEN 'PROCESSED'::"AsyncStatus"
      WHEN s.failed_count > 0 THEN 'FAILED'::"AsyncStatus"
      ELSE 'PROCESSING'::"AsyncStatus"
    END,
    attempts = s.max_attempt_count,
    processed_at = CASE WHEN s.completed_count = s.total_count THEN COALESCE(o.processed_at, now()) ELSE NULL END,
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now(),
    version = o.version + 1
FROM consumer_state s
WHERE o.id = s.outbox_message_id;

WITH consumer_state AS (
  SELECT outbox_message_id,
    count(*) AS total_count,
    count(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_count,
    count(*) FILTER (WHERE status = 'FAILED') AS failed_count,
    count(*) FILTER (WHERE status = 'COMPLETED') AS completed_count,
    COALESCE(max(attempts), 0) AS max_attempt_count
  FROM public.outbox_consumer_executions
  GROUP BY outbox_message_id
)
UPDATE public.background_jobs j
SET status = CASE
      WHEN s.dead_count > 0 THEN 'DEAD_LETTER'::"BackgroundJobStatus"
      WHEN s.completed_count = s.total_count THEN 'COMPLETED'::"BackgroundJobStatus"
      WHEN s.failed_count > 0 THEN 'RETRYING'::"BackgroundJobStatus"
      ELSE 'RUNNING'::"BackgroundJobStatus"
    END,
    attempts = s.max_attempt_count,
    progress = CASE WHEN s.total_count = 0 THEN 0 ELSE floor(s.completed_count * 100.0 / s.total_count)::integer END,
    started_at = COALESCE(j.started_at, now()),
    heartbeat_at = now(),
    finished_at = CASE WHEN s.dead_count > 0 OR s.completed_count = s.total_count THEN COALESCE(j.finished_at, now()) ELSE NULL END,
    updated_at = now(),
    version = j.version + 1
FROM public.outbox_messages o
JOIN consumer_state s ON s.outbox_message_id = o.id
WHERE j.id = o.background_job_id;

REVOKE ALL ON FUNCTION public.weddingos_reconcile_outbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_reconcile_outbox(uuid) TO weddingos_worker;
