import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import {
  asyncEventNameSchema,
  domainEventPayloadSchema,
  encryptCommand,
  selectOutboxConsumers,
  type EmailCommand,
} from "@weddingos/jobs";
import { API_ENVIRONMENT } from "../common/environment.module";
import { currentTraceCarrier } from "../telemetry";

export type AsyncIntent = {
  eventName: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion?: number;
  workspaceId?: string;
  vendorOrganizationId?: string;
  actorUserId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  deduplicationKey: string;
  payload?: Record<string, unknown>;
  email?: EmailCommand;
  maxAttempts?: number;
  userVisibleJob?: boolean;
  availableAt?: Date;
};

@Injectable()
export class AsyncService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async record(
    transaction: Prisma.TransactionClient,
    intent: AsyncIntent,
  ): Promise<string | null> {
    const eventName = asyncEventNameSchema.parse(intent.eventName);
    const existing = await transaction.outboxMessage.findUnique({
      where: { deduplicationKey: intent.deduplicationKey },
      select: { backgroundJobId: true },
    });
    if (existing) return existing.backgroundJobId;
    const correlationId = intent.correlationId ?? randomUUID();
    const maxAttempts = intent.maxAttempts ?? 5;
    const payload = domainEventPayloadSchema.parse({
      occurredAt: new Date().toISOString(),
      subject: intent.payload?.subject ?? {},
      trace: currentTraceCarrier(),
      ...(intent.payload?.notification
        ? { notification: intent.payload.notification }
        : {}),
      ...(intent.payload?.activity
        ? { activity: intent.payload.activity }
        : {}),
      ...(intent.payload?.export ? { export: intent.payload.export } : {}),
      ...(intent.payload?.privacyExport
        ? { privacyExport: intent.payload.privacyExport }
        : {}),
      ...(intent.payload?.planGeneration
        ? { planGeneration: intent.payload.planGeneration }
        : {}),
      ...(intent.payload?.reminder
        ? { reminder: intent.payload.reminder }
        : {}),
      ...(intent.payload?.planningExport
        ? { planningExport: intent.payload.planningExport }
        : {}),
      ...(intent.payload?.guestImport
        ? { guestImport: intent.payload.guestImport }
        : {}),
      ...(intent.payload?.guestExport
        ? { guestExport: intent.payload.guestExport }
        : {}),
      ...(intent.payload?.campaignFanout
        ? { campaignFanout: intent.payload.campaignFanout }
        : {}),
      ...(intent.payload?.campaignDelivery
        ? { campaignDelivery: intent.payload.campaignDelivery }
        : {}),
      ...(intent.payload?.campaignSummary
        ? { campaignSummary: intent.payload.campaignSummary }
        : {}),
      ...(intent.payload?.invitationOpen
        ? { invitationOpen: intent.payload.invitationOpen }
        : {}),
      ...(intent.payload?.rsvpProjection
        ? { rsvpProjection: intent.payload.rsvpProjection }
        : {}),
      ...(intent.payload?.rsvpReminder
        ? { rsvpReminder: intent.payload.rsvpReminder }
        : {}),
      ...(intent.payload?.menuExport
        ? { menuExport: intent.payload.menuExport }
        : {}),
      ...(intent.payload?.seatingSuggestion
        ? { seatingSuggestion: intent.payload.seatingSuggestion }
        : {}),
      ...(intent.payload?.seatingIssueProjection
        ? { seatingIssueProjection: intent.payload.seatingIssueProjection }
        : {}),
      ...(intent.payload?.seatingExport
        ? { seatingExport: intent.payload.seatingExport }
        : {}),
      ...(intent.payload?.transportIssueProjection
        ? { transportIssueProjection: intent.payload.transportIssueProjection }
        : {}),
      ...(intent.payload?.transportManifest
        ? { transportManifest: intent.payload.transportManifest }
        : {}),
      ...(intent.payload?.accommodationIssueProjection
        ? {
            accommodationIssueProjection:
              intent.payload.accommodationIssueProjection,
          }
        : {}),
      ...(intent.payload?.accommodationRoomingList
        ? { accommodationRoomingList: intent.payload.accommodationRoomingList }
        : {}),
      ...(intent.payload?.guestOperationsProjection
        ? {
            guestOperationsProjection: intent.payload.guestOperationsProjection,
          }
        : {}),
      ...(intent.payload?.rfqDelivery
        ? { rfqDelivery: intent.payload.rfqDelivery }
        : {}),
      ...(intent.payload?.offerProjection
        ? { offerProjection: intent.payload.offerProjection }
        : {}),
      ...(intent.payload?.bookingProjection
        ? { bookingProjection: intent.payload.bookingProjection }
        : {}),
      ...(intent.payload?.contractProjection
        ? { contractProjection: intent.payload.contractProjection }
        : {}),
      ...(intent.payload?.contractExport
        ? { contractExport: intent.payload.contractExport }
        : {}),
      ...(intent.payload?.budgetProjection
        ? { budgetProjection: intent.payload.budgetProjection }
        : {}),
      ...(intent.payload?.paymentProjection
        ? { paymentProjection: intent.payload.paymentProjection }
        : {}),
      ...(intent.payload?.paymentReminder
        ? { paymentReminder: intent.payload.paymentReminder }
        : {}),
      ...(intent.payload?.commercialExport
        ? { commercialExport: intent.payload.commercialExport }
        : {}),
      ...(intent.payload?.vendorNotificationProjection
        ? {
            vendorNotificationProjection:
              intent.payload.vendorNotificationProjection,
          }
        : {}),
      ...(intent.payload?.documentScan
        ? { documentScan: intent.payload.documentScan }
        : {}),
      ...(intent.payload?.documentDerivative
        ? { documentDerivative: intent.payload.documentDerivative }
        : {}),
      ...(intent.payload?.documentCleanup
        ? { documentCleanup: intent.payload.documentCleanup }
        : {}),
      ...(intent.payload?.documentRetention
        ? { documentRetention: intent.payload.documentRetention }
        : {}),
      ...(intent.payload?.documentNotificationProjection
        ? {
            documentNotificationProjection:
              intent.payload.documentNotificationProjection,
          }
        : {}),
      ...(intent.payload?.documentTextExtraction
        ? { documentTextExtraction: intent.payload.documentTextExtraction }
        : {}),
      ...(intent.payload?.signatureEnvelopeCreate
        ? { signatureEnvelopeCreate: intent.payload.signatureEnvelopeCreate }
        : {}),
      ...(intent.payload?.signatureEnvelopeSend
        ? { signatureEnvelopeSend: intent.payload.signatureEnvelopeSend }
        : {}),
      ...(intent.payload?.signatureStatusProjection
        ? {
            signatureStatusProjection: intent.payload.signatureStatusProjection,
          }
        : {}),
      ...(intent.payload?.signatureEvidenceDownload
        ? {
            signatureEvidenceDownload: intent.payload.signatureEvidenceDownload,
          }
        : {}),
      ...(intent.payload?.paymentCheckoutCreate
        ? { paymentCheckoutCreate: intent.payload.paymentCheckoutCreate }
        : {}),
      ...(intent.payload?.paymentStatusProjection
        ? { paymentStatusProjection: intent.payload.paymentStatusProjection }
        : {}),
      ...(intent.payload?.paymentRefund
        ? { paymentRefund: intent.payload.paymentRefund }
        : {}),
      ...(intent.payload?.paymentReconciliation
        ? { paymentReconciliation: intent.payload.paymentReconciliation }
        : {}),
      ...(intent.payload?.weddingDayLive
        ? { weddingDayLive: intent.payload.weddingDayLive }
        : {}),
      ...(intent.payload?.weddingDayReminder
        ? { weddingDayReminder: intent.payload.weddingDayReminder }
        : {}),
      ...(intent.payload?.incidentEscalation
        ? { incidentEscalation: intent.payload.incidentEscalation }
        : {}),
      ...(intent.payload?.announcementDelivery
        ? { announcementDelivery: intent.payload.announcementDelivery }
        : {}),
      ...(intent.payload?.announcementSummary
        ? { announcementSummary: intent.payload.announcementSummary }
        : {}),
      ...(intent.payload?.checkInProjection
        ? { checkInProjection: intent.payload.checkInProjection }
        : {}),
      ...(intent.payload?.checkInOfflineSync
        ? { checkInOfflineSync: intent.payload.checkInOfflineSync }
        : {}),
      ...(intent.payload?.attendanceProjection
        ? { attendanceProjection: intent.payload.attendanceProjection }
        : {}),
      ...(intent.payload?.guestMomentScan
        ? { guestMomentScan: intent.payload.guestMomentScan }
        : {}),
      ...(intent.payload?.guestMomentDerivative
        ? { guestMomentDerivative: intent.payload.guestMomentDerivative }
        : {}),
      ...(intent.payload?.guestMomentModerationProjection
        ? {
            guestMomentModerationProjection:
              intent.payload.guestMomentModerationProjection,
          }
        : {}),
      ...(intent.payload?.galleryProjection
        ? { galleryProjection: intent.payload.galleryProjection }
        : {}),
      ...(intent.payload?.weddingDayExport
        ? { weddingDayExport: intent.payload.weddingDayExport }
        : {}),
      ...(intent.payload?.copilotRun
        ? { copilotRun: intent.payload.copilotRun }
        : {}),
      ...(intent.payload?.riskDetection
        ? { riskDetection: intent.payload.riskDetection }
        : {}),
      ...(intent.payload?.contingencySimulation
        ? { contingencySimulation: intent.payload.contingencySimulation }
        : {}),
      ...(intent.payload?.automationExecution
        ? { automationExecution: intent.payload.automationExecution }
        : {}),
      ...(intent.payload?.weeklyDigest
        ? { weeklyDigest: intent.payload.weeklyDigest }
        : {}),
    });
    const job = intent.userVisibleJob
      ? await transaction.backgroundJob.create({
          data: {
            workspaceId: intent.workspaceId,
            vendorOrganizationId: intent.vendorOrganizationId,
            actorUserId: intent.actorUserId,
            type: eventName,
            userVisible: true,
            correlationId,
            idempotencyKey: intent.idempotencyKey,
            deduplicationKey: intent.deduplicationKey,
            maxAttempts,
            availableAt: intent.availableAt,
            scheduledAt: intent.availableAt,
            payload: payload as Prisma.InputJsonValue,
          },
        })
      : null;
    const outbox = await transaction.outboxMessage.create({
      data: {
        eventName,
        aggregateType: intent.aggregateType,
        aggregateId: intent.aggregateId,
        aggregateVersion: intent.aggregateVersion ?? 1,
        workspaceId: intent.workspaceId,
        vendorOrganizationId: intent.vendorOrganizationId,
        actorUserId: intent.actorUserId,
        backgroundJobId: job?.id,
        correlationId,
        idempotencyKey: intent.idempotencyKey,
        deduplicationKey: intent.deduplicationKey,
        payload: payload as Prisma.InputJsonValue,
        encryptedHeaders: intent.email
          ? encryptCommand(
              intent.email,
              {
                keyId: this.environment.OUTBOX_ENCRYPTION_KEY_ID,
                secret: this.environment.OUTBOX_ENCRYPTION_KEY,
              },
              {
                expiresAt: new Date(
                  Date.now() +
                    this.environment.OUTBOX_COMMAND_TTL_SECONDS * 1000,
                ),
              },
            )
          : undefined,
        maxAttempts,
        availableAt: intent.availableAt,
      },
    });
    const consumers = selectOutboxConsumers({
      eventName,
      hasEmail: Boolean(intent.email),
      payload,
    });
    await transaction.outboxConsumerExecution.createMany({
      data: consumers.map((consumerName) => ({
        outboxMessageId: outbox.id,
        backgroundJobId: job?.id,
        consumerName,
        maxAttempts,
        availableAt: intent.availableAt,
        deduplicationKey: `consumer:${outbox.id}:${consumerName}`,
      })),
    });
    return job?.id ?? null;
  }
}
