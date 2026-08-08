-- CreateEnum
CREATE TYPE "VendorOrganizationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VendorMembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "VendorProfilePublicationStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'UNPUBLISHED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VendorVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VendorPricingVisibility" AS ENUM ('STARTING_FROM', 'RANGE', 'REQUEST_QUOTE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "VendorPricingModel" AS ENUM ('FIXED', 'PER_GUEST', 'PER_HOUR', 'PER_DAY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VendorAvailabilityStatus" AS ENUM ('AVAILABLE', 'TENTATIVE', 'UNAVAILABLE', 'BOOKED');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('VENUE', 'PHOTOGRAPHY', 'VIDEOGRAPHY', 'CATERING', 'ENTERTAINMENT', 'MUSIC', 'DECOR', 'FLOWERS', 'PLANNING', 'ATTIRE', 'BEAUTY', 'TRANSPORT', 'ACCOMMODATION', 'INVITATIONS', 'CAKE', 'RENTALS', 'LIGHTING', 'CEREMONY', 'OTHER');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'READY', 'SENT', 'PARTIALLY_RESPONDED', 'RESPONDED', 'CLOSED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RfqRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'OPENED', 'RESPONDED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RfqQuestionResponseType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'CHOICE', 'MULTI_CHOICE');

-- CreateEnum
CREATE TYPE "VendorOfferStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'REVISED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NegotiationThreadStatus" AS ENUM ('OPEN', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "NegotiationSenderType" AS ENUM ('WEDDING', 'VENDOR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NegotiationMessageType" AS ENUM ('MESSAGE', 'REVISION_REQUEST', 'REVISION_SUBMITTED', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "VendorBookingStatus" AS ENUM ('PENDING_CONTRACT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BookingMilestoneStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorContractStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'READY_FOR_ACKNOWLEDGEMENT', 'ACKNOWLEDGED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContractPartyType" AS ENUM ('WEDDING', 'VENDOR');

-- CreateEnum
CREATE TYPE "BudgetPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'LOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BudgetItemStatus" AS ENUM ('PLANNED', 'QUOTED', 'COMMITTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BudgetSourceType" AS ENUM ('MANUAL', 'ACCEPTED_OFFER', 'BOOKING', 'CONTRACT');

-- CreateEnum
CREATE TYPE "ExpenseRecordStatus" AS ENUM ('PLANNED', 'INCURRED', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentScheduleStatus" AS ENUM ('UPCOMING', 'DUE', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD_EXTERNAL', 'CASH', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('RECORDED', 'CONFIRMED', 'REVERSED', 'REFUNDED', 'DISPUTED');

-- AlterTable
ALTER TABLE "background_jobs" ADD COLUMN     "vendor_organization_id" UUID;

-- AlterTable
ALTER TABLE "delivery_attempts" ADD COLUMN     "vendor_organization_id" UUID;

-- AlterTable
ALTER TABLE "generated_artifacts" ADD COLUMN     "vendor_organization_id" UUID,
ALTER COLUMN "workspace_id" DROP NOT NULL;


-- AlterTable
ALTER TABLE "outbox_messages" ADD COLUMN     "vendor_organization_id" UUID;

-- CreateTable
CREATE TABLE "vendor_organizations" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(180) NOT NULL,
    "display_name" VARCHAR(180) NOT NULL,
    "country" VARCHAR(80) NOT NULL,
    "registration_number_encrypted" TEXT,
    "tax_id_encrypted" TEXT,
    "billing_email_encrypted" TEXT,
    "contact_email" VARCHAR(320) NOT NULL,
    "contact_phone_encrypted" TEXT,
    "website_url" VARCHAR(2048),
    "status" "VendorOrganizationStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_role_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "capabilities" JSONB NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_role_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_organization_memberships" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_template_id" UUID NOT NULL,
    "status" "VendorMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3),
    "removed_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_membership_capability_overrides" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "capability" VARCHAR(100) NOT NULL,
    "effect" "OverrideEffect" NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_membership_capability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_organization_invitations" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role_template_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "VendorMembershipStatus" NOT NULL DEFAULT 'INVITED',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_by" UUID,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_organization_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "headline" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "short_description" VARCHAR(500) NOT NULL,
    "logo_url" VARCHAR(2048),
    "cover_image_url" VARCHAR(2048),
    "categories" "VendorCategory"[],
    "custom_category_label" VARCHAR(100),
    "languages" TEXT[],
    "years_experience" INTEGER,
    "pricing_visibility" "VendorPricingVisibility" NOT NULL,
    "starting_price_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "response_time_label" VARCHAR(80),
    "public_email" VARCHAR(320),
    "public_phone" VARCHAR(50),
    "publication_status" "VendorProfilePublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verification_status" "VendorVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "publication_warnings" JSONB NOT NULL DEFAULT '[]',
    "submitted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_services" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "custom_category_label" VARCHAR(100),
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(3000) NOT NULL,
    "pricing_model" "VendorPricingModel" NOT NULL,
    "starting_price_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_packages" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(3000) NOT NULL,
    "base_price_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "included_items" JSONB NOT NULL DEFAULT '[]',
    "excluded_items" JSONB NOT NULL DEFAULT '[]',
    "guest_limit" INTEGER,
    "duration_minutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_service_regions" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "country" VARCHAR(80) NOT NULL,
    "region" VARCHAR(120),
    "city" VARCHAR(120),
    "radius_km" INTEGER,
    "travel_fee_policy" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_service_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_availability_blocks" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "VendorAvailabilityStatus" NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "note_private" VARCHAR(1000),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_portfolio_references" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "alt_text" VARCHAR(500) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_portfolio_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_favorites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_shortlists" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "category" "VendorCategory",
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_shortlist_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "shortlist_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_shortlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requests_for_quote" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "wedding_event_id" UUID,
    "event_date" DATE,
    "guest_count" INTEGER,
    "location_snapshot" JSONB NOT NULL DEFAULT '{}',
    "budget_range_min_minor" BIGINT,
    "budget_range_max_minor" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "response_deadline" TIMESTAMP(3) NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "sent_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(1000),
    "idempotency_key" VARCHAR(200),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "requests_for_quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_requirements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "label" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "required" BOOLEAN NOT NULL DEFAULT false,
    "value" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rfq_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_questions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "question" VARCHAR(1000) NOT NULL,
    "response_type" "RfqQuestionResponseType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rfq_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_recipients" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "status" "RfqRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rfq_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfq_recipient_snapshots" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "rfq_recipient_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "vendor_display_name" VARCHAR(180) NOT NULL,
    "vendor_profile_slug" VARCHAR(120),
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfq_recipient_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_offers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "rfq_recipient_id" UUID NOT NULL,
    "status" "VendorOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" BIGINT NOT NULL DEFAULT 0,
    "discount_minor" BIGINT NOT NULL DEFAULT 0,
    "tax_minor" BIGINT NOT NULL DEFAULT 0,
    "total_minor" BIGINT NOT NULL DEFAULT 0,
    "deposit_minor" BIGINT,
    "valid_until" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(200),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_offer_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" BIGINT NOT NULL,
    "discount_minor" BIGINT NOT NULL,
    "taxable_base_minor" BIGINT NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL DEFAULT 0,
    "tax_minor" BIGINT NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "deposit_minor" BIGINT,
    "pricing_notes" TEXT,
    "terms" JSONB NOT NULL DEFAULT '{}',
    "availability_confirmation" VARCHAR(1000) NOT NULL,
    "delivery_timeline" VARCHAR(2000) NOT NULL,
    "cancellation_terms" VARCHAR(3000) NOT NULL,
    "valid_until" TIMESTAMP(3),
    "content_hash" CHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_offer_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_offer_line_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "offer_version_id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "line_total_minor" BIGINT NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_offer_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_offer_answers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "offer_version_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_offer_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_threads" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "status" "NegotiationThreadStatus" NOT NULL DEFAULT 'OPEN',
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "negotiation_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_messages" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "sender_type" "NegotiationSenderType" NOT NULL,
    "sender_user_id" UUID,
    "type" "NegotiationMessageType" NOT NULL DEFAULT 'MESSAGE',
    "body" VARCHAR(5000) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "negotiation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bookings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "status" "VendorBookingStatus" NOT NULL DEFAULT 'PENDING_CONTRACT',
    "currency" CHAR(3) NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "deposit_minor" BIGINT,
    "service_start_at" TIMESTAMP(3),
    "service_end_at" TIMESTAMP(3),
    "accepted_offer_version" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" VARCHAR(2000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_service_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "source_offer_line_item_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" VARCHAR(40) NOT NULL,
    "unit_price_minor" BIGINT NOT NULL,
    "total_minor" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_service_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_milestones" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "due_at" TIMESTAMP(3),
    "amount_minor" BIGINT,
    "status" "BookingMilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "booking_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contracts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "status" "VendorContractStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "agreed_version_id" UUID,
    "created_by" UUID NOT NULL,
    "ready_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_contract_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "service_scope" JSONB NOT NULL,
    "payment_terms" JSONB NOT NULL,
    "cancellation_terms" TEXT NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_party_acknowledgements" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "party_type" "ContractPartyType" NOT NULL,
    "user_id" UUID NOT NULL,
    "typed_name" VARCHAR(180) NOT NULL,
    "statement_version" VARCHAR(80) NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_party_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_plans" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "target_total_minor" BIGINT NOT NULL,
    "contingency_percent" INTEGER NOT NULL DEFAULT 0,
    "status" "BudgetPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "budget_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "budget_plan_id" UUID NOT NULL,
    "parent_category_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "canonical_type" VARCHAR(80),
    "allocated_minor" BIGINT NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "budget_plan_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "status" "BudgetItemStatus" NOT NULL DEFAULT 'PLANNED',
    "source_type" "BudgetSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_id" UUID,
    "vendor_organization_id" UUID,
    "estimated_minor" BIGINT NOT NULL DEFAULT 0,
    "quoted_minor" BIGINT,
    "committed_minor" BIGINT,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "due_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "budget_item_id" UUID NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "expense_date" DATE NOT NULL,
    "status" "ExpenseRecordStatus" NOT NULL DEFAULT 'PLANNED',
    "payment_method_label" VARCHAR(120),
    "reference" VARCHAR(180),
    "notes_private" TEXT,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "expense_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedule_entries" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "budget_item_id" UUID NOT NULL,
    "booking_id" UUID,
    "contract_id" UUID,
    "vendor_organization_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "paid_minor" BIGINT NOT NULL DEFAULT 0,
    "due_at" TIMESTAMP(3) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "PaymentScheduleStatus" NOT NULL DEFAULT 'UPCOMING',
    "notes" VARCHAR(2000),
    "reminder_sent_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payment_schedule_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "payment_schedule_entry_id" UUID,
    "budget_item_id" UUID NOT NULL,
    "booking_id" UUID,
    "contract_id" UUID,
    "vendor_organization_id" UUID,
    "amount_minor" BIGINT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'RECORDED',
    "reference" VARCHAR(180),
    "notes_private" TEXT,
    "reversal_of_id" UUID,
    "idempotency_key" VARCHAR(200),
    "created_by" UUID NOT NULL,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_notifications" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(80) NOT NULL,
    "priority" VARCHAR(40) NOT NULL DEFAULT 'normal',
    "title" VARCHAR(180) NOT NULL,
    "body" VARCHAR(1000) NOT NULL,
    "action_url" VARCHAR(2048),
    "source_event_id" UUID NOT NULL,
    "deduplication_key" VARCHAR(240) NOT NULL,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_organizations_created_by_status_idx" ON "vendor_organizations"("created_by", "status");

-- CreateIndex
CREATE INDEX "vendor_organizations_display_name_idx" ON "vendor_organizations"("display_name");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_role_templates_key_key" ON "vendor_role_templates"("key");

-- CreateIndex
CREATE INDEX "vendor_organization_memberships_user_id_status_idx" ON "vendor_organization_memberships"("user_id", "status");

-- CreateIndex
CREATE INDEX "vendor_organization_memberships_vendor_organization_id_stat_idx" ON "vendor_organization_memberships"("vendor_organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_organization_memberships_vendor_organization_id_user_key" ON "vendor_organization_memberships"("vendor_organization_id", "user_id");

-- CreateIndex
CREATE INDEX "vendor_membership_capability_overrides_vendor_organization__idx" ON "vendor_membership_capability_overrides"("vendor_organization_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_membership_capability_overrides_membership_id_capabi_key" ON "vendor_membership_capability_overrides"("membership_id", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_organization_invitations_token_hash_key" ON "vendor_organization_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "vendor_organization_invitations_vendor_organization_id_stat_idx" ON "vendor_organization_invitations"("vendor_organization_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "vendor_organization_invitations_email_status_idx" ON "vendor_organization_invitations"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_vendor_organization_id_key" ON "vendor_profiles"("vendor_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_profiles_slug_key" ON "vendor_profiles"("slug");

-- CreateIndex
CREATE INDEX "vendor_profiles_publication_status_categories_idx" ON "vendor_profiles"("publication_status", "categories");

-- CreateIndex
CREATE INDEX "vendor_profiles_verification_status_publication_status_idx" ON "vendor_profiles"("verification_status", "publication_status");

-- CreateIndex
CREATE INDEX "vendor_services_vendor_organization_id_active_category_idx" ON "vendor_services"("vendor_organization_id", "active", "category");

-- CreateIndex
CREATE INDEX "vendor_packages_vendor_organization_id_service_id_active_po_idx" ON "vendor_packages"("vendor_organization_id", "service_id", "active", "position");

-- CreateIndex
CREATE INDEX "vendor_service_regions_vendor_organization_id_country_regio_idx" ON "vendor_service_regions"("vendor_organization_id", "country", "region", "city");

-- CreateIndex
CREATE INDEX "vendor_availability_blocks_vendor_organization_id_start_at__idx" ON "vendor_availability_blocks"("vendor_organization_id", "start_at", "end_at", "status");

-- CreateIndex
CREATE INDEX "vendor_portfolio_references_vendor_organization_id_publishe_idx" ON "vendor_portfolio_references"("vendor_organization_id", "published", "position");

-- CreateIndex
CREATE INDEX "vendor_favorites_workspace_id_created_at_idx" ON "vendor_favorites"("workspace_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_favorites_workspace_id_user_id_vendor_organization_i_key" ON "vendor_favorites"("workspace_id", "user_id", "vendor_organization_id");

-- CreateIndex
CREATE INDEX "vendor_shortlists_workspace_id_category_created_at_idx" ON "vendor_shortlists"("workspace_id", "category", "created_at");

-- CreateIndex
CREATE INDEX "vendor_shortlist_items_workspace_id_shortlist_id_position_idx" ON "vendor_shortlist_items"("workspace_id", "shortlist_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_shortlist_items_shortlist_id_vendor_organization_id_key" ON "vendor_shortlist_items"("shortlist_id", "vendor_organization_id");

-- CreateIndex
CREATE INDEX "requests_for_quote_workspace_id_status_response_deadline_idx" ON "requests_for_quote"("workspace_id", "status", "response_deadline");

-- CreateIndex
CREATE INDEX "requests_for_quote_workspace_id_category_created_at_idx" ON "requests_for_quote"("workspace_id", "category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "requests_for_quote_workspace_id_created_by_idempotency_key_key" ON "requests_for_quote"("workspace_id", "created_by", "idempotency_key");

-- CreateIndex
CREATE INDEX "rfq_requirements_workspace_id_rfq_id_position_idx" ON "rfq_requirements"("workspace_id", "rfq_id", "position");

-- CreateIndex
CREATE INDEX "rfq_questions_workspace_id_rfq_id_position_idx" ON "rfq_questions"("workspace_id", "rfq_id", "position");

-- CreateIndex
CREATE INDEX "rfq_recipients_workspace_id_status_expires_at_idx" ON "rfq_recipients"("workspace_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "rfq_recipients_vendor_organization_id_status_expires_at_idx" ON "rfq_recipients"("vendor_organization_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_recipients_rfq_id_vendor_organization_id_key" ON "rfq_recipients"("rfq_id", "vendor_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfq_recipient_snapshots_rfq_recipient_id_key" ON "rfq_recipient_snapshots"("rfq_recipient_id");

-- CreateIndex
CREATE INDEX "rfq_recipient_snapshots_vendor_organization_id_created_at_idx" ON "rfq_recipient_snapshots"("vendor_organization_id", "created_at");

-- CreateIndex
CREATE INDEX "vendor_offers_workspace_id_status_submitted_at_idx" ON "vendor_offers"("workspace_id", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "vendor_offers_vendor_organization_id_status_updated_at_idx" ON "vendor_offers"("vendor_organization_id", "status", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_offers_rfq_id_vendor_organization_id_key" ON "vendor_offers"("rfq_id", "vendor_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_offers_vendor_organization_id_created_by_idempotency_key" ON "vendor_offers"("vendor_organization_id", "created_by", "idempotency_key");

-- CreateIndex
CREATE INDEX "vendor_offer_versions_workspace_id_offer_id_version_number_idx" ON "vendor_offer_versions"("workspace_id", "offer_id", "version_number");

-- CreateIndex
CREATE INDEX "vendor_offer_versions_vendor_organization_id_created_at_idx" ON "vendor_offer_versions"("vendor_organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_offer_versions_offer_id_version_number_key" ON "vendor_offer_versions"("offer_id", "version_number");

-- CreateIndex
CREATE INDEX "vendor_offer_line_items_workspace_id_offer_version_id_posit_idx" ON "vendor_offer_line_items"("workspace_id", "offer_version_id", "position");

-- CreateIndex
CREATE INDEX "vendor_offer_line_items_vendor_organization_id_offer_versio_idx" ON "vendor_offer_line_items"("vendor_organization_id", "offer_version_id");

-- CreateIndex
CREATE INDEX "vendor_offer_answers_workspace_id_offer_version_id_idx" ON "vendor_offer_answers"("workspace_id", "offer_version_id");

-- CreateIndex
CREATE INDEX "vendor_offer_answers_vendor_organization_id_offer_version_i_idx" ON "vendor_offer_answers"("vendor_organization_id", "offer_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_offer_answers_offer_version_id_question_id_key" ON "vendor_offer_answers"("offer_version_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "negotiation_threads_offer_id_key" ON "negotiation_threads"("offer_id");

-- CreateIndex
CREATE INDEX "negotiation_threads_workspace_id_status_last_message_at_idx" ON "negotiation_threads"("workspace_id", "status", "last_message_at");

-- CreateIndex
CREATE INDEX "negotiation_threads_vendor_organization_id_status_last_mess_idx" ON "negotiation_threads"("vendor_organization_id", "status", "last_message_at");

-- CreateIndex
CREATE INDEX "negotiation_messages_workspace_id_thread_id_created_at_idx" ON "negotiation_messages"("workspace_id", "thread_id", "created_at");

-- CreateIndex
CREATE INDEX "negotiation_messages_vendor_organization_id_thread_id_creat_idx" ON "negotiation_messages"("vendor_organization_id", "thread_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bookings_offer_id_key" ON "vendor_bookings"("offer_id");

-- CreateIndex
CREATE INDEX "vendor_bookings_workspace_id_status_service_start_at_idx" ON "vendor_bookings"("workspace_id", "status", "service_start_at");

-- CreateIndex
CREATE INDEX "vendor_bookings_vendor_organization_id_status_service_start_idx" ON "vendor_bookings"("vendor_organization_id", "status", "service_start_at");

-- CreateIndex
CREATE INDEX "booking_service_items_workspace_id_booking_id_idx" ON "booking_service_items"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_service_items_vendor_organization_id_booking_id_idx" ON "booking_service_items"("vendor_organization_id", "booking_id");

-- CreateIndex
CREATE INDEX "booking_milestones_workspace_id_booking_id_position_idx" ON "booking_milestones"("workspace_id", "booking_id", "position");

-- CreateIndex
CREATE INDEX "booking_milestones_vendor_organization_id_booking_id_due_at_idx" ON "booking_milestones"("vendor_organization_id", "booking_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_contracts_booking_id_key" ON "vendor_contracts"("booking_id");

-- CreateIndex
CREATE INDEX "vendor_contracts_workspace_id_status_created_at_idx" ON "vendor_contracts"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "vendor_contracts_vendor_organization_id_status_created_at_idx" ON "vendor_contracts"("vendor_organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "vendor_contract_versions_workspace_id_contract_id_version_n_idx" ON "vendor_contract_versions"("workspace_id", "contract_id", "version_number");

-- CreateIndex
CREATE INDEX "vendor_contract_versions_vendor_organization_id_contract_id_idx" ON "vendor_contract_versions"("vendor_organization_id", "contract_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_contract_versions_contract_id_version_number_key" ON "vendor_contract_versions"("contract_id", "version_number");

-- CreateIndex
CREATE INDEX "contract_party_acknowledgements_workspace_id_contract_id_idx" ON "contract_party_acknowledgements"("workspace_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_party_acknowledgements_vendor_organization_id_cont_idx" ON "contract_party_acknowledgements"("vendor_organization_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_party_acknowledgements_contract_version_id_party_t_key" ON "contract_party_acknowledgements"("contract_version_id", "party_type");

-- CreateIndex
CREATE UNIQUE INDEX "budget_plans_workspace_id_key" ON "budget_plans"("workspace_id");

-- CreateIndex
CREATE INDEX "budget_plans_workspace_id_status_idx" ON "budget_plans"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "budget_categories_workspace_id_budget_plan_id_position_idx" ON "budget_categories"("workspace_id", "budget_plan_id", "position");

-- CreateIndex
CREATE INDEX "budget_categories_workspace_id_parent_category_id_idx" ON "budget_categories"("workspace_id", "parent_category_id");

-- CreateIndex
CREATE INDEX "budget_items_workspace_id_category_id_status_idx" ON "budget_items"("workspace_id", "category_id", "status");

-- CreateIndex
CREATE INDEX "budget_items_workspace_id_source_type_source_id_idx" ON "budget_items"("workspace_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "budget_items_workspace_id_vendor_organization_id_idx" ON "budget_items"("workspace_id", "vendor_organization_id");

-- CreateIndex
CREATE INDEX "expense_records_workspace_id_budget_item_id_status_expense__idx" ON "expense_records"("workspace_id", "budget_item_id", "status", "expense_date");

-- CreateIndex
CREATE INDEX "payment_schedule_entries_workspace_id_status_due_at_idx" ON "payment_schedule_entries"("workspace_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "payment_schedule_entries_workspace_id_booking_id_idx" ON "payment_schedule_entries"("workspace_id", "booking_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_schedule_entries_budget_item_id_sequence_key" ON "payment_schedule_entries"("budget_item_id", "sequence");

-- CreateIndex
CREATE INDEX "payment_records_workspace_id_budget_item_id_status_paid_at_idx" ON "payment_records"("workspace_id", "budget_item_id", "status", "paid_at");

-- CreateIndex
CREATE INDEX "payment_records_workspace_id_payment_schedule_entry_id_idx" ON "payment_records"("workspace_id", "payment_schedule_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_workspace_id_created_by_idempotency_key_key" ON "payment_records"("workspace_id", "created_by", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_notifications_deduplication_key_key" ON "vendor_notifications"("deduplication_key");

-- CreateIndex
CREATE INDEX "vendor_notifications_vendor_organization_id_user_id_dismiss_idx" ON "vendor_notifications"("vendor_organization_id", "user_id", "dismissed_at", "created_at");

-- CreateIndex
CREATE INDEX "background_jobs_vendor_organization_id_status_created_at_idx" ON "background_jobs"("vendor_organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "delivery_attempts_vendor_organization_id_created_at_idx" ON "delivery_attempts"("vendor_organization_id", "created_at");

-- CreateIndex
CREATE INDEX "generated_artifacts_vendor_organization_id_status_created_a_idx" ON "generated_artifacts"("vendor_organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_messages_vendor_organization_id_created_at_idx" ON "outbox_messages"("vendor_organization_id", "created_at");
