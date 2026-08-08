BEGIN;

ALTER TABLE "retention_executions"
  ADD COLUMN "policy_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "entity_type" VARCHAR(100) NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "query_from" TIMESTAMP(3),
  ADD COLUMN "query_to" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "candidate_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "estimated_bytes" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "started_at" TIMESTAMP(3);

CREATE TABLE "deletion_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deletion_request_id" UUID NOT NULL,
  "target_type" VARCHAR(40) NOT NULL,
  "target_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  "policy_version" INTEGER NOT NULL DEFAULT 1,
  "grace_ends_at" TIMESTAMP(3) NOT NULL,
  "steps" JSONB NOT NULL,
  "preservation" JSONB NOT NULL,
  "blockers" JSONB NOT NULL DEFAULT '[]',
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "approved_by_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deletion_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deletion_plans_request_fk" FOREIGN KEY ("deletion_request_id") REFERENCES "deletion_requests"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "deletion_plans_deletion_request_id_key" ON "deletion_plans"("deletion_request_id");
CREATE INDEX "deletion_plans_target_type_target_id_status_idx" ON "deletion_plans"("target_type", "target_id", "status");

CREATE TABLE "deletion_executions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "deletion_plan_id" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
  "anonymized_count" INTEGER NOT NULL DEFAULT 0,
  "purged_count" INTEGER NOT NULL DEFAULT 0,
  "preserved_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB NOT NULL DEFAULT '{}',
  "error_redacted" VARCHAR(1000),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deletion_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deletion_executions_plan_fk" FOREIGN KEY ("deletion_plan_id") REFERENCES "deletion_plans"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "deletion_executions_idempotency_key_key" ON "deletion_executions"("idempotency_key");
CREATE INDEX "deletion_executions_plan_status_created_idx" ON "deletion_executions"("deletion_plan_id", "status", "created_at");

CREATE TABLE "backup_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "environment" VARCHAR(24) NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "backup_type" VARCHAR(30) NOT NULL,
  "cron_expression" VARCHAR(80) NOT NULL,
  "timezone" VARCHAR(80) NOT NULL DEFAULT 'Europe/Chisinau',
  "retention_days" INTEGER NOT NULL,
  "minimum_verified" INTEGER NOT NULL DEFAULT 2,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "next_run_at" TIMESTAMP(3) NOT NULL,
  "last_run_at" TIMESTAMP(3),
  "last_successful_at" TIMESTAMP(3),
  "lease_owner" VARCHAR(128),
  "lease_expires_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "backup_schedules_environment_key_key" ON "backup_schedules"("environment", "key");
CREATE INDEX "backup_schedules_environment_enabled_next_idx" ON "backup_schedules"("environment", "enabled", "next_run_at");

INSERT INTO "backup_schedules" ("environment", "key", "backup_type", "cron_expression", "retention_days", "minimum_verified", "next_run_at")
SELECT environment, schedule.key, schedule.kind, schedule.cron, schedule.days, 2, CURRENT_TIMESTAMP
FROM (VALUES ('development'), ('test'), ('staging'), ('production')) environments(environment)
CROSS JOIN (VALUES
  ('daily-database', 'DATABASE', '0 2 * * *', 14),
  ('daily-objects', 'OBJECT_INVENTORY', '30 2 * * *', 14),
  ('weekly-full', 'FULL', '0 3 * * 0', 35)
) schedule(key, kind, cron, days)
ON CONFLICT ("environment", "key") DO NOTHING;

ALTER TABLE "deletion_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deletion_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "deletion_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deletion_executions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "backup_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "backup_schedules" FORCE ROW LEVEL SECURITY;

CREATE POLICY "deletion_plan_platform" ON "deletion_plans" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.process'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));
CREATE POLICY "deletion_execution_platform" ON "deletion_executions" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.privacy.process'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.privacy.process'));
CREATE POLICY "backup_schedule_platform" ON "backup_schedules" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.release.read'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.release.approve'));

GRANT SELECT, INSERT, UPDATE ON "deletion_plans", "deletion_executions" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE ON "backup_schedules" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "deletion_plans", "deletion_executions", "backup_schedules" TO weddingos_worker;

COMMIT;
