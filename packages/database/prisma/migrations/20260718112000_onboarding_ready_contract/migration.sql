-- Slice 2A completes data collection only. A completed draft is therefore
-- READY for Slice 2B plan generation, not a generated/completed plan.
ALTER TYPE "OnboardingStatus" RENAME TO "OnboardingStatus_legacy";
CREATE TYPE "OnboardingStatus" AS ENUM ('DRAFT', 'READY', 'SUPERSEDED');

ALTER TABLE "onboarding_drafts"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "OnboardingStatus"
    USING (
      CASE
        WHEN "status"::text = 'COMPLETED' THEN 'READY'
        ELSE "status"::text
      END
    )::"OnboardingStatus",
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "OnboardingStatus_legacy";

-- Complete the durable async metadata required for recovery, observability and
-- privacy-safe delivery audit.
ALTER TABLE "outbox_messages"
  ADD COLUMN "aggregate_version" INTEGER NOT NULL DEFAULT 1;
CREATE INDEX "outbox_messages_event_name_idx" ON "outbox_messages"("event_name");
CREATE INDEX "outbox_messages_locked_at_idx" ON "outbox_messages"("locked_at");

ALTER TABLE "background_jobs"
  ADD COLUMN "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "heartbeat_at" TIMESTAMP(3),
  ADD COLUMN "cancel_requested_at" TIMESTAMP(3);

ALTER TABLE "delivery_attempts"
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "source_type" VARCHAR(80) NOT NULL DEFAULT 'background_job',
  ADD COLUMN "source_id" VARCHAR(160),
  ADD COLUMN "recipient_reference" VARCHAR(80) NOT NULL DEFAULT 'unavailable';
UPDATE "delivery_attempts"
SET "source_id" = "background_job_id"::text
WHERE "source_id" IS NULL;
ALTER TABLE "delivery_attempts" ALTER COLUMN "source_id" SET NOT NULL;
CREATE INDEX "delivery_attempts_workspace_id_created_at_idx"
  ON "delivery_attempts"("workspace_id", "created_at");

ALTER TABLE "notifications"
  ADD COLUMN "module" VARCHAR(80) NOT NULL DEFAULT 'system',
  ADD COLUMN "priority" VARCHAR(40) NOT NULL DEFAULT 'normal';

ALTER TABLE "activity_items"
  ADD COLUMN "actor_type" VARCHAR(40) NOT NULL DEFAULT 'user',
  ADD COLUMN "visibility_scope" VARCHAR(40) NOT NULL DEFAULT 'workspace';
