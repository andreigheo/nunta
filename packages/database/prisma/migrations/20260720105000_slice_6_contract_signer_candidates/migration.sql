CREATE OR REPLACE FUNCTION public.weddingos_workspace_can_select_vendor_signer(
  target_membership_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vendor_organization_memberships membership
    JOIN vendor_contracts contract
      ON contract.vendor_organization_id = membership.vendor_organization_id
    WHERE membership.id = target_membership_id
      AND membership.status = 'ACTIVE'
      AND contract.workspace_id = NULLIF(
        current_setting('app.current_workspace_id', true),
        ''
      )::uuid
      AND public.weddingos_has_workspace_access(contract.workspace_id)
  );
$$;

REVOKE ALL ON FUNCTION public.weddingos_workspace_can_select_vendor_signer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_workspace_can_select_vendor_signer(uuid) TO weddingos_app;

CREATE POLICY "vendor_memberships_contract_signer_read"
ON "vendor_organization_memberships"
FOR SELECT
TO weddingos_app
USING (
  public.weddingos_workspace_can_select_vendor_signer("id")
);
