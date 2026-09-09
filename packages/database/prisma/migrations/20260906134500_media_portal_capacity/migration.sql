-- Expose only billing/usage facts for the caller's QR grant to the backend.
-- Public HTTP responses never include these fields.
CREATE FUNCTION public.weddingos_media_portal_capacity(portal_id uuid)
RETURNS TABLE (plan_key text, status text, grace_period_end_at timestamp(3), used_bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT s.plan_key::text, s.status::text, s.grace_period_end_at,
    COALESCE((SELECT SUM(o.size_bytes) FROM public.stored_objects o
      WHERE o.workspace_id = p.workspace_id AND o.deleted_at IS NULL AND o.status <> 'DELETED'), 0)::bigint
  FROM public.event_media_portals p
  LEFT JOIN public.workspace_subscriptions s ON s.workspace_id = p.workspace_id
  WHERE p.id = portal_id AND public.weddingos_media_portal_available(p.id);
$$;
REVOKE ALL ON FUNCTION public.weddingos_media_portal_capacity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_media_portal_capacity(uuid) TO weddingos_app;
