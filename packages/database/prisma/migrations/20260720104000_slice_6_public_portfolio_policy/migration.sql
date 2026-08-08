CREATE OR REPLACE FUNCTION public.weddingos_public_portfolio_reference_visible(
  p_reference_id uuid
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
    FROM vendor_portfolio_references reference
    JOIN document_derivatives derivative
      ON derivative.id = reference.artifact_id
    JOIN stored_objects stored
      ON stored.id = derivative.derivative_stored_object_id
    JOIN vendor_profiles profile
      ON profile.vendor_organization_id = reference.vendor_organization_id
    JOIN vendor_organizations organization
      ON organization.id = reference.vendor_organization_id
    WHERE reference.id = p_reference_id
      AND reference.published = true
      AND reference.deleted_at IS NULL
      AND derivative.status = 'AVAILABLE'
      AND stored.status = 'AVAILABLE'
      AND profile.publication_status = 'PUBLISHED'
      AND organization.status = 'ACTIVE'
  );
$$;

REVOKE ALL ON FUNCTION public.weddingos_public_portfolio_reference_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_public_portfolio_reference_visible(uuid) TO weddingos_app;

CREATE POLICY "vendor_portfolio_references_marketplace_read"
ON "vendor_portfolio_references"
FOR SELECT
TO weddingos_app
USING (
  public.weddingos_public_portfolio_reference_visible("id")
);
