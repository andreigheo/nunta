CREATE TABLE "document_derivatives" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "vendor_organization_id" uuid NOT NULL,
  "source_stored_object_id" uuid NOT NULL,
  "derivative_stored_object_id" uuid NOT NULL,
  "kind" varchar(40) NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'AVAILABLE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "document_derivatives_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_derivatives_dimensions" CHECK ("width" > 0 AND "height" > 0),
  CONSTRAINT "document_derivatives_source_fkey" FOREIGN KEY ("source_stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT,
  CONSTRAINT "document_derivatives_output_fkey" FOREIGN KEY ("derivative_stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX "document_derivatives_source_stored_object_id_key" ON "document_derivatives"("source_stored_object_id");
CREATE UNIQUE INDEX "document_derivatives_derivative_stored_object_id_key" ON "document_derivatives"("derivative_stored_object_id");
CREATE INDEX "document_derivatives_vendor_status_created_idx" ON "document_derivatives"("vendor_organization_id", "status", "created_at");
CREATE UNIQUE INDEX "vendor_portfolio_references_artifact_id_key" ON "vendor_portfolio_references"("artifact_id") WHERE "deleted_at" IS NULL;

ALTER TABLE "document_derivatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_derivatives" FORCE ROW LEVEL SECURITY;
CREATE POLICY "document_derivatives_app_vendor" ON "document_derivatives" FOR ALL TO weddingos_app
  USING (public.weddingos_has_vendor_access("vendor_organization_id"))
  WITH CHECK (public.weddingos_has_vendor_access("vendor_organization_id"));
CREATE POLICY "document_derivatives_worker_vendor" ON "document_derivatives" FOR ALL TO weddingos_worker
  USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, NULL, NULL, "vendor_organization_id"))
  WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, NULL, NULL, "vendor_organization_id"));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "document_derivatives" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "document_derivatives", "vendor_portfolio_references" TO weddingos_worker;

-- The public endpoint receives only an opaque derivative UUID. This function
-- returns storage metadata exclusively when both the reference and vendor
-- profile are published; object keys never leave the API process.
CREATE OR REPLACE FUNCTION public.weddingos_public_portfolio_asset(p_derivative_id uuid)
RETURNS TABLE(object_key text, content_type text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT stored.object_key::text,
         COALESCE(stored.content_type_detected, stored.content_type_claimed)::text
  FROM document_derivatives derivative
  JOIN stored_objects stored ON stored.id = derivative.derivative_stored_object_id
  JOIN vendor_portfolio_references reference ON reference.artifact_id = derivative.id
  JOIN vendor_profiles profile ON profile.vendor_organization_id = derivative.vendor_organization_id
  JOIN vendor_organizations organization ON organization.id = derivative.vendor_organization_id
  WHERE derivative.id = p_derivative_id
    AND derivative.status = 'AVAILABLE'
    AND stored.status = 'AVAILABLE'
    AND reference.published = true
    AND reference.deleted_at IS NULL
    AND profile.publication_status = 'PUBLISHED'
    AND organization.status = 'ACTIVE'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.weddingos_public_portfolio_asset(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_public_portfolio_asset(uuid) TO weddingos_app;
