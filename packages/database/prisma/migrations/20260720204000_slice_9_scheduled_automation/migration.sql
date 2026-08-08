BEGIN;

CREATE OR REPLACE FUNCTION public.weddingos_schedule_due_automations(schedule_limit integer DEFAULT 50)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate record;
  execution_id uuid;
  outbox_id uuid;
  schedule_key text;
  scheduled_count integer := 0;
  cadence text;
  due_interval interval;
  event_name text;
  event_payload jsonb;
BEGIN
  IF schedule_limit < 1 OR schedule_limit > 200 THEN
    RAISE EXCEPTION 'invalid schedule limit';
  END IF;

  FOR candidate IN
    SELECT r.*
    FROM automation_rules r
    JOIN workspaces w ON w.id = r.workspace_id AND w.status <> 'ARCHIVED'
    WHERE r.status = 'ACTIVE'
      AND r.trigger_type = 'SCHEDULED'
    ORDER BY COALESCE(r.last_executed_at, r.created_at), r.id
    FOR UPDATE OF r SKIP LOCKED
    LIMIT schedule_limit
  LOOP
    cadence := upper(COALESCE(candidate.trigger_configuration->>'cadence', 'DAILY'));
    due_interval := CASE cadence
      WHEN 'WEEKLY' THEN interval '7 days'
      ELSE interval '1 day'
    END;
    IF COALESCE(candidate.last_executed_at, candidate.created_at - due_interval) > CURRENT_TIMESTAMP - due_interval THEN
      CONTINUE;
    END IF;

    schedule_key := 'scheduled:' || candidate.id::text || ':' ||
      CASE cadence
        WHEN 'WEEKLY' THEN to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'IYYY-IW')
        ELSE to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      END;
    execution_id := gen_random_uuid();

    INSERT INTO automation_executions (
      id, workspace_id, rule_id, requested_by, background_job_id,
      idempotency_key, mode, status, recursion_depth, result, created_at, version
    ) VALUES (
      execution_id, candidate.workspace_id, candidate.id, candidate.created_by,
      NULL, schedule_key, 'EXECUTE',
      CASE WHEN candidate.requires_approval
        THEN 'WAITING_APPROVAL'::"AutomationExecutionStatus"
        ELSE 'QUEUED'::"AutomationExecutionStatus"
      END,
      0, '{}'::jsonb, CURRENT_TIMESTAMP, 1
    ) ON CONFLICT (workspace_id, idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    event_name := CASE WHEN candidate.requires_approval
      THEN 'automation.approval_requested.v1'
      ELSE 'automation.execution_requested.v1'
    END;
    event_payload := jsonb_build_object(
      'occurredAt', CURRENT_TIMESTAMP,
      'subject', jsonb_build_object(
        'executionId', execution_id,
        'ruleId', candidate.id,
        'scheduled', true,
        'cadence', cadence
      ),
      'automationExecution', jsonb_build_object('executionId', execution_id)
    );
    IF candidate.requires_approval THEN
      event_payload := event_payload || jsonb_build_object(
        'notification', jsonb_build_object(
          'recipientUserId', candidate.created_by,
          'module', 'automation',
          'kind', 'automation_approval_required',
          'priority', 'high',
          'title', 'Automatizare programată în așteptarea aprobării',
          'body', candidate.name,
          'actionUrl', '/automations'
        ),
        'activity', jsonb_build_object(
          'category', 'automation',
          'action', 'approval_requested',
          'summary', 'Automatizarea programată necesită aprobare.',
          'entityType', 'AutomationExecution',
          'entityId', execution_id
        )
      );
    END IF;

    outbox_id := gen_random_uuid();
    INSERT INTO outbox_messages (
      id, event_name, event_version, aggregate_type, aggregate_id,
      aggregate_version, workspace_id, actor_user_id, background_job_id,
      correlation_id, idempotency_key, deduplication_key, payload,
      max_attempts, available_at, created_at, updated_at, version
    ) VALUES (
      outbox_id, event_name, 1, 'AutomationExecution', execution_id::text,
      1, candidate.workspace_id, candidate.created_by, NULL,
      gen_random_uuid()::text, schedule_key,
      'automation-scheduled:' || schedule_key, event_payload,
      5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
    );

    INSERT INTO outbox_consumer_executions (
      id, outbox_message_id, background_job_id, consumer_name,
      max_attempts, available_at, deduplication_key, created_at, updated_at
    ) VALUES
      (gen_random_uuid(), outbox_id, NULL, 'event_ack', 5, CURRENT_TIMESTAMP,
       'consumer:' || outbox_id::text || ':event_ack', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    IF candidate.requires_approval THEN
      INSERT INTO outbox_consumer_executions (
        id, outbox_message_id, background_job_id, consumer_name,
        max_attempts, available_at, deduplication_key, created_at, updated_at
      ) VALUES
        (gen_random_uuid(), outbox_id, NULL, 'notification_projection', 5, CURRENT_TIMESTAMP,
         'consumer:' || outbox_id::text || ':notification_projection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (gen_random_uuid(), outbox_id, NULL, 'activity_projection', 5, CURRENT_TIMESTAMP,
         'consumer:' || outbox_id::text || ':activity_projection', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    ELSE
      INSERT INTO outbox_consumer_executions (
        id, outbox_message_id, background_job_id, consumer_name,
        max_attempts, available_at, deduplication_key, created_at, updated_at
      ) VALUES
        (gen_random_uuid(), outbox_id, NULL, 'automation_execution', 5, CURRENT_TIMESTAMP,
         'consumer:' || outbox_id::text || ':automation_execution', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;

    UPDATE automation_rules
    SET last_executed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = candidate.id;
    scheduled_count := scheduled_count + 1;
  END LOOP;

  RETURN scheduled_count;
END;
$$;

REVOKE ALL ON FUNCTION public.weddingos_schedule_due_automations(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_schedule_due_automations(integer) TO weddingos_worker;

COMMIT;
