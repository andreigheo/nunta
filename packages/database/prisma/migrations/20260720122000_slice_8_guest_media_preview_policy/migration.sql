BEGIN;

CREATE POLICY "guest_moment_derivative_read" ON "stored_objects" FOR SELECT TO weddingos_app
USING (EXISTS (
  SELECT 1
  FROM "guest_moment_media" medium
  JOIN "guest_moments" moment ON moment.id = medium.guest_moment_id
  LEFT JOIN "gallery_collection_items" gallery_item ON gallery_item.guest_moment_id = moment.id
  LEFT JOIN "gallery_collections" gallery ON gallery.id = gallery_item.collection_id
  JOIN "guest_access_grants" grant_row ON grant_row.id = NULLIF(current_setting('app.current_guest_access_grant_id', true), '')::uuid
  WHERE medium.derivative_object_id = "stored_objects"."id"
    AND medium.workspace_id = "stored_objects"."workspace_id"
    AND medium.moderation_status IN ('AUTOMATED_SAFE', 'APPROVED')
    AND grant_row.workspace_id = medium.workspace_id
    AND grant_row.revoked_at IS NULL
    AND (grant_row.expires_at IS NULL OR grant_row.expires_at > now())
    AND (
      moment.guest_access_grant_id = grant_row.id
      OR (
        moment.status = 'PUBLISHED'
        AND gallery.status = 'PUBLISHED'
        AND gallery.visibility <> 'PRIVATE_ORGANIZERS'
        AND (gallery.visibility = 'GUESTS_WITH_ACCESS' OR grant_row.household_id = ANY(gallery.household_ids))
      )
    )
));

COMMIT;
