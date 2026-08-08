import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { z } from "zod";

export * from "./planning";
export * from "./operations";
export * from "./intelligence";

export const DOMAIN_EVENT_QUEUE = "weddingos-domain-events" as const;
export const DOMAIN_EVENT_JOB = "domain-event.consumer.v1" as const;

export const outboxConsumerNames = [
  "event_ack",
  "marketing_snapshot_refresh",
  "email",
  "notification_projection",
  "activity_projection",
  "activity_export",
  "privacy_export",
  "plan_generation",
  "task_reminder",
  "planning_export",
  "guest_import",
  "guest_export",
  "campaign_fanout",
  "campaign_delivery",
  "campaign_summary",
  "invitation_open_projection",
  "rsvp_projection",
  "rsvp_reminder",
  "menu_export",
  "seating_suggestion",
  "seating_issue_projection",
  "seating_export",
  "transport_issue_projection",
  "transport_manifest",
  "accommodation_issue_projection",
  "accommodation_rooming_list",
  "guest_operations_projection",
  "rfq_delivery",
  "offer_projection",
  "booking_projection",
  "contract_projection",
  "contract_export",
  "budget_projection",
  "payment_projection",
  "payment_reminder",
  "commercial_export",
  "vendor_notification_projection",
  "document_scan",
  "document_derivative",
  "document_cleanup",
  "document_retention",
  "document_notification_projection",
  "document_text_extraction",
  "signature_envelope_create",
  "signature_envelope_send",
  "signature_status_projection",
  "signature_evidence_download",
  "payment_checkout_create",
  "payment_status_projection",
  "payment_refund",
  "payment_reconciliation",
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
  "wedding_day_live_projection",
  "wedding_day_reminder",
  "incident_escalation",
  "announcement_delivery",
  "announcement_summary",
  "check_in_projection",
  "check_in_offline_sync",
  "attendance_projection",
  "guest_moment_scan",
  "guest_moment_derivative",
  "guest_moment_moderation_projection",
  "gallery_projection",
  "wedding_day_export",
  "copilot_run",
  "risk_detection",
  "contingency_simulation",
  "automation_execution",
  "automation_trigger",
  "weekly_digest",
] as const;
export const outboxConsumerNameSchema = z.enum(outboxConsumerNames);
export type OutboxConsumerName = z.infer<typeof outboxConsumerNameSchema>;

export const asyncEventNames = [
  "user.registered.v1",
  "user.email_verification_requested.v1",
  "user.email_verified.v1",
  "session.created.v1",
  "session.revoked.v1",
  "password.reset_requested.v1",
  "password.changed.v1",
  "magic_link.requested.v1",
  "magic_link.exchanged.v1",
  "workspace.created.v1",
  "workspace.updated.v1",
  "public_aggregate.consent_revoked.v1",
  "membership.invited.v1",
  "membership.invitation_resent.v1",
  "membership.invitation_revoked.v1",
  "membership.invitation_accepted.v1",
  "membership.invitation_declined.v1",
  "membership.role_changed.v1",
  "membership.removed.v1",
  "onboarding.draft_updated.v1",
  "onboarding.ready_for_plan_generation.v1",
  "notification.read.v1",
  "notification.dismissed.v1",
  "activity.export_requested.v1",
  "planning.plan_generation_requested.v1",
  "planning.plan_proposal_ready.v1",
  "planning.plan_proposal_updated.v1",
  "planning.plan_proposal_rejected.v1",
  "planning.plan_applied.v1",
  "planning.export_requested.v1",
  "task.created.v1",
  "task.updated.v1",
  "task.assigned.v1",
  "task.status_changed.v1",
  "task.due_date_changed.v1",
  "task.deleted.v1",
  "task.reminder_scheduled.v1",
  "task.reminder_due.v1",
  "calendar.event_created.v1",
  "calendar.event_updated.v1",
  "calendar.event_deleted.v1",
  "timeline.milestone_created.v1",
  "timeline.milestone_updated.v1",
  "timeline.milestone_deleted.v1",
  "timeline.recalculated.v1",
  "guest.household_created.v1",
  "guest.household_updated.v1",
  "guest.created.v1",
  "guest.updated.v1",
  "guest.archived.v1",
  "guest.import_requested.v1",
  "guest.import_completed.v1",
  "guest.import_failed.v1",
  "guest.export_requested.v1",
  "invitation.draft_updated.v1",
  "invitation.site_published.v1",
  "invitation.site_unpublished.v1",
  "invitation.recipients_created.v1",
  "invitation.opened.v1",
  "campaign.created.v1",
  "campaign.scheduled.v1",
  "campaign.send_requested.v1",
  "campaign.recipient_delivery_requested.v1",
  "campaign.completed.v1",
  "campaign.failed.v1",
  "rsvp.form_published.v1",
  "rsvp.submitted.v1",
  "rsvp.updated.v1",
  "rsvp.declined.v1",
  "rsvp.deadline_changed.v1",
  "menu.created.v1",
  "menu.updated.v1",
  "menu.selection_changed.v1",
  "menu.export_requested.v1",
  "allergy.reported.v1",
  "allergy.issue_resolved.v1",
  "seating.plan_created.v1",
  "seating.plan_updated.v1",
  "seating.plan_published.v1",
  "seating.assignment_changed.v1",
  "seating.suggestion_requested.v1",
  "seating.suggestion_ready.v1",
  "seating.suggestion_applied.v1",
  "seating.issue_detected.v1",
  "seating.issue_resolved.v1",
  "seating.export_requested.v1",
  "transport.request_changed.v1",
  "transport.plan_created.v1",
  "transport.plan_published.v1",
  "transport.route_created.v1",
  "transport.route_updated.v1",
  "transport.assignment_changed.v1",
  "transport.issue_detected.v1",
  "transport.issue_resolved.v1",
  "transport.manifest_requested.v1",
  "accommodation.request_changed.v1",
  "accommodation.property_created.v1",
  "accommodation.stay_created.v1",
  "accommodation.stay_published.v1",
  "accommodation.allocation_changed.v1",
  "accommodation.issue_detected.v1",
  "accommodation.issue_resolved.v1",
  "accommodation.rooming_list_requested.v1",
  "vendor.organization_created.v1",
  "vendor.organization_updated.v1",
  "vendor.member_invited.v1",
  "vendor.member_invitation_accepted.v1",
  "vendor.member_invitation_declined.v1",
  "vendor.member_invitation_revoked.v1",
  "vendor.profile_published.v1",
  "vendor.profile_unpublished.v1",
  "vendor.profile_updated.v1",
  "vendor.service_created.v1",
  "vendor.availability_changed.v1",
  "marketplace.vendor_favorited.v1",
  "marketplace.shortlist_created.v1",
  "marketplace.vendor_added_to_shortlist.v1",
  "rfq.created.v1",
  "rfq.updated.v1",
  "rfq.cancelled.v1",
  "rfq.sent.v1",
  "rfq.opened.v1",
  "rfq.declined.v1",
  "rfq.closed.v1",
  "offer.created.v1",
  "offer.draft_created.v1",
  "offer.updated.v1",
  "offer.submitted.v1",
  "offer.revision_requested.v1",
  "offer.revised.v1",
  "offer.accepted.v1",
  "offer.rejected.v1",
  "offer.withdrawn.v1",
  "negotiation.message_sent.v1",
  "booking.created.v1",
  "booking.status_changed.v1",
  "booking.milestone_completed.v1",
  "booking.cancelled.v1",
  "booking.updated.v1",
  "booking.completed.v1",
  "contract.created.v1",
  "contract.version_created.v1",
  "contract.changes_requested.v1",
  "contract.ready.v1",
  "contract.ready_for_ack.v1",
  "contract.party_acknowledged.v1",
  "contract.agreed.v1",
  "contract.acknowledged.v1",
  "contract.updated.v1",
  "contract.cancelled.v1",
  "contract.export_requested.v1",
  "budget.plan_updated.v1",
  "budget.category_updated.v1",
  "budget.item_created.v1",
  "budget.item_updated.v1",
  "budget.over_budget.v1",
  "expense.created.v1",
  "expense.updated.v1",
  "payment.schedule_created.v1",
  "payment.schedule_updated.v1",
  "payment.recorded.v1",
  "payment.confirmed.v1",
  "payment.reversed.v1",
  "payment.refunded.v1",
  "payment.updated.v1",
  "payment.disputed.v1",
  "payment.reminder_scheduled.v1",
  "payment.reminder_due.v1",
  "commercial.export_requested.v1",
  "storage.upload_created.v1",
  "storage.upload_completed.v1",
  "storage.object_verified.v1",
  "storage.object_quarantined.v1",
  "storage.object_deleted.v1",
  "document.created.v1",
  "document.version_created.v1",
  "document.contract_materialized.v1",
  "document.available.v1",
  "document.shared.v1",
  "document.grant_revoked.v1",
  "document.downloaded.v1",
  "document.archived.v1",
  "document.delete_requested.v1",
  "signature.envelope_created.v1",
  "signature.envelope_sent.v1",
  "signature.signer_viewed.v1",
  "signature.signer_signed.v1",
  "signature.signer_declined.v1",
  "signature.envelope_completed.v1",
  "signature.envelope_expired.v1",
  "signature.envelope_cancelled.v1",
  "signature.evidence_available.v1",
  "payment.checkout_created.v1",
  "payment.checkout_expired.v1",
  "payment.transaction_authorized.v1",
  "payment.transaction_captured.v1",
  "payment.transaction_failed.v1",
  "payment.transaction_disputed.v1",
  "payment.refund_requested.v1",
  "payment.refund_completed.v1",
  "payment.refund_failed.v1",
  "payment.reconciliation_completed.v1",
  "review.eligibility_created.v1",
  "review.draft_created.v1",
  "review.submitted.v1",
  "review.published.v1",
  "review.updated.v1",
  "review.withdrawn.v1",
  "review.reply_published.v1",
  "review.reported.v1",
  "review.dispute_opened.v1",
  "review.moderation_opened.v1",
  "review.moderation_decided.v1",
  "review.rating_aggregate_updated.v1",
  "subscription.checkout_created.v1",
  "subscription.trial_started.v1",
  "subscription.activated.v1",
  "subscription.renewed.v1",
  "subscription.past_due.v1",
  "subscription.grace_started.v1",
  "subscription.cancelled.v1",
  "subscription.resumed.v1",
  "subscription.plan_changed.v1",
  "subscription.entitlements_updated.v1",
  "payout.account_created.v1",
  "payout.account_updated.v1",
  "payout.onboarding_completed.v1",
  "payout.allocation_created.v1",
  "payout.fee_recorded.v1",
  "payout.balance_updated.v1",
  "payout.settlement_created.v1",
  "payout.settlement_finalized.v1",
  "payout.requested.v1",
  "payout.processing.v1",
  "payout.paid.v1",
  "payout.failed.v1",
  "payout.returned.v1",
  "payout.refund_adjusted.v1",
  "payout.dispute_held.v1",
  "payout.dispute_released.v1",
  "payout.reconciliation_completed.v1",
  "wedding_day.plan_created.v1",
  "wedding_day.plan_published.v1",
  "wedding_day.plan_live.v1",
  "wedding_day.plan_paused.v1",
  "wedding_day.plan_completed.v1",
  "wedding_day.item_created.v1",
  "wedding_day.item_started.v1",
  "wedding_day.item_delayed.v1",
  "wedding_day.item_blocked.v1",
  "wedding_day.item_completed.v1",
  "wedding_day.item_cancelled.v1",
  "wedding_day.checklist_updated.v1",
  "wedding_day.incident_created.v1",
  "wedding_day.incident_escalated.v1",
  "wedding_day.incident_resolved.v1",
  "wedding_day.decision_recorded.v1",
  "wedding_day.announcement_published.v1",
  "wedding_day.announcement_cancelled.v1",
  "check_in.session_opened.v1",
  "check_in.session_closed.v1",
  "check_in.guest_checked_in.v1",
  "check_in.guest_checked_out.v1",
  "check_in.denied.v1",
  "check_in.offline_sync_completed.v1",
  "guest_moment.uploaded.v1",
  "guest_moment.scan_completed.v1",
  "guest_moment.approved.v1",
  "guest_moment.rejected.v1",
  "guest_moment.published.v1",
  "guest_moment.reported.v1",
  "gallery.published.v1",
  "gallery.unpublished.v1",
  "wedding_day.export_requested.v1",
  "copilot.run_requested.v1",
  "copilot.conversation_created.v1",
  "copilot.response_ready.v1",
  "copilot.proposal_ready.v1",
  "copilot.proposal_updated.v1",
  "copilot.proposal_approved.v1",
  "copilot.proposal_rejected.v1",
  "copilot.proposal_executed.v1",
  "risk.created.v1",
  "risk.updated.v1",
  "risk.assessment_created.v1",
  "risk.score_changed.v1",
  "risk.mitigation_started.v1",
  "risk.detect_requested.v1",
  "risk.detected.v1",
  "risk.resolved.v1",
  "contingency.plan_created.v1",
  "contingency.plan_updated.v1",
  "contingency.plan_approved.v1",
  "contingency.plan_simulation_requested.v1",
  "contingency.plan_activated.v1",
  "contingency.plan_completed.v1",
  "contingency.plan_cancelled.v1",
  "automation.rule_created.v1",
  "automation.rule_updated.v1",
  "automation.activated.v1",
  "automation.paused.v1",
  "automation.disabled.v1",
  "automation.triggered.v1",
  "automation.approval_requested.v1",
  "automation.execution_requested.v1",
  "automation.execution_completed.v1",
  "digest.weekly_requested.v1",
  "digest.weekly_ready.v1",
  "digest.weekly_delivered.v1",
  "platform.user_suspended.v1",
  "platform.user_reactivated.v1",
  "platform.workspace_suspended.v1",
  "platform.workspace_reactivated.v1",
  "platform.vendor_suspended.v1",
  "platform.vendor_reactivated.v1",
  "support.case_created.v1",
  "support.case_updated.v1",
  "support.case_resolved.v1",
  "privacy.consent_recorded.v1",
  "privacy.consent_withdrawn.v1",
  "privacy.request_submitted.v1",
  "privacy.request_verified.v1",
  "privacy.export_requested.v1",
  "privacy.export_ready.v1",
  "privacy.deletion_requested.v1",
  "privacy.deletion_scheduled.v1",
  "privacy.deletion_completed.v1",
  "retention.scan_requested.v1",
  "retention.item_archived.v1",
  "retention.item_purged.v1",
  "retention.blocked_by_hold.v1",
  "legal_hold.created.v1",
  "legal_hold.released.v1",
  "security.event_detected.v1",
  "security.alert_opened.v1",
  "security.alert_resolved.v1",
  "backup.requested.v1",
  "backup.completed.v1",
  "backup.failed.v1",
  "backup.verified.v1",
  "restore.requested.v1",
  "restore.completed.v1",
  "restore.failed.v1",
  "platform.incident_created.v1",
  "platform.incident_resolved.v1",
  "platform.feature_flag_changed.v1",
  "platform.maintenance_started.v1",
  "platform.maintenance_ended.v1",
  "release.candidate_created.v1",
  "release.approved.v1",
  "release.rejected.v1",
  "release.deployed.v1",
  "release.rolled_back.v1",
] as const;

export const asyncEventNameSchema = z.enum(asyncEventNames);
export type AsyncEventName = z.infer<typeof asyncEventNameSchema>;

export const projectionHintSchema = z.object({
  notification: z
    .object({
      recipientUserId: z.string().uuid(),
      module: z.string().min(1).max(80).optional(),
      kind: z.string().min(1).max(80),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      title: z.string().min(1).max(180),
      body: z.string().min(1).max(1000),
      actionUrl: z
        .string()
        .max(2048)
        .regex(/^\/(?!\/)/, "Notification deep links must be local paths")
        .optional(),
    })
    .optional(),
  activity: z
    .object({
      category: z.string().min(1).max(80),
      action: z.string().min(1).max(120),
      summary: z.string().min(1).max(1000),
      actorName: z.string().max(180).optional(),
      entityType: z.string().max(80).optional(),
      entityId: z.string().max(160).optional(),
      metadata: z.record(z.unknown()).optional(),
    })
    .optional(),
  export: z
    .object({
      requestedByUserId: z.string().uuid(),
      filters: z.record(z.unknown()).default({}),
    })
    .optional(),
  privacyExport: z
    .object({
      requestId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
    })
    .optional(),
  planGeneration: z
    .object({
      generationRunId: z.string().uuid(),
      mode: z.enum(["deterministic", "ai_enriched", "auto"]),
    })
    .optional(),
  reminder: z
    .object({
      reminderId: z.string().uuid(),
    })
    .optional(),
  planningExport: z
    .object({
      requestedByUserId: z.string().uuid(),
      filters: z.record(z.unknown()).default({}),
    })
    .optional(),
  guestImport: z.object({ importId: z.string().uuid() }).optional(),
  guestExport: z
    .object({
      requestedByUserId: z.string().uuid(),
      format: z.enum(["csv", "xlsx"]),
      options: z.record(z.unknown()).default({}),
    })
    .optional(),
  campaignFanout: z.object({ campaignId: z.string().uuid() }).optional(),
  campaignDelivery: z
    .object({ campaignRecipientId: z.string().uuid() })
    .optional(),
  campaignSummary: z.object({ campaignId: z.string().uuid() }).optional(),
  invitationOpen: z.object({ recipientId: z.string().uuid() }).optional(),
  rsvpProjection: z.object({ submissionId: z.string().uuid() }).optional(),
  rsvpReminder: z.object({ campaignId: z.string().uuid() }).optional(),
  menuExport: z
    .object({
      requestedByUserId: z.string().uuid(),
      format: z.enum(["csv", "xlsx"]),
      includeAllergies: z.boolean().default(false),
    })
    .optional(),
  seatingSuggestion: z.object({ runId: z.string().uuid() }).optional(),
  seatingIssueProjection: z.object({ planId: z.string().uuid() }).optional(),
  seatingExport: z
    .object({
      artifactId: z.string().uuid(),
      planId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
      format: z.enum(["csv", "svg"]),
      kind: z.enum([
        "table_list",
        "guest_by_table",
        "table_cards",
        "visual_plan",
        "catering_summary",
      ]),
      includeSensitive: z.boolean().default(false),
    })
    .optional(),
  transportIssueProjection: z.object({ planId: z.string().uuid() }).optional(),
  transportManifest: z
    .object({
      artifactId: z.string().uuid(),
      planId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
      format: z.enum(["csv", "xlsx"]),
      includeSensitive: z.boolean().default(false),
    })
    .optional(),
  accommodationIssueProjection: z
    .object({ stayId: z.string().uuid() })
    .optional(),
  accommodationRoomingList: z
    .object({
      artifactId: z.string().uuid(),
      stayId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
      format: z.enum(["csv", "xlsx"]),
      includeSensitive: z.boolean().default(false),
    })
    .optional(),
  guestOperationsProjection: z
    .object({ submissionId: z.string().uuid() })
    .optional(),
  rfqDelivery: z.object({ recipientId: z.string().uuid() }).optional(),
  offerProjection: z.object({ offerId: z.string().uuid() }).optional(),
  bookingProjection: z.object({ bookingId: z.string().uuid() }).optional(),
  contractProjection: z.object({ contractId: z.string().uuid() }).optional(),
  contractExport: z
    .object({
      artifactId: z.string().uuid(),
      contractVersionId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
      format: z.enum(["html", "pdf"]),
    })
    .optional(),
  budgetProjection: z
    .object({ budgetItemId: z.string().uuid().optional() })
    .optional(),
  paymentProjection: z.object({ paymentId: z.string().uuid() }).optional(),
  paymentReminder: z
    .object({
      scheduleId: z.string().uuid(),
      scheduleVersion: z.number().int().positive(),
    })
    .optional(),
  commercialExport: z
    .object({
      artifactId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
      type: z.enum([
        "budget",
        "payment_schedule",
        "booking",
        "offer_comparison",
      ]),
      format: z.enum(["csv", "xlsx"]),
      resourceId: z.string().uuid().nullable().optional(),
    })
    .optional(),
  vendorNotificationProjection: z
    .object({
      vendorOrganizationId: z.string().uuid(),
      recipientUserId: z.string().uuid().optional(),
    })
    .optional(),
  documentScan: z.object({ storedObjectId: z.string().uuid() }).optional(),
  documentDerivative: z.object({ documentId: z.string().uuid() }).optional(),
  documentCleanup: z.object({ documentId: z.string().uuid() }).optional(),
  documentRetention: z.object({ documentId: z.string().uuid() }).optional(),
  documentNotificationProjection: z
    .object({ documentId: z.string().uuid() })
    .optional(),
  documentTextExtraction: z
    .object({
      documentId: z.string().uuid(),
      documentVersionId: z.string().uuid(),
    })
    .optional(),
  signatureEnvelopeCreate: z
    .object({ envelopeId: z.string().uuid() })
    .optional(),
  signatureEnvelopeSend: z.object({ envelopeId: z.string().uuid() }).optional(),
  signatureStatusProjection: z
    .object({ envelopeId: z.string().uuid() })
    .optional(),
  signatureEvidenceDownload: z
    .object({ envelopeId: z.string().uuid() })
    .optional(),
  paymentCheckoutCreate: z.object({ checkoutId: z.string().uuid() }).optional(),
  paymentStatusProjection: z
    .object({
      transactionId: z.string().uuid().optional(),
      checkoutId: z.string().uuid().optional(),
      refundId: z.string().uuid().optional(),
      reconciliationRunId: z.string().uuid().optional(),
    })
    .refine(
      (value) =>
        Boolean(
          value.transactionId ||
          value.checkoutId ||
          value.refundId ||
          value.reconciliationRunId,
        ),
      "A payment projection aggregate identifier is required",
    )
    .optional(),
  paymentRefund: z.object({ refundId: z.string().uuid() }).optional(),
  paymentReconciliation: z.object({ runId: z.string().uuid() }).optional(),
  weddingDayLive: z.object({ liveEventId: z.string().uuid() }).optional(),
  weddingDayReminder: z.object({ planId: z.string().uuid() }).optional(),
  incidentEscalation: z.object({ incidentId: z.string().uuid() }).optional(),
  announcementDelivery: z
    .object({ announcementId: z.string().uuid() })
    .optional(),
  announcementSummary: z
    .object({ announcementId: z.string().uuid() })
    .optional(),
  checkInProjection: z
    .object({
      sessionId: z.string().uuid(),
      checkInId: z.string().uuid().optional(),
    })
    .optional(),
  checkInOfflineSync: z.object({ batchId: z.string().uuid() }).optional(),
  attendanceProjection: z.object({ sessionId: z.string().uuid() }).optional(),
  guestMomentScan: z
    .object({
      momentId: z.string().uuid(),
      mediaId: z.string().uuid(),
      storedObjectId: z.string().uuid(),
    })
    .optional(),
  guestMomentDerivative: z
    .object({ momentId: z.string().uuid(), mediaId: z.string().uuid() })
    .optional(),
  guestMomentModerationProjection: z
    .object({ momentId: z.string().uuid() })
    .optional(),
  galleryProjection: z.object({ collectionId: z.string().uuid() }).optional(),
  weddingDayExport: z
    .object({
      artifactId: z.string().uuid(),
      requestedByUserId: z.string().uuid(),
      type: z.enum([
        "RUN_SHEET",
        "CONTACT_SHEET",
        "CHECK_IN_MANIFEST",
        "ATTENDANCE",
        "INCIDENTS",
      ]),
      format: z.enum(["csv", "xlsx"]),
      planId: z.string().uuid().nullable().optional(),
      sessionId: z.string().uuid().nullable().optional(),
    })
    .optional(),
  copilotRun: z.object({ runId: z.string().uuid() }).optional(),
  riskDetection: z.object({ detectionRunId: z.string().uuid() }).optional(),
  contingencySimulation: z
    .object({ simulationId: z.string().uuid() })
    .optional(),
  automationExecution: z.object({ executionId: z.string().uuid() }).optional(),
  weeklyDigest: z.object({ digestId: z.string().uuid() }).optional(),
});

export const domainEventPayloadSchema = projectionHintSchema.extend({
  occurredAt: z.string().datetime(),
  subject: z.record(z.unknown()).default({}),
  trace: z
    .object({
      traceparent: z.string().max(128).optional(),
      tracestate: z.string().max(512).optional(),
    })
    .optional(),
});
export type DomainEventPayload = z.infer<typeof domainEventPayloadSchema>;

export const domainEventJobSchema = z.object({
  contract: z.literal(DOMAIN_EVENT_JOB),
  outboxMessageId: z.string().uuid(),
  consumerExecutionId: z.string().uuid(),
  consumerName: outboxConsumerNameSchema,
});
export type DomainEventJob = z.infer<typeof domainEventJobSchema>;

const automationTriggerSourceEvents = new Set<AsyncEventName>([
  "task.created.v1",
  "task.status_changed.v1",
  "task.due_date_changed.v1",
  "risk.created.v1",
  "risk.assessment_created.v1",
  "risk.score_changed.v1",
  "timeline.milestone_created.v1",
  "timeline.milestone_updated.v1",
]);

export function consumerJobId(
  outboxMessageId: string,
  consumerName: OutboxConsumerName,
): string {
  return `${outboxMessageId}--${consumerName}`;
}

export function selectOutboxConsumers(input: {
  eventName: AsyncEventName;
  hasEmail: boolean;
  payload: DomainEventPayload;
}): OutboxConsumerName[] {
  const consumers = new Set<OutboxConsumerName>(["event_ack"]);
  if (input.eventName === "public_aggregate.consent_revoked.v1")
    consumers.add("marketing_snapshot_refresh");
  const lifecycleOnly =
    input.eventName === "notification.read.v1" ||
    input.eventName === "notification.dismissed.v1";
  if (input.hasEmail) consumers.add("email");
  if (!lifecycleOnly && input.payload.notification)
    consumers.add("notification_projection");
  if (!lifecycleOnly && input.payload.activity)
    consumers.add("activity_projection");
  if (!lifecycleOnly && input.payload.export) consumers.add("activity_export");
  if (!lifecycleOnly && input.payload.privacyExport)
    consumers.add("privacy_export");
  if (!lifecycleOnly && input.payload.planGeneration)
    consumers.add("plan_generation");
  if (!lifecycleOnly && input.payload.reminder) consumers.add("task_reminder");
  if (!lifecycleOnly && input.payload.planningExport)
    consumers.add("planning_export");
  if (!lifecycleOnly && input.payload.guestImport)
    consumers.add("guest_import");
  if (!lifecycleOnly && input.payload.guestExport)
    consumers.add("guest_export");
  if (!lifecycleOnly && input.payload.campaignFanout)
    consumers.add("campaign_fanout");
  if (!lifecycleOnly && input.payload.campaignDelivery)
    consumers.add("campaign_delivery");
  if (!lifecycleOnly && input.payload.campaignSummary)
    consumers.add("campaign_summary");
  if (!lifecycleOnly && input.payload.invitationOpen)
    consumers.add("invitation_open_projection");
  if (!lifecycleOnly && input.payload.rsvpProjection)
    consumers.add("rsvp_projection");
  if (!lifecycleOnly && input.payload.rsvpReminder)
    consumers.add("rsvp_reminder");
  if (!lifecycleOnly && input.payload.menuExport) consumers.add("menu_export");
  if (!lifecycleOnly && input.payload.seatingSuggestion)
    consumers.add("seating_suggestion");
  if (!lifecycleOnly && input.payload.seatingIssueProjection)
    consumers.add("seating_issue_projection");
  if (!lifecycleOnly && input.payload.seatingExport)
    consumers.add("seating_export");
  if (!lifecycleOnly && input.payload.transportIssueProjection)
    consumers.add("transport_issue_projection");
  if (!lifecycleOnly && input.payload.transportManifest)
    consumers.add("transport_manifest");
  if (!lifecycleOnly && input.payload.accommodationIssueProjection)
    consumers.add("accommodation_issue_projection");
  if (!lifecycleOnly && input.payload.accommodationRoomingList)
    consumers.add("accommodation_rooming_list");
  if (!lifecycleOnly && input.payload.guestOperationsProjection)
    consumers.add("guest_operations_projection");
  if (!lifecycleOnly && input.payload.rfqDelivery)
    consumers.add("rfq_delivery");
  if (!lifecycleOnly && input.payload.offerProjection)
    consumers.add("offer_projection");
  if (!lifecycleOnly && input.payload.bookingProjection)
    consumers.add("booking_projection");
  if (!lifecycleOnly && input.payload.contractProjection)
    consumers.add("contract_projection");
  if (!lifecycleOnly && input.payload.contractExport)
    consumers.add("contract_export");
  if (!lifecycleOnly && input.payload.budgetProjection)
    consumers.add("budget_projection");
  if (!lifecycleOnly && input.payload.paymentProjection)
    consumers.add("payment_projection");
  if (!lifecycleOnly && input.payload.paymentReminder)
    consumers.add("payment_reminder");
  if (!lifecycleOnly && input.payload.commercialExport)
    consumers.add("commercial_export");
  if (!lifecycleOnly && input.payload.vendorNotificationProjection)
    consumers.add("vendor_notification_projection");
  if (!lifecycleOnly && input.payload.documentScan)
    consumers.add("document_scan");
  if (!lifecycleOnly && input.payload.documentDerivative)
    consumers.add("document_derivative");
  if (!lifecycleOnly && input.payload.documentCleanup)
    consumers.add("document_cleanup");
  if (!lifecycleOnly && input.payload.documentRetention)
    consumers.add("document_retention");
  if (!lifecycleOnly && input.payload.documentNotificationProjection)
    consumers.add("document_notification_projection");
  if (!lifecycleOnly && input.payload.documentTextExtraction)
    consumers.add("document_text_extraction");
  if (!lifecycleOnly && input.payload.signatureEnvelopeCreate)
    consumers.add("signature_envelope_create");
  if (!lifecycleOnly && input.payload.signatureEnvelopeSend)
    consumers.add("signature_envelope_send");
  if (!lifecycleOnly && input.payload.signatureStatusProjection)
    consumers.add("signature_status_projection");
  if (!lifecycleOnly && input.payload.signatureEvidenceDownload)
    consumers.add("signature_evidence_download");
  if (!lifecycleOnly && input.payload.paymentCheckoutCreate)
    consumers.add("payment_checkout_create");
  if (!lifecycleOnly && input.payload.paymentStatusProjection)
    consumers.add("payment_status_projection");
  if (!lifecycleOnly && input.payload.paymentRefund)
    consumers.add("payment_refund");
  if (!lifecycleOnly && input.payload.paymentReconciliation)
    consumers.add("payment_reconciliation");
  if (input.eventName.startsWith("review.")) {
    consumers.add("review_notification_projection");
    if (input.eventName === "review.eligibility_created.v1")
      consumers.add("review_eligibility_projection");
    if (
      [
        "review.published.v1",
        "review.updated.v1",
        "review.withdrawn.v1",
        "review.moderation_decided.v1",
      ].includes(input.eventName)
    )
      consumers.add("review_rating_projection");
    if (
      input.eventName.includes("moderation") ||
      input.eventName.includes("reported") ||
      input.eventName.includes("dispute")
    )
      consumers.add("review_moderation_projection");
  }
  if (input.eventName.startsWith("subscription.")) {
    consumers.add("subscription_status_projection");
    consumers.add("subscription_entitlement_projection");
    consumers.add("subscription_usage_projection");
    consumers.add("subscription_notification_projection");
  }
  if (input.eventName.startsWith("payout.")) {
    consumers.add("payout_status_projection");
    if (input.eventName === "payout.allocation_created.v1")
      consumers.add("payment_allocation_projection");
    if (
      [
        "payout.allocation_created.v1",
        "payout.refund_adjusted.v1",
        "payout.dispute_held.v1",
        "payout.dispute_released.v1",
      ].includes(input.eventName)
    )
      consumers.add("vendor_payable_projection");
    if (input.eventName === "payout.settlement_created.v1")
      consumers.add("settlement_calculation");
    if (input.eventName === "payout.requested.v1")
      consumers.add("payout_execution");
    if (input.eventName === "payout.reconciliation_completed.v1")
      consumers.add("payout_reconciliation");
  }
  if (input.payload.weddingDayLive)
    consumers.add("wedding_day_live_projection");
  if (input.payload.weddingDayReminder) consumers.add("wedding_day_reminder");
  if (input.payload.incidentEscalation) consumers.add("incident_escalation");
  if (input.payload.announcementDelivery)
    consumers.add("announcement_delivery");
  if (input.payload.announcementSummary) consumers.add("announcement_summary");
  if (input.payload.checkInProjection) consumers.add("check_in_projection");
  if (input.payload.checkInOfflineSync) consumers.add("check_in_offline_sync");
  if (input.payload.attendanceProjection)
    consumers.add("attendance_projection");
  if (input.payload.guestMomentScan) consumers.add("guest_moment_scan");
  if (input.payload.guestMomentDerivative)
    consumers.add("guest_moment_derivative");
  if (input.payload.guestMomentModerationProjection)
    consumers.add("guest_moment_moderation_projection");
  if (input.payload.galleryProjection) consumers.add("gallery_projection");
  if (input.payload.weddingDayExport) consumers.add("wedding_day_export");
  if (input.payload.copilotRun) consumers.add("copilot_run");
  if (input.payload.riskDetection) consumers.add("risk_detection");
  if (input.payload.contingencySimulation)
    consumers.add("contingency_simulation");
  if (input.payload.automationExecution) consumers.add("automation_execution");
  if (input.payload.weeklyDigest) consumers.add("weekly_digest");
  if (!lifecycleOnly && automationTriggerSourceEvents.has(input.eventName))
    consumers.add("automation_trigger");
  return [...consumers];
}

export const emailCommandSchema = z.object({
  kind: z.enum([
    "email-verification",
    "password-reset",
    "password-changed",
    "magic-link",
    "team-invitation",
    "vendor-invitation",
    "campaign-email",
    "weekly-digest",
  ]),
  recipient: z.string().email(),
  values: z.record(z.string()),
});
export type EmailCommand = z.infer<typeof emailCommandSchema>;

export const jobStatuses = [
  "queued",
  "running",
  "retrying",
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const outboxStatuses = [
  "pending",
  "processing",
  "processed",
  "failed",
  "dead_letter",
] as const;
export type OutboxStatus = (typeof outboxStatuses)[number];

const outboxTransitions: Record<OutboxStatus, readonly OutboxStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["processed", "failed", "dead_letter"],
  processed: [],
  failed: ["processing", "dead_letter"],
  dead_letter: [],
};

export function canTransitionOutbox(
  from: OutboxStatus,
  to: OutboxStatus,
): boolean {
  return outboxTransitions[from].includes(to);
}

export function notificationDedupeKey(eventId: string): string {
  return `notification:${eventId}`;
}

export function redactActivityText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(token|password|secret)=?[^\s&]+/gi, "$1=[redacted]")
    .slice(0, 1000);
}

/**
 * Marks instruction-shaped content found inside retrieved documents. The text
 * remains untrusted data and this signal can never grant tool authority.
 */
export function isUntrustedDocumentInstruction(value: string): boolean {
  return /ignore\s+(all|any|the|my|previous)|system\s+prompt|developer\s+message|tool\s+call|execute\s+(code|sql|shell)/i.test(
    value,
  );
}

export function automationRecursionAllowed(
  depth: number,
  maximumDepth = 3,
): boolean {
  return Number.isInteger(depth) && depth >= 0 && depth <= maximumDepth;
}

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["retrying", "completed", "failed", "dead_letter"],
  retrying: ["running", "cancelled", "dead_letter"],
  completed: [],
  failed: [],
  cancelled: [],
  dead_letter: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return transitions[from].includes(to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new Error(`Invalid job transition: ${from} -> ${to}`);
  }
}

export function retryDelayMs(attempt: number, seed = 0): number {
  const boundedAttempt = Math.max(1, Math.min(attempt, 8));
  const base = Math.min(120_000, 1_000 * 2 ** (boundedAttempt - 1));
  const jitter = Math.abs(seed % Math.max(1, Math.floor(base * 0.2)));
  return base + jitter;
}

export class PermanentJobError extends Error {
  readonly retryable = false;
  constructor(
    message: string,
    readonly code = "PERMANENT_JOB_FAILURE",
  ) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export class RetryableJobError extends Error {
  readonly retryable = true;
  constructor(
    message: string,
    readonly code = "RETRYABLE_JOB_FAILURE",
  ) {
    super(message);
    this.name = "RetryableJobError";
  }
}

export function classifyJobError(error: unknown): {
  retryable: boolean;
  code: string;
  message: string;
} {
  if (error instanceof PermanentJobError) {
    return { retryable: false, code: error.code, message: redactError(error) };
  }
  if (error instanceof RetryableJobError) {
    return { retryable: true, code: error.code, message: redactError(error) };
  }
  const record = error as { code?: unknown; responseCode?: unknown } | null;
  const smtpCode = Number(record?.responseCode ?? 0);
  const code = typeof record?.code === "string" ? record.code : "JOB_FAILED";
  const retryable =
    smtpCode === 0 ||
    smtpCode >= 500 ||
    ["ECONNREFUSED", "ETIMEDOUT"].includes(code);
  return { retryable, code: code.slice(0, 100), message: redactError(error) };
}

export function redactError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "Background operation failed";
  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/(token|code|secret|password)=?[^\s&]+/gi, "$1=[redacted]")
    .replace(/[a-f0-9]{32,}/gi, "[secret]")
    .slice(0, 500);
}

function keyBytes(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export const encryptedCommandEnvelopeSchema = z.object({
  version: z.literal(2),
  keyId: z.string().min(1).max(80),
  algorithm: z.literal("AES-256-GCM"),
  nonce: z.string().min(1),
  authenticationTag: z.string().min(1),
  ciphertext: z.string().min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type EncryptedCommandEnvelope = z.infer<
  typeof encryptedCommandEnvelopeSchema
>;

export type CommandEncryptionKey = { keyId: string; secret: string };

export function encryptCommand(
  value: EmailCommand,
  key: CommandEncryptionKey,
  options: { issuedAt?: Date; expiresAt?: Date } = {},
): string {
  const parsed = emailCommandSchema.parse(value);
  const issuedAt = options.issuedAt ?? new Date();
  const expiresAt =
    options.expiresAt ?? new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000);
  if (expiresAt <= issuedAt)
    throw new PermanentJobError(
      "Encrypted command expiry must follow issuance",
      "COMMAND_EXPIRY_INVALID",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key.secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(parsed), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return JSON.stringify(
    encryptedCommandEnvelopeSchema.parse({
      version: 2,
      keyId: key.keyId,
      algorithm: "AES-256-GCM",
      nonce: iv.toString("base64url"),
      authenticationTag: tag.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }),
  );
}

export function commandKeyring(
  active: CommandEncryptionKey,
  previousKeysJson = "{}",
): Record<string, string> {
  let previous: unknown;
  try {
    previous = JSON.parse(previousKeysJson);
  } catch {
    throw new PermanentJobError(
      "Command keyring configuration is invalid",
      "COMMAND_KEYRING_INVALID",
    );
  }
  const parsed = z.record(z.string().min(16)).parse(previous);
  return { ...parsed, [active.keyId]: active.secret };
}

export function decryptCommand(
  value: string,
  keys: Record<string, string>,
  legacyKeyId?: string,
  now = new Date(),
): EmailCommand {
  let envelope: EncryptedCommandEnvelope;
  try {
    if (!value.trimStart().startsWith("{")) {
      const [version, nonce, authenticationTag, ciphertext] = value.split(".");
      if (
        version !== "v1" ||
        !nonce ||
        !authenticationTag ||
        !ciphertext ||
        !legacyKeyId
      ) {
        throw new PermanentJobError(
          "Invalid encrypted command envelope",
          "COMMAND_INVALID",
        );
      }
      envelope = {
        version: 2,
        keyId: legacyKeyId,
        algorithm: "AES-256-GCM",
        nonce,
        authenticationTag,
        ciphertext,
        issuedAt: new Date(0).toISOString(),
        expiresAt: new Date(8_640_000_000_000_000).toISOString(),
      };
    } else {
      envelope = encryptedCommandEnvelopeSchema.parse(JSON.parse(value));
    }
    if (new Date(envelope.expiresAt) <= now) {
      throw new PermanentJobError(
        "Encrypted command expired",
        "COMMAND_EXPIRED",
      );
    }
    const secret = keys[envelope.keyId];
    if (!secret) {
      throw new PermanentJobError(
        "Encrypted command key is unavailable",
        "COMMAND_KEY_UNAVAILABLE",
      );
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyBytes(secret),
      Buffer.from(envelope.nonce, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(envelope.authenticationTag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return emailCommandSchema.parse(JSON.parse(plaintext));
  } catch (error) {
    if (error instanceof PermanentJobError) throw error;
    throw new PermanentJobError(
      "Encrypted command cannot be opened",
      "COMMAND_DECRYPT_FAILED",
    );
  }
}
