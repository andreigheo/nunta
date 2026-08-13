BEGIN;

CREATE TABLE "workspace_creative_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "concept_title" VARCHAR(180) NOT NULL DEFAULT '',
  "concept_description" TEXT NOT NULL DEFAULT '',
  "palette" JSONB NOT NULL DEFAULT '[]',
  "boards" JSONB NOT NULL DEFAULT '[]',
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "workspace_creative_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_creative_states_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "workspace_creative_states_version_positive" CHECK ("version" > 0),
  CONSTRAINT "workspace_creative_states_palette_array" CHECK (jsonb_typeof("palette") = 'array'),
  CONSTRAINT "workspace_creative_states_boards_array" CHECK (jsonb_typeof("boards") = 'array')
);

CREATE UNIQUE INDEX "workspace_creative_states_workspace_id_key"
  ON "workspace_creative_states"("workspace_id");
CREATE INDEX "workspace_creative_states_workspace_id_updated_at_idx"
  ON "workspace_creative_states"("workspace_id", "updated_at");

ALTER TABLE "workspace_creative_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_creative_states" FORCE ROW LEVEL SECURITY;

CREATE POLICY "workspace_creative_states_select" ON "workspace_creative_states"
FOR SELECT TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "workspace_creative_states_insert" ON "workspace_creative_states"
FOR INSERT TO weddingos_app
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "workspace_creative_states_update" ON "workspace_creative_states"
FOR UPDATE TO weddingos_app
USING (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
)
WITH CHECK (
  "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
  AND public.weddingos_has_workspace_access("workspace_id")
);

CREATE POLICY "workspace_creative_states_worker" ON "workspace_creative_states"
FOR ALL TO weddingos_worker USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON "workspace_creative_states" TO weddingos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "workspace_creative_states" TO weddingos_worker;

COMMIT;
