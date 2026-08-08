-- CreateEnum
CREATE TYPE "CopilotConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CopilotMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CopilotRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CopilotProposalStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "IntelligenceRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MONITORING', 'MITIGATING', 'RESOLVED', 'ACCEPTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('SCHEDULE', 'VENDOR', 'BUDGET', 'GUEST', 'LOGISTICS', 'WEATHER', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ContingencyPlanStatus" AS ENUM ('DRAFT', 'READY', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

-- CreateTable
CREATE TABLE "copilot_conversations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "surface" VARCHAR(80) NOT NULL DEFAULT 'general',
    "status" "CopilotConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_messages" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "author_user_id" UUID,
    "role" "CopilotMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'READY',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_message_id" UUID NOT NULL,
    "assistant_message_id" UUID,
    "requested_by" UUID NOT NULL,
    "background_job_id" UUID NOT NULL,
    "status" "CopilotRunStatus" NOT NULL DEFAULT 'QUEUED',
    "requested_mode" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(120),
    "model" VARCHAR(120),
    "policy_version" VARCHAR(80) NOT NULL,
    "context_hash" CHAR(64),
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "error_code" VARCHAR(120),
    "error_redacted" VARCHAR(1000),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_source_references" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID NOT NULL,
    "excerpt" VARCHAR(1000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_source_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_feedback" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_proposals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "status" "CopilotProposalStatus" NOT NULL DEFAULT 'READY_FOR_REVIEW',
    "risk_level" "IntelligenceRiskLevel" NOT NULL,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_proposal_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_proposal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_proposal_actions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "action_type" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "risk_level" "IntelligenceRiskLevel" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_proposal_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_approvals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "decision" VARCHAR(40) NOT NULL,
    "reason" VARCHAR(2000),
    "proposal_version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_executions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'RUNNING',
    "result" JSONB NOT NULL DEFAULT '{}',
    "error_redacted" VARCHAR(1000),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copilot_usage_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "provider" VARCHAR(120) NOT NULL,
    "model" VARCHAR(120),
    "input_units" INTEGER NOT NULL,
    "output_units" INTEGER NOT NULL,
    "estimated_cost_minor" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "copilot_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_text_extractions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "extractor_version" VARCHAR(80) NOT NULL,
    "content_hash" CHAR(64),
    "error_redacted" VARCHAR(1000),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_text_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_text_chunks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "extraction_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "token_estimate" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_text_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_detection_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "background_job_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    "rules_version" VARCHAR(80) NOT NULL,
    "detected_count" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_detection_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(4000),
    "category" "RiskCategory" NOT NULL,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "level" "IntelligenceRiskLevel" NOT NULL,
    "owner_membership_id" UUID,
    "due_at" TIMESTAMP(3),
    "source" VARCHAR(40) NOT NULL,
    "source_type" VARCHAR(80),
    "source_id" UUID,
    "dedupe_key" VARCHAR(240),
    "resolution_note" VARCHAR(2000),
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolved_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_signals" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "risk_id" UUID NOT NULL,
    "signal_type" VARCHAR(80) NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" UUID NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "risk_id" UUID NOT NULL,
    "probability" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "level" "IntelligenceRiskLevel" NOT NULL,
    "reason" VARCHAR(2000),
    "assessed_by" UUID,
    "rules_version" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_mitigation_actions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "risk_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "owner_membership_id" UUID,
    "due_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_mitigation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_updates" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "risk_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "before" JSONB NOT NULL DEFAULT '{}',
    "after" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "risk_id" UUID,
    "title" VARCHAR(180) NOT NULL,
    "summary" VARCHAR(4000),
    "status" "ContingencyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "active_version_id" UUID,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contingency_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_plan_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingency_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_triggers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "trigger_type" VARCHAR(80) NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingency_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_actions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingency_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_activations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "activated_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingency_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_simulations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "background_job_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contingency_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger_type" VARCHAR(80) NOT NULL,
    "trigger_configuration" JSONB NOT NULL DEFAULT '{}',
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "dsl_version" VARCHAR(80) NOT NULL,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "last_executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_conditions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "field" VARCHAR(80) NOT NULL,
    "operator" VARCHAR(20) NOT NULL,
    "value" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_actions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "action_type" VARCHAR(80) NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "background_job_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "status" "AutomationExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "source_event_id" UUID,
    "recursion_depth" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB NOT NULL DEFAULT '{}',
    "error_redacted" VARCHAR(1000),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_execution_steps" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupe_key" VARCHAR(240) NOT NULL,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" JSONB NOT NULL DEFAULT '{}',
    "error_redacted" VARCHAR(1000),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "definition" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copilot_conversations_workspace_id_created_by_updated_at_idx" ON "copilot_conversations"("workspace_id", "created_by", "updated_at");

-- CreateIndex
CREATE INDEX "copilot_messages_workspace_id_conversation_id_created_at_idx" ON "copilot_messages"("workspace_id", "conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_runs_user_message_id_key" ON "copilot_runs"("user_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_runs_assistant_message_id_key" ON "copilot_runs"("assistant_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_runs_background_job_id_key" ON "copilot_runs"("background_job_id");

-- CreateIndex
CREATE INDEX "copilot_runs_workspace_id_conversation_id_created_at_idx" ON "copilot_runs"("workspace_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "copilot_source_references_workspace_id_run_id_position_idx" ON "copilot_source_references"("workspace_id", "run_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_source_references_run_id_resource_type_resource_id_key" ON "copilot_source_references"("run_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "copilot_feedback_workspace_id_created_at_idx" ON "copilot_feedback"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_feedback_message_id_user_id_key" ON "copilot_feedback"("message_id", "user_id");

-- CreateIndex
CREATE INDEX "copilot_proposals_workspace_id_status_created_at_idx" ON "copilot_proposals"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "copilot_proposal_versions_workspace_id_proposal_id_idx" ON "copilot_proposal_versions"("workspace_id", "proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_proposal_versions_proposal_id_version_key" ON "copilot_proposal_versions"("proposal_id", "version");

-- CreateIndex
CREATE INDEX "copilot_proposal_actions_workspace_id_proposal_id_position_idx" ON "copilot_proposal_actions"("workspace_id", "proposal_id", "position");

-- CreateIndex
CREATE INDEX "copilot_approvals_workspace_id_created_at_idx" ON "copilot_approvals"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_approvals_proposal_id_proposal_version_key" ON "copilot_approvals"("proposal_id", "proposal_version");

-- CreateIndex
CREATE INDEX "copilot_executions_workspace_id_proposal_id_idx" ON "copilot_executions"("workspace_id", "proposal_id");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_executions_workspace_id_idempotency_key_key" ON "copilot_executions"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "copilot_usage_records_run_id_key" ON "copilot_usage_records"("run_id");

-- CreateIndex
CREATE INDEX "copilot_usage_records_workspace_id_created_at_idx" ON "copilot_usage_records"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "document_text_extractions_workspace_id_status_idx" ON "document_text_extractions"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_text_extractions_document_version_id_extractor_ver_key" ON "document_text_extractions"("document_version_id", "extractor_version");

-- CreateIndex
CREATE INDEX "document_text_chunks_workspace_id_extraction_id_idx" ON "document_text_chunks"("workspace_id", "extraction_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_text_chunks_extraction_id_chunk_index_key" ON "document_text_chunks"("extraction_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "risk_detection_runs_background_job_id_key" ON "risk_detection_runs"("background_job_id");

-- CreateIndex
CREATE INDEX "risk_detection_runs_workspace_id_created_at_idx" ON "risk_detection_runs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "risks_workspace_id_status_level_due_at_idx" ON "risks"("workspace_id", "status", "level", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "risks_workspace_id_dedupe_key_key" ON "risks"("workspace_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "risk_signals_workspace_id_risk_id_idx" ON "risk_signals"("workspace_id", "risk_id");

-- CreateIndex
CREATE UNIQUE INDEX "risk_signals_risk_id_signal_type_source_type_source_id_key" ON "risk_signals"("risk_id", "signal_type", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "risk_assessments_workspace_id_risk_id_created_at_idx" ON "risk_assessments"("workspace_id", "risk_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_mitigation_actions_workspace_id_risk_id_status_idx" ON "risk_mitigation_actions"("workspace_id", "risk_id", "status");

-- CreateIndex
CREATE INDEX "risk_updates_workspace_id_risk_id_created_at_idx" ON "risk_updates"("workspace_id", "risk_id", "created_at");

-- CreateIndex
CREATE INDEX "contingency_plans_workspace_id_status_created_at_idx" ON "contingency_plans"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "contingency_plan_versions_workspace_id_plan_id_idx" ON "contingency_plan_versions"("workspace_id", "plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "contingency_plan_versions_plan_id_version_key" ON "contingency_plan_versions"("plan_id", "version");

-- CreateIndex
CREATE INDEX "contingency_triggers_workspace_id_plan_id_idx" ON "contingency_triggers"("workspace_id", "plan_id");

-- CreateIndex
CREATE INDEX "contingency_actions_workspace_id_plan_id_position_idx" ON "contingency_actions"("workspace_id", "plan_id", "position");

-- CreateIndex
CREATE INDEX "contingency_activations_workspace_id_plan_id_created_at_idx" ON "contingency_activations"("workspace_id", "plan_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contingency_activations_workspace_id_idempotency_key_key" ON "contingency_activations"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "contingency_simulations_background_job_id_key" ON "contingency_simulations"("background_job_id");

-- CreateIndex
CREATE INDEX "contingency_simulations_workspace_id_plan_id_created_at_idx" ON "contingency_simulations"("workspace_id", "plan_id", "created_at");

-- CreateIndex
CREATE INDEX "automation_rules_workspace_id_status_created_at_idx" ON "automation_rules"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "automation_conditions_workspace_id_rule_id_position_idx" ON "automation_conditions"("workspace_id", "rule_id", "position");

-- CreateIndex
CREATE INDEX "automation_actions_workspace_id_rule_id_position_idx" ON "automation_actions"("workspace_id", "rule_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_background_job_id_key" ON "automation_executions"("background_job_id");

-- CreateIndex
CREATE INDEX "automation_executions_workspace_id_rule_id_status_created_a_idx" ON "automation_executions"("workspace_id", "rule_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "automation_executions_workspace_id_idempotency_key_key" ON "automation_executions"("workspace_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "automation_execution_steps_dedupe_key_key" ON "automation_execution_steps"("dedupe_key");

-- CreateIndex
CREATE INDEX "automation_execution_steps_workspace_id_execution_id_status_idx" ON "automation_execution_steps"("workspace_id", "execution_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_templates_key_key" ON "automation_templates"("key");

-- Domain integrity: all mutable intelligence records stay tenant-owned and linked.
ALTER TABLE "copilot_conversations" ADD CONSTRAINT "copilot_conversations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_messages" ADD CONSTRAINT "copilot_messages_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "copilot_conversations"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_runs" ADD CONSTRAINT "copilot_runs_conversation_fk" FOREIGN KEY ("conversation_id") REFERENCES "copilot_conversations"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_runs" ADD CONSTRAINT "copilot_runs_job_fk" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE RESTRICT;
ALTER TABLE "copilot_source_references" ADD CONSTRAINT "copilot_source_run_fk" FOREIGN KEY ("run_id") REFERENCES "copilot_runs"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_feedback" ADD CONSTRAINT "copilot_feedback_message_fk" FOREIGN KEY ("message_id") REFERENCES "copilot_messages"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_proposals" ADD CONSTRAINT "copilot_proposal_run_fk" FOREIGN KEY ("run_id") REFERENCES "copilot_runs"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_proposal_versions" ADD CONSTRAINT "copilot_proposal_version_fk" FOREIGN KEY ("proposal_id") REFERENCES "copilot_proposals"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_proposal_actions" ADD CONSTRAINT "copilot_proposal_action_fk" FOREIGN KEY ("proposal_id") REFERENCES "copilot_proposals"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_approvals" ADD CONSTRAINT "copilot_approval_proposal_fk" FOREIGN KEY ("proposal_id") REFERENCES "copilot_proposals"("id") ON DELETE CASCADE;
ALTER TABLE "copilot_executions" ADD CONSTRAINT "copilot_execution_proposal_fk" FOREIGN KEY ("proposal_id") REFERENCES "copilot_proposals"("id") ON DELETE RESTRICT;
ALTER TABLE "copilot_usage_records" ADD CONSTRAINT "copilot_usage_run_fk" FOREIGN KEY ("run_id") REFERENCES "copilot_runs"("id") ON DELETE CASCADE;
ALTER TABLE "document_text_chunks" ADD CONSTRAINT "document_text_chunk_extraction_fk" FOREIGN KEY ("extraction_id") REFERENCES "document_text_extractions"("id") ON DELETE CASCADE;
ALTER TABLE "risk_detection_runs" ADD CONSTRAINT "risk_detection_job_fk" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE RESTRICT;
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signal_risk_fk" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE;
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessment_risk_fk" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE;
ALTER TABLE "risk_mitigation_actions" ADD CONSTRAINT "risk_mitigation_risk_fk" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE;
ALTER TABLE "risk_updates" ADD CONSTRAINT "risk_update_risk_fk" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE;
ALTER TABLE "contingency_plans" ADD CONSTRAINT "contingency_plan_risk_fk" FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE SET NULL;
ALTER TABLE "contingency_plan_versions" ADD CONSTRAINT "contingency_version_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "contingency_plans"("id") ON DELETE CASCADE;
ALTER TABLE "contingency_triggers" ADD CONSTRAINT "contingency_trigger_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "contingency_plans"("id") ON DELETE CASCADE;
ALTER TABLE "contingency_actions" ADD CONSTRAINT "contingency_action_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "contingency_plans"("id") ON DELETE CASCADE;
ALTER TABLE "contingency_activations" ADD CONSTRAINT "contingency_activation_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "contingency_plans"("id") ON DELETE RESTRICT;
ALTER TABLE "contingency_simulations" ADD CONSTRAINT "contingency_simulation_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "contingency_plans"("id") ON DELETE CASCADE;
ALTER TABLE "contingency_simulations" ADD CONSTRAINT "contingency_simulation_job_fk" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE RESTRICT;
ALTER TABLE "automation_conditions" ADD CONSTRAINT "automation_condition_rule_fk" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE;
ALTER TABLE "automation_actions" ADD CONSTRAINT "automation_action_rule_fk" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE CASCADE;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_execution_rule_fk" FOREIGN KEY ("rule_id") REFERENCES "automation_rules"("id") ON DELETE RESTRICT;
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_execution_job_fk" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE RESTRICT;
ALTER TABLE "automation_execution_steps" ADD CONSTRAINT "automation_step_execution_fk" FOREIGN KEY ("execution_id") REFERENCES "automation_executions"("id") ON DELETE CASCADE;
ALTER TABLE "automation_execution_steps" ADD CONSTRAINT "automation_step_action_fk" FOREIGN KEY ("action_id") REFERENCES "automation_actions"("id") ON DELETE RESTRICT;

ALTER TABLE "risks" ADD CONSTRAINT "risks_probability_range" CHECK ("probability" BETWEEN 1 AND 5);
ALTER TABLE "risks" ADD CONSTRAINT "risks_impact_range" CHECK ("impact" BETWEEN 1 AND 5);
ALTER TABLE "risks" ADD CONSTRAINT "risks_score_consistent" CHECK ("score" = "probability" * "impact");
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessment_probability_range" CHECK ("probability" BETWEEN 1 AND 5);
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessment_impact_range" CHECK ("impact" BETWEEN 1 AND 5);
ALTER TABLE "automation_executions" ADD CONSTRAINT "automation_recursion_limit" CHECK ("recursion_depth" BETWEEN 0 AND 3);

INSERT INTO "automation_templates" ("id", "key", "name", "description", "definition", "updated_at") VALUES
(gen_random_uuid(), 'overdue-task-risk', 'Risc pentru task întârziat', 'Propune un risc când un task urgent este întârziat.', '{"triggerType":"TASK_OVERDUE","conditions":[{"field":"priority","operator":"in","value":["HIGH","URGENT"]}],"actions":[{"type":"CREATE_RISK","position":0}],"requiresApproval":true}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'milestone-reminder', 'Atenționare milestone', 'Creează o notificare internă înainte de un milestone.', '{"triggerType":"MILESTONE_APPROACHING","conditions":[],"actions":[{"type":"CREATE_NOTIFICATION","position":0}],"requiresApproval":false}'::jsonb, CURRENT_TIMESTAMP),
(gen_random_uuid(), 'critical-risk-task', 'Task pentru risc critic', 'Propune un task de mitigare când un risc devine critic.', '{"triggerType":"RISK_LEVEL_CHANGED","conditions":[{"field":"riskLevel","operator":"eq","value":"CRITICAL"}],"actions":[{"type":"CREATE_TASK","position":0}],"requiresApproval":true}'::jsonb, CURRENT_TIMESTAMP);
