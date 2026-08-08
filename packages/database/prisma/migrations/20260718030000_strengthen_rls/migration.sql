CREATE OR REPLACE FUNCTION public.weddingos_has_workspace_access(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = target_workspace_id
      AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND membership.status = 'ACTIVE'
  );
$function$;

REVOKE ALL ON FUNCTION public.weddingos_has_workspace_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_has_workspace_access(uuid) TO weddingos_app;

CREATE OR REPLACE FUNCTION public.weddingos_can_create_initial_owner(target_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspaces AS workspace
    WHERE workspace.id = target_workspace_id
      AND workspace.created_by = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND NOT EXISTS (
        SELECT 1 FROM public.workspace_memberships AS existing_membership
        WHERE existing_membership.workspace_id = target_workspace_id
          AND existing_membership.status = 'ACTIVE'
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.weddingos_can_create_initial_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_can_create_initial_owner(uuid) TO weddingos_app;

DROP POLICY "workspaces_select_policy" ON "workspaces";
DROP POLICY "workspaces_update_policy" ON "workspaces";
DROP POLICY "workspaces_delete_policy" ON "workspaces";
DROP POLICY "wedding_profiles_tenant_policy" ON "wedding_profiles";
DROP POLICY "memberships_select_policy" ON "workspace_memberships";
DROP POLICY "memberships_insert_policy" ON "workspace_memberships";
DROP POLICY "memberships_update_policy" ON "workspace_memberships";
DROP POLICY "memberships_delete_policy" ON "workspace_memberships";
DROP POLICY "capability_overrides_tenant_policy" ON "membership_capability_overrides";
DROP POLICY "team_invitations_select_policy" ON "team_invitations";
DROP POLICY "team_invitations_insert_policy" ON "team_invitations";
DROP POLICY "team_invitations_update_policy" ON "team_invitations";
DROP POLICY "team_invitations_delete_policy" ON "team_invitations";
DROP POLICY "audit_events_tenant_policy" ON "audit_events";
DROP POLICY "idempotency_records_tenant_policy" ON "idempotency_records";

CREATE POLICY "workspaces_select_policy" ON "workspaces"
  FOR SELECT TO weddingos_app
  USING (public.weddingos_has_workspace_access("id"));

CREATE POLICY "workspaces_update_policy" ON "workspaces"
  FOR UPDATE TO weddingos_app
  USING (public.weddingos_has_workspace_access("id"))
  WITH CHECK (public.weddingos_has_workspace_access("id"));

CREATE POLICY "workspaces_delete_policy" ON "workspaces"
  FOR DELETE TO weddingos_app
  USING (public.weddingos_has_workspace_access("id"));

CREATE POLICY "wedding_profiles_tenant_policy" ON "wedding_profiles"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "memberships_select_policy" ON "workspace_memberships"
  FOR SELECT TO weddingos_app
  USING (
    "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND public.weddingos_has_workspace_access("workspace_id")
    )
  );

CREATE POLICY "memberships_insert_policy" ON "workspace_memberships"
  FOR INSERT TO weddingos_app
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND (
      public.weddingos_has_workspace_access("workspace_id")
      OR public.weddingos_can_create_initial_owner("workspace_id")
      OR EXISTS (
        SELECT 1 FROM "team_invitations" invitation
        JOIN "users" invited_user ON invited_user."email" = invitation."email"
        WHERE invitation."workspace_id" = "workspace_memberships"."workspace_id"
          AND invitation."token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
          AND invited_user."id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND invitation."status" = 'PENDING'
          AND invitation."expires_at" > now()
      )
    )
  );

CREATE POLICY "memberships_update_policy" ON "workspace_memberships"
  FOR UPDATE TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "memberships_delete_policy" ON "workspace_memberships"
  FOR DELETE TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "capability_overrides_tenant_policy" ON "membership_capability_overrides"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "team_invitations_select_policy" ON "team_invitations"
  FOR SELECT TO weddingos_app
  USING (
    (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND public.weddingos_has_workspace_access("workspace_id")
    )
    OR "token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
  );

CREATE POLICY "team_invitations_insert_policy" ON "team_invitations"
  FOR INSERT TO weddingos_app
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "team_invitations_update_policy" ON "team_invitations"
  FOR UPDATE TO weddingos_app
  USING (
    (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND public.weddingos_has_workspace_access("workspace_id")
    )
    OR "token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
  )
  WITH CHECK (
    (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND public.weddingos_has_workspace_access("workspace_id")
    )
    OR "token_hash" = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
  );

CREATE POLICY "team_invitations_delete_policy" ON "team_invitations"
  FOR DELETE TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "audit_events_tenant_policy" ON "audit_events"
  FOR ALL TO weddingos_app
  USING (
    ("workspace_id" IS NULL AND "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    OR (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND public.weddingos_has_workspace_access("workspace_id")
    )
  )
  WITH CHECK (
    ("workspace_id" IS NULL AND "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    OR (
      "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND public.weddingos_has_workspace_access("workspace_id")
    )
  );

CREATE POLICY "idempotency_records_tenant_policy" ON "idempotency_records"
  FOR ALL TO weddingos_app
  USING (
    "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND ("workspace_id" IS NULL OR public.weddingos_has_workspace_access("workspace_id"))
  )
  WITH CHECK (
    "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND ("workspace_id" IS NULL OR public.weddingos_has_workspace_access("workspace_id"))
  );
