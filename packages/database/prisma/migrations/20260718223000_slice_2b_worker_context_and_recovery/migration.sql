-- Slice 2B forced tenant isolation and worker access derived exclusively from
-- the persisted outbox consumer execution context.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "plan_generation_runs", "plan_proposals", "plan_proposal_items",
  "planning_phases", "timeline_milestones", "planning_tasks",
  "task_dependencies", "task_comments", "task_reminders", "calendar_events"
TO weddingos_app;

GRANT SELECT, INSERT, UPDATE ON TABLE
  "plan_generation_runs", "plan_proposals", "plan_proposal_items",
  "planning_phases", "timeline_milestones", "planning_tasks",
  "task_dependencies", "task_reminders", "calendar_events"
TO weddingos_worker;
GRANT SELECT ON TABLE "onboarding_drafts", "workspaces", "workspace_memberships", "role_templates", "membership_capability_overrides" TO weddingos_worker;

ALTER TABLE "plan_generation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_generation_runs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plan_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_proposals" FORCE ROW LEVEL SECURITY;
ALTER TABLE "plan_proposal_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_proposal_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "planning_phases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planning_phases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "timeline_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "timeline_milestones" FORCE ROW LEVEL SECURITY;
ALTER TABLE "planning_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "planning_tasks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "task_dependencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_dependencies" FORCE ROW LEVEL SECURITY;
ALTER TABLE "task_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_comments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "task_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_reminders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_events" FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.weddingos_has_capability(target_workspace_id uuid, target_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN bool_or(override.effect = 'DENY') THEN false
        WHEN bool_or(override.effect = 'ALLOW') THEN true
        ELSE template.capabilities ? target_capability
      END
      FROM public.workspace_memberships membership
      JOIN public.role_templates template ON template.id = membership.role_template_id
      LEFT JOIN public.membership_capability_overrides override
        ON override.membership_id = membership.id
       AND override.capability = target_capability
      WHERE membership.workspace_id = target_workspace_id
        AND membership.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND membership.status = 'ACTIVE'
      GROUP BY template.capabilities
    ),
    false
  );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_has_capability(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_has_capability(uuid, text) TO weddingos_app;

CREATE POLICY "plan_generation_runs_app_policy" ON "plan_generation_runs"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "plan_proposals_app_policy" ON "plan_proposals"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "plan_proposal_items_app_policy" ON "plan_proposal_items"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "planning_phases_app_policy" ON "planning_phases"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "timeline_milestones_app_policy" ON "timeline_milestones"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

CREATE POLICY "planning_tasks_app_policy" ON "planning_tasks"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND (
    NOT "is_private"
    OR "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR public.weddingos_has_capability("workspace_id", 'task.read_private')
    OR EXISTS (
      SELECT 1 FROM public.workspace_memberships assignee
      WHERE assignee.id = "planning_tasks"."assignee_membership_id"
        AND assignee.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        AND assignee.status = 'ACTIVE'
    )
  )
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "task_dependencies_app_policy" ON "task_dependencies"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "planning_tasks" task WHERE task.id = "task_id")
  AND EXISTS (SELECT 1 FROM "planning_tasks" prerequisite WHERE prerequisite.id = "depends_on_task_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "planning_tasks" task WHERE task.id = "task_id")
  AND EXISTS (SELECT 1 FROM "planning_tasks" prerequisite WHERE prerequisite.id = "depends_on_task_id")
);

CREATE POLICY "task_comments_app_policy" ON "task_comments"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "planning_tasks" task WHERE task.id = "task_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "planning_tasks" task WHERE task.id = "task_id")
);

CREATE POLICY "task_reminders_app_policy" ON "task_reminders"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "planning_tasks" task WHERE task.id = "task_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND EXISTS (SELECT 1 FROM "planning_tasks" task WHERE task.id = "task_id")
);

CREATE POLICY "calendar_events_app_policy" ON "calendar_events"
FOR ALL TO weddingos_app
USING ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"))
WITH CHECK ("workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid AND public.weddingos_has_workspace_access("workspace_id"));

-- Every worker policy verifies the workspace against the execution/outbox rows;
-- no BullMQ workspace value grants access.
CREATE POLICY "plan_generation_runs_worker_policy" ON "plan_generation_runs"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, "background_job_id", "workspace_id", "requested_by_user_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, "background_job_id", "workspace_id", "requested_by_user_id"));

CREATE POLICY "plan_proposals_worker_policy" ON "plan_proposals"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "created_by"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "created_by"));

CREATE POLICY "plan_proposal_items_worker_policy" ON "plan_proposal_items"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "planning_phases_worker_policy" ON "planning_phases"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "timeline_milestones_worker_policy" ON "timeline_milestones"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "planning_tasks_worker_policy" ON "planning_tasks"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "task_dependencies_worker_policy" ON "task_dependencies"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "task_reminders_worker_policy" ON "task_reminders"
FOR ALL TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "recipient_user_id"))
WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "recipient_user_id"));

CREATE POLICY "onboarding_worker_plan_generation" ON "onboarding_drafts"
FOR SELECT TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", NULL));

CREATE POLICY "workspaces_worker_planning" ON "workspaces"
FOR SELECT TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "id", NULL));

CREATE POLICY "memberships_worker_reminder" ON "workspace_memberships"
FOR SELECT TO weddingos_worker
USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, "workspace_id", "user_id"));

-- Persist default role capabilities so an existing database matches contracts
-- before the next seed run.
UPDATE "role_templates" template
SET "capabilities" = (
  SELECT jsonb_agg(value ORDER BY value)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(
      template."capabilities" ||
      CASE template."key"
        WHEN 'couple_owner' THEN '["planning.read","planning.write","planning.generate","planning.apply","task.read","task.write","task.assign","task.delete","task.read_private","calendar.read","calendar.write","timeline.read","timeline.write","timeline.recalculate"]'::jsonb
        WHEN 'couple_partner' THEN '["planning.read","planning.write","planning.generate","planning.apply","task.read","task.write","task.assign","task.delete","task.read_private","calendar.read","calendar.write","timeline.read","timeline.write","timeline.recalculate"]'::jsonb
        WHEN 'wedding_planner' THEN '["planning.read","planning.write","planning.generate","planning.apply","task.read","task.write","task.assign","task.delete","calendar.read","calendar.write","timeline.read","timeline.write","timeline.recalculate"]'::jsonb
        WHEN 'family_collaborator' THEN '["planning.read","task.read"]'::jsonb
        WHEN 'viewer' THEN '["planning.read","task.read","calendar.read","timeline.read"]'::jsonb
        ELSE '[]'::jsonb
      END
    ) AS value
  ) merged
)
WHERE template."key" IN ('couple_owner', 'couple_partner', 'wedding_planner', 'family_collaborator', 'viewer');
