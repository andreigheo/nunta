BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "copilot_conversations","copilot_messages","copilot_runs","copilot_source_references",
  "copilot_feedback","copilot_proposals","copilot_proposal_versions","copilot_proposal_actions",
  "copilot_approvals","copilot_executions","copilot_usage_records","document_text_extractions",
  "document_text_chunks","risk_detection_runs","risks","risk_signals","risk_assessments",
  "risk_mitigation_actions","risk_updates","contingency_plans","contingency_plan_versions",
  "contingency_triggers","contingency_actions","contingency_activations","contingency_simulations",
  "automation_rules","automation_conditions","automation_actions","automation_executions",
  "automation_execution_steps"
TO weddingos_app, weddingos_worker;

GRANT SELECT ON TABLE "automation_templates" TO weddingos_app, weddingos_worker;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'copilot_conversations','copilot_messages','copilot_runs','copilot_source_references',
    'copilot_feedback','copilot_proposals','copilot_proposal_versions','copilot_proposal_actions',
    'copilot_approvals','copilot_executions','copilot_usage_records','document_text_extractions',
    'document_text_chunks','risk_detection_runs','risks','risk_signals','risk_assessments',
    'risk_mitigation_actions','risk_updates','contingency_plans','contingency_plan_versions',
    'contingency_triggers','contingency_actions','contingency_activations','contingency_simulations',
    'automation_rules','automation_conditions','automation_actions','automation_executions',
    'automation_execution_steps'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id))',
      table_name || '_workspace', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL))',
      table_name || '_worker', table_name
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.weddingos_reject_immutable_intelligence_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'immutable intelligence version' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "copilot_proposal_versions_immutable"
  BEFORE UPDATE OR DELETE ON "copilot_proposal_versions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_immutable_intelligence_version();
CREATE TRIGGER "contingency_plan_versions_immutable"
  BEFORE UPDATE OR DELETE ON "contingency_plan_versions"
  FOR EACH ROW EXECUTE FUNCTION public.weddingos_reject_immutable_intelligence_version();

UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" ||
    '["copilot.read","copilot.use","copilot.review_proposals","copilot.execute_proposals","risk.read","risk.write","risk.detect","contingency.read","contingency.write","contingency.activate","automation.read","automation.write","automation.execute"]'::jsonb) capability
) WHERE "key" IN ('couple_owner','couple_partner','wedding_planner');

UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability) FROM jsonb_array_elements("capabilities" ||
    '["copilot.read","risk.read","contingency.read","automation.read"]'::jsonb) capability
) WHERE "key" IN ('family_collaborator','viewer');

COMMIT;
