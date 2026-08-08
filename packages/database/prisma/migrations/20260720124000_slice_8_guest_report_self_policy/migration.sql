-- A guest report is idempotently upserted. PostgreSQL requires SELECT and
-- UPDATE visibility for INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING.
-- Keep both policies scoped to the persisted current guest grant.
CREATE POLICY "guest_moment_reports_grant_read" ON "guest_moment_reports"
FOR SELECT TO weddingos_app
USING (
  "guest_access_grant_id" = NULLIF(
    current_setting('app.current_guest_access_grant_id', true),
    ''
  )::uuid
);

CREATE POLICY "guest_moment_reports_grant_update" ON "guest_moment_reports"
FOR UPDATE TO weddingos_app
USING (
  "guest_access_grant_id" = NULLIF(
    current_setting('app.current_guest_access_grant_id', true),
    ''
  )::uuid
)
WITH CHECK (
  "guest_access_grant_id" = NULLIF(
    current_setting('app.current_guest_access_grant_id', true),
    ''
  )::uuid
);
