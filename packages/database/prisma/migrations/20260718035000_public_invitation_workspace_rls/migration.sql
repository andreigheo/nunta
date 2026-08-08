CREATE OR REPLACE FUNCTION public.weddingos_public_invitation_targets_workspace(
  target_workspace_id uuid
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
    WHERE invitation.workspace_id = target_workspace_id
      AND invitation.token_hash = NULLIF(current_setting('app.current_invitation_token_hash', true), '')
      AND invitation.status = 'PENDING'
      AND invitation.expires_at > now()
  );
$function$;

REVOKE ALL ON FUNCTION public.weddingos_public_invitation_targets_workspace(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_public_invitation_targets_workspace(uuid) TO weddingos_app;

DROP POLICY "workspaces_select_policy" ON "workspaces";

CREATE POLICY "workspaces_select_policy" ON "workspaces"
  FOR SELECT TO weddingos_app
  USING (
    public.weddingos_has_workspace_access("id")
    OR public.weddingos_public_invitation_targets_workspace("id")
    OR (
      "id" = NULLIF(current_setting('app.current_bootstrap_workspace_id', true), '')::uuid
      AND "id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
      AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  );

CREATE POLICY "wedding_profiles_public_invitation_select_policy" ON "wedding_profiles"
  FOR SELECT TO weddingos_app
  USING (public.weddingos_public_invitation_targets_workspace("workspace_id"));
