-- Guest-authenticated media mutations may emit only the two redacted Slice 8
-- events tied to the persisted guest grant. Keep the allowlist explicit.
DROP POLICY IF EXISTS "outbox_messages_guest_insert_policy" ON "outbox_messages";
CREATE POLICY "outbox_messages_guest_insert_policy" ON "outbox_messages"
FOR INSERT TO weddingos_app
WITH CHECK (
  "event_name" IN (
    'invitation.opened.v1',
    'rsvp.submitted.v1',
    'rsvp.updated.v1',
    'rsvp.declined.v1',
    'menu.selection_changed.v1',
    'allergy.reported.v1',
    'guest_moment.uploaded.v1',
    'guest_moment.reported.v1'
  )
  AND "workspace_id" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
);

DROP POLICY IF EXISTS "outbox_messages_guest_select_policy" ON "outbox_messages";
CREATE POLICY "outbox_messages_guest_select_policy" ON "outbox_messages"
FOR SELECT TO weddingos_app
USING (
  "event_name" IN (
    'invitation.opened.v1',
    'rsvp.submitted.v1',
    'rsvp.updated.v1',
    'rsvp.declined.v1',
    'menu.selection_changed.v1',
    'allergy.reported.v1',
    'guest_moment.uploaded.v1',
    'guest_moment.reported.v1'
  )
  AND "workspace_id" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
);
