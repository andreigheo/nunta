ALTER TABLE event_media_portals
  ADD COLUMN live_gallery_id uuid REFERENCES gallery_collections(id) ON DELETE SET NULL,
  ADD COLUMN live_gallery_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX event_media_portals_live_gallery_id_idx
  ON event_media_portals(live_gallery_id)
  WHERE live_gallery_id IS NOT NULL;

-- A media portal bearer can see only the published public gallery explicitly
-- linked to its event. It never grants workspace-wide or household access.
CREATE POLICY media_portal_live_gallery_read ON gallery_collections
  FOR SELECT TO weddingos_app
  USING (
    status = 'PUBLISHED'
    AND visibility = 'GUESTS_WITH_ACCESS'
    AND EXISTS (
      SELECT 1 FROM event_media_portals portal
      WHERE portal.live_gallery_id = gallery_collections.id
        AND portal.workspace_id = gallery_collections.workspace_id
        AND portal.wedding_event_id = gallery_collections.wedding_event_id
        AND portal.live_gallery_enabled
        AND portal.expires_at > now()
        AND portal.token_hash = nullif(current_setting('app.media_portal_token_hash', true), '')
    )
  );

CREATE POLICY media_portal_live_gallery_item_read ON gallery_collection_items
  FOR SELECT TO weddingos_app
  USING (
    EXISTS (
      SELECT 1
      FROM gallery_collections collection
      JOIN event_media_portals portal ON portal.live_gallery_id = collection.id
      WHERE collection.id = gallery_collection_items.collection_id
        AND collection.workspace_id = gallery_collection_items.workspace_id
        AND collection.status = 'PUBLISHED'
        AND collection.visibility = 'GUESTS_WITH_ACCESS'
        AND portal.live_gallery_enabled
        AND portal.expires_at > now()
        AND portal.token_hash = nullif(current_setting('app.media_portal_token_hash', true), '')
    )
  );

CREATE POLICY media_portal_published_moment_read ON guest_moments
  FOR SELECT TO weddingos_app
  USING (
    status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1
      FROM gallery_collection_items item
      JOIN gallery_collections collection ON collection.id = item.collection_id
      JOIN event_media_portals portal ON portal.live_gallery_id = collection.id
      WHERE item.guest_moment_id = guest_moments.id
        AND collection.workspace_id = guest_moments.workspace_id
        AND collection.wedding_event_id = guest_moments.wedding_event_id
        AND collection.status = 'PUBLISHED'
        AND collection.visibility = 'GUESTS_WITH_ACCESS'
        AND portal.live_gallery_enabled
        AND portal.expires_at > now()
        AND portal.token_hash = nullif(current_setting('app.media_portal_token_hash', true), '')
    )
  );

CREATE POLICY media_portal_published_medium_read ON guest_moment_media
  FOR SELECT TO weddingos_app
  USING (
    moderation_status = 'APPROVED'
    AND EXISTS (
      SELECT 1
      FROM gallery_collection_items item
      JOIN gallery_collections collection ON collection.id = item.collection_id
      JOIN event_media_portals portal ON portal.live_gallery_id = collection.id
      WHERE item.guest_moment_id = guest_moment_media.guest_moment_id
        AND collection.workspace_id = guest_moment_media.workspace_id
        AND collection.status = 'PUBLISHED'
        AND collection.visibility = 'GUESTS_WITH_ACCESS'
        AND portal.live_gallery_enabled
        AND portal.expires_at > now()
        AND portal.token_hash = nullif(current_setting('app.media_portal_token_hash', true), '')
    )
  );

CREATE POLICY media_portal_published_object_read ON stored_objects
  FOR SELECT TO weddingos_app
  USING (
    status = 'AVAILABLE'
    AND EXISTS (
      SELECT 1
      FROM guest_moment_media medium
      JOIN gallery_collection_items item ON item.guest_moment_id = medium.guest_moment_id
      JOIN gallery_collections collection ON collection.id = item.collection_id
      JOIN event_media_portals portal ON portal.live_gallery_id = collection.id
      WHERE (medium.stored_object_id = stored_objects.id OR medium.derivative_object_id = stored_objects.id)
        AND medium.workspace_id = stored_objects.workspace_id
        AND medium.moderation_status = 'APPROVED'
        AND (
          (medium.stored_object_id = stored_objects.id AND stored_objects.scan_status = 'CLEAN')
          OR (
            medium.derivative_object_id = stored_objects.id
            AND stored_objects.scan_status IN ('CLEAN', 'NOT_REQUIRED')
          )
        )
        AND collection.status = 'PUBLISHED'
        AND collection.visibility = 'GUESTS_WITH_ACCESS'
        AND portal.live_gallery_enabled
        AND portal.expires_at > now()
        AND portal.token_hash = nullif(current_setting('app.media_portal_token_hash', true), '')
    )
  );
