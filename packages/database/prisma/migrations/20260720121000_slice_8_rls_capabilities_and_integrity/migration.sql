BEGIN;

-- Structural references and bounded values.
ALTER TABLE "wedding_day_plans"
  ADD CONSTRAINT "wedding_day_plan_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "wedding_day_plan_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT;
ALTER TABLE "wedding_day_plan_versions" ADD CONSTRAINT "wedding_day_plan_version_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE;
ALTER TABLE "run_of_show_items"
  ADD CONSTRAINT "run_of_show_item_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "run_of_show_item_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "run_of_show_time_order" CHECK ("planned_end_at" IS NULL OR "planned_end_at" >= "planned_start_at"),
  ADD CONSTRAINT "run_of_show_delay_nonnegative" CHECK ("delay_estimate_minutes" IS NULL OR "delay_estimate_minutes" >= 0);
ALTER TABLE "run_of_show_dependencies"
  ADD CONSTRAINT "run_of_show_dependency_item_fk" FOREIGN KEY ("item_id") REFERENCES "run_of_show_items"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "run_of_show_dependency_target_fk" FOREIGN KEY ("depends_on_item_id") REFERENCES "run_of_show_items"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "run_of_show_dependency_not_self" CHECK ("item_id" <> "depends_on_item_id");
ALTER TABLE "wedding_day_checklists" ADD CONSTRAINT "wedding_day_checklist_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_checklist_items" ADD CONSTRAINT "wedding_day_checklist_item_list_fk" FOREIGN KEY ("checklist_id") REFERENCES "wedding_day_checklists"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_contacts" ADD CONSTRAINT "wedding_day_contact_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_incidents"
  ADD CONSTRAINT "wedding_day_incident_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "wedding_day_incident_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT;
ALTER TABLE "wedding_day_incident_updates" ADD CONSTRAINT "wedding_day_incident_update_incident_fk" FOREIGN KEY ("incident_id") REFERENCES "wedding_day_incidents"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_incident_assignments" ADD CONSTRAINT "wedding_day_incident_assignment_incident_fk" FOREIGN KEY ("incident_id") REFERENCES "wedding_day_incidents"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_decisions" ADD CONSTRAINT "wedding_day_decision_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_announcements" ADD CONSTRAINT "wedding_day_announcement_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "wedding_day_plans"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_announcement_audiences" ADD CONSTRAINT "wedding_day_announcement_audience_announcement_fk" FOREIGN KEY ("announcement_id") REFERENCES "wedding_day_announcements"("id") ON DELETE CASCADE;
ALTER TABLE "wedding_day_announcement_deliveries" ADD CONSTRAINT "wedding_day_announcement_delivery_announcement_fk" FOREIGN KEY ("announcement_id") REFERENCES "wedding_day_announcements"("id") ON DELETE CASCADE;
ALTER TABLE "guest_check_in_sessions"
  ADD CONSTRAINT "check_in_session_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "check_in_session_time_order" CHECK ("closes_at" > "opens_at");
ALTER TABLE "guest_check_in_stations" ADD CONSTRAINT "check_in_station_session_fk" FOREIGN KEY ("session_id") REFERENCES "guest_check_in_sessions"("id") ON DELETE CASCADE;
ALTER TABLE "guest_check_in_devices"
  ADD CONSTRAINT "check_in_device_session_fk" FOREIGN KEY ("session_id") REFERENCES "guest_check_in_sessions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "check_in_device_sequence_nonnegative" CHECK ("last_sequence" >= 0);
ALTER TABLE "guest_check_in_credentials" ADD CONSTRAINT "check_in_credential_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE CASCADE;
ALTER TABLE "guest_check_ins"
  ADD CONSTRAINT "guest_check_in_session_fk" FOREIGN KEY ("session_id") REFERENCES "guest_check_in_sessions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "guest_check_in_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "guest_check_in_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT;
ALTER TABLE "guest_check_in_events" ADD CONSTRAINT "guest_check_in_event_check_in_fk" FOREIGN KEY ("check_in_id") REFERENCES "guest_check_ins"("id") ON DELETE CASCADE;
ALTER TABLE "check_in_manifest_snapshots" ADD CONSTRAINT "check_in_manifest_device_fk" FOREIGN KEY ("device_id") REFERENCES "guest_check_in_devices"("id") ON DELETE CASCADE;
ALTER TABLE "check_in_offline_commands" ADD CONSTRAINT "check_in_offline_device_fk" FOREIGN KEY ("device_id") REFERENCES "guest_check_in_devices"("id") ON DELETE CASCADE;
ALTER TABLE "check_in_sync_batches" ADD CONSTRAINT "check_in_sync_device_fk" FOREIGN KEY ("device_id") REFERENCES "guest_check_in_devices"("id") ON DELETE CASCADE;
ALTER TABLE "guest_moments"
  ADD CONSTRAINT "guest_moment_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "guest_moment_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "guest_moment_grant_fk" FOREIGN KEY ("guest_access_grant_id") REFERENCES "guest_access_grants"("id") ON DELETE RESTRICT;
ALTER TABLE "guest_moment_media"
  ADD CONSTRAINT "guest_moment_media_moment_fk" FOREIGN KEY ("guest_moment_id") REFERENCES "guest_moments"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "guest_moment_media_source_fk" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "guest_moment_video_duration_bound" CHECK ("duration_ms" IS NULL OR "duration_ms" BETWEEN 0 AND 180000);
ALTER TABLE "guest_moment_upload_sessions"
  ADD CONSTRAINT "guest_moment_upload_grant_fk" FOREIGN KEY ("guest_access_grant_id") REFERENCES "guest_access_grants"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "guest_moment_upload_moment_fk" FOREIGN KEY ("guest_moment_id") REFERENCES "guest_moments"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "guest_moment_upload_media_fk" FOREIGN KEY ("guest_moment_media_id") REFERENCES "guest_moment_media"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "guest_moment_upload_object_fk" FOREIGN KEY ("stored_object_id") REFERENCES "stored_objects"("id") ON DELETE RESTRICT;
ALTER TABLE "guest_moment_reports" ADD CONSTRAINT "guest_moment_report_moment_fk" FOREIGN KEY ("guest_moment_id") REFERENCES "guest_moments"("id") ON DELETE CASCADE;
ALTER TABLE "guest_moment_moderation_cases" ADD CONSTRAINT "guest_moment_case_moment_fk" FOREIGN KEY ("guest_moment_id") REFERENCES "guest_moments"("id") ON DELETE CASCADE;
ALTER TABLE "gallery_collections" ADD CONSTRAINT "gallery_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT;
ALTER TABLE "gallery_collection_items"
  ADD CONSTRAINT "gallery_item_collection_fk" FOREIGN KEY ("collection_id") REFERENCES "gallery_collections"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "gallery_item_moment_fk" FOREIGN KEY ("guest_moment_id") REFERENCES "guest_moments"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "wedding_day_one_live_plan_per_event"
  ON "wedding_day_plans" ("wedding_event_id") WHERE "status" IN ('LIVE', 'PAUSED');

CREATE OR REPLACE FUNCTION public.weddingos_reject_immutable_wedding_day_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD."immutable" THEN
    RAISE EXCEPTION 'immutable wedding day plan version' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "wedding_day_plan_versions_immutable"
  BEFORE UPDATE OR DELETE ON "wedding_day_plan_versions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_immutable_wedding_day_version();

-- App/worker least privilege and forced tenant isolation.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "wedding_day_plans","wedding_day_plan_versions","run_of_show_items","run_of_show_dependencies",
  "run_of_show_item_assignments","run_of_show_item_updates","wedding_day_checklists",
  "wedding_day_checklist_items","wedding_day_contacts","wedding_day_incidents",
  "wedding_day_incident_updates","wedding_day_incident_assignments","wedding_day_decisions",
  "wedding_day_announcements","wedding_day_announcement_audiences","wedding_day_announcement_deliveries",
  "wedding_day_live_events","guest_check_in_sessions","guest_check_in_stations","guest_check_in_devices",
  "guest_check_in_credentials","guest_check_ins","guest_check_in_events","check_in_manifest_snapshots",
  "check_in_offline_commands","check_in_sync_batches","guest_moments","guest_moment_media",
  "guest_moment_upload_sessions","guest_moment_reports","guest_moment_moderation_cases","gallery_collections","gallery_collection_items"
TO weddingos_app, weddingos_worker;
GRANT USAGE, SELECT ON SEQUENCE "wedding_day_live_events_sequence_seq" TO weddingos_app, weddingos_worker;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'wedding_day_plans','wedding_day_plan_versions','run_of_show_items','run_of_show_dependencies',
    'run_of_show_item_assignments','run_of_show_item_updates','wedding_day_checklists',
    'wedding_day_checklist_items','wedding_day_contacts','wedding_day_incidents',
    'wedding_day_incident_updates','wedding_day_incident_assignments','wedding_day_decisions',
    'wedding_day_announcements','wedding_day_announcement_audiences','wedding_day_announcement_deliveries',
    'wedding_day_live_events','guest_check_in_sessions','guest_check_in_stations','guest_check_in_devices',
    'guest_check_in_credentials','guest_check_ins','guest_check_in_events','check_in_manifest_snapshots',
    'check_in_offline_commands','check_in_sync_batches','guest_moments','guest_moment_media',
    'guest_moment_upload_sessions','guest_moment_reports','guest_moment_moderation_cases','gallery_collections','gallery_collection_items'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id))',
      table_name || '_workspace', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL))',
      table_name || '_worker', table_name
    );
  END LOOP;
END $$;

-- Narrow token-scoped guest access. The API first resolves the opaque token to
-- app.current_guest_access_grant_id; no client-provided household id is trusted.
CREATE POLICY "guest_moments_grant" ON "guest_moments" FOR ALL TO weddingos_app
USING ("guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid)
WITH CHECK (
  "guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "guest_access_grants" grant_row
    WHERE grant_row.id = "guest_access_grant_id" AND grant_row.workspace_id = "workspace_id"
      AND grant_row.household_id = "household_id" AND grant_row.revoked_at IS NULL
      AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now()))
);
CREATE POLICY "guest_moments_published_gallery_read" ON "guest_moments" FOR SELECT TO weddingos_app
USING ("status" = 'PUBLISHED' AND EXISTS (
  SELECT 1 FROM "gallery_collection_items" item
  JOIN "gallery_collections" collection ON collection.id = item.collection_id
  JOIN "guest_access_grants" grant_row ON grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  WHERE item.guest_moment_id = "guest_moments"."id" AND collection.status = 'PUBLISHED'
    AND collection.workspace_id = "guest_moments"."workspace_id" AND collection.visibility <> 'PRIVATE_ORGANIZERS'
    AND (collection.visibility = 'GUESTS_WITH_ACCESS' OR grant_row.household_id = ANY(collection.household_ids))));
CREATE POLICY "guest_moment_media_grant_read" ON "guest_moment_media" FOR SELECT TO weddingos_app
USING (EXISTS (SELECT 1 FROM "guest_moments" moment WHERE moment.id = "guest_moment_id"
  AND moment.guest_access_grant_id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid));
CREATE POLICY "guest_moment_media_grant_insert" ON "guest_moment_media" FOR INSERT TO weddingos_app
WITH CHECK (EXISTS (SELECT 1 FROM "guest_moments" moment WHERE moment.id = "guest_moment_id"
  AND moment.guest_access_grant_id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid));
CREATE POLICY "guest_moment_media_gallery_read" ON "guest_moment_media" FOR SELECT TO weddingos_app
USING ("moderation_status" = 'APPROVED' AND EXISTS (
  SELECT 1 FROM "gallery_collection_items" item
  JOIN "gallery_collections" collection ON collection.id = item.collection_id
  JOIN "guest_access_grants" grant_row ON grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  WHERE item.guest_moment_id = "guest_moment_media"."guest_moment_id" AND collection.status = 'PUBLISHED'
    AND collection.workspace_id = "guest_moment_media"."workspace_id" AND collection.visibility <> 'PRIVATE_ORGANIZERS'
    AND (collection.visibility = 'GUESTS_WITH_ACCESS' OR grant_row.household_id = ANY(collection.household_ids))));
CREATE POLICY "guest_moment_upload_grant" ON "guest_moment_upload_sessions" FOR ALL TO weddingos_app
USING ("guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid)
WITH CHECK ("guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid);
CREATE POLICY "guest_moment_reports_grant_insert" ON "guest_moment_reports" FOR INSERT TO weddingos_app
WITH CHECK ("guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid);
CREATE POLICY "guest_check_in_household_read" ON "guest_check_ins" FOR SELECT TO weddingos_app
USING (EXISTS (SELECT 1 FROM "guest_access_grants" grant_row
  WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row.household_id = "guest_check_ins"."household_id" AND grant_row.workspace_id = "guest_check_ins"."workspace_id"
    AND grant_row.revoked_at IS NULL AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())));
CREATE POLICY "guest_credential_household_read" ON "guest_check_in_credentials" FOR SELECT TO weddingos_app
USING (EXISTS (SELECT 1 FROM "guest_access_grants" grant_row
  WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row.household_id = "guest_check_in_credentials"."household_id" AND grant_row.workspace_id = "guest_check_in_credentials"."workspace_id"
    AND grant_row.revoked_at IS NULL AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())));
CREATE POLICY "guest_credential_household_insert" ON "guest_check_in_credentials" FOR INSERT TO weddingos_app
WITH CHECK (EXISTS (SELECT 1 FROM "guest_access_grants" grant_row
  WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row.household_id = "guest_check_in_credentials"."household_id" AND grant_row.workspace_id = "guest_check_in_credentials"."workspace_id"
    AND grant_row.revoked_at IS NULL AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())));
CREATE POLICY "guest_announcement_delivery_read" ON "wedding_day_announcement_deliveries" FOR SELECT TO weddingos_app
USING ("guest_access_grant_id" = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid);
CREATE POLICY "guest_announcement_read" ON "wedding_day_announcements" FOR SELECT TO weddingos_app
USING ("status" = 'PUBLISHED' AND EXISTS (SELECT 1 FROM "wedding_day_announcement_deliveries" delivery
  WHERE delivery.announcement_id = "wedding_day_announcements"."id" AND delivery.guest_access_grant_id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid));
CREATE POLICY "guest_live_event_read" ON "wedding_day_live_events" FOR SELECT TO weddingos_app
USING ("guest_visible" AND EXISTS (SELECT 1 FROM "guest_access_grants" grant_row
  WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row.workspace_id = "wedding_day_live_events"."workspace_id" AND (cardinality("wedding_day_live_events"."household_ids") = 0 OR grant_row.household_id = ANY("wedding_day_live_events"."household_ids"))
    AND grant_row.revoked_at IS NULL AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())));
CREATE POLICY "guest_gallery_read" ON "gallery_collections" FOR SELECT TO weddingos_app
USING ("status" = 'PUBLISHED' AND "visibility" <> 'PRIVATE_ORGANIZERS' AND EXISTS (
  SELECT 1 FROM "guest_access_grants" grant_row
  WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row.workspace_id = "gallery_collections"."workspace_id" AND grant_row.revoked_at IS NULL
    AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
    AND ("gallery_collections"."visibility" = 'GUESTS_WITH_ACCESS' OR grant_row.household_id = ANY("gallery_collections"."household_ids"))));
CREATE POLICY "guest_gallery_item_read" ON "gallery_collection_items" FOR SELECT TO weddingos_app
USING (EXISTS (SELECT 1 FROM "gallery_collections" collection WHERE collection.id = "collection_id"));

CREATE POLICY "guest_moment_object_insert" ON "stored_objects" FOR INSERT TO weddingos_app
WITH CHECK ("stored_objects"."workspace_id" IS NOT NULL AND EXISTS (SELECT 1 FROM "guest_access_grants" grant_row
  WHERE grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
    AND grant_row.workspace_id = "stored_objects"."workspace_id" AND grant_row.revoked_at IS NULL
    AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())));
CREATE POLICY "guest_moment_object_read" ON "stored_objects" FOR SELECT TO weddingos_app
USING (EXISTS (SELECT 1 FROM "guest_moment_upload_sessions" session_row
  WHERE session_row.stored_object_id = "stored_objects"."id"
    AND session_row.guest_access_grant_id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid));
CREATE POLICY "guest_moment_object_complete" ON "stored_objects" FOR UPDATE TO weddingos_app
USING (EXISTS (SELECT 1 FROM "guest_moment_upload_sessions" session_row
  WHERE session_row.stored_object_id = "stored_objects"."id"
    AND session_row.guest_access_grant_id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid))
WITH CHECK (EXISTS (SELECT 1 FROM "guest_moment_upload_sessions" session_row
  WHERE session_row.stored_object_id = "stored_objects"."id"
    AND session_row.guest_access_grant_id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid));

-- Capabilities are installed in the same transaction as their protected data.
UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" ||
    '["wedding_day.read","wedding_day.write","wedding_day.publish","wedding_day.go_live","wedding_day.transition","wedding_day.manage_contacts","incident.read","incident.write","incident.assign","incident.resolve","incident.read_sensitive","announcement.read","announcement.write","announcement.publish","check_in.read","check_in.write","check_in.override","check_in.manage_sessions","check_in.manage_devices","check_in.offline_sync","guest_moment.read","guest_moment.upload","guest_moment.moderate","guest_moment.publish","guest_moment.delete","gallery.read","gallery.write","gallery.publish"]'::jsonb) capability
) WHERE "key" IN ('couple_owner','couple_partner','wedding_planner');
UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" ||
    '["wedding_day.read","incident.read","announcement.read","check_in.read","guest_moment.read","gallery.read"]'::jsonb) capability
) WHERE "key" IN ('family_collaborator','viewer');

COMMIT;
