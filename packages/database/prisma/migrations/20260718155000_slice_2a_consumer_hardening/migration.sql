-- Slice 2A final-gate hardening: independently retryable consumers,
-- managed artifacts, and persisted worker-context verification.

CREATE TYPE "ConsumerExecutionStatus" AS ENUM (
  'PENDING', 'ENQUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'
);
CREATE TYPE "GeneratedArtifactStatus" AS ENUM (
  'GENERATING', 'READY', 'EXPIRED', 'DELETED'
);

ALTER TABLE "outbox_messages"
  DROP CONSTRAINT "outbox_messages_background_job_id_fkey";
ALTER TABLE "outbox_messages"
  ALTER COLUMN "background_job_id" DROP NOT NULL;
ALTER TABLE "outbox_messages"
  ADD CONSTRAINT "outbox_messages_background_job_id_fkey"
  FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "background_jobs"
  ADD COLUMN "user_visible" BOOLEAN NOT NULL DEFAULT false;
UPDATE "background_jobs"
SET "user_visible" = true
WHERE "type" IN (
  'activity.export_requested.v1',
  'onboarding.ready_for_plan_generation.v1'
);

CREATE TABLE "outbox_consumer_executions" (
  "id" UUID NOT NULL,
  "outbox_message_id" UUID NOT NULL,
  "background_job_id" UUID,
  "consumer_name" VARCHAR(80) NOT NULL,
  "status" "ConsumerExecutionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "locked_by" VARCHAR(128),
  "started_at" TIMESTAMP(3),
  "heartbeat_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "last_error_code" VARCHAR(100),
  "last_error_message" VARCHAR(500),
  "deduplication_key" VARCHAR(240) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "outbox_consumer_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "outbox_consumer_executions_outbox_consumer_key"
  ON "outbox_consumer_executions"("outbox_message_id", "consumer_name");
CREATE UNIQUE INDEX "outbox_consumer_executions_deduplication_key_key"
  ON "outbox_consumer_executions"("deduplication_key");
CREATE INDEX "outbox_consumer_executions_status_available_at_idx"
  ON "outbox_consumer_executions"("status", "available_at");
CREATE INDEX "outbox_consumer_executions_outbox_status_idx"
  ON "outbox_consumer_executions"("outbox_message_id", "status");
CREATE INDEX "outbox_consumer_executions_job_status_idx"
  ON "outbox_consumer_executions"("background_job_id", "status");
CREATE INDEX "outbox_consumer_executions_locked_at_idx"
  ON "outbox_consumer_executions"("locked_at");

ALTER TABLE "outbox_consumer_executions"
  ADD CONSTRAINT "outbox_consumer_executions_outbox_fkey"
  FOREIGN KEY ("outbox_message_id") REFERENCES "outbox_messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "outbox_consumer_executions"
  ADD CONSTRAINT "outbox_consumer_executions_job_fkey"
  FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Every historical event gets a durable acknowledgement consumer. Optional
-- consumers are reconstructed from persisted hints/provider attempts.
INSERT INTO "outbox_consumer_executions" (
  "id", "outbox_message_id", "background_job_id", "consumer_name", "status",
  "attempts", "max_attempts", "available_at", "completed_at",
  "last_error_code", "last_error_message", "deduplication_key"
)
SELECT gen_random_uuid(), o."id", o."background_job_id", 'event_ack',
  CASE o."status"
    WHEN 'PROCESSED' THEN 'COMPLETED'::"ConsumerExecutionStatus"
    WHEN 'DEAD_LETTER' THEN 'DEAD_LETTER'::"ConsumerExecutionStatus"
    WHEN 'FAILED' THEN 'FAILED'::"ConsumerExecutionStatus"
    WHEN 'PROCESSING' THEN 'ENQUEUED'::"ConsumerExecutionStatus"
    ELSE 'PENDING'::"ConsumerExecutionStatus"
  END,
  o."attempts", o."max_attempts", o."available_at",
  CASE WHEN o."status" = 'PROCESSED' THEN COALESCE(o."processed_at", o."updated_at") END,
  o."last_error_code", o."last_error_message", 'consumer:' || o."id"::text || ':event_ack'
FROM "outbox_messages" o;

INSERT INTO "outbox_consumer_executions" (
  "id", "outbox_message_id", "background_job_id", "consumer_name", "status",
  "attempts", "max_attempts", "available_at", "completed_at",
  "last_error_code", "last_error_message", "deduplication_key"
)
SELECT gen_random_uuid(), o."id", o."background_job_id", c."consumer_name",
  CASE o."status"
    WHEN 'PROCESSED' THEN 'COMPLETED'::"ConsumerExecutionStatus"
    WHEN 'DEAD_LETTER' THEN 'DEAD_LETTER'::"ConsumerExecutionStatus"
    WHEN 'FAILED' THEN 'FAILED'::"ConsumerExecutionStatus"
    WHEN 'PROCESSING' THEN 'ENQUEUED'::"ConsumerExecutionStatus"
    ELSE 'PENDING'::"ConsumerExecutionStatus"
  END,
  o."attempts", o."max_attempts", o."available_at",
  CASE WHEN o."status" = 'PROCESSED' THEN COALESCE(o."processed_at", o."updated_at") END,
  o."last_error_code", o."last_error_message",
  'consumer:' || o."id"::text || ':' || c."consumer_name"
FROM "outbox_messages" o
CROSS JOIN LATERAL (
  SELECT 'email'::text AS "consumer_name"
  WHERE o."encrypted_headers" IS NOT NULL
    OR o."event_name" IN (
      'user.registered.v1', 'user.email_verification_requested.v1',
      'password.reset_requested.v1', 'password.changed.v1',
      'magic_link.requested.v1', 'membership.invited.v1',
      'membership.invitation_resent.v1'
    )
    OR EXISTS (
      SELECT 1 FROM "delivery_attempts" d
      WHERE d."source_id" = o."id"::text
    )
  UNION ALL SELECT 'notification_projection' WHERE o."payload" ? 'notification'
  UNION ALL SELECT 'activity_projection' WHERE o."payload" ? 'activity'
  UNION ALL SELECT 'activity_export' WHERE o."payload" ? 'export'
) c
ON CONFLICT ("outbox_message_id", "consumer_name") DO NOTHING;

ALTER TABLE "delivery_attempts"
  ADD COLUMN "consumer_execution_id" UUID;
UPDATE "delivery_attempts" d
SET "consumer_execution_id" = e."id"
FROM "outbox_consumer_executions" e
JOIN "outbox_messages" o ON o."id" = e."outbox_message_id"
WHERE e."consumer_name" = 'email'
  AND d."source_id" = o."id"::text;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM "delivery_attempts" WHERE "consumer_execution_id" IS NULL) THEN
    RAISE EXCEPTION 'cannot backfill delivery attempt consumer execution';
  END IF;
END
$block$;

ALTER TABLE "delivery_attempts"
  ALTER COLUMN "consumer_execution_id" SET NOT NULL,
  ALTER COLUMN "background_job_id" DROP NOT NULL;
ALTER TABLE "delivery_attempts"
  DROP CONSTRAINT "delivery_attempts_background_job_id_fkey";
ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_background_job_id_fkey"
  FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts"
  ADD CONSTRAINT "delivery_attempts_consumer_execution_id_fkey"
  FOREIGN KEY ("consumer_execution_id") REFERENCES "outbox_consumer_executions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
DROP INDEX "delivery_attempts_background_job_id_attempt_number_key";
CREATE UNIQUE INDEX "delivery_attempts_consumer_execution_attempt_key"
  ON "delivery_attempts"("consumer_execution_id", "attempt_number");
CREATE INDEX "delivery_attempts_consumer_execution_created_at_idx"
  ON "delivery_attempts"("consumer_execution_id", "created_at");

ALTER TABLE "activity_items"
  ADD COLUMN "correlation_id" VARCHAR(128),
  ADD COLUMN "deduplication_key" VARCHAR(240);
UPDATE "activity_items" a
SET "correlation_id" = o."correlation_id",
    "deduplication_key" = 'activity:' || a."source_event_id"::text
FROM "outbox_messages" o
WHERE o."id" = a."source_event_id";
UPDATE "activity_items"
SET "deduplication_key" = 'activity:' || "source_event_id"::text
WHERE "deduplication_key" IS NULL;
ALTER TABLE "activity_items" ALTER COLUMN "deduplication_key" SET NOT NULL;
CREATE UNIQUE INDEX "activity_items_deduplication_key_key"
  ON "activity_items"("deduplication_key");

CREATE TABLE "generated_artifacts" (
  "id" UUID NOT NULL,
  "background_job_id" UUID NOT NULL,
  "consumer_execution_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "owner_user_id" UUID NOT NULL,
  "kind" VARCHAR(80) NOT NULL,
  "status" "GeneratedArtifactStatus" NOT NULL DEFAULT 'GENERATING',
  "storage_provider" VARCHAR(40) NOT NULL DEFAULT 'local',
  "storage_key" VARCHAR(255) NOT NULL,
  "file_name" VARCHAR(255) NOT NULL,
  "media_type" VARCHAR(120) NOT NULL,
  "size_bytes" BIGINT,
  "sha256" CHAR(64),
  "row_count" INTEGER,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "ready_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "generated_artifacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "generated_artifacts_background_job_id_key"
  ON "generated_artifacts"("background_job_id");
CREATE UNIQUE INDEX "generated_artifacts_consumer_execution_id_key"
  ON "generated_artifacts"("consumer_execution_id");
CREATE UNIQUE INDEX "generated_artifacts_storage_key_key"
  ON "generated_artifacts"("storage_key");
CREATE INDEX "generated_artifacts_owner_status_created_idx"
  ON "generated_artifacts"("owner_user_id", "status", "created_at");
CREATE INDEX "generated_artifacts_workspace_status_created_idx"
  ON "generated_artifacts"("workspace_id", "status", "created_at");
CREATE INDEX "generated_artifacts_status_expires_idx"
  ON "generated_artifacts"("status", "expires_at");
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_background_job_id_fkey"
  FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_consumer_execution_id_fkey"
  FOREIGN KEY ("consumer_execution_id") REFERENCES "outbox_consumer_executions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_artifacts"
  ADD CONSTRAINT "generated_artifacts_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT ON TABLE "outbox_consumer_executions" TO weddingos_app;
GRANT SELECT ON TABLE "generated_artifacts" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "outbox_consumer_executions", "generated_artifacts" TO weddingos_worker;

ALTER TABLE "outbox_consumer_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_consumer_executions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "generated_artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "generated_artifacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "consumer_executions_app_read" ON "outbox_consumer_executions"
FOR SELECT TO weddingos_app USING (
  EXISTS (SELECT 1 FROM "outbox_messages" o WHERE o."id" = "outbox_message_id")
);
CREATE POLICY "consumer_executions_app_insert" ON "outbox_consumer_executions"
FOR INSERT TO weddingos_app WITH CHECK (
  EXISTS (SELECT 1 FROM "outbox_messages" o WHERE o."id" = "outbox_message_id")
);
CREATE POLICY "artifacts_app_read" ON "generated_artifacts"
FOR SELECT TO weddingos_app USING (
  "owner_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);

CREATE OR REPLACE FUNCTION public.weddingos_worker_execution_context_matches(
  target_execution uuid DEFAULT NULL,
  target_outbox uuid DEFAULT NULL,
  target_job uuid DEFAULT NULL,
  target_workspace uuid DEFAULT NULL,
  target_actor uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT session_user = 'weddingos_worker'
    AND NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.outbox_consumer_executions e
      JOIN public.outbox_messages o ON o.id = e.outbox_message_id
      WHERE e.id = NULLIF(current_setting('app.current_consumer_execution_id', true), '')::uuid
        AND (target_execution IS NULL OR e.id = target_execution)
        AND (target_outbox IS NULL OR o.id = target_outbox)
        AND (target_job IS NULL OR e.background_job_id = target_job)
        AND (target_workspace IS NULL OR o.workspace_id = target_workspace)
        AND (target_actor IS NULL OR o.actor_user_id = target_actor)
    );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_worker_execution_context_matches(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_worker_execution_context_matches(uuid, uuid, uuid, uuid, uuid) TO weddingos_worker;

DROP POLICY "outbox_worker_policy" ON "outbox_messages";
DROP POLICY "jobs_worker_policy" ON "background_jobs";
DROP POLICY "delivery_attempts_worker_policy" ON "delivery_attempts";
DROP POLICY "notifications_worker_policy" ON "notifications";
DROP POLICY "activity_worker_policy" ON "activity_items";
DROP POLICY "delivery_attempts_app_read" ON "delivery_attempts";

CREATE POLICY "consumer_executions_worker_policy" ON "outbox_consumer_executions"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches("id", "outbox_message_id", "background_job_id", NULL, NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches("id", "outbox_message_id", "background_job_id", NULL, NULL));
CREATE POLICY "outbox_worker_policy" ON "outbox_messages"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, "id", "background_job_id", "workspace_id", "actor_user_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, "id", "background_job_id", "workspace_id", "actor_user_id"));
CREATE POLICY "jobs_worker_policy" ON "background_jobs"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, "id", "workspace_id", "actor_user_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, "id", "workspace_id", "actor_user_id"));
CREATE POLICY "delivery_attempts_worker_policy" ON "delivery_attempts"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", NULL));
CREATE POLICY "notifications_worker_policy" ON "notifications"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "user_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "user_id"));
CREATE POLICY "activity_worker_policy" ON "activity_items"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));
CREATE POLICY "artifacts_worker_policy" ON "generated_artifacts"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", "owner_user_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", "owner_user_id"));
CREATE POLICY "delivery_attempts_app_read" ON "delivery_attempts"
FOR SELECT TO weddingos_app USING (
  EXISTS (
    SELECT 1
    FROM "outbox_consumer_executions" e
    JOIN "outbox_messages" o ON o."id" = e."outbox_message_id"
    WHERE e."id" = "consumer_execution_id"
      AND (
        o."actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR public.weddingos_has_workspace_access(o."workspace_id")
      )
  )
);

DROP FUNCTION public.weddingos_claim_outbox(text, integer);

CREATE FUNCTION public.weddingos_claim_consumer_executions(claim_worker_id text, claim_limit integer)
RETURNS TABLE (
  execution_id uuid,
  outbox_message_id uuid,
  consumer_name text,
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
    SELECT e.id
    FROM public.outbox_consumer_executions e
    WHERE e.available_at <= now()
      AND (
        (e.status IN ('PENDING', 'FAILED') AND (e.locked_at IS NULL OR e.locked_at < now() - interval '2 minutes'))
        OR (e.status IN ('ENQUEUED', 'PROCESSING') AND e.locked_at < now() - interval '2 minutes')
      )
    ORDER BY e.available_at, e.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT claim_limit
  ), claimed AS (
    UPDATE public.outbox_consumer_executions e
    SET status = 'ENQUEUED', locked_at = now(), locked_by = claim_worker_id,
        updated_at = now(), version = e.version + 1
    FROM candidates
    WHERE e.id = candidates.id
    RETURNING e.*
  )
  SELECT claimed.id, claimed.outbox_message_id, claimed.consumer_name::text, claimed.max_attempts
  FROM claimed;
END
$function$;
REVOKE ALL ON FUNCTION public.weddingos_claim_consumer_executions(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_claim_consumer_executions(text, integer) TO weddingos_worker;

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
  actor_user_id uuid,
  correlation_id text,
  event_name text,
  payload jsonb,
  encrypted_headers text,
  attempt_number integer,
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
  RETURN QUERY
  WITH started AS (
    UPDATE public.outbox_consumer_executions e
    SET status = 'PROCESSING', attempts = e.attempts + 1,
        locked_at = now(), locked_by = claim_worker_id,
        started_at = COALESCE(e.started_at, now()), heartbeat_at = now(),
        last_error_code = NULL, last_error_message = NULL,
        updated_at = now(), version = e.version + 1
    WHERE e.id = target_execution
      AND e.outbox_message_id = target_outbox
      AND e.consumer_name = target_consumer
      AND e.status NOT IN ('COMPLETED', 'DEAD_LETTER')
    RETURNING e.*
  )
  SELECT s.id, o.id, s.consumer_name::text, s.background_job_id,
    o.workspace_id, o.actor_user_id, o.correlation_id::text, o.event_name::text,
    o.payload, o.encrypted_headers, s.attempts, s.max_attempts
  FROM started s
  JOIN public.outbox_messages o ON o.id = s.outbox_message_id;
END
$function$;
REVOKE ALL ON FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text) TO weddingos_worker;

CREATE FUNCTION public.weddingos_fail_consumer_enqueue(
  target_execution uuid,
  claim_worker_id text,
  failure_code text,
  failure_message text,
  retry_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  linked_outbox uuid;
  linked_job uuid;
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.outbox_consumer_executions
  SET status = 'FAILED', available_at = retry_at,
      locked_at = NULL, locked_by = NULL,
      last_error_code = left(failure_code, 100),
      last_error_message = left(failure_message, 500),
      updated_at = now(), version = version + 1
  WHERE id = target_execution AND locked_by = claim_worker_id
  RETURNING outbox_message_id, background_job_id INTO linked_outbox, linked_job;
  IF linked_outbox IS NOT NULL THEN
    UPDATE public.outbox_messages
    SET status = 'FAILED', available_at = retry_at,
        last_error_code = left(failure_code, 100),
        last_error_message = left(failure_message, 500),
        updated_at = now(), version = version + 1
    WHERE id = linked_outbox;
  END IF;
  IF linked_job IS NOT NULL THEN
    UPDATE public.background_jobs
    SET status = 'RETRYING', available_at = retry_at,
        error_code = left(failure_code, 100),
        error_message = left(failure_message, 500),
        updated_at = now(), version = version + 1
    WHERE id = linked_job;
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.weddingos_fail_consumer_enqueue(uuid, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_fail_consumer_enqueue(uuid, text, text, text, timestamptz) TO weddingos_worker;

CREATE FUNCTION public.weddingos_reconcile_outbox(target_outbox uuid)
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
  SELECT count(*), count(*) FILTER (WHERE status = 'DEAD_LETTER'),
    count(*) FILTER (WHERE status = 'FAILED'), count(*) FILTER (WHERE status = 'COMPLETED'),
    COALESCE(max(attempts), 0), max(background_job_id),
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
REVOKE ALL ON FUNCTION public.weddingos_reconcile_outbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_reconcile_outbox(uuid) TO weddingos_worker;

CREATE FUNCTION public.weddingos_claim_expired_artifacts(claim_worker_id text, claim_limit integer)
RETURNS TABLE (artifact_id uuid, storage_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT a.id
    FROM public.generated_artifacts a
    WHERE (a.status = 'READY' AND a.expires_at <= now())
       OR (a.status IN ('GENERATING', 'EXPIRED') AND a.created_at <= now() - interval '1 hour' AND a.deleted_at IS NULL)
    ORDER BY a.expires_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(claim_limit, 100))
  ), claimed AS (
    UPDATE public.generated_artifacts a
    SET status = 'EXPIRED', updated_at = now(), version = a.version + 1
    FROM candidates WHERE a.id = candidates.id
    RETURNING a.id, a.storage_key
  )
  SELECT claimed.id, claimed.storage_key::text FROM claimed;
END
$function$;
REVOKE ALL ON FUNCTION public.weddingos_claim_expired_artifacts(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_claim_expired_artifacts(text, integer) TO weddingos_worker;

CREATE FUNCTION public.weddingos_mark_artifact_deleted(target_artifact uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.generated_artifacts
  SET status = 'DELETED', deleted_at = now(), updated_at = now(), version = version + 1
  WHERE id = target_artifact AND status = 'EXPIRED';
END
$function$;
REVOKE ALL ON FUNCTION public.weddingos_mark_artifact_deleted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_mark_artifact_deleted(uuid) TO weddingos_worker;
