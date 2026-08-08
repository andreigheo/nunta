-- Slice 9 extends the existing persisted-context worker event boundary with
-- intelligence events only. The function still rejects arbitrary event names,
-- derives tenant/actor authority from the active consumer execution and emits
-- only explicitly requested internal projections.
CREATE OR REPLACE FUNCTION public.weddingos_record_worker_derived_event(
  derived_event_name text,
  derived_aggregate_type text,
  derived_aggregate_id text,
  derived_aggregate_version integer,
  derived_workspace_id uuid,
  derived_actor_user_id uuid,
  derived_correlation_id text,
  derived_deduplication_key text,
  derived_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  derived_outbox_id uuid := gen_random_uuid();
  consumer text;
BEGIN
  IF derived_event_name NOT IN (
    'planning.plan_proposal_ready.v1', 'task.reminder_due.v1',
    'campaign.recipient_delivery_requested.v1', 'campaign.completed.v1',
    'campaign.failed.v1', 'guest.import_completed.v1', 'guest.import_failed.v1',
    'seating.suggestion_ready.v1',
    'copilot.response_ready.v1', 'copilot.proposal_ready.v1',
    'risk.detected.v1', 'automation.approval_requested.v1',
    'automation.execution_requested.v1', 'automation.execution_completed.v1',
    'automation.paused.v1', 'digest.weekly_ready.v1',
    'digest.weekly_delivered.v1'
  ) THEN
    RAISE EXCEPTION 'derived event is not allowed' USING ERRCODE = '42501';
  END IF;
  IF NOT public.weddingos_worker_execution_context_matches(
    NULL, NULL, NULL, derived_workspace_id, derived_actor_user_id
  ) THEN
    RAISE EXCEPTION 'persisted worker context required' USING ERRCODE = '42501';
  END IF;
  IF derived_payload->>'occurredAt' IS NULL OR derived_payload->'subject' IS NULL THEN
    RAISE EXCEPTION 'derived event contract invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.outbox_messages (
    id, event_name, aggregate_type, aggregate_id, aggregate_version,
    workspace_id, actor_user_id, correlation_id, deduplication_key, payload,
    updated_at
  ) VALUES (
    derived_outbox_id, derived_event_name, derived_aggregate_type,
    derived_aggregate_id, derived_aggregate_version, derived_workspace_id,
    derived_actor_user_id, derived_correlation_id, derived_deduplication_key,
    derived_payload, now()
  )
  ON CONFLICT (deduplication_key) DO UPDATE
  SET deduplication_key = EXCLUDED.deduplication_key
  RETURNING id INTO derived_outbox_id;

  FOREACH consumer IN ARRAY ARRAY['event_ack']::text[] LOOP
    INSERT INTO public.outbox_consumer_executions (
      id, outbox_message_id, consumer_name, deduplication_key, updated_at
    ) VALUES (
      gen_random_uuid(), derived_outbox_id, consumer,
      'consumer:' || derived_outbox_id::text || ':' || consumer, now()
    ) ON CONFLICT (outbox_message_id, consumer_name) DO NOTHING;
  END LOOP;
  IF derived_payload ? 'notification' THEN
    INSERT INTO public.outbox_consumer_executions (
      id, outbox_message_id, consumer_name, deduplication_key, updated_at
    ) VALUES (
      gen_random_uuid(), derived_outbox_id, 'notification_projection',
      'consumer:' || derived_outbox_id::text || ':notification_projection', now()
    ) ON CONFLICT (outbox_message_id, consumer_name) DO NOTHING;
  END IF;
  IF derived_payload ? 'activity' THEN
    INSERT INTO public.outbox_consumer_executions (
      id, outbox_message_id, consumer_name, deduplication_key, updated_at
    ) VALUES (
      gen_random_uuid(), derived_outbox_id, 'activity_projection',
      'consumer:' || derived_outbox_id::text || ':activity_projection', now()
    ) ON CONFLICT (outbox_message_id, consumer_name) DO NOTHING;
  END IF;
  IF derived_payload ? 'campaignDelivery' THEN
    INSERT INTO public.outbox_consumer_executions (
      id, outbox_message_id, consumer_name, deduplication_key, updated_at
    ) VALUES (
      gen_random_uuid(), derived_outbox_id, 'campaign_delivery',
      'consumer:' || derived_outbox_id::text || ':campaign_delivery', now()
    ) ON CONFLICT (outbox_message_id, consumer_name) DO NOTHING;
  END IF;
  IF derived_payload ? 'campaignSummary' THEN
    INSERT INTO public.outbox_consumer_executions (
      id, outbox_message_id, consumer_name, deduplication_key, updated_at
    ) VALUES (
      gen_random_uuid(), derived_outbox_id, 'campaign_summary',
      'consumer:' || derived_outbox_id::text || ':campaign_summary', now()
    ) ON CONFLICT (outbox_message_id, consumer_name) DO NOTHING;
  END IF;
  IF derived_payload ? 'automationExecution' THEN
    INSERT INTO public.outbox_consumer_executions (
      id, outbox_message_id, consumer_name, deduplication_key, updated_at
    ) VALUES (
      gen_random_uuid(), derived_outbox_id, 'automation_execution',
      'consumer:' || derived_outbox_id::text || ':automation_execution', now()
    ) ON CONFLICT (outbox_message_id, consumer_name) DO NOTHING;
  END IF;
  RETURN derived_outbox_id;
END
$function$;

REVOKE ALL ON FUNCTION public.weddingos_record_worker_derived_event(text, text, text, integer, uuid, uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_record_worker_derived_event(text, text, text, integer, uuid, uuid, text, text, jsonb) TO weddingos_worker;
