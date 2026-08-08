-- Keep the workspace bootstrap exception explicit and transaction-scoped. The
-- app sets this value only while atomically creating the workspace and owner.
DROP POLICY "workspaces_select_policy" ON "workspaces";
DROP POLICY "workspaces_insert_policy" ON "workspaces";

CREATE POLICY "workspaces_select_policy" ON "workspaces"
  FOR SELECT TO weddingos_app
  USING (
    public.weddingos_has_workspace_access("id")
    OR (
      "id" = NULLIF(current_setting('app.current_bootstrap_workspace_id', true), '')::uuid
      AND "id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY "workspaces_insert_policy" ON "workspaces"
  FOR INSERT TO weddingos_app
  WITH CHECK (
    "id" = NULLIF(current_setting('app.current_bootstrap_workspace_id', true), '')::uuid
    AND "id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

-- Invitation acceptance must also be able to reactivate a previously removed
-- membership. Keep that exception bound to the exact token, email and user.
CREATE OR REPLACE FUNCTION public.weddingos_has_valid_invitation(
  target_workspace_id uuid,
  target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_invitations AS invitation
    JOIN public.users AS invited_user ON invited_user.email = invitation.email
    WHERE invitation.workspace_id = target_workspace_id
      AND invitation.token_hash = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
      AND invited_user.id = target_user_id
      AND target_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      AND invitation.status = 'PENDING'
      AND invitation.expires_at > now()
  );
$function$;

REVOKE ALL ON FUNCTION public.weddingos_has_valid_invitation(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_has_valid_invitation(uuid, uuid) TO weddingos_app;

DROP POLICY "memberships_insert_policy" ON "workspace_memberships";
DROP POLICY "memberships_update_policy" ON "workspace_memberships";

CREATE POLICY "memberships_insert_policy" ON "workspace_memberships"
  FOR INSERT TO weddingos_app
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND (
      public.weddingos_has_workspace_access("workspace_id")
      OR public.weddingos_can_create_initial_owner("workspace_id")
      OR public.weddingos_has_valid_invitation("workspace_id", "user_id")
    )
  );

CREATE POLICY "memberships_update_policy" ON "workspace_memberships"
  FOR UPDATE TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND (
      public.weddingos_has_workspace_access("workspace_id")
      OR public.weddingos_has_valid_invitation("workspace_id", "user_id")
    )
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND (
      public.weddingos_has_workspace_access("workspace_id")
      OR public.weddingos_has_valid_invitation("workspace_id", "user_id")
    )
  );
