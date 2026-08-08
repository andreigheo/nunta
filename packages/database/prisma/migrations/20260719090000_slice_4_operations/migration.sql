-- CreateEnum
CREATE TYPE "VenueUnit" AS ENUM ('METERS', 'CENTIMETERS', 'ARBITRARY_GRID');

-- CreateEnum
CREATE TYPE "VenueSpaceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SeatingPlanStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SeatingTableShape" AS ENUM ('ROUND', 'RECTANGLE', 'OVAL', 'SQUARE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SeatingSeatStatus" AS ENUM ('AVAILABLE', 'BLOCKED', 'RESERVED');

-- CreateEnum
CREATE TYPE "SeatingAssignmentSource" AS ENUM ('MANUAL', 'SUGGESTION', 'IMPORT');

-- CreateEnum
CREATE TYPE "SeatingAssignmentStatus" AS ENUM ('ACTIVE', 'CONFLICT', 'REMOVED');

-- CreateEnum
CREATE TYPE "SeatingConstraintType" AS ENUM ('KEEP_TOGETHER', 'KEEP_APART', 'PREFER_TOGETHER', 'PREFER_APART', 'MUST_BE_AT_TABLE', 'MUST_NOT_BE_AT_TABLE', 'ACCESSIBLE_SEAT_REQUIRED', 'NEAR_EXIT', 'NEAR_STAGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OperationsPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "OperationsIssueStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED_WITH_REASON');

-- CreateEnum
CREATE TYPE "SeatingIssueType" AS ENUM ('UNASSIGNED_GUEST', 'OVER_CAPACITY', 'UNDER_CAPACITY', 'DUPLICATE_ASSIGNMENT', 'INELIGIBLE_GUEST', 'HOUSEHOLD_SPLIT', 'PLUS_ONE_SEPARATED', 'CHILD_SEPARATED', 'CONSTRAINT_VIOLATION', 'ACCESSIBILITY_MISMATCH', 'MENU_INCOMPLETE', 'ALLERGY_REVIEW_REQUIRED', 'PUBLISHED_PLAN_STALE');

-- CreateEnum
CREATE TYPE "SeatingSuggestionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatingSuggestionStatus" AS ENUM ('GENERATING', 'READY_FOR_REVIEW', 'APPLIED', 'REJECTED', 'SUPERSEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransportRequestStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'ASSIGNED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportPlanStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TransportVehicleType" AS ENUM ('BUS', 'MINIBUS', 'VAN', 'CAR', 'SHUTTLE', 'OTHER');

-- CreateEnum
CREATE TYPE "TransportVehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TransportDirection" AS ENUM ('TO_EVENT', 'FROM_EVENT', 'ROUND_TRIP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "TransportRouteStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PUBLISHED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportAssignmentStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TransportIssueType" AS ENUM ('UNASSIGNED_REQUEST', 'OVER_CAPACITY', 'ACCESSIBLE_CAPACITY_EXCEEDED', 'DUPLICATE_ASSIGNMENT', 'INVALID_EVENT_ATTENDANCE', 'MISSING_PICKUP_STOP', 'MISSING_VEHICLE', 'SCHEDULE_CONFLICT', 'ROUTE_NOT_PUBLISHED', 'GUEST_REQUEST_CHANGED');

-- CreateEnum
CREATE TYPE "AccommodationRequestStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'ASSIGNED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccommodationPropertyType" AS ENUM ('HOTEL', 'PENSION', 'APARTMENT', 'HOUSE', 'HOSTEL', 'OTHER');

-- CreateEnum
CREATE TYPE "AccommodationPropertyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FULL', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccommodationRoomStatus" AS ENUM ('AVAILABLE', 'HELD', 'OCCUPIED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AccommodationStayStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AccommodationAllocationStatus" AS ENUM ('ASSIGNED', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT');

-- CreateEnum
CREATE TYPE "AccommodationIssueType" AS ENUM ('UNASSIGNED_REQUEST', 'ROOM_OVER_CAPACITY', 'ADULT_CAPACITY_EXCEEDED', 'CHILD_CAPACITY_EXCEEDED', 'HOUSEHOLD_SPLIT', 'CHILD_WITHOUT_ADULT', 'ACCESSIBILITY_MISMATCH', 'OVERLAPPING_ALLOCATION', 'INVALID_DATE_RANGE', 'ROOM_UNAVAILABLE', 'REQUEST_CHANGED', 'PUBLISHED_STAY_STALE');

-- CreateTable
CREATE TABLE "venue_spaces" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "location_name" VARCHAR(240),
    "width_units" DECIMAL(10,2) NOT NULL,
    "height_units" DECIMAL(10,2) NOT NULL,
    "unit" "VenueUnit" NOT NULL DEFAULT 'ARBITRARY_GRID',
    "capacity" INTEGER,
    "background_image_url" VARCHAR(2048),
    "status" "VenueSpaceStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venue_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "venue_space_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "SeatingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "active_snapshot_id" UUID,
    "published_snapshot_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seating_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_plan_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "layout_document" JSONB NOT NULL,
    "assignment_hash" CHAR(64) NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "table_count" INTEGER NOT NULL,
    "seat_count" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "seating_plan_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_tables" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "shape" "SeatingTableShape" NOT NULL DEFAULT 'ROUND',
    "capacity" INTEGER NOT NULL,
    "minimum_capacity" INTEGER,
    "x" DECIMAL(12,3) NOT NULL,
    "y" DECIMAL(12,3) NOT NULL,
    "width" DECIMAL(12,3) NOT NULL,
    "height" DECIMAL(12,3) NOT NULL,
    "rotation" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "zone" VARCHAR(100),
    "notes_private" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seating_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_seats" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "x" DECIMAL(12,3),
    "y" DECIMAL(12,3),
    "rotation" DECIMAL(7,2),
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "status" "SeatingSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seating_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_seating_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "seating_table_id" UUID NOT NULL,
    "seating_seat_id" UUID,
    "guest_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "source" "SeatingAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "status" "SeatingAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by" UUID,
    "assignment_group_key" VARCHAR(160),
    "override_reason" VARCHAR(1000),
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "guest_seating_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_constraints" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "type" "SeatingConstraintType" NOT NULL,
    "guest_id" UUID,
    "household_id" UUID,
    "related_guest_id" UUID,
    "table_id" UUID,
    "priority" "OperationsPriority" NOT NULL DEFAULT 'MEDIUM',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "reason" VARCHAR(1000),
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seating_constraints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_issues" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "type" "SeatingIssueType" NOT NULL,
    "severity" "OperationsPriority" NOT NULL,
    "guest_id" UUID,
    "household_id" UUID,
    "table_id" UUID,
    "details_redacted" VARCHAR(1000) NOT NULL,
    "status" "OperationsIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" VARCHAR(1000),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seating_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_suggestion_runs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "background_job_id" UUID NOT NULL,
    "status" "SeatingSuggestionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "rules_version" VARCHAR(80) NOT NULL,
    "input_hash" CHAR(64) NOT NULL,
    "suggestion_id" UUID,
    "error_code" VARCHAR(100),
    "error_message" VARCHAR(500),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "seating_suggestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_suggestions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seating_plan_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "status" "SeatingSuggestionStatus" NOT NULL DEFAULT 'GENERATING',
    "unassigned_guest_ids" JSONB NOT NULL,
    "hard_conflicts" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "violated_optional_preferences" JSONB NOT NULL,
    "table_utilization" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "rules_version" VARCHAR(80) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "seating_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seating_suggestion_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "suggestion_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "table_id" UUID NOT NULL,
    "seat_id" UUID,
    "group_key" VARCHAR(160),
    "rationale" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seating_suggestion_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_requests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "requested" BOOLEAN NOT NULL DEFAULT true,
    "pickup_area" VARCHAR(180),
    "pickup_address_encrypted" TEXT,
    "special_requirements_encrypted" TEXT,
    "status" "TransportRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "source_submission_id" UUID,
    "organizer_override" BOOLEAN NOT NULL DEFAULT false,
    "organizer_override_reason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "wedding_event_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "status" "TransportPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_vehicles" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "transport_plan_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "vehicle_type" "TransportVehicleType" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "accessible_capacity" INTEGER NOT NULL DEFAULT 0,
    "registration_label" VARCHAR(80),
    "driver_name" VARCHAR(180),
    "driver_phone_encrypted" TEXT,
    "notes_private" TEXT,
    "status" "TransportVehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_routes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "transport_plan_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "direction" "TransportDirection" NOT NULL,
    "departure_at" TIMESTAMP(3) NOT NULL,
    "arrival_at" TIMESTAMP(3),
    "origin_name" VARCHAR(240) NOT NULL,
    "destination_name" VARCHAR(240) NOT NULL,
    "status" "TransportRouteStatus" NOT NULL DEFAULT 'DRAFT',
    "capacity_override" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_stops" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "instructions" VARCHAR(1000),
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_route_stops" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "stop_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "planned_at" TIMESTAMP(3),
    "pickup_window_start" TIMESTAMP(3),
    "pickup_window_end" TIMESTAMP(3),

    CONSTRAINT "transport_route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_transport_assignments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "transport_request_id" UUID,
    "pickup_stop_id" UUID,
    "dropoff_stop_id" UUID,
    "seat_count" INTEGER NOT NULL DEFAULT 1,
    "status" "TransportAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    "override_reason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_transport_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_issues" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "transport_plan_id" UUID NOT NULL,
    "type" "TransportIssueType" NOT NULL,
    "severity" "OperationsPriority" NOT NULL,
    "guest_id" UUID,
    "route_id" UUID,
    "details_redacted" VARCHAR(1000) NOT NULL,
    "status" "OperationsIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" VARCHAR(1000),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_requests" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "requested" BOOLEAN NOT NULL DEFAULT true,
    "arrival_date" DATE,
    "departure_date" DATE,
    "room_preference" VARCHAR(500),
    "accessibility_requirements_encrypted" TEXT,
    "status" "AccommodationRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "source_submission_id" UUID,
    "organizer_override" BOOLEAN NOT NULL DEFAULT false,
    "organizer_override_reason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_properties" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "AccommodationPropertyType" NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "city" VARCHAR(120) NOT NULL,
    "country" VARCHAR(120) NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "contact_name" VARCHAR(180),
    "contact_phone_encrypted" TEXT,
    "check_in_time" VARCHAR(5),
    "check_out_time" VARCHAR(5),
    "instructions" VARCHAR(2000),
    "status" "AccommodationPropertyStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_room_types" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "capacity_adults" INTEGER NOT NULL,
    "capacity_children" INTEGER NOT NULL,
    "bed_configuration" VARCHAR(500) NOT NULL,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_rooms" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_type_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "floor" VARCHAR(80),
    "capacity_adults" INTEGER NOT NULL,
    "capacity_children" INTEGER NOT NULL,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccommodationRoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes_private" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_stays" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "status" "AccommodationStayStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_stays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_allocations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "guest_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "accommodation_request_id" UUID,
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "status" "AccommodationAllocationStatus" NOT NULL DEFAULT 'ASSIGNED',
    "source" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    "override_reason" VARCHAR(1000),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_issues" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "stay_id" UUID NOT NULL,
    "type" "AccommodationIssueType" NOT NULL,
    "severity" "OperationsPriority" NOT NULL,
    "guest_id" UUID,
    "household_id" UUID,
    "room_id" UUID,
    "details_redacted" VARCHAR(1000) NOT NULL,
    "status" "OperationsIssueStatus" NOT NULL DEFAULT 'OPEN',
    "resolution_note" VARCHAR(1000),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accommodation_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venue_spaces_workspace_id_wedding_event_id_status_idx" ON "venue_spaces"("workspace_id", "wedding_event_id", "status");

-- CreateIndex
CREATE INDEX "seating_plans_workspace_id_wedding_event_id_status_idx" ON "seating_plans"("workspace_id", "wedding_event_id", "status");

-- CreateIndex
CREATE INDEX "seating_plans_workspace_id_venue_space_id_idx" ON "seating_plans"("workspace_id", "venue_space_id");

-- CreateIndex
CREATE INDEX "seating_plan_snapshots_workspace_id_seating_plan_id_publish_idx" ON "seating_plan_snapshots"("workspace_id", "seating_plan_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "seating_plan_snapshots_seating_plan_id_version_number_key" ON "seating_plan_snapshots"("seating_plan_id", "version_number");

-- CreateIndex
CREATE INDEX "seating_tables_workspace_id_seating_plan_id_position_idx" ON "seating_tables"("workspace_id", "seating_plan_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "seating_tables_seating_plan_id_label_key" ON "seating_tables"("seating_plan_id", "label");

-- CreateIndex
CREATE INDEX "seating_seats_workspace_id_table_id_position_idx" ON "seating_seats"("workspace_id", "table_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "seating_seats_table_id_label_key" ON "seating_seats"("table_id", "label");

-- CreateIndex
CREATE INDEX "guest_seating_assignments_workspace_id_seating_plan_id_stat_idx" ON "guest_seating_assignments"("workspace_id", "seating_plan_id", "status");

-- CreateIndex
CREATE INDEX "guest_seating_assignments_workspace_id_guest_id_wedding_eve_idx" ON "guest_seating_assignments"("workspace_id", "guest_id", "wedding_event_id");

-- CreateIndex
CREATE INDEX "guest_seating_assignments_workspace_id_seating_table_id_sta_idx" ON "guest_seating_assignments"("workspace_id", "seating_table_id", "status");

-- CreateIndex
CREATE INDEX "seating_constraints_workspace_id_seating_plan_id_deleted_at_idx" ON "seating_constraints"("workspace_id", "seating_plan_id", "deleted_at");

-- CreateIndex
CREATE INDEX "seating_issues_workspace_id_seating_plan_id_status_severity_idx" ON "seating_issues"("workspace_id", "seating_plan_id", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "seating_issues_workspace_id_seating_plan_id_dedupe_key_key" ON "seating_issues"("workspace_id", "seating_plan_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "seating_suggestion_runs_background_job_id_key" ON "seating_suggestion_runs"("background_job_id");

-- CreateIndex
CREATE INDEX "seating_suggestion_runs_workspace_id_seating_plan_id_status_idx" ON "seating_suggestion_runs"("workspace_id", "seating_plan_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seating_suggestions_run_id_key" ON "seating_suggestions"("run_id");

-- CreateIndex
CREATE INDEX "seating_suggestions_workspace_id_seating_plan_id_status_idx" ON "seating_suggestions"("workspace_id", "seating_plan_id", "status");

-- CreateIndex
CREATE INDEX "seating_suggestion_assignments_workspace_id_suggestion_id_t_idx" ON "seating_suggestion_assignments"("workspace_id", "suggestion_id", "table_id");

-- CreateIndex
CREATE UNIQUE INDEX "seating_suggestion_assignments_suggestion_id_guest_id_key" ON "seating_suggestion_assignments"("suggestion_id", "guest_id");

-- CreateIndex
CREATE INDEX "transport_requests_workspace_id_wedding_event_id_status_idx" ON "transport_requests"("workspace_id", "wedding_event_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "transport_requests_guest_id_wedding_event_id_key" ON "transport_requests"("guest_id", "wedding_event_id");

-- CreateIndex
CREATE INDEX "transport_plans_workspace_id_wedding_event_id_status_idx" ON "transport_plans"("workspace_id", "wedding_event_id", "status");

-- CreateIndex
CREATE INDEX "transport_vehicles_workspace_id_transport_plan_id_status_idx" ON "transport_vehicles"("workspace_id", "transport_plan_id", "status");

-- CreateIndex
CREATE INDEX "transport_routes_workspace_id_transport_plan_id_status_idx" ON "transport_routes"("workspace_id", "transport_plan_id", "status");

-- CreateIndex
CREATE INDEX "transport_routes_workspace_id_vehicle_id_departure_at_idx" ON "transport_routes"("workspace_id", "vehicle_id", "departure_at");

-- CreateIndex
CREATE INDEX "transport_stops_workspace_id_deleted_at_name_idx" ON "transport_stops"("workspace_id", "deleted_at", "name");

-- CreateIndex
CREATE INDEX "transport_route_stops_workspace_id_route_id_position_idx" ON "transport_route_stops"("workspace_id", "route_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "transport_route_stops_route_id_stop_id_key" ON "transport_route_stops"("route_id", "stop_id");

-- CreateIndex
CREATE UNIQUE INDEX "transport_route_stops_route_id_position_key" ON "transport_route_stops"("route_id", "position");

-- CreateIndex
CREATE INDEX "guest_transport_assignments_workspace_id_route_id_status_idx" ON "guest_transport_assignments"("workspace_id", "route_id", "status");

-- CreateIndex
CREATE INDEX "guest_transport_assignments_workspace_id_guest_id_status_idx" ON "guest_transport_assignments"("workspace_id", "guest_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "guest_transport_assignments_route_id_guest_id_key" ON "guest_transport_assignments"("route_id", "guest_id");

-- CreateIndex
CREATE INDEX "transport_issues_workspace_id_transport_plan_id_status_seve_idx" ON "transport_issues"("workspace_id", "transport_plan_id", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "transport_issues_workspace_id_transport_plan_id_dedupe_key_key" ON "transport_issues"("workspace_id", "transport_plan_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "accommodation_requests_workspace_id_status_arrival_date_idx" ON "accommodation_requests"("workspace_id", "status", "arrival_date");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_requests_guest_id_key" ON "accommodation_requests"("guest_id");

-- CreateIndex
CREATE INDEX "accommodation_properties_workspace_id_status_name_idx" ON "accommodation_properties"("workspace_id", "status", "name");

-- CreateIndex
CREATE INDEX "accommodation_room_types_workspace_id_property_id_name_idx" ON "accommodation_room_types"("workspace_id", "property_id", "name");

-- CreateIndex
CREATE INDEX "accommodation_rooms_workspace_id_property_id_status_idx" ON "accommodation_rooms"("workspace_id", "property_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_rooms_property_id_name_key" ON "accommodation_rooms"("property_id", "name");

-- CreateIndex
CREATE INDEX "accommodation_stays_workspace_id_property_id_status_idx" ON "accommodation_stays"("workspace_id", "property_id", "status");

-- CreateIndex
CREATE INDEX "accommodation_allocations_workspace_id_stay_id_room_id_stat_idx" ON "accommodation_allocations"("workspace_id", "stay_id", "room_id", "status");

-- CreateIndex
CREATE INDEX "accommodation_allocations_workspace_id_guest_id_check_in_da_idx" ON "accommodation_allocations"("workspace_id", "guest_id", "check_in_date", "check_out_date");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_allocations_stay_id_guest_id_key" ON "accommodation_allocations"("stay_id", "guest_id");

-- CreateIndex
CREATE INDEX "accommodation_issues_workspace_id_stay_id_status_severity_idx" ON "accommodation_issues"("workspace_id", "stay_id", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_issues_workspace_id_stay_id_dedupe_key_key" ON "accommodation_issues"("workspace_id", "stay_id", "dedupe_key");

-- Domain constraints and cross-domain references intentionally live in SQL so
-- the Slice 3 canonical models do not gain duplicate Prisma ownership.
DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'venue_spaces','seating_plans','seating_plan_snapshots','seating_tables',
    'seating_seats','guest_seating_assignments','seating_constraints',
    'seating_issues','seating_suggestion_runs','seating_suggestions',
    'seating_suggestion_assignments','transport_requests','transport_plans',
    'transport_vehicles','transport_routes','transport_stops',
    'transport_route_stops','guest_transport_assignments','transport_issues',
    'accommodation_requests','accommodation_properties',
    'accommodation_room_types','accommodation_rooms','accommodation_stays',
    'accommodation_allocations','accommodation_issues'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE',
      table_name, table_name || '_workspace_fk'
    );
  END LOOP;
END
$block$;

ALTER TABLE "venue_spaces"
  ADD CONSTRAINT "venue_spaces_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id"),
  ADD CONSTRAINT "venue_spaces_dimensions_ck" CHECK ("width_units" > 0 AND "height_units" > 0 AND ("capacity" IS NULL OR "capacity" > 0));

ALTER TABLE "seating_plans"
  ADD CONSTRAINT "seating_plans_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id"),
  ADD CONSTRAINT "seating_plans_space_fk" FOREIGN KEY ("venue_space_id") REFERENCES "venue_spaces"("id"),
  ADD CONSTRAINT "seating_plans_active_snapshot_fk" FOREIGN KEY ("active_snapshot_id") REFERENCES "seating_plan_snapshots"("id") DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "seating_plans_published_snapshot_fk" FOREIGN KEY ("published_snapshot_id") REFERENCES "seating_plan_snapshots"("id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "seating_plan_snapshots" ADD CONSTRAINT "seating_snapshots_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE;
ALTER TABLE "seating_tables"
  ADD CONSTRAINT "seating_tables_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_tables_capacity_ck" CHECK ("capacity" > 0 AND ("minimum_capacity" IS NULL OR ("minimum_capacity" >= 0 AND "minimum_capacity" <= "capacity")) AND "width" > 0 AND "height" > 0);
ALTER TABLE "seating_seats" ADD CONSTRAINT "seating_seats_table_fk" FOREIGN KEY ("table_id") REFERENCES "seating_tables"("id") ON DELETE CASCADE;
ALTER TABLE "guest_seating_assignments"
  ADD CONSTRAINT "seating_assign_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_assign_table_fk" FOREIGN KEY ("seating_table_id") REFERENCES "seating_tables"("id"),
  ADD CONSTRAINT "seating_assign_seat_fk" FOREIGN KEY ("seating_seat_id") REFERENCES "seating_seats"("id"),
  ADD CONSTRAINT "seating_assign_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "seating_assign_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id");
CREATE UNIQUE INDEX "seating_assignment_active_guest_key" ON "guest_seating_assignments"("seating_plan_id", "guest_id") WHERE "status" IN ('ACTIVE', 'CONFLICT');
CREATE UNIQUE INDEX "seating_assignment_active_seat_key" ON "guest_seating_assignments"("seating_plan_id", "seating_seat_id") WHERE "seating_seat_id" IS NOT NULL AND "status" IN ('ACTIVE', 'CONFLICT');

ALTER TABLE "seating_constraints"
  ADD CONSTRAINT "seating_constraints_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_constraints_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "seating_constraints_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  ADD CONSTRAINT "seating_constraints_related_guest_fk" FOREIGN KEY ("related_guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "seating_constraints_table_fk" FOREIGN KEY ("table_id") REFERENCES "seating_tables"("id"),
  ADD CONSTRAINT "seating_constraints_self_ck" CHECK ("guest_id" IS NULL OR "related_guest_id" IS NULL OR "guest_id" <> "related_guest_id");
ALTER TABLE "seating_issues"
  ADD CONSTRAINT "seating_issues_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_issues_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "seating_issues_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  ADD CONSTRAINT "seating_issues_table_fk" FOREIGN KEY ("table_id") REFERENCES "seating_tables"("id");
ALTER TABLE "seating_suggestion_runs"
  ADD CONSTRAINT "seating_runs_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_runs_job_fk" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id"),
  ADD CONSTRAINT "seating_runs_suggestion_fk" FOREIGN KEY ("suggestion_id") REFERENCES "seating_suggestions"("id") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "seating_suggestions"
  ADD CONSTRAINT "seating_suggestions_plan_fk" FOREIGN KEY ("seating_plan_id") REFERENCES "seating_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_suggestions_run_fk" FOREIGN KEY ("run_id") REFERENCES "seating_suggestion_runs"("id") ON DELETE CASCADE;
ALTER TABLE "seating_suggestion_assignments"
  ADD CONSTRAINT "seating_suggestion_assign_suggestion_fk" FOREIGN KEY ("suggestion_id") REFERENCES "seating_suggestions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "seating_suggestion_assign_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "seating_suggestion_assign_table_fk" FOREIGN KEY ("table_id") REFERENCES "seating_tables"("id"),
  ADD CONSTRAINT "seating_suggestion_assign_seat_fk" FOREIGN KEY ("seat_id") REFERENCES "seating_seats"("id");

ALTER TABLE "transport_requests"
  ADD CONSTRAINT "transport_requests_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "transport_requests_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  ADD CONSTRAINT "transport_requests_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id"),
  ADD CONSTRAINT "transport_requests_submission_fk" FOREIGN KEY ("source_submission_id") REFERENCES "rsvp_submissions"("id");
ALTER TABLE "transport_plans" ADD CONSTRAINT "transport_plans_event_fk" FOREIGN KEY ("wedding_event_id") REFERENCES "wedding_events"("id");
ALTER TABLE "transport_vehicles"
  ADD CONSTRAINT "transport_vehicles_plan_fk" FOREIGN KEY ("transport_plan_id") REFERENCES "transport_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "transport_vehicles_capacity_ck" CHECK ("capacity" > 0 AND "accessible_capacity" >= 0 AND "accessible_capacity" <= "capacity");
ALTER TABLE "transport_routes"
  ADD CONSTRAINT "transport_routes_plan_fk" FOREIGN KEY ("transport_plan_id") REFERENCES "transport_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "transport_routes_vehicle_fk" FOREIGN KEY ("vehicle_id") REFERENCES "transport_vehicles"("id"),
  ADD CONSTRAINT "transport_routes_dates_ck" CHECK ("arrival_at" IS NULL OR "arrival_at" >= "departure_at"),
  ADD CONSTRAINT "transport_routes_capacity_ck" CHECK ("capacity_override" IS NULL OR "capacity_override" > 0);
ALTER TABLE "transport_route_stops"
  ADD CONSTRAINT "transport_route_stops_route_fk" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "transport_route_stops_stop_fk" FOREIGN KEY ("stop_id") REFERENCES "transport_stops"("id"),
  ADD CONSTRAINT "transport_route_stops_window_ck" CHECK ("pickup_window_end" IS NULL OR "pickup_window_start" IS NULL OR "pickup_window_end" >= "pickup_window_start");
ALTER TABLE "guest_transport_assignments"
  ADD CONSTRAINT "transport_assign_route_fk" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "transport_assign_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "transport_assign_request_fk" FOREIGN KEY ("transport_request_id") REFERENCES "transport_requests"("id"),
  ADD CONSTRAINT "transport_assign_pickup_fk" FOREIGN KEY ("pickup_stop_id") REFERENCES "transport_stops"("id"),
  ADD CONSTRAINT "transport_assign_dropoff_fk" FOREIGN KEY ("dropoff_stop_id") REFERENCES "transport_stops"("id"),
  ADD CONSTRAINT "transport_assign_seat_count_ck" CHECK ("seat_count" > 0);
ALTER TABLE "transport_issues"
  ADD CONSTRAINT "transport_issues_plan_fk" FOREIGN KEY ("transport_plan_id") REFERENCES "transport_plans"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "transport_issues_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "transport_issues_route_fk" FOREIGN KEY ("route_id") REFERENCES "transport_routes"("id");

ALTER TABLE "accommodation_requests"
  ADD CONSTRAINT "accommodation_requests_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "accommodation_requests_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  ADD CONSTRAINT "accommodation_requests_submission_fk" FOREIGN KEY ("source_submission_id") REFERENCES "rsvp_submissions"("id"),
  ADD CONSTRAINT "accommodation_requests_dates_ck" CHECK ("departure_date" IS NULL OR "arrival_date" IS NULL OR "departure_date" > "arrival_date");
ALTER TABLE "accommodation_room_types"
  ADD CONSTRAINT "accommodation_room_types_property_fk" FOREIGN KEY ("property_id") REFERENCES "accommodation_properties"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "accommodation_room_types_capacity_ck" CHECK ("capacity_adults" >= 0 AND "capacity_children" >= 0 AND ("capacity_adults" + "capacity_children") > 0 AND "quantity" > 0);
ALTER TABLE "accommodation_rooms"
  ADD CONSTRAINT "accommodation_rooms_property_fk" FOREIGN KEY ("property_id") REFERENCES "accommodation_properties"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "accommodation_rooms_type_fk" FOREIGN KEY ("room_type_id") REFERENCES "accommodation_room_types"("id"),
  ADD CONSTRAINT "accommodation_rooms_capacity_ck" CHECK ("capacity_adults" >= 0 AND "capacity_children" >= 0 AND ("capacity_adults" + "capacity_children") > 0);
ALTER TABLE "accommodation_stays"
  ADD CONSTRAINT "accommodation_stays_property_fk" FOREIGN KEY ("property_id") REFERENCES "accommodation_properties"("id"),
  ADD CONSTRAINT "accommodation_stays_dates_ck" CHECK ("check_out_date" > "check_in_date");
ALTER TABLE "accommodation_allocations"
  ADD CONSTRAINT "accommodation_allocations_stay_fk" FOREIGN KEY ("stay_id") REFERENCES "accommodation_stays"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "accommodation_allocations_room_fk" FOREIGN KEY ("room_id") REFERENCES "accommodation_rooms"("id"),
  ADD CONSTRAINT "accommodation_allocations_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "accommodation_allocations_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  ADD CONSTRAINT "accommodation_allocations_request_fk" FOREIGN KEY ("accommodation_request_id") REFERENCES "accommodation_requests"("id"),
  ADD CONSTRAINT "accommodation_allocations_dates_ck" CHECK ("check_out_date" > "check_in_date");
ALTER TABLE "accommodation_issues"
  ADD CONSTRAINT "accommodation_issues_stay_fk" FOREIGN KEY ("stay_id") REFERENCES "accommodation_stays"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "accommodation_issues_guest_fk" FOREIGN KEY ("guest_id") REFERENCES "guests"("id"),
  ADD CONSTRAINT "accommodation_issues_household_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id"),
  ADD CONSTRAINT "accommodation_issues_room_fk" FOREIGN KEY ("room_id") REFERENCES "accommodation_rooms"("id");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "venue_spaces", "seating_plans", "seating_plan_snapshots", "seating_tables",
  "seating_seats", "guest_seating_assignments", "seating_constraints",
  "seating_issues", "seating_suggestion_runs", "seating_suggestions",
  "seating_suggestion_assignments", "transport_requests", "transport_plans",
  "transport_vehicles", "transport_routes", "transport_stops",
  "transport_route_stops", "guest_transport_assignments", "transport_issues",
  "accommodation_requests", "accommodation_properties",
  "accommodation_room_types", "accommodation_rooms", "accommodation_stays",
  "accommodation_allocations", "accommodation_issues"
TO weddingos_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "seating_plan_snapshots", "guest_seating_assignments", "seating_issues",
  "seating_suggestion_runs", "seating_suggestions", "seating_suggestion_assignments",
  "transport_requests", "transport_issues", "accommodation_requests", "accommodation_issues"
TO weddingos_worker;
GRANT SELECT ON TABLE
  "venue_spaces", "seating_plans", "seating_tables", "seating_seats",
  "seating_constraints", "transport_plans", "transport_vehicles", "transport_routes",
  "transport_stops", "transport_route_stops", "guest_transport_assignments",
  "accommodation_properties", "accommodation_room_types", "accommodation_rooms",
  "accommodation_stays", "accommodation_allocations"
TO weddingos_worker;

DO $block$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'venue_spaces','seating_plans','seating_plan_snapshots','seating_tables',
    'seating_seats','guest_seating_assignments','seating_constraints',
    'seating_issues','seating_suggestion_runs','seating_suggestions',
    'seating_suggestion_assignments','transport_requests','transport_plans',
    'transport_vehicles','transport_routes','transport_stops',
    'transport_route_stops','guest_transport_assignments','transport_issues',
    'accommodation_requests','accommodation_properties',
    'accommodation_room_types','accommodation_rooms','accommodation_stays',
    'accommodation_allocations','accommodation_issues'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_app USING (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.current_workspace_id'', true), '''')::uuid AND public.weddingos_has_workspace_access(workspace_id))',
      table_name || '_organizer_policy', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO weddingos_worker USING (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL)) WITH CHECK (public.weddingos_worker_execution_context_matches(NULL, NULL, NULL, workspace_id, NULL))',
      table_name || '_worker_policy', table_name
    );
  END LOOP;
END
$block$;

-- Public guest rows are limited to the token household and published parent.
CREATE FUNCTION public.weddingos_guest_seating_assignment_visible(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM guest_seating_assignments assignment
    JOIN guests guest ON guest.id = assignment.guest_id
    JOIN seating_plans plan ON plan.id = assignment.seating_plan_id
    WHERE assignment.id = target_id
      AND assignment.status IN ('ACTIVE','CONFLICT')
      AND plan.status = 'PUBLISHED'
      AND plan.published_snapshot_id IS NOT NULL
      AND public.weddingos_guest_grant_matches(assignment.workspace_id, guest.household_id, NULL)
  );
$function$;
CREATE FUNCTION public.weddingos_guest_transport_assignment_visible(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM guest_transport_assignments assignment
    JOIN guests guest ON guest.id = assignment.guest_id
    JOIN transport_routes route ON route.id = assignment.route_id
    JOIN transport_plans plan ON plan.id = route.transport_plan_id
    WHERE assignment.id = target_id
      AND assignment.status IN ('ASSIGNED','CONFIRMED','COMPLETED')
      AND plan.status = 'PUBLISHED'
      AND public.weddingos_guest_grant_matches(assignment.workspace_id, guest.household_id, NULL)
  );
$function$;
CREATE FUNCTION public.weddingos_guest_accommodation_allocation_visible(target_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM accommodation_allocations allocation
    JOIN accommodation_stays stay ON stay.id = allocation.stay_id
    WHERE allocation.id = target_id
      AND allocation.status IN ('ASSIGNED','CONFIRMED','CHECKED_IN','CHECKED_OUT')
      AND stay.status = 'PUBLISHED'
      AND public.weddingos_guest_grant_matches(allocation.workspace_id, allocation.household_id, NULL)
  );
$function$;
REVOKE ALL ON FUNCTION public.weddingos_guest_seating_assignment_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weddingos_guest_transport_assignment_visible(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weddingos_guest_accommodation_allocation_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_seating_assignment_visible(uuid) TO weddingos_app;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_transport_assignment_visible(uuid) TO weddingos_app;
GRANT EXECUTE ON FUNCTION public.weddingos_guest_accommodation_allocation_visible(uuid) TO weddingos_app;

CREATE POLICY "seating_assignments_guest_policy" ON "guest_seating_assignments" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_seating_assignment_visible("id"));
CREATE POLICY "transport_assignments_guest_policy" ON "guest_transport_assignments" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_transport_assignment_visible("id"));
CREATE POLICY "accommodation_allocations_guest_policy" ON "accommodation_allocations" FOR SELECT TO weddingos_app
USING (public.weddingos_guest_accommodation_allocation_visible("id"));

UPDATE "role_templates" template
SET "capabilities" = (
  SELECT jsonb_agg(value ORDER BY value)
  FROM (
    SELECT DISTINCT jsonb_array_elements_text(
      template."capabilities" ||
      CASE template."key"
        WHEN 'couple_owner' THEN '["seating.read","seating.write","seating.assign","seating.publish","seating.generate_suggestion","seating.export","seating.read_sensitive_summary","transport.read","transport.write","transport.assign","transport.publish","transport.export","transport.read_sensitive","accommodation.read","accommodation.write","accommodation.assign","accommodation.publish","accommodation.export","accommodation.read_sensitive"]'::jsonb
        WHEN 'couple_partner' THEN '["seating.read","seating.write","seating.assign","seating.publish","seating.generate_suggestion","seating.export","seating.read_sensitive_summary","transport.read","transport.write","transport.assign","transport.publish","transport.export","transport.read_sensitive","accommodation.read","accommodation.write","accommodation.assign","accommodation.publish","accommodation.export","accommodation.read_sensitive"]'::jsonb
        WHEN 'wedding_planner' THEN '["seating.read","seating.write","seating.assign","seating.publish","seating.generate_suggestion","seating.export","seating.read_sensitive_summary","transport.read","transport.write","transport.assign","transport.publish","transport.export","transport.read_sensitive","accommodation.read","accommodation.write","accommodation.assign","accommodation.publish","accommodation.export","accommodation.read_sensitive"]'::jsonb
        WHEN 'family_collaborator' THEN '["seating.read","transport.read","accommodation.read"]'::jsonb
        WHEN 'viewer' THEN '["seating.read","transport.read","accommodation.read"]'::jsonb
        ELSE '[]'::jsonb
      END
    ) AS value
  ) merged
)
WHERE template."key" IN ('couple_owner','couple_partner','wedding_planner','family_collaborator','viewer');
