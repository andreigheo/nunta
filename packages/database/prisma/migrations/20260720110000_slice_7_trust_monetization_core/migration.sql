BEGIN;

-- CreateEnum
CREATE TYPE "ReviewEligibilityType" AS ENUM ('COMPLETED_BOOKING', 'CANCELLED_AFTER_SERVICE', 'MANUAL_ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "ReviewEligibilityStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'CONSUMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "VendorReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PUBLISHED', 'UNDER_REVIEW', 'HIDDEN', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReviewVerificationStatus" AS ENUM ('VERIFIED_BOOKING', 'ADMIN_VERIFIED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReviewCriterion" AS ENUM ('QUALITY', 'COMMUNICATION', 'RELIABILITY', 'VALUE', 'PROFESSIONALISM', 'FLEXIBILITY');

-- CreateEnum
CREATE TYPE "VendorReviewReplyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VendorReviewDisputeStatus" AS ENUM ('OPEN', 'EVIDENCE_REQUESTED', 'UNDER_REVIEW', 'UPHELD', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ReviewModerationStatus" AS ENUM ('OPEN', 'TRIAGED', 'INVESTIGATING', 'AWAITING_INFORMATION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReviewModerationDecisionType" AS ENUM ('NO_ACTION', 'HIDE_CONTENT', 'RESTORE_CONTENT', 'REMOVE_PII', 'REJECT_REVIEW', 'REVOKE_VERIFICATION', 'SUSPEND_REVIEW', 'SUSPEND_VENDOR_PROFILE');

-- CreateEnum
CREATE TYPE "SubscriptionCatalogStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubscriptionBillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "EntitlementValueType" AS ENUM ('BOOLEAN', 'INTEGER', 'STRING');

-- CreateEnum
CREATE TYPE "VendorSubscriptionStatus" AS ENUM ('INCOMPLETE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'PAUSED', 'CANCELLED', 'EXPIRED', 'UNPAID');

-- CreateEnum
CREATE TYPE "VendorPayoutAccountStatus" AS ENUM ('CREATING', 'RESTRICTED', 'PENDING', 'ACTIVE', 'DISABLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformFeeRuleType" AS ENUM ('PERCENTAGE', 'FIXED', 'PERCENTAGE_PLUS_FIXED');

-- CreateEnum
CREATE TYPE "PlatformFeeScope" AS ENUM ('GLOBAL', 'VENDOR_CATEGORY', 'SUBSCRIPTION_PLAN', 'VENDOR_OVERRIDE');

-- CreateEnum
CREATE TYPE "MarketplaceAllocationStatus" AS ENUM ('PENDING', 'ALLOCATED', 'ON_HOLD', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'ELIGIBLE', 'SETTLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorPayableEntryType" AS ENUM ('PAYMENT_EARNED', 'PLATFORM_FEE', 'REFUND_ADJUSTMENT', 'DISPUTE_HOLD', 'DISPUTE_RELEASE', 'PAYOUT', 'PAYOUT_REVERSAL', 'MANUAL_ADJUSTMENT', 'RESERVE_HOLD', 'RESERVE_RELEASE');

-- CreateEnum
CREATE TYPE "VendorSettlementStatus" AS ENUM ('DRAFT', 'CALCULATING', 'READY', 'FINALIZED', 'PAYOUT_PENDING', 'PAID', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VendorPayoutStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'RETURNED');

-- CreateTable
CREATE TABLE "review_eligibilities" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "eligible_user_id" UUID NOT NULL,
    "eligibility_type" "ReviewEligibilityType" NOT NULL,
    "status" "ReviewEligibilityStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "eligible_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" VARCHAR(1000),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_eligibilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_reviews" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "eligibility_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "status" "VendorReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "verification_status" "ReviewVerificationStatus" NOT NULL DEFAULT 'VERIFIED_BOOKING',
    "overall_rating" INTEGER NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "public_display_name" VARCHAR(120) NOT NULL,
    "published_version_id" UUID,
    "current_draft_version_id" UUID,
    "published_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_versions" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "language" VARCHAR(12) NOT NULL DEFAULT 'ro',
    "overall_rating" INTEGER NOT NULL,
    "criterion_snapshot" JSONB NOT NULL DEFAULT '{}',
    "content_hash" CHAR(64) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "immutable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vendor_review_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_criterion_ratings" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "criterion" "ReviewCriterion" NOT NULL,
    "rating" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_review_criterion_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_replies" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "review_version_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "status" "VendorReviewReplyStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "edited_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_review_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_reports" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "vendor_organization_id" UUID,
    "reporter_user_id" UUID NOT NULL,
    "reason" VARCHAR(80) NOT NULL,
    "details_private" VARCHAR(2000),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_disputes" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "statement_private" VARCHAR(4000) NOT NULL,
    "status" "VendorReviewDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_review_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_moderation_cases" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" UUID NOT NULL,
    "priority" VARCHAR(40) NOT NULL DEFAULT 'NORMAL',
    "status" "ReviewModerationStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to_user_id" UUID,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_review_moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_review_moderation_decisions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "decision" "ReviewModerationDecisionType" NOT NULL,
    "reason" VARCHAR(2000) NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "previous_public_state" JSONB NOT NULL,
    "idempotency_key" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_review_moderation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_rating_aggregates" (
    "vendor_organization_id" UUID NOT NULL,
    "published_review_count" INTEGER NOT NULL DEFAULT 0,
    "verified_review_count" INTEGER NOT NULL DEFAULT 0,
    "overall_average_scaled" INTEGER,
    "quality_average_scaled" INTEGER,
    "communication_average_scaled" INTEGER,
    "reliability_average_scaled" INTEGER,
    "value_average_scaled" INTEGER,
    "professionalism_average_scaled" INTEGER,
    "flexibility_average_scaled" INTEGER,
    "rating_1_count" INTEGER NOT NULL DEFAULT 0,
    "rating_2_count" INTEGER NOT NULL DEFAULT 0,
    "rating_3_count" INTEGER NOT NULL DEFAULT 0,
    "rating_4_count" INTEGER NOT NULL DEFAULT 0,
    "rating_5_count" INTEGER NOT NULL DEFAULT 0,
    "last_review_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_rating_aggregates_pkey" PRIMARY KEY ("vendor_organization_id")
);

-- CreateTable
CREATE TABLE "subscription_products" (
    "id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "SubscriptionCatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_prices" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_price_id" VARCHAR(180),
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "billing_interval" "SubscriptionBillingInterval" NOT NULL,
    "billing_interval_count" INTEGER NOT NULL DEFAULT 1,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "status" "SubscriptionCatalogStatus" NOT NULL DEFAULT 'DRAFT',
    "fallback_plan_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_entitlements" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value_type" "EntitlementValueType" NOT NULL,
    "boolean_value" BOOLEAN,
    "integer_value" INTEGER,
    "string_value" VARCHAR(500),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_subscriptions" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "price_id" UUID,
    "provider" VARCHAR(80) NOT NULL,
    "provider_customer_id" VARCHAR(180),
    "provider_subscription_id" VARCHAR(180),
    "status" "VendorSubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "trial_start_at" TIMESTAMP(3),
    "trial_end_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "grace_period_end_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_subscription_periods" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status_snapshot" VARCHAR(40) NOT NULL,
    "provider_invoice_id" VARCHAR(180),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_subscription_history" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "status_from" VARCHAR(40),
    "status_to" VARCHAR(40) NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(180) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_entitlement_snapshots" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "subscription_id" UUID,
    "plan_id" UUID NOT NULL,
    "entitlements" JSONB NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_entitlement_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_usage_counters" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "entitlement_key" VARCHAR(100) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_provider_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_event_id" VARCHAR(180) NOT NULL,
    "provider_customer_id" VARCHAR(180),
    "provider_subscription_id" VARCHAR(180),
    "event_type" VARCHAR(100) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" VARCHAR(40) NOT NULL,

    CONSTRAINT "subscription_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoice_records" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "provider_invoice_id" VARCHAR(180) NOT NULL,
    "amount_due_minor" BIGINT NOT NULL,
    "amount_paid_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "provider_metadata_redacted" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoice_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_checkouts" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "price_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_checkout_id" VARCHAR(180) NOT NULL,
    "hosted_url" VARCHAR(2048) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payout_accounts" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_account_id" VARCHAR(180) NOT NULL,
    "status" "VendorPayoutAccountStatus" NOT NULL DEFAULT 'CREATING',
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "details_submitted" BOOLEAN NOT NULL DEFAULT false,
    "requirements_due" JSONB NOT NULL DEFAULT '[]',
    "requirements_past_due" JSONB NOT NULL DEFAULT '[]',
    "disabled_reason" VARCHAR(500),
    "country" CHAR(2) NOT NULL,
    "default_currency" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payout_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payout_capabilities" (
    "id" UUID NOT NULL,
    "payout_account_id" UUID NOT NULL,
    "capability" VARCHAR(80) NOT NULL,
    "status" VARCHAR(40) NOT NULL,
    "requirements" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_payout_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payout_onboarding_sessions" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "payout_account_id" UUID NOT NULL,
    "provider_link_id" VARCHAR(180),
    "hosted_url" VARCHAR(2048) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "vendor_payout_onboarding_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_provider_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_event_id" VARCHAR(180) NOT NULL,
    "provider_account_id" VARCHAR(180),
    "provider_payout_id" VARCHAR(180),
    "event_type" VARCHAR(100) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" VARCHAR(40) NOT NULL,

    CONSTRAINT "payout_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_fee_policies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "rule_type" "PlatformFeeRuleType" NOT NULL,
    "scope" "PlatformFeeScope" NOT NULL,
    "vendor_organization_id" UUID,
    "vendor_category" "VendorCategory",
    "subscription_plan_id" UUID,
    "percentage_basis_points" INTEGER,
    "fixed_minor" BIGINT,
    "currency" CHAR(3),
    "minimum_fee_minor" BIGINT,
    "maximum_fee_minor" BIGINT,
    "active_from" TIMESTAMP(3) NOT NULL,
    "active_until" TIMESTAMP(3),
    "status" "SubscriptionCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_fee_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_payment_allocations" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "gross_minor" BIGINT NOT NULL,
    "platform_fee_minor" BIGINT NOT NULL,
    "vendor_net_minor" BIGINT NOT NULL,
    "refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "disputed_minor" BIGINT NOT NULL DEFAULT 0,
    "eligible_for_payout_minor" BIGINT NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL,
    "status" "MarketplaceAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
    "fee_policy_snapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payable_entries" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "allocation_id" UUID,
    "entry_type" "VendorPayableEntryType" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source_type" VARCHAR(80) NOT NULL,
    "source_id" UUID NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(40) NOT NULL DEFAULT 'CONFIRMED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_settlements" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "payout_account_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "gross_minor" BIGINT NOT NULL DEFAULT 0,
    "platform_fee_minor" BIGINT NOT NULL DEFAULT 0,
    "refund_minor" BIGINT NOT NULL DEFAULT 0,
    "dispute_hold_minor" BIGINT NOT NULL DEFAULT 0,
    "reserve_minor" BIGINT NOT NULL DEFAULT 0,
    "net_payout_minor" BIGINT NOT NULL DEFAULT 0,
    "status" "VendorSettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotency_key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),

    CONSTRAINT "vendor_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_settlement_lines" (
    "id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "allocation_id" UUID,
    "payable_entry_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payouts" (
    "id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,
    "payout_account_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_payout_id" VARCHAR(180),
    "currency" CHAR(3) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "status" "VendorPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "failure_code" VARCHAR(120),
    "failure_message_redacted" VARCHAR(500),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "returned_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "vendor_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payout_attempts" (
    "id" UUID NOT NULL,
    "payout_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "provider_attempt_id" VARCHAR(180),
    "status" VARCHAR(40) NOT NULL,
    "failure_code" VARCHAR(120),
    "failure_message_redacted" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "vendor_payout_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_capability_grants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "capability" VARCHAR(100) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "granted_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "platform_capability_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_eligibilities_dedupe_key_key" ON "review_eligibilities"("dedupe_key");

-- CreateIndex
CREATE INDEX "review_eligibilities_workspace_id_eligible_user_id_status_idx" ON "review_eligibilities"("workspace_id", "eligible_user_id", "status");

-- CreateIndex
CREATE INDEX "review_eligibilities_vendor_organization_id_status_eligible_idx" ON "review_eligibilities"("vendor_organization_id", "status", "eligible_at");

-- CreateIndex
CREATE UNIQUE INDEX "review_eligibilities_booking_id_eligible_user_id_key" ON "review_eligibilities"("booking_id", "eligible_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_reviews_eligibility_id_key" ON "vendor_reviews"("eligibility_id");

-- CreateIndex
CREATE INDEX "vendor_reviews_workspace_id_author_user_id_status_idx" ON "vendor_reviews"("workspace_id", "author_user_id", "status");

-- CreateIndex
CREATE INDEX "vendor_reviews_vendor_organization_id_status_published_at_idx" ON "vendor_reviews"("vendor_organization_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_reviews_booking_id_author_user_id_key" ON "vendor_reviews"("booking_id", "author_user_id");

-- CreateIndex
CREATE INDEX "vendor_review_versions_review_id_created_at_idx" ON "vendor_review_versions"("review_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_versions_review_id_version_number_key" ON "vendor_review_versions"("review_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_versions_review_id_content_hash_key" ON "vendor_review_versions"("review_id", "content_hash");

-- CreateIndex
CREATE INDEX "vendor_review_criterion_ratings_review_id_version_id_idx" ON "vendor_review_criterion_ratings"("review_id", "version_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_criterion_ratings_version_id_criterion_key" ON "vendor_review_criterion_ratings"("version_id", "criterion");

-- CreateIndex
CREATE INDEX "vendor_review_replies_vendor_organization_id_status_created_idx" ON "vendor_review_replies"("vendor_organization_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_replies_review_id_vendor_organization_id_key" ON "vendor_review_replies"("review_id", "vendor_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_reports_dedupe_key_key" ON "vendor_review_reports"("dedupe_key");

-- CreateIndex
CREATE INDEX "vendor_review_reports_review_id_created_at_idx" ON "vendor_review_reports"("review_id", "created_at");

-- CreateIndex
CREATE INDEX "vendor_review_disputes_vendor_organization_id_status_opened_idx" ON "vendor_review_disputes"("vendor_organization_id", "status", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_disputes_review_id_vendor_organization_id_key" ON "vendor_review_disputes"("review_id", "vendor_organization_id");

-- CreateIndex
CREATE INDEX "vendor_review_moderation_cases_status_priority_opened_at_idx" ON "vendor_review_moderation_cases"("status", "priority", "opened_at");

-- CreateIndex
CREATE INDEX "vendor_review_moderation_cases_vendor_organization_id_statu_idx" ON "vendor_review_moderation_cases"("vendor_organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_moderation_cases_source_type_source_id_key" ON "vendor_review_moderation_cases"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_review_moderation_decisions_idempotency_key_key" ON "vendor_review_moderation_decisions"("idempotency_key");

-- CreateIndex
CREATE INDEX "vendor_review_moderation_decisions_case_id_created_at_idx" ON "vendor_review_moderation_decisions"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_products_key_key" ON "subscription_products"("key");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_prices_provider_price_id_key" ON "subscription_prices"("provider_price_id");

-- CreateIndex
CREATE INDEX "subscription_prices_product_id_active_currency_idx" ON "subscription_prices"("product_id", "active", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_key_key" ON "subscription_plans"("key");

-- CreateIndex
CREATE INDEX "subscription_plans_status_position_idx" ON "subscription_plans"("status", "position");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_entitlements_plan_id_key_key" ON "subscription_plan_entitlements"("plan_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_subscriptions_vendor_organization_id_key" ON "vendor_subscriptions"("vendor_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_subscriptions_provider_customer_id_key" ON "vendor_subscriptions"("provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_subscriptions_provider_subscription_id_key" ON "vendor_subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "vendor_subscriptions_status_current_period_end_idx" ON "vendor_subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE INDEX "vendor_subscription_periods_vendor_organization_id_starts_a_idx" ON "vendor_subscription_periods"("vendor_organization_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_subscription_periods_subscription_id_starts_at_ends__key" ON "vendor_subscription_periods"("subscription_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "vendor_subscription_history_vendor_organization_id_created__idx" ON "vendor_subscription_history"("vendor_organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_subscription_history_source_type_source_id_event_typ_key" ON "vendor_subscription_history"("source_type", "source_id", "event_type");

-- CreateIndex
CREATE INDEX "vendor_entitlement_snapshots_vendor_organization_id_superse_idx" ON "vendor_entitlement_snapshots"("vendor_organization_id", "superseded_at", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_usage_counters_vendor_organization_id_entitlement_ke_key" ON "vendor_usage_counters"("vendor_organization_id", "entitlement_key", "period_start");

-- CreateIndex
CREATE INDEX "subscription_provider_events_provider_subscription_id_recei_idx" ON "subscription_provider_events"("provider_subscription_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_provider_events_provider_provider_event_id_key" ON "subscription_provider_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoice_records_provider_invoice_id_key" ON "subscription_invoice_records"("provider_invoice_id");

-- CreateIndex
CREATE INDEX "subscription_invoice_records_vendor_organization_id_created_idx" ON "subscription_invoice_records"("vendor_organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_checkouts_provider_checkout_id_key" ON "subscription_checkouts"("provider_checkout_id");

-- CreateIndex
CREATE INDEX "subscription_checkouts_vendor_organization_id_status_expire_idx" ON "subscription_checkouts"("vendor_organization_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_checkouts_vendor_organization_id_created_by_id_key" ON "subscription_checkouts"("vendor_organization_id", "created_by", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_accounts_vendor_organization_id_key" ON "vendor_payout_accounts"("vendor_organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_accounts_provider_account_id_key" ON "vendor_payout_accounts"("provider_account_id");

-- CreateIndex
CREATE INDEX "vendor_payout_accounts_status_payouts_enabled_idx" ON "vendor_payout_accounts"("status", "payouts_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_capabilities_payout_account_id_capability_key" ON "vendor_payout_capabilities"("payout_account_id", "capability");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_onboarding_sessions_provider_link_id_key" ON "vendor_payout_onboarding_sessions"("provider_link_id");

-- CreateIndex
CREATE INDEX "vendor_payout_onboarding_sessions_vendor_organization_id_st_idx" ON "vendor_payout_onboarding_sessions"("vendor_organization_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_onboarding_sessions_vendor_organization_id_cr_key" ON "vendor_payout_onboarding_sessions"("vendor_organization_id", "created_by", "idempotency_key");

-- CreateIndex
CREATE INDEX "payout_provider_events_provider_account_id_received_at_idx" ON "payout_provider_events"("provider_account_id", "received_at");

-- CreateIndex
CREATE INDEX "payout_provider_events_provider_payout_id_received_at_idx" ON "payout_provider_events"("provider_payout_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_provider_events_provider_provider_event_id_key" ON "payout_provider_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "platform_fee_policies_scope_status_active_from_idx" ON "platform_fee_policies"("scope", "status", "active_from");

-- CreateIndex
CREATE INDEX "platform_fee_policies_vendor_organization_id_status_idx" ON "platform_fee_policies"("vendor_organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_payment_allocations_transaction_id_key" ON "marketplace_payment_allocations"("transaction_id");

-- CreateIndex
CREATE INDEX "marketplace_payment_allocations_vendor_organization_id_curr_idx" ON "marketplace_payment_allocations"("vendor_organization_id", "currency", "status", "available_at");

-- CreateIndex
CREATE INDEX "marketplace_payment_allocations_workspace_id_booking_id_idx" ON "marketplace_payment_allocations"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "vendor_payable_entries_vendor_organization_id_currency_stat_idx" ON "vendor_payable_entries"("vendor_organization_id", "currency", "status", "available_at");

-- CreateIndex
CREATE INDEX "vendor_payable_entries_allocation_id_created_at_idx" ON "vendor_payable_entries"("allocation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payable_entries_entry_type_source_type_source_id_key" ON "vendor_payable_entries"("entry_type", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "vendor_settlements_status_period_end_idx" ON "vendor_settlements"("status", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_settlements_vendor_organization_id_currency_period_s_key" ON "vendor_settlements"("vendor_organization_id", "currency", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_settlements_vendor_organization_id_idempotency_key_key" ON "vendor_settlements"("vendor_organization_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "vendor_settlement_lines_allocation_id_idx" ON "vendor_settlement_lines"("allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_settlement_lines_settlement_id_payable_entry_id_key" ON "vendor_settlement_lines"("settlement_id", "payable_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payouts_settlement_id_key" ON "vendor_payouts"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payouts_provider_payout_id_key" ON "vendor_payouts"("provider_payout_id");

-- CreateIndex
CREATE INDEX "vendor_payouts_vendor_organization_id_status_requested_at_idx" ON "vendor_payouts"("vendor_organization_id", "status", "requested_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payouts_vendor_organization_id_idempotency_key_key" ON "vendor_payouts"("vendor_organization_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_attempts_provider_attempt_id_key" ON "vendor_payout_attempts"("provider_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_payout_attempts_payout_id_attempt_number_key" ON "vendor_payout_attempts"("payout_id", "attempt_number");

-- CreateIndex
CREATE INDEX "platform_capability_grants_capability_active_idx" ON "platform_capability_grants"("capability", "active");

-- CreateIndex
CREATE UNIQUE INDEX "platform_capability_grants_user_id_capability_key" ON "platform_capability_grants"("user_id", "capability");

COMMIT;
