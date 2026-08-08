-- A guest may open a moderation case only when the same persisted guest grant
-- has already filed a report for that moment. No guest read/update policy is
-- granted for internal moderation cases.
CREATE POLICY "guest_moment_case_report_insert" ON "guest_moment_moderation_cases"
FOR INSERT TO weddingos_app
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "guest_moment_reports" report_row
    WHERE report_row."guest_moment_id" = "guest_moment_moderation_cases"."guest_moment_id"
      AND report_row."workspace_id" = "guest_moment_moderation_cases"."workspace_id"
      AND report_row."guest_access_grant_id" = NULLIF(
        current_setting('app.current_guest_access_grant_id', true),
        ''
      )::uuid
  )
);
