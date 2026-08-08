-- Slice 5 introduces an independent vendor tenant. Neither a workspace id nor a
-- vendor organization id supplied by an HTTP/BullMQ payload is authoritative:
-- policies bind access to transaction-local context and persisted memberships.
CREATE OR REPLACE FUNCTION public.weddingos_has_vendor_access(target_vendor_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT target_vendor_organization_id IS NOT NULL
    AND target_vendor_organization_id = NULLIF(current_setting('app.current_vendor_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public.vendor_organization_memberships m
      WHERE m.vendor_organization_id = target_vendor_organization_id
        AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND m.status = 'ACTIVE'
    );
$$;
REVOKE ALL ON FUNCTION public.weddingos_has_vendor_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_has_vendor_access(uuid) TO weddingos_app, weddingos_worker;

GRANT SELECT ON TABLE "vendor_role_templates" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "vendor_organizations", "vendor_organization_memberships",
  "vendor_membership_capability_overrides", "vendor_organization_invitations",
  "vendor_profiles", "vendor_services", "vendor_packages", "vendor_service_regions",
  "vendor_availability_blocks", "vendor_portfolio_references", "vendor_notifications",
  "vendor_favorites", "vendor_shortlists", "vendor_shortlist_items",
  "requests_for_quote", "rfq_requirements", "rfq_questions", "rfq_recipients",
  "rfq_recipient_snapshots", "vendor_offers", "vendor_offer_versions",
  "vendor_offer_line_items", "vendor_offer_answers", "negotiation_threads",
  "negotiation_messages", "vendor_bookings", "booking_service_items",
  "booking_milestones", "vendor_contracts", "vendor_contract_versions",
  "contract_party_acknowledgements", "budget_plans", "budget_categories",
  "budget_items", "expense_records", "payment_schedule_entries", "payment_records"
TO weddingos_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  "vendor_organizations", "vendor_organization_memberships", "vendor_profiles",
  "vendor_services", "vendor_packages", "vendor_service_regions",
  "vendor_availability_blocks", "vendor_notifications", "requests_for_quote",
  "rfq_requirements", "rfq_questions", "rfq_recipients", "rfq_recipient_snapshots",
  "vendor_offers", "vendor_offer_versions", "vendor_offer_line_items",
  "vendor_offer_answers", "negotiation_threads", "negotiation_messages",
  "vendor_bookings", "booking_service_items", "booking_milestones",
  "vendor_contracts", "vendor_contract_versions", "contract_party_acknowledgements",
  "budget_plans", "budget_categories", "budget_items", "expense_records",
  "payment_schedule_entries", "payment_records"
TO weddingos_worker;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_organizations', 'vendor_organization_memberships',
    'vendor_membership_capability_overrides', 'vendor_organization_invitations',
    'vendor_profiles', 'vendor_services', 'vendor_packages', 'vendor_service_regions',
    'vendor_availability_blocks', 'vendor_portfolio_references', 'vendor_notifications',
    'vendor_favorites', 'vendor_shortlists', 'vendor_shortlist_items',
    'requests_for_quote', 'rfq_requirements', 'rfq_questions',
    'rfq_recipients', 'rfq_recipient_snapshots', 'vendor_offers', 'vendor_offer_versions',
    'vendor_offer_line_items', 'vendor_offer_answers', 'negotiation_threads',
    'negotiation_messages', 'vendor_bookings', 'booking_service_items',
    'booking_milestones', 'vendor_contracts', 'vendor_contract_versions',
    'contract_party_acknowledgements', 'budget_plans', 'budget_categories',
    'budget_items', 'expense_records', 'payment_schedule_entries', 'payment_records'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

CREATE POLICY "requests_for_quote_workspace_manage" ON "requests_for_quote"
  FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "requests_for_quote_vendor_read" ON "requests_for_quote"
  FOR SELECT TO weddingos_app USING (EXISTS (
    SELECT 1 FROM public.rfq_recipients recipient
    WHERE recipient.rfq_id = requests_for_quote.id
      AND public.weddingos_has_vendor_access(recipient.vendor_organization_id)
  ));

CREATE POLICY "rfq_requirements_workspace_manage" ON "rfq_requirements"
  FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "rfq_requirements_vendor_read" ON "rfq_requirements"
  FOR SELECT TO weddingos_app USING (EXISTS (
    SELECT 1 FROM public.rfq_recipients recipient
    WHERE recipient.rfq_id = rfq_requirements.rfq_id
      AND public.weddingos_has_vendor_access(recipient.vendor_organization_id)
  ));

CREATE POLICY "rfq_questions_workspace_manage" ON "rfq_questions"
  FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "rfq_questions_vendor_read" ON "rfq_questions"
  FOR SELECT TO weddingos_app USING (EXISTS (
    SELECT 1 FROM public.rfq_recipients recipient
    WHERE recipient.rfq_id = rfq_questions.rfq_id
      AND public.weddingos_has_vendor_access(recipient.vendor_organization_id)
  ));

CREATE POLICY "vendor_role_templates_read" ON "vendor_role_templates"
  FOR SELECT TO weddingos_app USING (true);

CREATE POLICY "vendor_organizations_insert" ON "vendor_organizations"
  FOR INSERT TO weddingos_app WITH CHECK (
    "id" = NULLIF(current_setting('app.current_vendor_organization_id', true), '')::uuid
    AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
CREATE POLICY "vendor_organizations_member" ON "vendor_organizations"
  FOR SELECT TO weddingos_app USING (public.weddingos_has_vendor_access("id"));
CREATE POLICY "vendor_organizations_update" ON "vendor_organizations"
  FOR UPDATE TO weddingos_app USING (public.weddingos_has_vendor_access("id"))
  WITH CHECK (public.weddingos_has_vendor_access("id"));

CREATE POLICY "vendor_memberships_bootstrap" ON "vendor_organization_memberships"
  FOR INSERT TO weddingos_app WITH CHECK (
    "vendor_organization_id" = NULLIF(current_setting('app.current_vendor_organization_id', true), '')::uuid
    AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
CREATE POLICY "vendor_memberships_read" ON "vendor_organization_memberships"
  FOR SELECT TO weddingos_app USING (
    public.weddingos_has_vendor_access("vendor_organization_id")
    OR "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );
CREATE POLICY "vendor_memberships_manage" ON "vendor_organization_memberships"
  FOR UPDATE TO weddingos_app USING (public.weddingos_has_vendor_access("vendor_organization_id"))
  WITH CHECK (public.weddingos_has_vendor_access("vendor_organization_id"));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_membership_capability_overrides', 'vendor_organization_invitations',
    'vendor_availability_blocks', 'vendor_portfolio_references', 'vendor_notifications'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_vendor_access(vendor_organization_id)) WITH CHECK (public.weddingos_has_vendor_access(vendor_organization_id))',
      table_name || '_vendor_policy', table_name
    );
  END LOOP;
END $$;

CREATE POLICY "vendor_profiles_vendor_manage" ON "vendor_profiles"
  FOR ALL TO weddingos_app USING (public.weddingos_has_vendor_access("vendor_organization_id"))
  WITH CHECK (public.weddingos_has_vendor_access("vendor_organization_id"));
CREATE POLICY "vendor_profiles_marketplace_read" ON "vendor_profiles"
  FOR SELECT TO weddingos_app USING ("publication_status" = 'PUBLISHED');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['vendor_services', 'vendor_packages', 'vendor_service_regions'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (public.weddingos_has_vendor_access(vendor_organization_id)) WITH CHECK (public.weddingos_has_vendor_access(vendor_organization_id))',
      table_name || '_vendor_manage', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO weddingos_app USING (EXISTS (SELECT 1 FROM public.vendor_profiles p WHERE p.vendor_organization_id = %I.vendor_organization_id AND p.publication_status = ''PUBLISHED''))',
      table_name || '_marketplace_read', table_name, table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_favorites', 'vendor_shortlists', 'vendor_shortlist_items',
    'budget_plans', 'budget_categories', 'budget_items', 'expense_records'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id))',
      table_name || '_workspace_policy', table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'rfq_recipients', 'rfq_recipient_snapshots', 'vendor_offers', 'vendor_offer_versions',
    'vendor_offer_line_items', 'vendor_offer_answers', 'negotiation_threads',
    'negotiation_messages', 'vendor_bookings', 'booking_service_items',
    'booking_milestones', 'vendor_contracts', 'vendor_contract_versions',
    'contract_party_acknowledgements', 'payment_schedule_entries', 'payment_records'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING ((workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) OR public.weddingos_has_vendor_access(vendor_organization_id)) WITH CHECK ((workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) OR public.weddingos_has_vendor_access(vendor_organization_id))',
      table_name || '_dual_tenant_policy', table_name
    );
  END LOOP;
END $$;

-- Six-argument verifier adds vendor tenant matching while retaining the old
-- five-argument wrapper for every Slice 2A-4 policy/function.
CREATE OR REPLACE FUNCTION public.weddingos_worker_execution_context_matches(
  target_execution uuid,
  target_outbox uuid,
  target_job uuid,
  target_workspace uuid,
  target_actor uuid,
  target_vendor_organization uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT session_user = 'weddingos_worker'
    AND NULLIF(current_setting('app.current_worker_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.outbox_consumer_executions e
      JOIN public.outbox_messages o ON o.id = e.outbox_message_id
      WHERE e.id = NULLIF(current_setting('app.current_consumer_execution_id', true), '')::uuid
        AND (target_execution IS NULL OR e.id = target_execution)
        AND (target_outbox IS NULL OR o.id = target_outbox)
        AND (target_job IS NULL OR e.background_job_id = target_job)
        AND (target_workspace IS NULL OR o.workspace_id = target_workspace)
        AND (target_actor IS NULL OR o.actor_user_id = target_actor)
        AND (target_vendor_organization IS NULL OR o.vendor_organization_id = target_vendor_organization)
    );
$$;
REVOKE ALL ON FUNCTION public.weddingos_worker_execution_context_matches(uuid, uuid, uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_worker_execution_context_matches(uuid, uuid, uuid, uuid, uuid, uuid) TO weddingos_worker;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'rfq_recipients', 'rfq_recipient_snapshots', 'vendor_offers', 'vendor_offer_versions',
    'vendor_offer_line_items', 'vendor_offer_answers', 'negotiation_threads',
    'negotiation_messages', 'vendor_bookings', 'booking_service_items',
    'booking_milestones', 'vendor_contracts', 'vendor_contract_versions',
    'contract_party_acknowledgements', 'payment_schedule_entries', 'payment_records'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, vendor_organization_id))',
      table_name || '_worker_policy', table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['requests_for_quote', 'rfq_requirements', 'rfq_questions'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL))',
      table_name || '_worker_policy', table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'vendor_organizations', 'vendor_organization_memberships', 'vendor_profiles',
    'vendor_services', 'vendor_packages', 'vendor_service_regions',
    'vendor_availability_blocks', 'vendor_notifications'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, NULL, NULL, %s)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, NULL, NULL, %s))',
      table_name || '_worker_policy', table_name,
      CASE WHEN table_name = 'vendor_organizations' THEN 'id' ELSE 'vendor_organization_id' END,
      CASE WHEN table_name = 'vendor_organizations' THEN 'id' ELSE 'vendor_organization_id' END
    );
  END LOOP;
END $$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'budget_plans', 'budget_categories', 'budget_items', 'expense_records'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL))',
      table_name || '_worker_policy', table_name
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "outbox_app_policy" ON "outbox_messages";
CREATE POLICY "outbox_app_policy" ON "outbox_messages" FOR ALL TO weddingos_app
USING (
  "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  OR ("workspace_id" IS NOT NULL AND "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  OR ("vendor_organization_id" IS NOT NULL AND public.weddingos_has_vendor_access("vendor_organization_id"))
)
WITH CHECK (
  "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  OR ("workspace_id" IS NOT NULL AND "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  OR ("vendor_organization_id" IS NOT NULL AND public.weddingos_has_vendor_access("vendor_organization_id"))
);

DROP POLICY IF EXISTS "jobs_app_policy" ON "background_jobs";
CREATE POLICY "jobs_app_policy" ON "background_jobs" FOR ALL TO weddingos_app
USING (
  "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  OR ("workspace_id" IS NOT NULL AND public.weddingos_has_workspace_access("workspace_id"))
  OR ("vendor_organization_id" IS NOT NULL AND public.weddingos_has_vendor_access("vendor_organization_id"))
)
WITH CHECK (
  "actor_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  OR ("workspace_id" IS NOT NULL AND public.weddingos_has_workspace_access("workspace_id"))
  OR ("vendor_organization_id" IS NOT NULL AND public.weddingos_has_vendor_access("vendor_organization_id"))
);

DROP POLICY IF EXISTS "outbox_worker_policy" ON "outbox_messages";
CREATE POLICY "outbox_worker_policy" ON "outbox_messages" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, "id", "background_job_id", "workspace_id", "actor_user_id", "vendor_organization_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, "id", "background_job_id", "workspace_id", "actor_user_id", "vendor_organization_id"));

DROP POLICY IF EXISTS "jobs_worker_policy" ON "background_jobs";
CREATE POLICY "jobs_worker_policy" ON "background_jobs" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, "id", "workspace_id", "actor_user_id", "vendor_organization_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, "id", "workspace_id", "actor_user_id", "vendor_organization_id"));

DROP POLICY IF EXISTS "delivery_attempts_worker_policy" ON "delivery_attempts";
CREATE POLICY "delivery_attempts_worker_policy" ON "delivery_attempts" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", NULL, "vendor_organization_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", NULL, "vendor_organization_id"));

DROP POLICY IF EXISTS "artifacts_worker_policy" ON "generated_artifacts";
CREATE POLICY "artifacts_worker_policy" ON "generated_artifacts" FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", "owner_user_id", "vendor_organization_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches("consumer_execution_id", NULL, "background_job_id", "workspace_id", "owner_user_id", "vendor_organization_id"));

DROP FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text);
CREATE FUNCTION public.weddingos_begin_consumer_execution(
  target_execution uuid,
  target_outbox uuid,
  target_consumer text,
  claim_worker_id text
)
RETURNS TABLE (
  execution_id uuid,
  outbox_message_id uuid,
  consumer_name text,
  background_job_id uuid,
  workspace_id uuid,
  vendor_organization_id uuid,
  actor_user_id uuid,
  correlation_id text,
  event_name text,
  payload jsonb,
  encrypted_headers text,
  attempt_number integer,
  max_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF session_user <> 'weddingos_worker' THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH started AS (
    UPDATE public.outbox_consumer_executions e
    SET status = 'PROCESSING', attempts = e.attempts + 1,
        locked_at = now(), locked_by = claim_worker_id,
        started_at = COALESCE(e.started_at, now()), heartbeat_at = now(),
        last_error_code = NULL, last_error_message = NULL,
        updated_at = now(), version = e.version + 1
    WHERE e.id = target_execution
      AND e.outbox_message_id = target_outbox
      AND e.consumer_name = target_consumer
      AND e.status NOT IN ('COMPLETED', 'DEAD_LETTER')
    RETURNING e.*
  )
  SELECT s.id, o.id, s.consumer_name::text, s.background_job_id,
    o.workspace_id, o.vendor_organization_id, o.actor_user_id,
    o.correlation_id::text, o.event_name::text, o.payload,
    o.encrypted_headers, s.attempts, s.max_attempts
  FROM started s
  JOIN public.outbox_messages o ON o.id = s.outbox_message_id;
END
$$;
REVOKE ALL ON FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_begin_consumer_execution(uuid, uuid, text, text) TO weddingos_worker;
