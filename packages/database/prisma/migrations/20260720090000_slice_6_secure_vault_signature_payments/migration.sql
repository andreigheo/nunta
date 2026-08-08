-- CreateEnum
CREATE TYPE "StoredObjectStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'VERIFYING', 'QUARANTINED', 'AVAILABLE', 'REJECTED', 'DELETING', 'DELETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StoredObjectScanStatus" AS ENUM ('PENDING', 'RUNNING', 'CLEAN', 'INFECTED', 'ERROR', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "StoredObjectEncryptionState" AS ENUM ('PROVIDER_MANAGED', 'APPLICATION_MANAGED', 'NONE');

-- CreateEnum
CREATE TYPE "FileUploadPurpose" AS ENUM ('CONTRACT_ATTACHMENT', 'BOOKING_DOCUMENT', 'EXPENSE_RECEIPT', 'PAYMENT_EVIDENCE', 'VENDOR_PORTFOLIO_IMAGE', 'VENDOR_LEGAL_DOCUMENT', 'GENERAL_COMMERCIAL_DOCUMENT');

-- CreateEnum
CREATE TYPE "FileUploadStatus" AS ENUM ('CREATED', 'UPLOADING', 'UPLOADED', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentClassification" AS ENUM ('GENERAL', 'COMMERCIAL', 'FINANCIAL', 'CONTRACTUAL', 'SENSITIVE', 'VENDOR_PRIVATE', 'WEDDING_PRIVATE', 'SHARED_PARTIES');

-- CreateEnum
CREATE TYPE "VaultDocumentType" AS ENUM ('CONTRACT', 'CONTRACT_ATTACHMENT', 'BOOKING_DOCUMENT', 'PAYMENT_EVIDENCE', 'EXPENSE_RECEIPT', 'VENDOR_LEGAL_DOCUMENT', 'VENDOR_PORTFOLIO_ASSET', 'OTHER');

-- CreateEnum
CREATE TYPE "VaultDocumentStatus" AS ENUM ('DRAFT', 'PROCESSING', 'AVAILABLE', 'QUARANTINED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentGrantType" AS ENUM ('USER', 'WORKSPACE', 'VENDOR_ORGANIZATION', 'CONTRACT_PARTY', 'BOOKING_PARTY');

-- CreateEnum
CREATE TYPE "DocumentPermission" AS ENUM ('READ', 'DOWNLOAD', 'MANAGE', 'SHARE');

-- CreateEnum
CREATE TYPE "SignatureLevel" AS ENUM ('TEST', 'STANDARD', 'ADVANCED', 'QUALIFIED');

-- CreateEnum
CREATE TYPE "SignatureEnvelopeStatus" AS ENUM ('DRAFT', 'CREATING', 'READY', 'SENT', 'VIEWED', 'PARTIALLY_SIGNED', 'COMPLETED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "SignatureSignerStatus" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OnlineCheckoutStatus" AS ENUM ('CREATING', 'OPEN', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "OnlineTransactionStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "OnlineRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "payment_records" ADD COLUMN     "source_id" UUID,
ADD COLUMN     "source_type" VARCHAR(80);

-- AlterTable
ALTER TABLE "vendor_contracts" ADD COLUMN     "signature_policy" VARCHAR(60) NOT NULL DEFAULT 'OPERATIONAL_ACKNOWLEDGEMENT',
ADD COLUMN     "signature_envelope_id" UUID,
ADD COLUMN     "electronically_signed_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_contracts_signature_envelope_id_key" ON "vendor_contracts"("signature_envelope_id");

-- CreateTable
CREATE TABLE "stored_objects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "storage_provider" VARCHAR(40) NOT NULL,
    "bucket" VARCHAR(180) NOT NULL,
    "object_key" VARCHAR(1024) NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "content_type_claimed" VARCHAR(180) NOT NULL,
    "content_type_detected" VARCHAR(180),
    "size_bytes" BIGINT,
    "checksum_sha256" CHAR(64),
    "etag" VARCHAR(180),
    "storage_class" VARCHAR(80),
    "encryption_state" "StoredObjectEncryptionState" NOT NULL DEFAULT 'PROVIDER_MANAGED',
    "status" "StoredObjectStatus" NOT NULL DEFAULT 'UPLOADING',
    "scan_status" "StoredObjectScanStatus" NOT NULL DEFAULT 'PENDING',
    "scan_engine" VARCHAR(80),
    "scan_signature_version" VARCHAR(120),
    "scan_started_at" TIMESTAMP(3),
    "scan_completed_at" TIMESTAMP(3),
    "quarantined_at" TIMESTAMP(3),
    "available_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_upload_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "purpose" "FileUploadPurpose" NOT NULL,
    "expected_content_types" TEXT[],
    "maximum_size_bytes" BIGINT NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "claimed_content_type" VARCHAR(180) NOT NULL,
    "expected_checksum" CHAR(64) NOT NULL,
    "status" "FileUploadStatus" NOT NULL DEFAULT 'CREATED',
    "storage_object_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "file_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_folders" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "parent_folder_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "classification" "DocumentClassification" NOT NULL DEFAULT 'GENERAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "folder_id" UUID,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(2000),
    "document_type" "VaultDocumentType" NOT NULL,
    "classification" "DocumentClassification" NOT NULL,
    "status" "VaultDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version_id" UUID,
    "created_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "stored_object_id" UUID NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "file_name_snapshot" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(180) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "immutable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_resource_links" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "document_id" UUID NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_resource_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_grants" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "document_id" UUID NOT NULL,
    "grantee_type" "DocumentGrantType" NOT NULL,
    "grantee_id" UUID NOT NULL,
    "permission" "DocumentPermission" NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_events" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID,
    "actor_user_id" UUID,
    "actor_type" VARCHAR(40) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "ip_hash" CHAR(64),
    "user_agent_hash" CHAR(64),
    "correlation_id" VARCHAR(160) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_retention_policies" (
    "id" UUID NOT NULL,
    "workspace_id" UUID,
    "vendor_organization_id" UUID,
    "document_id" UUID NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "review_at" TIMESTAMP(3),
    "purge_after" TIMESTAMP(3),
    "updated_by" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_document_materializations" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "contract_content_hash" CHAR(64) NOT NULL,
    "document_content_hash" CHAR(64) NOT NULL,
    "renderer_version" VARCHAR(80) NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_document_materializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_signature_envelopes" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "document_version_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_envelope_id" VARCHAR(180),
    "signature_level" "SignatureLevel" NOT NULL,
    "status" "SignatureEnvelopeStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "sent_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "electronic_signature_envelopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_signature_signers" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "party_type" "ContractPartyType" NOT NULL,
    "party_id" UUID NOT NULL,
    "user_id" UUID,
    "name_snapshot" VARCHAR(180) NOT NULL,
    "email_snapshot" VARCHAR(320) NOT NULL,
    "signing_order" INTEGER NOT NULL,
    "status" "SignatureSignerStatus" NOT NULL DEFAULT 'PENDING',
    "provider_signer_id" VARCHAR(180),
    "viewed_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "electronic_signature_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_signature_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_event_id" VARCHAR(180) NOT NULL,
    "envelope_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "electronic_signature_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "electronic_signature_evidence" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "vendor_organization_id" UUID NOT NULL,
    "envelope_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "evidence_type" VARCHAR(80) NOT NULL,
    "document_hash" CHAR(64) NOT NULL,
    "evidence_document_id" UUID,
    "provider_certificate_reference" VARCHAR(500),
    "provider_metadata_redacted" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "electronic_signature_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_checkouts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "payment_schedule_entry_id" UUID NOT NULL,
    "budget_item_id" UUID NOT NULL,
    "booking_id" UUID,
    "contract_id" UUID,
    "vendor_organization_id" UUID,
    "provider" VARCHAR(80) NOT NULL,
    "provider_checkout_id" VARCHAR(180),
    "status" "OnlineCheckoutStatus" NOT NULL DEFAULT 'CREATING',
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "success_return_path" VARCHAR(500) NOT NULL,
    "cancel_return_path" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payment_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_transactions" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_payment_id" VARCHAR(180) NOT NULL,
    "status" "OnlineTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount_authorized_minor" BIGINT NOT NULL DEFAULT 0,
    "amount_captured_minor" BIGINT NOT NULL DEFAULT 0,
    "amount_refunded_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "payment_method_summary" JSONB NOT NULL DEFAULT '{}',
    "provider_created_at" TIMESTAMP(3) NOT NULL,
    "authorized_at" TIMESTAMP(3),
    "captured_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_attempts" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "checkout_id" UUID NOT NULL,
    "provider_attempt_id" VARCHAR(180),
    "attempt_number" INTEGER NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "failure_code" VARCHAR(120),
    "failure_message_redacted" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "online_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_payment_refunds" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_refund_id" VARCHAR(180),
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "OnlineRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(1000) NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "idempotency_key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "online_payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_provider_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "provider_event_id" VARCHAR(180) NOT NULL,
    "provider_payment_id" VARCHAR(180),
    "provider_checkout_id" VARCHAR(180),
    "event_type" VARCHAR(100) NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "status" VARCHAR(80) NOT NULL,

    CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reconciliation_runs" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(80) NOT NULL,
    "status" VARCHAR(80) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "checked_transactions" INTEGER NOT NULL DEFAULT 0,
    "updated_transactions" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "payment_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_objects_object_key_key" ON "stored_objects"("object_key");

-- CreateIndex
CREATE INDEX "stored_objects_workspace_id_status_created_at_idx" ON "stored_objects"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stored_objects_vendor_organization_id_status_created_at_idx" ON "stored_objects"("vendor_organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "stored_objects_checksum_sha256_idx" ON "stored_objects"("checksum_sha256");

-- CreateIndex
CREATE UNIQUE INDEX "file_upload_sessions_storage_object_id_key" ON "file_upload_sessions"("storage_object_id");

-- CreateIndex
CREATE INDEX "file_upload_sessions_workspace_id_status_expires_at_idx" ON "file_upload_sessions"("workspace_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "file_upload_sessions_vendor_organization_id_status_expires__idx" ON "file_upload_sessions"("vendor_organization_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "file_upload_sessions_user_id_idempotency_key_key" ON "file_upload_sessions"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "document_folders_workspace_id_parent_folder_id_name_idx" ON "document_folders"("workspace_id", "parent_folder_id", "name");

-- CreateIndex
CREATE INDEX "document_folders_vendor_organization_id_parent_folder_id_na_idx" ON "document_folders"("vendor_organization_id", "parent_folder_id", "name");

-- CreateIndex
CREATE INDEX "documents_workspace_id_status_classification_updated_at_idx" ON "documents"("workspace_id", "status", "classification", "updated_at");

-- CreateIndex
CREATE INDEX "documents_vendor_organization_id_status_classification_upda_idx" ON "documents"("vendor_organization_id", "status", "classification", "updated_at");

-- CreateIndex
CREATE INDEX "document_versions_workspace_id_document_id_version_number_idx" ON "document_versions"("workspace_id", "document_id", "version_number");

-- CreateIndex
CREATE INDEX "document_versions_vendor_organization_id_document_id_versio_idx" ON "document_versions"("vendor_organization_id", "document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_number_key" ON "document_versions"("document_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_content_hash_key" ON "document_versions"("document_id", "content_hash");

-- CreateIndex
CREATE INDEX "document_resource_links_workspace_id_resource_type_resource_idx" ON "document_resource_links"("workspace_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "document_resource_links_vendor_organization_id_resource_typ_idx" ON "document_resource_links"("vendor_organization_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_resource_links_document_id_resource_type_resource__key" ON "document_resource_links"("document_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "document_access_grants_workspace_id_document_id_revoked_at_idx" ON "document_access_grants"("workspace_id", "document_id", "revoked_at");

-- CreateIndex
CREATE INDEX "document_access_grants_vendor_organization_id_document_id_r_idx" ON "document_access_grants"("vendor_organization_id", "document_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_access_grants_document_id_grantee_type_grantee_id__key" ON "document_access_grants"("document_id", "grantee_type", "grantee_id", "permission");

-- CreateIndex
CREATE INDEX "document_access_events_workspace_id_document_id_occurred_at_idx" ON "document_access_events"("workspace_id", "document_id", "occurred_at");

-- CreateIndex
CREATE INDEX "document_access_events_vendor_organization_id_document_id_o_idx" ON "document_access_events"("vendor_organization_id", "document_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_retention_policies_document_id_key" ON "document_retention_policies"("document_id");

-- CreateIndex
CREATE INDEX "document_retention_policies_workspace_id_purge_after_legal__idx" ON "document_retention_policies"("workspace_id", "purge_after", "legal_hold");

-- CreateIndex
CREATE INDEX "document_retention_policies_vendor_organization_id_purge_af_idx" ON "document_retention_policies"("vendor_organization_id", "purge_after", "legal_hold");

-- CreateIndex
CREATE UNIQUE INDEX "contract_document_materializations_contract_version_id_key" ON "contract_document_materializations"("contract_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_document_materializations_document_version_id_key" ON "contract_document_materializations"("document_version_id");

-- CreateIndex
CREATE INDEX "contract_document_materializations_workspace_id_contract_id_idx" ON "contract_document_materializations"("workspace_id", "contract_id");

-- CreateIndex
CREATE INDEX "contract_document_materializations_vendor_organization_id_c_idx" ON "contract_document_materializations"("vendor_organization_id", "contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_signature_envelopes_provider_envelope_id_key" ON "electronic_signature_envelopes"("provider_envelope_id");

-- CreateIndex
CREATE INDEX "electronic_signature_envelopes_workspace_id_contract_id_sta_idx" ON "electronic_signature_envelopes"("workspace_id", "contract_id", "status");

-- CreateIndex
CREATE INDEX "electronic_signature_envelopes_vendor_organization_id_contr_idx" ON "electronic_signature_envelopes"("vendor_organization_id", "contract_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_signature_signers_provider_signer_id_key" ON "electronic_signature_signers"("provider_signer_id");

-- CreateIndex
CREATE INDEX "electronic_signature_signers_workspace_id_envelope_id_statu_idx" ON "electronic_signature_signers"("workspace_id", "envelope_id", "status");

-- CreateIndex
CREATE INDEX "electronic_signature_signers_vendor_organization_id_envelop_idx" ON "electronic_signature_signers"("vendor_organization_id", "envelope_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_signature_signers_envelope_id_party_type_key" ON "electronic_signature_signers"("envelope_id", "party_type");

-- CreateIndex
CREATE INDEX "electronic_signature_events_envelope_id_occurred_at_idx" ON "electronic_signature_events"("envelope_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_signature_events_provider_provider_event_id_key" ON "electronic_signature_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "electronic_signature_evidence_envelope_id_key" ON "electronic_signature_evidence"("envelope_id");

-- CreateIndex
CREATE INDEX "electronic_signature_evidence_workspace_id_created_at_idx" ON "electronic_signature_evidence"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "electronic_signature_evidence_vendor_organization_id_create_idx" ON "electronic_signature_evidence"("vendor_organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_checkouts_provider_checkout_id_key" ON "online_payment_checkouts"("provider_checkout_id");

-- CreateIndex
CREATE INDEX "online_payment_checkouts_workspace_id_payment_schedule_entr_idx" ON "online_payment_checkouts"("workspace_id", "payment_schedule_entry_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_checkouts_workspace_id_created_by_idempotenc_key" ON "online_payment_checkouts"("workspace_id", "created_by", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_transactions_provider_payment_id_key" ON "online_payment_transactions"("provider_payment_id");

-- CreateIndex
CREATE INDEX "online_payment_transactions_workspace_id_status_created_at_idx" ON "online_payment_transactions"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "online_payment_transactions_checkout_id_idx" ON "online_payment_transactions"("checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_attempts_provider_attempt_id_key" ON "online_payment_attempts"("provider_attempt_id");

-- CreateIndex
CREATE INDEX "online_payment_attempts_workspace_id_checkout_id_idx" ON "online_payment_attempts"("workspace_id", "checkout_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_attempts_checkout_id_attempt_number_key" ON "online_payment_attempts"("checkout_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_refunds_provider_refund_id_key" ON "online_payment_refunds"("provider_refund_id");

-- CreateIndex
CREATE INDEX "online_payment_refunds_workspace_id_transaction_id_status_idx" ON "online_payment_refunds"("workspace_id", "transaction_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_refunds_workspace_id_requested_by_idempotenc_key" ON "online_payment_refunds"("workspace_id", "requested_by", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_provider_events_provider_payment_id_received_at_idx" ON "payment_provider_events"("provider_payment_id", "received_at");

-- CreateIndex
CREATE INDEX "payment_provider_events_provider_checkout_id_received_at_idx" ON "payment_provider_events"("provider_checkout_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_provider_events_provider_provider_event_id_key" ON "payment_provider_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "payment_reconciliation_runs_provider_started_at_idx" ON "payment_reconciliation_runs"("provider", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_source_type_source_id_key" ON "payment_records"("source_type", "source_id");
