-- Slice 3 tenant isolation, token-scoped guest access and role defaults.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "wedding_events", "households", "guests", "guest_relationships",
  "guest_tags", "guest_tag_assignments", "guest_contact_logs",
  "guest_imports", "guest_import_rows", "invitation_sites",
  "invitation_versions", "invitation_recipients", "guest_access_grants",
  "campaigns", "campaign_recipients", "rsvp_form_definitions",
  "rsvp_form_versions", "rsvp_submissions", "guest_event_responses",
  "menus", "menu_courses", "dietary_tags", "menu_dietary_tags",
  "guest_menu_selections", "guest_allergies", "allergy_issues"
TO weddingos_app;
GRANT SELECT, INSERT ON TABLE "provider_webhook_events" TO weddingos_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  "wedding_events", "households", "guests", "guest_contact_logs",
  "guest_imports", "guest_import_rows", "invitation_sites",
  "invitation_versions", "invitation_recipients", "guest_access_grants",
  "campaigns", "campaign_recipients", "rsvp_form_definitions",
  "rsvp_form_versions", "rsvp_submissions", "guest_event_responses",
  "menus", "menu_courses", "dietary_tags", "menu_dietary_tags",
  "guest_menu_selections", "guest_allergies", "allergy_issues"
TO weddingos_worker;

DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'wedding_events','households','guests','guest_relationships','guest_tags',
    'guest_tag_assignments','guest_contact_logs','guest_imports','guest_import_rows',
    'invitation_sites','invitation_versions','invitation_recipients',
    'guest_access_grants','campaigns','campaign_recipients',
    'rsvp_form_definitions','rsvp_form_versions','rsvp_submissions',
    'guest_event_responses','menus','menu_courses','dietary_tags',
    'menu_dietary_tags','guest_menu_selections','guest_allergies','allergy_issues'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id))',
      table_name || '_organizer_policy', table_name
    );
  END LOOP;
END
$block$;

-- A token hash may reveal only its active grant row. The API then binds the
-- returned grant id and workspace to the same transaction.
CREATE POLICY "guest_access_grants_token_policy" ON "guest_access_grants"
FOR SELECT TO weddingos_app
USING (
  "token_hash" = NULLIF(current_setting('app.current_guest_token_hash', true), '')
  AND "revoked_at" IS NULL
  AND ("expires_at" IS NULL OR "expires_at" > now())
);

CREATE OR REPLACE FUNCTION public.weddingos_guest_grant_matches(
  target_workspace_id uuid,
  target_household_id uuid DEFAULT NULL,
  target_recipient_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.guest_access_grants grant_row
    WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
      AND grant_row.token_hash = NULLIF(current_setting('app.current_guest_token_hash', true), '')
      AND grant_row.workspace_id = target_workspace_id
      AND grant_row.revoked_at IS NULL
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
      AND (target_household_id IS NULL OR grant_row.household_id = target_household_id)
      AND (target_recipient_id IS NULL OR grant_row.invitation_recipient_id = target_recipient_id)
  );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_guest_grant_matches(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_grant_matches(uuid, uuid, uuid) TO weddingos_app;

CREATE POLICY "households_guest_policy" ON "households" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", "id", NULL));
CREATE POLICY "guests_guest_policy" ON "guests" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", "household_id", NULL));
CREATE POLICY "guests_guest_insert_policy" ON "guests" FOR INSERT TO weddingos_app
WITH CHECK ("is_plus_one" AND public.weddingos_guest_grant_matches("workspace_id", "household_id", NULL));
CREATE POLICY "guests_guest_update_policy" ON "guests" FOR UPDATE TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", "household_id", NULL))
WITH CHECK (public.weddingos_guest_grant_matches("workspace_id", "household_id", NULL));
CREATE POLICY "wedding_events_guest_policy" ON "wedding_events" FOR SELECT TO weddingos_app
USING ("guest_visible" AND "deleted_at" IS NULL AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "invitation_recipients_guest_policy" ON "invitation_recipients" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", "household_id", "id"));
CREATE POLICY "invitation_recipients_guest_update_policy" ON "invitation_recipients" FOR UPDATE TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", "household_id", "id"))
WITH CHECK (public.weddingos_guest_grant_matches("workspace_id", "household_id", "id"));
CREATE POLICY "guest_access_grants_self_update_policy" ON "guest_access_grants" FOR UPDATE TO weddingos_app
USING (
  "id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  AND "token_hash" = NULLIF(current_setting('app.current_guest_token_hash', true), '')
)
WITH CHECK (
  "id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  AND "token_hash" = NULLIF(current_setting('app.current_guest_token_hash', true), '')
);
CREATE POLICY "invitation_sites_guest_policy" ON "invitation_sites" FOR SELECT TO weddingos_app
USING ("status" = 'PUBLISHED' AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "invitation_versions_guest_policy" ON "invitation_versions" FOR SELECT TO weddingos_app
USING (
  "published_at" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1 FROM invitation_recipients recipient
    WHERE recipient.invitation_version_id = invitation_versions.id
      AND public.weddingos_guest_grant_matches(recipient.workspace_id, recipient.household_id, recipient.id)
  )
);
CREATE POLICY "rsvp_forms_guest_policy" ON "rsvp_form_definitions" FOR SELECT TO weddingos_app
USING ("status" = 'PUBLISHED' AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "rsvp_form_versions_guest_policy" ON "rsvp_form_versions" FOR SELECT TO weddingos_app
USING ("immutable" AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "menus_guest_policy" ON "menus" FOR SELECT TO weddingos_app
USING ("status" = 'ACTIVE' AND "deleted_at" IS NULL AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "menu_courses_guest_policy" ON "menu_courses" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "dietary_tags_guest_policy" ON "dietary_tags" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "menu_dietary_tags_guest_policy" ON "menu_dietary_tags" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", NULL, NULL));
CREATE POLICY "rsvp_submissions_guest_policy" ON "rsvp_submissions" FOR ALL TO weddingos_app
USING (public.weddingos_guest_grant_matches("workspace_id", "household_id", "invitation_recipient_id"))
WITH CHECK (public.weddingos_guest_grant_matches("workspace_id", "household_id", "invitation_recipient_id"));
CREATE POLICY "guest_event_responses_guest_policy" ON "guest_event_responses" FOR ALL TO weddingos_app
USING (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1 FROM rsvp_submissions submission
    WHERE submission.id = guest_event_responses.submission_id
      AND public.weddingos_guest_grant_matches(submission.workspace_id, submission.household_id, submission.invitation_recipient_id)
  )
)
WITH CHECK (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (
    SELECT 1 FROM rsvp_submissions submission
    WHERE submission.id = guest_event_responses.submission_id
      AND public.weddingos_guest_grant_matches(submission.workspace_id, submission.household_id, submission.invitation_recipient_id)
  )
);
CREATE POLICY "guest_menu_selections_guest_policy" ON "guest_menu_selections" FOR ALL TO weddingos_app
USING (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (SELECT 1 FROM guests guest WHERE guest.id = "guest_id" AND public.weddingos_guest_grant_matches(guest.workspace_id, guest.household_id, NULL))
)
WITH CHECK (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (SELECT 1 FROM guests guest WHERE guest.id = "guest_id" AND public.weddingos_guest_grant_matches(guest.workspace_id, guest.household_id, NULL))
);
CREATE POLICY "guest_allergies_guest_policy" ON "guest_allergies" FOR ALL TO weddingos_app
USING (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (SELECT 1 FROM guests guest WHERE guest.id = "guest_id" AND public.weddingos_guest_grant_matches(guest.workspace_id, guest.household_id, NULL))
)
WITH CHECK (
  public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
  AND EXISTS (SELECT 1 FROM guests guest WHERE guest.id = "guest_id" AND public.weddingos_guest_grant_matches(guest.workspace_id, guest.household_id, NULL))
);

-- Public RSVP mutations may publish only the two redacted, allowlisted domain
-- events tied to the current grant. Consumer executions must reference that
-- same persisted outbox row.
CREATE POLICY "outbox_messages_guest_insert_policy" ON "outbox_messages"
FOR INSERT TO weddingos_app
WITH CHECK (
  "event_name" IN ('invitation.opened.v1', 'rsvp.submitted.v1', 'rsvp.updated.v1', 'rsvp.declined.v1', 'menu.selection_changed.v1', 'allergy.reported.v1')
  AND "workspace_id" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
);
CREATE POLICY "outbox_messages_guest_select_policy" ON "outbox_messages"
FOR SELECT TO weddingos_app
USING (
  "event_name" IN ('invitation.opened.v1', 'rsvp.submitted.v1', 'rsvp.updated.v1', 'rsvp.declined.v1', 'menu.selection_changed.v1', 'allergy.reported.v1')
  AND "workspace_id" IS NOT NULL
  AND public.weddingos_guest_grant_matches("workspace_id", NULL, NULL)
);
CREATE POLICY "consumer_executions_guest_insert_policy" ON "outbox_consumer_executions"
FOR INSERT TO weddingos_app
WITH CHECK (
  EXISTS (
    SELECT 1 FROM outbox_messages event
    WHERE event.id = "outbox_message_id"
      AND event.workspace_id IS NOT NULL
      AND public.weddingos_guest_grant_matches(event.workspace_id, NULL, NULL)
  )
);

-- Worker access is derived from the persisted execution/outbox context, never
-- from a workspace id supplied in the BullMQ payload.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'wedding_events','households','guests','guest_contact_logs','guest_imports',
    'guest_import_rows','invitation_sites','invitation_versions',
    'invitation_recipients','guest_access_grants','campaigns',
    'campaign_recipients','rsvp_form_definitions','rsvp_form_versions',
    'rsvp_submissions','guest_event_responses','menus','menu_courses',
    'dietary_tags','menu_dietary_tags','guest_menu_selections',
    'guest_allergies','allergy_issues'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL))',
      table_name || '_worker_policy', table_name
    );
  END LOOP;
END
$block$;

-- Existing workspaces receive the same capabilities as a fresh seed.
UPDATE "role_templates" template
SET "capabilities" = (
  SELECT jsonb_agg(value ORDER BY value)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(
      template."capabilities" ||
      CASE template."key"
        WHEN 'couple_owner' THEN '["guest.read","guest.read_pii","guest.write","guest.archive","guest.import","guest.export","guest.read_sensitive","invitation.read","invitation.write","invitation.publish","invitation.manage_recipients","campaign.read","campaign.write","campaign.send","campaign.view_delivery","rsvp.read","rsvp.write","rsvp.override","rsvp.configure","menu.read","menu.write","menu.read_allergies","menu.resolve_allergies","menu.export"]'::jsonb
        WHEN 'couple_partner' THEN '["guest.read","guest.read_pii","guest.write","guest.archive","guest.import","guest.export","guest.read_sensitive","invitation.read","invitation.write","invitation.publish","invitation.manage_recipients","campaign.read","campaign.write","campaign.send","campaign.view_delivery","rsvp.read","rsvp.write","rsvp.override","rsvp.configure","menu.read","menu.write","menu.read_allergies","menu.resolve_allergies","menu.export"]'::jsonb
        WHEN 'wedding_planner' THEN '["guest.read","guest.read_pii","guest.write","guest.import","guest.export","invitation.read","invitation.write","invitation.publish","invitation.manage_recipients","campaign.read","campaign.write","campaign.send","campaign.view_delivery","rsvp.read","rsvp.write","rsvp.override","rsvp.configure","menu.read","menu.write","menu.read_allergies","menu.resolve_allergies","menu.export"]'::jsonb
        WHEN 'family_collaborator' THEN '["guest.read","invitation.read","rsvp.read","menu.read"]'::jsonb
        WHEN 'viewer' THEN '["guest.read","invitation.read","rsvp.read","menu.read"]'::jsonb
        ELSE '[]'::jsonb
      END
    ) AS value
  ) merged
)
WHERE template."key" IN ('couple_owner','couple_partner','wedding_planner','family_collaborator','viewer');
