-- Keep provider recovery live during extended outages; no customer rows are changed.
CREATE OR REPLACE FUNCTION public.weddingos_claim_workspace_checkout_reconciliation(batch_size integer)
RETURNS TABLE ("workspace_id" uuid, "checkout_id" uuid, "transaction_id" text, "actor_user_id" uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH due AS (
    SELECT checkout.id
    FROM workspace_billing_checkouts checkout
    WHERE checkout.status IN ('CREATED', 'RECOVERY_PENDING')
      AND checkout.provider_transaction_id IS NOT NULL
      AND checkout.created_at < now() - interval '5 minutes'
      AND (checkout.last_reconciled_at IS NULL OR checkout.last_reconciled_at < now() - CASE WHEN checkout.reconciliation_attempts < 12 THEN interval '5 minutes' ELSE interval '1 hour' END)
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
