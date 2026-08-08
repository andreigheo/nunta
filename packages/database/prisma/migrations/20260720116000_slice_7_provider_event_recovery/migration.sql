BEGIN;

-- After a signed event is durably ingested, the vendor context resolved from
-- persisted provider identifiers may claim and finish it. This visibility is
-- required for transactional retry/recovery and does not expose other tenants.
CREATE POLICY "subscription_events_vendor_select"
ON "subscription_provider_events"
FOR SELECT TO weddingos_app
USING (EXISTS (
  SELECT 1
  FROM "vendor_subscriptions" subscription
  WHERE subscription."provider" = "subscription_provider_events"."provider"
    AND (
      subscription."provider_customer_id" = "subscription_provider_events"."provider_customer_id"
      OR subscription."provider_subscription_id" = "subscription_provider_events"."provider_subscription_id"
    )
    AND public.weddingos_has_vendor_access(subscription."vendor_organization_id")
));

CREATE POLICY "payout_events_vendor_select"
ON "payout_provider_events"
FOR SELECT TO weddingos_app
USING (EXISTS (
  SELECT 1
  FROM "vendor_payout_accounts" account
  WHERE account."provider" = "payout_provider_events"."provider"
    AND account."provider_account_id" = "payout_provider_events"."provider_account_id"
    AND public.weddingos_has_vendor_access(account."vendor_organization_id")
));

COMMIT;
