BEGIN;

CREATE POLICY "users_platform_read" ON "users" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.read'));
CREATE POLICY "users_platform_suspend" ON "users" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.suspend') OR public.weddingos_has_platform_capability('platform.user.reactivate'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.suspend') OR public.weddingos_has_platform_capability('platform.user.reactivate'));
CREATE POLICY "user_profiles_platform_read" ON "user_profiles" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.read'));
CREATE POLICY "sessions_platform_read" ON "sessions" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.read'));
CREATE POLICY "sessions_platform_revoke" ON "sessions" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.user.suspend'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.user.suspend'));

CREATE POLICY "workspaces_platform_read" ON "workspaces" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.workspace.read'));
CREATE POLICY "workspaces_platform_status" ON "workspaces" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.workspace.suspend') OR public.weddingos_has_platform_capability('platform.workspace.reactivate'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.workspace.suspend') OR public.weddingos_has_platform_capability('platform.workspace.reactivate'));
CREATE POLICY "workspace_memberships_platform_read" ON "workspace_memberships" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.workspace.read') OR public.weddingos_has_platform_capability('platform.user.read'));

CREATE POLICY "vendor_organizations_platform_read" ON "vendor_organizations" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.vendor.read'));
CREATE POLICY "vendor_organizations_platform_status" ON "vendor_organizations" FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.vendor.suspend') OR public.weddingos_has_platform_capability('platform.vendor.reactivate') OR public.weddingos_has_platform_capability('platform.vendor_suspend'))
  WITH CHECK (public.weddingos_has_platform_capability('platform.vendor.suspend') OR public.weddingos_has_platform_capability('platform.vendor.reactivate') OR public.weddingos_has_platform_capability('platform.vendor_suspend'));
CREATE POLICY "vendor_memberships_platform_read" ON "vendor_organization_memberships" FOR SELECT TO weddingos_app
  USING (public.weddingos_has_platform_capability('platform.vendor.read') OR public.weddingos_has_platform_capability('platform.user.read'));

COMMIT;
