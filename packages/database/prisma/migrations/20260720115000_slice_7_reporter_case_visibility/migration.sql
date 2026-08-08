BEGIN;

-- Prisma uses INSERT ... RETURNING for moderation intake. The reporter may
-- read only the case created from their own persisted report; this does not
-- grant access to vendor disputes, assignments or platform decisions.
CREATE POLICY "moderation_cases_reporter_select"
ON "vendor_review_moderation_cases"
FOR SELECT TO weddingos_app
USING (
  "source_type" = 'REPORT'
  AND EXISTS (
    SELECT 1
    FROM "vendor_review_reports" report
    WHERE report."id" = "vendor_review_moderation_cases"."source_id"
      AND report."review_id" = "vendor_review_moderation_cases"."review_id"
      AND report."reporter_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
);

COMMIT;
