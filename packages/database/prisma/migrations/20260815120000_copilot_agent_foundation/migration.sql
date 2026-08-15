BEGIN;

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TYPE "CopilotMemoryScope" AS ENUM ('WORKSPACE', 'USER');
CREATE TYPE "CopilotMemoryKind" AS ENUM ('FACT', 'PREFERENCE', 'DECISION', 'CONSTRAINT', 'CONVERSATION_SUMMARY', 'DOCUMENT_NOTE', 'WEB_RESEARCH');
CREATE TYPE "CopilotMemorySourceType" AS ENUM ('USER_CONFIRMED', 'CANONICAL_RESOURCE', 'CONVERSATION', 'DOCUMENT', 'WEB', 'SYSTEM');
CREATE TYPE "CopilotMemorySensitivity" AS ENUM ('NORMAL', 'SENSITIVE', 'RESTRICTED');
CREATE TYPE "CopilotMemoryStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

CREATE TABLE "copilot_workspace_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "memory_enabled" BOOLEAN NOT NULL DEFAULT true,
  "web_research_enabled" BOOLEAN NOT NULL DEFAULT false,
  "proactive_suggestions" BOOLEAN NOT NULL DEFAULT true,
  "memory_retention_days" INTEGER NOT NULL DEFAULT 180,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "copilot_workspace_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_workspace_settings_retention_check" CHECK ("memory_retention_days" BETWEEN 30 AND 730),
  CONSTRAINT "copilot_workspace_settings_version_check" CHECK ("version" > 0),
  CONSTRAINT "copilot_workspace_settings_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_workspace_settings_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "copilot_workspace_settings_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "copilot_memories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "scope" "CopilotMemoryScope" NOT NULL DEFAULT 'WORKSPACE',
  "owner_user_id" UUID,
  "subject_type" VARCHAR(80),
  "subject_id" VARCHAR(160),
  "kind" "CopilotMemoryKind" NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "content" TEXT NOT NULL,
  "source_type" "CopilotMemorySourceType" NOT NULL,
  "source_id" VARCHAR(200),
  "confidence" DECIMAL(4,3) NOT NULL DEFAULT 1,
  "confirmed_by_user" BOOLEAN NOT NULL DEFAULT false,
  "sensitivity" "CopilotMemorySensitivity" NOT NULL DEFAULT 'NORMAL',
  "status" "CopilotMemoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "expires_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "use_count" INTEGER NOT NULL DEFAULT 0,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "copilot_memories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_memories_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_memories_owner_user_fk" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_memories_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "copilot_memories_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "copilot_memories_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  CONSTRAINT "copilot_memories_scope_owner_check" CHECK (("scope" = 'USER' AND "owner_user_id" IS NOT NULL) OR ("scope" = 'WORKSPACE' AND "owner_user_id" IS NULL)),
  CONSTRAINT "copilot_memories_sensitive_semantic_check" CHECK ("sensitivity" <> 'RESTRICTED'),
  CONSTRAINT "copilot_memories_version_check" CHECK ("version" > 0)
);

CREATE TABLE "copilot_memory_embeddings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "memory_id" UUID NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "dimensions" INTEGER NOT NULL DEFAULT 1536,
  "content_hash" CHAR(64) NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_memory_embeddings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_memory_embeddings_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_memory_embeddings_memory_fk" FOREIGN KEY ("memory_id") REFERENCES "copilot_memories"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_memory_embeddings_dimensions_check" CHECK ("dimensions" = 1536)
);

CREATE TABLE "copilot_tool_invocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "run_id" UUID,
  "tool_key" VARCHAR(160) NOT NULL,
  "operation" VARCHAR(40) NOT NULL,
  "required_capability" VARCHAR(120),
  "risk_level" "IntelligenceRiskLevel" NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'STARTED',
  "input" JSONB NOT NULL DEFAULT '{}',
  "output" JSONB NOT NULL DEFAULT '{}',
  "resource_type" VARCHAR(80),
  "resource_id" VARCHAR(160),
  "idempotency_key" VARCHAR(200),
  "error_code" VARCHAR(120),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_tool_invocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_tool_invocations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_tool_invocations_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "copilot_tool_invocations_run_fk" FOREIGN KEY ("run_id") REFERENCES "copilot_runs"("id") ON DELETE SET NULL
);

CREATE TABLE "copilot_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "summary" VARCHAR(2000) NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'READY_FOR_REVIEW',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_plans_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_plans_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_plans_run_fk" FOREIGN KEY ("run_id") REFERENCES "copilot_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_plans_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE TABLE "copilot_web_research" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "run_id" UUID,
  "query_hash" CHAR(64) NOT NULL,
  "query" VARCHAR(1000) NOT NULL,
  "answer" TEXT NOT NULL,
  "provider" VARCHAR(120) NOT NULL,
  "model" VARCHAR(120),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_web_research_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_web_research_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_web_research_run_fk" FOREIGN KEY ("run_id") REFERENCES "copilot_runs"("id") ON DELETE SET NULL
);

CREATE TABLE "copilot_web_citations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "research_id" UUID NOT NULL,
  "url" VARCHAR(2048) NOT NULL,
  "title" VARCHAR(300) NOT NULL,
  "excerpt" VARCHAR(1000) NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "copilot_web_citations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "copilot_web_citations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "copilot_web_citations_research_fk" FOREIGN KEY ("research_id") REFERENCES "copilot_web_research"("id") ON DELETE CASCADE
);

ALTER TABLE "copilot_proposals" ADD COLUMN "plan_id" UUID;
ALTER TABLE "copilot_proposals" ADD COLUMN "step_position" INTEGER;
ALTER TABLE "copilot_proposals" ADD CONSTRAINT "copilot_proposals_plan_fk" FOREIGN KEY ("plan_id") REFERENCES "copilot_plans"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX "copilot_workspace_settings_workspace_id_key" ON "copilot_workspace_settings"("workspace_id");
CREATE INDEX "copilot_memories_workspace_status_kind_updated_idx" ON "copilot_memories"("workspace_id", "status", "kind", "updated_at");
CREATE INDEX "copilot_memories_workspace_owner_status_updated_idx" ON "copilot_memories"("workspace_id", "owner_user_id", "status", "updated_at");
CREATE INDEX "copilot_memories_workspace_subject_idx" ON "copilot_memories"("workspace_id", "subject_type", "subject_id");
CREATE UNIQUE INDEX "copilot_memory_embeddings_memory_id_key" ON "copilot_memory_embeddings"("memory_id");
CREATE INDEX "copilot_memory_embeddings_workspace_updated_idx" ON "copilot_memory_embeddings"("workspace_id", "updated_at");
CREATE INDEX "copilot_memory_embeddings_hnsw_idx" ON "copilot_memory_embeddings" USING hnsw ("embedding" vector_cosine_ops);
CREATE UNIQUE INDEX "copilot_tool_invocations_workspace_idempotency_key_key" ON "copilot_tool_invocations"("workspace_id", "idempotency_key");
CREATE INDEX "copilot_tool_invocations_workspace_tool_created_idx" ON "copilot_tool_invocations"("workspace_id", "tool_key", "created_at");
CREATE INDEX "copilot_tool_invocations_workspace_run_created_idx" ON "copilot_tool_invocations"("workspace_id", "run_id", "created_at");
CREATE INDEX "copilot_plans_workspace_run_created_idx" ON "copilot_plans"("workspace_id", "run_id", "created_at");
CREATE INDEX "copilot_proposals_workspace_plan_step_idx" ON "copilot_proposals"("workspace_id", "plan_id", "step_position");
CREATE UNIQUE INDEX "copilot_web_research_run_id_key" ON "copilot_web_research"("run_id");
CREATE UNIQUE INDEX "copilot_web_research_workspace_query_hash_key" ON "copilot_web_research"("workspace_id", "query_hash");
CREATE INDEX "copilot_web_research_workspace_expires_idx" ON "copilot_web_research"("workspace_id", "expires_at");
CREATE UNIQUE INDEX "copilot_web_citations_research_url_key" ON "copilot_web_citations"("research_id", "url");
CREATE INDEX "copilot_web_citations_workspace_research_position_idx" ON "copilot_web_citations"("workspace_id", "research_id", "position");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "copilot_workspace_settings", "copilot_memories", "copilot_memory_embeddings", "copilot_tool_invocations", "copilot_plans", "copilot_web_research", "copilot_web_citations" TO weddingos_app, weddingos_worker;

ALTER TABLE "copilot_workspace_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_workspace_settings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "copilot_memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_memories" FORCE ROW LEVEL SECURITY;
ALTER TABLE "copilot_memory_embeddings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_memory_embeddings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "copilot_tool_invocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_tool_invocations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "copilot_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "copilot_web_research" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_web_research" FORCE ROW LEVEL SECURITY;
ALTER TABLE "copilot_web_citations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "copilot_web_citations" FORCE ROW LEVEL SECURITY;

CREATE POLICY "copilot_plans_workspace" ON "copilot_plans"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "copilot_web_research_workspace" ON "copilot_web_research"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "copilot_web_citations_workspace" ON "copilot_web_citations"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "copilot_workspace_settings_workspace" ON "copilot_workspace_settings"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "copilot_memories_visible" ON "copilot_memories"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND (
    "scope" = 'WORKSPACE'
    OR (
      "scope" = 'USER'
      AND "owner_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND (
    "scope" = 'WORKSPACE'
    OR (
      "scope" = 'USER'
      AND "owner_user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    )
  )
);

CREATE POLICY "copilot_memory_embeddings_visible" ON "copilot_memory_embeddings"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND EXISTS (
    SELECT 1 FROM "copilot_memories" memory
    WHERE memory."id" = "copilot_memory_embeddings"."memory_id"
  )
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND EXISTS (
    SELECT 1 FROM "copilot_memories" memory
    WHERE memory."id" = "copilot_memory_embeddings"."memory_id"
  )
);

CREATE POLICY "copilot_tool_invocations_actor" ON "copilot_tool_invocations"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

-- Conversations and their raw context are private to their creator. Proposals
-- remain workspace resources so authorized collaborators can review them.
DROP POLICY IF EXISTS "copilot_conversations_workspace" ON "copilot_conversations";
CREATE POLICY "copilot_conversations_actor" ON "copilot_conversations"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "created_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

DROP POLICY IF EXISTS "copilot_messages_workspace" ON "copilot_messages";
CREATE POLICY "copilot_messages_actor" ON "copilot_messages"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND EXISTS (
    SELECT 1 FROM "copilot_conversations" conversation
    WHERE conversation."id" = "copilot_messages"."conversation_id"
  )
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND EXISTS (
    SELECT 1 FROM "copilot_conversations" conversation
    WHERE conversation."id" = "copilot_messages"."conversation_id"
  )
);

DROP POLICY IF EXISTS "copilot_runs_workspace" ON "copilot_runs";
CREATE POLICY "copilot_runs_actor" ON "copilot_runs"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "requested_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "requested_by" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

DROP POLICY IF EXISTS "copilot_source_references_workspace" ON "copilot_source_references";
CREATE POLICY "copilot_source_references_actor" ON "copilot_source_references"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND EXISTS (
    SELECT 1 FROM "copilot_runs" run
    WHERE run."id" = "copilot_source_references"."run_id"
  )
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
  AND EXISTS (
    SELECT 1 FROM "copilot_runs" run
    WHERE run."id" = "copilot_source_references"."run_id"
  )
);

DROP POLICY IF EXISTS "copilot_feedback_workspace" ON "copilot_feedback";
CREATE POLICY "copilot_feedback_actor" ON "copilot_feedback"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

DROP POLICY IF EXISTS "copilot_usage_records_workspace" ON "copilot_usage_records";
CREATE POLICY "copilot_usage_records_actor" ON "copilot_usage_records"
FOR ALL TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['copilot_workspace_settings','copilot_memories','copilot_memory_embeddings','copilot_tool_invocations','copilot_plans','copilot_web_research','copilot_web_citations'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL, NULL))',
      table_name || '_worker', table_name
    );
  END LOOP;
END $$;

-- The Copilot worker may include authorized shortlist summaries in context.
-- It receives read-only access and remains constrained to the persisted
-- workspace execution context; mutations still go through the API adapter.
GRANT SELECT ON TABLE "vendor_shortlists" TO weddingos_worker;
DROP POLICY IF EXISTS "vendor_shortlists_copilot_worker" ON "vendor_shortlists";
CREATE POLICY "vendor_shortlists_copilot_worker" ON "vendor_shortlists"
FOR SELECT TO weddingos_worker
USING (
  public.weddingos_worker_execution_context_matches(
    NULL,
    NULL,
    NULL,
    "workspace_id",
    NULL,
    NULL
  )
);

COMMIT;
