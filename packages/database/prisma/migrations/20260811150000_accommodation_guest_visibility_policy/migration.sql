DROP POLICY IF EXISTS "accommodation_recommendations_guest_policy"
ON "accommodation_recommendations";

CREATE POLICY "accommodation_recommendations_guest_policy"
ON "accommodation_recommendations" FOR SELECT TO weddingos_app
USING (
  "status" = 'PUBLISHED'
  AND "deleted_at" IS NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1
    FROM "wedding_events" event
    WHERE event."id" = "accommodation_recommendations"."wedding_event_id"
      AND event."workspace_id" = "accommodation_recommendations"."workspace_id"
      AND event."guest_visible"
      AND event."deleted_at" IS NULL
      AND event."status" = 'CONFIRMED'
  )
);
