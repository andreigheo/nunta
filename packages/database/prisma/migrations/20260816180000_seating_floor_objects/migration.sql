BEGIN;

CREATE TYPE "SeatingFloorObjectType" AS ENUM (
  'STAGE',
  'DANCE_FLOOR',
  'ENTRANCE',
  'BAR',
  'DJ_BOOTH',
  'PHOTO_BOOTH',
  'CUSTOM'
);

CREATE TABLE "seating_floor_objects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "seating_plan_id" UUID NOT NULL,
  "type" "SeatingFloorObjectType" NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "x" DECIMAL(12,3) NOT NULL,
  "y" DECIMAL(12,3) NOT NULL,
  "width" DECIMAL(12,3) NOT NULL,
  "height" DECIMAL(12,3) NOT NULL,
  "rotation" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "seating_floor_objects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "seating_floor_objects_workspace_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "seating_floor_objects_plan_fk"
    FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  CONSTRAINT "seating_floor_objects_dimensions_ck"
    CHECK ("width" > 0 AND "height" > 0)
);

CREATE INDEX "seating_floor_objects_workspace_id_seating_plan_id_deleted_idx"
  ON "seating_floor_objects"("workspace_id", "seating_plan_id", "deleted_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "seating_floor_objects" TO weddingos_app;
GRANT SELECT ON TABLE "seating_floor_objects" TO weddingos_worker;

ALTER TABLE "seating_floor_objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "seating_floor_objects" FORCE ROW LEVEL SECURITY;

CREATE POLICY "seating_floor_objects_organizer_policy"
  ON "seating_floor_objects"
  FOR ALL TO weddingos_app
  USING (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  )
  WITH CHECK (
    "workspace_id" = NULLIF(current_setting('app.current_workspace_id', true), '')::uuid
    AND public.weddingos_has_workspace_access("workspace_id")
  );

CREATE POLICY "seating_floor_objects_worker_policy"
  ON "seating_floor_objects"
  FOR SELECT TO weddingos_worker
  USING (
    public.weddingos_worker_execution_context_matches(
      NULL,
      NULL,
      NULL,
      "workspace_id",
      NULL
    )
  );

COMMIT;
