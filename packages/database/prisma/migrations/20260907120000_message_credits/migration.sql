BEGIN;

CREATE TYPE "WorkspaceBillingCheckoutKind" AS ENUM ('SUBSCRIPTION', 'MESSAGE_CREDITS');
CREATE TYPE "MessageCreditBucket" AS ENUM ('INCLUDED', 'PURCHASED');
CREATE TYPE "MessageCreditEntryType" AS ENUM ('PLAN_GRANT', 'PURCHASE', 'CONSUMPTION', 'REFUND', 'ADJUSTMENT');

ALTER TABLE "workspace_billing_checkouts"
  ADD COLUMN "kind" "WorkspaceBillingCheckoutKind" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "credit_pack_key" VARCHAR(40),
  ADD COLUMN "credit_quantity" INTEGER,
  ALTER COLUMN "plan_key" DROP NOT NULL;

ALTER TABLE "workspace_billing_checkouts"
  ADD CONSTRAINT "workspace_billing_checkouts_product_shape" CHECK (
    ("kind" = 'SUBSCRIPTION' AND "plan_key" IS NOT NULL AND "credit_pack_key" IS NULL AND "credit_quantity" IS NULL)
    OR
    ("kind" = 'MESSAGE_CREDITS' AND "plan_key" IS NULL AND "credit_pack_key" IS NOT NULL AND "credit_quantity" > 0)
  );

CREATE TABLE "workspace_message_credit_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "included_balance" INTEGER NOT NULL DEFAULT 0,
  "purchased_balance" INTEGER NOT NULL DEFAULT 0,
  "allowance_plan_key" "WorkspaceSubscriptionPlanKey" NOT NULL DEFAULT 'FREE',
  "allowance_period_start" TIMESTAMP(3),
  "trial_granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "workspace_message_credit_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_message_credit_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_message_credit_accounts_balances_nonnegative" CHECK ("included_balance" >= 0 AND "purchased_balance" >= 0)
);

CREATE UNIQUE INDEX "workspace_message_credit_accounts_workspace_id_key"
  ON "workspace_message_credit_accounts"("workspace_id");

CREATE TABLE "workspace_message_credit_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "bucket" "MessageCreditBucket" NOT NULL,
  "type" "MessageCreditEntryType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "provider_transaction_id" VARCHAR(64),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_message_credit_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_message_credit_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_message_credit_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "workspace_message_credit_accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_message_credit_entries_balance_nonnegative" CHECK ("balance_after" >= 0),
  CONSTRAINT "workspace_message_credit_entries_quantity_nonzero" CHECK ("quantity" <> 0)
);

CREATE UNIQUE INDEX "workspace_message_credit_entries_workspace_id_idempotency_key_key"
  ON "workspace_message_credit_entries"("workspace_id", "idempotency_key");
CREATE INDEX "workspace_message_credit_entries_workspace_id_created_at_idx"
  ON "workspace_message_credit_entries"("workspace_id", "created_at");
CREATE UNIQUE INDEX "workspace_message_credit_entries_provider_transaction_id_key"
  ON "workspace_message_credit_entries"("provider_transaction_id");

INSERT INTO "workspace_message_credit_accounts" (
  "workspace_id", "included_balance", "allowance_plan_key", "allowance_period_start"
)
SELECT subscription."workspace_id",
  CASE
    WHEN subscription."status" IN ('ACTIVE', 'PAST_DUE') AND subscription."plan_key" = 'PLUS' THEN 50
    WHEN subscription."status" IN ('ACTIVE', 'PAST_DUE') AND subscription."plan_key" = 'PRO' THEN 100
    ELSE 10
  END,
  CASE
    WHEN subscription."status" IN ('ACTIVE', 'PAST_DUE') THEN subscription."plan_key"
    ELSE 'FREE'::"WorkspaceSubscriptionPlanKey"
  END,
  CASE
    WHEN subscription."status" IN ('ACTIVE', 'PAST_DUE') THEN subscription."current_period_start"
    ELSE NULL
  END
FROM "workspace_subscriptions" subscription
ON CONFLICT ("workspace_id") DO NOTHING;

INSERT INTO "workspace_message_credit_entries" (
  "workspace_id", "account_id", "bucket", "type", "quantity", "balance_after", "idempotency_key", "metadata"
)
SELECT account."workspace_id", account."id", 'INCLUDED', 'PLAN_GRANT', account."included_balance",
  account."included_balance", 'migration:initial-allowance',
  jsonb_build_object('plan', account."allowance_plan_key"::text)
FROM "workspace_message_credit_accounts" account
WHERE account."included_balance" > 0;

ALTER TABLE "workspace_message_credit_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_message_credit_accounts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "workspace_message_credit_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_message_credit_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_message_credit_accounts_tenant" ON "workspace_message_credit_accounts" FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_message_credit_entries_tenant" ON "workspace_message_credit_entries" FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "workspace_message_credit_accounts_worker" ON "workspace_message_credit_accounts" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "workspace_message_credit_entries_worker" ON "workspace_message_credit_entries" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "workspace_message_credit_accounts", "workspace_message_credit_entries" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_message_credit_accounts", "workspace_message_credit_entries" TO weddingos_worker;

COMMIT;
