CREATE OR REPLACE FUNCTION public.weddingos_public_vendor_organization_active(target_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendor_organizations AS organization
    WHERE organization.id = target_organization_id
      AND organization.status = 'ACTIVE'
      AND organization.deleted_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.weddingos_public_vendor_organization_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_public_vendor_organization_active(uuid) TO weddingos_app;
