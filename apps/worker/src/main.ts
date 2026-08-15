import "dotenv/config";
import "./telemetry";
import {
  createDecipheriv,
  createHash,
  createHmac,
  randomUUID,
} from "node:crypto";
import { execFile } from "node:child_process";
import { createConnection } from "node:net";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { parseApiEnvironment } from "@weddingos/config";
import {
  detectMediaType,
  parseCopilotActionPayload,
} from "@weddingos/contracts";
import { Prisma, PrismaClient } from "@weddingos/database";
import {
  asyncEventNameSchema,
  automationRecursionAllowed,
  classifyJobError,
  commandKeyring,
  consumerJobId,
  decryptCommand,
  domainEventJobSchema,
  domainEventPayloadSchema,
  DOMAIN_EVENT_JOB,
  DOMAIN_EVENT_QUEUE,
  ConfiguredAiPlanProvider,
  ConfiguredAiCopilotProvider,
  copilotMemoryContentCanPersist,
  DeterministicCopilotProvider,
  DeterministicPlanProvider,
  detectDeterministicRisks,
  routeCopilotProvider,
  requestCopilotEmbedding,
  copilotDomainCatalog,
  copilotImplementedActionDefinitions,
  copilotReadToolDefinitions,
  COPILOT_POLICY_VERSION,
  RISK_RULES_VERSION,
  buildDeterministicSeatingSuggestion,
  notificationDedupeKey,
  OpenRouterCopilotProvider,
  isUntrustedDocumentInstruction,
  outboxConsumerNameSchema,
  PermanentJobError,
  redactActivityText,
  retryDelayMs,
  SEATING_RULES_VERSION,
  selectOutboxConsumers,
  type DomainEventJob,
  type EmailCommand,
  type CopilotContextResource,
  type OutboxConsumerName,
  type PlanGenerationInput,
  type PlanGenerationOutput,
} from "@weddingos/jobs";
import nodemailer from "nodemailer";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import pino from "pino";
import sharp from "sharp";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  refreshPublicProductProofSnapshot,
  refreshPublicProductProofAfterConsentRevoked,
} from "./marketing-snapshot";
import {
  campaignInvitationPresentation,
  renderCampaignInvitationEmail,
  type CampaignInvitationPresentation,
} from "./campaign-invitation-email";
import {
  extractedTraceContext,
  shutdownTelemetry,
  withConsumerTrace,
} from "./telemetry";

const execFileAsync = promisify(execFile);

const environment = parseApiEnvironment(process.env);
const workerId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
const artifactRoot = resolve(process.cwd(), environment.ARTIFACT_ROOT);
const decryptionKeys = commandKeyring(
  {
    keyId: environment.OUTBOX_ENCRYPTION_KEY_ID,
    secret: environment.OUTBOX_ENCRYPTION_KEY,
  },
  environment.OUTBOX_DECRYPTION_KEYS,
);
const logger = pino({
  level: environment.LOG_LEVEL,
  redact: {
    paths: [
      "recipient",
      "email",
      "token",
      "code",
      "password",
      "encryptedHeaders",
      "*.recipient",
      "*.token",
    ],
    censor: "[redacted]",
  },
});
const database = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
const storage = new S3Client({
  region: environment.OBJECT_STORAGE_REGION,
  endpoint: environment.OBJECT_STORAGE_ENDPOINT,
  forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
    secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
  },
});
const connection = redisConnection(environment.REDIS_URL);
const queue = new Queue<DomainEventJob>(DOMAIN_EVENT_QUEUE, {
  connection,
  defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
});
let stopping = false;

type ClaimedConsumer = {
  execution_id: string;
  outbox_message_id: string;
  consumer_name: string;
  max_attempts: number;
};

type PersistedConsumer = {
  execution_id: string;
  outbox_message_id: string;
  consumer_name: string;
  background_job_id: string | null;
  workspace_id: string | null;
  vendor_organization_id: string | null;
  actor_user_id: string | null;
  correlation_id: string;
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Prisma.JsonValue;
  encrypted_headers: string | null;
  attempt_number: number;
  max_attempts: number;
};

type ExpiredArtifact = { artifact_id: string; storage_key: string };

async function withPersistedContext<T>(
  snapshot: PersistedConsumer,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number; maxWait?: number },
): Promise<T> {
  return database.$transaction(async (transaction) => {
    await transaction.$executeRaw`
        SELECT
          set_config('app.current_user_id', ${snapshot.actor_user_id ?? ""}, true),
          set_config('app.current_workspace_id', ${snapshot.workspace_id ?? ""}, true),
          set_config('app.current_vendor_organization_id', ${snapshot.vendor_organization_id ?? ""}, true),
          set_config('app.current_worker_id', ${workerId}, true),
          set_config('app.current_consumer_execution_id', ${snapshot.execution_id}, true),
          set_config('app.current_job_id', ${snapshot.background_job_id ?? ""}, true),
          set_config('app.current_correlation_id', ${snapshot.correlation_id}, true)
      `;
    return operation(transaction);
  }, options);
}

async function heartbeat(): Promise<void> {
  await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT set_config('app.current_worker_id', ${workerId}, true)
    `;
    await transaction.workerHeartbeat.upsert({
      where: { id: workerId },
      create: {
        id: workerId,
        metadata: {
          pid: process.pid,
          host: hostname(),
          queue: DOMAIN_EVENT_QUEUE,
          contract: DOMAIN_EVENT_JOB,
        },
      },
      update: {
        lastSeenAt: new Date(),
        metadata: {
          pid: process.pid,
          host: hostname(),
          queue: DOMAIN_EVENT_QUEUE,
          contract: DOMAIN_EVENT_JOB,
        },
      },
    });
  });
}

async function dispatch(): Promise<void> {
  if (stopping) return;
  const rows = await database.$queryRaw<ClaimedConsumer[]>`
    SELECT * FROM public.weddingos_claim_consumer_executions(${workerId}, 50)
  `;
  for (const row of rows) {
    const consumerName = outboxConsumerNameSchema.parse(row.consumer_name);
    const data = domainEventJobSchema.parse({
      contract: DOMAIN_EVENT_JOB,
      outboxMessageId: row.outbox_message_id,
      consumerExecutionId: row.execution_id,
      consumerName,
    });
    try {
      const deterministicJobId = consumerJobId(
        row.outbox_message_id,
        consumerName,
      );
      const existing = await queue.getJob(deterministicJobId);
      if (existing) {
        const state = await existing.getState();
        if (state === "completed" || state === "failed") {
          await existing.remove();
        } else {
          continue;
        }
      }
      await queue.add(DOMAIN_EVENT_JOB, data, {
        jobId: deterministicJobId,
        attempts: row.max_attempts,
        backoff: { type: "exponential", delay: 1000 },
      });
    } catch (error) {
      const classified = classifyJobError(error);
      await database.$executeRaw`
        SELECT public.weddingos_fail_consumer_enqueue(
          ${row.execution_id}::uuid,
          ${workerId},
          ${classified.code},
          ${classified.message},
          ${new Date(Date.now() + retryDelayMs(1, row.execution_id.length))}
        )
      `;
      logger.warn({
        event: "consumer.enqueue_failed",
        executionId: row.execution_id,
        outboxId: row.outbox_message_id,
        consumerName,
        code: classified.code,
      });
    }
  }
}

async function beginConsumer(
  data: DomainEventJob,
): Promise<PersistedConsumer | null> {
  const rows = await database.$queryRaw<PersistedConsumer[]>`
    SELECT * FROM public.weddingos_begin_consumer_execution(
      ${data.consumerExecutionId}::uuid,
      ${data.outboxMessageId}::uuid,
      ${data.consumerName},
      ${workerId}
    )
  `;
  return rows[0] ?? null;
}

async function processConsumer(job: Job<DomainEventJob>): Promise<void> {
  const queueData = domainEventJobSchema.parse(job.data);
  const snapshot = await beginConsumer(queueData);
  if (!snapshot) return;

  const payload = domainEventPayloadSchema.parse(snapshot.payload);
  await withConsumerTrace(
    extractedTraceContext(payload.trace),
    {
      "messaging.system": "bullmq",
      "messaging.destination.name": DOMAIN_EVENT_QUEUE,
      "weddingos.consumer": snapshot.consumer_name,
      "weddingos.event": snapshot.event_name,
    },
    () => processPersistedConsumer(snapshot, payload),
  );
}

async function processPersistedConsumer(
  snapshot: PersistedConsumer,
  payload: ReturnType<typeof domainEventPayloadSchema.parse>,
): Promise<void> {
  const consumerName = outboxConsumerNameSchema.parse(snapshot.consumer_name);
  const eventName = asyncEventNameSchema.parse(snapshot.event_name);
  const selected = selectOutboxConsumers({
    eventName,
    hasEmail: Boolean(snapshot.encrypted_headers),
    payload,
  });
  if (!selected.includes(consumerName)) {
    await failConsumer(
      snapshot,
      new PermanentJobError(
        "Persisted consumer is not selected by the event contract",
        "CONSUMER_NOT_SELECTED",
      ),
    );
    return;
  }

  await withPersistedContext(snapshot, async (transaction) => {
    if (snapshot.background_job_id) {
      await transaction.backgroundJob.update({
        where: { id: snapshot.background_job_id },
        data: {
          status: "RUNNING",
          startedAt: new Date(),
          heartbeatAt: new Date(),
          version: { increment: 1 },
        },
      });
    }
  });

  let emailResult:
    { messageId: string; recipientReference: string } | undefined;
  let preparedArtifact: PreparedArtifact | undefined;
  let planningResult: Record<string, unknown> | undefined;
  let reminderResult: Record<string, unknown> | undefined;
  let slice3Result: Record<string, unknown> | undefined;
  let commercialResult: Record<string, unknown> | undefined;
  let secureCommerceResult: Record<string, unknown> | undefined;
  let trustMonetizationResult: Record<string, unknown> | undefined;
  let weddingDayResult: Record<string, unknown> | undefined;
  let intelligenceResult: Record<string, unknown> | undefined;
  try {
    if (consumerName === "marketing_snapshot_refresh") {
      await refreshPublicProductProofAfterConsentRevoked({
        database,
        environment,
        workerId,
      });
    }
    if (consumerName === "email") {
      if (!snapshot.encrypted_headers)
        throw new PermanentJobError(
          "Email consumer has no encrypted command",
          "COMMAND_MISSING",
        );
      const command = decryptCommand(
        snapshot.encrypted_headers,
        decryptionKeys,
        environment.OUTBOX_ENCRYPTION_KEY_ID,
      );
      emailResult = {
        ...(await sendEmail(command, snapshot.execution_id)),
        recipientReference: recipientReference(command.recipient),
      };
    }
    if (consumerName === "activity_export") {
      if (!payload.export)
        throw new PermanentJobError(
          "Activity export consumer has no export contract",
          "EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareActivityExport(
        snapshot,
        payload.export.requestedByUserId,
        payload.export.filters,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "privacy_export") {
      if (!payload.privacyExport)
        throw new PermanentJobError(
          "Privacy export consumer has no export contract",
          "PRIVACY_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await preparePrivacyExport(
        snapshot,
        payload.privacyExport.requestId,
        payload.privacyExport.requestedByUserId,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "plan_generation") {
      if (!payload.planGeneration)
        throw new PermanentJobError(
          "Plan generation consumer has no generation contract",
          "PLAN_GENERATION_CONTRACT_MISSING",
        );
      planningResult = await processPlanGeneration(
        snapshot,
        payload.planGeneration.generationRunId,
        payload.planGeneration.mode,
      );
    }
    if (consumerName === "task_reminder") {
      if (!payload.reminder)
        throw new PermanentJobError(
          "Task reminder consumer has no reminder contract",
          "TASK_REMINDER_CONTRACT_MISSING",
        );
      reminderResult = await processTaskReminder(
        snapshot,
        payload.reminder.reminderId,
      );
    }
    if (consumerName === "planning_export") {
      if (!payload.planningExport)
        throw new PermanentJobError(
          "Planning export consumer has no export contract",
          "PLANNING_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await preparePlanningExport(
        snapshot,
        payload.planningExport.requestedByUserId,
        payload.planningExport.filters,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "guest_import") {
      if (!payload.guestImport)
        throw new PermanentJobError(
          "Guest import contract missing",
          "GUEST_IMPORT_CONTRACT_MISSING",
        );
      slice3Result = await processGuestImport(
        snapshot,
        payload.guestImport.importId,
      );
    }
    if (consumerName === "guest_export") {
      if (!payload.guestExport)
        throw new PermanentJobError(
          "Guest export contract missing",
          "GUEST_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareGuestExport(
        snapshot,
        payload.guestExport,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "menu_export") {
      if (!payload.menuExport)
        throw new PermanentJobError(
          "Menu export contract missing",
          "MENU_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareMenuExport(snapshot, payload.menuExport);
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "campaign_fanout") {
      if (!payload.campaignFanout)
        throw new PermanentJobError(
          "Campaign fan-out contract missing",
          "CAMPAIGN_FANOUT_CONTRACT_MISSING",
        );
      slice3Result = await processCampaignFanout(
        snapshot,
        payload.campaignFanout.campaignId,
      );
    }
    if (consumerName === "campaign_delivery") {
      if (!payload.campaignDelivery)
        throw new PermanentJobError(
          "Campaign delivery contract missing",
          "CAMPAIGN_DELIVERY_CONTRACT_MISSING",
        );
      slice3Result = await processCampaignDelivery(
        snapshot,
        payload.campaignDelivery.campaignRecipientId,
      );
    }
    if (consumerName === "campaign_summary") {
      if (!payload.campaignSummary)
        throw new PermanentJobError(
          "Campaign summary contract missing",
          "CAMPAIGN_SUMMARY_CONTRACT_MISSING",
        );
      slice3Result = await processCampaignSummary(
        snapshot,
        payload.campaignSummary.campaignId,
      );
    }
    if (consumerName === "invitation_open_projection") {
      if (!payload.invitationOpen)
        throw new PermanentJobError(
          "Invitation projection contract missing",
          "INVITATION_PROJECTION_CONTRACT_MISSING",
        );
      slice3Result = await verifyInvitationProjection(
        snapshot,
        payload.invitationOpen.recipientId,
      );
    }
    if (consumerName === "rsvp_projection") {
      if (!payload.rsvpProjection)
        throw new PermanentJobError(
          "RSVP projection contract missing",
          "RSVP_PROJECTION_CONTRACT_MISSING",
        );
      slice3Result = await verifyRsvpProjection(
        snapshot,
        payload.rsvpProjection.submissionId,
      );
    }
    if (consumerName === "rsvp_reminder") {
      if (!payload.rsvpReminder)
        throw new PermanentJobError(
          "RSVP reminder contract missing",
          "RSVP_REMINDER_CONTRACT_MISSING",
        );
      slice3Result = await processCampaignFanout(
        snapshot,
        payload.rsvpReminder.campaignId,
      );
    }
    if (consumerName === "seating_suggestion") {
      if (!payload.seatingSuggestion)
        throw new PermanentJobError(
          "Seating suggestion contract missing",
          "SEATING_SUGGESTION_CONTRACT_MISSING",
        );
      slice3Result = await processSeatingSuggestion(
        snapshot,
        payload.seatingSuggestion.runId,
      );
    }
    if (consumerName === "seating_issue_projection") {
      if (!payload.seatingIssueProjection)
        throw new PermanentJobError(
          "Seating issue projection contract missing",
          "SEATING_ISSUE_PROJECTION_CONTRACT_MISSING",
        );
      slice3Result = await verifyOperationalAggregate(
        snapshot,
        "seating",
        payload.seatingIssueProjection.planId,
      );
    }
    if (consumerName === "seating_export") {
      if (!payload.seatingExport)
        throw new PermanentJobError(
          "Seating export contract missing",
          "SEATING_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareSeatingExport(
        snapshot,
        payload.seatingExport,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "transport_issue_projection") {
      if (!payload.transportIssueProjection)
        throw new PermanentJobError(
          "Transport issue projection contract missing",
          "TRANSPORT_ISSUE_PROJECTION_CONTRACT_MISSING",
        );
      slice3Result = await verifyOperationalAggregate(
        snapshot,
        "transport",
        payload.transportIssueProjection.planId,
      );
    }
    if (consumerName === "transport_manifest") {
      if (!payload.transportManifest)
        throw new PermanentJobError(
          "Transport manifest contract missing",
          "TRANSPORT_MANIFEST_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareTransportManifest(
        snapshot,
        payload.transportManifest,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "accommodation_issue_projection") {
      if (!payload.accommodationIssueProjection)
        throw new PermanentJobError(
          "Accommodation issue projection contract missing",
          "ACCOMMODATION_ISSUE_PROJECTION_CONTRACT_MISSING",
        );
      slice3Result = await verifyOperationalAggregate(
        snapshot,
        "accommodation",
        payload.accommodationIssueProjection.stayId,
      );
    }
    if (consumerName === "accommodation_rooming_list") {
      if (!payload.accommodationRoomingList)
        throw new PermanentJobError(
          "Accommodation rooming-list contract missing",
          "ACCOMMODATION_ROOMING_LIST_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareAccommodationRoomingList(
        snapshot,
        payload.accommodationRoomingList,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "guest_operations_projection") {
      if (!payload.guestOperationsProjection)
        throw new PermanentJobError(
          "Guest operations projection contract missing",
          "GUEST_OPERATIONS_PROJECTION_CONTRACT_MISSING",
        );
      slice3Result = await projectGuestOperations(
        snapshot,
        payload.guestOperationsProjection.submissionId,
      );
    }
    if (consumerName === "rfq_delivery") {
      if (!payload.rfqDelivery)
        throw new PermanentJobError(
          "RFQ delivery contract missing",
          "RFQ_DELIVERY_CONTRACT_MISSING",
        );
      commercialResult = await processRfqDelivery(
        snapshot,
        payload.rfqDelivery.recipientId,
      );
    }
    if (consumerName === "offer_projection") {
      if (!payload.offerProjection)
        throw new PermanentJobError(
          "Offer projection contract missing",
          "OFFER_PROJECTION_CONTRACT_MISSING",
        );
      commercialResult = await verifyCommercialAggregate(
        snapshot,
        "offer",
        payload.offerProjection.offerId,
      );
    }
    if (consumerName === "booking_projection") {
      if (!payload.bookingProjection)
        throw new PermanentJobError(
          "Booking projection contract missing",
          "BOOKING_PROJECTION_CONTRACT_MISSING",
        );
      commercialResult = await verifyCommercialAggregate(
        snapshot,
        "booking",
        payload.bookingProjection.bookingId,
      );
    }
    if (consumerName === "contract_projection") {
      if (!payload.contractProjection)
        throw new PermanentJobError(
          "Contract projection contract missing",
          "CONTRACT_PROJECTION_CONTRACT_MISSING",
        );
      commercialResult = await verifyCommercialAggregate(
        snapshot,
        "contract",
        payload.contractProjection.contractId,
      );
    }
    if (consumerName === "budget_projection") {
      commercialResult = await verifyBudgetProjection(
        snapshot,
        payload.budgetProjection?.budgetItemId,
      );
    }
    if (consumerName === "payment_projection") {
      if (!payload.paymentProjection)
        throw new PermanentJobError(
          "Payment projection contract missing",
          "PAYMENT_PROJECTION_CONTRACT_MISSING",
        );
      commercialResult = await verifyPaymentProjection(
        snapshot,
        payload.paymentProjection.paymentId,
      );
    }
    if (consumerName === "payment_reminder") {
      if (!payload.paymentReminder)
        throw new PermanentJobError(
          "Payment reminder contract missing",
          "PAYMENT_REMINDER_CONTRACT_MISSING",
        );
      commercialResult = await processPaymentReminder(
        snapshot,
        payload.paymentReminder.scheduleId,
        payload.paymentReminder.scheduleVersion,
      );
    }
    if (consumerName === "vendor_notification_projection") {
      if (!payload.vendorNotificationProjection)
        throw new PermanentJobError(
          "Vendor notification contract missing",
          "VENDOR_NOTIFICATION_CONTRACT_MISSING",
        );
      commercialResult = await projectVendorNotifications(
        snapshot,
        payload.vendorNotificationProjection.vendorOrganizationId,
        payload.vendorNotificationProjection.recipientUserId,
      );
    }
    if (consumerName === "contract_export") {
      if (!payload.contractExport)
        throw new PermanentJobError(
          "Contract export contract missing",
          "CONTRACT_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareContractExport(
        snapshot,
        payload.contractExport,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "commercial_export") {
      if (!payload.commercialExport)
        throw new PermanentJobError(
          "Commercial export contract missing",
          "COMMERCIAL_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareCommercialExport(
        snapshot,
        payload.commercialExport,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "document_scan") {
      if (!payload.documentScan)
        throw new PermanentJobError(
          "Document scan contract missing",
          "DOCUMENT_SCAN_CONTRACT_MISSING",
        );
      secureCommerceResult = await processDocumentScan(
        snapshot,
        payload.documentScan.storedObjectId,
      );
    }
    if (consumerName === "document_cleanup") {
      if (!payload.documentCleanup)
        throw new PermanentJobError(
          "Document cleanup contract missing",
          "DOCUMENT_CLEANUP_CONTRACT_MISSING",
        );
      secureCommerceResult = await processDocumentCleanup(
        snapshot,
        payload.documentCleanup.documentId,
      );
    }
    if (consumerName === "document_text_extraction") {
      if (!payload.documentTextExtraction)
        throw new PermanentJobError(
          "Document text extraction contract missing",
          "DOCUMENT_TEXT_EXTRACTION_CONTRACT_MISSING",
        );
      intelligenceResult = await processDocumentTextExtraction(
        snapshot,
        payload.documentTextExtraction.documentId,
        payload.documentTextExtraction.documentVersionId,
      );
    }
    if (
      [
        "document_derivative",
        "document_retention",
        "document_notification_projection",
        "signature_envelope_create",
        "signature_envelope_send",
        "signature_status_projection",
        "signature_evidence_download",
        "payment_checkout_create",
        "payment_status_projection",
        "payment_refund",
        "payment_reconciliation",
      ].includes(consumerName)
    ) {
      secureCommerceResult = await verifySecureCommerceAggregate(snapshot);
    }
    if (
      [
        "review_eligibility_projection",
        "review_rating_projection",
        "review_notification_projection",
        "review_moderation_projection",
        "subscription_status_projection",
        "subscription_entitlement_projection",
        "subscription_usage_projection",
        "subscription_notification_projection",
        "payment_allocation_projection",
        "vendor_payable_projection",
        "settlement_calculation",
        "payout_execution",
        "payout_status_projection",
        "payout_reconciliation",
      ].includes(consumerName)
    ) {
      trustMonetizationResult =
        await verifyTrustMonetizationAggregate(snapshot);
    }
    if (consumerName === "guest_moment_scan") {
      if (!payload.guestMomentScan)
        throw new PermanentJobError(
          "Guest Moment scan contract missing",
          "GUEST_MOMENT_SCAN_CONTRACT_MISSING",
        );
      weddingDayResult = await processGuestMomentScan(
        snapshot,
        payload.guestMomentScan,
      );
    }
    if (consumerName === "wedding_day_live_projection") {
      if (!payload.weddingDayLive)
        throw new PermanentJobError(
          "Wedding-day live contract missing",
          "WEDDING_DAY_LIVE_CONTRACT_MISSING",
        );
      weddingDayResult = await publishWeddingDayLive(
        snapshot,
        payload.weddingDayLive.liveEventId,
      );
    }
    if (
      [
        "wedding_day_reminder",
        "incident_escalation",
        "announcement_delivery",
        "announcement_summary",
        "check_in_projection",
        "check_in_offline_sync",
        "attendance_projection",
        "guest_moment_derivative",
        "guest_moment_moderation_projection",
        "gallery_projection",
      ].includes(consumerName)
    ) {
      weddingDayResult = await verifyWeddingDayProjection(
        snapshot,
        consumerName,
        payload,
      );
    }
    if (consumerName === "wedding_day_export") {
      if (!payload.weddingDayExport)
        throw new PermanentJobError(
          "Wedding Day export contract missing",
          "WEDDING_DAY_EXPORT_CONTRACT_MISSING",
        );
      preparedArtifact = await prepareWeddingDayExport(
        snapshot,
        payload.weddingDayExport,
      );
      await writeManagedArtifact(preparedArtifact);
    }
    if (consumerName === "copilot_run") {
      if (!payload.copilotRun)
        throw new PermanentJobError(
          "Copilot run contract missing",
          "COPILOT_RUN_CONTRACT_MISSING",
        );
      intelligenceResult = await processCopilotRun(
        snapshot,
        payload.copilotRun.runId,
      );
    }
    if (consumerName === "risk_detection") {
      if (!payload.riskDetection)
        throw new PermanentJobError(
          "Risk detection contract missing",
          "RISK_DETECTION_CONTRACT_MISSING",
        );
      intelligenceResult = await processRiskDetection(
        snapshot,
        payload.riskDetection.detectionRunId,
      );
    }
    if (consumerName === "contingency_simulation") {
      if (!payload.contingencySimulation)
        throw new PermanentJobError(
          "Contingency simulation contract missing",
          "CONTINGENCY_SIMULATION_CONTRACT_MISSING",
        );
      intelligenceResult = await processContingencySimulation(
        snapshot,
        payload.contingencySimulation.simulationId,
      );
    }
    if (consumerName === "automation_execution") {
      if (!payload.automationExecution)
        throw new PermanentJobError(
          "Automation execution contract missing",
          "AUTOMATION_EXECUTION_CONTRACT_MISSING",
        );
      intelligenceResult = await processAutomationExecution(
        snapshot,
        payload.automationExecution.executionId,
      );
    }
    if (consumerName === "automation_trigger") {
      intelligenceResult = await processAutomationTrigger(snapshot, payload);
    }
    if (consumerName === "weekly_digest") {
      if (!payload.weeklyDigest)
        throw new PermanentJobError(
          "Weekly digest contract missing",
          "WEEKLY_DIGEST_CONTRACT_MISSING",
        );
      intelligenceResult = await processWeeklyDigest(
        snapshot,
        payload.weeklyDigest.digestId,
      );
    }

    const output = await completeConsumer(
      snapshot,
      consumerName,
      payload,
      emailResult,
      preparedArtifact,
      planningResult,
      reminderResult,
      slice3Result,
      commercialResult,
      secureCommerceResult,
      trustMonetizationResult,
      weddingDayResult,
      intelligenceResult,
    );
    logger.info({
      event: "consumer.completed",
      executionId: snapshot.execution_id,
      jobId: snapshot.background_job_id,
      outboxId: snapshot.outbox_message_id,
      eventName,
      consumerName,
      resultKeys: Object.keys(output),
    });
  } catch (error) {
    const terminal = await failConsumer(snapshot, error);
    if (
      terminal &&
      consumerName === "automation_execution" &&
      payload.automationExecution
    ) {
      try {
        await recordAutomationPermanentFailure(
          snapshot,
          payload.automationExecution.executionId,
          classifyJobError(error).code,
        );
      } catch (recoveryError) {
        logger.error({
          event: "automation.failure_recovery_failed",
          executionId: payload.automationExecution.executionId,
          code: classifyJobError(recoveryError).code,
        });
      }
    }
    logger[terminal ? "error" : "warn"]({
      event: terminal ? "consumer.dead_letter" : "consumer.retrying",
      executionId: snapshot.execution_id,
      jobId: snapshot.background_job_id,
      outboxId: snapshot.outbox_message_id,
      eventName,
      consumerName,
      attempt: snapshot.attempt_number,
      code: classifyJobError(error).code,
    });
    if (!terminal) throw error;
  }
}

async function recordAutomationPermanentFailure(
  snapshot: PersistedConsumer,
  executionId: string,
  errorCode: string,
) {
  requireWorkspaceActorContext(snapshot, "AUTOMATION_FAILURE_CONTEXT_INVALID");
  await withPersistedContext(snapshot, async (transaction) => {
    const execution = await transaction.automationExecution.findFirst({
      where: { id: executionId, workspaceId: snapshot.workspace_id },
    });
    if (!execution || ["COMPLETED", "CANCELLED"].includes(execution.status))
      return;
    await transaction.automationExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        errorRedacted: errorCode.slice(0, 1000),
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    const permanentFailures = await transaction.automationExecution.count({
      where: {
        workspaceId: snapshot.workspace_id,
        ruleId: execution.ruleId,
        status: "FAILED",
      },
    });
    if (permanentFailures < 3) return;
    const rule = await transaction.automationRule.findFirst({
      where: {
        id: execution.ruleId,
        workspaceId: snapshot.workspace_id,
        status: "ACTIVE",
      },
    });
    if (!rule) return;
    const paused = await transaction.automationRule.update({
      where: { id: rule.id },
      data: { status: "PAUSED", version: { increment: 1 } },
    });
    await recordWorkerEvent(transaction, snapshot, {
      eventName: "automation.paused.v1",
      aggregateType: "AutomationRule",
      aggregateId: rule.id,
      aggregateVersion: paused.version,
      deduplicationKey: `automation-permanent-failure-paused:${rule.id}:v${paused.version}`,
      payload: {
        occurredAt: new Date().toISOString(),
        subject: { ruleId: rule.id, permanentFailures, errorCode },
        notification: {
          recipientUserId: rule.createdById,
          module: "automation",
          kind: "automation_paused_after_failures",
          priority: "high",
          title: "Automatizare pusă pe pauză",
          body: "Regula a fost oprită după trei eșecuri permanente și necesită revizuire.",
          actionUrl: "/automations",
        },
      },
    });
  });
}

type PreparedArtifact = {
  id: string;
  storageKey: string;
  fileName: string;
  content: string | Buffer;
  mediaType: string;
  rowCount: number;
  sizeBytes: number;
  sha256: string;
  expiresAt: Date;
};

async function publishWeddingDayLive(
  snapshot: PersistedConsumer,
  liveEventId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Wedding-day event has no workspace context",
      "WEDDING_DAY_CONTEXT_MISSING",
    );
  const event = await withPersistedContext(snapshot, (transaction) =>
    transaction.weddingDayLiveEvent.findFirst({
      where: { id: liveEventId, workspaceId: snapshot.workspace_id! },
      select: { id: true, sequence: true, guestVisible: true },
    }),
  );
  if (!event)
    throw new PermanentJobError(
      "Wedding-day live event does not match persisted context",
      "WEDDING_DAY_CONTEXT_MISMATCH",
    );
  const redis = (await queue.client) as unknown as {
    publish(channel: string, message: string): Promise<number>;
  };
  await redis.publish(
    `weddingos:wedding-day:workspace:${snapshot.workspace_id}`,
    JSON.stringify({ id: event.id, sequence: event.sequence.toString() }),
  );
  return {
    liveEventId: event.id,
    sequence: event.sequence.toString(),
    guestVisible: event.guestVisible,
  };
}

async function processGuestMomentScan(
  snapshot: PersistedConsumer,
  input: { momentId: string; mediaId: string; storedObjectId: string },
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Guest Moment has no workspace context",
      "GUEST_MOMENT_CONTEXT_MISSING",
    );
  assertPersistedAggregate(snapshot, "GuestMoment", input.momentId);
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const [moment, media, object, upload] = await Promise.all([
      transaction.guestMoment.findFirst({
        where: { id: input.momentId, workspaceId: snapshot.workspace_id! },
      }),
      transaction.guestMomentMedia.findFirst({
        where: {
          id: input.mediaId,
          guestMomentId: input.momentId,
          workspaceId: snapshot.workspace_id!,
        },
      }),
      transaction.storedObject.findFirst({
        where: {
          id: input.storedObjectId,
          workspaceId: snapshot.workspace_id!,
        },
      }),
      transaction.guestMomentUploadSession.findFirst({
        where: {
          guestMomentId: input.momentId,
          guestMomentMediaId: input.mediaId,
          storedObjectId: input.storedObjectId,
          workspaceId: snapshot.workspace_id!,
        },
      }),
    ]);
    if (!moment || !media || !object || !upload)
      throw new PermanentJobError(
        "Guest Moment media does not match persisted execution context",
        "GUEST_MOMENT_CONTEXT_MISMATCH",
      );
    if (
      ["AVAILABLE", "QUARANTINED"].includes(object.status) &&
      ["PENDING_REVIEW", "REJECTED"].includes(moment.status)
    )
      return { moment, media, object, upload, terminal: true };
    await transaction.storedObject.update({
      where: { id: object.id },
      data: {
        status: "VERIFYING",
        scanStatus: "RUNNING",
        scanStartedAt: new Date(),
        scanEngine: "clamav",
      },
    });
    return { moment, media, object, upload, terminal: false };
  });
  if (prepared.terminal)
    return {
      momentId: input.momentId,
      status: prepared.moment.status,
      idempotent: true,
    };

  const bytes = await storedObjectBytes(
    prepared.object.objectKey,
    Number(prepared.upload.maximumSizeBytes),
  );
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const detected = detectMediaType(
    bytes.subarray(0, Math.min(bytes.byteLength, 8192)),
  );
  const typeAllowed =
    detected !== null &&
    prepared.upload.expectedContentTypes.includes(detected);
  const metadataValid =
    checksum === prepared.upload.expectedChecksum &&
    bytes.byteLength === Number(prepared.object.sizeBytes) &&
    typeAllowed;
  const scan = metadataValid
    ? await clamAvScan(bytes)
    : { clean: false, signature: "metadata-mismatch" };
  const safe = metadataValid && scan.clean;

  let derivative:
    | {
        key: string;
        bytes: Buffer;
        width: number;
        height: number;
        checksum: string;
      }
    | undefined;
  if (safe && prepared.media.mediaType === "IMAGE") {
    const rendered = await sharp(bytes, { failOn: "warning" })
      .rotate()
      .resize({
        width: 1920,
        height: 1920,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (!rendered.info.width || !rendered.info.height)
      throw new PermanentJobError(
        "Guest Moment derivative dimensions are invalid",
        "GUEST_MOMENT_DERIVATIVE_INVALID",
      );
    derivative = {
      key: `private/guest-moment-derivatives/${snapshot.workspace_id}/${input.momentId}.webp`,
      bytes: rendered.data,
      width: rendered.info.width,
      height: rendered.info.height,
      checksum: createHash("sha256").update(rendered.data).digest("hex"),
    };
    await storage.send(
      new PutObjectCommand({
        Bucket: environment.OBJECT_STORAGE_BUCKET,
        Key: derivative.key,
        Body: derivative.bytes,
        ContentType: "image/webp",
        Metadata: {
          "source-object-id": input.storedObjectId,
          sha256: derivative.checksum,
        },
      }),
    );
  } else if (safe && prepared.media.mediaType === "VIDEO") {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "weddingos-video-"),
    );
    try {
      const inputPath = join(temporaryDirectory, "source-video");
      const posterPath = join(temporaryDirectory, "poster.webp");
      await writeFile(inputPath, bytes);
      await execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=1920:1920:force_original_aspect_ratio=decrease",
        posterPath,
      ]);
      const posterBytes = await readFile(posterPath);
      const metadata = await sharp(posterBytes).metadata();
      if (!metadata.width || !metadata.height)
        throw new Error("Video poster has invalid dimensions");
      derivative = {
        key: `private/guest-moment-derivatives/${snapshot.workspace_id}/${input.momentId}.webp`,
        bytes: posterBytes,
        width: metadata.width,
        height: metadata.height,
        checksum: createHash("sha256").update(posterBytes).digest("hex"),
      };
      await storage.send(
        new PutObjectCommand({
          Bucket: environment.OBJECT_STORAGE_BUCKET,
          Key: derivative.key,
          Body: derivative.bytes,
          ContentType: "image/webp",
          Metadata: {
            "source-object-id": input.storedObjectId,
            sha256: derivative.checksum,
          },
        }),
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  return withPersistedContext(snapshot, async (transaction) => {
    const now = new Date();
    let derivativeObjectId: string | null = null;
    if (derivative) {
      const existing = await transaction.storedObject.findUnique({
        where: { objectKey: derivative.key },
      });
      const derivativeObject =
        existing ??
        (await transaction.storedObject.create({
          data: {
            workspaceId: snapshot.workspace_id,
            storageProvider: environment.OBJECT_STORAGE_PROVIDER,
            bucket: environment.OBJECT_STORAGE_BUCKET,
            objectKey: derivative.key,
            originalFileName: `${prepared.object.originalFileName.replace(/\.[^.]+$/, "")}.webp`,
            contentTypeClaimed: "image/webp",
            contentTypeDetected: "image/webp",
            sizeBytes: BigInt(derivative.bytes.byteLength),
            checksumSha256: derivative.checksum,
            encryptionState: "PROVIDER_MANAGED",
            status: "AVAILABLE",
            scanStatus: "NOT_REQUIRED",
            availableAt: now,
          },
        }));
      derivativeObjectId = derivativeObject.id;
    }
    await transaction.storedObject.update({
      where: { id: input.storedObjectId },
      data: {
        contentTypeDetected: detected,
        checksumSha256: checksum,
        status: safe ? "AVAILABLE" : "QUARANTINED",
        scanStatus: safe ? "CLEAN" : "INFECTED",
        scanSignatureVersion: scan.signature,
        scanCompletedAt: now,
        availableAt: safe ? now : null,
        quarantinedAt: safe ? null : now,
      },
    });
    await transaction.guestMomentMedia.update({
      where: { id: input.mediaId },
      data: {
        derivativeObjectId,
        ...(derivative
          ? { width: derivative.width, height: derivative.height }
          : {}),
        moderationStatus: safe ? "AUTOMATED_SAFE" : "REJECTED",
        version: { increment: 1 },
      },
    });
    const moment = await transaction.guestMoment.update({
      where: { id: input.momentId },
      data: {
        status: safe ? "PENDING_REVIEW" : "REJECTED",
        version: { increment: 1 },
      },
    });
    await transaction.guestMomentModerationCase.create({
      data: {
        workspaceId: snapshot.workspace_id!,
        guestMomentId: input.momentId,
        status: safe ? "OPEN" : "DECIDED",
        reasonCode: safe ? "AUTOMATED_SCAN_SAFE" : scan.signature.slice(0, 120),
        decision: safe ? null : "REJECT",
        decidedAt: safe ? null : now,
      },
    });
    return {
      momentId: moment.id,
      status: moment.status,
      scanStatus: safe ? "CLEAN" : "INFECTED",
      derivativeAvailable: Boolean(derivativeObjectId),
    };
  });
}

async function verifyWeddingDayProjection(
  snapshot: PersistedConsumer,
  consumerName: OutboxConsumerName,
  payload: ReturnType<typeof domainEventPayloadSchema.parse>,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Wedding-day projection has no workspace context",
      "WEDDING_DAY_CONTEXT_MISSING",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    if (
      consumerName === "announcement_delivery" &&
      payload.announcementDelivery
    ) {
      const announcement = await transaction.weddingDayAnnouncement.findFirst({
        where: {
          id: payload.announcementDelivery.announcementId,
          workspaceId: snapshot.workspace_id!,
        },
      });
      if (!announcement)
        throw new PermanentJobError(
          "Announcement does not match persisted context",
          "WEDDING_DAY_CONTEXT_MISMATCH",
        );
      const delivered =
        await transaction.weddingDayAnnouncementDelivery.updateMany({
          where: {
            announcementId: announcement.id,
            workspaceId: snapshot.workspace_id!,
            channel: { in: ["GUEST_COMPANION", "IN_APP"] },
            status: { in: ["QUEUED", "PUBLISHED"] },
          },
          data: { status: "DELIVERED", deliveredAt: new Date() },
        });
      const unavailableEmail =
        await transaction.weddingDayAnnouncementDelivery.updateMany({
          where: {
            announcementId: announcement.id,
            workspaceId: snapshot.workspace_id!,
            channel: "EMAIL",
            status: "QUEUED",
          },
          data: { status: "FAILED", errorCode: "EMAIL_ADDRESS_UNAVAILABLE" },
        });
      return {
        announcementId: announcement.id,
        delivered: delivered.count,
        failed: unavailableEmail.count,
      };
    }
    if (consumerName === "incident_escalation" && payload.incidentEscalation) {
      const row = await transaction.weddingDayIncident.findFirst({
        where: {
          id: payload.incidentEscalation.incidentId,
          workspaceId: snapshot.workspace_id!,
        },
        select: { id: true, severity: true, status: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Incident does not match persisted context",
          "WEDDING_DAY_CONTEXT_MISMATCH",
        );
      return { incidentId: row.id, severity: row.severity, status: row.status };
    }
    if (payload.galleryProjection) {
      const row = await transaction.galleryCollection.findFirst({
        where: {
          id: payload.galleryProjection.collectionId,
          workspaceId: snapshot.workspace_id!,
        },
        select: { id: true, status: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Gallery does not match persisted context",
          "WEDDING_DAY_CONTEXT_MISMATCH",
        );
      return { collectionId: row.id, status: row.status };
    }
    return { verified: true, consumerName };
  });
}

async function storedObjectBytes(
  objectKey: string,
  maximumBytes: number,
): Promise<Buffer> {
  const result = await storage.send(
    new GetObjectCommand({
      Bucket: environment.OBJECT_STORAGE_BUCKET,
      Key: objectKey,
    }),
  );
  if (!result.Body) throw new Error("Stored object body is unavailable");
  const bytes = await result.Body.transformToByteArray();
  if (bytes.byteLength > maximumBytes)
    throw new PermanentJobError(
      "Stored object exceeds its authorized maximum",
      "DOCUMENT_SIZE_MISMATCH",
    );
  return Buffer.from(bytes);
}

async function clamAvScan(
  bytes: Buffer,
): Promise<{ clean: boolean; signature: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createConnection({
      host: environment.CLAMAV_HOST,
      port: environment.CLAMAV_PORT,
    });
    const parts: Buffer[] = [];
    let settled = false;
    const finishError = (error: Error) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        rejectPromise(error);
      }
    };
    socket.setTimeout(environment.CLAMAV_SCAN_TIMEOUT_MS, () =>
      finishError(new Error("ClamAV scan timed out")),
    );
    socket.once("error", finishError);
    socket.on("data", (part) => parts.push(Buffer.from(part)));
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
        const chunk = bytes.subarray(
          offset,
          Math.min(bytes.length, offset + 64 * 1024),
        );
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length);
        socket.write(size);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.once("end", () => {
      if (settled) return;
      settled = true;
      const response = Buffer.concat(parts)
        .toString("utf8")
        .replace(/\0/g, "")
        .trim();
      if (response.endsWith("OK"))
        resolvePromise({ clean: true, signature: "clean" });
      else if (response.includes("FOUND"))
        resolvePromise({ clean: false, signature: response.slice(0, 120) });
      else
        rejectPromise(
          new Error(
            `ClamAV returned an invalid response: ${response.slice(0, 120)}`,
          ),
        );
    });
  });
}

async function processDocumentScan(
  snapshot: PersistedConsumer,
  storedObjectId: string,
): Promise<Record<string, unknown>> {
  assertPersistedAggregate(snapshot, "StoredObject", storedObjectId);
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const object = await transaction.storedObject.findFirst({
      where: {
        id: storedObjectId,
        workspaceId: snapshot.workspace_id,
        vendorOrganizationId: snapshot.vendor_organization_id,
      },
    });
    if (!object)
      throw new PermanentJobError(
        "Stored object does not match persisted execution context",
        "DOCUMENT_OBJECT_CONTEXT_MISMATCH",
      );
    const session = await transaction.fileUploadSession.findFirst({
      where: { storageObjectId: storedObjectId },
    });
    if (!session)
      throw new PermanentJobError(
        "Upload authorization is missing",
        "DOCUMENT_UPLOAD_AUTHORIZATION_MISSING",
      );
    if (object.status === "AVAILABLE" || object.status === "QUARANTINED")
      return { object, session, terminal: true };
    await transaction.storedObject.update({
      where: { id: object.id },
      data: {
        status: "VERIFYING",
        scanStatus: "RUNNING",
        scanStartedAt: new Date(),
        scanEngine: "clamav",
      },
    });
    return { object, session, terminal: false };
  });
  if (prepared.terminal) {
    const derivative =
      prepared.object.status === "AVAILABLE" &&
      prepared.session.purpose === "VENDOR_PORTFOLIO_IMAGE"
        ? await ensurePortfolioDerivative(
            snapshot,
            prepared.object,
            prepared.session,
          )
        : null;
    return {
      storedObjectId,
      status: prepared.object.status,
      idempotent: true,
      ...(derivative ? { derivative } : {}),
    };
  }
  const bytes = await storedObjectBytes(
    prepared.object.objectKey,
    Number(prepared.session.maximumSizeBytes),
  );
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const detected = detectMediaType(
    bytes.subarray(0, Math.min(bytes.length, 8192)),
  );
  const allowedDetected =
    detected && prepared.session.expectedContentTypes.includes(detected);
  const valid =
    checksum === prepared.session.expectedChecksum &&
    bytes.byteLength === Number(prepared.object.sizeBytes) &&
    Boolean(allowedDetected);
  let scan: { clean: boolean; signature: string } = {
    clean: false,
    signature: "metadata-mismatch",
  };
  if (valid) {
    try {
      scan = await clamAvScan(bytes);
    } catch (error) {
      await withPersistedContext(snapshot, (transaction) =>
        transaction.storedObject.update({
          where: { id: storedObjectId },
          data: { scanStatus: "ERROR", status: "VERIFYING" },
        }),
      );
      throw error;
    }
  }
  const available = valid && scan.clean;
  await withPersistedContext(snapshot, async (transaction) => {
    const now = new Date();
    await transaction.storedObject.update({
      where: { id: storedObjectId },
      data: {
        contentTypeDetected: detected,
        checksumSha256: checksum,
        status: available ? "AVAILABLE" : "QUARANTINED",
        scanStatus: available ? "CLEAN" : "INFECTED",
        scanSignatureVersion: scan.signature,
        scanCompletedAt: now,
        availableAt: available ? now : null,
        quarantinedAt: available ? null : now,
      },
    });
    await transaction.vaultDocument.updateMany({
      where: {
        currentVersionId: {
          in: (
            await transaction.documentVersion.findMany({
              where: { storedObjectId },
              select: { id: true },
            })
          ).map((item) => item.id),
        },
      },
      data: {
        status: available ? "AVAILABLE" : "QUARANTINED",
        version: { increment: 1 },
      },
    });
  });
  const derivative =
    available && prepared.session.purpose === "VENDOR_PORTFOLIO_IMAGE"
      ? await ensurePortfolioDerivative(
          snapshot,
          prepared.object,
          prepared.session,
          bytes,
        )
      : null;
  return {
    storedObjectId,
    status: available ? "AVAILABLE" : "QUARANTINED",
    scanStatus: available ? "CLEAN" : "INFECTED",
    contentTypeDetected: detected,
    ...(derivative ? { derivative } : {}),
  };
}

async function ensurePortfolioDerivative(
  snapshot: PersistedConsumer,
  object: {
    id: string;
    objectKey: string;
    originalFileName: string;
    vendorOrganizationId: string | null;
  },
  session: {
    userId: string;
    maximumSizeBytes: bigint;
    vendorOrganizationId: string | null;
  },
  originalBytes?: Buffer,
): Promise<Record<string, unknown>> {
  const vendorOrganizationId =
    session.vendorOrganizationId ?? object.vendorOrganizationId;
  if (
    !vendorOrganizationId ||
    vendorOrganizationId !== snapshot.vendor_organization_id
  ) {
    throw new PermanentJobError(
      "Portfolio derivative tenant does not match persisted context",
      "DOCUMENT_DERIVATIVE_CONTEXT_MISMATCH",
    );
  }
  const existing = await withPersistedContext(snapshot, (transaction) =>
    transaction.documentDerivative.findUnique({
      where: { sourceStoredObjectId: object.id },
    }),
  );
  if (existing)
    return { id: existing.id, status: existing.status, idempotent: true };

  const source =
    originalBytes ??
    (await storedObjectBytes(
      object.objectKey,
      Number(session.maximumSizeBytes),
    ));
  const pipeline = sharp(source, { failOn: "warning" }).rotate().resize({
    width: 1600,
    height: 1600,
    fit: "inside",
    withoutEnlargement: true,
  });
  const { data, info } = await pipeline
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  if (!info.width || !info.height)
    throw new PermanentJobError(
      "Portfolio derivative has invalid dimensions",
      "DOCUMENT_DERIVATIVE_INVALID",
    );
  const checksum = createHash("sha256").update(data).digest("hex");
  const objectKey = `private-derivatives/vendors/${vendorOrganizationId}/${object.id}.webp`;
  const uploaded = await storage.send(
    new PutObjectCommand({
      Bucket: environment.OBJECT_STORAGE_BUCKET,
      Key: objectKey,
      Body: data,
      ContentType: "image/webp",
      Metadata: { "source-object-id": object.id, sha256: checksum },
    }),
  );

  try {
    return await withPersistedContext(snapshot, async (transaction) => {
      const raced = await transaction.documentDerivative.findUnique({
        where: { sourceStoredObjectId: object.id },
      });
      if (raced)
        return { id: raced.id, status: raced.status, idempotent: true };
      const stored = await transaction.storedObject.create({
        data: {
          vendorOrganizationId,
          storageProvider: "s3-compatible",
          bucket: environment.OBJECT_STORAGE_BUCKET,
          objectKey,
          originalFileName: `${object.originalFileName.replace(/\.[^.]+$/, "")}.webp`,
          contentTypeClaimed: "image/webp",
          contentTypeDetected: "image/webp",
          sizeBytes: BigInt(data.byteLength),
          checksumSha256: checksum,
          etag: uploaded.ETag?.replaceAll('"', "") ?? null,
          encryptionState: "PROVIDER_MANAGED",
          status: "AVAILABLE",
          scanStatus: "NOT_REQUIRED",
          availableAt: new Date(),
          createdByUserId: session.userId,
        },
      });
      const derivative = await transaction.documentDerivative.create({
        data: {
          vendorOrganizationId,
          sourceStoredObjectId: object.id,
          derivativeStoredObjectId: stored.id,
          kind: "MARKETPLACE_WEBP",
          width: info.width,
          height: info.height,
          status: "AVAILABLE",
        },
      });
      await transaction.vendorPortfolioReference.create({
        data: {
          vendorOrganizationId,
          artifactId: derivative.id,
          title: object.originalFileName.replace(/\.[^.]+$/, ""),
          altText: object.originalFileName.replace(/\.[^.]+$/, ""),
          published: false,
          createdById: session.userId,
        },
      });
      return {
        id: derivative.id,
        status: derivative.status,
        width: info.width,
        height: info.height,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await withPersistedContext(snapshot, (transaction) =>
        transaction.documentDerivative.findUnique({
          where: { sourceStoredObjectId: object.id },
        }),
      );
      if (raced)
        return { id: raced.id, status: raced.status, idempotent: true };
    }
    throw error;
  }
}

async function processDocumentTextExtraction(
  snapshot: PersistedConsumer,
  documentId: string,
  documentVersionId: string,
): Promise<Record<string, unknown>> {
  requireWorkspaceActorContext(snapshot, "DOCUMENT_EXTRACTION_CONTEXT_INVALID");
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const document = await transaction.vaultDocument.findFirst({
      where: {
        id: documentId,
        workspaceId: snapshot.workspace_id!,
        deletedAt: null,
      },
    });
    const version = await transaction.documentVersion.findFirst({
      where: {
        id: documentVersionId,
        documentId,
        workspaceId: snapshot.workspace_id!,
      },
    });
    if (!document || !version)
      throw new PermanentJobError(
        "Document extraction does not match persisted workspace context",
        "DOCUMENT_EXTRACTION_CONTEXT_MISMATCH",
      );
    const object = await transaction.storedObject.findFirst({
      where: {
        id: version.storedObjectId,
        workspaceId: snapshot.workspace_id!,
      },
    });
    if (!object || object.status !== "AVAILABLE")
      throw new Error("Document object is not available for extraction yet");
    const existing = await transaction.documentTextExtraction.findUnique({
      where: {
        documentVersionId_extractorVersion: {
          documentVersionId,
          extractorVersion: "slice-9.v1",
        },
      },
    });
    if (existing?.status === "COMPLETED")
      return {
        completed: true as const,
        extraction: existing,
        document,
        version,
        object,
      };
    const extraction = await transaction.documentTextExtraction.upsert({
      where: {
        documentVersionId_extractorVersion: {
          documentVersionId,
          extractorVersion: "slice-9.v1",
        },
      },
      create: {
        workspaceId: snapshot.workspace_id!,
        documentId,
        documentVersionId,
        status: "RUNNING",
        extractorVersion: "slice-9.v1",
      },
      update: {
        status: "RUNNING",
        errorRedacted: null,
      },
    });
    return { completed: false as const, extraction, document, version, object };
  });
  if (prepared.completed)
    return {
      extractionId: prepared.extraction.id,
      documentId,
      status: "COMPLETED",
      replayed: true,
    };

  try {
    const bytes = await storedObjectBytes(
      prepared.object.objectKey,
      Math.min(Number(prepared.object.sizeBytes ?? 10_000_000), 10_000_000),
    );
    const contentType = prepared.version.contentType.toLowerCase();
    let textContent: string;
    if (contentType === "application/pdf") {
      textContent = (await pdfParse(bytes)).text;
    } else if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      prepared.version.fileNameSnapshot.toLowerCase().endsWith(".docx")
    ) {
      textContent = (await mammoth.extractRawText({ buffer: bytes })).value;
    } else if (
      contentType.startsWith("text/") ||
      ["application/json", "application/xml"].includes(contentType)
    ) {
      textContent = bytes.toString("utf8");
    } else {
      throw new PermanentJobError(
        "Document type is not supported for text extraction",
        "DOCUMENT_EXTRACTION_UNSUPPORTED_TYPE",
      );
    }
    const normalized = textContent
      .replaceAll("\u0000", "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim()
      .slice(0, 500_000);
    const chunks = chunkDocumentText(normalized, 1_600, 100);
    const contentHash = createHash("sha256").update(normalized).digest("hex");
    await withPersistedContext(snapshot, async (transaction) => {
      await transaction.documentTextChunk.deleteMany({
        where: { extractionId: prepared.extraction.id },
      });
      for (const [chunkIndex, content] of chunks.entries()) {
        await transaction.documentTextChunk.create({
          data: {
            workspaceId: snapshot.workspace_id!,
            extractionId: prepared.extraction.id,
            chunkIndex,
            content,
            contentHash: createHash("sha256").update(content).digest("hex"),
            tokenEstimate: Math.ceil(content.length / 4),
            metadata: {
              untrustedContent: true,
              promptInjectionSignal: isUntrustedDocumentInstruction(content),
            },
          },
        });
      }
      await transaction.documentTextExtraction.update({
        where: { id: prepared.extraction.id },
        data: {
          status: "COMPLETED",
          contentHash,
          completedAt: new Date(),
        },
      });
    });
    return {
      extractionId: prepared.extraction.id,
      documentId,
      status: "COMPLETED",
      chunks: chunks.length,
    };
  } catch (error) {
    await withPersistedContext(snapshot, (transaction) =>
      transaction.documentTextExtraction.update({
        where: { id: prepared.extraction.id },
        data: {
          status: "FAILED",
          errorRedacted:
            error instanceof PermanentJobError
              ? error.code
              : "DOCUMENT_EXTRACTION_FAILED",
        },
      }),
    );
    throw error;
  }
}

function chunkDocumentText(content: string, size: number, maximum: number) {
  if (!content) return [];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < content.length && chunks.length < maximum) {
    let end = Math.min(offset + size, content.length);
    if (end < content.length) {
      const boundary = content.lastIndexOf("\n", end);
      if (boundary > offset + Math.floor(size / 2)) end = boundary;
    }
    chunks.push(content.slice(offset, end).trim());
    offset = end;
  }
  return chunks.filter(Boolean);
}

async function processDocumentCleanup(
  snapshot: PersistedConsumer,
  documentId: string,
): Promise<Record<string, unknown>> {
  assertPersistedAggregate(snapshot, "VaultDocument", documentId);
  const objects = await withPersistedContext(snapshot, async (transaction) => {
    const document = await transaction.vaultDocument.findFirst({
      where: {
        id: documentId,
        workspaceId: snapshot.workspace_id,
        vendorOrganizationId: snapshot.vendor_organization_id,
        status: "DELETED",
      },
    });
    if (!document)
      throw new PermanentJobError(
        "Deleted document does not match persisted context",
        "DOCUMENT_CLEANUP_CONTEXT_MISMATCH",
      );
    const versions = await transaction.documentVersion.findMany({
      where: { documentId },
      select: { storedObjectId: true },
    });
    return transaction.storedObject.findMany({
      where: {
        id: { in: versions.map((item) => item.storedObjectId) },
        status: { not: "DELETED" },
      },
    });
  });
  for (const object of objects) {
    await storage.send(
      new DeleteObjectCommand({
        Bucket: environment.OBJECT_STORAGE_BUCKET,
        Key: object.objectKey,
      }),
    );
    await withPersistedContext(snapshot, (transaction) =>
      transaction.storedObject.update({
        where: { id: object.id },
        data: { status: "DELETED", deletedAt: new Date() },
      }),
    );
  }
  return { documentId, deletedObjects: objects.length };
}

async function verifyTrustMonetizationAggregate(
  snapshot: PersistedConsumer,
): Promise<Record<string, unknown>> {
  return withPersistedContext(snapshot, async (transaction) => {
    const context = {
      aggregateType: snapshot.aggregate_type,
      aggregateId: snapshot.aggregate_id,
      workspaceId: snapshot.workspace_id,
      vendorOrganizationId: snapshot.vendor_organization_id,
    };
    const found =
      snapshot.aggregate_type === "ReviewEligibility"
        ? await transaction.reviewEligibility.findFirst({
            where: {
              id: snapshot.aggregate_id,
              ...(snapshot.workspace_id
                ? { workspaceId: snapshot.workspace_id }
                : {}),
              ...(snapshot.vendor_organization_id
                ? { vendorOrganizationId: snapshot.vendor_organization_id }
                : {}),
            },
            select: { id: true, status: true, version: true },
          })
        : snapshot.aggregate_type === "VendorReview"
          ? await transaction.vendorReview.findFirst({
              where: {
                id: snapshot.aggregate_id,
                ...(snapshot.workspace_id
                  ? { workspaceId: snapshot.workspace_id }
                  : {}),
                ...(snapshot.vendor_organization_id
                  ? { vendorOrganizationId: snapshot.vendor_organization_id }
                  : {}),
              },
              select: { id: true, status: true, version: true },
            })
          : snapshot.aggregate_type === "VendorSubscription"
            ? await transaction.vendorSubscription.findFirst({
                where: {
                  id: snapshot.aggregate_id,
                  ...(snapshot.vendor_organization_id
                    ? {
                        vendorOrganizationId: snapshot.vendor_organization_id,
                      }
                    : {}),
                },
                select: { id: true, status: true, version: true },
              })
            : snapshot.aggregate_type === "MarketplacePaymentAllocation"
              ? await transaction.marketplacePaymentAllocation.findFirst({
                  where: {
                    id: snapshot.aggregate_id,
                    ...(snapshot.workspace_id
                      ? { workspaceId: snapshot.workspace_id }
                      : {}),
                    ...(snapshot.vendor_organization_id
                      ? {
                          vendorOrganizationId: snapshot.vendor_organization_id,
                        }
                      : {}),
                  },
                  select: { id: true, status: true, version: true },
                })
              : snapshot.aggregate_type === "VendorPayoutAccount"
                ? await transaction.vendorPayoutAccount.findFirst({
                    where: {
                      id: snapshot.aggregate_id,
                      ...(snapshot.vendor_organization_id
                        ? {
                            vendorOrganizationId:
                              snapshot.vendor_organization_id,
                          }
                        : {}),
                    },
                    select: { id: true, status: true, version: true },
                  })
                : snapshot.aggregate_type === "VendorSettlement"
                  ? await transaction.vendorSettlement.findFirst({
                      where: {
                        id: snapshot.aggregate_id,
                        ...(snapshot.vendor_organization_id
                          ? {
                              vendorOrganizationId:
                                snapshot.vendor_organization_id,
                            }
                          : {}),
                      },
                      select: { id: true, status: true, version: true },
                    })
                  : snapshot.aggregate_type === "VendorPayout"
                    ? await transaction.vendorPayout.findFirst({
                        where: {
                          id: snapshot.aggregate_id,
                          ...(snapshot.vendor_organization_id
                            ? {
                                vendorOrganizationId:
                                  snapshot.vendor_organization_id,
                              }
                            : {}),
                        },
                        select: { id: true, status: true, version: true },
                      })
                    : {
                        id: snapshot.aggregate_id,
                        status: "VERIFIED",
                        version: 1,
                      };
    if (!found)
      throw new PermanentJobError(
        "Trust or monetization aggregate is absent from persisted tenant context",
        "TRUST_MONETIZATION_AGGREGATE_MISSING",
      );
    return { ...context, status: found.status, version: found.version };
  });
}

async function verifySecureCommerceAggregate(
  snapshot: PersistedConsumer,
): Promise<Record<string, unknown>> {
  return withPersistedContext(snapshot, async (transaction) => {
    const id = snapshot.aggregate_id;
    if (snapshot.aggregate_type === "VaultDocument") {
      const row = await transaction.vaultDocument.findFirst({
        where: {
          id,
          workspaceId: snapshot.workspace_id,
          vendorOrganizationId: snapshot.vendor_organization_id,
        },
        select: { id: true, status: true, version: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Document projection context mismatch",
          "DOCUMENT_PROJECTION_CONTEXT_MISMATCH",
        );
      return { aggregateType: snapshot.aggregate_type, ...row };
    }
    if (snapshot.aggregate_type === "ElectronicSignatureEnvelope") {
      const row = await transaction.electronicSignatureEnvelope.findFirst({
        where: {
          id,
          workspaceId: snapshot.workspace_id!,
          vendorOrganizationId: snapshot.vendor_organization_id!,
        },
        select: { id: true, status: true, version: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Signature projection context mismatch",
          "SIGNATURE_PROJECTION_CONTEXT_MISMATCH",
        );
      return { aggregateType: snapshot.aggregate_type, ...row };
    }
    if (snapshot.aggregate_type === "OnlinePaymentCheckout") {
      const row = await transaction.onlinePaymentCheckout.findFirst({
        where: { id, workspaceId: snapshot.workspace_id! },
        select: { id: true, status: true, version: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Payment checkout projection context mismatch",
          "PAYMENT_CHECKOUT_CONTEXT_MISMATCH",
        );
      return { aggregateType: snapshot.aggregate_type, ...row };
    }
    if (snapshot.aggregate_type === "OnlinePaymentTransaction") {
      const row = await transaction.onlinePaymentTransaction.findFirst({
        where: { id, workspaceId: snapshot.workspace_id! },
        select: { id: true, status: true, version: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Payment transaction projection context mismatch",
          "PAYMENT_TRANSACTION_CONTEXT_MISMATCH",
        );
      return { aggregateType: snapshot.aggregate_type, ...row };
    }
    if (snapshot.aggregate_type === "OnlinePaymentRefund") {
      const row = await transaction.onlinePaymentRefund.findFirst({
        where: { id, workspaceId: snapshot.workspace_id! },
        select: { id: true, status: true, version: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Payment refund projection context mismatch",
          "PAYMENT_REFUND_CONTEXT_MISMATCH",
        );
      return { aggregateType: snapshot.aggregate_type, ...row };
    }
    if (snapshot.aggregate_type === "PaymentReconciliationRun") {
      const row = await transaction.paymentReconciliationRun.findFirst({
        where: { id },
        select: { id: true, status: true, completedAt: true },
      });
      if (!row)
        throw new PermanentJobError(
          "Payment reconciliation projection context mismatch",
          "PAYMENT_RECONCILIATION_CONTEXT_MISMATCH",
        );
      return { aggregateType: snapshot.aggregate_type, ...row };
    }
    throw new PermanentJobError(
      "Unsupported secure-commerce aggregate",
      "SECURE_COMMERCE_AGGREGATE_UNSUPPORTED",
    );
  });
}

function assertPersistedAggregate(
  snapshot: PersistedConsumer,
  expectedType: string,
  expectedId: string,
): void {
  if (
    snapshot.aggregate_type !== expectedType ||
    snapshot.aggregate_id !== expectedId
  )
    throw new PermanentJobError(
      "Commercial aggregate does not match the persisted outbox relationship",
      "COMMERCIAL_PERSISTED_AGGREGATE_MISMATCH",
    );
}

async function processRfqDelivery(
  snapshot: PersistedConsumer,
  recipientId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id || !snapshot.vendor_organization_id)
    throw new PermanentJobError(
      "RFQ delivery requires persisted workspace and vendor organization",
      "RFQ_DELIVERY_CONTEXT_INVALID",
    );
  assertPersistedAggregate(snapshot, "RfqRecipient", recipientId);
  return withPersistedContext(snapshot, async (transaction) => {
    const recipient = await transaction.rfqRecipient.findFirst({
      where: {
        id: recipientId,
        workspaceId: snapshot.workspace_id!,
        vendorOrganizationId: snapshot.vendor_organization_id!,
      },
    });
    if (!recipient)
      throw new PermanentJobError(
        "RFQ recipient does not match persisted execution context",
        "RFQ_RECIPIENT_CONTEXT_MISMATCH",
      );
    if (recipient.status === "PENDING" || recipient.status === "QUEUED") {
      const updated = await transaction.rfqRecipient.update({
        where: { id: recipient.id },
        data: { status: "SENT", sentAt: new Date(), version: { increment: 1 } },
      });
      return {
        recipientId: updated.id,
        status: updated.status,
        delivered: true,
      };
    }
    return {
      recipientId: recipient.id,
      status: recipient.status,
      delivered: false,
      idempotent: true,
    };
  });
}

async function verifyCommercialAggregate(
  snapshot: PersistedConsumer,
  kind: "offer" | "booking" | "contract",
  id: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id || !snapshot.vendor_organization_id)
    throw new PermanentJobError(
      "Commercial projection requires persisted dual-tenant context",
      "COMMERCIAL_PROJECTION_CONTEXT_INVALID",
    );
  assertPersistedAggregate(
    snapshot,
    kind === "offer"
      ? "VendorOffer"
      : kind === "booking"
        ? "VendorBooking"
        : "VendorContract",
    id,
  );
  return withPersistedContext(snapshot, async (transaction) => {
    const where = {
      id,
      workspaceId: snapshot.workspace_id!,
      vendorOrganizationId: snapshot.vendor_organization_id!,
    };
    const row =
      kind === "offer"
        ? await transaction.vendorOffer.findFirst({ where })
        : kind === "booking"
          ? await transaction.vendorBooking.findFirst({ where })
          : await transaction.vendorContract.findFirst({ where });
    if (!row)
      throw new PermanentJobError(
        `${kind} does not match persisted execution context`,
        "COMMERCIAL_AGGREGATE_CONTEXT_MISMATCH",
      );
    return { kind, id: row.id, status: row.status, verified: true };
  });
}

async function verifyBudgetProjection(
  snapshot: PersistedConsumer,
  budgetItemId?: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Budget projection requires persisted workspace",
      "BUDGET_PROJECTION_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    if (!budgetItemId) {
      const plan = await transaction.budgetPlan.findUnique({
        where: { workspaceId: snapshot.workspace_id! },
        select: { id: true, version: true },
      });
      return { budgetPlanId: plan?.id ?? null, version: plan?.version ?? null };
    }
    const item = await transaction.budgetItem.findFirst({
      where: {
        id: budgetItemId,
        workspaceId: snapshot.workspace_id!,
        deletedAt: null,
      },
      select: { id: true, status: true, version: true },
    });
    if (!item)
      throw new PermanentJobError(
        "Budget item does not match persisted workspace",
        "BUDGET_ITEM_CONTEXT_MISMATCH",
      );
    return {
      budgetItemId: item.id,
      status: item.status,
      version: item.version,
    };
  });
}

async function verifyPaymentProjection(
  snapshot: PersistedConsumer,
  paymentId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Payment projection requires persisted workspace",
      "PAYMENT_PROJECTION_CONTEXT_INVALID",
    );
  assertPersistedAggregate(snapshot, "PaymentRecord", paymentId);
  return withPersistedContext(snapshot, async (transaction) => {
    const payment = await transaction.paymentRecord.findFirst({
      where: { id: paymentId, workspaceId: snapshot.workspace_id! },
      select: { id: true, status: true, version: true },
    });
    if (!payment)
      throw new PermanentJobError(
        "Payment does not match persisted workspace",
        "PAYMENT_CONTEXT_MISMATCH",
      );
    return {
      paymentId: payment.id,
      status: payment.status,
      version: payment.version,
    };
  });
}

async function processPaymentReminder(
  snapshot: PersistedConsumer,
  scheduleId: string,
  expectedVersion: number,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Payment reminder requires persisted workspace",
      "PAYMENT_REMINDER_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const schedule = await transaction.paymentScheduleEntry.findFirst({
      where: { id: scheduleId, workspaceId: snapshot.workspace_id! },
    });
    if (!schedule)
      throw new PermanentJobError(
        "Payment schedule does not match persisted workspace",
        "PAYMENT_SCHEDULE_CONTEXT_MISMATCH",
      );
    if (
      schedule.deletedAt ||
      schedule.version !== expectedVersion ||
      schedule.status === "PAID" ||
      schedule.status === "CANCELLED"
    ) {
      return { scheduleId, stale: true, notificationCreated: false };
    }
    const recipientUserId = snapshot.actor_user_id ?? schedule.createdById;
    const notification = await transaction.notification.upsert({
      where: { sourceEventId: snapshot.outbox_message_id },
      create: {
        userId: recipientUserId,
        workspaceId: snapshot.workspace_id,
        module: "payments",
        kind: "payment_due",
        priority: schedule.dueAt.getTime() < Date.now() ? "high" : "normal",
        title: "Plată programată",
        body: `${schedule.name} are scadența la ${schedule.dueAt.toISOString().slice(0, 10)}.`,
        actionUrl: "/payments",
        sourceEventId: snapshot.outbox_message_id,
        deduplicationKey: `payment-reminder:${schedule.id}:${expectedVersion}`,
      },
      update: {},
    });
    await transaction.paymentScheduleEntry.update({
      where: { id: schedule.id },
      data: { reminderSentAt: new Date() },
    });
    return {
      scheduleId,
      stale: false,
      notificationCreated: true,
      notificationId: notification.id,
    };
  });
}

async function projectVendorNotifications(
  snapshot: PersistedConsumer,
  requestedVendorOrganizationId: string,
  requestedRecipientUserId?: string,
): Promise<Record<string, unknown>> {
  if (
    !snapshot.vendor_organization_id ||
    requestedVendorOrganizationId !== snapshot.vendor_organization_id
  )
    throw new PermanentJobError(
      "Vendor notification organization does not match persisted context",
      "VENDOR_NOTIFICATION_CONTEXT_MISMATCH",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const memberships = await transaction.vendorOrganizationMembership.findMany(
      {
        where: {
          vendorOrganizationId: snapshot.vendor_organization_id!,
          status: "ACTIVE",
          ...(requestedRecipientUserId
            ? { userId: requestedRecipientUserId }
            : {}),
        },
        select: { userId: true },
      },
    );
    const content = vendorNotificationContent(snapshot.event_name);
    const created: string[] = [];
    for (const membership of memberships) {
      const notification = await transaction.vendorNotification.upsert({
        where: {
          deduplicationKey: `vendor-notification:${snapshot.outbox_message_id}:${membership.userId}`,
        },
        create: {
          vendorOrganizationId: snapshot.vendor_organization_id!,
          userId: membership.userId,
          kind: content.kind,
          priority: content.priority,
          title: content.title,
          body: content.body,
          actionUrl: content.actionUrl,
          sourceEventId: snapshot.outbox_message_id,
          deduplicationKey: `vendor-notification:${snapshot.outbox_message_id}:${membership.userId}`,
        },
        update: {},
      });
      created.push(notification.id);
    }
    return { vendorOrganizationId: snapshot.vendor_organization_id, created };
  });
}

function vendorNotificationContent(eventName: string) {
  if (eventName.startsWith("rfq."))
    return {
      kind: "rfq",
      priority: "high",
      title: "Cerere de ofertă nouă",
      body: "O cerere de ofertă este disponibilă în inboxul furnizorului.",
      actionUrl: "/vendor/requests",
    };
  if (eventName.startsWith("contract."))
    return {
      kind: "contract",
      priority: "normal",
      title: "Contract actualizat",
      body: "Starea contractului operațional s-a modificat.",
      actionUrl: "/vendor/contracts",
    };
  if (eventName.startsWith("booking."))
    return {
      kind: "booking",
      priority: "normal",
      title: "Booking actualizat",
      body: "Un booking al organizației a fost actualizat.",
      actionUrl: "/vendor/bookings",
    };
  return {
    kind: "commercial",
    priority: "normal",
    title: "Actualizare comercială",
    body: "A apărut o actualizare comercială în Vendor OS.",
    actionUrl: "/vendor",
  };
}

async function prepareContractExport(
  snapshot: PersistedConsumer,
  request: {
    artifactId: string;
    contractVersionId: string;
    requestedByUserId: string;
    format: "html" | "pdf";
  },
): Promise<PreparedArtifact> {
  if (!snapshot.workspace_id || !snapshot.background_job_id)
    throw new PermanentJobError(
      "Contract export requires persisted workspace and job",
      "CONTRACT_EXPORT_CONTEXT_INVALID",
    );
  if (request.requestedByUserId !== snapshot.actor_user_id)
    throw new PermanentJobError(
      "Contract export owner does not match persisted actor",
      "CONTRACT_EXPORT_OWNER_INVALID",
    );
  if (request.format === "pdf")
    throw new PermanentJobError(
      "PDF export is planned but no verified PDF renderer is configured",
      "CONTRACT_PDF_RENDERER_UNAVAILABLE",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const version = await transaction.vendorContractVersion.findFirst({
      where: {
        id: request.contractVersionId,
        workspaceId: snapshot.workspace_id!,
      },
    });
    if (!version)
      throw new PermanentJobError(
        "Contract version does not match persisted workspace",
        "CONTRACT_VERSION_CONTEXT_MISMATCH",
      );
    const document = JSON.stringify(version.document, null, 2);
    const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Contract Sarbato</title></head><body><main><h1>Contract operațional Sarbato</h1><p>${escapeHtml(version.summary)}</p><h2>Domeniul serviciilor</h2><pre>${escapeHtml(JSON.stringify(version.serviceScope, null, 2))}</pre><h2>Conținut</h2><pre>${escapeHtml(document)}</pre><h2>Anulare</h2><p>${escapeHtml(version.cancellationTerms)}</p><p>Hash versiune: ${escapeHtml(version.contentHash)}</p></main></body></html>`;
    const sizeBytes = Buffer.byteLength(html, "utf8");
    if (sizeBytes > environment.ARTIFACT_MAX_BYTES)
      throw new PermanentJobError(
        "Contract export exceeds size limit",
        "EXPORT_SIZE_LIMIT",
      );
    const expiresAt = new Date(
      Date.now() + environment.ARTIFACT_RETENTION_HOURS * 60 * 60 * 1000,
    );
    const artifact = await transaction.generatedArtifact.upsert({
      where: { consumerExecutionId: snapshot.execution_id },
      create: {
        id: request.artifactId,
        backgroundJobId: snapshot.background_job_id!,
        consumerExecutionId: snapshot.execution_id,
        workspaceId: snapshot.workspace_id,
        vendorOrganizationId: snapshot.vendor_organization_id,
        ownerUserId: request.requestedByUserId,
        kind: "contract_html",
        storageKey: `${request.artifactId}.html`,
        fileName: `weddingos-contract-${version.contractId}-v${version.versionNumber}.html`,
        mediaType: "text/html; charset=utf-8",
        expiresAt,
      },
      update: {
        status: "GENERATING",
        expiresAt,
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    return {
      id: artifact.id,
      storageKey: artifact.storageKey,
      fileName: artifact.fileName,
      content: html,
      mediaType: artifact.mediaType,
      rowCount: 1,
      sizeBytes,
      sha256: createHash("sha256").update(html, "utf8").digest("hex"),
      expiresAt,
    };
  });
}

async function prepareCommercialExport(
  snapshot: PersistedConsumer,
  request: {
    artifactId: string;
    requestedByUserId: string;
    type: "budget" | "payment_schedule" | "booking" | "offer_comparison";
    format: "csv" | "xlsx";
    resourceId?: string | null | undefined;
  },
): Promise<PreparedArtifact> {
  if (!snapshot.workspace_id || !snapshot.background_job_id)
    throw new PermanentJobError(
      "Commercial export requires persisted workspace and job",
      "COMMERCIAL_EXPORT_CONTEXT_INVALID",
    );
  if (request.requestedByUserId !== snapshot.actor_user_id)
    throw new PermanentJobError(
      "Commercial export owner does not match persisted actor",
      "COMMERCIAL_EXPORT_OWNER_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    let rows: Array<Record<string, string | number | boolean>>;
    if (request.type === "budget") {
      const items = await transaction.budgetItem.findMany({
        where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
        orderBy: [{ dueAt: "asc" }, { name: "asc" }],
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = items.map((item) => ({
        name: item.name,
        status: item.status,
        estimated_minor: item.estimatedMinor.toString(),
        quoted_minor: item.quotedMinor?.toString() ?? "",
        committed_minor: item.committedMinor?.toString() ?? "",
        paid_minor: item.paidMinor.toString(),
        due_at: item.dueAt?.toISOString() ?? "",
      }));
    } else if (request.type === "payment_schedule") {
      const entries = await transaction.paymentScheduleEntry.findMany({
        where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
        orderBy: [{ dueAt: "asc" }, { sequence: "asc" }],
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = entries.map((entry) => ({
        name: entry.name,
        status: entry.status,
        amount_minor: entry.amountMinor.toString(),
        paid_minor: entry.paidMinor.toString(),
        due_at: entry.dueAt.toISOString(),
      }));
    } else if (request.type === "booking") {
      const bookings = await transaction.vendorBooking.findMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          ...(request.resourceId ? { id: request.resourceId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = bookings.map((booking) => ({
        title: booking.title,
        status: booking.status,
        currency: booking.currency,
        total_minor: booking.totalMinor.toString(),
        deposit_minor: booking.depositMinor?.toString() ?? "",
        service_start_at: booking.serviceStartAt?.toISOString() ?? "",
      }));
    } else {
      const offers = await transaction.vendorOffer.findMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          ...(request.resourceId ? { rfqId: request.resourceId } : {}),
        },
        orderBy: [{ totalMinor: "asc" }, { createdAt: "asc" }],
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = offers.map((offer) => ({
        offer_id: offer.id,
        status: offer.status,
        currency: offer.currency,
        total_minor: offer.totalMinor.toString(),
        deposit_minor: offer.depositMinor?.toString() ?? "",
        valid_until: offer.validUntil?.toISOString() ?? "",
      }));
    }
    if (rows.length > environment.ARTIFACT_MAX_ROWS)
      throw new PermanentJobError(
        "Commercial export exceeds row limit",
        "EXPORT_ROW_LIMIT",
      );
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      `commercial_${request.type}`,
      `weddingos-${request.type.replaceAll("_", "-")}`,
      request.format,
      rows,
      request.artifactId,
    );
  });
}

async function prepareWeddingDayExport(
  snapshot: PersistedConsumer,
  request: {
    artifactId: string;
    requestedByUserId: string;
    type:
      | "RUN_SHEET"
      | "CONTACT_SHEET"
      | "CHECK_IN_MANIFEST"
      | "ATTENDANCE"
      | "INCIDENTS";
    format: "csv" | "xlsx";
    planId?: string | null | undefined;
    sessionId?: string | null | undefined;
  },
): Promise<PreparedArtifact> {
  if (!snapshot.workspace_id || !snapshot.background_job_id)
    throw new PermanentJobError(
      "Wedding Day export requires persisted workspace and job",
      "WEDDING_DAY_EXPORT_CONTEXT_INVALID",
    );
  if (request.requestedByUserId !== snapshot.actor_user_id)
    throw new PermanentJobError(
      "Wedding Day export owner does not match persisted actor",
      "WEDDING_DAY_EXPORT_OWNER_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    let rows: Array<Record<string, string | number | boolean>> = [];
    if (request.type === "RUN_SHEET") {
      if (!request.planId)
        throw new PermanentJobError(
          "Run sheet export requires a plan",
          "WEDDING_DAY_EXPORT_PLAN_REQUIRED",
        );
      const items = await transaction.runOfShowItem.findMany({
        where: { workspaceId: snapshot.workspace_id!, planId: request.planId },
        orderBy: [{ position: "asc" }, { plannedStartAt: "asc" }],
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = items.map((item) => ({
        title: item.title,
        type: item.type,
        status: item.status,
        priority: item.priority,
        planned_start_at: item.plannedStartAt.toISOString(),
        planned_end_at: item.plannedEndAt?.toISOString() ?? "",
        actual_start_at: item.actualStartAt?.toISOString() ?? "",
        actual_end_at: item.actualEndAt?.toISOString() ?? "",
        location: item.locationName ?? "",
        critical: item.isCritical,
      }));
    } else if (request.type === "CONTACT_SHEET") {
      if (!request.planId)
        throw new PermanentJobError(
          "Contact sheet export requires a plan",
          "WEDDING_DAY_EXPORT_PLAN_REQUIRED",
        );
      const contacts = await transaction.weddingDayContact.findMany({
        where: { workspaceId: snapshot.workspace_id!, planId: request.planId },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = contacts.map((contact) => ({
        name: contact.name,
        role: contact.role,
        organization: contact.organizationName ?? "",
        phone: decryptSensitiveValue(contact.phoneEncrypted) ?? "",
        email: contact.emailNormalized ?? "",
        priority: contact.priority,
        guest_visible: contact.guestVisible,
      }));
    } else if (request.type === "INCIDENTS") {
      if (!request.planId)
        throw new PermanentJobError(
          "Incident export requires a plan",
          "WEDDING_DAY_EXPORT_PLAN_REQUIRED",
        );
      const incidents = await transaction.weddingDayIncident.findMany({
        where: { workspaceId: snapshot.workspace_id!, planId: request.planId },
        orderBy: [{ severity: "desc" }, { startedAt: "desc" }],
        take: environment.ARTIFACT_MAX_ROWS + 1,
      });
      rows = incidents.map((incident) => ({
        title: incident.title,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        started_at: incident.startedAt.toISOString(),
        acknowledged_at: incident.acknowledgedAt?.toISOString() ?? "",
        resolved_at: incident.resolvedAt?.toISOString() ?? "",
        assigned_membership_id: incident.assignedToMembershipId ?? "",
      }));
    } else {
      if (!request.sessionId)
        throw new PermanentJobError(
          "Check-in export requires a session",
          "WEDDING_DAY_EXPORT_SESSION_REQUIRED",
        );
      const session = await transaction.guestCheckInSession.findFirst({
        where: { id: request.sessionId, workspaceId: snapshot.workspace_id! },
      });
      if (!session)
        throw new PermanentJobError(
          "Check-in session no longer exists",
          "WEDDING_DAY_EXPORT_SESSION_MISSING",
        );
      if (request.type === "ATTENDANCE") {
        const checkIns = await transaction.guestCheckIn.findMany({
          where: { workspaceId: snapshot.workspace_id!, sessionId: session.id },
          orderBy: { updatedAt: "desc" },
          take: environment.ARTIFACT_MAX_ROWS + 1,
        });
        const guests = await transaction.guest.findMany({
          where: { id: { in: checkIns.map((row) => row.guestId) } },
          select: { id: true, firstName: true, lastName: true },
        });
        const names = new Map(
          guests.map((guest) => [
            guest.id,
            `${guest.firstName} ${guest.lastName}`.trim(),
          ]),
        );
        rows = checkIns.map((checkIn) => ({
          guest: names.get(checkIn.guestId) ?? checkIn.guestId,
          status: checkIn.status,
          source: checkIn.source,
          checked_in_at: checkIn.checkedInAt?.toISOString() ?? "",
          checked_out_at: checkIn.checkedOutAt?.toISOString() ?? "",
          station_id: checkIn.stationId ?? "",
        }));
      } else {
        const guests = await transaction.guest.findMany({
          where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
          orderBy: [{ householdId: "asc" }, { firstName: "asc" }],
          take: environment.ARTIFACT_MAX_ROWS + 1,
        });
        const [households, responses, checkIns] = await Promise.all([
          transaction.household.findMany({
            where: { id: { in: guests.map((guest) => guest.householdId) } },
            select: { id: true, name: true },
          }),
          transaction.guestEventResponse.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              weddingEventId: session.weddingEventId,
              guestId: { in: guests.map((guest) => guest.id) },
            },
          }),
          transaction.guestCheckIn.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              sessionId: session.id,
            },
          }),
        ]);
        const householdNames = new Map(
          households.map((household) => [household.id, household.name]),
        );
        const responseState = new Map(
          responses.map((response) => [response.guestId, response.attendance]),
        );
        const checkInState = new Map(
          checkIns.map((checkIn) => [checkIn.guestId, checkIn.status]),
        );
        rows = guests.map((guest) => ({
          guest: `${guest.firstName} ${guest.lastName}`.trim(),
          household: householdNames.get(guest.householdId) ?? "",
          rsvp: responseState.get(guest.id) ?? "NO_RESPONSE",
          check_in_status: checkInState.get(guest.id) ?? "NOT_CHECKED_IN",
          child: guest.isChild,
        }));
      }
    }
    if (rows.length > environment.ARTIFACT_MAX_ROWS)
      throw new PermanentJobError(
        "Wedding Day export exceeds row limit",
        "EXPORT_ROW_LIMIT",
      );
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      `wedding_day_${request.type.toLowerCase()}`,
      `weddingos-${request.type.toLowerCase().replaceAll("_", "-")}`,
      request.format,
      rows,
      request.artifactId,
    );
  });
}

function decryptSensitiveValue(value: string | null): string | null {
  if (!value) return null;
  try {
    const envelope = JSON.parse(value) as {
      version: number;
      keyId: string;
      algorithm: string;
      nonce: string;
      tag: string;
      ciphertext: string;
    };
    if (
      envelope.version !== 1 ||
      envelope.algorithm !== "AES-256-GCM" ||
      envelope.keyId !== environment.OUTBOX_ENCRYPTION_KEY_ID
    )
      return null;
    const key = createHash("sha256")
      .update(environment.OUTBOX_ENCRYPTION_KEY, "utf8")
      .digest();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(envelope.nonce, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

async function processPlanGeneration(
  snapshot: PersistedConsumer,
  generationRunId: string,
  mode: "deterministic" | "ai_enriched" | "auto",
): Promise<Record<string, unknown>> {
  if (
    !snapshot.workspace_id ||
    !snapshot.actor_user_id ||
    !snapshot.background_job_id
  )
    throw new PermanentJobError(
      "Plan generation requires persisted workspace, actor and job",
      "PLAN_GENERATION_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const run = await transaction.planGenerationRun.findFirst({
      where: {
        id: generationRunId,
        workspaceId: snapshot.workspace_id!,
        requestedByUserId: snapshot.actor_user_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!run)
      throw new PermanentJobError(
        "Plan generation run does not match persisted execution context",
        "PLAN_GENERATION_RUN_INVALID",
      );
    const existing = await transaction.planProposal.findUnique({
      where: { generationRunId: run.id },
    });
    if (existing) {
      return {
        proposalId: existing.id,
        fallbackUsed: existing.fallbackUsed,
        generatorType: existing.generatorType,
      };
    }
    await transaction.planGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        version: { increment: 1 },
      },
    });
    const [draft, workspace] = await Promise.all([
      transaction.onboardingDraft.findFirst({
        where: {
          id: run.onboardingDraftId,
          workspaceId: snapshot.workspace_id!,
          version: run.onboardingVersion,
          status: "READY",
        },
      }),
      transaction.workspace.findUnique({
        where: { id: snapshot.workspace_id! },
      }),
    ]);
    if (!draft || !workspace)
      throw new PermanentJobError(
        "Onboarding snapshot is no longer available for generation",
        "ONBOARDING_SNAPSHOT_MISSING",
      );
    const input: PlanGenerationInput = {
      workspaceId: snapshot.workspace_id!,
      onboardingDraftId: draft.id,
      onboardingVersion: draft.version,
      timezone: workspace.timezone,
      couple: jsonRecord(draft.couple),
      dateEvents: jsonRecord(draft.dateEvents),
      location: jsonRecord(draft.location),
      guests: jsonRecord(draft.guests),
      budget: jsonRecord(draft.budget),
      style: jsonRecord(draft.style),
      existingProgress: jsonRecord(draft.existingProgress),
      planningPreferences: jsonRecord(draft.planningPreferences),
    };
    const deterministic = new DeterministicPlanProvider();
    const provider =
      mode === "deterministic"
        ? deterministic
        : new ConfiguredAiPlanProvider(
            (providerInput, baseline) =>
              callConfiguredPlanProvider(providerInput, baseline),
            deterministic,
          );
    const output = await provider.generatePlan(input);
    if (output.coverage.missing.length)
      throw new PermanentJobError(
        `Generated plan is missing coverage: ${output.coverage.missing.join(", ")}`,
        "PLAN_COVERAGE_INVALID",
      );
    const proposalId = randomUUID();
    const itemIds = new Map(
      output.items.map((item) => [item.key, randomUUID()] as const),
    );
    const proposal = await transaction.planProposal.create({
      data: {
        id: proposalId,
        workspaceId: snapshot.workspace_id!,
        onboardingDraftId: draft.id,
        onboardingVersion: draft.version,
        generationRunId: run.id,
        status: "READY_FOR_REVIEW",
        title: output.title,
        summary: output.summary,
        assumptions: output.assumptions,
        warnings: output.warnings,
        coverageResult: output.coverage,
        generatorType: output.generatorType,
        provider: output.provider,
        model: output.model,
        rulesVersion: output.rulesVersion,
        inputHash: run.inputHash,
        fallbackUsed: output.fallbackUsed,
        createdById: snapshot.actor_user_id!,
      },
    });
    await transaction.planProposalItem.createMany({
      data: output.items.map((item) => ({
        id: itemIds.get(item.key)!,
        workspaceId: snapshot.workspace_id!,
        proposalId,
        type: item.type.toUpperCase() as "PHASE" | "MILESTONE" | "TASK",
        parentItemId: item.parentKey
          ? (itemIds.get(item.parentKey) ?? null)
          : null,
        sourceKey: item.key,
        title: item.title,
        description: item.description,
        category: item.category,
        priority: item.priority
          ? (item.priority.toUpperCase() as
              "LOW" | "MEDIUM" | "HIGH" | "URGENT")
          : null,
        relativeStartOffsetDays: item.relativeStartOffsetDays,
        relativeDueOffsetDays: item.relativeDueOffsetDays,
        absoluteStartAt: isoDate(item.absoluteStartAt),
        absoluteDueAt: isoDate(item.absoluteDueAt),
        estimatedEffortMinutes: item.estimatedEffortMinutes,
        suggestedOwnerType: item.suggestedOwnerType,
        required: item.required,
        included: item.included,
        position: item.position,
        metadata: item.metadata as Prisma.InputJsonValue,
      })),
    });
    await transaction.planProposal.updateMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        id: { not: proposalId },
        onboardingVersion: { lt: draft.version },
        status: "READY_FOR_REVIEW",
      },
      data: {
        status: "SUPERSEDED",
        supersededAt: new Date(),
        version: { increment: 1 },
      },
    });
    await transaction.planGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        proposalId,
        provider: output.provider,
        model: output.model,
        fallbackUsed: output.fallbackUsed,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    const derivedPayload = {
      occurredAt: new Date().toISOString(),
      subject: {
        proposalId,
        generationRunId,
        fallbackUsed: output.fallbackUsed,
      },
      notification: {
        recipientUserId: snapshot.actor_user_id!,
        module: "planning",
        kind: "plan_proposal_ready",
        priority: "high",
        title: "Propunerea de plan este pregătită",
        body: output.fallbackUsed
          ? "Planul a fost generat cu motorul determinist după indisponibilitatea providerului AI."
          : "Verifică propunerea înainte de a crea taskurile definitive.",
        actionUrl: `/plan?proposal=${proposalId}`,
      },
      activity: {
        category: "planning",
        action: "plan_proposal_ready",
        summary: "Propunerea structurată de plan este pregătită pentru review.",
        entityType: "PlanProposal",
        entityId: proposalId,
      },
    };
    await transaction.$queryRaw`
      SELECT public.weddingos_record_worker_derived_event(
        ${"planning.plan_proposal_ready.v1"}, ${"PlanProposal"},
        ${proposal.id}, CAST(${proposal.version} AS integer), ${snapshot.workspace_id}::uuid,
        ${snapshot.actor_user_id}::uuid, ${snapshot.correlation_id},
        ${`plan-proposal-ready:${proposal.id}`},
        ${JSON.stringify(derivedPayload)}::jsonb
      )
    `;
    return {
      proposalId,
      fallbackUsed: output.fallbackUsed,
      generatorType: output.generatorType,
      taskCount: output.items.filter((item) => item.type === "task").length,
    };
  });
}

async function callConfiguredPlanProvider(
  input: PlanGenerationInput,
  baseline: PlanGenerationOutput,
): Promise<Partial<PlanGenerationOutput>> {
  if (!environment.PLAN_GENERATION_PROVIDER_URL)
    throw new Error("No external plan provider is configured");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(environment.PLAN_GENERATION_PROVIDER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(environment.PLAN_GENERATION_PROVIDER_KEY
          ? {
              authorization: `Bearer ${environment.PLAN_GENERATION_PROVIDER_KEY}`,
            }
          : {}),
      },
      body: JSON.stringify({
        contract: "weddingos.plan-generation.v1",
        model: environment.PLAN_GENERATION_PROVIDER_MODEL,
        input,
        baseline,
      }),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Configured provider returned HTTP ${response.status}`);
    const value = (await response.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Configured provider returned an invalid object");
    const result = value as Partial<PlanGenerationOutput>;
    return {
      ...result,
      provider: "configured_http",
      model: environment.PLAN_GENERATION_PROVIDER_MODEL,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function processGuestImport(
  snapshot: PersistedConsumer,
  importId: string,
): Promise<Record<string, unknown>> {
  if (
    !snapshot.workspace_id ||
    !snapshot.actor_user_id ||
    !snapshot.background_job_id
  )
    throw new PermanentJobError(
      "Guest import requires persisted workspace, actor and job",
      "GUEST_IMPORT_CONTEXT_INVALID",
    );
  const source = await withPersistedContext(snapshot, async (transaction) => {
    const row = await transaction.guestImport.findFirst({
      where: {
        id: importId,
        workspaceId: snapshot.workspace_id!,
        createdById: snapshot.actor_user_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!row)
      throw new PermanentJobError(
        "Guest import does not match persisted context",
        "GUEST_IMPORT_INVALID",
      );
    await transaction.guestImport.update({
      where: { id: row.id },
      data: { status: "PARSING", version: { increment: 1 } },
    });
    return { storageKey: row.storageKey, mediaType: row.mediaType };
  });
  if (
    basename(source.storageKey) !== source.storageKey ||
    !/^[0-9a-f-]{36}\.(csv|xlsx)$/i.test(source.storageKey)
  )
    throw new PermanentJobError(
      "Guest import storage key is invalid",
      "GUEST_IMPORT_STORAGE_INVALID",
    );
  const importRoot = resolve(
    environment.ARTIFACT_ROOT,
    "..",
    "..",
    "imports",
    "guest-imports",
  );
  const buffer = await readFile(join(importRoot, source.storageKey));
  const rawRows = source.storageKey.toLowerCase().endsWith(".csv")
    ? readCsvRows(buffer, environment.ARTIFACT_MAX_ROWS)
    : await readXlsxRows(buffer, environment.ARTIFACT_MAX_ROWS);
  if (rawRows.length > environment.ARTIFACT_MAX_ROWS)
    throw new PermanentJobError(
      `Guest import exceeds ${environment.ARTIFACT_MAX_ROWS} rows`,
      "GUEST_IMPORT_ROW_LIMIT",
    );
  const headers = Object.keys(rawRows[0] ?? {});
  const mapping = inferGuestImportMapping(headers);
  const existingGuests = await withPersistedContext(snapshot, (transaction) =>
    transaction.guest.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        status: { not: "REMOVED" },
      },
      select: {
        id: true,
        householdId: true,
        emailNormalized: true,
        phoneE164: true,
      },
    }),
  );
  const byEmail = new Map(
    existingGuests
      .filter((guest) => guest.emailNormalized)
      .map((guest) => [guest.emailNormalized!, guest]),
  );
  const byPhone = new Map(
    existingGuests
      .filter((guest) => guest.phoneE164)
      .map((guest) => [guest.phoneE164!, guest]),
  );
  const parsed = rawRows.map((raw, index) => {
    const normalized = normalizeImportedGuest(raw, mapping);
    const errors: string[] = [];
    if (!normalized.firstName && !normalized.lastName)
      errors.push("NAME_REQUIRED");
    if (
      normalized.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)
    )
      errors.push("EMAIL_INVALID");
    const duplicate =
      (normalized.email ? byEmail.get(normalized.email) : undefined) ??
      (normalized.phone ? byPhone.get(normalized.phone) : undefined);
    return {
      workspaceId: snapshot.workspace_id!,
      importId,
      rowNumber: index + 2,
      rawDataRedacted: redactImportRow(raw) as Prisma.InputJsonValue,
      normalizedData: normalized as Prisma.InputJsonValue,
      validationErrors: errors as Prisma.InputJsonValue,
      duplicateGuestId: duplicate?.id ?? null,
      duplicateHouseholdId: duplicate?.householdId ?? null,
      decision: (errors.length
        ? "SKIP"
        : duplicate
          ? "MERGE_WITH_EXISTING"
          : "CREATE_NEW") as "SKIP" | "MERGE_WITH_EXISTING" | "CREATE_NEW",
    };
  });
  const result = await withPersistedContext(snapshot, async (transaction) => {
    await transaction.guestImportRow.deleteMany({ where: { importId } });
    if (parsed.length)
      await transaction.guestImportRow.createMany({ data: parsed });
    const validRows = parsed.filter(
      (row) => (row.validationErrors as unknown[]).length === 0,
    ).length;
    const duplicateRows = parsed.filter((row) => row.duplicateGuestId).length;
    const status = Object.keys(mapping).length
      ? "READY_FOR_REVIEW"
      : "READY_FOR_MAPPING";
    const updated = await transaction.guestImport.update({
      where: { id: importId },
      data: {
        status,
        mapping,
        totalRows: parsed.length,
        validRows,
        invalidRows: parsed.length - validRows,
        duplicateRows,
        version: { increment: 1 },
      },
    });
    return {
      importId,
      status: updated.status.toLowerCase(),
      totalRows: parsed.length,
      validRows,
      invalidRows: parsed.length - validRows,
      duplicateRows,
    };
  });
  return result;
}

async function processCampaignFanout(
  snapshot: PersistedConsumer,
  campaignId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id || !snapshot.actor_user_id)
    throw new PermanentJobError(
      "Campaign fan-out requires persisted workspace and actor",
      "CAMPAIGN_FANOUT_CONTEXT_INVALID",
    );
  return withPersistedContext(
    snapshot,
    async (transaction) => {
      await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`invitation-site-workspace:${snapshot.workspace_id!}`},
          0
        )
      )
    `;
      const campaign = await transaction.campaign.findFirst({
        where: { id: campaignId, workspaceId: snapshot.workspace_id! },
      });
      if (
        !campaign ||
        !["QUEUED", "SCHEDULED", "SENDING"].includes(campaign.status)
      )
        throw new PermanentJobError(
          "Campaign is unavailable for fan-out",
          "CAMPAIGN_FANOUT_INVALID",
        );
      const recipients = await transaction.campaignRecipient.findMany({
        where: {
          campaignId,
          workspaceId: snapshot.workspace_id!,
          status: "PENDING",
        },
        orderBy: { id: "asc" },
      });
      await transaction.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "SENDING",
          startedAt: campaign.startedAt ?? new Date(),
          version: { increment: 1 },
        },
      });
      for (const recipient of recipients) {
        await transaction.campaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "QUEUED",
            queuedAt: new Date(),
            version: { increment: 1 },
          },
        });
        const payload = {
          occurredAt: new Date().toISOString(),
          subject: { campaignId, campaignRecipientId: recipient.id },
          campaignDelivery: { campaignRecipientId: recipient.id },
        };
        await transaction.$queryRaw`
        SELECT public.weddingos_record_worker_derived_event(
          ${"campaign.recipient_delivery_requested.v1"}, ${"CampaignRecipient"},
          ${recipient.id}, CAST(${recipient.version + 1} AS integer), ${snapshot.workspace_id}::uuid,
          ${snapshot.actor_user_id}::uuid, ${snapshot.correlation_id},
          ${`campaign-delivery:${campaign.id}:${recipient.id}:v${recipient.version + 1}`},
          ${JSON.stringify(payload)}::jsonb
        )
      `;
      }
      return {
        campaignId,
        queuedRecipients: recipients.length,
        deliveryIntentCommitted: true,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

async function processCampaignDelivery(
  snapshot: PersistedConsumer,
  campaignRecipientId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id || !snapshot.actor_user_id)
    throw new PermanentJobError(
      "Campaign delivery requires persisted workspace and actor",
      "CAMPAIGN_DELIVERY_CONTEXT_INVALID",
    );
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const recipient = await transaction.campaignRecipient.findFirst({
      where: { id: campaignRecipientId, workspaceId: snapshot.workspace_id! },
    });
    if (!recipient)
      throw new PermanentJobError(
        "Campaign recipient does not match persisted context",
        "CAMPAIGN_RECIPIENT_INVALID",
      );
    if (["SENT", "DELIVERED", "OPENED"].includes(recipient.status))
      return {
        skip: true as const,
        campaignId: recipient.campaignId,
        status: recipient.status.toLowerCase(),
      };
    if (["UNSUBSCRIBED", "CANCELLED"].includes(recipient.status))
      return {
        skip: true as const,
        campaignId: recipient.campaignId,
        status: recipient.status.toLowerCase(),
      };
    const campaign = await transaction.campaign.findFirst({
      where: { id: recipient.campaignId, workspaceId: snapshot.workspace_id! },
    });
    const invitationRecipient = await transaction.invitationRecipient.findFirst(
      {
        where: {
          id: recipient.invitationRecipientId,
          workspaceId: snapshot.workspace_id!,
          revokedAt: null,
        },
      },
    );
    if (!campaign || !invitationRecipient || campaign.status === "CANCELLED")
      throw new PermanentJobError(
        "Campaign delivery target is no longer active",
        "CAMPAIGN_TARGET_INACTIVE",
      );
    const householdId =
      invitationRecipient.householdId ??
      (invitationRecipient.guestId
        ? (
            await transaction.guest.findUnique({
              where: { id: invitationRecipient.guestId },
            })
          )?.householdId
        : null);
    if (!householdId)
      throw new PermanentJobError(
        "Campaign target has no household",
        "CAMPAIGN_HOUSEHOLD_MISSING",
      );
    const token = createHmac("sha256", environment.OUTBOX_ENCRYPTION_KEY)
      .update(`guest-access:v2:${invitationRecipient.id}:EMAIL`)
      .digest("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await transaction.guestAccessGrant.updateMany({
      where: {
        invitationRecipientId: invitationRecipient.id,
        channel: "EMAIL",
        revokedAt: null,
        tokenHash: { not: tokenHash },
      },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    const existingGrant = await transaction.guestAccessGrant.findUnique({
      where: { tokenHash },
    });
    if (!existingGrant) {
      await transaction.guestAccessGrant.create({
        data: {
          workspaceId: snapshot.workspace_id!,
          invitationRecipientId: invitationRecipient.id,
          householdId,
          channel: "EMAIL",
          tokenHash,
        },
      });
    } else if (
      existingGrant.invitationRecipientId !== invitationRecipient.id ||
      existingGrant.workspaceId !== snapshot.workspace_id
    ) {
      throw new PermanentJobError(
        "Deterministic campaign grant collision",
        "CAMPAIGN_GRANT_COLLISION",
      );
    } else if (
      existingGrant.revokedAt ||
      existingGrant.channel !== "EMAIL" ||
      existingGrant.expiresAt ||
      existingGrant.householdId !== householdId
    ) {
      await transaction.guestAccessGrant.update({
        where: { id: existingGrant.id },
        data: {
          channel: "EMAIL",
          householdId,
          revokedAt: null,
          expiresAt: null,
          version: { increment: 1 },
        },
      });
    }
    return {
      skip: false as const,
      campaignId: campaign.id,
      recipient,
      invitationRecipient,
      householdId,
      token,
      template: jsonRecord(campaign.template),
    };
  });
  if (prepared.skip) {
    await withPersistedContext(snapshot, async (transaction) => {
      await finalizeCampaignIfSettled(
        transaction,
        snapshot,
        prepared.campaignId,
      );
    });
    return {
      campaignId: prepared.campaignId,
      skipped: true,
      status: prepared.status,
    };
  }
  return withPersistedContext(
    snapshot,
    async (transaction) => {
      // Hold the same lifecycle lock used by publish/unpublish/cancel across the
      // final provider call. This deliberately keeps a short transaction open so
      // an invitation cannot be withdrawn (or a campaign cancelled) between the
      // last eligibility check and the external email side effect.
      await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`invitation-site-workspace:${snapshot.workspace_id!}`},
          0
        )
      )
    `;
      const [
        currentCampaign,
        currentCampaignRecipient,
        currentRecipient,
        site,
      ] = await Promise.all([
        transaction.campaign.findFirst({
          where: {
            id: prepared.campaignId,
            workspaceId: snapshot.workspace_id!,
          },
        }),
        transaction.campaignRecipient.findFirst({
          where: {
            id: prepared.recipient.id,
            workspaceId: snapshot.workspace_id!,
          },
        }),
        transaction.invitationRecipient.findFirst({
          where: {
            id: prepared.invitationRecipient.id,
            workspaceId: snapshot.workspace_id!,
            revokedAt: null,
          },
        }),
        transaction.invitationSite.findFirst({
          where: {
            id: prepared.invitationRecipient.invitationSiteId,
            workspaceId: snapshot.workspace_id!,
          },
        }),
      ]);
      if (
        !currentCampaign ||
        !["QUEUED", "SENDING"].includes(currentCampaign.status) ||
        !currentCampaignRecipient ||
        !["PENDING", "QUEUED"].includes(currentCampaignRecipient.status) ||
        !currentRecipient ||
        !site ||
        site.status !== "PUBLISHED" ||
        !site.publishedVersionId
      )
        throw new PermanentJobError(
          "Campaign delivery target is no longer publishable",
          "CAMPAIGN_TARGET_INACTIVE",
        );
      const publishedVersion = await transaction.invitationVersion.findFirst({
        where: {
          id: site.publishedVersionId,
          workspaceId: snapshot.workspace_id!,
        },
        select: { document: true, settings: true },
      });
      if (!publishedVersion)
        throw new PermanentJobError(
          "Published invitation content is unavailable",
          "CAMPAIGN_TARGET_INACTIVE",
        );
      if (
        currentCampaign.purpose === "RSVP_REMINDER" &&
        !["READY", "SENT", "OPENED", "PARTIALLY_RESPONDED"].includes(
          currentRecipient.status,
        )
      ) {
        await transaction.campaignRecipient.update({
          where: { id: currentCampaignRecipient.id },
          data: { status: "CANCELLED", version: { increment: 1 } },
        });
        await finalizeCampaignIfSettled(
          transaction,
          snapshot,
          currentCampaign.id,
        );
        return {
          campaignId: currentCampaign.id,
          campaignRecipientId: currentCampaignRecipient.id,
          skipped: true,
          status: "rsvp_completed",
        };
      }
      const deliveryTarget = await lockAndResolveCampaignTarget(
        transaction,
        snapshot.workspace_id!,
        currentRecipient,
      );
      if (
        !deliveryTarget ||
        deliveryTarget.address !==
          normalizeCampaignAddress(prepared.recipient.address)
      )
        throw new PermanentJobError(
          "Campaign delivery address changed after audience confirmation",
          "CAMPAIGN_ADDRESS_CHANGED",
        );
      await transaction.guestAccessGrant.updateMany({
        where: {
          invitationRecipientId: currentRecipient.id,
          channel: "EMAIL",
          revokedAt: null,
        },
        data: {
          householdId: deliveryTarget.householdId,
          version: { increment: 1 },
        },
      });
      const sent = await sendCampaignEmail(
        prepared.recipient.address,
        String(prepared.template.subject ?? "Invitația voastră Sarbato"),
        String(
          prepared.template.body ??
            "Vă așteptăm cu drag. Confirmați participarea folosind linkul personal.",
        ),
        prepared.token,
        snapshot.execution_id,
        campaignInvitationPresentation(
          publishedVersion.document,
          publishedVersion.settings,
        ),
      );
      await transaction.deliveryAttempt.upsert({
        where: {
          consumerExecutionId_attemptNumber: {
            consumerExecutionId: snapshot.execution_id,
            attemptNumber: snapshot.attempt_number,
          },
        },
        create: {
          consumerExecutionId: snapshot.execution_id,
          workspaceId: snapshot.workspace_id,
          vendorOrganizationId: snapshot.vendor_organization_id,
          sourceType: "campaign_recipient",
          sourceId: prepared.recipient.id,
          provider: environment.EMAIL_PROVIDER,
          recipientReference: recipientReference(prepared.recipient.address),
          attemptNumber: snapshot.attempt_number,
          outcome: "SUCCEEDED",
          providerMessageId: sent.messageId,
        },
        update: {
          outcome: "SUCCEEDED",
          providerMessageId: sent.messageId,
          finishedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      await transaction.campaignRecipient.update({
        where: { id: prepared.recipient.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerMessageId: sent.messageId,
          failureCode: null,
          failedAt: null,
          version: { increment: 1 },
        },
      });
      await transaction.invitationRecipient.updateMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          invitationSiteId: currentRecipient.invitationSiteId,
          revokedAt: null,
          status: { in: ["READY", "QUEUED"] },
          ...(currentRecipient.householdId
            ? { householdId: currentRecipient.householdId }
            : { guestId: currentRecipient.guestId }),
        },
        data: { status: "SENT" },
      });
      await transaction.guestContactLog.upsert({
        where: { sourceEventId: snapshot.outbox_message_id },
        create: {
          workspaceId: snapshot.workspace_id!,
          guestId: deliveryTarget.guestId,
          householdId: deliveryTarget.householdId,
          channel: "EMAIL",
          direction: "OUTBOUND",
          campaignId: prepared.campaignId,
          summaryRedacted: "Invitație trimisă prin campanie.",
          occurredAt: new Date(),
          sourceEventId: snapshot.outbox_message_id,
        },
        update: {},
      });
      await finalizeCampaignIfSettled(
        transaction,
        snapshot,
        prepared.campaignId,
      );
      return {
        campaignId: prepared.campaignId,
        campaignRecipientId: prepared.recipient.id,
        status: "sent",
        providerMessageId: sent.messageId,
      };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

function normalizeCampaignAddress(value: string): string {
  return value.trim().toLowerCase();
}

async function lockAndResolveCampaignTarget(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  recipient: { householdId: string | null; guestId: string | null },
): Promise<{ address: string; householdId: string; guestId: string } | null> {
  const directGuest = recipient.guestId
    ? ((
        await transaction.$queryRaw<
          Array<{
            household_id: string;
            status: string;
            deleted_at: Date | null;
            email_normalized: string | null;
          }>
        >`
          SELECT "household_id", "status"::text, "deleted_at", "email_normalized"
          FROM "guests"
          WHERE "id" = ${recipient.guestId}::uuid
            AND "workspace_id" = ${workspaceId}::uuid
          FOR SHARE
        `
      )[0] ?? null)
    : null;
  const householdId = recipient.householdId ?? directGuest?.household_id;
  if (!householdId) {
    return recipient.guestId &&
      directGuest?.status === "ACTIVE" &&
      !directGuest.deleted_at &&
      directGuest.email_normalized
      ? {
          address: normalizeCampaignAddress(directGuest.email_normalized),
          householdId: directGuest.household_id,
          guestId: recipient.guestId,
        }
      : null;
  }
  await transaction.$queryRaw`
    SELECT "id"
    FROM "guests"
    WHERE "household_id" = ${householdId}::uuid
      AND "workspace_id" = ${workspaceId}::uuid
    ORDER BY "created_at" ASC, "id" ASC
    FOR SHARE
  `;
  await transaction.$queryRaw`
    SELECT "id"
    FROM "households"
    WHERE "id" = ${householdId}::uuid
      AND "workspace_id" = ${workspaceId}::uuid
    FOR SHARE
  `;
  const household = await transaction.household.findFirst({
    where: {
      id: householdId,
      workspaceId,
      deletedAt: null,
    },
    select: { primaryGuestId: true },
  });
  if (!household) return null;
  const guest = await transaction.guest.findFirst({
    where: {
      workspaceId,
      householdId,
      status: "ACTIVE",
      deletedAt: null,
      emailNormalized: { not: null },
      ...(household.primaryGuestId ? { id: household.primaryGuestId } : {}),
    },
    select: { id: true, emailNormalized: true },
  });
  const fallback = guest
    ? null
    : await transaction.guest.findFirst({
        where: {
          workspaceId,
          householdId,
          status: "ACTIVE",
          deletedAt: null,
          emailNormalized: { not: null },
        },
        orderBy: [{ isChild: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, emailNormalized: true },
      });
  const target = guest ?? fallback;
  return target?.emailNormalized
    ? {
        address: normalizeCampaignAddress(target.emailNormalized),
        householdId,
        guestId: target.id,
      }
    : null;
}

async function processCampaignSummary(
  snapshot: PersistedConsumer,
  campaignId: string,
): Promise<Record<string, unknown>> {
  return withPersistedContext(snapshot, async (transaction) => {
    await finalizeCampaignIfSettled(transaction, snapshot, campaignId);
    const grouped = await transaction.campaignRecipient.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: true,
    });
    return {
      campaignId,
      byStatus: Object.fromEntries(
        grouped.map((row) => [row.status.toLowerCase(), row._count]),
      ),
    };
  });
}

async function verifyInvitationProjection(
  snapshot: PersistedConsumer,
  recipientId: string,
): Promise<Record<string, unknown>> {
  return withPersistedContext(snapshot, async (transaction) => {
    const recipient = await transaction.invitationRecipient.findFirst({
      where: { id: recipientId, workspaceId: snapshot.workspace_id! },
    });
    if (!recipient)
      throw new PermanentJobError(
        "Invitation projection source is missing",
        "INVITATION_PROJECTION_SOURCE_MISSING",
      );
    return { recipientId, status: recipient.status.toLowerCase() };
  });
}

async function verifyRsvpProjection(
  snapshot: PersistedConsumer,
  submissionId: string,
): Promise<Record<string, unknown>> {
  return withPersistedContext(snapshot, async (transaction) => {
    const submission = await transaction.rsvpSubmission.findFirst({
      where: { id: submissionId, workspaceId: snapshot.workspace_id! },
    });
    if (!submission)
      throw new PermanentJobError(
        "RSVP projection source is missing",
        "RSVP_PROJECTION_SOURCE_MISSING",
      );
    const responses = await transaction.guestEventResponse.count({
      where: { submissionId },
    });
    return { submissionId, status: submission.status.toLowerCase(), responses };
  });
}

async function finalizeCampaignIfSettled(
  transaction: Prisma.TransactionClient,
  snapshot: PersistedConsumer,
  campaignId: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${campaignId}, 0))::text AS locked
  `;
  const pending = await transaction.campaignRecipient.count({
    where: { campaignId, status: { in: ["PENDING", "QUEUED"] } },
  });
  if (pending) return;
  const failed = await transaction.campaignRecipient.count({
    where: { campaignId, status: "FAILED" },
  });
  const updated = await transaction.campaign.updateMany({
    where: { id: campaignId, status: { in: ["QUEUED", "SENDING"] } },
    data: {
      status: failed ? "PARTIAL" : "COMPLETED",
      completedAt: new Date(),
      version: { increment: 1 },
    },
  });
  if (!updated.count) return;
  const campaign = await transaction.campaign.findUniqueOrThrow({
    where: { id: campaignId },
  });
  if (!snapshot.workspace_id || !snapshot.actor_user_id) return;
  const payload = {
    occurredAt: new Date().toISOString(),
    subject: { campaignId, failedRecipients: failed },
    activity: {
      category: "campaigns",
      action: failed ? "campaign_partial" : "campaign_completed",
      summary: failed
        ? `Campania s-a încheiat cu ${failed} livrări eșuate.`
        : "Campania a fost trimisă tuturor destinatarilor.",
      entityType: "Campaign",
      entityId: campaignId,
    },
  };
  await transaction.$queryRaw`
    SELECT public.weddingos_record_worker_derived_event(
      ${failed ? "campaign.failed.v1" : "campaign.completed.v1"}, ${"Campaign"},
      ${campaignId}, CAST(${campaign.version} AS integer), ${snapshot.workspace_id}::uuid,
      ${snapshot.actor_user_id}::uuid, ${snapshot.correlation_id},
      ${`campaign-settled:${campaignId}:v${campaign.version}`},
      ${JSON.stringify(payload)}::jsonb
    )
  `;
}

async function processTaskReminder(
  snapshot: PersistedConsumer,
  reminderId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id || !snapshot.actor_user_id)
    throw new PermanentJobError(
      "Task reminder requires persisted workspace and actor",
      "TASK_REMINDER_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const reminder = await transaction.taskReminder.findFirst({
      where: {
        id: reminderId,
        workspaceId: snapshot.workspace_id!,
        recipientUserId: snapshot.actor_user_id!,
      },
    });
    if (!reminder)
      throw new PermanentJobError(
        "Task reminder does not match persisted execution context",
        "TASK_REMINDER_INVALID",
      );
    if (["SENT", "STALE", "CANCELLED"].includes(reminder.status))
      return { reminderId, outcome: reminder.status.toLowerCase() };
    const task = await transaction.task.findFirst({
      where: {
        id: reminder.taskId,
        workspaceId: snapshot.workspace_id!,
        deletedAt: null,
      },
    });
    const access = await transaction.workspaceMembership.count({
      where: {
        workspaceId: snapshot.workspace_id!,
        userId: snapshot.actor_user_id!,
        status: "ACTIVE",
      },
    });
    if (
      !task ||
      task.status === "COMPLETED" ||
      task.version !== reminder.taskVersion ||
      !access
    ) {
      await transaction.taskReminder.update({
        where: { id: reminder.id },
        data: { status: "STALE" },
      });
      return { reminderId, outcome: "stale" };
    }
    const [recipient] = await transaction.$queryRaw<
      Array<{
        email: string;
        first_name: string;
        tasks_email: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
      }>
    >`
      SELECT * FROM public.weddingos_get_reminder_recipient(
        ${snapshot.workspace_id}::uuid,
        ${reminder.recipientUserId}::uuid
      )
    `;
    let emailOutcome = "not_requested";
    if (reminder.channel === "EMAIL") {
      if (!recipient || recipient.tasks_email === false) {
        emailOutcome = "suppressed_by_preference";
      } else if (
        recipient.quiet_hours_start &&
        recipient.quiet_hours_end &&
        isQuietTime(
          recipient.quiet_hours_start,
          recipient.quiet_hours_end,
          recipient.timezone,
          new Date(),
        )
      ) {
        emailOutcome = "suppressed_by_quiet_hours";
      } else {
        await sendTaskReminderEmail(
          recipient.email,
          recipient.first_name,
          task.title,
          task.id,
          snapshot.execution_id,
        );
        emailOutcome = "sent";
      }
    }
    await transaction.taskReminder.update({
      where: { id: reminder.id },
      data: { status: "SENT" },
    });
    const payload = {
      occurredAt: new Date().toISOString(),
      subject: { reminderId, taskId: task.id, taskVersion: task.version },
      notification: {
        recipientUserId: snapshot.actor_user_id!,
        module: "planning",
        kind: "task_reminder",
        priority: task.priority === "URGENT" ? "urgent" : "normal",
        title: "Reminder task",
        body: task.title,
        actionUrl: `/plan?task=${task.id}`,
      },
      activity: {
        category: "planning",
        action: "task_reminder_due",
        summary: `Reminder activ pentru taskul ${task.title}.`,
        entityType: "Task",
        entityId: task.id,
      },
    };
    await transaction.$queryRaw`
      SELECT public.weddingos_record_worker_derived_event(
        ${"task.reminder_due.v1"}, ${"TaskReminder"}, ${reminder.id},
        CAST(${reminder.taskVersion} AS integer), ${snapshot.workspace_id}::uuid,
        ${snapshot.actor_user_id}::uuid, ${snapshot.correlation_id},
        ${`task-reminder-due:${reminder.id}`}, ${JSON.stringify(payload)}::jsonb
      )
    `;
    return {
      reminderId,
      outcome: "sent",
      taskId: task.id,
      emailOutcome,
    };
  });
}

async function processSeatingSuggestion(
  snapshot: PersistedConsumer,
  runId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id || !snapshot.background_job_id)
    throw new PermanentJobError(
      "Seating suggestion requires persisted workspace and job context",
      "SEATING_SUGGESTION_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const run = await transaction.seatingSuggestionRun.findFirst({
      where: {
        id: runId,
        workspaceId: snapshot.workspace_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!run)
      throw new PermanentJobError(
        "Seating suggestion run does not match persisted context",
        "SEATING_SUGGESTION_RUN_INVALID",
      );
    const existing = await transaction.seatingSuggestion.findUnique({
      where: { runId },
    });
    if (existing?.status === "READY_FOR_REVIEW")
      return {
        runId,
        suggestionId: existing.id,
        outcome: "already_ready",
      };
    await transaction.seatingSuggestionRun.update({
      where: { id: runId },
      data: { status: "RUNNING", version: { increment: 1 } },
    });
    const plan = await transaction.seatingPlan.findFirst({
      where: {
        id: run.seatingPlanId,
        workspaceId: snapshot.workspace_id!,
        deletedAt: null,
      },
    });
    if (!plan)
      throw new PermanentJobError(
        "Seating plan no longer exists",
        "SEATING_PLAN_MISSING",
      );
    const [responses, guests, tables, currentAssignments, constraints] =
      await Promise.all([
        transaction.guestEventResponse.findMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            weddingEventId: plan.weddingEventId,
            attendance: "CONFIRMED",
          },
          select: { guestId: true },
        }),
        transaction.guest.findMany({
          where: { workspaceId: snapshot.workspace_id!, status: "ACTIVE" },
        }),
        transaction.seatingTable.findMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            seatingPlanId: plan.id,
            deletedAt: null,
          },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        }),
        transaction.guestSeatingAssignment.findMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            seatingPlanId: plan.id,
            status: { in: ["ACTIVE", "CONFLICT"] },
          },
        }),
        transaction.seatingConstraint.findMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            seatingPlanId: plan.id,
            deletedAt: null,
          },
        }),
      ]);
    const tableIds = tables.map((table) => table.id);
    const actualSeats = tableIds.length
      ? await transaction.seatingSeat.findMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            tableId: { in: tableIds },
          },
        })
      : [];
    const eligible = new Set(responses.map((response) => response.guestId));
    const guestById = new Map(guests.map((guest) => [guest.id, guest]));
    const output = buildDeterministicSeatingSuggestion({
      guests: guests
        .filter((guest) => eligible.has(guest.id))
        .map((guest) => ({
          id: guest.id,
          householdId: guest.householdId,
          primaryGuestId: guest.primaryGuestId,
          isChild: guest.isChild,
          isPlusOne: guest.isPlusOne,
          accessibleRequired: constraints.some(
            (constraint) =>
              constraint.type === "ACCESSIBLE_SEAT_REQUIRED" &&
              constraint.guestId === guest.id,
          ),
        })),
      tables: tables.map((table) => ({
        id: table.id,
        capacity: table.capacity,
        locked: table.locked,
        accessibleSeats: actualSeats.filter(
          (seat) => seat.tableId === table.id && seat.accessible,
        ).length,
      })),
      existingAssignments: currentAssignments
        .filter((assignment) => eligible.has(assignment.guestId))
        .map((assignment) => ({
          guestId: assignment.guestId,
          tableId: assignment.seatingTableId,
          seatId: assignment.seatingSeatId,
          locked: assignment.locked,
        })),
      constraints: constraints.map((constraint) => ({
        type: constraint.type as
          | "KEEP_TOGETHER"
          | "KEEP_APART"
          | "PREFER_TOGETHER"
          | "PREFER_APART"
          | "MUST_BE_AT_TABLE"
          | "MUST_NOT_BE_AT_TABLE"
          | "ACCESSIBLE_SEAT_REQUIRED",
        guestId: constraint.guestId,
        householdId: constraint.householdId,
        relatedGuestId: constraint.relatedGuestId,
        tableId: constraint.tableId,
        required: constraint.required,
      })),
    });
    const suggestionId = existing?.id ?? randomUUID();
    const suggestion = await transaction.seatingSuggestion.upsert({
      where: { runId },
      create: {
        id: suggestionId,
        workspaceId: snapshot.workspace_id!,
        seatingPlanId: plan.id,
        runId,
        status: "READY_FOR_REVIEW",
        unassignedGuestIds: output.unassignedGuestIds,
        hardConflicts: output.hardConflicts,
        warnings: output.warnings,
        violatedOptionalPreferences: output.violatedOptionalPreferences,
        tableUtilization: output.tableUtilization,
        score: output.score,
        rulesVersion: SEATING_RULES_VERSION,
      },
      update: {
        status: "READY_FOR_REVIEW",
        unassignedGuestIds: output.unassignedGuestIds,
        hardConflicts: output.hardConflicts,
        warnings: output.warnings,
        violatedOptionalPreferences: output.violatedOptionalPreferences,
        tableUtilization: output.tableUtilization,
        score: output.score,
        rulesVersion: SEATING_RULES_VERSION,
        version: { increment: 1 },
      },
    });
    await transaction.seatingSuggestionAssignment.deleteMany({
      where: { suggestionId: suggestion.id },
    });
    if (output.assignments.length)
      await transaction.seatingSuggestionAssignment.createMany({
        data: output.assignments.map((assignment, position) => ({
          workspaceId: snapshot.workspace_id!,
          suggestionId: suggestion.id,
          guestId: assignment.guestId,
          tableId: assignment.tableId,
          groupKey: assignment.groupKey,
          rationale: assignment.rationale,
          position,
        })),
      });
    await transaction.seatingSuggestionRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        suggestionId: suggestion.id,
        completedAt: new Date(),
        rulesVersion: SEATING_RULES_VERSION,
        errorCode: null,
        errorMessage: null,
        version: { increment: 1 },
      },
    });
    await transaction.$executeRaw`
      SELECT public.weddingos_record_worker_derived_event(
        ${"seating.suggestion_ready.v1"}, ${"SeatingSuggestion"}, ${suggestion.id},
        CAST(${suggestion.version} AS integer), ${snapshot.workspace_id}::uuid,
        ${snapshot.actor_user_id}::uuid, ${snapshot.correlation_id},
        ${`seating-suggestion-ready:${suggestion.id}`},
        ${JSON.stringify({
          occurredAt: new Date().toISOString(),
          subject: { planId: plan.id, suggestionId: suggestion.id },
          activity: {
            category: "seating",
            action: "suggestion_ready",
            summary:
              "Propunerea deterministă de seating este gata pentru verificare.",
            entityType: "SeatingSuggestion",
            entityId: suggestion.id,
          },
        })}::jsonb
      )
    `;
    return {
      runId,
      suggestionId: suggestion.id,
      outcome: "ready_for_review",
      score: output.score,
      assignedGuests: output.assignments.length,
      unassignedGuests: output.unassignedGuestIds.length,
      knownGuests: guestById.size,
    };
  });
}

async function verifyOperationalAggregate(
  snapshot: PersistedConsumer,
  kind: "seating" | "transport" | "accommodation",
  aggregateId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Operational projection requires workspace context",
      "OPERATIONS_PROJECTION_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const exists =
      kind === "seating"
        ? await transaction.seatingPlan.count({
            where: { id: aggregateId, workspaceId: snapshot.workspace_id! },
          })
        : kind === "transport"
          ? await transaction.transportPlan.count({
              where: { id: aggregateId, workspaceId: snapshot.workspace_id! },
            })
          : await transaction.accommodationStay.count({
              where: { id: aggregateId, workspaceId: snapshot.workspace_id! },
            });
    if (!exists)
      throw new PermanentJobError(
        "Operational aggregate does not match persisted workspace",
        "OPERATIONS_AGGREGATE_INVALID",
      );
    return { kind, aggregateId, outcome: "verified" };
  });
}

async function projectGuestOperations(
  snapshot: PersistedConsumer,
  submissionId: string,
): Promise<Record<string, unknown>> {
  if (!snapshot.workspace_id)
    throw new PermanentJobError(
      "Guest operations projection requires workspace context",
      "GUEST_OPERATIONS_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const submission = await transaction.rsvpSubmission.findFirst({
      where: { id: submissionId, workspaceId: snapshot.workspace_id! },
    });
    if (!submission)
      throw new PermanentJobError(
        "RSVP submission does not match persisted workspace",
        "GUEST_OPERATIONS_SUBMISSION_INVALID",
      );
    const responses = await transaction.guestEventResponse.findMany({
      where: { submissionId, workspaceId: snapshot.workspace_id! },
    });
    const guests = await transaction.guest.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        id: { in: responses.map((response) => response.guestId) },
      },
    });
    const guestById = new Map(guests.map((guest) => [guest.id, guest]));
    let transportRequests = 0;
    let accommodationRequests = 0;
    let staleAssignments = 0;
    for (const response of responses) {
      const guest = guestById.get(response.guestId);
      if (!guest) continue;
      const attending = response.attendance === "CONFIRMED";
      const transportRequested = attending && guest.needsTransport;
      await transaction.transportRequest.upsert({
        where: {
          guestId_weddingEventId: {
            guestId: guest.id,
            weddingEventId: response.weddingEventId,
          },
        },
        create: {
          workspaceId: snapshot.workspace_id!,
          guestId: guest.id,
          householdId: guest.householdId,
          weddingEventId: response.weddingEventId,
          requested: transportRequested,
          status: transportRequested ? "REQUESTED" : "DECLINED",
          sourceSubmissionId: submission.id,
        },
        update: {
          requested: transportRequested,
          status: transportRequested ? "REQUESTED" : "DECLINED",
          sourceSubmissionId: submission.id,
          version: { increment: 1 },
        },
      });
      if (transportRequested) transportRequests += 1;
      const accommodationRequested = attending && guest.needsAccommodation;
      await transaction.accommodationRequest.upsert({
        where: { guestId: guest.id },
        create: {
          workspaceId: snapshot.workspace_id!,
          guestId: guest.id,
          householdId: guest.householdId,
          requested: accommodationRequested,
          status: accommodationRequested ? "REQUESTED" : "DECLINED",
          sourceSubmissionId: submission.id,
        },
        update: {
          requested: accommodationRequested,
          status: accommodationRequested ? "REQUESTED" : "DECLINED",
          sourceSubmissionId: submission.id,
          version: { increment: 1 },
        },
      });
      if (accommodationRequested) accommodationRequests += 1;
      if (!attending) {
        const updated = await transaction.guestSeatingAssignment.updateMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            guestId: guest.id,
            weddingEventId: response.weddingEventId,
            status: "ACTIVE",
          },
          data: { status: "CONFLICT", version: { increment: 1 } },
        });
        staleAssignments += updated.count;
      }
    }
    return {
      submissionId,
      outcome: "projected",
      transportRequests,
      accommodationRequests,
      staleAssignments,
    };
  });
}

async function prepareSeatingExport(
  snapshot: PersistedConsumer,
  request: {
    artifactId: string;
    planId: string;
    requestedByUserId: string;
    format: "csv" | "svg";
    kind:
      | "table_list"
      | "guest_by_table"
      | "table_cards"
      | "visual_plan"
      | "catering_summary";
    includeSensitive: boolean;
  },
): Promise<PreparedArtifact> {
  assertOperationalExportContext(snapshot, request.requestedByUserId);
  return withPersistedContext(snapshot, async (transaction) => {
    const plan = await transaction.seatingPlan.findFirst({
      where: {
        id: request.planId,
        workspaceId: snapshot.workspace_id!,
        deletedAt: null,
      },
    });
    if (!plan)
      throw new PermanentJobError(
        "Seating plan does not match persisted context",
        "SEATING_EXPORT_PLAN_INVALID",
      );
    const [tables, assignments] = await Promise.all([
      transaction.seatingTable.findMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          seatingPlanId: plan.id,
          deletedAt: null,
        },
        orderBy: [{ position: "asc" }, { label: "asc" }],
      }),
      transaction.guestSeatingAssignment.findMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          seatingPlanId: plan.id,
          status: "ACTIVE",
        },
      }),
    ]);
    if (request.format === "svg") {
      const guestCounts = new Map<string, number>();
      for (const assignment of assignments)
        guestCounts.set(
          assignment.seatingTableId,
          (guestCounts.get(assignment.seatingTableId) ?? 0) + 1,
        );
      const width = 1200;
      const height = 800;
      const safe = (value: string) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
      const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect width="100%" height="100%" fill="#f8fafc"/>`,
        `<text x="36" y="48" font-family="sans-serif" font-size="28" fill="#172554">${safe(plan.name)}</text>`,
        ...tables.map((table) => {
          const x = Math.max(60, Math.min(width - 160, Number(table.x)));
          const y = Math.max(80, Math.min(height - 120, Number(table.y)));
          return `<g transform="translate(${x} ${y})"><rect width="120" height="72" rx="24" fill="#ffffff" stroke="#6366f1" stroke-width="2"/><text x="60" y="31" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#172554">${safe(table.label)}</text><text x="60" y="53" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#475569">${guestCounts.get(table.id) ?? 0}/${table.capacity}</text></g>`;
        }),
        "</svg>",
      ].join("");
      return createSvgArtifact(
        transaction,
        snapshot,
        request.requestedByUserId,
        request.artifactId,
        "seating_visual_plan",
        "weddingos-seating-plan",
        svg,
        assignments.length,
      );
    }
    const guests = await transaction.guest.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        id: { in: assignments.map((assignment) => assignment.guestId) },
      },
    });
    const guestNames = new Map(
      guests.map((guest) => [
        guest.id,
        `${guest.firstName} ${guest.lastName}`.trim(),
      ]),
    );
    const tableNames = new Map(tables.map((table) => [table.id, table.label]));
    const rows =
      request.kind === "table_list"
        ? tables.map((table) => ({
            table: table.label,
            capacity: table.capacity,
            assigned: assignments.filter(
              (assignment) => assignment.seatingTableId === table.id,
            ).length,
            zone: table.zone ?? "",
          }))
        : assignments.map((assignment) => ({
            table: tableNames.get(assignment.seatingTableId) ?? "",
            guest: guestNames.get(assignment.guestId) ?? "",
            seat: assignment.seatingSeatId ?? "",
            status: assignment.status.toLowerCase(),
          }));
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      `seating_${request.kind}`,
      "weddingos-seating",
      "csv",
      rows,
      request.artifactId,
    );
  });
}

async function prepareTransportManifest(
  snapshot: PersistedConsumer,
  request: {
    artifactId: string;
    planId: string;
    requestedByUserId: string;
    format: "csv" | "xlsx";
    includeSensitive: boolean;
  },
): Promise<PreparedArtifact> {
  assertOperationalExportContext(snapshot, request.requestedByUserId);
  return withPersistedContext(snapshot, async (transaction) => {
    const plan = await transaction.transportPlan.findFirst({
      where: { id: request.planId, workspaceId: snapshot.workspace_id! },
    });
    if (!plan)
      throw new PermanentJobError(
        "Transport plan does not match persisted context",
        "TRANSPORT_MANIFEST_PLAN_INVALID",
      );
    const routes = await transaction.transportRoute.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        transportPlanId: plan.id,
        deletedAt: null,
      },
      orderBy: [{ departureAt: "asc" }, { name: "asc" }],
    });
    const assignments = await transaction.guestTransportAssignment.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        routeId: { in: routes.map((route) => route.id) },
        status: "ASSIGNED",
      },
    });
    const guests = await transaction.guest.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        id: { in: assignments.map((assignment) => assignment.guestId) },
      },
    });
    const routeById = new Map(routes.map((route) => [route.id, route]));
    const guestById = new Map(guests.map((guest) => [guest.id, guest]));
    const rows = assignments.map((assignment) => {
      const route = routeById.get(assignment.routeId);
      const guest = guestById.get(assignment.guestId);
      return {
        route: route?.name ?? "",
        direction: route?.direction.toLowerCase() ?? "",
        departure_at: route?.departureAt.toISOString() ?? "",
        guest: guest ? `${guest.firstName} ${guest.lastName}`.trim() : "",
        seats: assignment.seatCount,
        contact: request.includeSensitive ? (guest?.phoneE164 ?? "") : "",
      };
    });
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      "transport_manifest",
      "weddingos-transport-manifest",
      request.format,
      rows,
      request.artifactId,
    );
  });
}

async function prepareAccommodationRoomingList(
  snapshot: PersistedConsumer,
  request: {
    artifactId: string;
    stayId: string;
    requestedByUserId: string;
    format: "csv" | "xlsx";
    includeSensitive: boolean;
  },
): Promise<PreparedArtifact> {
  assertOperationalExportContext(snapshot, request.requestedByUserId);
  return withPersistedContext(snapshot, async (transaction) => {
    const stay = await transaction.accommodationStay.findFirst({
      where: { id: request.stayId, workspaceId: snapshot.workspace_id! },
    });
    if (!stay)
      throw new PermanentJobError(
        "Accommodation stay does not match persisted context",
        "ROOMING_LIST_STAY_INVALID",
      );
    const allocations = await transaction.accommodationAllocation.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        stayId: stay.id,
        status: "ASSIGNED",
      },
    });
    const [rooms, guests] = await Promise.all([
      transaction.accommodationRoom.findMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          id: { in: allocations.map((allocation) => allocation.roomId) },
        },
      }),
      transaction.guest.findMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          id: { in: allocations.map((allocation) => allocation.guestId) },
        },
      }),
    ]);
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const guestById = new Map(guests.map((guest) => [guest.id, guest]));
    const rows = allocations.map((allocation) => {
      const guest = guestById.get(allocation.guestId);
      return {
        room: roomById.get(allocation.roomId)?.name ?? "",
        guest: guest ? `${guest.firstName} ${guest.lastName}`.trim() : "",
        check_in: allocation.checkInDate.toISOString().slice(0, 10),
        check_out: allocation.checkOutDate.toISOString().slice(0, 10),
        contact: request.includeSensitive ? (guest?.phoneE164 ?? "") : "",
      };
    });
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      "accommodation_rooming_list",
      "weddingos-rooming-list",
      request.format,
      rows,
      request.artifactId,
    );
  });
}

function assertOperationalExportContext(
  snapshot: PersistedConsumer,
  requestedByUserId: string,
): void {
  if (
    !snapshot.workspace_id ||
    !snapshot.background_job_id ||
    requestedByUserId !== snapshot.actor_user_id
  )
    throw new PermanentJobError(
      "Operational export context is invalid",
      "OPERATIONS_EXPORT_CONTEXT_INVALID",
    );
}

async function createSvgArtifact(
  transaction: Prisma.TransactionClient,
  snapshot: PersistedConsumer,
  ownerUserId: string,
  artifactId: string,
  kind: string,
  prefix: string,
  content: string,
  rowCount: number,
): Promise<PreparedArtifact> {
  const sizeBytes = Buffer.byteLength(content, "utf8");
  if (sizeBytes > environment.ARTIFACT_MAX_BYTES)
    throw new PermanentJobError(
      `Export exceeds ${environment.ARTIFACT_MAX_BYTES} bytes`,
      "EXPORT_SIZE_LIMIT",
    );
  const expiresAt = new Date(
    Date.now() + environment.ARTIFACT_RETENTION_HOURS * 60 * 60 * 1000,
  );
  const artifact = await transaction.generatedArtifact.upsert({
    where: { consumerExecutionId: snapshot.execution_id },
    create: {
      id: artifactId,
      backgroundJobId: snapshot.background_job_id!,
      consumerExecutionId: snapshot.execution_id,
      workspaceId: snapshot.workspace_id!,
      vendorOrganizationId: snapshot.vendor_organization_id,
      ownerUserId,
      kind,
      storageKey: `${artifactId}.svg`,
      fileName: `${prefix}-${snapshot.background_job_id}.svg`,
      mediaType: "image/svg+xml; charset=utf-8",
      expiresAt,
    },
    update: {
      status: "GENERATING",
      expiresAt,
      deletedAt: null,
      version: { increment: 1 },
    },
  });
  return {
    id: artifact.id,
    storageKey: artifact.storageKey,
    fileName: artifact.fileName,
    content,
    mediaType: artifact.mediaType,
    rowCount,
    sizeBytes,
    sha256: createHash("sha256").update(content, "utf8").digest("hex"),
    expiresAt,
  };
}

async function prepareGuestExport(
  snapshot: PersistedConsumer,
  request: {
    requestedByUserId: string;
    format: "csv" | "xlsx";
    options: Record<string, unknown>;
  },
): Promise<PreparedArtifact> {
  if (
    !snapshot.workspace_id ||
    !snapshot.background_job_id ||
    request.requestedByUserId !== snapshot.actor_user_id
  )
    throw new PermanentJobError(
      "Guest export context is invalid",
      "GUEST_EXPORT_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const selectedGuestIds = Array.isArray(request.options.selectedGuestIds)
      ? request.options.selectedGuestIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const guests = await transaction.guest.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        ...(selectedGuestIds.length ? { id: { in: selectedGuestIds } } : {}),
        ...(request.options.includeArchived === true
          ? {}
          : { status: "ACTIVE" }),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      take: environment.ARTIFACT_MAX_ROWS + 1,
    });
    if (guests.length > environment.ARTIFACT_MAX_ROWS)
      throw new PermanentJobError(
        `Guest export exceeds ${environment.ARTIFACT_MAX_ROWS} rows`,
        "GUEST_EXPORT_ROW_LIMIT",
      );
    const householdIds = [...new Set(guests.map((guest) => guest.householdId))];
    const [households, responses, selections, allergies] = await Promise.all([
      transaction.household.findMany({ where: { id: { in: householdIds } } }),
      request.options.includeRsvp === false
        ? Promise.resolve([])
        : transaction.guestEventResponse.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              guestId: { in: guests.map((guest) => guest.id) },
            },
          }),
      request.options.includeMenu === false
        ? Promise.resolve([])
        : transaction.guestMenuSelection.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              guestId: { in: guests.map((guest) => guest.id) },
              active: true,
            },
          }),
      request.options.includeAllergies === true
        ? transaction.guestAllergy.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              guestId: { in: guests.map((guest) => guest.id) },
              active: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const householdNames = new Map(
      households.map((household) => [household.id, household.name]),
    );
    const rows = guests.map((guest) => ({
      first_name: guest.firstName,
      last_name: guest.lastName,
      household: householdNames.get(guest.householdId) ?? "",
      email:
        request.options.includeContactData === true
          ? (guest.emailNormalized ?? "")
          : "",
      phone:
        request.options.includeContactData === true
          ? (guest.phoneE164 ?? "")
          : "",
      side: guest.side.toLowerCase(),
      category: guest.category ?? "",
      child: guest.isChild ? "yes" : "no",
      plus_one: guest.isPlusOne ? "yes" : "no",
      invitation_status: "",
      rsvp: responses
        .filter((response) => response.guestId === guest.id)
        .map((response) => response.attendance.toLowerCase())
        .join("|"),
      menu_selections: selections
        .filter((selection) => selection.guestId === guest.id)
        .map((selection) => selection.menuId)
        .join("|"),
      allergies: allergies
        .filter((allergy) => allergy.guestId === guest.id)
        .map((allergy) => `${allergy.label}:${allergy.severity.toLowerCase()}`)
        .join("|"),
      transport: guest.needsTransport ? "yes" : "no",
      accommodation: guest.needsAccommodation ? "yes" : "no",
    }));
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      "guest_export",
      "weddingos-guests",
      request.format,
      rows,
    );
  });
}

async function prepareMenuExport(
  snapshot: PersistedConsumer,
  request: {
    requestedByUserId: string;
    format: "csv" | "xlsx";
    includeAllergies: boolean;
  },
): Promise<PreparedArtifact> {
  if (
    !snapshot.workspace_id ||
    !snapshot.background_job_id ||
    request.requestedByUserId !== snapshot.actor_user_id
  )
    throw new PermanentJobError(
      "Menu export context is invalid",
      "MENU_EXPORT_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const selections = await transaction.guestMenuSelection.findMany({
      where: { workspaceId: snapshot.workspace_id!, active: true },
      take: environment.ARTIFACT_MAX_ROWS + 1,
    });
    if (selections.length > environment.ARTIFACT_MAX_ROWS)
      throw new PermanentJobError(
        `Menu export exceeds ${environment.ARTIFACT_MAX_ROWS} rows`,
        "MENU_EXPORT_ROW_LIMIT",
      );
    const guestIds = [
      ...new Set(selections.map((selection) => selection.guestId)),
    ];
    const menuIds = [
      ...new Set(selections.map((selection) => selection.menuId)),
    ];
    const [guests, menus, allergies] = await Promise.all([
      transaction.guest.findMany({ where: { id: { in: guestIds } } }),
      transaction.menu.findMany({ where: { id: { in: menuIds } } }),
      request.includeAllergies
        ? transaction.guestAllergy.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              guestId: { in: guestIds },
              active: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const guestNames = new Map(
      guests.map((guest) => [
        guest.id,
        `${guest.firstName} ${guest.lastName}`.trim(),
      ]),
    );
    const menuNames = new Map(menus.map((menu) => [menu.id, menu.name]));
    const rows = selections.map((selection) => ({
      guest: guestNames.get(selection.guestId) ?? "",
      menu: menuNames.get(selection.menuId) ?? "",
      selected_at: selection.selectedAt.toISOString(),
      source: selection.source.toLowerCase(),
      allergies: allergies
        .filter((allergy) => allergy.guestId === selection.guestId)
        .map((allergy) => `${allergy.label}:${allergy.severity.toLowerCase()}`)
        .join("|"),
    }));
    return createManagedArtifact(
      transaction,
      snapshot,
      request.requestedByUserId,
      "menu_export",
      "weddingos-catering",
      request.format,
      rows,
    );
  });
}

async function createManagedArtifact(
  transaction: Prisma.TransactionClient,
  snapshot: PersistedConsumer,
  ownerUserId: string,
  kind: string,
  prefix: string,
  format: "csv" | "xlsx",
  rows: Array<Record<string, string | number | boolean>>,
  requestedArtifactId?: string,
): Promise<PreparedArtifact> {
  const headers = rows.length ? Object.keys(rows[0]!) : [];
  const content =
    format === "csv"
      ? [
          headers.map(csvCell).join(","),
          ...rows.map((row) =>
            headers
              .map((header) => csvCell(String(row[header] ?? "")))
              .join(","),
          ),
        ].join("\n")
      : await writeXlsxRows(rows);
  const sizeBytes = Buffer.isBuffer(content)
    ? content.byteLength
    : Buffer.byteLength(content, "utf8");
  if (sizeBytes > environment.ARTIFACT_MAX_BYTES)
    throw new PermanentJobError(
      `Export exceeds ${environment.ARTIFACT_MAX_BYTES} bytes`,
      "EXPORT_SIZE_LIMIT",
    );
  const existing = await transaction.generatedArtifact.findUnique({
    where: { consumerExecutionId: snapshot.execution_id },
  });
  const artifactId = existing?.id ?? requestedArtifactId ?? randomUUID();
  const expiresAt = new Date(
    Date.now() + environment.ARTIFACT_RETENTION_HOURS * 60 * 60 * 1000,
  );
  const extension = format;
  const mediaType =
    format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const artifact = await transaction.generatedArtifact.upsert({
    where: { consumerExecutionId: snapshot.execution_id },
    create: {
      id: artifactId,
      backgroundJobId: snapshot.background_job_id!,
      consumerExecutionId: snapshot.execution_id,
      workspaceId: snapshot.workspace_id!,
      vendorOrganizationId: snapshot.vendor_organization_id,
      ownerUserId,
      kind,
      storageKey: `${artifactId}.${extension}`,
      fileName: `${prefix}-${snapshot.background_job_id}.${extension}`,
      mediaType,
      expiresAt,
    },
    update: {
      status: "GENERATING",
      expiresAt,
      deletedAt: null,
      version: { increment: 1 },
    },
  });
  return {
    id: artifact.id,
    storageKey: artifact.storageKey,
    fileName: artifact.fileName,
    content,
    mediaType,
    rowCount: rows.length,
    sizeBytes,
    sha256: createHash("sha256").update(content).digest("hex"),
    expiresAt,
  };
}

async function readXlsxRows(
  buffer: Buffer,
  maxRows: number,
): Promise<Array<Record<string, unknown>>> {
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b)
    return readCsvRows(buffer, maxRows);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.worksheets[0];
  if (!sheet)
    throw new PermanentJobError(
      "Import workbook has no sheets",
      "GUEST_IMPORT_EMPTY",
    );
  const headers = Array.from({ length: sheet.columnCount }, (_, index) =>
    sheet
      .getRow(1)
      .getCell(index + 1)
      .text.trim(),
  );
  const rows: Array<Record<string, unknown>> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || rows.length > maxRows) return;
    const value: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) value[header] = row.getCell(index + 1).text;
    });
    rows.push(value);
  });
  return rows;
}

function readCsvRows(
  buffer: Buffer,
  maxRows: number,
): Array<Record<string, unknown>> {
  const records = parseCsvRecords(
    buffer.toString("utf8").replace(/^\uFEFF/, ""),
  );
  const headers = (records.shift() ?? []).map((header) => header.trim());
  return records
    .slice(0, maxRows + 1)
    .map((record) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, record[index] ?? ""] as const)
          .filter(([header]) => header.length > 0),
      ),
    );
}

function parseCsvRecords(input: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else field += character;
  }
  if (field.length || record.length) {
    record.push(field.replace(/\r$/, ""));
    if (record.some((value) => value.length > 0)) records.push(record);
  }
  if (quoted)
    throw new PermanentJobError(
      "CSV contains an unclosed quote",
      "GUEST_IMPORT_INVALID_CSV",
    );
  return records;
}

async function writeXlsxRows(
  rows: Array<Record<string, string | number | boolean>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sarbato");
  const headers = rows.length ? Object.keys(rows[0]!) : [];
  sheet.columns = headers.map((header) => ({ header, key: header }));
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function prepareActivityExport(
  snapshot: PersistedConsumer,
  requestedByUserId: string,
  filters: Record<string, unknown>,
): Promise<PreparedArtifact> {
  if (!snapshot.workspace_id || !snapshot.background_job_id)
    throw new PermanentJobError(
      "Activity export requires workspace and visible job",
      "EXPORT_CONTEXT_INVALID",
    );
  if (requestedByUserId !== snapshot.actor_user_id)
    throw new PermanentJobError(
      "Activity export owner does not match persisted actor",
      "EXPORT_OWNER_INVALID",
    );
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const rows = await transaction.activityItem.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        ...(typeof filters.category === "string"
          ? { category: filters.category }
          : {}),
      },
      orderBy: { occurredAt: "desc" },
      take: environment.ARTIFACT_MAX_ROWS + 1,
    });
    if (rows.length > environment.ARTIFACT_MAX_ROWS)
      throw new PermanentJobError(
        `Activity export exceeds ${environment.ARTIFACT_MAX_ROWS} rows`,
        "EXPORT_ROW_LIMIT",
      );
    const csv = [
      "occurred_at,category,action,actor,summary",
      ...rows.map((row) =>
        [
          row.occurredAt.toISOString(),
          row.category,
          row.action,
          row.actorName ?? "",
          row.summary,
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
    const sizeBytes = Buffer.byteLength(csv, "utf8");
    if (sizeBytes > environment.ARTIFACT_MAX_BYTES)
      throw new PermanentJobError(
        `Activity export exceeds ${environment.ARTIFACT_MAX_BYTES} bytes`,
        "EXPORT_SIZE_LIMIT",
      );
    const existing = await transaction.generatedArtifact.findUnique({
      where: { consumerExecutionId: snapshot.execution_id },
    });
    const artifactId = existing?.id ?? randomUUID();
    const expiresAt = new Date(
      Date.now() + environment.ARTIFACT_RETENTION_HOURS * 60 * 60 * 1000,
    );
    const artifact = await transaction.generatedArtifact.upsert({
      where: { consumerExecutionId: snapshot.execution_id },
      create: {
        id: artifactId,
        backgroundJobId: snapshot.background_job_id!,
        consumerExecutionId: snapshot.execution_id,
        workspaceId: snapshot.workspace_id!,
        ownerUserId: requestedByUserId,
        kind: "activity_csv",
        storageKey: `${artifactId}.csv`,
        fileName: `weddingos-activity-${snapshot.background_job_id}.csv`,
        mediaType: "text/csv; charset=utf-8",
        expiresAt,
      },
      update: {
        status: "GENERATING",
        expiresAt,
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    return {
      id: artifact.id,
      storageKey: artifact.storageKey,
      fileName: artifact.fileName,
      content: csv,
      mediaType: "text/csv; charset=utf-8",
      rowCount: rows.length,
      sizeBytes,
      sha256: createHash("sha256").update(csv, "utf8").digest("hex"),
      expiresAt,
    };
  });
  return prepared;
}

async function preparePrivacyExport(
  snapshot: PersistedConsumer,
  requestId: string,
  requestedByUserId: string,
): Promise<PreparedArtifact> {
  if (
    !snapshot.background_job_id ||
    snapshot.actor_user_id !== requestedByUserId
  )
    throw new PermanentJobError(
      "Privacy export owner does not match persisted actor",
      "PRIVACY_EXPORT_OWNER_INVALID",
    );
  if (
    snapshot.aggregate_type !== "DataSubjectRequest" ||
    snapshot.aggregate_id !== requestId
  )
    throw new PermanentJobError(
      "Privacy request does not match persisted outbox aggregate",
      "PRIVACY_EXPORT_CONTEXT_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const request = await transaction.dataSubjectRequest.findFirst({
      where: {
        id: requestId,
        requesterUserId: requestedByUserId,
        type: "EXPORT",
      },
    });
    if (!request)
      throw new PermanentJobError(
        "Privacy request missing",
        "PRIVACY_EXPORT_REQUEST_MISSING",
      );
    const [user, memberships, consents, cookiePreference, requests, deletions] =
      await Promise.all([
        transaction.user.findUnique({
          where: { id: requestedByUserId },
          select: {
            id: true,
            email: true,
            emailVerifiedAt: true,
            status: true,
            acceptedTermsVersion: true,
            acceptedTermsAt: true,
            marketingConsent: true,
            createdAt: true,
            profile: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
            preference: true,
            notificationPreference: true,
          },
        }),
        transaction.workspaceMembership.findMany({
          where: { userId: requestedByUserId },
          select: {
            id: true,
            workspaceId: true,
            status: true,
            roleTemplateId: true,
            createdAt: true,
          },
        }),
        transaction.userConsentRecord.findMany({
          where: { userId: requestedByUserId },
        }),
        transaction.cookiePreference.findUnique({
          where: { userId: requestedByUserId },
        }),
        transaction.dataSubjectRequest.findMany({
          where: { requesterUserId: requestedByUserId },
        }),
        transaction.deletionRequest.findMany({
          where: { requesterUserId: requestedByUserId },
        }),
      ]);
    if (!user)
      throw new PermanentJobError(
        "Privacy export user missing",
        "PRIVACY_EXPORT_USER_MISSING",
      );
    const files: Record<string, unknown> = {
      "account.json": user,
      "memberships.json": memberships,
      "consents.json": consents,
      "cookie-preferences.json": cookiePreference,
      "privacy-requests.json": requests,
      "deletion-requests.json": deletions,
    };
    const zip = new JSZip();
    const manifestFiles: Array<{ path: string; checksumSha256: string }> = [];
    for (const [path, value] of Object.entries(files)) {
      const content = `${JSON.stringify(value, null, 2)}\n`;
      zip.file(path, content);
      manifestFiles.push({
        path,
        checksumSha256: createHash("sha256").update(content).digest("hex"),
      });
    }
    const manifest = {
      version: 1,
      requestId,
      requesterId: requestedByUserId,
      generatedAt: new Date().toISOString(),
      excluded: [
        "password_hashes",
        "session_tokens",
        "provider_raw_payloads",
        "other_tenant_data",
      ],
      files: manifestFiles,
    };
    zip.file("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    const content = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    if (content.byteLength > environment.ARTIFACT_MAX_BYTES)
      throw new PermanentJobError(
        "Privacy export exceeds artifact size limit",
        "PRIVACY_EXPORT_SIZE_LIMIT",
      );
    const artifactId =
      (
        await transaction.generatedArtifact.findUnique({
          where: { consumerExecutionId: snapshot.execution_id },
        })
      )?.id ?? randomUUID();
    const expiresAt = new Date(
      Date.now() + environment.ARTIFACT_RETENTION_HOURS * 60 * 60 * 1000,
    );
    const artifact = await transaction.generatedArtifact.upsert({
      where: { consumerExecutionId: snapshot.execution_id },
      create: {
        id: artifactId,
        backgroundJobId: snapshot.background_job_id!,
        consumerExecutionId: snapshot.execution_id,
        ownerUserId: requestedByUserId,
        kind: "privacy_zip",
        storageKey: `${artifactId}.zip`,
        fileName: `weddingos-personal-data-${requestId}.zip`,
        mediaType: "application/zip",
        expiresAt,
      },
      update: {
        status: "GENERATING",
        expiresAt,
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    return {
      id: artifact.id,
      storageKey: artifact.storageKey,
      fileName: artifact.fileName,
      content,
      mediaType: "application/zip",
      rowCount: manifestFiles.length,
      sizeBytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      expiresAt,
    };
  });
}

async function preparePlanningExport(
  snapshot: PersistedConsumer,
  requestedByUserId: string,
  filters: Record<string, unknown>,
): Promise<PreparedArtifact> {
  if (!snapshot.workspace_id || !snapshot.background_job_id)
    throw new PermanentJobError(
      "Planning export requires workspace and visible job",
      "PLANNING_EXPORT_CONTEXT_INVALID",
    );
  if (requestedByUserId !== snapshot.actor_user_id)
    throw new PermanentJobError(
      "Planning export owner does not match persisted actor",
      "PLANNING_EXPORT_OWNER_INVALID",
    );
  return withPersistedContext(snapshot, async (transaction) => {
    const rows = await transaction.task.findMany({
      where: {
        workspaceId: snapshot.workspace_id!,
        deletedAt: null,
        ...(typeof filters.status === "string"
          ? {
              status: filters.status.toUpperCase() as
                | "NOT_STARTED"
                | "IN_PROGRESS"
                | "WAITING"
                | "BLOCKED"
                | "COMPLETED"
                | "ARCHIVED",
            }
          : {}),
        ...(typeof filters.priority === "string"
          ? {
              priority: filters.priority.toUpperCase() as
                "LOW" | "MEDIUM" | "HIGH" | "URGENT",
            }
          : {}),
        ...(typeof filters.phaseId === "string"
          ? { phaseId: filters.phaseId }
          : {}),
      },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: environment.ARTIFACT_MAX_ROWS + 1,
    });
    if (rows.length > environment.ARTIFACT_MAX_ROWS)
      throw new PermanentJobError(
        `Planning export exceeds ${environment.ARTIFACT_MAX_ROWS} rows`,
        "EXPORT_ROW_LIMIT",
      );
    const phaseIds = rows
      .map((row) => row.phaseId)
      .filter((id): id is string => Boolean(id));
    const phases = await transaction.planningPhase.findMany({
      where: { workspaceId: snapshot.workspace_id!, id: { in: phaseIds } },
    });
    const phaseNames = new Map(phases.map((phase) => [phase.id, phase.title]));
    const csv = [
      "task,deadline,priority,status,assignee_membership,phase",
      ...rows.map((row) =>
        [
          row.title,
          row.dueAt?.toISOString() ?? "",
          row.priority.toLowerCase(),
          row.status.toLowerCase(),
          row.assigneeMembershipId ?? "",
          row.phaseId ? (phaseNames.get(row.phaseId) ?? "") : "",
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\n");
    const sizeBytes = Buffer.byteLength(csv, "utf8");
    if (sizeBytes > environment.ARTIFACT_MAX_BYTES)
      throw new PermanentJobError(
        `Planning export exceeds ${environment.ARTIFACT_MAX_BYTES} bytes`,
        "EXPORT_SIZE_LIMIT",
      );
    const existing = await transaction.generatedArtifact.findUnique({
      where: { consumerExecutionId: snapshot.execution_id },
    });
    const artifactId = existing?.id ?? randomUUID();
    const expiresAt = new Date(
      Date.now() + environment.ARTIFACT_RETENTION_HOURS * 60 * 60 * 1000,
    );
    const artifact = await transaction.generatedArtifact.upsert({
      where: { consumerExecutionId: snapshot.execution_id },
      create: {
        id: artifactId,
        backgroundJobId: snapshot.background_job_id!,
        consumerExecutionId: snapshot.execution_id,
        workspaceId: snapshot.workspace_id!,
        ownerUserId: requestedByUserId,
        kind: "planning_csv",
        storageKey: `${artifactId}.csv`,
        fileName: `weddingos-planning-${snapshot.background_job_id}.csv`,
        mediaType: "text/csv; charset=utf-8",
        expiresAt,
      },
      update: {
        status: "GENERATING",
        expiresAt,
        deletedAt: null,
        version: { increment: 1 },
      },
    });
    return {
      id: artifact.id,
      storageKey: artifact.storageKey,
      fileName: artifact.fileName,
      content: csv,
      mediaType: "text/csv; charset=utf-8",
      rowCount: rows.length,
      sizeBytes,
      sha256: createHash("sha256").update(csv, "utf8").digest("hex"),
      expiresAt,
    };
  });
}

async function writeManagedArtifact(artifact: PreparedArtifact): Promise<void> {
  assertStorageKey(artifact.storageKey);
  await mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  const finalPath = join(artifactRoot, artifact.storageKey);
  const temporaryPath = join(
    artifactRoot,
    `${artifact.storageKey}.${randomUUID()}.tmp`,
  );
  await writeFile(temporaryPath, artifact.content, { mode: 0o600 });
  await rename(temporaryPath, finalPath);
}

async function processCopilotRun(
  snapshot: PersistedConsumer,
  runId: string,
): Promise<Record<string, unknown>> {
  requireIntelligenceContext(snapshot, "COPILOT_CONTEXT_INVALID");
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const run = await transaction.copilotRun.findFirst({
      where: {
        id: runId,
        workspaceId: snapshot.workspace_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!run)
      throw new PermanentJobError(
        "Copilot run does not match persisted job context",
        "COPILOT_RUN_CONTEXT_MISMATCH",
      );
    if (run.status === "COMPLETED") return { completed: true as const, run };
    const message = await transaction.copilotMessage.findFirst({
      where: {
        id: run.userMessageId,
        conversationId: run.conversationId,
        workspaceId: snapshot.workspace_id!,
        role: "USER",
      },
    });
    if (!message)
      throw new PermanentJobError(
        "Copilot user message is missing",
        "COPILOT_MESSAGE_MISSING",
      );
    const conversation = await transaction.copilotConversation.findFirst({
      where: {
        id: run.conversationId,
        workspaceId: snapshot.workspace_id!,
        createdById: snapshot.actor_user_id!,
      },
      select: { surface: true },
    });
    if (!conversation)
      throw new PermanentJobError(
        "Copilot conversation does not belong to the persisted actor",
        "COPILOT_CONVERSATION_CONTEXT_MISMATCH",
      );
    await transaction.copilotRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: run.startedAt ?? new Date() },
    });
    const membership = await transaction.workspaceMembership.findFirst({
      where: {
        workspaceId: snapshot.workspace_id!,
        userId: snapshot.actor_user_id!,
        status: "ACTIVE",
      },
      include: { roleTemplate: true, overrides: true },
    });
    if (!membership)
      throw new PermanentJobError(
        "Copilot actor no longer has workspace access",
        "COPILOT_ACTOR_ACCESS_REVOKED",
      );
    const effectiveCapabilities = new Set<string>(
      Array.isArray(membership.roleTemplate.capabilities)
        ? membership.roleTemplate.capabilities.filter(
            (capability): capability is string =>
              typeof capability === "string",
          )
        : [],
    );
    for (const override of membership.overrides) {
      if (override.effect === "ALLOW")
        effectiveCapabilities.add(override.capability);
      else effectiveCapabilities.delete(override.capability);
    }
    const copilotSettings =
      await transaction.copilotWorkspaceSettings.findUnique({
        where: { workspaceId: snapshot.workspace_id! },
      });
    const memories =
      copilotSettings?.memoryEnabled === false
        ? []
        : await transaction.copilotMemory.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              status: "ACTIVE",
              OR: [
                { scope: "WORKSPACE" },
                { scope: "USER", ownerUserId: snapshot.actor_user_id! },
              ],
              AND: [
                {
                  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                },
              ],
            },
            orderBy: [
              { confirmedByUser: "desc" },
              { lastUsedAt: "desc" },
              { updatedAt: "desc" },
            ],
            take: 12,
          });
    const [tasks, milestones, risks, events, phases] = await Promise.all([
      effectiveCapabilities.has("task.read")
        ? transaction.task.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              deletedAt: null,
              status: { notIn: ["COMPLETED", "ARCHIVED"] },
            },
            orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
            take: 20,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("timeline.read")
        ? transaction.timelineMilestone.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { targetAt: "asc" },
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("risk.read")
        ? transaction.risk.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              deletedAt: null,
              status: { notIn: ["RESOLVED", "ARCHIVED"] },
            },
            orderBy: { score: "desc" },
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("calendar.read")
        ? transaction.calendarEvent.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { startAt: "asc" },
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("planning.read")
        ? transaction.planningPhase.findMany({
            where: { workspaceId: snapshot.workspace_id! },
            orderBy: { position: "asc" },
            take: 12,
          })
        : Promise.resolve([]),
    ]);
    const extractions = effectiveCapabilities.has("document.read")
      ? await transaction.documentTextExtraction.findMany({
          where: { workspaceId: snapshot.workspace_id!, status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          take: 5,
        })
      : [];
    const [documentChunks, documents] = extractions.length
      ? await Promise.all([
          transaction.documentTextChunk.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              extractionId: { in: extractions.map((item) => item.id) },
            },
            orderBy: [{ extractionId: "asc" }, { chunkIndex: "asc" }],
            take: 10,
          }),
          transaction.vaultDocument.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              id: { in: extractions.map((item) => item.documentId) },
              deletedAt: null,
            },
            select: { id: true, title: true, updatedAt: true },
          }),
        ])
      : [[], []];
    const extractionById = new Map(extractions.map((item) => [item.id, item]));
    const documentById = new Map(documents.map((item) => [item.id, item]));
    const [
      budgetPlan,
      budgetItems,
      guestCount,
      bookingCount,
      contractCount,
      paymentDue,
      weddingDayPlans,
    ] = await Promise.all([
      effectiveCapabilities.has("budget.read")
        ? transaction.budgetPlan.findUnique({
            where: { workspaceId: snapshot.workspace_id! },
          })
        : Promise.resolve(null),
      effectiveCapabilities.has("budget.read")
        ? transaction.budgetItem.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 20,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("guest.read")
        ? transaction.guest.count({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
          })
        : Promise.resolve(0),
      effectiveCapabilities.has("booking.read")
        ? transaction.vendorBooking.count({
            where: { workspaceId: snapshot.workspace_id! },
          })
        : Promise.resolve(0),
      effectiveCapabilities.has("contract.read")
        ? transaction.vendorContract.count({
            where: { workspaceId: snapshot.workspace_id! },
          })
        : Promise.resolve(0),
      effectiveCapabilities.has("payment.read")
        ? transaction.paymentScheduleEntry.count({
            where: {
              workspaceId: snapshot.workspace_id!,
              deletedAt: null,
              status: { notIn: ["PAID", "CANCELLED"] },
            },
          })
        : Promise.resolve(0),
      effectiveCapabilities.has("wedding_day.read")
        ? transaction.weddingDayPlan.findMany({
            where: { workspaceId: snapshot.workspace_id! },
            select: { id: true, name: true, status: true, updatedAt: true },
            take: 3,
          })
        : Promise.resolve([]),
    ]);
    const [
      budgetCategories,
      expenses,
      households,
      guests,
      menus,
      seatingPlans,
      seatingTables,
      venueSpaces,
      shortlists,
      invitationSite,
      transportPlans,
      transportRoutes,
      accommodationProperties,
      accommodationStays,
      rfqs,
      campaigns,
      weddingDayIncidents,
      weddingDayAnnouncements,
    ] = await Promise.all([
      effectiveCapabilities.has("budget.read")
        ? transaction.budgetCategory.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("expense.read")
        ? transaction.expenseRecord.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("guest.read")
        ? transaction.household.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            select: {
              id: true,
              version: true,
              preferredLanguage: true,
              side: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("guest.read")
        ? transaction.guest.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              deletedAt: null,
              status: "ACTIVE",
            },
            select: {
              id: true,
              householdId: true,
              version: true,
              preferredLanguage: true,
              side: true,
              isChild: true,
              isPlusOne: true,
              plusOneAllowed: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 16,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("menu.read")
        ? transaction.menu.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("seating.read")
        ? transaction.seatingPlan.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("seating.read")
        ? transaction.seatingTable.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: [{ seatingPlanId: "asc" }, { position: "asc" }],
            take: 20,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("seating.read")
        ? transaction.venueSpace.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("marketplace.shortlist")
        ? transaction.vendorShortlist.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("invitation.read")
        ? transaction.invitationSite.findUnique({
            where: { workspaceId: snapshot.workspace_id! },
          })
        : Promise.resolve(null),
      effectiveCapabilities.has("transport.read")
        ? transaction.transportPlan.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("transport.read")
        ? transaction.transportRoute.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { departureAt: "asc" },
            take: 12,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("accommodation.read")
        ? transaction.accommodationProperty.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("accommodation.read")
        ? transaction.accommodationStay.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { checkInDate: "asc" },
            take: 8,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("rfq.read")
        ? transaction.requestForQuote.findMany({
            where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("campaign.read")
        ? transaction.campaign.findMany({
            where: { workspaceId: snapshot.workspace_id! },
            orderBy: { updatedAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("incident.read")
        ? transaction.weddingDayIncident.findMany({
            where: {
              workspaceId: snapshot.workspace_id!,
              status: { notIn: ["CLOSED", "CANCELLED"] },
            },
            orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
            take: 10,
          })
        : Promise.resolve([]),
      effectiveCapabilities.has("announcement.read")
        ? transaction.weddingDayAnnouncement.findMany({
            where: { workspaceId: snapshot.workspace_id! },
            orderBy: { updatedAt: "desc" },
            take: 10,
          })
        : Promise.resolve([]),
    ]);
    const totalMinor = (values: bigint[]) =>
      values.reduce((sum, value) => sum + value, 0n).toString();
    const aggregateResources: CopilotContextResource[] = [
      ...(budgetPlan
        ? [
            {
              type: "BudgetSummary",
              id: budgetPlan.id,
              title: budgetPlan.name,
              summary: `versiune ${budgetPlan.version}; țintă ${budgetPlan.targetTotalMinor.toString()} ${budgetPlan.currency}; rezervă ${budgetPlan.contingencyPercent}%; estimat ${totalMinor(budgetItems.map((item) => item.estimatedMinor))}; angajat ${totalMinor(budgetItems.map((item) => item.committedMinor ?? 0n))}; plătit ${totalMinor(budgetItems.map((item) => item.paidMinor))}`,
              updatedAt: budgetPlan.updatedAt.toISOString(),
              sensitivity: "normal" as const,
            },
          ]
        : []),
      ...(effectiveCapabilities.has("guest.read")
        ? [
            {
              type: "GuestSummary",
              id: snapshot.workspace_id!,
              title: "Rezumat invitați",
              summary: `${guestCount} invitați activi; nu sunt incluse nume, date de contact sau informații medicale.`,
              sensitivity: "normal" as const,
            },
          ]
        : []),
      ...(effectiveCapabilities.has("booking.read")
        ? [
            {
              type: "BookingSummary",
              id: snapshot.workspace_id!,
              title: "Rezumat rezervări",
              summary: `${bookingCount} rezervări de furnizori.`,
              sensitivity: "normal" as const,
            },
          ]
        : []),
      ...(effectiveCapabilities.has("contract.read")
        ? [
            {
              type: "ContractSummary",
              id: snapshot.workspace_id!,
              title: "Rezumat contracte",
              summary: `${contractCount} contracte; conținutul documentelor este separat și cere document.read.`,
              sensitivity: "normal" as const,
            },
          ]
        : []),
      ...(effectiveCapabilities.has("payment.read")
        ? [
            {
              type: "PaymentScheduleSummary",
              id: snapshot.workspace_id!,
              title: "Scadențe de plată",
              summary: `${paymentDue} scadențe active; Copilot nu poate iniția plăți sau refunduri.`,
              sensitivity: "normal" as const,
            },
          ]
        : []),
      ...weddingDayPlans.map((plan) => ({
        type: "WeddingDayPlan",
        id: plan.id,
        title: plan.name,
        summary: `status operațional ${plan.status.toLowerCase()}`,
        updatedAt: plan.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...(invitationSite
        ? [
            {
              type: "InvitationSite",
              id: invitationSite.id,
              title: "Invitația evenimentului",
              summary: `versiune ${invitationSite.version}; status ${invitationSite.status.toLowerCase()}; sincronizare disponibilă pentru hero.names, hero.date, hero.venue, schedule.items, locations.items, rsvp.deadline și accommodation.items`,
              updatedAt: invitationSite.updatedAt.toISOString(),
              sensitivity: "normal" as const,
            },
          ]
        : []),
    ];
    const actionableResources: CopilotContextResource[] = [
      ...budgetCategories.map((category) => ({
        type: "BudgetCategory",
        id: category.id,
        title: category.name,
        summary: `versiune ${category.version}; plan ${category.budgetPlanId}; alocat ${category.allocatedMinor.toString()}; poziția ${category.position}`,
        updatedAt: category.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...budgetItems.slice(0, 12).map((item) => ({
        type: "BudgetItem",
        id: item.id,
        title: item.name,
        summary: `versiune ${item.version}; categorie ${item.categoryId}; status ${item.status.toLowerCase()}; estimat ${item.estimatedMinor.toString()}; plătit ${item.paidMinor.toString()}${item.dueAt ? `; termen ${item.dueAt.toISOString()}` : ""}`,
        updatedAt: item.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...expenses.map((expense) => ({
        type: "ExpenseRecord",
        id: expense.id,
        title: "Cheltuială bugetară",
        summary: `versiune ${expense.version}; element buget ${expense.budgetItemId}; status ${expense.status.toLowerCase()}; sumă ${expense.amountMinor.toString()}; data ${expense.expenseDate.toISOString().slice(0, 10)}`,
        updatedAt: expense.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...households.map((household, index) => ({
        type: "Household",
        id: household.id,
        title: `Gospodărie ${index + 1}`,
        summary: `versiune ${household.version}; ${guests.filter((guest) => guest.householdId === household.id).length} membri în contextul curent; limbă ${household.preferredLanguage}; parte ${household.side.toLowerCase()}; numele și contactele sunt excluse`,
        updatedAt: household.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...guests.map((guest, index) => ({
        type: "Guest",
        id: guest.id,
        title: `Invitat ${index + 1}`,
        summary: `versiune ${guest.version}; gospodărie ${guest.householdId}; limbă ${guest.preferredLanguage}; parte ${guest.side.toLowerCase()}; copil ${guest.isChild}; plus-one ${guest.isPlusOne}; permite plus-one ${guest.plusOneAllowed}; numele și contactele sunt excluse`,
        updatedAt: guest.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...menus.map((menu) => ({
        type: "Menu",
        id: menu.id,
        title: menu.name,
        summary: `versiune ${menu.version}; audiență ${menu.audience.toLowerCase()}; status ${menu.status.toLowerCase()}${menu.priceMinor !== null ? `; preț ${menu.priceMinor} ${menu.currency ?? ""}` : ""}`,
        updatedAt: menu.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...seatingPlans.map((plan) => ({
        type: "SeatingPlan",
        id: plan.id,
        title: plan.name,
        summary: `versiune ${plan.version}; eveniment ${plan.weddingEventId}; spațiu ${plan.venueSpaceId}; status ${plan.status.toLowerCase()}`,
        updatedAt: plan.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...seatingTables.map((table) => ({
        type: "SeatingTable",
        id: table.id,
        title: table.name,
        summary: `versiune ${table.version}; plan ${table.seatingPlanId}; etichetă ${table.label}; formă ${table.shape.toLowerCase()}; capacitate ${table.capacity}; poziție ${table.position}`,
        updatedAt: table.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...venueSpaces.map((space) => ({
        type: "VenueSpace",
        id: space.id,
        title: space.name,
        summary: `capacitate ${space.capacity ?? "nespecificată"}; resursă disponibilă pentru planurile de mese`,
        updatedAt: space.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...shortlists.map((shortlist) => ({
        type: "VendorShortlist",
        id: shortlist.id,
        title: shortlist.name,
        summary: `versiune ${shortlist.version}; categorie ${shortlist.category?.toLowerCase() ?? "toate"}`,
        updatedAt: shortlist.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...transportPlans.map((plan) => ({
        type: "TransportPlan",
        id: plan.id,
        title: plan.name,
        summary: `versiune ${plan.version}; eveniment ${plan.weddingEventId}; status ${plan.status.toLowerCase()}; ${transportRoutes.filter((route) => route.transportPlanId === plan.id).length} rute în context`,
        updatedAt: plan.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...transportRoutes.map((route) => ({
        type: "TransportRoute",
        id: route.id,
        title: route.name,
        summary: `versiune ${route.version}; plan ${route.transportPlanId}; ${route.originName} → ${route.destinationName}; plecare ${route.departureAt.toISOString()}; status ${route.status.toLowerCase()}`,
        updatedAt: route.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...accommodationProperties.map((property) => ({
        type: "AccommodationProperty",
        id: property.id,
        title: property.name,
        summary: `versiune ${property.version}; ${property.type.toLowerCase()} în ${property.city}; status ${property.status.toLowerCase()}; contactele sunt excluse`,
        updatedAt: property.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...accommodationStays.map((stay) => ({
        type: "AccommodationStay",
        id: stay.id,
        title: stay.name,
        summary: `versiune ${stay.version}; proprietate ${stay.propertyId}; ${stay.checkInDate.toISOString().slice(0, 10)}–${stay.checkOutDate.toISOString().slice(0, 10)}; status ${stay.status.toLowerCase()}`,
        updatedAt: stay.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...rfqs.map((rfq) => ({
        type: "RequestForQuote",
        id: rfq.id,
        title: rfq.title,
        summary: `versiune ${rfq.version}; categorie ${rfq.category.toLowerCase()}; status ${rfq.status.toLowerCase()}; termen ${rfq.responseDeadline.toISOString()}`,
        updatedAt: rfq.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...campaigns.map((campaign) => ({
        type: "CampaignSummary",
        id: campaign.id,
        title: campaign.name,
        summary: `versiune ${campaign.version}; scop ${campaign.purpose.toLowerCase()}; status ${campaign.status.toLowerCase()}${campaign.scheduledAt ? `; programată ${campaign.scheduledAt.toISOString()}` : ""}; conținutul mesajului este exclus`,
        updatedAt: campaign.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...weddingDayIncidents.map((incident) => ({
        type: "WeddingDayIncidentSummary",
        id: incident.id,
        title: incident.title,
        summary: `versiune ${incident.version}; tip ${incident.type.toLowerCase()}; severitate ${incident.severity.toLowerCase()}; status ${incident.status.toLowerCase()}; descrierea privată este exclusă`,
        updatedAt: incident.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...weddingDayAnnouncements.map((announcement) => ({
        type: "WeddingDayAnnouncementSummary",
        id: announcement.id,
        title: announcement.title,
        summary: `versiune ${announcement.version}; prioritate ${announcement.priority.toLowerCase()}; status ${announcement.status.toLowerCase()}; textul mesajului este exclus`,
        updatedAt: announcement.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
    ];
    const surfaceTypes = conversation.surface.includes("budget")
      ? new Set(["BudgetCategory", "BudgetItem", "ExpenseRecord"])
      : conversation.surface.includes("guest")
        ? new Set(["Household", "Guest", "Menu"])
        : conversation.surface.includes("menu")
          ? new Set(["Menu", "Household", "Guest"])
          : conversation.surface.includes("seating")
            ? new Set(["SeatingPlan", "SeatingTable", "VenueSpace"])
            : conversation.surface.includes("transport")
              ? new Set(["TransportPlan", "TransportRoute"])
              : conversation.surface.includes("accommodation")
                ? new Set(["AccommodationProperty", "AccommodationStay"])
                : conversation.surface.includes("invitation")
                  ? new Set(["InvitationSite", "CampaignSummary"])
                  : conversation.surface.includes("wedding-day")
                    ? new Set([
                        "WeddingDayPlan",
                        "WeddingDayIncidentSummary",
                        "WeddingDayAnnouncementSummary",
                      ])
                    : conversation.surface.includes("marketplace") ||
                        conversation.surface.includes("vendor")
                      ? new Set([
                          "VendorShortlist",
                          "RequestForQuote",
                          "BookingSummary",
                          "ContractSummary",
                        ])
                      : new Set<string>();
    const prioritizedActionableResources = [
      ...actionableResources.filter((resource) =>
        surfaceTypes.has(resource.type),
      ),
      ...actionableResources.filter(
        (resource) => !surfaceTypes.has(resource.type),
      ),
    ].slice(0, 24);
    const resources: CopilotContextResource[] = [
      ...memories.slice(0, 8).map((memory) => ({
        type: `CopilotMemory:${memory.kind}`,
        id: memory.id,
        title: memory.title,
        summary: memory.content.slice(0, 800),
        updatedAt: memory.updatedAt.toISOString(),
        sensitivity:
          memory.sensitivity === "NORMAL"
            ? ("normal" as const)
            : ("sensitive" as const),
      })),
      ...aggregateResources,
      ...prioritizedActionableResources,
      ...tasks.map((task) => ({
        type: "Task",
        id: task.id,
        title: task.title,
        summary: `versiune ${task.version}; ${task.status.toLowerCase()}, prioritate ${task.priority.toLowerCase()}${task.dueAt ? `, termen ${task.dueAt.toISOString()}` : ""}${task.blockedReason ? `, blocat: ${task.blockedReason}` : ""}`,
        updatedAt: task.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...milestones.map((milestone) => ({
        type: "TimelineMilestone",
        id: milestone.id,
        title: milestone.title,
        summary: `${milestone.status.toLowerCase()}${milestone.targetAt ? `, țintă ${milestone.targetAt.toISOString()}` : ""}`,
        updatedAt: milestone.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...risks.map((risk) => ({
        type: "Risk",
        id: risk.id,
        title: risk.title,
        summary: `versiune ${risk.version}; ${risk.level.toLowerCase()}, scor ${risk.score}, ${risk.status.toLowerCase()}`,
        updatedAt: risk.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...events.map((event) => ({
        type: "CalendarEvent",
        id: event.id,
        title: event.title,
        summary: `versiune ${event.version}; ${event.startAt.toISOString()}${event.endAt ? ` – ${event.endAt.toISOString()}` : ""}; fus ${event.timezone}`,
        updatedAt: event.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...phases.map((phase) => ({
        type: "PlanningPhase",
        id: phase.id,
        title: phase.title,
        summary: `${phase.status.toLowerCase()}, poziția ${phase.position}`,
        updatedAt: phase.updatedAt.toISOString(),
        sensitivity: "normal" as const,
      })),
      ...documentChunks.flatMap((chunk) => {
        const extraction = extractionById.get(chunk.extractionId);
        const document = extraction
          ? documentById.get(extraction.documentId)
          : undefined;
        if (!document) return [];
        return [
          {
            type: "VaultDocument",
            id: document.id,
            title: document.title,
            summary: chunk.content.slice(0, 800),
            updatedAt: document.updatedAt.toISOString(),
            sensitivity: "sensitive" as const,
          },
        ];
      }),
    ].slice(0, 50);
    const maximumContextBytes = Math.max(
      8_000,
      environment.COPILOT_MAX_CONTEXT_BYTES,
    );
    while (
      resources.length > 1 &&
      Buffer.byteLength(JSON.stringify(resources), "utf8") > maximumContextBytes
    )
      resources.pop();
    return {
      completed: false as const,
      run,
      message,
      webResearchEnabled: copilotSettings?.webResearchEnabled === true,
      context: {
        workspaceId: snapshot.workspace_id!,
        locale: "ro-RO",
        surface: conversation.surface,
        allowedActions: copilotImplementedActionDefinitions
          .filter((definition) =>
            effectiveCapabilities.has(definition.requiredCapability),
          )
          .map((definition) => definition.actionType),
        resources,
        unavailableModules: copilotDomainCatalog
          .filter(
            (domain) =>
              !copilotImplementedActionDefinitions.some(
                (definition) =>
                  effectiveCapabilities.has(definition.requiredCapability) &&
                  domain.capabilityPrefixes.some((prefix) =>
                    definition.requiredCapability.startsWith(`${prefix}.`),
                  ),
              ) &&
              !copilotReadToolDefinitions.some(
                (definition) =>
                  definition.domain === domain.key &&
                  effectiveCapabilities.has(definition.requiredCapability),
              ),
          )
          .map((domain) => domain.key),
        redactions: documentChunks.length
          ? [
              "Fragmentele autorizate din documente rămân în procesarea deterministă locală și nu sunt trimise providerului extern.",
              "Datele sensibile despre invitați și plăți nu au fost incluse.",
            ]
          : [
              "Datele sensibile despre invitați, documente și plăți nu au fost incluse.",
            ],
      },
    };
  });
  if (prepared.completed) return { runId, status: "completed", replayed: true };

  const researchRequested =
    jsonObjectValue(prepared.message.metadata).research === true;
  if (researchRequested && !prepared.webResearchEnabled)
    throw new PermanentJobError(
      "Web research is disabled for this workspace",
      "COPILOT_WEB_RESEARCH_DISABLED",
    );
  const researchQueryHash = researchRequested
    ? createHash("sha256")
        .update(prepared.message.content.trim().toLocaleLowerCase("ro"))
        .digest("hex")
    : null;
  const cachedResearch = researchQueryHash
    ? await withPersistedContext(snapshot, async (transaction) => {
        const research = await transaction.copilotWebResearch.findFirst({
          where: {
            workspaceId: snapshot.workspace_id!,
            queryHash: researchQueryHash,
            expiresAt: { gt: new Date() },
          },
        });
        if (!research) return null;
        const citations = await transaction.copilotWebCitation.findMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            researchId: research.id,
          },
          orderBy: { position: "asc" },
        });
        return { research, citations };
      })
    : null;

  if (
    environment.COPILOT_EMBEDDING_ENABLED &&
    environment.COPILOT_EMBEDDING_API_KEY &&
    copilotMemoryContentCanPersist(prepared.message.content)
  ) {
    const queryEmbedding = await requestCopilotEmbedding({
      endpoint: environment.COPILOT_EMBEDDING_ENDPOINT,
      apiKey: environment.COPILOT_EMBEDDING_API_KEY,
      model: environment.COPILOT_EMBEDDING_MODEL,
      text: prepared.message.content,
    });
    if (queryEmbedding) {
      const semanticMemory = await semanticCopilotMemoryContext(
        snapshot,
        queryEmbedding,
      );
      if (semanticMemory.length) {
        prepared.context.resources = [
          ...semanticMemory,
          ...prepared.context.resources.filter(
            (resource) => !resource.type.startsWith("CopilotMemory:"),
          ),
        ].slice(0, 50);
      }
    }
  }

  const externalEnabled =
    environment.COPILOT_EXTERNAL_ENABLED &&
    environment.COPILOT_EXTERNAL_DATA_ALLOWED;
  const providerChoice = routeCopilotProvider({
    mode: prepared.run.requestedMode as
      "deterministic" | "ai_enriched" | "auto",
    containsSensitiveContext:
      !copilotMemoryContentCanPersist(prepared.message.content) ||
      prepared.context.resources.some(
        (resource) => resource.sensitivity === "sensitive",
      ),
    externalEnabled,
  });
  const provider =
    providerChoice === "configured-ai"
      ? environment.COPILOT_PROVIDER_PROTOCOL === "openrouter-chat"
        ? new OpenRouterCopilotProvider(
            environment.COPILOT_PROVIDER_ENDPOINT,
            environment.COPILOT_PROVIDER_API_KEY,
            environment.COPILOT_PROVIDER_MODEL,
          )
        : new ConfiguredAiCopilotProvider(
            environment.COPILOT_PROVIDER_ENDPOINT,
            environment.COPILOT_PROVIDER_API_KEY,
          )
      : new DeterministicCopilotProvider();
  const generated = cachedResearch
    ? {
        answer: cachedResearch.research.answer,
        provider: cachedResearch.research.provider,
        model: cachedResearch.research.model,
        fallbackUsed: false,
        assumptions: [] as string[],
        warnings: [
          "Rezultat reutilizat din cache-ul verificabil al workspace-ului.",
        ],
        followUpSuggestions: ["Actualizează cercetarea web"],
        sources: [],
        webCitations: cachedResearch.citations.map((citation) => ({
          url: citation.url,
          title: citation.title,
          excerpt: citation.excerpt,
        })),
        usage: { inputUnits: 0, outputUnits: 0 },
      }
    : await provider.run({
        message: prepared.message.content,
        context: prepared.context,
        research: researchRequested,
      });
  return withPersistedContext(snapshot, async (transaction) => {
    const latest = await transaction.copilotRun.findFirst({
      where: {
        id: runId,
        workspaceId: snapshot.workspace_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!latest)
      throw new PermanentJobError(
        "Copilot run disappeared from persisted context",
        "COPILOT_RUN_CONTEXT_MISMATCH",
      );
    if (latest.status === "COMPLETED")
      return { runId, status: "completed", replayed: true };
    const assistant = await transaction.copilotMessage.create({
      data: {
        workspaceId: snapshot.workspace_id!,
        conversationId: latest.conversationId,
        role: "ASSISTANT",
        content: generated.answer,
        metadata: {
          provider: generated.provider,
          model: generated.model,
          fallbackUsed: generated.fallbackUsed,
          policyVersion: COPILOT_POLICY_VERSION,
          assumptions: generated.assumptions,
          warnings: generated.warnings,
          followUpSuggestions: generated.followUpSuggestions,
          confidence: generated.confidence,
          plan: generated.plan
            ? {
                title: generated.plan.title,
                summary: generated.plan.summary,
                stepCount: generated.plan.steps.length,
              }
            : null,
          webCitations: generated.webCitations ?? [],
          redactions: prepared.context.redactions,
        },
      },
    });
    const contextHash = createHash("sha256")
      .update(JSON.stringify(prepared.context))
      .digest("hex");
    await transaction.copilotRun.update({
      where: { id: runId },
      data: {
        assistantMessageId: assistant.id,
        status: "COMPLETED",
        provider: generated.provider,
        model: generated.model,
        contextHash,
        fallbackUsed: generated.fallbackUsed,
        completedAt: new Date(),
      },
    });
    await transaction.copilotUsageRecord.upsert({
      where: { runId },
      create: {
        workspaceId: snapshot.workspace_id!,
        userId: latest.requestedById,
        runId,
        provider: generated.provider,
        model: generated.model,
        inputUnits: generated.usage.inputUnits,
        outputUnits: generated.usage.outputUnits,
        estimatedCostMinor:
          Math.ceil(
            (generated.usage.inputUnits *
              environment.COPILOT_INPUT_COST_MINOR_PER_MILLION +
              generated.usage.outputUnits *
                environment.COPILOT_OUTPUT_COST_MINOR_PER_MILLION) /
              1_000_000,
          ) +
          (researchRequested && !cachedResearch
            ? environment.COPILOT_WEB_SEARCH_COST_MINOR
            : 0),
      },
      update: {},
    });
    if (
      researchRequested &&
      researchQueryHash &&
      !generated.fallbackUsed &&
      (generated.webCitations?.length ?? 0) > 0
    ) {
      const research = await transaction.copilotWebResearch.upsert({
        where: {
          workspaceId_queryHash: {
            workspaceId: snapshot.workspace_id!,
            queryHash: researchQueryHash,
          },
        },
        create: {
          workspaceId: snapshot.workspace_id!,
          runId,
          queryHash: researchQueryHash,
          query: prepared.message.content.slice(0, 1000),
          answer: generated.answer,
          provider: generated.provider,
          model: generated.model,
          expiresAt: new Date(Date.now() + 21_600_000),
        },
        update: {
          runId,
          answer: generated.answer,
          provider: generated.provider,
          model: generated.model,
          expiresAt: new Date(Date.now() + 21_600_000),
        },
      });
      if (!cachedResearch) {
        await transaction.copilotWebCitation.deleteMany({
          where: {
            workspaceId: snapshot.workspace_id!,
            researchId: research.id,
          },
        });
        for (const [position, citation] of (
          generated.webCitations ?? []
        ).entries())
          await transaction.copilotWebCitation.create({
            data: {
              workspaceId: snapshot.workspace_id!,
              researchId: research.id,
              url: citation.url,
              title: citation.title,
              excerpt: citation.excerpt,
              position,
            },
          });
      }
    }
    for (const [position, source] of generated.sources.entries()) {
      await transaction.copilotSourceReference.upsert({
        where: {
          runId_resourceType_resourceId: {
            runId,
            resourceType: source.resourceType,
            resourceId: source.resourceId,
          },
        },
        create: {
          workspaceId: snapshot.workspace_id!,
          runId,
          resourceType: source.resourceType,
          resourceId: source.resourceId,
          excerpt: source.excerpt,
          position,
        },
        update: { excerpt: source.excerpt, position },
      });
    }
    const proposalIds: string[] = [];
    let planId: string | null = null;
    const persistProposal = async (
      generatedProposal: NonNullable<typeof generated.proposal>,
      stepPosition?: number,
    ) => {
      const proposedActions = [
        {
          actionType: generatedProposal.actionType,
          riskLevel: generatedProposal.riskLevel,
          preview: generatedProposal.preview,
        },
        ...(generatedProposal.additionalActions ?? []),
      ].map((action) => ({
        ...action,
        preview: parseCopilotActionPayload(action.actionType, action.preview),
      }));
      const proposal = await transaction.copilotProposal.create({
        data: {
          workspaceId: snapshot.workspace_id!,
          runId,
          planId,
          stepPosition: stepPosition ?? null,
          title: generatedProposal.title,
          summary:
            "Acțiune structurată pregătită pentru verificare și aprobare.",
          riskLevel: generatedProposal.riskLevel,
          createdById: latest.requestedById,
        },
      });
      proposalIds.push(proposal.id);
      await transaction.copilotProposalVersion.create({
        data: {
          workspaceId: snapshot.workspace_id!,
          proposalId: proposal.id,
          version: 1,
          snapshot: generatedProposal as unknown as Prisma.InputJsonValue,
          createdById: latest.requestedById,
        },
      });
      for (const [position, action] of proposedActions.entries())
        await transaction.copilotProposalAction.create({
          data: {
            workspaceId: snapshot.workspace_id!,
            proposalId: proposal.id,
            actionType: action.actionType,
            payload: action.preview as Prisma.InputJsonValue,
            riskLevel: action.riskLevel,
            position,
          },
        });
      return proposal.id;
    };
    if (generated.plan) {
      const plan = await transaction.copilotPlan.create({
        data: {
          workspaceId: snapshot.workspace_id!,
          runId,
          title: generated.plan.title,
          summary: generated.plan.summary,
          createdById: latest.requestedById,
        },
      });
      planId = plan.id;
      for (const [stepPosition, step] of generated.plan.steps.entries())
        await persistProposal(step, stepPosition);
    } else if (generated.proposal) {
      await persistProposal(generated.proposal);
    }
    const proposalId = proposalIds[0] ?? null;
    await recordWorkerEvent(transaction, snapshot, {
      eventName: "copilot.response_ready.v1",
      aggregateType: "CopilotRun",
      aggregateId: runId,
      aggregateVersion: 1,
      deduplicationKey: `copilot-response-ready:${runId}`,
      payload: {
        occurredAt: new Date().toISOString(),
        subject: {
          runId,
          assistantMessageId: assistant.id,
          proposalId,
          proposalIds,
          planId,
        },
        notification: {
          recipientUserId: latest.requestedById,
          module: "copilot",
          kind: "response_ready",
          priority: "normal",
          title: "Răspunsul Copilot este gata",
          body: generated.fallbackUsed
            ? "Răspuns generat prin fallback determinist."
            : "Răspunsul contextual este pregătit.",
          actionUrl: "/overview",
        },
      },
    });
    for (const readyProposalId of proposalIds)
      await recordWorkerEvent(transaction, snapshot, {
        eventName: "copilot.proposal_ready.v1",
        aggregateType: "CopilotProposal",
        aggregateId: readyProposalId,
        aggregateVersion: 1,
        deduplicationKey: `copilot-proposal-ready:${readyProposalId}`,
        payload: {
          occurredAt: new Date().toISOString(),
          subject: { proposalId: readyProposalId, runId, planId },
        },
      });
    return {
      runId,
      assistantMessageId: assistant.id,
      proposalId,
      proposalIds,
      planId,
      provider: generated.provider,
      fallbackUsed: generated.fallbackUsed,
      status: "completed",
    };
  });
}

function jsonObjectValue(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}

async function semanticCopilotMemoryContext(
  snapshot: PersistedConsumer,
  embedding: number[],
): Promise<CopilotContextResource[]> {
  const vector = `[${embedding.join(",")}]`;
  return withPersistedContext(snapshot, async (transaction) => {
    const rows = await transaction.$queryRaw<
      Array<{
        id: string;
        kind: string;
        title: string;
        content: string;
        sensitivity: string;
        updatedAt: Date;
      }>
    >`
      SELECT
        memory.id,
        memory.kind::text,
        memory.title,
        memory.content,
        memory.sensitivity::text,
        memory.updated_at AS "updatedAt"
      FROM copilot_memories memory
      JOIN copilot_memory_embeddings embedding
        ON embedding.memory_id = memory.id
      WHERE memory.workspace_id = ${snapshot.workspace_id!}::uuid
        AND memory.status = 'ACTIVE'
        AND memory.sensitivity = 'NORMAL'
        AND (
          memory.scope = 'WORKSPACE'
          OR memory.owner_user_id = ${snapshot.actor_user_id!}::uuid
        )
        AND (memory.expires_at IS NULL OR memory.expires_at > CURRENT_TIMESTAMP)
      ORDER BY embedding.embedding <=> ${vector}::vector, memory.updated_at DESC
      LIMIT 12
    `;
    if (rows.length)
      await transaction.copilotMemory.updateMany({
        where: {
          workspaceId: snapshot.workspace_id!,
          id: { in: rows.map((row) => row.id) },
        },
        data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
      });
    return rows.map((memory) => ({
      type: `CopilotMemory:${memory.kind}`,
      id: memory.id,
      title: memory.title,
      summary: memory.content.slice(0, 800),
      updatedAt: memory.updatedAt.toISOString(),
      sensitivity: "normal" as const,
    }));
  });
}

async function processRiskDetection(
  snapshot: PersistedConsumer,
  detectionRunId: string,
): Promise<Record<string, unknown>> {
  requireIntelligenceContext(snapshot, "RISK_DETECTION_CONTEXT_INVALID");
  return withPersistedContext(snapshot, async (transaction) => {
    const run = await transaction.riskDetectionRun.findFirst({
      where: {
        id: detectionRunId,
        workspaceId: snapshot.workspace_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!run)
      throw new PermanentJobError(
        "Risk detection does not match persisted job context",
        "RISK_DETECTION_CONTEXT_MISMATCH",
      );
    if (run.status === "COMPLETED")
      return {
        detectionRunId,
        detectedCount: run.detectedCount,
        replayed: true,
      };
    await transaction.riskDetectionRun.update({
      where: { id: run.id },
      data: { status: "RUNNING" },
    });
    const [tasks, milestones] = await Promise.all([
      transaction.task.findMany({
        where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
      }),
      transaction.timelineMilestone.findMany({
        where: { workspaceId: snapshot.workspace_id!, deletedAt: null },
      }),
    ]);
    const candidates = detectDeterministicRisks({
      now: new Date(),
      tasks,
      milestones,
    });
    let detectedCount = 0;
    const riskIds: string[] = [];
    for (const candidate of candidates) {
      const score = candidate.probability * candidate.impact;
      const level =
        score >= 20
          ? "CRITICAL"
          : score >= 12
            ? "HIGH"
            : score >= 6
              ? "MEDIUM"
              : "LOW";
      const existing = await transaction.risk.findUnique({
        where: {
          workspaceId_dedupeKey: {
            workspaceId: snapshot.workspace_id!,
            dedupeKey: candidate.dedupeKey,
          },
        },
      });
      const risk = existing
        ? await transaction.risk.update({
            where: { id: existing.id },
            data: {
              description: candidate.description,
              probability: candidate.probability,
              impact: candidate.impact,
              score,
              level,
              version: { increment: 1 },
            },
          })
        : await transaction.risk.create({
            data: {
              workspaceId: snapshot.workspace_id!,
              title: candidate.title,
              description: candidate.description,
              category: candidate.category,
              probability: candidate.probability,
              impact: candidate.impact,
              score,
              level,
              source: "DETECTED",
              sourceType: candidate.sourceType,
              sourceId: candidate.sourceId,
              dedupeKey: candidate.dedupeKey,
              createdById: snapshot.actor_user_id!,
            },
          });
      if (!existing) detectedCount += 1;
      riskIds.push(risk.id);
      await Promise.all([
        transaction.riskSignal.upsert({
          where: {
            riskId_signalType_sourceType_sourceId: {
              riskId: risk.id,
              signalType: candidate.dedupeKey.split(":").at(-1) ?? "detected",
              sourceType: candidate.sourceType,
              sourceId: candidate.sourceId,
            },
          },
          create: {
            workspaceId: snapshot.workspace_id!,
            riskId: risk.id,
            signalType: candidate.dedupeKey.split(":").at(-1) ?? "detected",
            sourceType: candidate.sourceType,
            sourceId: candidate.sourceId,
            evidence: { rulesVersion: RISK_RULES_VERSION },
          },
          update: { evidence: { rulesVersion: RISK_RULES_VERSION } },
        }),
        transaction.riskAssessment.create({
          data: {
            workspaceId: snapshot.workspace_id!,
            riskId: risk.id,
            probability: risk.probability,
            impact: risk.impact,
            score: risk.score,
            level: risk.level,
            rulesVersion: RISK_RULES_VERSION,
          },
        }),
      ]);
    }
    await transaction.riskDetectionRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", detectedCount, completedAt: new Date() },
    });
    await recordWorkerEvent(transaction, snapshot, {
      eventName: "risk.detected.v1",
      aggregateType: "RiskDetectionRun",
      aggregateId: run.id,
      aggregateVersion: 1,
      deduplicationKey: `risk-detection-completed:${run.id}`,
      payload: {
        occurredAt: new Date().toISOString(),
        subject: { detectionRunId: run.id, detectedCount, riskIds },
        activity: {
          category: "risks",
          action: "risk_detection_completed",
          summary: `Analiza deterministă a detectat ${detectedCount} riscuri noi.`,
          entityType: "RiskDetectionRun",
          entityId: run.id,
        },
      },
    });
    return { detectionRunId: run.id, detectedCount, riskIds };
  });
}

async function processContingencySimulation(
  snapshot: PersistedConsumer,
  simulationId: string,
): Promise<Record<string, unknown>> {
  requireIntelligenceContext(snapshot, "CONTINGENCY_CONTEXT_INVALID");
  return withPersistedContext(snapshot, async (transaction) => {
    const simulation = await transaction.contingencySimulation.findFirst({
      where: {
        id: simulationId,
        workspaceId: snapshot.workspace_id!,
        backgroundJobId: snapshot.background_job_id!,
      },
    });
    if (!simulation)
      throw new PermanentJobError(
        "Contingency simulation does not match persisted job context",
        "CONTINGENCY_SIMULATION_CONTEXT_MISMATCH",
      );
    if (simulation.status === "COMPLETED")
      return simulation.result as Record<string, unknown>;
    const plan = await transaction.contingencyPlan.findFirst({
      where: { id: simulation.planId, workspaceId: snapshot.workspace_id! },
    });
    if (!plan)
      throw new PermanentJobError(
        "Contingency plan is missing",
        "CONTINGENCY_PLAN_MISSING",
      );
    const [triggers, actions] = await Promise.all([
      transaction.contingencyTrigger.findMany({
        where: { planId: plan.id, workspaceId: snapshot.workspace_id! },
      }),
      transaction.contingencyAction.findMany({
        where: { planId: plan.id, workspaceId: snapshot.workspace_id! },
        orderBy: { position: "asc" },
      }),
    ]);
    const result = {
      simulationId,
      planId: plan.id,
      outcome: actions.length > 0 ? "READY" : "INCOMPLETE",
      triggerCount: triggers.length,
      actionCount: actions.length,
      actions: actions.map((action) => ({
        id: action.id,
        title: action.title,
        position: action.position,
      })),
      warnings: actions.length ? [] : ["Planul nu are acțiuni executabile."],
      simulatedAt: new Date().toISOString(),
    };
    await transaction.contingencySimulation.update({
      where: { id: simulation.id },
      data: {
        status: "COMPLETED",
        result: result as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    return result;
  });
}

async function processAutomationTrigger(
  snapshot: PersistedConsumer,
  payload: ReturnType<typeof domainEventPayloadSchema.parse>,
): Promise<Record<string, unknown>> {
  requireWorkspaceActorContext(snapshot, "AUTOMATION_TRIGGER_CONTEXT_INVALID");
  return withPersistedContext(snapshot, async (transaction) => {
    const rules = await transaction.automationRule.findMany({
      where: { workspaceId: snapshot.workspace_id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" },
    });
    const subject = jsonRecord(payload.subject);
    const context = await automationTriggerContext(
      transaction,
      snapshot.workspace_id,
      snapshot.event_name,
      snapshot.aggregate_id,
      subject,
    );
    const triggered: string[] = [];
    for (const rule of rules) {
      if (!automationTriggerMatches(rule.triggerType, context)) continue;
      const conditions = await transaction.automationCondition.findMany({
        where: { workspaceId: snapshot.workspace_id, ruleId: rule.id },
        orderBy: { position: "asc" },
      });
      if (
        !conditions.every((condition) =>
          automationConditionMatches(
            condition.field,
            condition.operator,
            condition.value,
            context,
          ),
        )
      )
        continue;
      const idempotencyKey = `trigger:${rule.id}:${snapshot.outbox_message_id}`;
      const existing = await transaction.automationExecution.findUnique({
        where: {
          workspaceId_idempotencyKey: {
            workspaceId: snapshot.workspace_id,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        triggered.push(existing.id);
        continue;
      }
      const execution = await transaction.automationExecution.create({
        data: {
          workspaceId: snapshot.workspace_id,
          ruleId: rule.id,
          requestedById: rule.createdById,
          backgroundJobId: null,
          idempotencyKey,
          mode: "EXECUTE",
          status: rule.requiresApproval ? "WAITING_APPROVAL" : "QUEUED",
          sourceEventId: snapshot.outbox_message_id,
          recursionDepth: 1,
        },
      });
      triggered.push(execution.id);
      const eventSnapshot = {
        ...snapshot,
        actor_user_id: rule.createdById,
      };
      if (rule.requiresApproval) {
        await recordWorkerEvent(transaction, eventSnapshot, {
          eventName: "automation.approval_requested.v1",
          aggregateType: "AutomationExecution",
          aggregateId: execution.id,
          aggregateVersion: 1,
          deduplicationKey: `automation-approval-requested:${execution.id}`,
          payload: {
            occurredAt: new Date().toISOString(),
            subject: { executionId: execution.id, ruleId: rule.id },
            notification: {
              recipientUserId: rule.createdById,
              module: "automations",
              kind: "automation_approval_requested",
              priority: "high",
              title: "Automatizare în așteptarea aprobării",
              body: rule.name,
              actionUrl: "/automations",
            },
          },
        });
      } else {
        await recordWorkerEvent(transaction, eventSnapshot, {
          eventName: "automation.execution_requested.v1",
          aggregateType: "AutomationExecution",
          aggregateId: execution.id,
          aggregateVersion: 1,
          deduplicationKey: `automation-triggered-execution:${execution.id}`,
          payload: {
            occurredAt: new Date().toISOString(),
            subject: { executionId: execution.id, ruleId: rule.id },
            automationExecution: { executionId: execution.id },
          },
        });
      }
    }
    return { triggeredExecutions: triggered, count: triggered.length };
  });
}

async function automationTriggerContext(
  transaction: Prisma.TransactionClient,
  workspaceId: string,
  eventName: string,
  aggregateId: string,
  subject: Record<string, unknown>,
) {
  if (eventName.startsWith("task.")) {
    const task = await transaction.task.findFirst({
      where: { id: aggregateId, workspaceId, deletedAt: null },
    });
    return {
      resourceType: "Task",
      eventName,
      status: task?.status,
      priority: task?.priority,
      category: task?.category,
      daysUntilDue: task?.dueAt
        ? Math.ceil((task.dueAt.getTime() - Date.now()) / 86_400_000)
        : null,
      overdue: Boolean(
        task?.dueAt &&
        task.dueAt.getTime() < Date.now() &&
        !["COMPLETED", "ARCHIVED"].includes(task.status),
      ),
    };
  }
  if (eventName.startsWith("risk.")) {
    const riskId =
      typeof subject.riskId === "string" ? subject.riskId : aggregateId;
    const risk = await transaction.risk.findFirst({
      where: { id: riskId, workspaceId, deletedAt: null },
    });
    return {
      resourceType: "Risk",
      eventName,
      status: risk?.status,
      category: risk?.category,
      riskLevel: risk?.level,
      priority: risk?.level,
      overdue: false,
    };
  }
  return {
    resourceType: eventName.startsWith("timeline.") ? "Milestone" : "Other",
    eventName,
    overdue: false,
    ...subject,
  };
}

function automationTriggerMatches(
  triggerType: string,
  context: Record<string, unknown>,
) {
  if (triggerType === "TASK_OVERDUE")
    return context.resourceType === "Task" && context.overdue === true;
  if (triggerType === "RISK_LEVEL_CHANGED")
    return context.resourceType === "Risk";
  if (triggerType === "MILESTONE_APPROACHING")
    return context.resourceType === "Milestone";
  return false;
}

function automationConditionMatches(
  field: string,
  operator: string,
  expected: Prisma.JsonValue,
  context: Record<string, unknown>,
) {
  const actual = context[field];
  if (operator === "eq") return actual === expected;
  if (operator === "neq") return actual !== expected;
  if (operator === "gte") return Number(actual) >= Number(expected);
  if (operator === "lte") return Number(actual) <= Number(expected);
  if (operator === "in")
    return Array.isArray(expected) && expected.includes(actual as never);
  return false;
}

async function processWeeklyDigest(
  snapshot: PersistedConsumer,
  digestId: string,
): Promise<Record<string, unknown>> {
  requireIntelligenceContext(snapshot, "WEEKLY_DIGEST_CONTEXT_INVALID");
  const prepared = await withPersistedContext(snapshot, async (transaction) => {
    const digest = await transaction.weeklyIntelligenceDigest.findFirst({
      where: {
        id: digestId,
        workspaceId: snapshot.workspace_id,
        backgroundJobId: snapshot.background_job_id,
      },
    });
    if (!digest)
      throw new PermanentJobError(
        "Weekly digest does not match persisted context",
        "WEEKLY_DIGEST_CONTEXT_MISMATCH",
      );
    if (["COMPLETED", "DELIVERED"].includes(digest.status))
      return { completed: true as const, digest, metrics: digest.metrics };
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
    // Prisma interactive transactions use one connection. Keep the reads
    // sequential so this persisted RLS context never becomes a failed batch.
    const totalTasks = await transaction.task.count({
      where: { workspaceId: snapshot.workspace_id, deletedAt: null },
    });
    const completedTasks = await transaction.task.count({
      where: {
        workspaceId: snapshot.workspace_id,
        deletedAt: null,
        status: "COMPLETED",
      },
    });
    const overdueTasks = await transaction.task.count({
      where: {
        workspaceId: snapshot.workspace_id,
        deletedAt: null,
        dueAt: { lt: now },
        status: { notIn: ["COMPLETED", "ARCHIVED"] },
      },
    });
    const nextDeadlines = await transaction.task.count({
      where: {
        workspaceId: snapshot.workspace_id,
        deletedAt: null,
        dueAt: { gte: now, lte: weekEnd },
        status: { notIn: ["COMPLETED", "ARCHIVED"] },
      },
    });
    const rsvpSubmitted = await transaction.rsvpSubmission.count({
      where: { workspaceId: snapshot.workspace_id, status: "SUBMITTED" },
    });
    const rsvpTotal = await transaction.rsvpSubmission.count({
      where: { workspaceId: snapshot.workspace_id },
    });
    const bookings = await transaction.vendorBooking.count({
      where: { workspaceId: snapshot.workspace_id },
    });
    const contracts = await transaction.vendorContract.count({
      where: { workspaceId: snapshot.workspace_id },
    });
    const payments = await transaction.paymentRecord.count({
      where: { workspaceId: snapshot.workspace_id },
    });
    const highRisks = await transaction.risk.count({
      where: {
        workspaceId: snapshot.workspace_id,
        deletedAt: null,
        level: "HIGH",
        status: { notIn: ["RESOLVED", "ARCHIVED"] },
      },
    });
    const criticalRisks = await transaction.risk.count({
      where: {
        workspaceId: snapshot.workspace_id,
        deletedAt: null,
        level: "CRITICAL",
        status: { notIn: ["RESOLVED", "ARCHIVED"] },
      },
    });
    const activePlans = await transaction.contingencyPlan.count({
      where: { workspaceId: snapshot.workspace_id, status: "ACTIVE" },
    });
    const weddingDayPlans = await transaction.weddingDayPlan.count({
      where: { workspaceId: snapshot.workspace_id },
    });
    const workspace = await transaction.workspace.findUnique({
      where: { id: snapshot.workspace_id },
      select: { title: true, timezone: true },
    });
    const [recipient] = await transaction.$queryRaw<
      Array<{
        email: string;
        first_name: string;
        digest_email: boolean;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
        timezone: string;
      }>
    >`
      SELECT * FROM public.weddingos_get_weekly_digest_recipient(
        ${snapshot.workspace_id}::uuid,
        ${snapshot.actor_user_id}::uuid
      )
    `;
    const metrics = {
      planning: {
        totalTasks,
        completedTasks,
        progressPercent: totalTasks
          ? Math.round((completedTasks / totalTasks) * 100)
          : 0,
        overdueTasks,
        nextDeadlines,
      },
      rsvp: { submitted: rsvpSubmitted, total: rsvpTotal },
      commercial: { bookings, contracts, payments },
      risks: { high: highRisks, critical: criticalRisks },
      contingency: { activePlans },
      weddingDay: { plans: weddingDayPlans },
    };
    await transaction.weeklyIntelligenceDigest.update({
      where: { id: digestId },
      data: { status: "RUNNING", metrics: metrics as Prisma.InputJsonValue },
    });
    return {
      completed: false as const,
      digest,
      metrics,
      workspace,
      recipient,
    };
  });
  if (prepared.completed)
    return { digestId, status: "COMPLETED", metrics: prepared.metrics };

  let emailOutcome = "suppressed_by_preference";
  if (prepared.recipient?.digest_email !== false && prepared.recipient?.email) {
    const quiet = Boolean(
      prepared.recipient.quiet_hours_start &&
      prepared.recipient.quiet_hours_end &&
      isQuietTime(
        prepared.recipient.quiet_hours_start,
        prepared.recipient.quiet_hours_end,
        prepared.recipient.timezone,
        new Date(),
      ),
    );
    if (quiet) emailOutcome = "suppressed_by_quiet_hours";
    else {
      await sendEmail(
        {
          kind: "weekly-digest",
          recipient: prepared.recipient.email,
          values: {
            firstName: prepared.recipient.first_name,
            workspaceTitle: prepared.workspace?.title ?? "Sarbato",
            metrics: JSON.stringify(prepared.metrics),
          },
        },
        snapshot.execution_id,
      );
      emailOutcome = "sent";
    }
  }
  return withPersistedContext(snapshot, async (transaction) => {
    const completedAt = new Date();
    await transaction.weeklyIntelligenceDigest.update({
      where: { id: digestId },
      data: {
        status: emailOutcome === "sent" ? "DELIVERED" : "COMPLETED",
        completedAt,
        deliveredAt: emailOutcome === "sent" ? completedAt : null,
      },
    });
    await recordWorkerEvent(transaction, snapshot, {
      eventName: "digest.weekly_ready.v1",
      aggregateType: "WeeklyIntelligenceDigest",
      aggregateId: digestId,
      aggregateVersion: 1,
      deduplicationKey: `weekly-digest-ready:${digestId}`,
      payload: {
        occurredAt: completedAt.toISOString(),
        subject: { digestId, emailOutcome },
        notification: {
          recipientUserId: snapshot.actor_user_id,
          module: "digest",
          kind: "weekly_digest_ready",
          priority: "normal",
          title: "Rezumatul săptămânal este gata",
          body: `${prepared.metrics.planning.overdueTasks} taskuri întârziate și ${prepared.metrics.risks.critical} riscuri critice.`,
          actionUrl: "/overview",
        },
        activity: {
          category: "digest",
          action: "weekly_ready",
          summary: "Rezumatul săptămânal a fost generat din date canonice.",
          entityType: "WeeklyIntelligenceDigest",
          entityId: digestId,
        },
      },
    });
    if (emailOutcome === "sent")
      await recordWorkerEvent(transaction, snapshot, {
        eventName: "digest.weekly_delivered.v1",
        aggregateType: "WeeklyIntelligenceDigest",
        aggregateId: digestId,
        aggregateVersion: 1,
        deduplicationKey: `weekly-digest-delivered:${digestId}`,
        payload: {
          occurredAt: completedAt.toISOString(),
          subject: { digestId, channel: "EMAIL" },
          activity: {
            category: "digest",
            action: "weekly_delivered",
            summary: "Rezumatul săptămânal a fost livrat prin e-mail.",
            entityType: "WeeklyIntelligenceDigest",
            entityId: digestId,
          },
        },
      });
    return {
      digestId,
      status: "COMPLETED",
      metrics: prepared.metrics,
      emailOutcome,
    };
  });
}

async function processAutomationExecution(
  snapshot: PersistedConsumer,
  executionId: string,
): Promise<Record<string, unknown>> {
  requireWorkspaceActorContext(snapshot, "AUTOMATION_CONTEXT_INVALID");
  return withPersistedContext(snapshot, async (transaction) => {
    const execution = await transaction.automationExecution.findFirst({
      where: {
        id: executionId,
        workspaceId: snapshot.workspace_id!,
        backgroundJobId: snapshot.background_job_id,
      },
    });
    if (!execution)
      throw new PermanentJobError(
        "Automation execution does not match persisted job context",
        "AUTOMATION_EXECUTION_CONTEXT_MISMATCH",
      );
    if (execution.status === "COMPLETED")
      return execution.result as Record<string, unknown>;
    if (!automationRecursionAllowed(execution.recursionDepth))
      throw new PermanentJobError(
        "Automation recursion limit exceeded",
        "AUTOMATION_RECURSION_LIMIT",
      );
    const rule = await transaction.automationRule.findFirst({
      where: { id: execution.ruleId, workspaceId: snapshot.workspace_id! },
    });
    if (!rule)
      throw new PermanentJobError(
        "Automation rule is missing",
        "AUTOMATION_RULE_MISSING",
      );
    const actions = await transaction.automationAction.findMany({
      where: { ruleId: rule.id, workspaceId: snapshot.workspace_id! },
      orderBy: { position: "asc" },
    });
    await transaction.automationExecution.update({
      where: { id: execution.id },
      data: { status: "RUNNING", version: { increment: 1 } },
    });
    const preview = actions.map((action) => ({
      actionId: action.id,
      type: action.actionType,
      configuration: action.configuration,
    }));
    if (execution.mode === "DRY_RUN") {
      const result = {
        executionId,
        mode: "DRY_RUN",
        wouldExecute: preview,
        sideEffects: 0,
      };
      await transaction.automationExecution.update({
        where: { id: execution.id },
        data: {
          status: "COMPLETED",
          result: result as Prisma.InputJsonValue,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return result;
    }
    if (rule.status !== "ACTIVE")
      throw new PermanentJobError(
        "Only active automation rules may execute",
        "AUTOMATION_RULE_NOT_ACTIVE",
      );
    const resources: Array<{ type: string; id: string }> = [];
    for (const action of actions) {
      const dedupeKey = `automation-step:${execution.id}:${action.id}`;
      const existing = await transaction.automationExecutionStep.findUnique({
        where: { dedupeKey },
      });
      if (existing?.status === "COMPLETED") continue;
      const step = existing
        ? await transaction.automationExecutionStep.update({
            where: { id: existing.id },
            data: { status: "RUNNING", attempts: { increment: 1 } },
          })
        : await transaction.automationExecutionStep.create({
            data: {
              workspaceId: snapshot.workspace_id!,
              executionId: execution.id,
              actionId: action.id,
              status: "RUNNING",
              attempts: 1,
              dedupeKey,
              input: action.configuration as Prisma.InputJsonValue,
            },
          });
      const configuration = jsonRecord(action.configuration);
      let resource: { type: string; id: string } | null = null;
      if (action.actionType === "CREATE_TASK") {
        const created = await transaction.task.create({
          data: {
            workspaceId: snapshot.workspace_id!,
            title: safeAutomationText(configuration.title, rule.name),
            description: "Creat de o automatizare controlată Sarbato.",
            category: "automation",
            priority: "MEDIUM",
            createdById: execution.requestedById,
          },
        });
        resource = { type: "Task", id: created.id };
      } else if (action.actionType === "CREATE_RISK") {
        const created = await transaction.risk.create({
          data: {
            workspaceId: snapshot.workspace_id!,
            title: safeAutomationText(configuration.title, rule.name),
            description: "Detectat de o automatizare controlată Sarbato.",
            category: "OTHER",
            probability: 3,
            impact: 3,
            score: 9,
            level: "MEDIUM",
            source: "DETECTED",
            sourceType: "AutomationRule",
            sourceId: rule.id,
            dedupeKey,
            createdById: execution.requestedById,
          },
        });
        resource = { type: "Risk", id: created.id };
      } else if (action.actionType === "CREATE_CALENDAR_EVENT") {
        const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const created = await transaction.calendarEvent.create({
          data: {
            workspaceId: snapshot.workspace_id!,
            title: safeAutomationText(configuration.title, rule.name),
            eventType: "automation",
            startAt,
            endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
            allDay: false,
            timezone: "Europe/Chisinau",
            source: "manual",
            createdById: execution.requestedById,
          },
        });
        resource = { type: "CalendarEvent", id: created.id };
      } else if (action.actionType === "CREATE_NOTIFICATION") {
        await recordWorkerEvent(transaction, snapshot, {
          eventName: "automation.execution_completed.v1",
          aggregateType: "AutomationExecution",
          aggregateId: execution.id,
          aggregateVersion: 1,
          deduplicationKey: `automation-notification:${execution.id}:${action.id}`,
          payload: {
            occurredAt: new Date().toISOString(),
            subject: { executionId: execution.id, actionId: action.id },
            notification: {
              recipientUserId: execution.requestedById,
              module: "automations",
              kind: "automation_action",
              priority: "normal",
              title: safeAutomationText(configuration.title, rule.name),
              body: "O automatizare controlată a ajuns la acest pas.",
              actionUrl: "/automations",
            },
          },
        });
      } else if (action.actionType === "UPDATE_RISK_STATUS") {
        const riskId =
          typeof configuration.riskId === "string" ? configuration.riskId : "";
        const status =
          typeof configuration.status === "string" ? configuration.status : "";
        if (
          !riskId ||
          ![
            "OPEN",
            "MONITORING",
            "MITIGATING",
            "RESOLVED",
            "ACCEPTED",
          ].includes(status)
        )
          throw new PermanentJobError(
            "Automation risk status action is invalid",
            "AUTOMATION_ACTION_INVALID",
          );
        const risk = await transaction.risk.findFirst({
          where: {
            id: riskId,
            workspaceId: snapshot.workspace_id!,
            deletedAt: null,
          },
        });
        if (!risk)
          throw new PermanentJobError(
            "Automation risk does not match persisted workspace context",
            "AUTOMATION_ACTION_CONTEXT_MISMATCH",
          );
        const updated = await transaction.risk.update({
          where: { id: risk.id },
          data: {
            status: status as
              "OPEN" | "MONITORING" | "MITIGATING" | "RESOLVED" | "ACCEPTED",
            resolvedAt: status === "RESOLVED" ? new Date() : null,
            version: { increment: 1 },
          },
        });
        resource = { type: "Risk", id: updated.id };
      }
      if (resource) resources.push(resource);
      await transaction.automationExecutionStep.update({
        where: { id: step.id },
        data: {
          status: "COMPLETED",
          output: (resource ?? { noOp: true }) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    }
    const result = {
      executionId,
      mode: "EXECUTE",
      resources,
      completedSteps: actions.length,
    };
    await Promise.all([
      transaction.automationExecution.update({
        where: { id: execution.id },
        data: {
          status: "COMPLETED",
          result: result as Prisma.InputJsonValue,
          completedAt: new Date(),
          version: { increment: 1 },
        },
      }),
      transaction.automationRule.update({
        where: { id: rule.id },
        data: { lastExecutedAt: new Date() },
      }),
    ]);
    return result;
  });
}

function requireIntelligenceContext(
  snapshot: PersistedConsumer,
  code: string,
): asserts snapshot is PersistedConsumer & {
  workspace_id: string;
  actor_user_id: string;
  background_job_id: string;
} {
  if (
    !snapshot.workspace_id ||
    !snapshot.actor_user_id ||
    !snapshot.background_job_id
  )
    throw new PermanentJobError(
      "Intelligence consumer requires persisted workspace, actor and job",
      code,
    );
}

function requireWorkspaceActorContext(
  snapshot: PersistedConsumer,
  code: string,
): asserts snapshot is PersistedConsumer & {
  workspace_id: string;
  actor_user_id: string;
} {
  if (!snapshot.workspace_id || !snapshot.actor_user_id)
    throw new PermanentJobError(
      "Intelligence consumer requires persisted workspace and actor",
      code,
    );
}

async function recordWorkerEvent(
  transaction: Prisma.TransactionClient,
  snapshot: PersistedConsumer & {
    workspace_id: string;
    actor_user_id: string;
  },
  input: {
    eventName: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    deduplicationKey: string;
    payload: Record<string, unknown>;
  },
) {
  await transaction.$queryRaw`
    SELECT public.weddingos_record_worker_derived_event(
      ${input.eventName}, ${input.aggregateType}, ${input.aggregateId},
      CAST(${input.aggregateVersion} AS integer), ${snapshot.workspace_id}::uuid,
      ${snapshot.actor_user_id}::uuid, ${snapshot.correlation_id},
      ${input.deduplicationKey}, ${JSON.stringify(input.payload)}::jsonb
    )
  `;
}

function safeAutomationText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 180)
    : fallback.slice(0, 180);
}

async function completeConsumer(
  snapshot: PersistedConsumer,
  consumerName: OutboxConsumerName,
  payload: ReturnType<typeof domainEventPayloadSchema.parse>,
  emailResult?: { messageId: string; recipientReference: string },
  artifact?: PreparedArtifact,
  planningResult?: Record<string, unknown>,
  reminderResult?: Record<string, unknown>,
  slice3Result?: Record<string, unknown>,
  commercialResult?: Record<string, unknown>,
  secureCommerceResult?: Record<string, unknown>,
  trustMonetizationResult?: Record<string, unknown>,
  weddingDayResult?: Record<string, unknown>,
  intelligenceResult?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return withPersistedContext(snapshot, async (transaction) => {
    const output: Record<string, unknown> = {};
    if (consumerName === "email" && emailResult) {
      await transaction.deliveryAttempt.upsert({
        where: {
          consumerExecutionId_attemptNumber: {
            consumerExecutionId: snapshot.execution_id,
            attemptNumber: snapshot.attempt_number,
          },
        },
        create: {
          consumerExecutionId: snapshot.execution_id,
          backgroundJobId: snapshot.background_job_id,
          workspaceId: snapshot.workspace_id,
          vendorOrganizationId: snapshot.vendor_organization_id,
          sourceType: "outbox_consumer_execution",
          sourceId: snapshot.execution_id,
          provider: environment.EMAIL_PROVIDER,
          recipientReference: emailResult.recipientReference,
          attemptNumber: snapshot.attempt_number,
          outcome: "SUCCEEDED",
          providerMessageId: emailResult.messageId,
        },
        update: {
          outcome: "SUCCEEDED",
          providerMessageId: emailResult.messageId,
          errorClass: null,
          errorCode: null,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      await transaction.outboxMessage.update({
        where: { id: snapshot.outbox_message_id },
        data: { encryptedHeaders: null },
      });
      output.delivery = { providerMessageId: emailResult.messageId };
    }
    if (consumerName === "notification_projection") {
      if (!payload.notification)
        throw new PermanentJobError(
          "Notification projection contract missing",
          "NOTIFICATION_CONTRACT_MISSING",
        );
      const notification = await transaction.notification.upsert({
        where: { sourceEventId: snapshot.outbox_message_id },
        create: {
          userId: payload.notification.recipientUserId,
          workspaceId: snapshot.workspace_id,
          module: payload.notification.module ?? "system",
          kind: payload.notification.kind,
          priority: payload.notification.priority,
          title: payload.notification.title,
          body: payload.notification.body,
          actionUrl: payload.notification.actionUrl ?? null,
          sourceEventId: snapshot.outbox_message_id,
          deduplicationKey: notificationDedupeKey(snapshot.outbox_message_id),
        },
        update: {},
      });
      output.notificationId = notification.id;
    }
    if (consumerName === "activity_projection") {
      if (!payload.activity || !snapshot.workspace_id)
        throw new PermanentJobError(
          "Activity projection contract missing",
          "ACTIVITY_CONTRACT_MISSING",
        );
      const activity = await transaction.activityItem.upsert({
        where: {
          deduplicationKey: `activity:${snapshot.outbox_message_id}`,
        },
        create: {
          workspaceId: snapshot.workspace_id,
          actorUserId: snapshot.actor_user_id,
          actorName: payload.activity.actorName ?? null,
          category: payload.activity.category,
          action: payload.activity.action,
          summary: redactActivityText(payload.activity.summary),
          entityType: payload.activity.entityType ?? null,
          entityId: payload.activity.entityId ?? null,
          metadata: payload.activity.metadata
            ? (payload.activity.metadata as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          sourceEventId: snapshot.outbox_message_id,
          correlationId: snapshot.correlation_id,
          deduplicationKey: `activity:${snapshot.outbox_message_id}`,
          occurredAt: new Date(payload.occurredAt),
        },
        update: {},
      });
      output.activityId = activity.id;
    }
    if (
      (consumerName === "activity_export" ||
        consumerName === "privacy_export" ||
        consumerName === "planning_export" ||
        consumerName === "guest_export" ||
        consumerName === "menu_export" ||
        consumerName === "seating_export" ||
        consumerName === "transport_manifest" ||
        consumerName === "accommodation_rooming_list" ||
        consumerName === "contract_export" ||
        consumerName === "commercial_export" ||
        consumerName === "wedding_day_export") &&
      artifact
    ) {
      await transaction.generatedArtifact.update({
        where: { id: artifact.id },
        data: {
          status: "READY",
          sizeBytes: BigInt(artifact.sizeBytes),
          sha256: artifact.sha256,
          rowCount: artifact.rowCount,
          readyAt: new Date(),
          version: { increment: 1 },
        },
      });
      const artifactResult = {
        id: artifact.id,
        fileName: artifact.fileName,
        mediaType: artifact.mediaType,
        rowCount: artifact.rowCount,
        sizeBytes: artifact.sizeBytes,
        sha256: artifact.sha256,
        expiresAt: artifact.expiresAt.toISOString(),
        downloadUrl: `/api/v1/jobs/${snapshot.background_job_id}/artifact`,
      };
      output.artifact = artifactResult;
      if (consumerName === "privacy_export") {
        await transaction.dataSubjectRequest.update({
          where: { id: snapshot.aggregate_id },
          data: {
            status: "COMPLETED",
            artifactId: artifact.id,
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: { result: { artifact: artifactResult } },
        });
      }
    }
    if (consumerName === "plan_generation" && planningResult) {
      output.planGeneration = planningResult;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: {
            result: {
              planGeneration: planningResult,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    if (consumerName === "task_reminder" && reminderResult) {
      output.reminder = reminderResult;
    }
    if (slice3Result) {
      output.slice3 = slice3Result;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: { result: { slice3: slice3Result } as Prisma.InputJsonValue },
        });
      }
    }
    if (commercialResult) {
      output.commercial = commercialResult;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: {
            result: { commercial: commercialResult } as Prisma.InputJsonValue,
          },
        });
      }
    }
    if (trustMonetizationResult) {
      output.trustMonetization = trustMonetizationResult;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: {
            result: {
              trustMonetization: trustMonetizationResult,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    if (weddingDayResult) {
      output.weddingDay = weddingDayResult;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: {
            result: { weddingDay: weddingDayResult } as Prisma.InputJsonValue,
          },
        });
      }
    }
    if (intelligenceResult) {
      output.intelligence = intelligenceResult;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: {
            result: {
              intelligence: intelligenceResult,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    if (secureCommerceResult) {
      const secureStatus = String(secureCommerceResult.status ?? "");
      let recipientUserId: string | null = null;
      let kind = "secure_commerce_updated";
      let title = "Operațiune securizată actualizată";
      let body = `Statusul operațiunii este ${secureStatus || "actualizat"}.`;
      let actionUrl = "/overview";
      let category = "secure_commerce";
      let action = "secure_commerce_updated";
      if (consumerName === "document_scan") {
        const session = await transaction.fileUploadSession.findFirst({
          where: { storageObjectId: snapshot.aggregate_id },
          select: { userId: true, originalFileName: true },
        });
        recipientUserId = session?.userId ?? null;
        kind =
          secureStatus === "QUARANTINED"
            ? "document_quarantined"
            : "document_verified";
        title =
          secureStatus === "QUARANTINED"
            ? "Document mutat în carantină"
            : "Document verificat";
        body =
          secureStatus === "QUARANTINED"
            ? `${session?.originalFileName ?? "Fișierul"} a fost blocat de verificarea de securitate.`
            : `${session?.originalFileName ?? "Fișierul"} a trecut verificarea de securitate.`;
        actionUrl = "/documents";
        category = "documents";
        action = kind;
      } else if (snapshot.aggregate_type === "ElectronicSignatureEnvelope") {
        const envelope =
          await transaction.electronicSignatureEnvelope.findUnique({
            where: { id: snapshot.aggregate_id },
            select: { createdById: true },
          });
        recipientUserId = envelope?.createdById ?? null;
        kind = `signature_${secureStatus.toLowerCase()}`;
        title =
          secureStatus === "DECLINED"
            ? "Semnătura a fost refuzată"
            : secureStatus === "COMPLETED"
              ? "Contract semnat electronic"
              : "Status semnătură actualizat";
        body = `Envelope-ul de semnătură are statusul ${secureStatus}.`;
        actionUrl = "/contracts";
        category = "signature";
        action = kind;
      } else if (
        [
          "OnlinePaymentCheckout",
          "OnlinePaymentTransaction",
          "OnlinePaymentRefund",
        ].includes(snapshot.aggregate_type)
      ) {
        const checkout =
          snapshot.aggregate_type === "OnlinePaymentCheckout"
            ? await transaction.onlinePaymentCheckout.findUnique({
                where: { id: snapshot.aggregate_id },
                select: { createdById: true },
              })
            : snapshot.aggregate_type === "OnlinePaymentTransaction"
              ? await transaction.onlinePaymentTransaction
                  .findUnique({
                    where: { id: snapshot.aggregate_id },
                    select: { checkoutId: true },
                  })
                  .then((row) =>
                    row
                      ? transaction.onlinePaymentCheckout.findUnique({
                          where: { id: row.checkoutId },
                          select: { createdById: true },
                        })
                      : null,
                  )
              : await transaction.onlinePaymentRefund
                  .findUnique({
                    where: { id: snapshot.aggregate_id },
                    select: { requestedById: true },
                  })
                  .then((row) =>
                    row ? { createdById: row.requestedById } : null,
                  );
        recipientUserId = checkout?.createdById ?? null;
        kind = `payment_${secureStatus.toLowerCase()}`;
        title =
          secureStatus === "CAPTURED"
            ? "Plată confirmată de provider"
            : secureStatus === "FAILED"
              ? "Plata online a eșuat"
              : secureStatus.includes("REFUND") || secureStatus === "SUCCEEDED"
                ? "Refund actualizat"
                : "Status plată actualizat";
        body = `Operațiunea de plată are statusul ${secureStatus}.`;
        actionUrl = "/payments";
        category = "payments";
        action = kind;
      }
      if (recipientUserId && !payload.notification) {
        if (snapshot.workspace_id) {
          await transaction.notification.upsert({
            where: { sourceEventId: snapshot.outbox_message_id },
            create: {
              userId: recipientUserId,
              workspaceId: snapshot.workspace_id,
              module: category,
              kind,
              priority:
                secureStatus === "QUARANTINED" ||
                secureStatus === "FAILED" ||
                secureStatus === "DECLINED"
                  ? "high"
                  : "normal",
              title,
              body,
              actionUrl,
              sourceEventId: snapshot.outbox_message_id,
              deduplicationKey: `secure-notification:${snapshot.outbox_message_id}`,
            },
            update: {},
          });
        } else if (snapshot.vendor_organization_id) {
          await transaction.vendorNotification.upsert({
            where: {
              deduplicationKey: `secure-vendor-notification:${snapshot.outbox_message_id}`,
            },
            create: {
              vendorOrganizationId: snapshot.vendor_organization_id,
              userId: recipientUserId,
              kind,
              priority:
                secureStatus === "QUARANTINED" ||
                secureStatus === "FAILED" ||
                secureStatus === "DECLINED"
                  ? "high"
                  : "normal",
              title,
              body,
              actionUrl,
              sourceEventId: snapshot.outbox_message_id,
              deduplicationKey: `secure-vendor-notification:${snapshot.outbox_message_id}`,
            },
            update: {},
          });
        }
      }
      if (snapshot.workspace_id && !payload.activity) {
        await transaction.activityItem.upsert({
          where: { sourceEventId: snapshot.outbox_message_id },
          create: {
            workspaceId: snapshot.workspace_id,
            actorUserId: snapshot.actor_user_id,
            category,
            action,
            summary: body,
            entityType: snapshot.aggregate_type,
            entityId: snapshot.aggregate_id,
            metadata: { status: secureStatus },
            sourceEventId: snapshot.outbox_message_id,
            correlationId: snapshot.correlation_id,
            deduplicationKey: `secure-activity:${snapshot.outbox_message_id}`,
            occurredAt: new Date(payload.occurredAt),
          },
          update: {},
        });
      }
    }
    if (secureCommerceResult) {
      output.secureCommerce = secureCommerceResult;
      if (snapshot.background_job_id) {
        await transaction.backgroundJob.update({
          where: { id: snapshot.background_job_id },
          data: {
            result: {
              secureCommerce: secureCommerceResult,
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
    await transaction.outboxConsumerExecution.update({
      where: { id: snapshot.execution_id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        heartbeatAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        version: { increment: 1 },
      },
    });
    await transaction.$executeRaw`
      SELECT public.weddingos_reconcile_outbox(${snapshot.outbox_message_id}::uuid)
    `;
    return output;
  });
}

async function failConsumer(
  snapshot: PersistedConsumer,
  error: unknown,
): Promise<boolean> {
  const classified = classifyJobError(error);
  const terminal =
    !classified.retryable || snapshot.attempt_number >= snapshot.max_attempts;
  await withPersistedContext(snapshot, async (transaction) => {
    if (snapshot.consumer_name === "email") {
      await transaction.deliveryAttempt.upsert({
        where: {
          consumerExecutionId_attemptNumber: {
            consumerExecutionId: snapshot.execution_id,
            attemptNumber: snapshot.attempt_number,
          },
        },
        create: {
          consumerExecutionId: snapshot.execution_id,
          backgroundJobId: snapshot.background_job_id,
          workspaceId: snapshot.workspace_id,
          vendorOrganizationId: snapshot.vendor_organization_id,
          sourceType: "outbox_consumer_execution",
          sourceId: snapshot.execution_id,
          provider: environment.EMAIL_PROVIDER,
          recipientReference: "unavailable",
          attemptNumber: snapshot.attempt_number,
          outcome: terminal ? "PERMANENT_FAILURE" : "RETRYABLE_FAILURE",
          errorClass:
            error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
          errorCode: classified.code,
          errorMessage: classified.message,
        },
        update: {
          outcome: terminal ? "PERMANENT_FAILURE" : "RETRYABLE_FAILURE",
          errorClass:
            error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
          errorCode: classified.code,
          errorMessage: classified.message,
          finishedAt: new Date(),
        },
      });
      if (terminal) {
        await transaction.outboxMessage.update({
          where: { id: snapshot.outbox_message_id },
          data: { encryptedHeaders: null },
        });
      }
    }
    if (snapshot.consumer_name === "campaign_delivery") {
      const parsedPayload = domainEventPayloadSchema.safeParse(
        snapshot.payload,
      );
      const campaignRecipientId = parsedPayload.success
        ? parsedPayload.data.campaignDelivery?.campaignRecipientId
        : undefined;
      const recipient = campaignRecipientId
        ? await transaction.campaignRecipient.findFirst({
            where: {
              id: campaignRecipientId,
              workspaceId: snapshot.workspace_id!,
            },
          })
        : null;
      await transaction.deliveryAttempt.upsert({
        where: {
          consumerExecutionId_attemptNumber: {
            consumerExecutionId: snapshot.execution_id,
            attemptNumber: snapshot.attempt_number,
          },
        },
        create: {
          consumerExecutionId: snapshot.execution_id,
          workspaceId: snapshot.workspace_id,
          vendorOrganizationId: snapshot.vendor_organization_id,
          sourceType: "campaign_recipient",
          sourceId: campaignRecipientId ?? snapshot.execution_id,
          provider: environment.EMAIL_PROVIDER,
          recipientReference: recipient
            ? recipientReference(recipient.address)
            : "unavailable",
          attemptNumber: snapshot.attempt_number,
          outcome: terminal ? "PERMANENT_FAILURE" : "RETRYABLE_FAILURE",
          errorClass:
            error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
          errorCode: classified.code,
          errorMessage: classified.message,
        },
        update: {
          outcome: terminal ? "PERMANENT_FAILURE" : "RETRYABLE_FAILURE",
          errorClass:
            error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
          errorCode: classified.code,
          errorMessage: classified.message,
          finishedAt: new Date(),
        },
      });
      if (terminal && recipient) {
        const failedRecipient = await transaction.campaignRecipient.updateMany({
          where: {
            id: recipient.id,
            workspaceId: snapshot.workspace_id!,
            status: { in: ["PENDING", "QUEUED"] },
          },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            failureCode: classified.code.slice(0, 100),
            version: { increment: 1 },
          },
        });
        if (failedRecipient.count)
          await finalizeCampaignIfSettled(
            transaction,
            snapshot,
            recipient.campaignId,
          );
      }
    }
    if (terminal && snapshot.consumer_name === "rfq_delivery") {
      const parsedPayload = domainEventPayloadSchema.safeParse(
        snapshot.payload,
      );
      const recipientId = parsedPayload.success
        ? parsedPayload.data.rfqDelivery?.recipientId
        : undefined;
      if (
        recipientId &&
        snapshot.workspace_id &&
        snapshot.vendor_organization_id
      )
        await transaction.rfqRecipient.updateMany({
          where: {
            id: recipientId,
            workspaceId: snapshot.workspace_id,
            vendorOrganizationId: snapshot.vendor_organization_id,
            status: { in: ["PENDING", "QUEUED"] },
          },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            failureCode: classified.code.slice(0, 100),
            version: { increment: 1 },
          },
        });
    }
    if (terminal && snapshot.consumer_name === "guest_import") {
      const parsedPayload = domainEventPayloadSchema.safeParse(
        snapshot.payload,
      );
      const importId = parsedPayload.success
        ? parsedPayload.data.guestImport?.importId
        : undefined;
      if (importId)
        await transaction.guestImport.updateMany({
          where: { id: importId, workspaceId: snapshot.workspace_id! },
          data: { status: "FAILED", version: { increment: 1 } },
        });
    }
    await transaction.outboxConsumerExecution.update({
      where: { id: snapshot.execution_id },
      data: {
        status: terminal ? "DEAD_LETTER" : "FAILED",
        availableAt: terminal
          ? new Date()
          : new Date(
              Date.now() +
                retryDelayMs(
                  snapshot.attempt_number,
                  snapshot.execution_id.length,
                ),
            ),
        lockedAt: null,
        lockedBy: null,
        completedAt: terminal ? new Date() : null,
        lastErrorCode: classified.code,
        lastErrorMessage: classified.message,
        version: { increment: 1 },
      },
    });
    await transaction.$executeRaw`
      SELECT public.weddingos_reconcile_outbox(${snapshot.outbox_message_id}::uuid)
    `;
  });
  return terminal;
}

async function cleanupExpiredArtifacts(): Promise<void> {
  const rows = await database.$queryRaw<ExpiredArtifact[]>`
    SELECT * FROM public.weddingos_claim_expired_artifacts(${workerId}, 25)
  `;
  for (const row of rows) {
    try {
      assertStorageKey(row.storage_key);
      await unlink(join(artifactRoot, row.storage_key)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        },
      );
      await database.$executeRaw`
        SELECT public.weddingos_mark_artifact_deleted(${row.artifact_id}::uuid)
      `;
    } catch (error) {
      logger.warn({
        event: "artifact.cleanup_failed",
        artifactId: row.artifact_id,
        message: classifyJobError(error).message,
      });
    }
  }
}

function assertStorageKey(value: string): void {
  if (
    basename(value) !== value ||
    !/^[0-9a-f-]{36}\.(csv|xlsx|svg|html)$/i.test(value)
  )
    throw new PermanentJobError(
      "Managed artifact storage key is invalid",
      "ARTIFACT_KEY_INVALID",
    );
}

function csvCell(value: string): string {
  const formulaSafe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

async function sendEmail(
  command: EmailCommand,
  executionId: string,
): Promise<{ messageId: string }> {
  if (environment.EMAIL_PROVIDER === "console")
    return { messageId: `console-${executionId}` };
  const transporter = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(environment.SMTP_USER && environment.SMTP_PASSWORD
      ? {
          auth: {
            user: environment.SMTP_USER,
            pass: environment.SMTP_PASSWORD,
          },
        }
      : {}),
  });
  const content = renderEmail(command);
  const result = await transporter.sendMail({
    from: environment.EMAIL_FROM,
    to: command.recipient,
    messageId: `<${executionId}@weddingos.local>`,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
  return { messageId: String(result.messageId) };
}

async function sendCampaignEmail(
  recipient: string,
  subject: string,
  body: string,
  token: string,
  executionId: string,
  presentation: CampaignInvitationPresentation,
): Promise<{ messageId: string }> {
  if (environment.EMAIL_PROVIDER === "console")
    return { messageId: `console-campaign-${executionId}` };
  const transporter = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    ...(environment.SMTP_USER && environment.SMTP_PASSWORD
      ? {
          auth: {
            user: environment.SMTP_USER,
            pass: environment.SMTP_PASSWORD,
          },
        }
      : {}),
  });
  const url = `${environment.WEB_URL}/guest?token=${encodeURIComponent(token)}`;
  const content = renderCampaignInvitationEmail({ body, url, presentation });
  const result = await transporter.sendMail({
    from: environment.EMAIL_FROM,
    to: recipient,
    messageId: `<campaign-${executionId}@weddingos.local>`,
    // Resend SMTP honors this provider-side idempotency key for 24 hours, so
    // a crash after provider acceptance can safely retry without a duplicate.
    headers: { "Resend-Idempotency-Key": `campaign/${executionId}` },
    subject: subject.slice(0, 180),
    text: content.text,
    html: content.html,
  });
  return { messageId: String(result.messageId) };
}

async function sendTaskReminderEmail(
  recipient: string,
  firstName: string,
  taskTitle: string,
  taskId: string,
  executionId: string,
): Promise<{ messageId: string }> {
  if (environment.EMAIL_PROVIDER === "console")
    return { messageId: `console-reminder-${executionId}` };
  const transporter = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: environment.SMTP_PORT,
    secure: false,
    ...(environment.SMTP_USER && environment.SMTP_PASSWORD
      ? {
          auth: {
            user: environment.SMTP_USER,
            pass: environment.SMTP_PASSWORD,
          },
        }
      : {}),
  });
  const url = `${environment.WEB_URL}/plan?task=${encodeURIComponent(taskId)}`;
  const text = `Salut, ${firstName}. Reminder Sarbato: ${taskTitle}. Deschide sarcina: ${url}`;
  const result = await transporter.sendMail({
    from: environment.EMAIL_FROM,
    to: recipient,
    messageId: `<task-reminder-${executionId}@weddingos.local>`,
    subject: `Reminder: ${taskTitle}`,
    text,
    html: `<p>${escapeHtml(text)}</p>`,
  });
  return { messageId: String(result.messageId) };
}

function isQuietTime(
  start: string,
  end: string,
  timezone: string,
  now: Date,
): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );
  const current = hour * 60 + minute;
  const parse = (value: string) => {
    const [hours = "0", minutes = "0"] = value.split(":");
    return Number(hours) * 60 + Number(minutes);
  };
  const from = parse(start);
  const to = parse(end);
  return from <= to
    ? current >= from && current < to
    : current >= from || current < to;
}

function renderEmail(command: EmailCommand): {
  subject: string;
  text: string;
  html: string;
} {
  const v = command.values;
  const firstName = v.firstName ?? "";
  if (command.kind === "email-verification") {
    const url = `${environment.WEB_URL}/verify-email?token=${encodeURIComponent(v.token ?? "")}&email=${encodeURIComponent(command.recipient)}`;
    return emailContent(
      "Confirmă adresa de email Sarbato",
      `Salut, ${firstName}. Codul tău este ${v.code ?? ""}. Confirmă contul: ${url}`,
    );
  }
  if (command.kind === "password-reset") {
    const url = `${environment.WEB_URL}/reset-password?token=${encodeURIComponent(v.token ?? "")}`;
    return emailContent(
      "Resetează parola Sarbato",
      `Salut, ${firstName}. Resetează parola folosind linkul: ${url}`,
    );
  }
  if (command.kind === "password-changed")
    return emailContent(
      "Parola Sarbato a fost schimbată",
      `Salut, ${firstName}. Parola contului tău a fost schimbată.`,
    );
  if (command.kind === "magic-link") {
    const url = `${environment.WEB_URL}/magic-link?token=${encodeURIComponent(v.token ?? "")}`;
    return emailContent(
      "Linkul tău magic Sarbato",
      `Salut, ${firstName}. Conectează-te folosind linkul: ${url}`,
    );
  }
  if (command.kind === "vendor-invitation") {
    const url = `${environment.WEB_URL}/vendor-invitation?token=${encodeURIComponent(v.token ?? "")}`;
    return emailContent(
      `Invitație în ${v.organizationName ?? "Vendor OS"}`,
      `Ai fost invitat în organizația ${v.organizationName ?? "Vendor OS"} cu rolul ${v.roleName ?? "colaborator"}. Acceptă invitația: ${url}`,
    );
  }
  if (command.kind === "weekly-digest") {
    const metrics = (() => {
      try {
        return JSON.parse(v.metrics ?? "{}") as {
          planning?: {
            progressPercent?: number;
            overdueTasks?: number;
            nextDeadlines?: number;
          };
          risks?: { high?: number; critical?: number };
        };
      } catch {
        return {};
      }
    })();
    return emailContent(
      `Rezumat săptămânal — ${v.workspaceTitle ?? "Sarbato"}`,
      `Salut, ${firstName}. Progres: ${metrics.planning?.progressPercent ?? 0}%. Taskuri întârziate: ${metrics.planning?.overdueTasks ?? 0}. Deadline-uri în următoarele 7 zile: ${metrics.planning?.nextDeadlines ?? 0}. Riscuri high/critical: ${metrics.risks?.high ?? 0}/${metrics.risks?.critical ?? 0}.`,
    );
  }
  const url = `${environment.WEB_URL}/invitation?token=${encodeURIComponent(v.token ?? "")}`;
  return emailContent(
    `Invitație în ${v.workspaceTitle ?? "Sarbato"}`,
    `${v.inviterName ?? "Un colaborator"} te-a invitat în ${v.workspaceTitle ?? "Sarbato"} cu rolul ${v.roleName ?? "colaborator"}. ${url}`,
  );
}

function emailContent(subject: string, text: string) {
  return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

function redisConnection(value: string): ConnectionOptions {
  const url = new URL(value);
  const databaseNumber = url.pathname.slice(1);
  const database = databaseNumber ? Number(databaseNumber) : undefined;
  if (
    database !== undefined &&
    (!Number.isInteger(database) || database < 0 || database > 15)
  )
    throw new Error("REDIS_URL database index must be an integer from 0 to 15");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(database !== undefined ? { db: database } : {}),
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: url.password } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

function recipientReference(recipient: string): string {
  return createHash("sha256")
    .update(recipient.trim().toLowerCase())
    .digest("hex");
}

function inferGuestImportMapping(headers: string[]): Record<string, string> {
  const normalized = new Map(
    headers.map((header) => [normalizeHeader(header), header]),
  );
  const aliases: Record<string, string[]> = {
    firstName: ["firstname", "first_name", "prenume", "nume_mic"],
    lastName: ["lastname", "last_name", "nume", "surname"],
    email: ["email", "e_mail", "mail"],
    phone: ["phone", "telefon", "mobile", "mobil"],
    household: ["household", "familie", "family", "grup"],
  };
  return Object.fromEntries(
    Object.entries(aliases)
      .map(
        ([key, values]) =>
          [
            key,
            values.map((value) => normalized.get(value)).find(Boolean),
          ] as const,
      )
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
}

function normalizeImportedGuest(
  raw: Record<string, unknown>,
  mapping: Record<string, string>,
) {
  const value = (key: string) => {
    const header = mapping[key];
    return header ? String(raw[header] ?? "").trim() : "";
  };
  const phoneValue = value("phone").replace(/[^\d+]/g, "");
  return {
    firstName: value("firstName"),
    lastName: value("lastName"),
    email: value("email").toLowerCase(),
    phone: phoneValue
      ? phoneValue.startsWith("+")
        ? phoneValue
        : `+${phoneValue}`
      : "",
    household: value("household"),
  };
}

function redactImportRow(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => {
      const header = normalizeHeader(key);
      const text = String(value ?? "");
      if (header.includes("email") || header === "mail") {
        const [local, domain] = text.split("@");
        return [
          key,
          domain ? `${local?.slice(0, 1) ?? "*"}***@${domain}` : "[redacted]",
        ];
      }
      if (
        header.includes("phone") ||
        header.includes("telefon") ||
        header.includes("mobil")
      )
        return [key, text ? `***${text.replace(/\D/g, "").slice(-3)}` : ""];
      return [key, text ? "[available]" : ""];
    }),
  );
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isoDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

const bullWorker = new Worker<DomainEventJob>(
  DOMAIN_EVENT_QUEUE,
  processConsumer,
  { connection, concurrency: 5, lockDuration: 120_000 },
);
bullWorker.on("error", (error) =>
  logger.error({
    event: "worker.error",
    message: classifyJobError(error).message,
  }),
);
bullWorker.on("failed", (job, error) =>
  logger.warn({
    event: "worker.job_failed",
    executionId: job?.data.consumerExecutionId,
    message: classifyJobError(error).message,
  }),
);

const dispatchTimer = setInterval(
  () =>
    void dispatch().catch((error) =>
      logger.warn({
        event: "dispatcher.failed",
        message: classifyJobError(error).message,
      }),
    ),
  750,
);
const heartbeatTimer = setInterval(
  () =>
    void heartbeat().catch((error) =>
      logger.warn({
        event: "heartbeat.failed",
        message: classifyJobError(error).message,
      }),
    ),
  10_000,
);
const artifactCleanupTimer = setInterval(
  () => void cleanupExpiredArtifacts(),
  environment.NODE_ENV === "test" ? 1_000 : 60_000,
);
let scheduledAutomationScanRunning = false;
type DueBackupSchedule = {
  id: string;
  key: string;
  backup_type: string;
  retention_days: number;
  minimum_verified: number;
};

async function scheduleDueBackup(): Promise<void> {
  if (stopping || process.env.BACKUP_SCHEDULER_ENABLED !== "true") return;
  const claimed = await database.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<DueBackupSchedule[]>`
      SELECT id, key, backup_type, retention_days, minimum_verified
      FROM backup_schedules
      WHERE environment = ${environment.NODE_ENV}
        AND enabled = true
        AND next_run_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at < now())
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    const schedule = rows[0];
    if (!schedule) return null;
    const grant = await transaction.platformGrant.findFirst({
      where: { environment: environment.NODE_ENV, active: true },
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    });
    if (!grant) throw new Error("BACKUP_SCHEDULER_NO_PLATFORM_ACTOR");
    const period = schedule.key.startsWith("weekly")
      ? isoWeekKey(new Date())
      : new Date().toISOString().slice(0, 10);
    const idempotencyKey = `scheduled:${schedule.key}:${period}`;
    const existing = await transaction.backupRun.findUnique({
      where: {
        environment_idempotencyKey: {
          environment: environment.NODE_ENV,
          idempotencyKey,
        },
      },
    });
    await transaction.backupSchedule.update({
      where: { id: schedule.id },
      data: {
        leaseOwner: workerId,
        leaseExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        lastRunAt: new Date(),
        nextRunAt: nextBackupRun(schedule.key),
        version: { increment: 1 },
      },
    });
    if (existing) return null;
    const run = await transaction.backupRun.create({
      data: {
        environment: environment.NODE_ENV,
        requestedById: grant.userId,
        idempotencyKey,
        backupType: schedule.backup_type,
        status: "RUNNING",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + schedule.retention_days * 86_400_000),
        manifest: {
          scheduleKey: schedule.key,
          dedupePeriod: period,
          destination: "SEPARATE_LOCAL_DESTINATION",
        },
      },
    });
    return { schedule, runId: run.id };
  });
  if (!claimed) return;

  try {
    const { stdout } = await execFileAsync(
      resolve(process.cwd(), "ops/backup/run-scheduled-backup.sh"),
      [],
      {
        cwd: process.cwd(),
        timeout: 90 * 60 * 1000,
        env: {
          ...process.env,
          BACKUP_SCHEDULE_KEY: claimed.schedule.key,
        },
        maxBuffer: 2_000_000,
      },
    );
    const matches = stdout.match(/verified\s+([^\n]+)/g);
    const verifiedPath = matches
      ?.at(-1)
      ?.replace(/^verified\s+/, "")
      .trim();
    if (!verifiedPath) throw new Error("BACKUP_VERIFICATION_PATH_MISSING");
    const manifest = JSON.parse(
      await readFile(resolve(verifiedPath, "manifest.json"), "utf8"),
    ) as {
      database: {
        artifact: string;
        checksumSha256: string;
        sizeBytes: number;
        encryptionKeyId: string;
        toolVersion: string;
      };
      objectStorage: {
        status: string;
        artifact: string;
        checksumSha256: string;
        sizeBytes: number;
        encryptionKeyId: string;
        inventorySha256: string;
      };
      schema: { latestMigration: string };
      destination: Record<string, unknown>;
    };
    await database.$transaction(async (transaction) => {
      await transaction.backupArtifact.create({
        data: {
          backupRunId: claimed.runId,
          kind: "DATABASE",
          storageKey: resolve(verifiedPath, manifest.database.artifact),
          checksumSha256: manifest.database.checksumSha256,
          sizeBytes: BigInt(manifest.database.sizeBytes),
          encryptionKeyId: manifest.database.encryptionKeyId,
          metadata: { toolVersion: manifest.database.toolVersion },
        },
      });
      if (manifest.objectStorage.status === "INCLUDED") {
        await transaction.backupArtifact.create({
          data: {
            backupRunId: claimed.runId,
            kind: "OBJECTS",
            storageKey: resolve(verifiedPath, manifest.objectStorage.artifact),
            checksumSha256: manifest.objectStorage.checksumSha256,
            sizeBytes: BigInt(manifest.objectStorage.sizeBytes),
            encryptionKeyId: manifest.objectStorage.encryptionKeyId,
            metadata: {
              inventorySha256: manifest.objectStorage.inventorySha256,
            },
          },
        });
      }
      await transaction.backupVerification.create({
        data: {
          backupRunId: claimed.runId,
          status: "VERIFIED",
          checks: JSON.parse(
            JSON.stringify({
              database: true,
              objects: manifest.objectStorage.status,
              destination: manifest.destination,
              noOverlap: true,
            }),
          ) as Prisma.InputJsonValue,
        },
      });
      await transaction.backupRun.update({
        where: { id: claimed.runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          migrationName: manifest.schema.latestMigration,
          manifest: manifest as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      await transaction.backupSchedule.update({
        where: { id: claimed.schedule.id },
        data: {
          lastSuccessfulAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
    });
    logger.info({
      event: "backup.scheduled_verified",
      schedule: claimed.schedule.key,
      runId: claimed.runId,
      destination: "SEPARATE_LOCAL_DESTINATION",
    });
  } catch (error) {
    const message = classifyJobError(error).message;
    await database.$transaction(async (transaction) => {
      await transaction.backupRun.update({
        where: { id: claimed.runId },
        data: {
          status: "FAILED",
          errorRedacted: message.slice(0, 1000),
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await transaction.backupSchedule.update({
        where: { id: claimed.schedule.id },
        data: {
          leaseOwner: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
    });
    logger.error({
      event: "backup.scheduled_failed",
      schedule: claimed.schedule.key,
      runId: claimed.runId,
      message,
    });
  }
}

function nextBackupRun(key: string) {
  const interval = key.startsWith("weekly") ? 7 : 1;
  return new Date(Date.now() + interval * 86_400_000);
}

function isoWeekKey(date: Date) {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const backupSchedulerTimer = setInterval(
  () =>
    void scheduleDueBackup().catch((error) =>
      logger.error({
        event: "backup.scheduler_failed",
        message: classifyJobError(error).message,
      }),
    ),
  environment.NODE_ENV === "test" ? 5_000 : 60_000,
);

async function scheduleDueAutomations(): Promise<void> {
  if (stopping || scheduledAutomationScanRunning) return;
  scheduledAutomationScanRunning = true;
  try {
    const rows = await database.$queryRaw<Array<{ scheduled: number }>>`
      SELECT public.weddingos_schedule_due_automations(50) AS scheduled
    `;
    const scheduled = Number(rows[0]?.scheduled ?? 0);
    if (scheduled > 0)
      logger.info({ event: "automation.scheduled", count: scheduled });
  } finally {
    scheduledAutomationScanRunning = false;
  }
}
const scheduledAutomationTimer = setInterval(
  () =>
    void scheduleDueAutomations().catch((error) =>
      logger.warn({
        event: "automation.scheduler_failed",
        message: classifyJobError(error).message,
      }),
    ),
  environment.NODE_ENV === "test" ? 1_000 : 60_000,
);
let marketingSnapshotRefreshRunning = false;
async function refreshMarketingSnapshot(): Promise<void> {
  if (stopping || marketingSnapshotRefreshRunning) return;
  marketingSnapshotRefreshRunning = true;
  try {
    const outcome = await refreshPublicProductProofSnapshot({
      database,
      environment,
      workerId,
    });
    logger.info({ event: "marketing_snapshot.refreshed", outcome });
  } finally {
    marketingSnapshotRefreshRunning = false;
  }
}
const marketingSnapshotTimer = setInterval(
  () =>
    void refreshMarketingSnapshot().catch((error) =>
      logger.warn({
        event: "marketing_snapshot.failed",
        message: classifyJobError(error).message,
      }),
    ),
  environment.MARKETING_SNAPSHOT_INTERVAL_SECONDS * 1_000,
);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(dispatchTimer);
  clearInterval(heartbeatTimer);
  clearInterval(artifactCleanupTimer);
  clearInterval(backupSchedulerTimer);
  clearInterval(scheduledAutomationTimer);
  clearInterval(marketingSnapshotTimer);
  logger.info({ event: "worker.shutdown", signal });
  await bullWorker.close(false);
  await queue.close();
  await database.$disconnect();
  await shutdownTelemetry();
  process.exitCode = 0;
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

async function start(): Promise<void> {
  const identity = await database.$queryRaw<
    Array<{ databasePurpose: string; environment: string }>
  >`SELECT database_purpose AS "databasePurpose", environment
    FROM database_identities WHERE id = 'singleton'`;
  if (
    identity[0]?.databasePurpose !== environment.DATABASE_PURPOSE ||
    identity[0]?.environment !== environment.NODE_ENV
  ) {
    throw new Error(
      `DATABASE_IDENTITY_MISMATCH expected=${environment.NODE_ENV}/${environment.DATABASE_PURPOSE} actual=${identity[0]?.environment ?? "missing"}/${identity[0]?.databasePurpose ?? "missing"}`,
    );
  }
  await heartbeat();
  await dispatch();
  await cleanupExpiredArtifacts();
  await scheduleDueAutomations().catch((error) =>
    logger.warn({
      event: "automation.scheduler_startup_failed",
      message: classifyJobError(error).message,
    }),
  );
  await refreshMarketingSnapshot().catch((error) =>
    logger.warn({
      event: "marketing_snapshot.startup_failed",
      message: classifyJobError(error).message,
    }),
  );
  logger.info({
    event: "worker.started",
    workerId,
    queue: DOMAIN_EVENT_QUEUE,
    contract: DOMAIN_EVENT_JOB,
  });
}

void start().catch(async (error) => {
  logger.fatal({
    event: "worker.start_failed",
    message: classifyJobError(error).message,
  });
  await shutdown("START_FAILURE");
  process.exitCode = 1;
});
