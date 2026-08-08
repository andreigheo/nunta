-- CreateEnum
CREATE TYPE "AsyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "DeliveryOutcome" AS ENUM ('SUCCEEDED', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED');

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "event_name" VARCHAR(120) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "aggregate_type" VARCHAR(80) NOT NULL,
    "aggregate_id" VARCHAR(160) NOT NULL,
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "background_job_id" UUID NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "idempotency_key" VARCHAR(200),
    "deduplication_key" VARCHAR(240) NOT NULL,
    "payload" JSONB NOT NULL,
    "encrypted_headers" TEXT,
    "status" "AsyncStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" VARCHAR(128),
    "last_error_code" VARCHAR(100),
    "last_error_message" VARCHAR(500),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "type" VARCHAR(120) NOT NULL,
    "queue" VARCHAR(120) NOT NULL DEFAULT 'weddingos-domain-events',
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "correlation_id" VARCHAR(128) NOT NULL,
    "idempotency_key" VARCHAR(200),
    "deduplication_key" VARCHAR(240) NOT NULL,
    "payload" JSONB,
    "result" JSONB,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" UUID NOT NULL,
    "background_job_id" UUID NOT NULL,
    "channel" VARCHAR(40) NOT NULL DEFAULT 'email',
    "provider" VARCHAR(80) NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "outcome" "DeliveryOutcome" NOT NULL,
    "provider_message_id" VARCHAR(255),
    "error_class" VARCHAR(100),
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID,
    "kind" VARCHAR(80) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "action_url" VARCHAR(2048),
    "source_event_id" UUID NOT NULL,
    "deduplication_key" VARCHAR(240) NOT NULL,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_name" VARCHAR(180),
    "category" VARCHAR(80) NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" VARCHAR(160),
    "summary" VARCHAR(1000) NOT NULL,
    "metadata" JSONB,
    "source_event_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_drafts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'DRAFT',
    "couple" JSONB NOT NULL DEFAULT '{}',
    "date_events" JSONB NOT NULL DEFAULT '{}',
    "location" JSONB NOT NULL DEFAULT '{}',
    "guests" JSONB NOT NULL DEFAULT '{}',
    "budget" JSONB NOT NULL DEFAULT '{}',
    "style" JSONB NOT NULL DEFAULT '{}',
    "existing_progress" JSONB NOT NULL DEFAULT '{}',
    "planning_preferences" JSONB NOT NULL DEFAULT '{}',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "onboarding_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" VARCHAR(128) NOT NULL,
    "role" VARCHAR(80) NOT NULL DEFAULT 'domain-events',
    "metadata" JSONB,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_messages_background_job_id_key" ON "outbox_messages"("background_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_messages_deduplication_key_key" ON "outbox_messages"("deduplication_key");

-- CreateIndex
CREATE INDEX "outbox_messages_status_available_at_idx" ON "outbox_messages"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_messages_workspace_id_created_at_idx" ON "outbox_messages"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_deduplication_key_key" ON "background_jobs"("deduplication_key");

-- CreateIndex
CREATE INDEX "background_jobs_actor_user_id_created_at_idx" ON "background_jobs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "background_jobs_workspace_id_status_created_at_idx" ON "background_jobs"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "background_jobs_status_available_at_idx" ON "background_jobs"("status", "available_at");

-- CreateIndex
CREATE INDEX "delivery_attempts_background_job_id_created_at_idx" ON "delivery_attempts"("background_job_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_background_job_id_attempt_number_key" ON "delivery_attempts"("background_job_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_source_event_id_key" ON "notifications"("source_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_deduplication_key_key" ON "notifications"("deduplication_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_dismissed_at_created_at_idx" ON "notifications"("user_id", "dismissed_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_workspace_id_created_at_idx" ON "notifications"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "activity_items_source_event_id_key" ON "activity_items"("source_event_id");

-- CreateIndex
CREATE INDEX "activity_items_workspace_id_occurred_at_idx" ON "activity_items"("workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "activity_items_workspace_id_category_occurred_at_idx" ON "activity_items"("workspace_id", "category", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_drafts_workspace_id_key" ON "onboarding_drafts"("workspace_id");

-- CreateIndex
CREATE INDEX "onboarding_drafts_user_id_updated_at_idx" ON "onboarding_drafts"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "worker_heartbeats_last_seen_at_idx" ON "worker_heartbeats"("last_seen_at");

-- Referential integrity for the durable async surface.
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_background_job_id_fkey" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_background_job_id_fkey" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_items" ADD CONSTRAINT "activity_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_items" ADD CONSTRAINT "activity_items_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_drafts" ADD CONSTRAINT "onboarding_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The worker is deliberately not an owner and cannot bypass RLS. Fresh local
-- databases create it as a LOGIN in init-app-role.sql; migration-only hosts may
-- pre-provision credentials and this fallback remains NOLOGIN.
DO $block$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'weddingos_worker') THEN
    CREATE ROLE weddingos_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$block$;

GRANT CONNECT ON DATABASE weddingos TO weddingos_worker;
GRANT USAGE ON SCHEMA public TO weddingos_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE "outbox_messages", "background_jobs", "delivery_attempts", "notifications", "activity_items", "worker_heartbeats" TO weddingos_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "outbox_messages", "background_jobs", "notifications", "activity_items", "onboarding_drafts" TO weddingos_app;
GRANT SELECT ON TABLE "delivery_attempts", "worker_heartbeats" TO weddingos_app;

ALTER TABLE "outbox_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "background_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "background_jobs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_attempts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "activity_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "onboarding_drafts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "worker_heartbeats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "worker_heartbeats" FORCE ROW LEVEL SECURITY;

CREATE POLICY "outbox_app_policy" ON "outbox_messages" FOR ALL TO weddingos_app
  USING (
    "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  )
  WITH CHECK (
    "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  );

CREATE POLICY "jobs_app_policy" ON "background_jobs" FOR ALL TO weddingos_app
  USING (
    "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  )
  WITH CHECK (
    "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  );

CREATE POLICY "delivery_attempts_app_read" ON "delivery_attempts" FOR SELECT TO weddingos_app
  USING (EXISTS (
    SELECT 1 FROM "background_jobs" job
    WHERE job."id" = "delivery_attempts"."background_job_id"
      AND (job."actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR public.weddingos_has_workspace_access(job."workspace_id"))
  ));

CREATE POLICY "notifications_app_policy" ON "notifications" FOR ALL TO weddingos_app
  USING ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

CREATE POLICY "activity_app_policy" ON "activity_items" FOR SELECT TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "onboarding_app_policy" ON "onboarding_drafts" FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "outbox_worker_policy" ON "outbox_messages" FOR ALL TO weddingos_worker
  USING (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "background_job_id" = NULLIF(current_setting('app.current_job_id', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "background_job_id" = NULLIF(current_setting('app.current_job_id', true), '')::uuid
  );

CREATE POLICY "jobs_worker_policy" ON "background_jobs" FOR ALL TO weddingos_worker
  USING (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "id" = NULLIF(current_setting('app.current_job_id', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "id" = NULLIF(current_setting('app.current_job_id', true), '')::uuid
  );

CREATE POLICY "delivery_attempts_worker_policy" ON "delivery_attempts" FOR ALL TO weddingos_worker
  USING (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "background_job_id" = NULLIF(current_setting('app.current_job_id', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "background_job_id" = NULLIF(current_setting('app.current_job_id', true), '')::uuid
  );

CREATE POLICY "notifications_worker_policy" ON "notifications" FOR ALL TO weddingos_worker
  USING (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      OR ("workspace_id" IS NULL AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      OR ("workspace_id" IS NULL AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid))
  );

CREATE POLICY "activity_worker_policy" ON "activity_items" FOR ALL TO weddingos_worker
  USING (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  );

CREATE POLICY "heartbeats_worker_policy" ON "worker_heartbeats" FOR ALL TO weddingos_worker
  USING ("id" = NULLIF(current_setting('app.current_worker_id', true), ''))
  WITH CHECK ("id" = NULLIF(current_setting('app.current_worker_id', true), ''));

CREATE POLICY "heartbeats_app_read" ON "worker_heartbeats" FOR SELECT TO weddingos_app
  USING (true);
