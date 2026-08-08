-- Reconcile the aggregate when a provider reports a terminal delivery
-- failure after SMTP acceptance. The webhook event and recipient remain
-- idempotent; a retry can then target only FAILED recipients.
CREATE OR REPLACE FUNCTION public.weddingos_apply_provider_webhook(
  target_provider text,
  target_event_id text,
  target_message_id text,
  target_event_type text,
  target_payload_hash text,
  target_occurred_at timestamp without time zone
)
RETURNS TABLE (
  accepted boolean,
  duplicate boolean,
  recipient_id uuid,
  workspace_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  target_recipient public.campaign_recipients%ROWTYPE;
  inserted_count integer;
BEGIN
  IF target_provider NOT IN ('fake', 'smtp')
     OR target_event_type NOT IN ('delivered', 'opened', 'failed')
     OR length(target_event_id) < 1
     OR length(target_message_id) < 1
     OR target_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid provider webhook contract' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_recipient
  FROM public.campaign_recipients recipient
  WHERE recipient.provider_message_id = target_message_id
  ORDER BY recipient.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.provider_webhook_events (
    id, provider, provider_event_id, provider_message_id,
    event_type, payload_hash, occurred_at
  ) VALUES (
    gen_random_uuid(), target_provider, target_event_id, target_message_id,
    target_event_type, target_payload_hash, target_occurred_at
  ) ON CONFLICT (provider, provider_event_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 1 THEN
    UPDATE public.campaign_recipients recipient
    SET
      status = CASE
        WHEN target_event_type = 'opened' THEN 'OPENED'::public."CampaignRecipientStatus"
        WHEN target_event_type = 'delivered' AND recipient.status NOT IN ('OPENED', 'FAILED') THEN 'DELIVERED'::public."CampaignRecipientStatus"
        WHEN target_event_type = 'failed' AND recipient.status NOT IN ('DELIVERED', 'OPENED') THEN 'FAILED'::public."CampaignRecipientStatus"
        ELSE recipient.status
      END,
      delivered_at = CASE WHEN target_event_type = 'delivered' THEN COALESCE(recipient.delivered_at, target_occurred_at) ELSE recipient.delivered_at END,
      opened_at = CASE WHEN target_event_type = 'opened' THEN COALESCE(recipient.opened_at, target_occurred_at) ELSE recipient.opened_at END,
      failed_at = CASE WHEN target_event_type = 'failed' THEN COALESCE(recipient.failed_at, target_occurred_at) ELSE recipient.failed_at END,
      failure_code = CASE WHEN target_event_type = 'failed' THEN 'PROVIDER_REPORTED' ELSE recipient.failure_code END,
      updated_at = now(),
      version = recipient.version + 1
    WHERE recipient.id = target_recipient.id;

    IF target_event_type = 'failed' THEN
      UPDATE public.campaigns campaign
      SET status = 'PARTIAL'::public."CampaignStatus",
          updated_at = now(),
          version = campaign.version + 1
      WHERE campaign.id = target_recipient.campaign_id
        AND campaign.status IN ('QUEUED', 'SENDING', 'COMPLETED');
    END IF;
  END IF;

  RETURN QUERY SELECT true, inserted_count = 0, target_recipient.id, target_recipient.workspace_id;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_apply_provider_webhook(text, text, text, text, text, timestamp without time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_apply_provider_webhook(text, text, text, text, text, timestamp without time zone) TO weddingos_app;
