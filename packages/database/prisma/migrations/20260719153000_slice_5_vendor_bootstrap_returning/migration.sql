-- Prisma INSERT ... RETURNING evaluates SELECT policies. During organization
-- bootstrap the membership cannot exist until after the organization row, so
-- permit only the persisted creator, bound to both transaction-local IDs, to
-- read that single row while the atomic bootstrap transaction is in progress.
CREATE POLICY "vendor_organizations_bootstrap_read" ON "vendor_organizations"
  FOR SELECT TO weddingos_app
  USING (
    "id" = NULLIF(current_setting('app.current_vendor_organization_id', true), '')::uuid
    AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
