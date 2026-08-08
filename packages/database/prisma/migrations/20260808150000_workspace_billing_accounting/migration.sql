BEGIN;

CREATE TABLE "workspace_billing_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "provider" VARCHAR(32) NOT NULL,
  "provider_transaction_id" VARCHAR(64) NOT NULL,
  "provider_subscription_id" VARCHAR(64),
  "provider_customer_id" VARCHAR(64),
  "plan_key" "WorkspaceSubscriptionPlanKey" NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "subtotal_minor" BIGINT NOT NULL,
  "discount_minor" BIGINT NOT NULL DEFAULT 0,
  "tax_minor" BIGINT NOT NULL,
  "total_minor" BIGINT NOT NULL,
  "fee_minor" BIGINT,
  "earnings_minor" BIGINT,
  "invoice_number" VARCHAR(64),
  "billed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "last_provider_event_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_billing_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_billing_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_billing_transactions_amounts_nonnegative" CHECK (
    "subtotal_minor" >= 0 AND "discount_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0
    AND ("fee_minor" IS NULL OR "fee_minor" >= 0)
    AND ("earnings_minor" IS NULL OR "earnings_minor" >= 0)
  )
);

CREATE UNIQUE INDEX "workspace_billing_transactions_provider_transaction_id_key" ON "workspace_billing_transactions"("provider_transaction_id");
CREATE INDEX "workspace_billing_transactions_workspace_id_completed_at_idx" ON "workspace_billing_transactions"("workspace_id", "completed_at");
CREATE INDEX "workspace_billing_transactions_provider_subscription_id_idx" ON "workspace_billing_transactions"("provider_subscription_id");

ALTER TABLE "workspace_billing_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_billing_transactions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_billing_transactions_tenant" ON "workspace_billing_transactions" FOR SELECT TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_billing_transactions_insert" ON "workspace_billing_transactions" FOR INSERT TO weddingos_app
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_billing_transactions_update" ON "workspace_billing_transactions" FOR UPDATE TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_billing_transactions_worker" ON "workspace_billing_transactions" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "workspace_billing_transactions" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_billing_transactions" TO weddingos_worker;

COMMIT;
