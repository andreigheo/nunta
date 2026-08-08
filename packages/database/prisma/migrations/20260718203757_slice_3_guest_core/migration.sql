-- CreateEnum
CREATE TYPE "WeddingEventType" AS ENUM ('CIVIL_CEREMONY', 'RELIGIOUS_CEREMONY', 'RECEPTION', 'WELCOME_DINNER', 'BRUNCH', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WeddingEventStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GuestSide" AS ENUM ('PARTNER_ONE', 'PARTNER_TWO', 'COMMON', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "GuestStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'REMOVED');

-- CreateEnum
CREATE TYPE "GuestRelationshipType" AS ENUM ('PARTNER', 'PARENT', 'CHILD', 'PLUS_ONE', 'OTHER');

-- CreateEnum
CREATE TYPE "GuestImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'READY_FOR_MAPPING', 'READY_FOR_REVIEW', 'COMMITTING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GuestImportDecision" AS ENUM ('CREATE_NEW', 'MERGE_WITH_EXISTING', 'SKIP');

-- CreateTable
CREATE TABLE "wedding_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "type" "WeddingEventType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "timezone" VARCHAR(80) NOT NULL,
    "location_name" VARCHAR(240),
    "location_address" VARCHAR(500),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "dress_code" VARCHAR(240),
    "guest_visible" BOOLEAN NOT NULL DEFAULT true,
    "rsvp_enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "WeddingEventStatus" NOT NULL DEFAULT 'DRAFT',
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
    "source_key" VARCHAR(160),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "wedding_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "primary_guest_id" UUID,
    "preferred_language" VARCHAR(16) NOT NULL DEFAULT 'ro',
    "city" VARCHAR(120),
    "country" VARCHAR(120),
    "address" VARCHAR(500),
    "category" VARCHAR(80),
    "side" "GuestSide" NOT NULL DEFAULT 'COMMON',
    "notes_private_encrypted" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(220),
    "email_normalized" VARCHAR(320),
    "phone_e164" VARCHAR(32),
    "preferred_language" VARCHAR(16) NOT NULL DEFAULT 'ro',
    "relationship" VARCHAR(80),
    "side" "GuestSide" NOT NULL DEFAULT 'COMMON',
    "category" VARCHAR(80),
    "is_child" BOOLEAN NOT NULL DEFAULT false,
    "date_of_birth" DATE,
    "is_plus_one" BOOLEAN NOT NULL DEFAULT false,
    "primary_guest_id" UUID,
    "plus_one_allowed" BOOLEAN NOT NULL DEFAULT false,
    "accessibility_notes_encrypted" TEXT,
    "needs_transport" BOOLEAN NOT NULL DEFAULT false,
    "needs_accommodation" BOOLEAN NOT NULL DEFAULT false,
    "notes_private_encrypted" TEXT,
    "status" "GuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_relationships" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "from_guest_id" UUID NOT NULL,
    "to_guest_id" UUID NOT NULL,
    "type" "GuestRelationshipType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_tags" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "color" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_tag_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_tag_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_contact_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "household_id" UUID,
    "channel" VARCHAR(40) NOT NULL,
    "direction" VARCHAR(40) NOT NULL,
    "campaign_id" UUID,
    "summary_redacted" VARCHAR(500) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source_event_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_contact_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_imports" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "background_job_id" UUID,
    "source_file_name" VARCHAR(255) NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "media_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "status" "GuestImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "committed_rows" INTEGER NOT NULL DEFAULT 0,
    "error_artifact_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_import_rows" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data_redacted" JSONB NOT NULL,
    "normalized_data" JSONB NOT NULL,
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "duplicate_guest_id" UUID,
    "duplicate_household_id" UUID,
    "decision" "GuestImportDecision",
    "result_guest_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wedding_events_workspace_id_status_position_idx" ON "wedding_events"("workspace_id", "status", "position");

-- CreateIndex
CREATE INDEX "wedding_events_workspace_id_start_at_idx" ON "wedding_events"("workspace_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_events_workspace_id_source_key_key" ON "wedding_events"("workspace_id", "source_key");

-- CreateIndex
CREATE INDEX "households_workspace_id_deleted_at_name_idx" ON "households"("workspace_id", "deleted_at", "name");

-- CreateIndex
CREATE INDEX "households_workspace_id_side_idx" ON "households"("workspace_id", "side");

-- CreateIndex
CREATE INDEX "guests_workspace_id_household_id_status_idx" ON "guests"("workspace_id", "household_id", "status");

-- CreateIndex
CREATE INDEX "guests_workspace_id_email_normalized_idx" ON "guests"("workspace_id", "email_normalized");

-- CreateIndex
CREATE INDEX "guests_workspace_id_phone_e164_idx" ON "guests"("workspace_id", "phone_e164");

-- CreateIndex
CREATE INDEX "guests_workspace_id_last_name_first_name_idx" ON "guests"("workspace_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "guests_workspace_id_primary_guest_id_is_plus_one_key" ON "guests"("workspace_id", "primary_guest_id", "is_plus_one");

-- CreateIndex
CREATE INDEX "guest_relationships_workspace_id_from_guest_id_idx" ON "guest_relationships"("workspace_id", "from_guest_id");

-- CreateIndex
CREATE INDEX "guest_relationships_workspace_id_to_guest_id_idx" ON "guest_relationships"("workspace_id", "to_guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_relationships_from_guest_id_to_guest_id_type_key" ON "guest_relationships"("from_guest_id", "to_guest_id", "type");

-- CreateIndex
CREATE INDEX "guest_tags_workspace_id_idx" ON "guest_tags"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_tags_workspace_id_name_key" ON "guest_tags"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "guest_tag_assignments_workspace_id_tag_id_idx" ON "guest_tag_assignments"("workspace_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_tag_assignments_guest_id_tag_id_key" ON "guest_tag_assignments"("guest_id", "tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_contact_logs_source_event_id_key" ON "guest_contact_logs"("source_event_id");

-- CreateIndex
CREATE INDEX "guest_contact_logs_workspace_id_guest_id_occurred_at_idx" ON "guest_contact_logs"("workspace_id", "guest_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "guest_imports_background_job_id_key" ON "guest_imports"("background_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_imports_storage_key_key" ON "guest_imports"("storage_key");

-- CreateIndex
CREATE INDEX "guest_imports_workspace_id_status_created_at_idx" ON "guest_imports"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "guest_imports_status_expires_at_idx" ON "guest_imports"("status", "expires_at");

-- CreateIndex
CREATE INDEX "guest_import_rows_workspace_id_import_id_row_number_idx" ON "guest_import_rows"("workspace_id", "import_id", "row_number");

-- Referential and domain integrity (kept explicit because tenant relations are
-- intentionally queried through scoped repositories rather than Prisma joins).
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "households" ADD CONSTRAINT "households_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guests" ADD CONSTRAINT "guests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guests" ADD CONSTRAINT "guests_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guests" ADD CONSTRAINT "guests_primary_guest_id_fkey" FOREIGN KEY ("primary_guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "households" ADD CONSTRAINT "households_primary_guest_id_fkey" FOREIGN KEY ("primary_guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_relationships" ADD CONSTRAINT "guest_relationships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_relationships" ADD CONSTRAINT "guest_relationships_from_guest_id_fkey" FOREIGN KEY ("from_guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_relationships" ADD CONSTRAINT "guest_relationships_to_guest_id_fkey" FOREIGN KEY ("to_guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_relationships" ADD CONSTRAINT "guest_relationships_no_self" CHECK ("from_guest_id" <> "to_guest_id");
ALTER TABLE "guest_tags" ADD CONSTRAINT "guest_tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_tag_assignments" ADD CONSTRAINT "guest_tag_assignments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_tag_assignments" ADD CONSTRAINT "guest_tag_assignments_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_tag_assignments" ADD CONSTRAINT "guest_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "guest_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_contact_logs" ADD CONSTRAINT "guest_contact_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_contact_logs" ADD CONSTRAINT "guest_contact_logs_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_contact_logs" ADD CONSTRAINT "guest_contact_logs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_imports" ADD CONSTRAINT "guest_imports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_imports" ADD CONSTRAINT "guest_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_imports" ADD CONSTRAINT "guest_imports_background_job_id_fkey" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_imports" ADD CONSTRAINT "guest_imports_error_artifact_id_fkey" FOREIGN KEY ("error_artifact_id") REFERENCES "generated_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_import_rows" ADD CONSTRAINT "guest_import_rows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_import_rows" ADD CONSTRAINT "guest_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "guest_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_import_rows" ADD CONSTRAINT "guest_import_rows_duplicate_guest_id_fkey" FOREIGN KEY ("duplicate_guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_import_rows" ADD CONSTRAINT "guest_import_rows_duplicate_household_id_fkey" FOREIGN KEY ("duplicate_household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_import_rows" ADD CONSTRAINT "guest_import_rows_result_guest_id_fkey" FOREIGN KEY ("result_guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wedding_events" ADD CONSTRAINT "wedding_events_date_order" CHECK ("end_at" IS NULL OR "start_at" IS NULL OR "end_at" >= "start_at");
ALTER TABLE "guests" ADD CONSTRAINT "guests_plus_one_contract" CHECK ((NOT "is_plus_one" AND "primary_guest_id" IS NULL) OR ("is_plus_one" AND "primary_guest_id" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "guest_import_rows_import_id_row_number_key" ON "guest_import_rows"("import_id", "row_number");

-- RenameIndex
ALTER INDEX "delivery_attempts_consumer_execution_attempt_key" RENAME TO "delivery_attempts_consumer_execution_id_attempt_number_key";

-- RenameIndex
ALTER INDEX "delivery_attempts_consumer_execution_created_at_idx" RENAME TO "delivery_attempts_consumer_execution_id_created_at_idx";

-- RenameIndex
ALTER INDEX "generated_artifacts_owner_status_created_idx" RENAME TO "generated_artifacts_owner_user_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "generated_artifacts_status_expires_idx" RENAME TO "generated_artifacts_status_expires_at_idx";

-- RenameIndex
ALTER INDEX "generated_artifacts_workspace_status_created_idx" RENAME TO "generated_artifacts_workspace_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "outbox_consumer_executions_job_status_idx" RENAME TO "outbox_consumer_executions_background_job_id_status_idx";

-- RenameIndex
ALTER INDEX "outbox_consumer_executions_outbox_consumer_key" RENAME TO "outbox_consumer_executions_outbox_message_id_consumer_name_key";

-- RenameIndex
ALTER INDEX "outbox_consumer_executions_outbox_status_idx" RENAME TO "outbox_consumer_executions_outbox_message_id_status_idx";
