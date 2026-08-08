CREATE OR REPLACE FUNCTION public.weddingos_offer_acceptance_availability(
  target_workspace_id uuid,
  target_offer_id uuid,
  target_vendor_organization_id uuid
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT COALESCE(
    array_agg(block.status::text) FILTER (WHERE block.id IS NOT NULL),
    ARRAY[]::text[]
  )
  FROM public.vendor_offers AS offer
  JOIN public.requests_for_quote AS rfq ON rfq.id = offer.rfq_id
  LEFT JOIN public.vendor_availability_blocks AS block
    ON block.vendor_organization_id = offer.vendor_organization_id
   AND block.deleted_at IS NULL
   AND block.start_at <= date_trunc('day', rfq.event_date) + interval '1 day' - interval '1 millisecond'
   AND block.end_at >= date_trunc('day', rfq.event_date)
  WHERE offer.id = target_offer_id
    AND offer.workspace_id = target_workspace_id
    AND offer.vendor_organization_id = target_vendor_organization_id
    AND rfq.event_date IS NOT NULL
    AND public.weddingos_has_workspace_access(target_workspace_id);
$$;

REVOKE ALL ON FUNCTION public.weddingos_offer_acceptance_availability(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_offer_acceptance_availability(uuid, uuid, uuid) TO weddingos_app;
