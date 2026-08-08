-- CreateEnum
CREATE TYPE "WeddingDayPlanStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'LIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RunOfShowItemType" AS ENUM ('MOMENT', 'CEREMONY', 'ARRIVAL', 'SETUP', 'DELIVERY', 'SPEECH', 'MEAL_SERVICE', 'ENTERTAINMENT', 'PHOTO_SESSION', 'TRANSPORT', 'CHECK_IN', 'BREAK', 'CLEANUP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RunOfShowStatus" AS ENUM ('NOT_STARTED', 'READY', 'IN_PROGRESS', 'DELAYED', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeddingDayPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RunOfShowDependencyType" AS ENUM ('FINISH_TO_START', 'START_TO_START');

-- CreateEnum
CREATE TYPE "WeddingDayChecklistType" AS ENUM ('VENUE_SETUP', 'CEREMONY', 'RECEPTION', 'VENDOR_ARRIVAL', 'GUEST_CHECK_IN', 'TRANSPORT', 'ACCOMMODATION', 'EMERGENCY', 'CLOSING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WeddingDayChecklistItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WeddingDayContactType" AS ENUM ('COUPLE', 'PLANNER', 'VENUE', 'VENDOR', 'DRIVER', 'ACCOMMODATION', 'EMERGENCY', 'MEDICAL', 'SECURITY', 'OTHER');

-- CreateEnum
CREATE TYPE "WeddingDayIncidentType" AS ENUM ('SCHEDULE', 'VENDOR', 'VENUE', 'GUEST', 'MEDICAL', 'SECURITY', 'TRANSPORT', 'ACCOMMODATION', 'TECHNICAL', 'WEATHER', 'FOOD', 'PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "WeddingDayIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATING', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeddingDayIncidentUpdateType" AS ENUM ('NOTE', 'STATUS_CHANGE', 'ASSIGNMENT', 'ESCALATION', 'DECISION', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "WeddingDayAnnouncementPriority" AS ENUM ('INFO', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "WeddingDayAnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeddingDayAnnouncementAudienceType" AS ENUM ('ALL_CONFIRMED_GUESTS', 'CHECKED_IN_GUESTS', 'NOT_CHECKED_IN_GUESTS', 'HOUSEHOLDS', 'TABLES', 'TRANSPORT_ROUTES', 'ACCOMMODATION_PROPERTIES', 'CUSTOM_GUEST_SET');

-- CreateEnum
CREATE TYPE "GuestCheckInSessionStatus" AS ENUM ('DRAFT', 'READY', 'OPEN', 'PAUSED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GuestCheckInStationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GuestCheckInDeviceStatus" AS ENUM ('ACTIVE', 'REVOKED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "GuestCheckInCredentialType" AS ENUM ('HOUSEHOLD', 'INDIVIDUAL', 'EVENT_ACCESS');

-- CreateEnum
CREATE TYPE "GuestCheckInCredentialStatus" AS ENUM ('ACTIVE', 'USED', 'ROTATED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GuestCheckInStatus" AS ENUM ('NOT_CHECKED_IN', 'CHECKED_IN', 'CHECKED_OUT', 'DENIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GuestCheckInSource" AS ENUM ('QR_ONLINE', 'QR_OFFLINE', 'MANUAL', 'HOUSEHOLD_BATCH', 'IMPORT');

-- CreateEnum
CREATE TYPE "GuestMomentStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "GuestMomentMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "GuestMomentModerationStatus" AS ENUM ('PENDING', 'AUTOMATED_SAFE', 'REQUIRES_REVIEW', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "GalleryCollectionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GalleryVisibility" AS ENUM ('GUESTS_WITH_ACCESS', 'HOUSEHOLDS', 'PRIVATE_ORGANIZERS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FileUploadPurpose" ADD VALUE 'GUEST_MOMENT_IMAGE';
ALTER TYPE "FileUploadPurpose" ADD VALUE 'GUEST_MOMENT_VIDEO';
ALTER TYPE "FileUploadPurpose" ADD VALUE 'WEDDING_DAY_INCIDENT_ATTACHMENT';

-- CreateTable
CREATE TABLE "wedding_day_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "WeddingDayPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "current_draft_version_id" UUID,
    "published_version_id" UUID,
    "live_version_id" UUID,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_plan_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(4000),
    "timezone" VARCHAR(80) NOT NULL,
    "operational_date" DATE NOT NULL,
    "contact_directory_snapshot" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "content_hash" CHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "immutable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "wedding_day_plan_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_of_show_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_version_id" UUID,
    "wedding_event_id" UUID NOT NULL,
    "parent_item_id" UUID,
    "source_type" VARCHAR(80) NOT NULL DEFAULT 'manual',
    "source_id" UUID,
    "type" "RunOfShowItemType" NOT NULL DEFAULT 'CUSTOM',
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(4000),
    "planned_start_at" TIMESTAMP(3) NOT NULL,
    "planned_end_at" TIMESTAMP(3),
    "actual_start_at" TIMESTAMP(3),
    "actual_end_at" TIMESTAMP(3),
    "delay_estimate_minutes" INTEGER,
    "status_reason" VARCHAR(1000),
    "location_name" VARCHAR(240),
    "location_address" VARCHAR(500),
    "status" "RunOfShowStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "WeddingDayPriority" NOT NULL DEFAULT 'MEDIUM',
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_guest_visible" BOOLEAN NOT NULL DEFAULT false,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "run_of_show_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_of_show_dependencies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "depends_on_item_id" UUID NOT NULL,
    "dependency_type" "RunOfShowDependencyType" NOT NULL DEFAULT 'FINISH_TO_START',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_of_show_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_of_show_item_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "membership_id" UUID,
    "vendor_organization_id" UUID,
    "vendor_booking_id" UUID,
    "contact_snapshot" JSONB,
    "role" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_of_show_item_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_of_show_item_updates" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "body" VARCHAR(2000),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_of_show_item_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_checklists" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "type" "WeddingDayChecklistType" NOT NULL DEFAULT 'CUSTOM',
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_checklist_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "source_task_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(2000),
    "status" "WeddingDayChecklistItemStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "WeddingDayPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigned_membership_id" UUID,
    "due_at" TIMESTAMP(3),
    "completed_by" UUID,
    "completed_at" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_contacts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "type" "WeddingDayContactType" NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "role" VARCHAR(160) NOT NULL,
    "organization_name" VARCHAR(180),
    "phone_encrypted" TEXT,
    "email_normalized" VARCHAR(320),
    "notes_private_encrypted" TEXT,
    "priority" "WeddingDayPriority" NOT NULL DEFAULT 'MEDIUM',
    "guest_visible" BOOLEAN NOT NULL DEFAULT false,
    "source_type" VARCHAR(80) NOT NULL DEFAULT 'manual',
    "source_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_incidents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "type" "WeddingDayIncidentType" NOT NULL,
    "severity" "WeddingDayPriority" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description_private" TEXT NOT NULL,
    "status" "WeddingDayIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "reported_by" UUID NOT NULL,
    "assigned_to_membership_id" UUID,
    "related_run_of_show_item_id" UUID,
    "related_vendor_booking_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_incident_updates" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "update_type" "WeddingDayIncidentUpdateType" NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wedding_day_incident_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_incident_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "wedding_day_incident_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_decisions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "incident_id" UUID,
    "plan_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "decision" VARCHAR(4000) NOT NULL,
    "reason" VARCHAR(2000),
    "decided_by" UUID NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "impact_summary" VARCHAR(2000),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "wedding_day_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_announcements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "priority" "WeddingDayAnnouncementPriority" NOT NULL DEFAULT 'INFO',
    "status" "WeddingDayAnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "channels" TEXT[] DEFAULT ARRAY['GUEST_COMPANION', 'IN_APP']::TEXT[],
    "publish_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "published_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_announcement_audiences" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "audience_type" "WeddingDayAnnouncementAudienceType" NOT NULL,
    "selector" JSONB NOT NULL DEFAULT '{}',
    "snapshot" JSONB NOT NULL DEFAULT '{}',
    "snapshot_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wedding_day_announcement_audiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_announcement_deliveries" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "announcement_id" UUID NOT NULL,
    "guest_access_grant_id" UUID,
    "household_id" UUID,
    "user_id" UUID,
    "channel" VARCHAR(40) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'QUEUED',
    "delivered_at" TIMESTAMP(3),
    "error_code" VARCHAR(120),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_announcement_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wedding_day_live_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "plan_id" UUID,
    "event_type" VARCHAR(120) NOT NULL,
    "organizer_payload" JSONB NOT NULL,
    "guest_payload" JSONB,
    "guest_visible" BOOLEAN NOT NULL DEFAULT false,
    "household_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "source_event_id" UUID,
    "sequence" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wedding_day_live_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_check_in_sessions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "plan_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "status" "GuestCheckInSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "opens_at" TIMESTAMP(3) NOT NULL,
    "closes_at" TIMESTAMP(3) NOT NULL,
    "allow_household_check_in" BOOLEAN NOT NULL DEFAULT true,
    "allow_manual_lookup" BOOLEAN NOT NULL DEFAULT true,
    "allow_offline" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_check_in_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_check_in_stations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "location" VARCHAR(500),
    "status" "GuestCheckInStationStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_check_in_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_check_in_devices" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "station_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "device_public_id" VARCHAR(120) NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "status" "GuestCheckInDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sequence" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3),
    "credential_expires_at" TIMESTAMP(3) NOT NULL,
    "registered_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_check_in_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_check_in_credentials" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "household_id" UUID,
    "guest_id" UUID,
    "token_hash" CHAR(64) NOT NULL,
    "credential_type" "GuestCheckInCredentialType" NOT NULL,
    "status" "GuestCheckInCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_check_in_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_check_ins" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "station_id" UUID,
    "device_id" UUID,
    "status" "GuestCheckInStatus" NOT NULL DEFAULT 'NOT_CHECKED_IN',
    "source" "GuestCheckInSource" NOT NULL,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "checked_in_by" UUID,
    "override_reason" VARCHAR(1000),
    "last_command_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_check_in_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "check_in_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "source" "GuestCheckInSource" NOT NULL,
    "actor_user_id" UUID,
    "device_id" UUID,
    "outcome" VARCHAR(40) NOT NULL,
    "reason_code" VARCHAR(120),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_check_in_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_manifest_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "manifest_hash" CHAR(64) NOT NULL,
    "signature" VARCHAR(128) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_manifest_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_offline_commands" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "command_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "credential_proof" CHAR(64) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "occurred_at_device" TIMESTAMP(3) NOT NULL,
    "local_sequence" INTEGER NOT NULL,
    "snapshot_version" INTEGER NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_in_offline_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_in_sync_batches" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "command_count" INTEGER NOT NULL,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(40) NOT NULL DEFAULT 'PROCESSING',
    "result" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "check_in_sync_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_moments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "guest_id" UUID,
    "guest_access_grant_id" UUID NOT NULL,
    "caption" VARCHAR(1000),
    "status" "GuestMomentStatus" NOT NULL DEFAULT 'UPLOADING',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "hidden_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_moment_media" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_moment_id" UUID NOT NULL,
    "stored_object_id" UUID NOT NULL,
    "derivative_object_id" UUID,
    "media_type" "GuestMomentMediaType" NOT NULL,
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "captured_at" TIMESTAMP(3),
    "moderation_status" "GuestMomentModerationStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_moment_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_moment_upload_sessions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_access_grant_id" UUID NOT NULL,
    "guest_moment_id" UUID NOT NULL,
    "guest_moment_media_id" UUID NOT NULL,
    "expected_content_types" TEXT[],
    "maximum_size_bytes" BIGINT NOT NULL,
    "expected_checksum" CHAR(64) NOT NULL,
    "status" "FileUploadStatus" NOT NULL DEFAULT 'CREATED',
    "stored_object_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_moment_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_moment_reports" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_moment_id" UUID NOT NULL,
    "guest_access_grant_id" UUID NOT NULL,
    "reason" VARCHAR(120) NOT NULL,
    "details" VARCHAR(1000),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_moment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_moment_moderation_cases" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_moment_id" UUID NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "reason_code" VARCHAR(120),
    "moderator_user_id" UUID,
    "decision" VARCHAR(40),
    "notes_private" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),

    CONSTRAINT "guest_moment_moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_collections" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "status" "GalleryCollectionStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "GalleryVisibility" NOT NULL DEFAULT 'GUESTS_WITH_ACCESS',
    "household_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "cover_item_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gallery_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_collection_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "guest_moment_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wedding_day_plans_workspace_id_status_updated_at_idx" ON "wedding_day_plans"("workspace_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_day_plans_workspace_id_wedding_event_id_name_key" ON "wedding_day_plans"("workspace_id", "wedding_event_id", "name");

-- CreateIndex
CREATE INDEX "wedding_day_plan_versions_workspace_id_plan_id_created_at_idx" ON "wedding_day_plan_versions"("workspace_id", "plan_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_day_plan_versions_plan_id_version_number_key" ON "wedding_day_plan_versions"("plan_id", "version_number");

-- CreateIndex
CREATE INDEX "run_of_show_items_workspace_id_plan_id_position_idx" ON "run_of_show_items"("workspace_id", "plan_id", "position");

-- CreateIndex
CREATE INDEX "run_of_show_items_workspace_id_wedding_event_id_status_plan_idx" ON "run_of_show_items"("workspace_id", "wedding_event_id", "status", "planned_start_at");

-- CreateIndex
CREATE INDEX "run_of_show_dependencies_workspace_id_plan_id_idx" ON "run_of_show_dependencies"("workspace_id", "plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_of_show_dependencies_item_id_depends_on_item_id_key" ON "run_of_show_dependencies"("item_id", "depends_on_item_id");

-- CreateIndex
CREATE INDEX "run_of_show_item_assignments_workspace_id_item_id_idx" ON "run_of_show_item_assignments"("workspace_id", "item_id");

-- CreateIndex
CREATE INDEX "run_of_show_item_updates_workspace_id_item_id_occurred_at_idx" ON "run_of_show_item_updates"("workspace_id", "item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "wedding_day_checklists_workspace_id_plan_id_position_idx" ON "wedding_day_checklists"("workspace_id", "plan_id", "position");

-- CreateIndex
CREATE INDEX "wedding_day_checklist_items_workspace_id_checklist_id_posit_idx" ON "wedding_day_checklist_items"("workspace_id", "checklist_id", "position");

-- CreateIndex
CREATE INDEX "wedding_day_checklist_items_workspace_id_status_due_at_idx" ON "wedding_day_checklist_items"("workspace_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "wedding_day_contacts_workspace_id_plan_id_priority_idx" ON "wedding_day_contacts"("workspace_id", "plan_id", "priority");

-- CreateIndex
CREATE INDEX "wedding_day_incidents_workspace_id_plan_id_status_severity_idx" ON "wedding_day_incidents"("workspace_id", "plan_id", "status", "severity");

-- CreateIndex
CREATE INDEX "wedding_day_incidents_workspace_id_wedding_event_id_started_idx" ON "wedding_day_incidents"("workspace_id", "wedding_event_id", "started_at");

-- CreateIndex
CREATE INDEX "wedding_day_incident_updates_workspace_id_incident_id_occur_idx" ON "wedding_day_incident_updates"("workspace_id", "incident_id", "occurred_at");

-- CreateIndex
CREATE INDEX "wedding_day_incident_assignments_workspace_id_incident_id_e_idx" ON "wedding_day_incident_assignments"("workspace_id", "incident_id", "ended_at");

-- CreateIndex
CREATE INDEX "wedding_day_decisions_workspace_id_plan_id_decided_at_idx" ON "wedding_day_decisions"("workspace_id", "plan_id", "decided_at");

-- CreateIndex
CREATE INDEX "wedding_day_announcements_workspace_id_plan_id_status_publi_idx" ON "wedding_day_announcements"("workspace_id", "plan_id", "status", "publish_at");

-- CreateIndex
CREATE INDEX "wedding_day_announcement_audiences_workspace_id_announcemen_idx" ON "wedding_day_announcement_audiences"("workspace_id", "announcement_id");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_day_announcement_deliveries_dedupe_key_key" ON "wedding_day_announcement_deliveries"("dedupe_key");

-- CreateIndex
CREATE INDEX "wedding_day_announcement_deliveries_workspace_id_announceme_idx" ON "wedding_day_announcement_deliveries"("workspace_id", "announcement_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wedding_day_live_events_source_event_id_key" ON "wedding_day_live_events"("source_event_id");

-- CreateIndex
CREATE INDEX "wedding_day_live_events_workspace_id_sequence_idx" ON "wedding_day_live_events"("workspace_id", "sequence");

-- CreateIndex
CREATE INDEX "wedding_day_live_events_wedding_event_id_guest_visible_sequ_idx" ON "wedding_day_live_events"("wedding_event_id", "guest_visible", "sequence");

-- CreateIndex
CREATE INDEX "guest_check_in_sessions_workspace_id_wedding_event_id_statu_idx" ON "guest_check_in_sessions"("workspace_id", "wedding_event_id", "status");

-- CreateIndex
CREATE INDEX "guest_check_in_stations_workspace_id_session_id_status_idx" ON "guest_check_in_stations"("workspace_id", "session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guest_check_in_devices_device_public_id_key" ON "guest_check_in_devices"("device_public_id");

-- CreateIndex
CREATE INDEX "guest_check_in_devices_workspace_id_session_id_status_idx" ON "guest_check_in_devices"("workspace_id", "session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guest_check_in_credentials_token_hash_key" ON "guest_check_in_credentials"("token_hash");

-- CreateIndex
CREATE INDEX "guest_check_in_credentials_workspace_id_wedding_event_id_ho_idx" ON "guest_check_in_credentials"("workspace_id", "wedding_event_id", "household_id", "status");

-- CreateIndex
CREATE INDEX "guest_check_ins_workspace_id_session_id_status_idx" ON "guest_check_ins"("workspace_id", "session_id", "status");

-- CreateIndex
CREATE INDEX "guest_check_ins_workspace_id_household_id_status_idx" ON "guest_check_ins"("workspace_id", "household_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guest_check_ins_wedding_event_id_guest_id_key" ON "guest_check_ins"("wedding_event_id", "guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_check_in_events_command_id_key" ON "guest_check_in_events"("command_id");

-- CreateIndex
CREATE INDEX "guest_check_in_events_workspace_id_session_id_occurred_at_idx" ON "guest_check_in_events"("workspace_id", "session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "check_in_manifest_snapshots_workspace_id_session_id_expires_idx" ON "check_in_manifest_snapshots"("workspace_id", "session_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_manifest_snapshots_device_id_version_number_key" ON "check_in_manifest_snapshots"("device_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_offline_commands_command_id_key" ON "check_in_offline_commands"("command_id");

-- CreateIndex
CREATE INDEX "check_in_offline_commands_workspace_id_session_id_status_idx" ON "check_in_offline_commands"("workspace_id", "session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_offline_commands_device_id_local_sequence_key" ON "check_in_offline_commands"("device_id", "local_sequence");

-- CreateIndex
CREATE INDEX "check_in_sync_batches_workspace_id_session_id_created_at_idx" ON "check_in_sync_batches"("workspace_id", "session_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "check_in_sync_batches_device_id_idempotency_key_key" ON "check_in_sync_batches"("device_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "guest_moments_workspace_id_wedding_event_id_status_submitte_idx" ON "guest_moments"("workspace_id", "wedding_event_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "guest_moments_guest_access_grant_id_submitted_at_idx" ON "guest_moments"("guest_access_grant_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_media_guest_moment_id_key" ON "guest_moment_media"("guest_moment_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_media_stored_object_id_key" ON "guest_moment_media"("stored_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_media_derivative_object_id_key" ON "guest_moment_media"("derivative_object_id");

-- CreateIndex
CREATE INDEX "guest_moment_media_workspace_id_moderation_status_created_a_idx" ON "guest_moment_media"("workspace_id", "moderation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_upload_sessions_guest_moment_media_id_key" ON "guest_moment_upload_sessions"("guest_moment_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_upload_sessions_stored_object_id_key" ON "guest_moment_upload_sessions"("stored_object_id");

-- CreateIndex
CREATE INDEX "guest_moment_upload_sessions_workspace_id_status_expires_at_idx" ON "guest_moment_upload_sessions"("workspace_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_upload_sessions_guest_access_grant_id_idempote_key" ON "guest_moment_upload_sessions"("guest_access_grant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "guest_moment_reports_dedupe_key_key" ON "guest_moment_reports"("dedupe_key");

-- CreateIndex
CREATE INDEX "guest_moment_reports_workspace_id_guest_moment_id_created_a_idx" ON "guest_moment_reports"("workspace_id", "guest_moment_id", "created_at");

-- CreateIndex
CREATE INDEX "guest_moment_moderation_cases_workspace_id_status_created_a_idx" ON "guest_moment_moderation_cases"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "gallery_collections_workspace_id_wedding_event_id_status_idx" ON "gallery_collections"("workspace_id", "wedding_event_id", "status");

-- CreateIndex
CREATE INDEX "gallery_collection_items_workspace_id_collection_id_positio_idx" ON "gallery_collection_items"("workspace_id", "collection_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_collection_items_collection_id_guest_moment_id_key" ON "gallery_collection_items"("collection_id", "guest_moment_id");
