-- A vendor may change only the response aggregate derived from its own RFQ
-- recipient. It must never receive broad UPDATE access to the wedding's RFQ.
CREATE OR REPLACE FUNCTION public.weddingos_refresh_rfq_response_status(target_rfq_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  context_vendor_id uuid := NULLIF(current_setting('app.current_vendor_organization_id', true), '')::uuid;
  recipient_count integer;
  responded_count integer;
BEGIN
  IF context_vendor_id IS NULL
     OR NOT public.weddingos_has_vendor_access(context_vendor_id)
     OR NOT EXISTS (
       SELECT 1 FROM public.rfq_recipients recipient
       WHERE recipient.rfq_id = target_rfq_id
         AND recipient.vendor_organization_id = context_vendor_id
     ) THEN
    RAISE EXCEPTION 'vendor RFQ context denied' USING ERRCODE = '42501';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status = 'RESPONDED')
  INTO recipient_count, responded_count
  FROM public.rfq_recipients
  WHERE rfq_id = target_rfq_id;

  UPDATE public.requests_for_quote
  SET status = CASE
      WHEN recipient_count > 0 AND responded_count = recipient_count THEN 'RESPONDED'::"RfqStatus"
      ELSE 'PARTIALLY_RESPONDED'::"RfqStatus"
    END,
    version = version + 1,
    updated_at = now()
  WHERE id = target_rfq_id;
END;
$$;
REVOKE ALL ON FUNCTION public.weddingos_refresh_rfq_response_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_refresh_rfq_response_status(uuid) TO weddingos_app;
