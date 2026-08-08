BEGIN;

CREATE POLICY "deletion_plan_owner_read" ON "deletion_plans"
FOR SELECT TO weddingos_app
USING (
  EXISTS (
    SELECT 1
    FROM "deletion_requests" request
    WHERE request."id" = "deletion_plans"."deletion_request_id"
      AND request."requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
);

CREATE POLICY "deletion_plan_owner_insert" ON "deletion_plans"
FOR INSERT TO weddingos_app
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM "deletion_requests" request
    WHERE request."id" = "deletion_plans"."deletion_request_id"
      AND request."requester_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
);

COMMIT;
