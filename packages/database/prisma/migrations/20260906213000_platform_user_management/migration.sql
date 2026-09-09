BEGIN;

ALTER TABLE "users"
  ALTER COLUMN "accepted_terms_version" DROP NOT NULL,
  ALTER COLUMN "accepted_terms_at" DROP NOT NULL;

UPDATE "platform_roles"
SET
  "capabilities" = "capabilities" || '["platform.user.create","platform.user.update","platform.user.manage_access","platform.usage.read"]'::jsonb,
  "version" = "version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'PLATFORM_SUPER_ADMIN';

CREATE POLICY "users_platform_create" ON "users" FOR INSERT TO weddingos_app
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.create'));
CREATE POLICY "users_platform_update" ON "users" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.update'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.update'));

CREATE POLICY "user_profiles_platform_create" ON "user_profiles" FOR INSERT TO weddingos_app
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.create'));
CREATE POLICY "user_profiles_platform_update" ON "user_profiles" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.update'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.update'));

CREATE POLICY "workspace_memberships_platform_manage" ON "workspace_memberships" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.manage_access'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.manage_access'));
CREATE POLICY "workspace_memberships_platform_create" ON "workspace_memberships" FOR INSERT TO weddingos_app
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.manage_access'));

DROP POLICY IF EXISTS "platform_grants_platform" ON "platform_grants";
CREATE POLICY "platform_grants_platform_read" ON "platform_grants" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.audit.read'));
CREATE POLICY "platform_grants_platform_create" ON "platform_grants" FOR INSERT TO weddingos_app
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.manage_access'));
CREATE POLICY "platform_grants_platform_update" ON "platform_grants" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.manage_access'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.manage_access'));

CREATE POLICY "users_platform_usage_read" ON "users" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "workspaces_platform_usage_read" ON "workspaces" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "workspace_memberships_platform_usage_read" ON "workspace_memberships" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "role_templates_platform_usage_read" ON "role_templates" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "workspace_subscriptions_platform_usage_read" ON "workspace_subscriptions" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "stored_objects_platform_usage_read" ON "stored_objects" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "copilot_usage_records_platform_usage_read" ON "copilot_usage_records" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));
CREATE POLICY "guest_moment_media_platform_usage_read" ON "guest_moment_media" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.usage.read'));

COMMIT;
