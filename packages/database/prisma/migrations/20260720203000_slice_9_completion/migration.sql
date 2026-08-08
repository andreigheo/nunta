BEGIN;

ALTER TABLE "automation_executions" ALTER COLUMN "background_job_id" DROP NOT NULL;
ALTER TABLE "automation_executions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "automation_execution_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "decision" VARCHAR(40) NOT NULL,
  "reason" VARCHAR(2000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_execution_approvals_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_execution_approvals_execution_id_key" ON "automation_execution_approvals"("execution_id");
CREATE INDEX "automation_execution_approvals_workspace_id_created_at_idx" ON "automation_execution_approvals"("workspace_id", "created_at");
ALTER TABLE "automation_execution_approvals" ADD CONSTRAINT "automation_execution_approval_execution_fk" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE;

CREATE TABLE "weekly_intelligence_digests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "requested_by" UUID NOT NULL,
  "background_job_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(200) NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
  "metrics" JSONB NOT NULL DEFAULT '{}',
  "delivered_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_intelligence_digests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "weekly_intelligence_digests_background_job_id_key" ON "weekly_intelligence_digests"("background_job_id");
CREATE UNIQUE INDEX "weekly_intelligence_digests_workspace_id_idempotency_key_key" ON "weekly_intelligence_digests"("workspace_id", "idempotency_key");
CREATE UNIQUE INDEX "weekly_intelligence_digests_workspace_id_period_start_period_end_key" ON "weekly_intelligence_digests"("workspace_id", "period_start", "period_end");
CREATE INDEX "weekly_intelligence_digests_workspace_id_status_created_at_idx" ON "weekly_intelligence_digests"("workspace_id", "status", "created_at");
ALTER TABLE "weekly_intelligence_digests" ADD CONSTRAINT "weekly_intelligence_digest_job_fk" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE RESTRICT;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "automation_execution_approvals", "weekly_intelligence_digests" TO weddingos_app, weddingos_worker;

ALTER TABLE "automation_execution_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation_execution_approvals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "automation_execution_approvals_workspace" ON "automation_execution_approvals" FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "automation_execution_approvals_worker" ON "automation_execution_approvals" FOR ALL TO weddingos_worker
  USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL, NULL))
  WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL, NULL));

ALTER TABLE "weekly_intelligence_digests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_intelligence_digests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "weekly_intelligence_digests_workspace" ON "weekly_intelligence_digests" FOR ALL TO weddingos_app
  USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
  WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));
CREATE POLICY "weekly_intelligence_digests_worker" ON "weekly_intelligence_digests" FOR ALL TO weddingos_worker
  USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL, NULL))
  WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL, NULL));

INSERT INTO "automation_templates" ("id", "key", "name", "description", "definition", "updated_at") VALUES
(gen_random_uuid(), 'weekly-planning-digest', 'Rezumat săptămânal de planning', 'Pregătește o notificare internă pentru revizuirea săptămânală.', '{"triggerType":"SCHEDULED","triggerConfiguration":{"cadence":"WEEKLY"},"conditions":[],"actions":[{"type":"CREATE_NOTIFICATION","configuration":{"kind":"weekly_planning_review"},"position":0}],"requiresApproval":false}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'urgent-task-escalation', 'Escaladare task urgent', 'Notifică echipa când un task urgent devine întârziat.', '{"triggerType":"TASK_OVERDUE","conditions":[{"field":"priority","operator":"eq","value":"URGENT"}],"actions":[{"type":"CREATE_NOTIFICATION","configuration":{"priority":"urgent"},"position":0}],"requiresApproval":false}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'high-risk-plan-b-reminder', 'Revizuire Plan B pentru risc ridicat', 'Creează un task de revizuire când un risc ajunge la nivel ridicat.', '{"triggerType":"RISK_LEVEL_CHANGED","conditions":[{"field":"riskLevel","operator":"in","value":["HIGH","CRITICAL"]}],"actions":[{"type":"CREATE_TASK","configuration":{"priority":"HIGH","category":"risk"},"position":0}],"requiresApproval":true}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'milestone-readiness-task', 'Verificare înainte de milestone', 'Propune un task de verificare înainte de milestone.', '{"triggerType":"MILESTONE_APPROACHING","conditions":[],"actions":[{"type":"CREATE_TASK","configuration":{"priority":"HIGH","category":"planning"},"position":0}],"requiresApproval":true}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'manual-risk-review', 'Revizuire manuală a riscurilor', 'Pornește o notificare controlată pentru revizuirea registrului de riscuri.', '{"triggerType":"MANUAL","conditions":[],"actions":[{"type":"CREATE_NOTIFICATION","configuration":{"kind":"risk_review"},"position":0}],"requiresApproval":false}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'manual-contingency-drill', 'Exercițiu Plan B', 'Creează un task controlat pentru simularea unui Plan B.', '{"triggerType":"MANUAL","conditions":[],"actions":[{"type":"CREATE_TASK","configuration":{"priority":"MEDIUM","category":"risk"},"position":0}],"requiresApproval":true}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'overdue-task-calendar-followup', 'Reprogramare task întârziat', 'Propune un eveniment de follow-up pentru un task întârziat.', '{"triggerType":"TASK_OVERDUE","conditions":[{"field":"priority","operator":"in","value":["HIGH","URGENT"]}],"actions":[{"type":"CREATE_CALENDAR_EVENT","configuration":{"durationMinutes":30},"position":0}],"requiresApproval":true}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'critical-risk-notification', 'Alertă risc critic', 'Trimite o notificare internă deduplicată pentru risc critic.', '{"triggerType":"RISK_LEVEL_CHANGED","conditions":[{"field":"riskLevel","operator":"eq","value":"CRITICAL"}],"actions":[{"type":"CREATE_NOTIFICATION","configuration":{"priority":"urgent"},"position":0}],"requiresApproval":false}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'scheduled-deadline-review', 'Revizuire periodică deadline-uri', 'Creează o notificare pentru verificarea deadline-urilor apropiate.', '{"triggerType":"SCHEDULED","triggerConfiguration":{"cadence":"DAILY"},"conditions":[],"actions":[{"type":"CREATE_NOTIFICATION","configuration":{"kind":"deadline_review"},"position":0}],"requiresApproval":false}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements("capabilities" ||
    '["copilot.create_proposal","copilot.approve_low_risk","copilot.approve_medium_risk","copilot.view_usage","risk.assess","risk.assign","risk.accept","risk.resolve","contingency.approve","contingency.complete","automation.activate","automation.pause","automation.approve","automation.view_executions"]'::jsonb) capability
) WHERE "key" = 'wedding_planner';

UPDATE "role_templates" SET "capabilities" = (
  SELECT jsonb_agg(DISTINCT capability)
  FROM jsonb_array_elements(("capabilities" - 'copilot.configure_provider') ||
    '["copilot.create_proposal","copilot.approve_low_risk","copilot.approve_medium_risk","copilot.approve_high_risk","copilot.view_usage","risk.assess","risk.assign","risk.accept","risk.resolve","risk.read_sensitive","contingency.approve","contingency.complete","automation.activate","automation.pause","automation.approve","automation.view_executions","automation.manage_templates"]'::jsonb) capability
) WHERE "key" IN ('couple_owner','couple_partner');

UPDATE "role_templates"
SET "capabilities" = "capabilities" - 'copilot.use'
WHERE "key" = 'family_collaborator';

COMMIT;
