-- Portfolio references are materialized only by the persisted document-scan
-- consumer. The worker may write them exclusively while its durable vendor
-- execution context matches the reference tenant.
CREATE POLICY "vendor_portfolio_references_worker_vendor"
ON "vendor_portfolio_references"
FOR ALL
TO weddingos_worker
USING (
  public.weddingos_worker_execution_context_matches(
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    "vendor_organization_id"
  )
)
WITH CHECK (
  public.weddingos_worker_execution_context_matches(
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    "vendor_organization_id"
  )
);
