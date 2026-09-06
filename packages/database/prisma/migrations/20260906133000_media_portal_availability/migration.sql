-- Public QR grants must stop resolving when their workspace or event is removed.
-- Only the current bearer grant may be checked; callers cannot probe event IDs.
CREATE FUNCTION public.weddingos_media_portal_available(portal_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_media_portals p
    JOIN public.workspaces w ON w.id = p.workspace_id
    JOIN public.wedding_events e ON e.id = p.wedding_event_id AND e.workspace_id = w.id
    WHERE p.id = portal_id
      AND p.token_hash = nullif(current_setting('app.media_portal_token_hash', true), '')
      AND w.status = 'ACTIVE' AND w.deleted_at IS NULL AND e.deleted_at IS NULL
  );
$$;
REVOKE ALL ON FUNCTION public.weddingos_media_portal_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_media_portal_available(uuid) TO weddingos_app;
ALTER POLICY media_portal_token ON event_media_portals
USING (token_hash = nullif(current_setting('app.media_portal_token_hash', true),'')
  AND public.weddingos_media_portal_available(id));
ALTER POLICY media_portal_reservation ON event_media_portals
USING (token_hash = nullif(current_setting('app.media_portal_token_hash', true),'')
  AND active AND expires_at > now() AND public.weddingos_media_portal_available(id))
WITH CHECK (token_hash = nullif(current_setting('app.media_portal_token_hash', true),'')
  AND active AND expires_at > now() AND public.weddingos_media_portal_available(id));
