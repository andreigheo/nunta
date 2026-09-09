CREATE TABLE event_media_portals (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 wedding_event_id uuid NOT NULL UNIQUE REFERENCES wedding_events(id) ON DELETE CASCADE,
 event_name varchar(240) NOT NULL, token_hash char(64) NOT NULL UNIQUE,
 token_encrypted text NOT NULL, active boolean NOT NULL DEFAULT true,
 expires_at timestamp(3) NOT NULL, reserved_bytes bigint NOT NULL DEFAULT 0,
 upload_count integer NOT NULL DEFAULT 0, created_by uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL DEFAULT 1, created_at timestamp(3) NOT NULL DEFAULT now(),
 updated_at timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX event_media_portals_workspace_id_idx ON event_media_portals(workspace_id);
ALTER TABLE event_media_portals ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_media_portals FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_media_portals TO weddingos_app;
CREATE POLICY media_portal_owner ON event_media_portals FOR ALL TO weddingos_app
 USING (workspace_id = nullif(current_setting('app.current_workspace_id', true),'')::uuid AND public.weddingos_has_workspace_access(workspace_id))
 WITH CHECK (workspace_id = nullif(current_setting('app.current_workspace_id', true),'')::uuid AND public.weddingos_has_workspace_access(workspace_id));
CREATE POLICY media_portal_token ON event_media_portals FOR SELECT TO weddingos_app
 USING (token_hash = nullif(current_setting('app.media_portal_token_hash', true),''));
CREATE POLICY media_portal_reservation ON event_media_portals FOR UPDATE TO weddingos_app
 USING (token_hash = nullif(current_setting('app.media_portal_token_hash', true),'') AND active AND expires_at > now())
 WITH CHECK (token_hash = nullif(current_setting('app.media_portal_token_hash', true),'') AND active AND expires_at > now());
ALTER TABLE guest_moments ALTER COLUMN household_id DROP NOT NULL;
ALTER TABLE guest_moments ALTER COLUMN guest_access_grant_id DROP NOT NULL;
ALTER TABLE guest_moment_upload_sessions ALTER COLUMN guest_access_grant_id DROP NOT NULL;
ALTER TABLE guest_moments ADD COLUMN media_portal_id uuid REFERENCES event_media_portals(id),
 ADD COLUMN upload_token_hash char(64) UNIQUE, ADD COLUMN contributor_name varchar(100),
 ADD CONSTRAINT guest_moment_source CHECK (
 (guest_access_grant_id IS NOT NULL AND household_id IS NOT NULL AND media_portal_id IS NULL AND upload_token_hash IS NULL)
 OR (guest_access_grant_id IS NULL AND household_id IS NULL AND guest_id IS NULL AND media_portal_id IS NOT NULL AND upload_token_hash IS NOT NULL));
CREATE POLICY media_portal_moment ON guest_moments FOR ALL TO weddingos_app
 USING (upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'') AND EXISTS (
 SELECT 1 FROM event_media_portals p WHERE p.id = media_portal_id AND p.workspace_id = guest_moments.workspace_id AND p.token_hash = nullif(current_setting('app.media_portal_token_hash',true),'') AND p.active AND p.expires_at > now()))
 WITH CHECK (upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'') AND EXISTS (
 SELECT 1 FROM event_media_portals p WHERE p.id = media_portal_id AND p.workspace_id = guest_moments.workspace_id AND p.wedding_event_id = guest_moments.wedding_event_id AND p.token_hash = nullif(current_setting('app.media_portal_token_hash',true),'') AND p.active AND p.expires_at > now()));
CREATE POLICY media_portal_medium ON guest_moment_media FOR ALL TO weddingos_app
 USING (EXISTS (SELECT 1 FROM guest_moments m WHERE m.id = guest_moment_id AND m.workspace_id = guest_moment_media.workspace_id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')))
 WITH CHECK (EXISTS (SELECT 1 FROM guest_moments m WHERE m.id = guest_moment_id AND m.workspace_id = guest_moment_media.workspace_id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
CREATE POLICY media_portal_upload ON guest_moment_upload_sessions FOR ALL TO weddingos_app
 USING (EXISTS (SELECT 1 FROM guest_moments m WHERE m.id = guest_moment_id AND m.workspace_id = guest_moment_upload_sessions.workspace_id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')))
 WITH CHECK (guest_access_grant_id IS NULL AND EXISTS (SELECT 1 FROM guest_moments m WHERE m.id = guest_moment_id AND m.workspace_id = guest_moment_upload_sessions.workspace_id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
CREATE POLICY media_portal_object_insert ON stored_objects FOR INSERT TO weddingos_app
 WITH CHECK (EXISTS (SELECT 1 FROM event_media_portals p WHERE p.workspace_id = stored_objects.workspace_id AND p.token_hash = nullif(current_setting('app.media_portal_token_hash',true),'') AND p.active AND p.expires_at > now()) AND status = 'UPLOADING' AND object_key LIKE 'private/guest-moments/' || workspace_id::text || '/%');
CREATE POLICY media_portal_object_read ON stored_objects FOR SELECT TO weddingos_app
 USING (EXISTS (SELECT 1 FROM guest_moment_upload_sessions s JOIN guest_moments m ON m.id = s.guest_moment_id WHERE s.stored_object_id = stored_objects.id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
CREATE POLICY media_portal_object_update ON stored_objects FOR UPDATE TO weddingos_app
 USING (EXISTS (SELECT 1 FROM guest_moment_upload_sessions s JOIN guest_moments m ON m.id = s.guest_moment_id WHERE s.stored_object_id = stored_objects.id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')))
 WITH CHECK (EXISTS (SELECT 1 FROM guest_moment_upload_sessions s JOIN guest_moments m ON m.id = s.guest_moment_id WHERE s.stored_object_id = stored_objects.id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
CREATE POLICY media_portal_outbox_read ON outbox_messages FOR SELECT TO weddingos_app
 USING (event_name = 'guest_moment.uploaded.v1' AND EXISTS (SELECT 1 FROM guest_moments m WHERE m.id::text = aggregate_id::text AND m.workspace_id = outbox_messages.workspace_id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
CREATE POLICY media_portal_outbox_insert ON outbox_messages FOR INSERT TO weddingos_app
 WITH CHECK (event_name = 'guest_moment.uploaded.v1' AND EXISTS (SELECT 1 FROM guest_moments m WHERE m.id::text = aggregate_id::text AND m.workspace_id = outbox_messages.workspace_id AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
CREATE POLICY media_portal_consumer_insert ON outbox_consumer_executions FOR INSERT TO weddingos_app
 WITH CHECK (EXISTS (SELECT 1 FROM outbox_messages o JOIN guest_moments m ON m.id::text = o.aggregate_id::text WHERE o.id = outbox_message_id AND o.event_name = 'guest_moment.uploaded.v1' AND m.upload_token_hash = nullif(current_setting('app.media_upload_token_hash',true),'')));
