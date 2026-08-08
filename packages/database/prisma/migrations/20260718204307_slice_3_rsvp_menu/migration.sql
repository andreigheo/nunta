-- CreateEnum
CREATE TYPE "RsvpFormStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateEnum
CREATE TYPE "RsvpSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UPDATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GuestAttendance" AS ENUM ('CONFIRMED', 'DECLINED', 'UNSURE', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "MenuAudience" AS ENUM ('ADULT', 'CHILD', 'ALL');

-- CreateEnum
CREATE TYPE "MenuStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'LIFE_THREATENING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AllergyIssueStatus" AS ENUM ('UNREVIEWED', 'REVIEWING', 'CONFIRMED_WITH_CATERER', 'RESOLVED');

-- CreateTable
CREATE TABLE "rsvp_form_definitions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "RsvpFormStatus" NOT NULL DEFAULT 'DRAFT',
    "current_draft_id" UUID,
    "published_version_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rsvp_form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_form_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "form_definition_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "rsvp_form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp_submissions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "invitation_recipient_id" UUID NOT NULL,
    "form_version_id" UUID NOT NULL,
    "status" "RsvpSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "last_modified_at" TIMESTAMP(3),
    "guest_message" VARCHAR(2000),
    "source" VARCHAR(40) NOT NULL DEFAULT 'GUEST',
    "admin_override_reason" VARCHAR(1000),
    "idempotency_key" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rsvp_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_event_responses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "attendance" "GuestAttendance" NOT NULL DEFAULT 'NO_RESPONSE',
    "responded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_event_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "audience" "MenuAudience" NOT NULL DEFAULT 'ALL',
    "price_minor" INTEGER,
    "currency" CHAR(3),
    "vendor_name_snapshot" VARCHAR(180),
    "status" "MenuStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_courses" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "course_type" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(1000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "menu_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietary_tags" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "dietary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_dietary_tags" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "dietary_tag_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_dietary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_menu_selections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "submission_id" UUID,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" VARCHAR(40) NOT NULL DEFAULT 'GUEST',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_menu_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_allergies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "allergen_code" VARCHAR(80),
    "label" VARCHAR(120) NOT NULL,
    "details_encrypted" TEXT,
    "severity" "AllergySeverity" NOT NULL DEFAULT 'UNKNOWN',
    "source" VARCHAR(40) NOT NULL DEFAULT 'GUEST',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergy_issues" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "allergy_id" UUID NOT NULL,
    "status" "AllergyIssueStatus" NOT NULL DEFAULT 'UNREVIEWED',
    "assigned_to_membership_id" UUID,
    "resolution_note_encrypted" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "allergy_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_form_definitions_workspace_id_key" ON "rsvp_form_definitions"("workspace_id");

-- CreateIndex
CREATE INDEX "rsvp_form_definitions_workspace_id_status_idx" ON "rsvp_form_definitions"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "rsvp_form_versions_workspace_id_form_definition_id_created__idx" ON "rsvp_form_versions"("workspace_id", "form_definition_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_form_versions_form_definition_id_version_number_key" ON "rsvp_form_versions"("form_definition_id", "version_number");

-- CreateIndex
CREATE INDEX "rsvp_submissions_workspace_id_status_submitted_at_idx" ON "rsvp_submissions"("workspace_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "rsvp_submissions_workspace_id_household_id_idx" ON "rsvp_submissions"("workspace_id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_submissions_invitation_recipient_id_form_version_id_key" ON "rsvp_submissions"("invitation_recipient_id", "form_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_submissions_invitation_recipient_id_idempotency_key_key" ON "rsvp_submissions"("invitation_recipient_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "guest_event_responses_workspace_id_wedding_event_id_attenda_idx" ON "guest_event_responses"("workspace_id", "wedding_event_id", "attendance");

-- CreateIndex
CREATE UNIQUE INDEX "guest_event_responses_submission_id_guest_id_wedding_event__key" ON "guest_event_responses"("submission_id", "guest_id", "wedding_event_id");

-- CreateIndex
CREATE INDEX "menus_workspace_id_status_position_idx" ON "menus"("workspace_id", "status", "position");

-- CreateIndex
CREATE INDEX "menu_courses_workspace_id_menu_id_position_idx" ON "menu_courses"("workspace_id", "menu_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "dietary_tags_workspace_id_code_key" ON "dietary_tags"("workspace_id", "code");

-- CreateIndex
CREATE INDEX "menu_dietary_tags_workspace_id_dietary_tag_id_idx" ON "menu_dietary_tags"("workspace_id", "dietary_tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_dietary_tags_menu_id_dietary_tag_id_key" ON "menu_dietary_tags"("menu_id", "dietary_tag_id");

-- CreateIndex
CREATE INDEX "guest_menu_selections_workspace_id_guest_id_active_idx" ON "guest_menu_selections"("workspace_id", "guest_id", "active");

-- CreateIndex
CREATE INDEX "guest_menu_selections_workspace_id_menu_id_active_idx" ON "guest_menu_selections"("workspace_id", "menu_id", "active");

-- CreateIndex
CREATE INDEX "guest_allergies_workspace_id_guest_id_severity_idx" ON "guest_allergies"("workspace_id", "guest_id", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "guest_allergies_guest_id_label_key" ON "guest_allergies"("guest_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "allergy_issues_allergy_id_key" ON "allergy_issues"("allergy_id");

-- CreateIndex
CREATE INDEX "allergy_issues_workspace_id_status_created_at_idx" ON "allergy_issues"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "allergy_issues_workspace_id_guest_id_idx" ON "allergy_issues"("workspace_id", "guest_id");

CREATE UNIQUE INDEX "guest_menu_selections_one_active_per_guest"
  ON "guest_menu_selections"("workspace_id", "guest_id") WHERE "active" = true;
ALTER TABLE "rsvp_form_definitions" ADD CONSTRAINT "rsvp_form_definitions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rsvp_form_definitions" ADD CONSTRAINT "rsvp_form_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rsvp_form_versions" ADD CONSTRAINT "rsvp_form_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rsvp_form_versions" ADD CONSTRAINT "rsvp_form_versions_definition_id_fkey" FOREIGN KEY ("form_definition_id") REFERENCES "rsvp_form_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rsvp_form_versions" ADD CONSTRAINT "rsvp_form_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rsvp_form_definitions" ADD CONSTRAINT "rsvp_form_definitions_current_draft_id_fkey" FOREIGN KEY ("current_draft_id") REFERENCES "rsvp_form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rsvp_form_definitions" ADD CONSTRAINT "rsvp_form_definitions_published_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "rsvp_form_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_recipient_id_fkey" FOREIGN KEY ("invitation_recipient_id") REFERENCES "invitation_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rsvp_submissions" ADD CONSTRAINT "rsvp_submissions_form_version_id_fkey" FOREIGN KEY ("form_version_id") REFERENCES "rsvp_form_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_event_responses" ADD CONSTRAINT "guest_event_responses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_event_responses" ADD CONSTRAINT "guest_event_responses_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "rsvp_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_event_responses" ADD CONSTRAINT "guest_event_responses_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_event_responses" ADD CONSTRAINT "guest_event_responses_event_id_fkey" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menus" ADD CONSTRAINT "menus_price_nonnegative" CHECK ("price_minor" IS NULL OR "price_minor" >= 0);
ALTER TABLE "menu_courses" ADD CONSTRAINT "menu_courses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_courses" ADD CONSTRAINT "menu_courses_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dietary_tags" ADD CONSTRAINT "dietary_tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_dietary_tags" ADD CONSTRAINT "menu_dietary_tags_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_dietary_tags" ADD CONSTRAINT "menu_dietary_tags_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_dietary_tags" ADD CONSTRAINT "menu_dietary_tags_tag_id_fkey" FOREIGN KEY ("dietary_tag_id") REFERENCES "dietary_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_menu_selections" ADD CONSTRAINT "guest_menu_selections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_menu_selections" ADD CONSTRAINT "guest_menu_selections_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_menu_selections" ADD CONSTRAINT "guest_menu_selections_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guest_menu_selections" ADD CONSTRAINT "guest_menu_selections_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "rsvp_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_allergies" ADD CONSTRAINT "guest_allergies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_allergies" ADD CONSTRAINT "guest_allergies_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allergy_issues" ADD CONSTRAINT "allergy_issues_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allergy_issues" ADD CONSTRAINT "allergy_issues_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allergy_issues" ADD CONSTRAINT "allergy_issues_allergy_id_fkey" FOREIGN KEY ("allergy_id") REFERENCES "guest_allergies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "allergy_issues" ADD CONSTRAINT "allergy_issues_assignee_id_fkey" FOREIGN KEY ("assigned_to_membership_id") REFERENCES "workspace_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
