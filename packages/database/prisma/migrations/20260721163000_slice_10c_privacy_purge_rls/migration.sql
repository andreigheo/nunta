BEGIN;

CREATE POLICY "budget_plan_privacy_purge" ON "budget_plans"
FOR DELETE TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.privacy.process'));

CREATE POLICY "budget_category_privacy_purge" ON "budget_categories"
FOR DELETE TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.privacy.process'));

CREATE POLICY "budget_item_privacy_purge" ON "budget_items"
FOR DELETE TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.privacy.process'));

CREATE POLICY "expense_record_privacy_purge" ON "expense_records"
FOR DELETE TO weddingos_app
USING (public.weddingos_has_platform_capability('platform.privacy.process'));

COMMIT;
