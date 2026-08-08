BEGIN;

CREATE OR REPLACE FUNCTION public.weddingos_record_security_signal(
  p_type text, p_severity text, p_dedupe_key text, p_actor_hash text,
  p_target_type text, p_target_hash text, p_context jsonb, p_correlation_id text,
  p_threshold integer, p_window_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE signal_count integer; alert_id uuid;
BEGIN
  IF p_threshold < 1 OR p_threshold > 1000 OR p_window_seconds < 30 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'SECURITY_SIGNAL_POLICY_INVALID';
  END IF;
  INSERT INTO security_events(id,type,severity,dedupe_key,actor_hash,target_type,target_hash,context_redacted,correlation_id)
  VALUES (gen_random_uuid(),p_type,p_severity,p_dedupe_key,p_actor_hash,p_target_type,p_target_hash,COALESCE(p_context,'{}'::jsonb),p_correlation_id);
  SELECT count(*) INTO signal_count FROM security_events
  WHERE dedupe_key=p_dedupe_key AND occurred_at >= now() - make_interval(secs => p_window_seconds);
  IF signal_count < p_threshold THEN RETURN jsonb_build_object('alerted',false,'count',signal_count); END IF;
  INSERT INTO security_alerts(id,type,severity,dedupe_key,title,summary,runbook_url,occurrence_count,updated_at)
  VALUES (gen_random_uuid(),p_type,p_severity,p_dedupe_key,'Security threshold: ' || p_type,
          signal_count || ' semnale în fereastra de ' || p_window_seconds || ' secunde.',
          '/docs/INCIDENT_RESPONSE_RUNBOOK.md',signal_count,now())
  ON CONFLICT (dedupe_key,status) DO UPDATE SET
    occurrence_count=security_alerts.occurrence_count+1,last_seen_at=now(),updated_at=now(),version=security_alerts.version+1
  RETURNING id INTO alert_id;
  RETURN jsonb_build_object('alerted',true,'count',signal_count,'alertId',alert_id);
END;
$$;

COMMIT;
