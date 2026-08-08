-- The restricted worker cannot scan tenant rows directly. This narrow,
-- security-definer function is its only discovery mechanism and atomically
-- claims retryable outbox rows without exposing unrelated data.
CREATE OR REPLACE FUNCTION public.weddingos_claim_outbox(claim_worker_id text, claim_limit integer)
RETURNS TABLE (
  id uuid,
  event_name text,
  background_job_id uuid,
  workspace_id uuid,
  actor_user_id uuid,
  correlation_id text,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  IF claim_worker_id IS NULL OR length(claim_worker_id) < 3 OR claim_limit < 1 OR claim_limit > 100 THEN
    RAISE EXCEPTION 'invalid claim arguments' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT message.id
    FROM public.outbox_messages AS message
    WHERE message.status IN ('PENDING', 'FAILED', 'PROCESSING')
      AND message.available_at <= now()
      AND (message.locked_at IS NULL OR message.locked_at < now() - interval '2 minutes')
    ORDER BY message.available_at, message.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  ), claimed AS (
    UPDATE public.outbox_messages AS message
    SET locked_at = now(), locked_by = claim_worker_id, updated_at = now(), version = message.version + 1
    FROM candidates
    WHERE message.id = candidates.id
    RETURNING message.*
  )
  SELECT claimed.id, claimed.event_name::text, claimed.background_job_id,
    claimed.workspace_id, claimed.actor_user_id, claimed.correlation_id::text,
    claimed.max_attempts
  FROM claimed;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_claim_outbox(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_claim_outbox(text, integer) TO weddingos_worker;
