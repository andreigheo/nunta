BEGIN;

-- CreateTable
CREATE TABLE "platform_roles" (
    "id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "capabilities" JSONB NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_verified_at" TIMESTAMP(3),
    "granted_by" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_actions" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "capability" VARCHAR(120) NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "target_type" VARCHAR(80) NOT NULL,
    "target_id" VARCHAR(160),
    "environment" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "before_redacted" JSONB,
    "after_redacted" JSONB,
    "outcome" VARCHAR(30) NOT NULL,
    "request_id" VARCHAR(120),
    "correlation_id" VARCHAR(120),
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_support_cases" (
    "id" UUID NOT NULL,
    "requester_user_id" UUID,
    "assigned_user_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    "subject" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_support_notes" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_support_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_incidents" (
    "id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "summary" VARCHAR(4000) NOT NULL,
    "severity" VARCHAR(12) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DETECTED',
    "affected_services" JSONB NOT NULL DEFAULT '[]',
    "owner_user_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_feature_flags" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "value_type" VARCHAR(20) NOT NULL,
    "default_value" JSONB NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "kill_switch" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "reason" VARCHAR(1000) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_maintenance_windows" (
    "id" UUID NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "scope" VARCHAR(80) NOT NULL,
    "scope_key" VARCHAR(120),
    "status" VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
    "message" VARCHAR(1000) NOT NULL,
    "support_url" VARCHAR(2048),
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version" VARCHAR(40) NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "effective_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" VARCHAR(80) NOT NULL,
    "processing_basis" VARCHAR(30) NOT NULL,
    "legal_document_version_id" UUID,
    "status" VARCHAR(24) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_withdrawals" (
    "id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookie_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_id" VARCHAR(120),
    "essential" BOOLEAN NOT NULL DEFAULT true,
    "preferences" BOOLEAN NOT NULL DEFAULT false,
    "analytics" BOOLEAN NOT NULL DEFAULT false,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(40) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cookie_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'SUBMITTED',
    "scope_type" VARCHAR(30) NOT NULL,
    "scope_id" UUID,
    "details" VARCHAR(4000),
    "verification" JSONB NOT NULL DEFAULT '{}',
    "impact" JSONB NOT NULL DEFAULT '{}',
    "artifact_id" UUID,
    "assigned_user_id" UUID,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "rejection_reason" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" UUID NOT NULL,
    "requester_user_id" UUID NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(2000) NOT NULL,
    "impact" JSONB NOT NULL DEFAULT '{}',
    "plan" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "tombstone" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_retention_policies" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "status_filter" JSONB NOT NULL DEFAULT '[]',
    "retention_days" INTEGER NOT NULL,
    "archive_days" INTEGER,
    "purge_behavior" VARCHAR(40) NOT NULL,
    "legal_basis" VARCHAR(80) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_holds" (
    "id" UUID NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    "reason" VARCHAR(2000) NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "released_by" UUID,
    "release_reason" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_executions" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "mode" VARCHAR(20) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
    "cursor" VARCHAR(500),
    "scanned_count" INTEGER NOT NULL DEFAULT 0,
    "archived_count" INTEGER NOT NULL DEFAULT 0,
    "purged_count" INTEGER NOT NULL DEFAULT 0,
    "held_count" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "error_redacted" VARCHAR(1000),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "actor_hash" CHAR(64),
    "target_type" VARCHAR(80),
    "target_hash" CHAR(64),
    "context_redacted" JSONB NOT NULL DEFAULT '{}',
    "correlation_id" VARCHAR(120),
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_alerts" (
    "id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
    "dedupe_key" VARCHAR(200) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "summary" VARCHAR(2000) NOT NULL,
    "runbook_url" VARCHAR(2048),
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    "requested_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "backup_type" VARCHAR(30) NOT NULL,
    "migration_name" VARCHAR(200),
    "database_version" VARCHAR(120),
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "error_redacted" VARCHAR(1000),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_artifacts" (
    "id" UUID NOT NULL,
    "backup_run_id" UUID NOT NULL,
    "kind" VARCHAR(40) NOT NULL,
    "storage_key" VARCHAR(1000) NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "encryption_key_id" VARCHAR(120) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_verifications" (
    "id" UUID NOT NULL,
    "backup_run_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "checks" JSONB NOT NULL,
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restore_runs" (
    "id" UUID NOT NULL,
    "backup_run_id" UUID NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "target" VARCHAR(200) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "reason" VARCHAR(2000) NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "error_redacted" VARCHAR(1000),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restore_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restore_validations" (
    "id" UUID NOT NULL,
    "restore_run_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "checks" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restore_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_candidates" (
    "id" UUID NOT NULL,
    "release_id" VARCHAR(120) NOT NULL,
    "environment" VARCHAR(24) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
    "provenance_status" VARCHAR(30) NOT NULL,
    "commit_sha" VARCHAR(80),
    "build_timestamp" TIMESTAMP(3) NOT NULL,
    "node_version" VARCHAR(40) NOT NULL,
    "pnpm_version" VARCHAR(40) NOT NULL,
    "migrations" JSONB NOT NULL,
    "checksums" JSONB NOT NULL,
    "test_evidence" JSONB NOT NULL,
    "security_scans" JSONB NOT NULL,
    "backup_verification_id" UUID,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "release_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "release_approvals" (
    "id" UUID NOT NULL,
    "release_candidate_id" UUID NOT NULL,
    "approver_user_id" UUID NOT NULL,
    "decision" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_roles_key_key" ON "platform_roles"("key");

-- CreateIndex
CREATE INDEX "platform_grants_user_id_environment_active_idx" ON "platform_grants"("user_id", "environment", "active");

-- CreateIndex
CREATE UNIQUE INDEX "platform_grants_user_id_role_id_environment_key" ON "platform_grants"("user_id", "role_id", "environment");

-- CreateIndex
CREATE INDEX "platform_admin_actions_actor_user_id_created_at_idx" ON "platform_admin_actions"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_admin_actions_target_type_target_id_created_at_idx" ON "platform_admin_actions"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_support_cases_status_priority_created_at_idx" ON "platform_support_cases"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "platform_support_cases_requester_user_id_created_at_idx" ON "platform_support_cases"("requester_user_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_support_notes_case_id_created_at_idx" ON "platform_support_notes"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_incidents_status_severity_started_at_idx" ON "platform_incidents"("status", "severity", "started_at");

-- CreateIndex
CREATE INDEX "platform_feature_flags_environment_kill_switch_idx" ON "platform_feature_flags"("environment", "kill_switch");

-- CreateIndex
CREATE UNIQUE INDEX "platform_feature_flags_key_environment_key" ON "platform_feature_flags"("key", "environment");

-- CreateIndex
CREATE INDEX "platform_maintenance_windows_environment_status_starts_at_idx" ON "platform_maintenance_windows"("environment", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_key_key" ON "legal_documents"("key");

-- CreateIndex
CREATE INDEX "legal_document_versions_document_id_language_status_effecti_idx" ON "legal_document_versions"("document_id", "language", "status", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_document_id_version_language_key" ON "legal_document_versions"("document_id", "version", "language");

-- CreateIndex
CREATE INDEX "user_consent_records_user_id_purpose_occurred_at_idx" ON "user_consent_records"("user_id", "purpose", "occurred_at");

-- CreateIndex
CREATE INDEX "consent_withdrawals_user_id_occurred_at_idx" ON "consent_withdrawals"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "consent_withdrawals_consent_id_key" ON "consent_withdrawals"("consent_id");

-- CreateIndex
CREATE UNIQUE INDEX "cookie_preferences_user_id_key" ON "cookie_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cookie_preferences_anonymous_id_key" ON "cookie_preferences"("anonymous_id");

-- CreateIndex
CREATE INDEX "data_subject_requests_requester_user_id_status_created_at_idx" ON "data_subject_requests"("requester_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_due_at_idx" ON "data_subject_requests"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "data_subject_requests_requester_user_id_idempotency_key_key" ON "data_subject_requests"("requester_user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "deletion_requests_target_type_target_id_status_idx" ON "deletion_requests"("target_type", "target_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deletion_requests_requester_user_id_idempotency_key_key" ON "deletion_requests"("requester_user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "data_retention_policies_environment_active_entity_type_idx" ON "data_retention_policies"("environment", "active", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_key_environment_version_key" ON "data_retention_policies"("key", "environment", "version");

-- CreateIndex
CREATE INDEX "legal_holds_target_type_target_id_status_idx" ON "legal_holds"("target_type", "target_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "retention_executions_idempotency_key_key" ON "retention_executions"("idempotency_key");

-- CreateIndex
CREATE INDEX "retention_executions_status_created_at_idx" ON "retention_executions"("status", "created_at");

-- CreateIndex
CREATE INDEX "security_events_type_occurred_at_idx" ON "security_events"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "security_events_dedupe_key_occurred_at_idx" ON "security_events"("dedupe_key", "occurred_at");

-- CreateIndex
CREATE INDEX "security_alerts_status_severity_last_seen_at_idx" ON "security_alerts"("status", "severity", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "security_alerts_dedupe_key_status_key" ON "security_alerts"("dedupe_key", "status");

-- CreateIndex
CREATE INDEX "backup_runs_environment_status_created_at_idx" ON "backup_runs"("environment", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "backup_runs_environment_idempotency_key_key" ON "backup_runs"("environment", "idempotency_key");

-- CreateIndex
CREATE INDEX "backup_artifacts_backup_run_id_kind_idx" ON "backup_artifacts"("backup_run_id", "kind");

-- CreateIndex
CREATE INDEX "backup_verifications_backup_run_id_verified_at_idx" ON "backup_verifications"("backup_run_id", "verified_at");

-- CreateIndex
CREATE INDEX "restore_runs_environment_status_created_at_idx" ON "restore_runs"("environment", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "restore_runs_environment_idempotency_key_key" ON "restore_runs"("environment", "idempotency_key");

-- CreateIndex
CREATE INDEX "restore_validations_restore_run_id_created_at_idx" ON "restore_validations"("restore_run_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "release_candidates_release_id_key" ON "release_candidates"("release_id");

-- CreateIndex
CREATE INDEX "release_candidates_environment_status_created_at_idx" ON "release_candidates"("environment", "status", "created_at");

-- CreateIndex
CREATE INDEX "release_approvals_release_candidate_id_created_at_idx" ON "release_approvals"("release_candidate_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "release_approvals_release_candidate_id_approver_user_id_key" ON "release_approvals"("release_candidate_id", "approver_user_id");

COMMIT;

