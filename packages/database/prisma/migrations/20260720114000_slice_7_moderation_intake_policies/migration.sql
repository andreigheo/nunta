BEGIN;

-- A report or vendor dispute may open a moderation case, but it may never
-- assign, transition or decide that case. The source row, review and vendor
-- must match the persisted intake record; arbitrary client identifiers are
-- insufficient.
CREATE POLICY "moderation_cases_trusted_intake"
ON "vendor_review_moderation_cases"
FOR INSERT TO weddingos_app
WITH CHECK (
  (
    "source_type" = 'DISPUTE'
    AND public.weddingos_has_vendor_access("vendor_organization_id")
    AND EXISTS (
      SELECT 1
      FROM "vendor_review_disputes" dispute
      WHERE dispute."id" = "vendor_review_moderation_cases"."source_id"
        AND dispute."review_id" = "vendor_review_moderation_cases"."review_id"
        AND dispute."vendor_organization_id" = "vendor_review_moderation_cases"."vendor_organization_id"
    )
  )
  OR
  (
    "source_type" = 'REPORT'
    AND EXISTS (
      SELECT 1
      FROM "vendor_review_reports" report
      JOIN "vendor_reviews" review ON review."id" = report."review_id"
      WHERE report."id" = "vendor_review_moderation_cases"."source_id"
        AND report."reporter_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND review."id" = "vendor_review_moderation_cases"."review_id"
        AND review."vendor_organization_id" = "vendor_review_moderation_cases"."vendor_organization_id"
    )
  )
);

COMMIT;
