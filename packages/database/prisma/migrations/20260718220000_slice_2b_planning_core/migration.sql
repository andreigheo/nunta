-- CreateEnum
CREATE TYPE "PlanGenerationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanProposalStatus" AS ENUM ('GENERATING', 'READY_FOR_REVIEW', 'REJECTED', 'APPLIED', 'SUPERSEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PlanProposalItemType" AS ENUM ('PHASE', 'MILESTONE', 'TASK');

-- CreateEnum
CREATE TYPE "PlanningPhaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TimelineMilestoneStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PlanningTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PlanningTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskDependencyType" AS ENUM ('FINISH_TO_START');

-- CreateEnum
CREATE TYPE "TaskReminderChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "TaskReminderStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'SENT', 'STALE', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "plan_generation_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "onboarding_draft_id" UUID NOT NULL,
    "onboarding_version" INTEGER NOT NULL,
    "background_job_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "mode" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120),
    "rules_version" VARCHAR(80) NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "status" "PlanGenerationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "usage" JSONB,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "proposal_id" UUID,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "plan_generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_proposals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "onboarding_draft_id" UUID NOT NULL,
    "onboarding_version" INTEGER NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "status" "PlanProposalStatus" NOT NULL DEFAULT 'GENERATING',
    "title" VARCHAR(240) NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "coverage_result" JSONB NOT NULL DEFAULT '{}',
    "generator_type" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "model" VARCHAR(120),
    "rules_version" VARCHAR(80) NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "rejection_reason" VARCHAR(1000),
    "applied_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "plan_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_proposal_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "type" "PlanProposalItemType" NOT NULL,
    "parent_item_id" UUID,
    "source_key" VARCHAR(160) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "category" VARCHAR(80),
    "priority" "PlanningTaskPriority",
    "relative_start_offset_days" INTEGER,
    "relative_due_offset_days" INTEGER,
    "absolute_start_at" TIMESTAMP(3),
    "absolute_due_at" TIMESTAMP(3),
    "estimated_effort_minutes" INTEGER,
    "suggested_owner_type" VARCHAR(80),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "exclusion_reason" VARCHAR(500),
    "position" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "plan_proposal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_phases" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "relative_start_offset_days" INTEGER,
    "relative_end_offset_days" INTEGER,
    "status" "PlanningPhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "source_proposal_id" UUID,
    "source_proposal_item_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "planning_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timeline_milestones" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "phase_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "target_at" TIMESTAMP(3),
    "relative_offset_days" INTEGER,
    "status" "TimelineMilestoneStatus" NOT NULL DEFAULT 'UPCOMING',
    "position" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "source_proposal_item_id" UUID,
    "completed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "timeline_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "phase_id" UUID,
    "milestone_id" UUID,
    "parent_task_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "category" VARCHAR(80) NOT NULL DEFAULT 'planning',
    "status" "PlanningTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "PlanningTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "start_at" TIMESTAMP(3),
    "due_at" TIMESTAMP(3),
    "relative_start_offset_days" INTEGER,
    "relative_due_offset_days" INTEGER,
    "assignee_membership_id" UUID,
    "created_by" UUID NOT NULL,
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "blocked_reason" VARCHAR(1000),
    "estimated_effort_minutes" INTEGER,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "source_proposal_item_id" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "planning_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "depends_on_task_id" UUID NOT NULL,
    "dependency_type" "TaskDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reminders" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "channel" "TaskReminderChannel" NOT NULL,
    "task_version" INTEGER NOT NULL,
    "status" "TaskReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "dedupe_key" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "event_type" VARCHAR(80) NOT NULL DEFAULT 'meeting',
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3),
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "timezone" VARCHAR(80) NOT NULL,
    "location" VARCHAR(500),
    "meeting_url" VARCHAR(2048),
    "owner_membership_id" UUID,
    "related_task_id" UUID,
    "related_milestone_id" UUID,
    "reminder_minutes" INTEGER,
    "recurrence_rule" VARCHAR(1000),
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plan_generation_runs_background_job_id_key" ON "plan_generation_runs"("background_job_id");

-- CreateIndex
CREATE INDEX "plan_generation_runs_workspace_id_status_created_at_idx" ON "plan_generation_runs"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "plan_generation_runs_workspace_id_onboarding_version_input__key" ON "plan_generation_runs"("workspace_id", "onboarding_version", "input_hash");

-- CreateIndex
CREATE UNIQUE INDEX "plan_proposals_generation_run_id_key" ON "plan_proposals"("generation_run_id");

-- CreateIndex
CREATE INDEX "plan_proposals_workspace_id_status_created_at_idx" ON "plan_proposals"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "plan_proposals_onboarding_draft_id_onboarding_version_idx" ON "plan_proposals"("onboarding_draft_id", "onboarding_version");

-- CreateIndex
CREATE INDEX "plan_proposal_items_workspace_id_proposal_id_position_idx" ON "plan_proposal_items"("workspace_id", "proposal_id", "position");

-- CreateIndex
CREATE INDEX "plan_proposal_items_parent_item_id_idx" ON "plan_proposal_items"("parent_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_proposal_items_proposal_id_source_key_key" ON "plan_proposal_items"("proposal_id", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "planning_phases_source_proposal_item_id_key" ON "planning_phases"("source_proposal_item_id");

-- CreateIndex
CREATE INDEX "planning_phases_workspace_id_position_idx" ON "planning_phases"("workspace_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "timeline_milestones_source_proposal_item_id_key" ON "timeline_milestones"("source_proposal_item_id");

-- CreateIndex
CREATE INDEX "timeline_milestones_workspace_id_target_at_idx" ON "timeline_milestones"("workspace_id", "target_at");

-- CreateIndex
CREATE INDEX "timeline_milestones_phase_id_position_idx" ON "timeline_milestones"("phase_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "planning_tasks_source_proposal_item_id_key" ON "planning_tasks"("source_proposal_item_id");

-- CreateIndex
CREATE INDEX "planning_tasks_workspace_id_status_due_at_idx" ON "planning_tasks"("workspace_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "planning_tasks_workspace_id_priority_due_at_idx" ON "planning_tasks"("workspace_id", "priority", "due_at");

-- CreateIndex
CREATE INDEX "planning_tasks_workspace_id_assignee_membership_id_idx" ON "planning_tasks"("workspace_id", "assignee_membership_id");

-- CreateIndex
CREATE INDEX "planning_tasks_parent_task_id_position_idx" ON "planning_tasks"("parent_task_id", "position");

-- CreateIndex
CREATE INDEX "task_dependencies_workspace_id_task_id_idx" ON "task_dependencies"("workspace_id", "task_id");

-- CreateIndex
CREATE INDEX "task_dependencies_depends_on_task_id_idx" ON "task_dependencies"("depends_on_task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_task_id_depends_on_task_id_key" ON "task_dependencies"("task_id", "depends_on_task_id");

-- CreateIndex
CREATE INDEX "task_comments_workspace_id_task_id_created_at_idx" ON "task_comments"("workspace_id", "task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_reminders_dedupe_key_key" ON "task_reminders"("dedupe_key");

-- CreateIndex
CREATE INDEX "task_reminders_workspace_id_status_scheduled_at_idx" ON "task_reminders"("workspace_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "task_reminders_task_id_status_idx" ON "task_reminders"("task_id", "status");

-- CreateIndex
CREATE INDEX "calendar_events_workspace_id_start_at_idx" ON "calendar_events"("workspace_id", "start_at");

-- Referential integrity for the canonical Slice 2B domain.
ALTER TABLE "plan_generation_runs" ADD CONSTRAINT "plan_generation_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_generation_runs" ADD CONSTRAINT "plan_generation_runs_onboarding_draft_id_fkey" FOREIGN KEY ("onboarding_draft_id") REFERENCES "onboarding_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_generation_runs" ADD CONSTRAINT "plan_generation_runs_background_job_id_fkey" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_generation_runs" ADD CONSTRAINT "plan_generation_runs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_onboarding_draft_id_fkey" FOREIGN KEY ("onboarding_draft_id") REFERENCES "onboarding_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "plan_generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_generation_runs" ADD CONSTRAINT "plan_generation_runs_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "plan_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "plan_proposal_items" ADD CONSTRAINT "plan_proposal_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_proposal_items" ADD CONSTRAINT "plan_proposal_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "plan_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plan_proposal_items" ADD CONSTRAINT "plan_proposal_items_parent_item_id_fkey" FOREIGN KEY ("parent_item_id") REFERENCES "plan_proposal_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "planning_phases" ADD CONSTRAINT "planning_phases_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_phases" ADD CONSTRAINT "planning_phases_source_proposal_id_fkey" FOREIGN KEY ("source_proposal_id") REFERENCES "plan_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_phases" ADD CONSTRAINT "planning_phases_source_proposal_item_id_fkey" FOREIGN KEY ("source_proposal_item_id") REFERENCES "plan_proposal_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "timeline_milestones" ADD CONSTRAINT "timeline_milestones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timeline_milestones" ADD CONSTRAINT "timeline_milestones_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "planning_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "timeline_milestones" ADD CONSTRAINT "timeline_milestones_source_proposal_item_id_fkey" FOREIGN KEY ("source_proposal_item_id") REFERENCES "plan_proposal_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "planning_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "timeline_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "planning_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_assignee_membership_id_fkey" FOREIGN KEY ("assignee_membership_id") REFERENCES "workspace_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_source_proposal_item_id_fkey" FOREIGN KEY ("source_proposal_item_id") REFERENCES "plan_proposal_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "planning_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_fkey" FOREIGN KEY ("depends_on_task_id") REFERENCES "planning_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_no_self" CHECK ("task_id" <> "depends_on_task_id");

ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "planning_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "planning_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_membership_id_fkey" FOREIGN KEY ("owner_membership_id") REFERENCES "workspace_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_related_task_id_fkey" FOREIGN KEY ("related_task_id") REFERENCES "planning_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_related_milestone_id_fkey" FOREIGN KEY ("related_milestone_id") REFERENCES "timeline_milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "plan_proposal_items" ADD CONSTRAINT "plan_proposal_items_effort_positive" CHECK ("estimated_effort_minutes" IS NULL OR "estimated_effort_minutes" > 0);
ALTER TABLE "planning_tasks" ADD CONSTRAINT "planning_tasks_effort_positive" CHECK ("estimated_effort_minutes" IS NULL OR "estimated_effort_minutes" > 0);
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_date_order" CHECK ("end_at" IS NULL OR "end_at" >= "start_at");
