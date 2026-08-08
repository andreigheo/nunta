BEGIN;

ALTER TABLE "workspace_subscriptions"
  ADD COLUMN "provider_price_id" VARCHAR(64),
  ADD COLUMN "last_reconciled_at" TIMESTAMP(3);

DROP INDEX IF EXISTS "workspace_subscriptions_provider_customer_id_key";
CREATE INDEX "workspace_subscriptions_provider_customer_id_idx"
  ON "workspace_subscriptions"("provider_customer_id");
CREATE INDEX "workspace_subscriptions_provider_price_id_idx"
  ON "workspace_subscriptions"("provider_price_id");

ALTER TABLE "workspace_billing_checkouts"
  ADD COLUMN "assignment_token_hash" CHAR(64);

UPDATE "workspace_billing_checkouts"
SET "assignment_token_hash" = encode(
  digest('sarbato-paddle-assignment:v1:' || "id"::text, 'sha256'),
  'hex'
)
WHERE "assignment_token_hash" IS NULL;

ALTER TABLE "workspace_billing_checkouts"
  ALTER COLUMN "assignment_token_hash" SET NOT NULL;

CREATE UNIQUE INDEX "workspace_billing_checkouts_assignment_token_hash_key"
  ON "workspace_billing_checkouts"("assignment_token_hash");

DROP FUNCTION IF EXISTS public.weddingos_resolve_workspace_billing_event(
  uuid,
  text,
  text,
  text
);

CREATE OR REPLACE FUNCTION public.weddingos_resolve_workspace_billing_event(
  target_assignment_token_hash text,
  target_checkout_id uuid,
  target_transaction_id text,
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
    WHERE target_assignment_token_hash IS NOT NULL
      AND checkout.assignment_token_hash = target_assignment_token_hash

    UNION ALL

    SELECT checkout.workspace_id, checkout.id AS checkout_id, checkout.created_by AS actor_user_id, 2 AS priority
    FROM workspace_billing_checkouts checkout
    WHERE (target_checkout_id IS NOT NULL AND checkout.id = target_checkout_id)
       OR (target_transaction_id IS NOT NULL AND checkout.provider_transaction_id = target_transaction_id)

    UNION ALL

    SELECT subscription.workspace_id, NULL::uuid, subscription.updated_by, 3 AS priority
    FROM workspace_subscriptions subscription
    WHERE target_subscription_id IS NOT NULL
      AND subscription.provider_subscription_id = target_subscription_id
  ) resolved
  ORDER BY resolved.priority
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.weddingos_resolve_workspace_billing_event(
  text,
  uuid,
  text,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_workspace_billing_event(
  text,
  uuid,
  text,
  text
) TO weddingos_app, weddingos_worker;

COMMIT;
