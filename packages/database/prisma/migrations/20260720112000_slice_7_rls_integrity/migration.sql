BEGIN;

-- Slice 7 trust and monetization integrity, least-privilege grants and forced RLS.

ALTER TABLE "vendor_reviews"
  ADD CONSTRAINT "vendor_reviews_rating_range" CHECK ("overall_rating" BETWEEN 1 AND 5);
ALTER TABLE "vendor_review_versions"
  ADD CONSTRAINT "vendor_review_versions_rating_range" CHECK ("overall_rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "vendor_review_versions_body_bounds" CHECK (char_length("body") BETWEEN 20 AND 4000);
ALTER TABLE "vendor_review_criterion_ratings"
  ADD CONSTRAINT "vendor_review_criterion_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "subscription_prices"
  ADD CONSTRAINT "subscription_prices_nonnegative" CHECK ("amount_minor" >= 0 AND "billing_interval_count" > 0 AND "trial_days" >= 0);
ALTER TABLE "platform_fee_policies"
  ADD CONSTRAINT "platform_fee_percentage_range" CHECK ("percentage_basis_points" IS NULL OR "percentage_basis_points" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "platform_fee_amounts_nonnegative" CHECK (("fixed_minor" IS NULL OR "fixed_minor" >= 0) AND ("minimum_fee_minor" IS NULL OR "minimum_fee_minor" >= 0) AND ("maximum_fee_minor" IS NULL OR "maximum_fee_minor" >= 0));
ALTER TABLE "marketplace_payment_allocations"
  ADD CONSTRAINT "marketplace_allocation_money" CHECK ("gross_minor" > 0 AND "platform_fee_minor" >= 0 AND "vendor_net_minor" >= 0 AND "gross_minor" = "platform_fee_minor" + "vendor_net_minor" AND "refunded_minor" >= 0 AND "disputed_minor" >= 0 AND "eligible_for_payout_minor" >= 0);
ALTER TABLE "vendor_payable_entries"
  ADD CONSTRAINT "vendor_payable_positive_amount" CHECK ("amount_minor" > 0);
ALTER TABLE "vendor_settlements"
  ADD CONSTRAINT "vendor_settlement_period" CHECK ("period_start" < "period_end"),
  ADD CONSTRAINT "vendor_settlement_money" CHECK ("gross_minor" >= 0 AND "platform_fee_minor" >= 0 AND "refund_minor" >= 0 AND "dispute_hold_minor" >= 0 AND "reserve_minor" >= 0 AND "net_payout_minor" >= 0);
ALTER TABLE "vendor_payouts"
  ADD CONSTRAINT "vendor_payout_positive_amount" CHECK ("amount_minor" > 0);

ALTER TABLE "review_eligibilities"
  ADD CONSTRAINT "review_eligibility_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "review_eligibility_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "review_eligibility_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "review_eligibility_user_fk" FOREIGN KEY ("eligible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_reviews"
  ADD CONSTRAINT "vendor_review_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_eligibility_fk" FOREIGN KEY ("eligibility_id") REFERENCES "review_eligibilities"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_author_fk" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_review_versions"
  ADD CONSTRAINT "vendor_review_version_review_fk" FOREIGN KEY ("review_id") REFERENCES "vendor_reviews"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_review_criterion_ratings"
  ADD CONSTRAINT "vendor_review_criterion_review_fk" FOREIGN KEY ("review_id") REFERENCES "vendor_reviews"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_criterion_version_fk" FOREIGN KEY ("version_id") REFERENCES "vendor_review_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_review_replies"
  ADD CONSTRAINT "vendor_review_reply_review_fk" FOREIGN KEY ("review_id") REFERENCES "vendor_reviews"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_reply_version_fk" FOREIGN KEY ("review_version_id") REFERENCES "vendor_review_versions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_reply_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_review_reports"
  ADD CONSTRAINT "vendor_review_report_review_fk" FOREIGN KEY ("review_id") REFERENCES "vendor_reviews"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_review_disputes"
  ADD CONSTRAINT "vendor_review_dispute_review_fk" FOREIGN KEY ("review_id") REFERENCES "vendor_reviews"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_dispute_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_review_moderation_cases"
  ADD CONSTRAINT "vendor_review_moderation_review_fk" FOREIGN KEY ("review_id") REFERENCES "vendor_reviews"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_review_moderation_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_rating_aggregates"
  ADD CONSTRAINT "vendor_rating_aggregate_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "subscription_prices" ADD CONSTRAINT "subscription_price_product_fk" FOREIGN KEY ("product_id") REFERENCES "subscription_products"("id") ON DELETE RESTRICT;
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plan_product_fk" FOREIGN KEY ("product_id") REFERENCES "subscription_products"("id") ON DELETE RESTRICT;
ALTER TABLE "subscription_plan_entitlements" ADD CONSTRAINT "subscription_entitlement_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_subscriptions"
  ADD CONSTRAINT "vendor_subscription_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_subscription_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_subscription_price_fk" FOREIGN KEY ("price_id") REFERENCES "subscription_prices"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_entitlement_snapshots"
  ADD CONSTRAINT "vendor_entitlement_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_entitlement_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_usage_counters" ADD CONSTRAINT "vendor_usage_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT;

ALTER TABLE "vendor_payout_accounts" ADD CONSTRAINT "vendor_payout_account_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT;
ALTER TABLE "marketplace_payment_allocations"
  ADD CONSTRAINT "marketplace_allocation_transaction_fk" FOREIGN KEY ("transaction_id") REFERENCES "online_payment_transactions"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "marketplace_allocation_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "marketplace_allocation_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "marketplace_allocation_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "vendor_bookings"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_payable_entries"
  ADD CONSTRAINT "vendor_payable_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_payable_allocation_fk" FOREIGN KEY ("allocation_id") REFERENCES "marketplace_payment_allocations"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_settlements"
  ADD CONSTRAINT "vendor_settlement_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_settlement_account_fk" FOREIGN KEY ("payout_account_id") REFERENCES "vendor_payout_accounts"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_settlement_lines"
  ADD CONSTRAINT "vendor_settlement_line_settlement_fk" FOREIGN KEY ("settlement_id") REFERENCES "vendor_settlements"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_settlement_line_entry_fk" FOREIGN KEY ("payable_entry_id") REFERENCES "vendor_payable_entries"("id") ON DELETE RESTRICT;
ALTER TABLE "vendor_payouts"
  ADD CONSTRAINT "vendor_payout_vendor_fk" FOREIGN KEY ("vendor_organization_id") REFERENCES "vendor_organizations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_payout_settlement_fk" FOREIGN KEY ("settlement_id") REFERENCES "vendor_settlements"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "vendor_payout_account_fk" FOREIGN KEY ("payout_account_id") REFERENCES "vendor_payout_accounts"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.weddingos_has_platform_capability(target_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_capability_grants grant_row
    WHERE grant_row.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND grant_row.capability = target_capability
      AND grant_row.active = true
      AND grant_row.revoked_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.weddingos_has_platform_capability(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_has_platform_capability(text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_subscription_provider_context(target_provider text, target_customer text, target_subscription text)
RETURNS TABLE (vendor_organization_id uuid, subscription_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT subscription.vendor_organization_id, subscription.id
  FROM public.vendor_subscriptions subscription
  WHERE subscription.provider = target_provider
    AND ((target_subscription IS NOT NULL AND subscription.provider_subscription_id = target_subscription)
      OR (target_customer IS NOT NULL AND subscription.provider_customer_id = target_customer))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_subscription_provider_context(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_subscription_provider_context(text, text, text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_resolve_payout_provider_context(target_provider text, target_account text, target_payout text)
RETURNS TABLE (vendor_organization_id uuid, payout_account_id uuid, payout_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp SET row_security = off AS $$
  SELECT account.vendor_organization_id, account.id, payout.id
  FROM public.vendor_payout_accounts account
  LEFT JOIN public.vendor_payouts payout ON payout.payout_account_id = account.id AND payout.provider_payout_id = target_payout
  WHERE account.provider = target_provider AND account.provider_account_id = target_account
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_resolve_payout_provider_context(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_resolve_payout_provider_context(text, text, text) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_reject_immutable_slice7_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'immutable Slice 7 financial/review history' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "vendor_review_versions_immutable_rows" BEFORE UPDATE OR DELETE ON "vendor_review_versions" FOR EACH ROW WHEN (OLD."immutable" = true) EXECUTE FUNCTION public.weddingos_reject_immutable_slice7_change();
CREATE TRIGGER "vendor_payable_entries_append_only" BEFORE UPDATE OR DELETE ON "vendor_payable_entries" FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_immutable_slice7_change();
CREATE TRIGGER "vendor_settlements_finalized_immutable" BEFORE UPDATE OR DELETE ON "vendor_settlements" FOR EACH ROW WHEN (OLD."status" IN ('FINALIZED','PAYOUT_PENDING','PAID')) EXECUTE FUNCTION public.weddingos_reject_immutable_slice7_change();
CREATE TRIGGER "vendor_payouts_paid_immutable" BEFORE UPDATE OR DELETE ON "vendor_payouts" FOR EACH ROW WHEN (OLD."status" IN ('PAID','RETURNED')) EXECUTE FUNCTION public.weddingos_reject_immutable_slice7_change();

GRANT SELECT, INSERT, UPDATE ON TABLE
  "review_eligibilities","vendor_reviews","vendor_review_versions","vendor_review_criterion_ratings",
  "vendor_review_replies","vendor_review_reports","vendor_review_disputes","vendor_review_moderation_cases",
  "vendor_review_moderation_decisions","vendor_rating_aggregates",
  "vendor_subscriptions","vendor_subscription_periods","vendor_subscription_history","vendor_entitlement_snapshots",
  "vendor_usage_counters","subscription_provider_events","subscription_invoice_records","subscription_checkouts",
  "vendor_payout_accounts","vendor_payout_capabilities","vendor_payout_onboarding_sessions","payout_provider_events",
  "marketplace_payment_allocations","vendor_payable_entries","vendor_settlements","vendor_settlement_lines",
  "vendor_payouts","vendor_payout_attempts"
TO weddingos_app, weddingos_worker;
GRANT SELECT ON TABLE "subscription_products","subscription_prices","subscription_plans","subscription_plan_entitlements","platform_fee_policies" TO weddingos_app, weddingos_worker;
GRANT INSERT, UPDATE ON TABLE "subscription_products","subscription_prices","subscription_plans","subscription_plan_entitlements","platform_fee_policies" TO weddingos_app;
GRANT SELECT ON TABLE "platform_capability_grants" TO weddingos_app;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'review_eligibilities','vendor_reviews','vendor_review_versions','vendor_review_criterion_ratings',
    'vendor_review_replies','vendor_review_reports','vendor_review_disputes','vendor_review_moderation_cases',
    'vendor_review_moderation_decisions','vendor_rating_aggregates','subscription_products','subscription_prices',
    'subscription_plans','subscription_plan_entitlements','vendor_subscriptions','vendor_subscription_periods',
    'vendor_subscription_history','vendor_entitlement_snapshots','vendor_usage_counters','subscription_provider_events',
    'subscription_invoice_records','subscription_checkouts','vendor_payout_accounts','vendor_payout_capabilities',
    'vendor_payout_onboarding_sessions','payout_provider_events','platform_fee_policies','marketplace_payment_allocations',
    'vendor_payable_entries','vendor_settlements','vendor_settlement_lines','vendor_payouts','vendor_payout_attempts',
    'platform_capability_grants'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY "review_eligibility_wedding" ON "review_eligibilities" FOR ALL TO weddingos_app
  USING (public.weddingos_has_workspace_access("workspace_id")) WITH CHECK (public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "vendor_reviews_parties" ON "vendor_reviews" FOR ALL TO weddingos_app
  USING (public.weddingos_has_workspace_access("workspace_id") OR public.weddingos_has_vendor_access("vendor_organization_id") OR public.weddingos_has_platform_capability('platform.review_moderate'))
  WITH CHECK (public.weddingos_has_workspace_access("workspace_id") OR public.weddingos_has_vendor_access("vendor_organization_id") OR public.weddingos_has_platform_capability('platform.review_decide'));
CREATE POLICY "vendor_reviews_public" ON "vendor_reviews" FOR SELECT TO weddingos_app USING ("status" = 'PUBLISHED' AND "verification_status" <> 'REVOKED');

CREATE POLICY "review_versions_related" ON "vendor_review_versions" FOR ALL TO weddingos_app USING (EXISTS (
  SELECT 1 FROM "vendor_reviews" review WHERE review.id = vendor_review_versions.review_id
)) WITH CHECK (EXISTS (SELECT 1 FROM "vendor_reviews" review WHERE review.id = vendor_review_versions.review_id));
CREATE POLICY "review_criteria_related" ON "vendor_review_criterion_ratings" FOR ALL TO weddingos_app USING (EXISTS (
  SELECT 1 FROM "vendor_review_versions" version WHERE version.id = vendor_review_criterion_ratings.version_id
)) WITH CHECK (EXISTS (SELECT 1 FROM "vendor_review_versions" version WHERE version.id = vendor_review_criterion_ratings.version_id));
CREATE POLICY "review_replies_vendor_or_public" ON "vendor_review_replies" FOR ALL TO weddingos_app
  USING (public.weddingos_has_vendor_access("vendor_organization_id") OR "status" = 'PUBLISHED' OR public.weddingos_has_platform_capability('platform.review_moderate'))
  WITH CHECK (public.weddingos_has_vendor_access("vendor_organization_id") OR public.weddingos_has_platform_capability('platform.review_decide'));
CREATE POLICY "review_reports_actor" ON "vendor_review_reports" FOR ALL TO weddingos_app
  USING ("reporter_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid OR public.weddingos_has_platform_capability('platform.review_moderate'))
  WITH CHECK ("reporter_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY "review_disputes_vendor" ON "vendor_review_disputes" FOR ALL TO weddingos_app
  USING (public.weddingos_has_vendor_access("vendor_organization_id") OR public.weddingos_has_platform_capability('platform.review_moderate'))
  WITH CHECK (public.weddingos_has_vendor_access("vendor_organization_id") OR public.weddingos_has_platform_capability('platform.review_decide'));
CREATE POLICY "moderation_cases_vendor_or_platform" ON "vendor_review_moderation_cases" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_vendor_access("vendor_organization_id") OR public.weddingos_has_platform_capability('platform.review_moderate'));
CREATE POLICY "moderation_cases_platform_write" ON "vendor_review_moderation_cases" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.review_moderate')) WITH CHECK (public.weddingos_has_platform_capability('platform.review_moderate'));
CREATE POLICY "moderation_decisions_platform" ON "vendor_review_moderation_decisions" FOR ALL TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.review_view_private')) WITH CHECK (public.weddingos_has_platform_capability('platform.review_decide'));
CREATE POLICY "rating_aggregate_read" ON "vendor_rating_aggregates" FOR SELECT TO weddingos_app USING (true);
CREATE POLICY "rating_aggregate_write" ON "vendor_rating_aggregates" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "rating_aggregate_app_projection" ON "vendor_rating_aggregates" FOR INSERT TO weddingos_app WITH CHECK (NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL);
CREATE POLICY "rating_aggregate_app_update" ON "vendor_rating_aggregates" FOR UPDATE TO weddingos_app USING (NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL) WITH CHECK (NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['subscription_products','subscription_prices','subscription_plans','subscription_plan_entitlements'] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO weddingos_app USING (true)', table_name || '_catalog_read', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_platform_capability(''platform.subscription.write_plans'')) WITH CHECK (public.weddingos_has_platform_capability(''platform.subscription.write_plans''))', table_name || '_platform_write', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_subscriptions','vendor_subscription_periods','vendor_subscription_history','vendor_entitlement_snapshots',
    'vendor_usage_counters','subscription_invoice_records','subscription_checkouts','vendor_payout_accounts',
    'vendor_payout_onboarding_sessions','marketplace_payment_allocations','vendor_payable_entries','vendor_settlements','vendor_payouts'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_vendor_access(vendor_organization_id) OR public.weddingos_has_platform_capability(''platform.subscription.manage'') OR public.weddingos_has_platform_capability(''platform.settlement.read'')) WITH CHECK (public.weddingos_has_vendor_access(vendor_organization_id) OR public.weddingos_has_platform_capability(''platform.subscription.manage'') OR public.weddingos_has_platform_capability(''platform.settlement.calculate''))', table_name || '_vendor_platform', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (true) WITH CHECK (true)', table_name || '_worker', table_name);
  END LOOP;
END $$;

CREATE POLICY "payout_capabilities_related" ON "vendor_payout_capabilities" FOR ALL TO weddingos_app USING (EXISTS (
  SELECT 1 FROM vendor_payout_accounts account WHERE account.id = vendor_payout_capabilities.payout_account_id
)) WITH CHECK (EXISTS (SELECT 1 FROM vendor_payout_accounts account WHERE account.id = vendor_payout_capabilities.payout_account_id));
CREATE POLICY "settlement_lines_related" ON "vendor_settlement_lines" FOR SELECT TO weddingos_app USING (EXISTS (
  SELECT 1 FROM vendor_settlements settlement WHERE settlement.id = vendor_settlement_lines.settlement_id
));
CREATE POLICY "settlement_lines_write" ON "vendor_settlement_lines" FOR INSERT TO weddingos_app WITH CHECK (EXISTS (
  SELECT 1 FROM vendor_settlements settlement WHERE settlement.id = vendor_settlement_lines.settlement_id
));
CREATE POLICY "payout_attempts_related" ON "vendor_payout_attempts" FOR SELECT TO weddingos_app USING (EXISTS (
  SELECT 1 FROM vendor_payouts payout WHERE payout.id = vendor_payout_attempts.payout_id
));
CREATE POLICY "payout_attempts_write" ON "vendor_payout_attempts" FOR INSERT TO weddingos_app WITH CHECK (EXISTS (
  SELECT 1 FROM vendor_payouts payout WHERE payout.id = vendor_payout_attempts.payout_id
));
CREATE POLICY "subscription_events_insert" ON "subscription_provider_events" FOR INSERT TO weddingos_app WITH CHECK (true);
CREATE POLICY "subscription_events_platform" ON "subscription_provider_events" FOR SELECT TO weddingos_app USING (public.weddingos_has_platform_capability('platform.subscription.reconcile'));
CREATE POLICY "subscription_events_worker" ON "subscription_provider_events" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "payout_events_insert" ON "payout_provider_events" FOR INSERT TO weddingos_app WITH CHECK (true);
CREATE POLICY "payout_events_platform" ON "payout_provider_events" FOR SELECT TO weddingos_app USING (public.weddingos_has_platform_capability('platform.payout.reconcile'));
CREATE POLICY "payout_events_worker" ON "payout_provider_events" FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);
CREATE POLICY "fee_policy_read" ON "platform_fee_policies" FOR SELECT TO weddingos_app USING (NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL);
CREATE POLICY "fee_policy_platform_write" ON "platform_fee_policies" FOR ALL TO weddingos_app USING (public.weddingos_has_platform_capability('platform.subscription.manage')) WITH CHECK (public.weddingos_has_platform_capability('platform.subscription.manage'));
CREATE POLICY "platform_grant_self_read" ON "platform_capability_grants" FOR SELECT TO weddingos_app USING ("user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" || '["review.read","review.write","review.publish","review.withdraw","review.report"]'::jsonb) capability
) WHERE "key" IN ('couple_owner','couple_partner','wedding_planner');
UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" || '["review.read","review.report"]'::jsonb) capability
) WHERE "key" IN ('family_collaborator','viewer');
UPDATE "vendor_role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" || '["vendor.review.read","vendor.review.reply","vendor.review.dispute","vendor.review.analytics","vendor.subscription.read","vendor.subscription.checkout","vendor.subscription.manage","vendor.subscription.portal","vendor.subscription.view_usage","vendor.payout.read","vendor.payout.onboard","vendor.payout.request","vendor.payout.export","vendor.payout.read_sensitive_summary"]'::jsonb) capability
) WHERE "key" IN ('vendor_owner','vendor_manager');
UPDATE "vendor_role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" || '["vendor.review.read","vendor.review.reply","vendor.subscription.read","vendor.subscription.view_usage","vendor.payout.read"]'::jsonb) capability
) WHERE "key" IN ('vendor_sales','vendor_operations','vendor_viewer');

INSERT INTO "subscription_products" ("id","key","name","description","status","version","created_at","updated_at") VALUES
  (gen_random_uuid(),'vendor-marketplace','WeddingOS Vendor','Acces comercial configurabil pentru Vendor OS','ACTIVE',1,now(),now())
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "subscription_plans" ("id","product_id","key","name","description","status","position","version","created_at","updated_at")
SELECT gen_random_uuid(), product.id, plan.key, plan.name, plan.description, 'ACTIVE'::"SubscriptionCatalogStatus", plan.position, 1, now(), now()
FROM "subscription_products" product CROSS JOIN (VALUES
  ('FREE','Gratuit','Profil draft și acces istoric',0),
  ('STARTER','Starter','Profil public și RFQ-uri limitate',1),
  ('PRO','Pro','Contracte, semnături și analytics',2),
  ('BUSINESS','Business','Echipă extinsă și suport prioritar',3)
) AS plan(key,name,description,position) WHERE product.key='vendor-marketplace'
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "subscription_prices" ("id","product_id","provider","currency","amount_minor","billing_interval","billing_interval_count","trial_days","active","version","created_at","updated_at")
SELECT gen_random_uuid(), product.id, 'fake', 'RON', 9900, 'MONTH'::"SubscriptionBillingInterval", 1, 14, true, 1, now(), now()
FROM "subscription_products" product WHERE product.key='vendor-marketplace'
  AND NOT EXISTS (SELECT 1 FROM "subscription_prices" p WHERE p.product_id=product.id AND p.provider='fake' AND p.currency='RON' AND p.amount_minor=9900);
INSERT INTO "subscription_plan_entitlements" ("id","plan_id","key","value_type","boolean_value","integer_value","version","created_at","updated_at")
SELECT gen_random_uuid(), plan.id, entitlement.key, entitlement.value_type::"EntitlementValueType", entitlement.boolean_value, entitlement.integer_value, 1, now(), now()
FROM "subscription_plans" plan JOIN (VALUES
  ('FREE','MARKETPLACE_PROFILE','BOOLEAN',true,NULL),('FREE','PROFILE_PUBLICATION','BOOLEAN',false,NULL),('FREE','MAX_ACTIVE_SERVICES','INTEGER',NULL,2),
  ('STARTER','MARKETPLACE_PROFILE','BOOLEAN',true,NULL),('STARTER','PROFILE_PUBLICATION','BOOLEAN',true,NULL),('STARTER','MAX_ACTIVE_SERVICES','INTEGER',NULL,5),
  ('PRO','PROFILE_PUBLICATION','BOOLEAN',true,NULL),('PRO','SIGNATURE_INTEGRATION','BOOLEAN',true,NULL),('PRO','ADVANCED_ANALYTICS','BOOLEAN',true,NULL),('PRO','MAX_ACTIVE_SERVICES','INTEGER',NULL,20),
  ('BUSINESS','PROFILE_PUBLICATION','BOOLEAN',true,NULL),('BUSINESS','ADVANCED_ANALYTICS','BOOLEAN',true,NULL),('BUSINESS','PRIORITY_SUPPORT','BOOLEAN',true,NULL),('BUSINESS','TEAM_MEMBER_LIMIT','INTEGER',NULL,25)
) AS entitlement(plan_key,key,value_type,boolean_value,integer_value) ON plan.key=entitlement.plan_key
ON CONFLICT ("plan_id","key") DO NOTHING;

INSERT INTO "platform_fee_policies" ("id","name","rule_type","scope","percentage_basis_points","active_from","status","version","created_at","updated_at")
SELECT gen_random_uuid(),'Default marketplace fee','PERCENTAGE'::"PlatformFeeRuleType",'GLOBAL'::"PlatformFeeScope",500,now(),'ACTIVE'::"SubscriptionCatalogStatus",1,now(),now()
WHERE NOT EXISTS (SELECT 1 FROM "platform_fee_policies" WHERE "scope"='GLOBAL' AND "status"='ACTIVE');

COMMIT;
