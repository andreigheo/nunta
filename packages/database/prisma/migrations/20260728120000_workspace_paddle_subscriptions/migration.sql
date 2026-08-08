BEGIN;

CREATE TYPE "WorkspaceSubscriptionPlanKey" AS ENUM ('FREE', 'PLUS', 'PRO');
CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM ('FREE', 'INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELED');
CREATE TYPE "WorkspaceBillingCheckoutStatus" AS ENUM ('CREATED', 'COMPLETED', 'EXPIRED', 'FAILED');
CREATE TYPE "WorkspaceBillingEventStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');

CREATE TABLE "workspace_subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "plan_key" "WorkspaceSubscriptionPlanKey" NOT NULL DEFAULT 'FREE',
  "status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'FREE',
  "provider" VARCHAR(32),
  "provider_customer_id" VARCHAR(64),
  "provider_subscription_id" VARCHAR(64),
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "last_provider_event_at" TIMESTAMP(3),
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "workspace_subscriptions_workspace_id_key" ON "workspace_subscriptions"("workspace_id");
CREATE UNIQUE INDEX "workspace_subscriptions_provider_customer_id_key" ON "workspace_subscriptions"("provider_customer_id");
CREATE UNIQUE INDEX "workspace_subscriptions_provider_subscription_id_key" ON "workspace_subscriptions"("provider_subscription_id");
CREATE INDEX "workspace_subscriptions_status_current_period_end_idx" ON "workspace_subscriptions"("status", "current_period_end");

CREATE TABLE "workspace_billing_checkouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "plan_key" "WorkspaceSubscriptionPlanKey" NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "provider_price_id" VARCHAR(64) NOT NULL,
  "provider_transaction_id" VARCHAR(64),
  "idempotency_key" VARCHAR(200) NOT NULL,
  "status" "WorkspaceBillingCheckoutStatus" NOT NULL DEFAULT 'CREATED',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_billing_checkouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_billing_checkouts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "workspace_billing_checkouts_provider_transaction_id_key" ON "workspace_billing_checkouts"("provider_transaction_id");
CREATE UNIQUE INDEX "workspace_billing_checkouts_workspace_id_created_by_idempotency_key_key" ON "workspace_billing_checkouts"("workspace_id", "created_by", "idempotency_key");
CREATE INDEX "workspace_billing_checkouts_workspace_id_created_at_idx" ON "workspace_billing_checkouts"("workspace_id", "created_at");

CREATE TABLE "workspace_billing_provider_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "checkout_id" UUID,
  "provider" VARCHAR(32) NOT NULL,
  "provider_event_id" VARCHAR(64) NOT NULL,
  "event_type" VARCHAR(80) NOT NULL,
  "provider_transaction_id" VARCHAR(64),
  "provider_customer_id" VARCHAR(64),
  "provider_subscription_id" VARCHAR(64),
  "payload_hash" CHAR(64) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "status" "WorkspaceBillingEventStatus" NOT NULL,
  "error_code" VARCHAR(80),
  CONSTRAINT "workspace_billing_provider_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_billing_provider_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_billing_provider_events_checkout_id_fkey" FOREIGN KEY ("checkout_id") REFERENCES "workspace_billing_checkouts"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "workspace_billing_provider_events_provider_event_id_key" ON "workspace_billing_provider_events"("provider_event_id");
CREATE INDEX "workspace_billing_provider_events_workspace_id_occurred_at_idx" ON "workspace_billing_provider_events"("workspace_id", "occurred_at");
CREATE INDEX "workspace_billing_provider_events_provider_subscription_id_idx" ON "workspace_billing_provider_events"("provider_subscription_id");

INSERT INTO "workspace_subscriptions" (
  "workspace_id", "created_by", "updated_by"
)
SELECT "id", "created_by", "updated_by"
FROM "workspaces"
ON CONFLICT ("workspace_id") DO NOTHING;

ALTER TABLE "workspace_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_billing_checkouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_billing_checkouts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_billing_provider_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_billing_provider_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_subscriptions_tenant" ON "workspace_subscriptions" FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_billing_checkouts_tenant" ON "workspace_billing_checkouts" FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_billing_provider_events_tenant" ON "workspace_billing_provider_events" FOR SELECT TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_billing_provider_events_insert" ON "workspace_billing_provider_events" FOR INSERT TO weddingos_app
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "workspace_subscriptions_worker" ON "workspace_subscriptions" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "workspace_billing_checkouts_worker" ON "workspace_billing_checkouts" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "workspace_billing_provider_events_worker" ON "workspace_billing_provider_events" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "workspace_subscriptions", "workspace_billing_checkouts", "workspace_billing_provider_events" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_subscriptions", "workspace_billing_checkouts", "workspace_billing_provider_events" TO weddingos_worker;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_workspace_billing_event(
  target_checkout_id uuid,
  target_transaction_id text,
  target_customer_id text,
  target_subscription_id text
)
RETURNS TABLE ("workspace_id" uuid, "checkout_id" uuid, "actor_user_id" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT resolved.workspace_id, resolved.checkout_id, resolved.actor_user_id
  FROM (
    SELECT checkout.workspace_id, checkout.id AS checkout_id, checkout.created_by AS actor_user_id, 1 AS priority
    FROM workspace_billing_checkouts checkout
    WHERE (target_checkout_id IS NOT NULL AND checkout.id = target_checkout_id)
       OR (target_transaction_id IS NOT NULL AND checkout.provider_transaction_id = target_transaction_id)

    UNION ALL

    SELECT subscription.workspace_id, NULL::uuid, subscription.updated_by, 2 AS priority
    FROM workspace_subscriptions subscription
    WHERE (target_customer_id IS NOT NULL AND subscription.provider_customer_id = target_customer_id)
       OR (target_subscription_id IS NOT NULL AND subscription.provider_subscription_id = target_subscription_id)
  ) resolved
  ORDER BY resolved.priority
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.weddingos_resolve_workspace_billing_event(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_workspace_billing_event(uuid, text, text, text) TO weddingos_app, weddingos_worker;

UPDATE "role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '["workspace.billing.read","workspace.billing.manage"]'::jsonb) capability
), "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'couple_owner';

UPDATE "role_templates"
SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" || '["workspace.billing.read"]'::jsonb) capability
), "version" = "version" + 1, "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'couple_partner';

COMMIT;
