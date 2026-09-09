ALTER TYPE "WorkspaceBillingEventStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "WorkspaceBillingEventStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

CREATE TYPE "WorkspaceUsageReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- Prisma sends the migration file as one PostgreSQL query string. Commit enum
-- changes before the transactional DDL below so the new enum values are safe
-- to reference from indexes and claim functions in the same migration file.
COMMIT;

BEGIN;

ALTER TABLE "workspace_subscriptions"
  ADD COLUMN "past_due_at" TIMESTAMP(3),
  ADD COLUMN "grace_period_end_at" TIMESTAMP(3);

CREATE INDEX "workspace_subscriptions_status_grace_period_end_at_idx"
  ON "workspace_subscriptions"("status", "grace_period_end_at");

ALTER TABLE "workspace_billing_checkouts"
  ADD COLUMN "last_reconciled_at" TIMESTAMP(3),
  ADD COLUMN "reconciliation_attempts" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "workspace_billing_checkouts_one_open_per_workspace"
  ON "workspace_billing_checkouts"("workspace_id")
  WHERE "status" = 'CREATED';

ALTER TABLE "workspace_billing_provider_events"
  ADD COLUMN "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "assignment_token_hash" CHAR(64),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "error_message" VARCHAR(500);

ALTER TABLE "workspace_billing_provider_events"
  ALTER COLUMN "payload" DROP DEFAULT;

CREATE INDEX "workspace_billing_provider_events_status_next_attempt_at_idx"
  ON "workspace_billing_provider_events"("status", "next_attempt_at");

ALTER TABLE "platform_support_cases"
  ADD COLUMN "priority_rank" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "plan_key_at_creation" "WorkspaceSubscriptionPlanKey";

DROP INDEX IF EXISTS "platform_support_cases_status_priority_created_at_idx";
CREATE INDEX "platform_support_cases_status_priority_rank_created_at_idx"
  ON "platform_support_cases"("status", "priority_rank", "created_at");

CREATE TABLE "workspace_usage_periods" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "metric" VARCHAR(80) NOT NULL,
  "period_start" DATE NOT NULL,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "consumed" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_usage_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_usage_periods_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "workspace_usage_periods_workspace_id_metric_period_start_key"
  ON "workspace_usage_periods"("workspace_id", "metric", "period_start");
CREATE INDEX "workspace_usage_periods_workspace_id_period_start_idx"
  ON "workspace_usage_periods"("workspace_id", "period_start");

CREATE TABLE "workspace_usage_reservations" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "period_id" UUID NOT NULL,
  "metric" VARCHAR(80) NOT NULL,
  "source_type" VARCHAR(80) NOT NULL,
  "source_id" VARCHAR(160) NOT NULL,
  "amount" INTEGER NOT NULL DEFAULT 1,
  "status" "WorkspaceUsageReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "consumed_at" TIMESTAMP(3),
  "released_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_usage_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_usage_reservations_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_usage_reservations_period_id_fkey"
    FOREIGN KEY ("period_id") REFERENCES "workspace_usage_periods"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_usage_reservations_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "workspace_usage_reservations_workspace_metric_source_key"
  ON "workspace_usage_reservations"("workspace_id", "metric", "source_type", "source_id");
CREATE INDEX "workspace_usage_reservations_period_id_status_idx"
  ON "workspace_usage_reservations"("period_id", "status");
CREATE INDEX "workspace_usage_reservations_workspace_id_created_at_idx"
  ON "workspace_usage_reservations"("workspace_id", "created_at");

ALTER TABLE "workspace_usage_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_usage_periods" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_usage_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_usage_reservations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_usage_periods_tenant" ON "workspace_usage_periods"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "workspace_usage_reservations_tenant" ON "workspace_usage_reservations"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "workspace_usage_periods_worker" ON "workspace_usage_periods"
  FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "workspace_usage_reservations_worker" ON "workspace_usage_reservations"
  FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "workspace_usage_periods", "workspace_usage_reservations" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_usage_periods", "workspace_usage_reservations" TO weddingos_worker;

CREATE POLICY "platform_support_cases_workspace_create" ON "platform_support_cases"
  FOR INSERT TO weddingos_app
  WITH CHECK (
    "requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
    AND "priority" IN ('NORMAL', 'HIGH')
  );

CREATE POLICY "platform_support_cases_workspace_read" ON "platform_support_cases"
  FOR SELECT TO weddingos_app
  USING (
    "requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE OR REPLACE FUNCTION public.weddingos_claim_workspace_billing_events(batch_size integer)
RETURNS TABLE ("event_id" uuid, "workspace_id" uuid, "actor_user_id" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT event.id
    FROM workspace_billing_provider_events event
    WHERE event.attempt_count < 10
      AND event.next_attempt_at <= now()
      AND (
        event.status IN ('RECEIVED', 'FAILED')
        OR (event.status = 'PROCESSING' AND event.next_attempt_at <= now())
      )
    ORDER BY event.received_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(batch_size, 50))
  ), claimed AS (
    UPDATE workspace_billing_provider_events event
    SET status = 'PROCESSING',
        attempt_count = event.attempt_count + 1,
        next_attempt_at = now() + interval '2 minutes',
        error_code = NULL,
        error_message = NULL
    FROM due
    WHERE event.id = due.id
    RETURNING event.id, event.workspace_id, event.checkout_id
  )
  SELECT claimed.id,
         claimed.workspace_id,
         COALESCE(checkout.created_by, subscription.updated_by, workspace.created_by)
  FROM claimed
  JOIN workspaces workspace ON workspace.id = claimed.workspace_id
  LEFT JOIN workspace_billing_checkouts checkout ON checkout.id = claimed.checkout_id
  LEFT JOIN workspace_subscriptions subscription ON subscription.workspace_id = claimed.workspace_id;
$$;

REVOKE ALL ON FUNCTION public.weddingos_claim_workspace_billing_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_claim_workspace_billing_events(integer) TO weddingos_app, weddingos_worker;

CREATE OR REPLACE FUNCTION public.weddingos_claim_workspace_subscription_reconciliation(batch_size integer)
RETURNS TABLE ("workspace_id" uuid, "subscription_id" text, "actor_user_id" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT subscription.id
    FROM workspace_subscriptions subscription
    WHERE subscription.provider = 'paddle'
      AND subscription.provider_subscription_id IS NOT NULL
      AND subscription.status IN ('ACTIVE', 'PAST_DUE', 'PAUSED')
      AND (subscription.last_reconciled_at IS NULL OR subscription.last_reconciled_at < now() - interval '1 hour')
    ORDER BY subscription.last_reconciled_at ASC NULLS FIRST
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(batch_size, 25))
  ), claimed AS (
    UPDATE workspace_subscriptions subscription
    SET last_reconciled_at = now()
    FROM due
    WHERE subscription.id = due.id
    RETURNING subscription.workspace_id, subscription.provider_subscription_id, subscription.updated_by
  )
  SELECT claimed.workspace_id, claimed.provider_subscription_id, claimed.updated_by FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.weddingos_claim_workspace_subscription_reconciliation(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_claim_workspace_subscription_reconciliation(integer) TO weddingos_app, weddingos_worker;

CREATE OR REPLACE FUNCTION public.weddingos_claim_workspace_checkout_reconciliation(batch_size integer)
RETURNS TABLE ("workspace_id" uuid, "checkout_id" uuid, "transaction_id" text, "actor_user_id" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT checkout.id
    FROM workspace_billing_checkouts checkout
    WHERE checkout.status = 'CREATED'
      AND checkout.provider_transaction_id IS NOT NULL
      AND checkout.created_at < now() - interval '5 minutes'
      AND checkout.reconciliation_attempts < 12
      AND (checkout.last_reconciled_at IS NULL OR checkout.last_reconciled_at < now() - interval '5 minutes')
    ORDER BY checkout.last_reconciled_at ASC NULLS FIRST
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(batch_size, 25))
  ), claimed AS (
    UPDATE workspace_billing_checkouts checkout
    SET last_reconciled_at = now(),
        reconciliation_attempts = checkout.reconciliation_attempts + 1
    FROM due
    WHERE checkout.id = due.id
    RETURNING checkout.workspace_id, checkout.id, checkout.provider_transaction_id, checkout.created_by
  )
  SELECT claimed.workspace_id, claimed.id, claimed.provider_transaction_id, claimed.created_by FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.weddingos_claim_workspace_checkout_reconciliation(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_claim_workspace_checkout_reconciliation(integer) TO weddingos_app, weddingos_worker;

COMMIT;
