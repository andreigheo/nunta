-- CreateEnum
CREATE TYPE "InvitationSiteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InvitationAccessPolicy" AS ENUM ('TOKEN_ONLY', 'TOKEN_OR_ACCESS_CODE');

-- CreateEnum
CREATE TYPE "InvitationRecipientStatus" AS ENUM ('READY', 'QUEUED', 'SENT', 'OPENED', 'PARTIALLY_RESPONDED', 'RESPONDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CampaignPurpose" AS ENUM ('INVITATION', 'RSVP_REMINDER', 'INFORMATION_UPDATE', 'THANK_YOU', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CampaignChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'SENDING', 'COMPLETED', 'PARTIAL', 'FAILED', 'PAUSED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'UNSUBSCRIBED', 'CANCELLED');

-- CreateTable
CREATE TABLE "invitation_sites" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "status" "InvitationSiteStatus" NOT NULL DEFAULT 'DRAFT',
    "current_draft_version_id" UUID,
    "published_version_id" UUID,
    "default_language" VARCHAR(16) NOT NULL DEFAULT 'ro',
    "available_languages" JSONB NOT NULL DEFAULT '["ro"]',
    "access_policy" "InvitationAccessPolicy" NOT NULL DEFAULT 'TOKEN_ONLY',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invitation_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "invitation_site_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "language" VARCHAR(16) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "content_hash" CHAR(64) NOT NULL,

    CONSTRAINT "invitation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation_recipients" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "household_id" UUID,
    "guest_id" UUID,
    "invitation_version_id" UUID NOT NULL,
    "preferred_language" VARCHAR(16) NOT NULL DEFAULT 'ro',
    "personalization_snapshot" JSONB NOT NULL DEFAULT '{}',
    "status" "InvitationRecipientStatus" NOT NULL DEFAULT 'READY',
    "opened_at" TIMESTAMP(3),
    "last_accessed_at" TIMESTAMP(3),
    "rsvp_completed_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invitation_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_access_grants" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "invitation_recipient_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "guest_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "purpose" "CampaignPurpose" NOT NULL,
    "channel" "CampaignChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "invitation_version_id" UUID,
    "template" JSONB NOT NULL,
    "audience_filter" JSONB NOT NULL DEFAULT '{}',
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "background_job_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "invitation_recipient_id" UUID NOT NULL,
    "guest_id" UUID,
    "household_id" UUID,
    "address" VARCHAR(320) NOT NULL,
    "personalization_snapshot" JSONB NOT NULL DEFAULT '{}',
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "queued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(100),
    "provider_message_id" VARCHAR(255),
    "dedupe_key" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "provider_message_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(80) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitation_sites_workspace_id_key" ON "invitation_sites"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_sites_slug_key" ON "invitation_sites"("slug");

-- CreateIndex
CREATE INDEX "invitation_sites_workspace_id_status_idx" ON "invitation_sites"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "invitation_versions_workspace_id_invitation_site_id_created_idx" ON "invitation_versions"("workspace_id", "invitation_site_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_versions_invitation_site_id_version_number_key" ON "invitation_versions"("invitation_site_id", "version_number");

-- CreateIndex
CREATE INDEX "invitation_recipients_workspace_id_status_created_at_idx" ON "invitation_recipients"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "invitation_recipients_workspace_id_household_id_idx" ON "invitation_recipients"("workspace_id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_recipients_invitation_version_id_household_id_gu_key" ON "invitation_recipients"("invitation_version_id", "household_id", "guest_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_access_grants_token_hash_key" ON "guest_access_grants"("token_hash");

-- CreateIndex
CREATE INDEX "guest_access_grants_workspace_id_household_id_revoked_at_idx" ON "guest_access_grants"("workspace_id", "household_id", "revoked_at");

-- CreateIndex
CREATE INDEX "guest_access_grants_invitation_recipient_id_revoked_at_idx" ON "guest_access_grants"("invitation_recipient_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_background_job_id_key" ON "campaigns"("background_job_id");

-- CreateIndex
CREATE INDEX "campaigns_workspace_id_status_created_at_idx" ON "campaigns"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_dedupe_key_key" ON "campaign_recipients"("dedupe_key");

-- CreateIndex
CREATE INDEX "campaign_recipients_workspace_id_campaign_id_status_idx" ON "campaign_recipients"("workspace_id", "campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_provider_message_id_idx" ON "campaign_recipients"("provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_invitation_recipient_id_key" ON "campaign_recipients"("campaign_id", "invitation_recipient_id");

-- CreateIndex
CREATE INDEX "provider_webhook_events_provider_provider_message_id_idx" ON "provider_webhook_events"("provider", "provider_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_provider_event_id_key" ON "provider_webhook_events"("provider", "provider_event_id");

ALTER TABLE "invitation_sites" ADD CONSTRAINT "invitation_sites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_versions" ADD CONSTRAINT "invitation_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_versions" ADD CONSTRAINT "invitation_versions_invitation_site_id_fkey" FOREIGN KEY ("invitation_site_id") REFERENCES "invitation_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_versions" ADD CONSTRAINT "invitation_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_sites" ADD CONSTRAINT "invitation_sites_draft_version_id_fkey" FOREIGN KEY ("current_draft_version_id") REFERENCES "invitation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation_sites" ADD CONSTRAINT "invitation_sites_published_version_id_fkey" FOREIGN KEY ("published_version_id") REFERENCES "invitation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_invitation_version_id_fkey" FOREIGN KEY ("invitation_version_id") REFERENCES "invitation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_recipients" ADD CONSTRAINT "invitation_recipients_target_check" CHECK (("household_id" IS NOT NULL) <> ("guest_id" IS NOT NULL));
ALTER TABLE "guest_access_grants" ADD CONSTRAINT "guest_access_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_access_grants" ADD CONSTRAINT "guest_access_grants_recipient_id_fkey" FOREIGN KEY ("invitation_recipient_id") REFERENCES "invitation_recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guest_access_grants" ADD CONSTRAINT "guest_access_grants_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_invitation_version_id_fkey" FOREIGN KEY ("invitation_version_id") REFERENCES "invitation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_background_job_id_fkey" FOREIGN KEY ("background_job_id") REFERENCES "background_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_invitation_recipient_id_fkey" FOREIGN KEY ("invitation_recipient_id") REFERENCES "invitation_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "guest_contact_logs" ADD CONSTRAINT "guest_contact_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
