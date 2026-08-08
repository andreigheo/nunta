BEGIN;

-- Webhook payload tenant identifiers are never trusted. Resolve the vendor and
-- a persisted active member from provider identifiers stored by WeddingOS.
CREATE OR REPLACE FUNCTION public.weddingos_resolve_subscription_provider_actor(
  target_provider text,
  target_customer text,
  target_subscription text
)
RETURNS TABLE (vendor_organization_id uuid, subscription_id uuid, actor_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT subscription.vendor_organization_id, subscription.id, membership.user_id
  FROM public.vendor_subscriptions subscription
  JOIN LATERAL (
    SELECT member.user_id
    FROM public.vendor_organization_memberships member
    WHERE member.vendor_organization_id = subscription.vendor_organization_id
      AND member.status = 'ACTIVE'
    ORDER BY member.joined_at NULLS LAST, member.created_at
    LIMIT 1
  ) membership ON true
  WHERE subscription.provider = target_provider
    AND ((target_subscription IS NOT NULL AND subscription.provider_subscription_id = target_subscription)
      OR (target_customer IS NOT NULL AND subscription.provider_customer_id = target_customer))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_subscription_provider_actor(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_subscription_provider_actor(text, text, text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_payout_provider_actor(
  target_provider text,
  target_account text,
  target_payout text
)
RETURNS TABLE (vendor_organization_id uuid, payout_account_id uuid, payout_id uuid, actor_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT account.vendor_organization_id, account.id, payout.id, membership.user_id
  FROM public.vendor_payout_accounts account
  JOIN LATERAL (
    SELECT member.user_id
    FROM public.vendor_organization_memberships member
    WHERE member.vendor_organization_id = account.vendor_organization_id
      AND member.status = 'ACTIVE'
    ORDER BY member.joined_at NULLS LAST, member.created_at
    LIMIT 1
  ) membership ON true
  LEFT JOIN public.vendor_payouts payout
    ON payout.payout_account_id = account.id
   AND target_payout IS NOT NULL
   AND payout.provider_payout_id = target_payout
  WHERE account.provider = target_provider
    AND account.provider_account_id = target_account
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_payout_provider_actor(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_payout_provider_actor(text, text, text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_vendor_actor(target_vendor_organization_id uuid)
RETURNS TABLE (actor_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT member.user_id
  FROM public.vendor_organization_memberships member
  WHERE member.vendor_organization_id = target_vendor_organization_id
    AND member.status = 'ACTIVE'
  ORDER BY member.joined_at NULLS LAST, member.created_at
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_vendor_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_vendor_actor(uuid) TO weddingos_app;

-- Finalized financial amounts are immutable, while the status may progress
-- through payout processing and terminal states.
DROP TRIGGER IF EXISTS "vendor_settlements_finalized_immutable" ON "vendor_settlements";
CREATE OR REPLACE FUNCTION public.weddingos_guard_finalized_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'finalized settlement cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.vendor_organization_id IS DISTINCT FROM OLD.vendor_organization_id
     OR NEW.payout_account_id IS DISTINCT FROM OLD.payout_account_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
     OR NEW.gross_minor IS DISTINCT FROM OLD.gross_minor
     OR NEW.platform_fee_minor IS DISTINCT FROM OLD.platform_fee_minor
     OR NEW.refund_minor IS DISTINCT FROM OLD.refund_minor
     OR NEW.dispute_hold_minor IS DISTINCT FROM OLD.dispute_hold_minor
     OR NEW.reserve_minor IS DISTINCT FROM OLD.reserve_minor
     OR NEW.net_payout_minor IS DISTINCT FROM OLD.net_payout_minor
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'finalized settlement financial fields are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "vendor_settlements_finalized_immutable"
BEFORE UPDATE OR DELETE ON "vendor_settlements"
FOR EACH ROW WHEN (OLD."status" IN ('FINALIZED','PAYOUT_PENDING','PAID'))
EXECUTE FUNCTION public.weddingos_guard_finalized_settlement();

-- A vendor may read payment rows only through a persisted checkout linked to
-- that same vendor tenant; workspace access policies remain unchanged.
CREATE POLICY "online_payment_transactions_vendor_read"
ON "online_payment_transactions" FOR SELECT TO weddingos_app
USING (EXISTS (
  SELECT 1 FROM "online_payment_checkouts" checkout
  WHERE checkout.id = online_payment_transactions.checkout_id
    AND checkout.vendor_organization_id IS NOT NULL
    AND public.weddingos_has_vendor_access(checkout.vendor_organization_id)
));
CREATE POLICY "online_payment_refunds_vendor_read"
ON "online_payment_refunds" FOR SELECT TO weddingos_app
USING (EXISTS (
  SELECT 1
  FROM "online_payment_transactions" transaction_row
  JOIN "online_payment_checkouts" checkout ON checkout.id = transaction_row.checkout_id
  WHERE transaction_row.id = online_payment_refunds.transaction_id
    AND checkout.vendor_organization_id IS NOT NULL
    AND public.weddingos_has_vendor_access(checkout.vendor_organization_id)
));
CREATE POLICY "online_payment_checkouts_platform_settlement_read"
ON "online_payment_checkouts" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.settlement.calculate'));
CREATE POLICY "online_payment_transactions_platform_settlement_read"
ON "online_payment_transactions" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.settlement.calculate'));
CREATE POLICY "online_payment_refunds_platform_settlement_read"
ON "online_payment_refunds" FOR SELECT TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.settlement.calculate'));

-- Provider event status may be advanced only after its persisted provider
-- identifiers resolve to the active vendor context.
CREATE POLICY "subscription_events_vendor_update" ON "subscription_provider_events"
FOR UPDATE TO weddingos_app
USING (EXISTS (
  SELECT 1 FROM "vendor_subscriptions" subscription
  WHERE subscription.provider = subscription_provider_events.provider
    AND (subscription.provider_customer_id = subscription_provider_events.provider_customer_id
      OR subscription.provider_subscription_id = subscription_provider_events.provider_subscription_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "vendor_subscriptions" subscription
  WHERE subscription.provider = subscription_provider_events.provider
    AND (subscription.provider_customer_id = subscription_provider_events.provider_customer_id
      OR subscription.provider_subscription_id = subscription_provider_events.provider_subscription_id)
));
CREATE POLICY "payout_events_vendor_update" ON "payout_provider_events"
FOR UPDATE TO weddingos_app
USING (EXISTS (
  SELECT 1 FROM "vendor_payout_accounts" account
  WHERE account.provider = payout_provider_events.provider
    AND account.provider_account_id = payout_provider_events.provider_account_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM "vendor_payout_accounts" account
  WHERE account.provider = payout_provider_events.provider
    AND account.provider_account_id = payout_provider_events.provider_account_id
));

-- Review projections are bound to the persisted outbox consumer execution,
-- including both workspace and vendor tenant when the event carries both.
CREATE POLICY "review_eligibility_worker" ON "review_eligibilities" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id));
CREATE POLICY "vendor_reviews_worker" ON "vendor_reviews" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_review_versions','vendor_review_criterion_ratings','vendor_review_replies',
    'vendor_review_reports','vendor_review_disputes','vendor_review_moderation_cases',
    'vendor_review_moderation_decisions'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (EXISTS (SELECT 1 FROM vendor_reviews review WHERE review.id = %s)) WITH CHECK (EXISTS (SELECT 1 FROM vendor_reviews review WHERE review.id = %s))',
      table_name || '_worker', table_name,
      CASE table_name
        WHEN 'vendor_review_versions' THEN 'review_id'
        WHEN 'vendor_review_criterion_ratings' THEN 'review_id'
        WHEN 'vendor_review_replies' THEN 'review_id'
        WHEN 'vendor_review_reports' THEN 'review_id'
        WHEN 'vendor_review_disputes' THEN 'review_id'
        WHEN 'vendor_review_moderation_cases' THEN 'review_id'
        ELSE 'review_id'
      END,
      CASE table_name
        WHEN 'vendor_review_versions' THEN 'review_id'
        WHEN 'vendor_review_criterion_ratings' THEN 'review_id'
        WHEN 'vendor_review_replies' THEN 'review_id'
        WHEN 'vendor_review_reports' THEN 'review_id'
        WHEN 'vendor_review_disputes' THEN 'review_id'
        WHEN 'vendor_review_moderation_cases' THEN 'review_id'
        ELSE 'review_id'
      END
    );
  END LOOP;
END $$;

COMMIT;
