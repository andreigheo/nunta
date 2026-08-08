BEGIN;

DROP POLICY IF EXISTS "budget_plan_privacy_purge" ON "budget_plans";
DROP POLICY IF EXISTS "budget_category_privacy_purge" ON "budget_categories";
DROP POLICY IF EXISTS "budget_item_privacy_purge" ON "budget_items";
DROP POLICY IF EXISTS "expense_record_privacy_purge" ON "expense_records";

CREATE POLICY "budget_plan_privacy_read_for_purge" ON "budget_plans"
FOR SELECT TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);
CREATE POLICY "budget_plan_privacy_purge" ON "budget_plans"
FOR DELETE TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);

CREATE POLICY "budget_category_privacy_read_for_purge" ON "budget_categories"
FOR SELECT TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);
CREATE POLICY "budget_category_privacy_purge" ON "budget_categories"
FOR DELETE TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);

CREATE POLICY "budget_item_privacy_read_for_purge" ON "budget_items"
FOR SELECT TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);
CREATE POLICY "budget_item_privacy_purge" ON "budget_items"
FOR DELETE TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);

CREATE POLICY "expense_record_privacy_read_for_purge" ON "expense_records"
FOR SELECT TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);
CREATE POLICY "expense_record_privacy_purge" ON "expense_records"
FOR DELETE TO weddingos_app
USING (
  public.weddingos_has_platform_capability('platform.privacy.process')
  AND "workspace_id" = NULLIF(current_setting('app.current_deletion_target_id', true), '')::uuid
);

COMMIT;
