-- A token-scoped household may create or reuse only allergy workflow rows
-- belonging to guests from that same household. Organizer capabilities still
-- control whether details are exposed by authenticated API routes.
CREATE POLICY "allergy_issues_guest_policy" ON "allergy_issues"
FOR ALL TO weddingos_app
USING (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1 FROM guests guest
    WHERE guest.id = "guest_id"
      AND public.weddingos_guest_grant_matches(guest.workspace_id, guest.household_id, NULL)
  )
)
WITH CHECK (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1 FROM guests guest
    WHERE guest.id = "guest_id"
      AND public.weddingos_guest_grant_matches(guest.workspace_id, guest.household_id, NULL)
  )
);
