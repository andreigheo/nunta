import type { OpenAPIObject } from "@nestjs/swagger";
import type {
  OperationObject,
  ReferenceObject,
  SchemaObject,
} from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import {
  activityExportRequestSchema,
  activityItemSchema,
  activityListSchema,
  apiProblemSchema,
  backgroundJobSchema,
  completeOnboardingResponseSchema,
  createSessionRequestSchema,
  createTeamInvitationRequestSchema,
  createWorkspaceRequestSchema,
  currentUserSchema,
  emailVerificationRequestSchema,
  emailVerificationSchema,
  healthSchema,
  invitationAcceptedSchema,
  invitationDeclinedSchema,
  magicLinkExchangeSchema,
  magicLinkRequestSchema,
  markAllNotificationsReadSchema,
  notificationListSchema,
  notificationPreferenceSchema,
  notificationSchema,
  neutralAuthResponseSchema,
  onboardingDraftSchema,
  passwordResetResponseSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  profileUpdatedSchema,
  publicTeamInvitationSchema,
  readinessSchema,
  registerRequestSchema,
  registerResponseSchema,
  sessionCreatedSchema,
  sessionSummarySchema,
  teamInvitationSchema,
  teamListSchema,
  teamMemberSchema,
  unreadNotificationCountSchema,
  updateMemberRequestSchema,
  updateNotificationPreferenceSchema,
  updateNotificationRequestSchema,
  updateOnboardingDraftSchema,
  updateProfileRequestSchema,
  updateUserPreferenceSchema,
  updateWorkspaceRequestSchema,
  userPreferenceSchema,
  verifiedResponseSchema,
  workspaceBootstrapSchema,
  workspaceMutationSchema,
  workspaceSummarySchema,
  mfaChallengeRequestSchema,
  mfaVerificationRequestSchema,
  applyPlanProposalRequestSchema,
  applyPlanProposalResponseSchema,
  calendarEventResourceSchema,
  calendarListSchema,
  copyTaskSchema,
  createCalendarEventSchema,
  createMilestoneSchema,
  createPlanGenerationRequestSchema,
  createPlanGenerationResponseSchema,
  createTaskCommentSchema,
  createTaskSchema,
  dependencyImpactSchema,
  planProposalListSchema,
  planProposalSchema,
  planningDashboardSchema,
  planningExportRequestSchema,
  rejectPlanProposalSchema,
  replaceTaskDependenciesSchema,
  searchResponseSchema,
  taskCommentListSchema,
  taskCommentSchema,
  taskListSchema,
  taskResourceSchema,
  taskTransitionSchema,
  timelineMilestoneSchema,
  timelineRecalculationRequestSchema,
  timelineRecalculationSchema,
  timelineSchema,
  updateCalendarEventSchema,
  updateMilestoneSchema,
  updatePlanProposalSchema,
  updateTaskCommentSchema,
  updateTaskSchema,
  adminRsvpOverrideSchema,
  campaignListSchema,
  campaignSchema,
  campaignStatisticsSchema,
  campaignTransitionSchema,
  createCampaignSchema,
  createGuestSchema,
  createGuestTagSchema,
  createHouseholdSchema,
  createInvitationRecipientsSchema,
  createMenuSchema,
  cursorRecordListSchema,
  exportRequestSchema,
  guestBulkCommandSchema,
  guestCompanionBootstrapSchema,
  guestImportRowListSchema,
  guestImportRowSchema,
  guestImportSchema,
  guestListSchema,
  guestTagListSchema,
  guestTagSchema,
  guestRsvpRequestSchema,
  guestSchema,
  householdListSchema,
  householdSchema,
  importMappingSchema,
  importRowDecisionSchema,
  invitationRecipientListSchema,
  invitationSiteSchema,
  menuListSchema,
  menuSchema,
  resolveAllergyIssueSchema,
  rsvpFormSchema,
  rsvpSubmissionSchema,
  saveInvitationDraftSchema,
  saveRsvpFormSchema,
  updateCampaignSchema,
  updateGuestSchema,
  updateGuestTagSchema,
  updateHouseholdSchema,
  updateMenuSchema,
  accommodationAllocationBatchSchema,
  createAccommodationPropertySchema,
  createAccommodationRoomSchema,
  createAccommodationStaySchema,
  createSeatingPlanSchema,
  createSeatingTableSchema,
  createTransportPlanSchema,
  createTransportRouteSchema,
  createTransportStopSchema,
  createTransportVehicleSchema,
  createVenueSpaceSchema,
  issueResolutionSchema,
  roomingListSchema,
  seatingAssignmentBatchSchema,
  seatingConstraintSchema,
  seatingExportSchema,
  seatingSuggestionApplySchema,
  seatingSuggestionRequestSchema,
  transportAssignmentBatchSchema,
  transportManifestSchema,
  updateAccommodationPropertySchema,
  updateAccommodationRequestSchema,
  updateAccommodationRoomSchema,
  updateAccommodationStaySchema,
  updateSeatingPlanSchema,
  updateSeatingSeatSchema,
  updateSeatingTableSchema,
  updateTransportPlanSchema,
  updateTransportRequestSchema,
  updateTransportRouteSchema,
  updateTransportStopSchema,
  updateTransportVehicleSchema,
  updateVenueSpaceSchema,
  bookingTransitionSchema,
  commercialExportSchema,
  contractAcknowledgementSchema,
  contractExportSchema,
  contractTransitionSchema,
  createBudgetCategorySchema,
  createBudgetItemSchema,
  createExpenseSchema,
  createOfferSchema,
  createPaymentScheduleSchema,
  createPaymentSchema,
  createRfqSchema,
  createShortlistSchema,
  createVendorAvailabilitySchema,
  createVendorOrganizationSchema,
  createVendorPackageSchema,
  createVendorServiceSchema,
  negotiationMessageSchema,
  offerReviewTransitionSchema,
  paymentTransitionSchema,
  replaceRfqRecipientsSchema,
  rfqTransitionSchema,
  updateBookingSchema,
  updateBudgetCategorySchema,
  updateBudgetItemSchema,
  updateBudgetPlanSchema,
  updateContractDraftSchema,
  updateExpenseSchema,
  updateOfferDraftSchema,
  updatePaymentScheduleSchema,
  updatePaymentSchema,
  updateRfqSchema,
  updateShortlistSchema,
  updateVendorAvailabilitySchema,
  updateVendorMemberSchema,
  updateVendorOrganizationSchema,
  updateVendorPackageSchema,
  updateVendorServiceSchema,
  upsertVendorProfileSchema,
  vendorInvitationSchema,
  vendorInvitationTokenSchema,
  completeUploadSessionSchema,
  cancelSignatureEnvelopeSchema,
  createDocumentFolderSchema,
  createDocumentGrantSchema,
  createDocumentSchema,
  createDocumentVersionSchema,
  createOnlinePaymentRefundSchema,
  createPaymentCheckoutSchema,
  createSignatureEnvelopeSchema,
  createUploadSessionSchema,
  fakePaymentActionSchema,
  fakeSignatureActionSchema,
  providerWebhookEnvelopeSchema,
  paymentReconciliationSchema,
  updateDocumentFolderSchema,
  updateDocumentRetentionSchema,
  updateDocumentSchema,
  createVendorReviewSchema,
  updateVendorReviewDraftSchema,
  publishVendorReviewSchema,
  vendorReviewReplySchema,
  vendorReviewDisputeSchema,
  reviewReportSchema,
  moderationTransitionSchema,
  moderationDecisionSchema,
  subscriptionCheckoutRequestSchema,
  subscriptionProductMutationSchema,
  subscriptionPriceMutationSchema,
  payoutAccountRequestSchema,
  settlementCalculationSchema,
  trustMonetizationResourceSchema,
  trustMonetizationListSchema,
  checkInManifestRequestSchema,
  checkInOfflineSyncSchema,
  checkInSessionTransitionSchema,
  completeGuestMomentSchema,
  createCheckInCredentialSchema,
  createCheckInDeviceSchema,
  createCheckInSessionSchema,
  createCheckInStationSchema,
  createGalleryCollectionSchema,
  createGuestMomentSchema,
  createRunOfShowItemSchema,
  createWeddingDayAnnouncementSchema,
  createWeddingDayChecklistItemSchema,
  createWeddingDayChecklistSchema,
  createWeddingDayContactSchema,
  createWeddingDayIncidentSchema,
  createWeddingDayPlanSchema,
  galleryItemsSchema,
  guestCheckInCommandSchema,
  guestMomentReportSchema,
  guestMomentTransitionSchema,
  runOfShowDependenciesSchema,
  runOfShowOrderSchema,
  runOfShowTransitionSchema,
  updateCheckInSessionSchema,
  updateCheckInStationSchema,
  updateGalleryCollectionSchema,
  updateRunOfShowItemSchema,
  updateWeddingDayAnnouncementSchema,
  updateWeddingDayChecklistItemSchema,
  updateWeddingDayContactSchema,
  updateWeddingDayPlanSchema,
  validateCheckInCredentialSchema,
  weddingDayChecklistTransitionSchema,
  weddingDayDecisionSchema,
  weddingDayIncidentTransitionSchema,
  weddingDayIncidentUpdateSchema,
  weddingDayExportSchema,
  publicProductProofV1Schema,
  publicAggregateConsentSchema,
  updatePublicAggregateConsentSchema,
  activateContingencyPlanSchema,
  automationExecutionDecisionSchema,
  automationTransitionSchema,
  contingencySimulationSchema,
  contingencyTransitionSchema,
  createAutomationRuleSchema,
  createContingencyPlanSchema,
  createCopilotConversationSchema,
  createCopilotFeedbackSchema,
  createCopilotMessageSchema,
  createRiskAssessmentSchema,
  createRiskMitigationSchema,
  createRiskSchema,
  createWeeklyDigestSchema,
  executeAutomationRuleSchema,
  executeCopilotProposalSchema,
  reviewCopilotProposalSchema,
  riskTransitionSchema,
  updateAutomationRuleSchema,
  updateContingencyPlanSchema,
  updateCopilotConversationSchema,
  updateCopilotProposalSchema,
  updateRiskSchema,
  platformReasonSchema,
  createSupportCaseSchema,
  supportCaseTransitionSchema,
  supportNoteSchema,
  createFeatureFlagSchema,
  updateFeatureFlagSchema,
  createLegalDocumentSchema,
  recordConsentSchema,
  withdrawConsentSchema,
  cookiePreferenceSchema,
  createDataSubjectRequestSchema,
  createDeletionRequestSchema,
  dataSubjectTransitionSchema,
  createLegalHoldSchema,
  releaseLegalHoldSchema,
  createBackupSchema,
  createRestoreSchema,
  createBetaProgramSchema,
  createBetaCohortSchema,
  createBetaInvitationSchema,
  acceptBetaInvitationSchema,
  updateBetaOnboardingSchema,
  removeBetaParticipantSchema,
  createBetaFeedbackSchema,
  betaFeedbackMessageSchema,
  triageBetaFeedbackSchema,
  betaProductEventSchema,
} from "@weddingos/contracts";
import { z, type ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const schemas: Record<string, ZodTypeAny> = {
  ProblemDetails: apiProblemSchema,
  CreateBetaProgram: createBetaProgramSchema,
  CreateBetaCohort: createBetaCohortSchema,
  CreateBetaInvitation: createBetaInvitationSchema,
  AcceptBetaInvitation: acceptBetaInvitationSchema,
  UpdateBetaOnboarding: updateBetaOnboardingSchema,
  RemoveBetaParticipant: removeBetaParticipantSchema,
  CreateBetaFeedback: createBetaFeedbackSchema,
  BetaFeedbackMessage: betaFeedbackMessageSchema,
  TriageBetaFeedback: triageBetaFeedbackSchema,
  BetaProductEvent: betaProductEventSchema,
  BetaResource: z
    .object({
      id: z.string().uuid().optional(),
      status: z.string().optional(),
      version: z.number().int().positive().optional(),
      releaseVersion: z.string().optional(),
      createdAt: z.string().datetime().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .passthrough(),
  CreateCopilotConversation: createCopilotConversationSchema,
  UpdateCopilotConversation: updateCopilotConversationSchema,
  CreateCopilotMessage: createCopilotMessageSchema,
  CreateCopilotFeedback: createCopilotFeedbackSchema,
  UpdateCopilotProposal: updateCopilotProposalSchema,
  ReviewCopilotProposal: reviewCopilotProposalSchema,
  ExecuteCopilotProposal: executeCopilotProposalSchema,
  CreateRisk: createRiskSchema,
  UpdateRisk: updateRiskSchema,
  RiskTransition: riskTransitionSchema,
  CreateRiskAssessment: createRiskAssessmentSchema,
  CreateRiskMitigation: createRiskMitigationSchema,
  CreateContingencyPlan: createContingencyPlanSchema,
  UpdateContingencyPlan: updateContingencyPlanSchema,
  ContingencySimulation: contingencySimulationSchema,
  ActivateContingencyPlan: activateContingencyPlanSchema,
  ContingencyTransition: contingencyTransitionSchema,
  CreateAutomationRule: createAutomationRuleSchema,
  UpdateAutomationRule: updateAutomationRuleSchema,
  ExecuteAutomationRule: executeAutomationRuleSchema,
  AutomationTransition: automationTransitionSchema,
  AutomationExecutionDecision: automationExecutionDecisionSchema,
  CreateWeeklyDigest: createWeeklyDigestSchema,
  CopilotProposalDecisionCommand: z.object({
    reason: z.string().trim().max(2000).optional(),
  }),
  CopilotProposalExecuteCommand: z.object({
    confirmHighRisk: z.boolean().optional().default(false),
  }),
  ContingencyReasonCommand: z.object({
    reason: z.string().trim().min(1).max(1000),
  }),
  AutomationDecisionCommand: z.object({
    reason: z.string().trim().max(2000).optional(),
  }),
  IntelligenceResource: z
    .object({
      id: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
      status: z.string().optional(),
      version: z.number().int().positive().optional(),
      createdAt: z.string().datetime().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .passthrough(),
  IntelligenceResourceList: z
    .object({
      items: z.array(z.record(z.unknown())),
      nextCursor: z.string().uuid().nullable().optional(),
    })
    .passthrough(),
  IntelligenceJobResponse: z
    .object({
      job: backgroundJobSchema,
      runId: z.string().uuid().optional(),
      detectionRunId: z.string().uuid().optional(),
      simulationId: z.string().uuid().optional(),
      executionId: z.string().uuid().optional(),
      digestId: z.string().uuid().optional(),
    })
    .passthrough(),
  RegisterRequest: registerRequestSchema,
  RegisterResponse: registerResponseSchema,
  EmailVerificationRequest: emailVerificationRequestSchema,
  EmailVerification: emailVerificationSchema,
  CreateSessionRequest: createSessionRequestSchema,
  SessionCreated: sessionCreatedSchema,
  NeutralAuthResponse: neutralAuthResponseSchema,
  VerifiedResponse: verifiedResponseSchema,
  PasswordResetResponse: passwordResetResponseSchema,
  PasswordResetRequest: passwordResetRequestSchema,
  PasswordReset: passwordResetSchema,
  MagicLinkRequest: magicLinkRequestSchema,
  MagicLinkExchange: magicLinkExchangeSchema,
  CurrentUser: currentUserSchema,
  ProfileUpdated: profileUpdatedSchema,
  UpdateProfileRequest: updateProfileRequestSchema,
  UserPreference: userPreferenceSchema,
  UpdateUserPreference: updateUserPreferenceSchema,
  NotificationPreference: notificationPreferenceSchema,
  UpdateNotificationPreference: updateNotificationPreferenceSchema,
  SessionSummary: sessionSummarySchema,
  WorkspaceSummary: workspaceSummarySchema,
  WorkspaceMutation: workspaceMutationSchema,
  CreateWorkspaceRequest: createWorkspaceRequestSchema,
  UpdateWorkspaceRequest: updateWorkspaceRequestSchema,
  WorkspaceBootstrap: workspaceBootstrapSchema,
  TeamMember: teamMemberSchema,
  TeamInvitation: teamInvitationSchema,
  TeamList: teamListSchema,
  PublicTeamInvitation: publicTeamInvitationSchema,
  InvitationAccepted: invitationAcceptedSchema,
  InvitationDeclined: invitationDeclinedSchema,
  CreateTeamInvitationRequest: createTeamInvitationRequestSchema,
  UpdateMemberRequest: updateMemberRequestSchema,
  BackgroundJob: backgroundJobSchema,
  Notification: notificationSchema,
  NotificationList: notificationListSchema,
  UnreadNotificationCount: unreadNotificationCountSchema,
  UpdateNotificationRequest: updateNotificationRequestSchema,
  MarkAllNotificationsRead: markAllNotificationsReadSchema,
  ActivityItem: activityItemSchema,
  ActivityList: activityListSchema,
  ActivityExportRequest: activityExportRequestSchema,
  OnboardingDraft: onboardingDraftSchema,
  UpdateOnboardingDraft: updateOnboardingDraftSchema,
  CompleteOnboardingResponse: completeOnboardingResponseSchema,
  Health: healthSchema,
  Readiness: readinessSchema,
  MfaChallengeRequest: mfaChallengeRequestSchema,
  MfaVerificationRequest: mfaVerificationRequestSchema,
  CreatePlanGenerationRequest: createPlanGenerationRequestSchema,
  CreatePlanGenerationResponse: createPlanGenerationResponseSchema,
  PlanProposal: planProposalSchema,
  PlanProposalList: planProposalListSchema,
  UpdatePlanProposal: updatePlanProposalSchema,
  RejectPlanProposal: rejectPlanProposalSchema,
  ApplyPlanProposalRequest: applyPlanProposalRequestSchema,
  ApplyPlanProposalResponse: applyPlanProposalResponseSchema,
  CreateTask: createTaskSchema,
  UpdateTask: updateTaskSchema,
  TaskTransition: taskTransitionSchema,
  TaskResource: taskResourceSchema,
  TaskList: taskListSchema,
  ReplaceTaskDependencies: replaceTaskDependenciesSchema,
  DependencyImpact: dependencyImpactSchema,
  CopyTask: copyTaskSchema,
  CreateTaskComment: createTaskCommentSchema,
  UpdateTaskComment: updateTaskCommentSchema,
  TaskComment: taskCommentSchema,
  TaskCommentList: taskCommentListSchema,
  CreateCalendarEvent: createCalendarEventSchema,
  UpdateCalendarEvent: updateCalendarEventSchema,
  CalendarEvent: calendarEventResourceSchema,
  CalendarList: calendarListSchema,
  CreateMilestone: createMilestoneSchema,
  UpdateMilestone: updateMilestoneSchema,
  TimelineMilestone: timelineMilestoneSchema,
  Timeline: timelineSchema,
  TimelineRecalculationRequest: timelineRecalculationRequestSchema,
  TimelineRecalculation: timelineRecalculationSchema,
  PlanningDashboard: planningDashboardSchema,
  SearchResponse: searchResponseSchema,
  PlanningExportRequest: planningExportRequestSchema,
  CreateHousehold: createHouseholdSchema,
  UpdateHousehold: updateHouseholdSchema,
  Household: householdSchema,
  HouseholdList: householdListSchema,
  CreateGuest: createGuestSchema,
  UpdateGuest: updateGuestSchema,
  Guest: guestSchema,
  GuestList: guestListSchema,
  CreateGuestTag: createGuestTagSchema,
  UpdateGuestTag: updateGuestTagSchema,
  GuestTag: guestTagSchema,
  GuestTagList: guestTagListSchema,
  GuestBulkCommand: guestBulkCommandSchema,
  GuestImport: guestImportSchema,
  GuestImportRow: guestImportRowSchema,
  GuestImportRowList: guestImportRowListSchema,
  ImportMapping: importMappingSchema,
  ImportRowDecision: importRowDecisionSchema,
  GuestExportRequest: exportRequestSchema,
  SaveInvitationDraft: saveInvitationDraftSchema,
  InvitationSite: invitationSiteSchema,
  CreateInvitationRecipients: createInvitationRecipientsSchema,
  InvitationRecipientList: invitationRecipientListSchema,
  CreateCampaign: createCampaignSchema,
  UpdateCampaign: updateCampaignSchema,
  CampaignTransition: campaignTransitionSchema,
  Campaign: campaignSchema,
  CampaignList: campaignListSchema,
  CampaignStatistics: campaignStatisticsSchema,
  GuestCompanionBootstrap: guestCompanionBootstrapSchema,
  GuestRsvpRequest: guestRsvpRequestSchema,
  RsvpSubmission: rsvpSubmissionSchema,
  SaveRsvpForm: saveRsvpFormSchema,
  RsvpForm: rsvpFormSchema,
  AdminRsvpOverride: adminRsvpOverrideSchema,
  CreateMenu: createMenuSchema,
  UpdateMenu: updateMenuSchema,
  Menu: menuSchema,
  MenuList: menuListSchema,
  ResolveAllergyIssue: resolveAllergyIssueSchema,
  CursorRecordList: cursorRecordListSchema,
  OperationResource: z
    .object({
      id: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
      version: z.number().int().positive().optional(),
    })
    .passthrough(),
  OperationResourceList: z
    .object({
      items: z.array(z.record(z.unknown())),
    })
    .passthrough(),
  EmptyOperationCommand: z.object({}).strict().default({}),
  PublishOperation: z
    .object({
      reason: z.string().trim().min(3).max(1000).nullable().optional(),
    })
    .default({}),
  CreateVenueSpace: createVenueSpaceSchema,
  UpdateVenueSpace: updateVenueSpaceSchema,
  CreateSeatingPlan: createSeatingPlanSchema,
  UpdateSeatingPlan: updateSeatingPlanSchema,
  CreateSeatingTable: createSeatingTableSchema,
  UpdateSeatingTable: updateSeatingTableSchema,
  UpdateSeatingSeat: updateSeatingSeatSchema,
  SeatingAssignmentBatch: seatingAssignmentBatchSchema,
  SeatingConstraint: seatingConstraintSchema,
  UpdateSeatingConstraint: seatingConstraintSchema.partial(),
  SeatingIssueResolution: issueResolutionSchema,
  SeatingSuggestionRequest: seatingSuggestionRequestSchema,
  SeatingSuggestionApply: seatingSuggestionApplySchema,
  SeatingExport: seatingExportSchema,
  UpdateTransportRequest: updateTransportRequestSchema,
  CreateTransportPlan: createTransportPlanSchema,
  UpdateTransportPlan: updateTransportPlanSchema,
  CreateTransportVehicle: createTransportVehicleSchema,
  UpdateTransportVehicle: updateTransportVehicleSchema,
  CreateTransportStop: createTransportStopSchema,
  UpdateTransportStop: updateTransportStopSchema,
  CreateTransportRoute: createTransportRouteSchema,
  UpdateTransportRoute: updateTransportRouteSchema,
  TransportAssignmentBatch: transportAssignmentBatchSchema,
  TransportManifest: transportManifestSchema,
  UpdateAccommodationRequest: updateAccommodationRequestSchema,
  CreateAccommodationProperty: createAccommodationPropertySchema,
  UpdateAccommodationProperty: updateAccommodationPropertySchema,
  CreateAccommodationRoom: createAccommodationRoomSchema,
  UpdateAccommodationRoom: updateAccommodationRoomSchema,
  CreateAccommodationStay: createAccommodationStaySchema,
  UpdateAccommodationStay: updateAccommodationStaySchema,
  AccommodationAllocationBatch: accommodationAllocationBatchSchema,
  AccommodationRoomingList: roomingListSchema,
  CreateVendorOrganization: createVendorOrganizationSchema,
  UpdateVendorOrganization: updateVendorOrganizationSchema,
  VendorInvitation: vendorInvitationSchema,
  VendorInvitationToken: vendorInvitationTokenSchema,
  UpdateVendorMember: updateVendorMemberSchema,
  UpsertVendorProfile: upsertVendorProfileSchema,
  CreateVendorService: createVendorServiceSchema,
  UpdateVendorService: updateVendorServiceSchema,
  CreateVendorPackage: createVendorPackageSchema,
  UpdateVendorPackage: updateVendorPackageSchema,
  CreateVendorAvailability: createVendorAvailabilitySchema,
  UpdateVendorAvailability: updateVendorAvailabilitySchema,
  CreateShortlist: createShortlistSchema,
  UpdateShortlist: updateShortlistSchema,
  CreateRfq: createRfqSchema,
  UpdateRfq: updateRfqSchema,
  ReplaceRfqRecipients: replaceRfqRecipientsSchema,
  RfqTransition: rfqTransitionSchema,
  CreateOffer: createOfferSchema,
  UpdateOfferDraft: updateOfferDraftSchema,
  OfferReviewTransition: offerReviewTransitionSchema,
  NegotiationMessage: negotiationMessageSchema,
  UpdateBooking: updateBookingSchema,
  BookingTransition: bookingTransitionSchema,
  UpdateContractDraft: updateContractDraftSchema,
  ContractTransition: contractTransitionSchema,
  ContractAcknowledgement: contractAcknowledgementSchema,
  ContractExport: contractExportSchema,
  UpdateBudgetPlan: updateBudgetPlanSchema,
  CreateBudgetCategory: createBudgetCategorySchema,
  UpdateBudgetCategory: updateBudgetCategorySchema,
  CreateBudgetItem: createBudgetItemSchema,
  UpdateBudgetItem: updateBudgetItemSchema,
  CreateExpense: createExpenseSchema,
  UpdateExpense: updateExpenseSchema,
  CreatePaymentSchedule: createPaymentScheduleSchema,
  UpdatePaymentSchedule: updatePaymentScheduleSchema,
  CreatePayment: createPaymentSchema,
  UpdatePayment: updatePaymentSchema,
  PaymentTransition: paymentTransitionSchema,
  CommercialExport: commercialExportSchema,
  WeddingDayExport: weddingDayExportSchema,
  WeddingDayExportResponse: z.object({
    artifactId: z.string().uuid(),
    job: backgroundJobSchema,
  }),
  CreateUploadSession: createUploadSessionSchema,
  CompleteUploadSession: completeUploadSessionSchema,
  CreateDocumentFolder: createDocumentFolderSchema,
  CreateVaultDocument: createDocumentSchema,
  UpdateVaultDocument: updateDocumentSchema,
  CreateDocumentVersion: createDocumentVersionSchema,
  CreateDocumentGrant: createDocumentGrantSchema,
  CreateSignatureEnvelope: createSignatureEnvelopeSchema,
  FakeSignatureAction: fakeSignatureActionSchema,
  CreatePaymentCheckout: createPaymentCheckoutSchema,
  FakePaymentAction: fakePaymentActionSchema,
  CreateOnlinePaymentRefund: createOnlinePaymentRefundSchema,
  ProviderWebhookEnvelope: providerWebhookEnvelopeSchema,
  CancelSignatureEnvelope: cancelSignatureEnvelopeSchema,
  PaymentReconciliation: paymentReconciliationSchema,
  UpdateDocumentFolder: updateDocumentFolderSchema,
  UpdateDocumentRetention: updateDocumentRetentionSchema,
  UpdateVendorPortfolioAsset: z.object({
    title: z.string().trim().min(1).max(180).optional(),
    altText: z.string().trim().min(1).max(500).optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    published: z.boolean().optional(),
  }),
  ContractDocumentMaterialization: z.object({
    contractVersionId: z.string().uuid(),
  }),
  VendorRfqDecline: z.object({
    reason: z.string().trim().min(2).max(2000).optional(),
  }),
  CommercialResource: z
    .object({
      id: z.string().uuid().optional(),
      workspaceId: z.string().uuid().optional(),
      vendorOrganizationId: z.string().uuid().optional(),
      status: z.string().optional(),
      version: z.number().int().positive().optional(),
      createdAt: z.string().datetime().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .passthrough(),
  CommercialResourceList: z
    .object({
      items: z.array(z.record(z.unknown())),
      nextCursor: z.string().nullable().optional(),
    })
    .passthrough(),
  CreateVendorReview: createVendorReviewSchema,
  UpdateVendorReviewDraft: updateVendorReviewDraftSchema,
  PublishVendorReview: publishVendorReviewSchema,
  VendorReviewReply: vendorReviewReplySchema,
  VendorReviewDispute: vendorReviewDisputeSchema,
  ReviewReport: reviewReportSchema,
  ModerationTransition: moderationTransitionSchema,
  ModerationDecision: moderationDecisionSchema,
  SubscriptionCheckoutRequest: subscriptionCheckoutRequestSchema,
  SubscriptionProductMutation: subscriptionProductMutationSchema,
  SubscriptionPriceMutation: subscriptionPriceMutationSchema,
  PayoutAccountRequest: payoutAccountRequestSchema,
  SettlementCalculation: settlementCalculationSchema,
  TrustMonetizationResource: trustMonetizationResourceSchema,
  TrustMonetizationList: trustMonetizationListSchema,
  CreateWeddingDayPlan: createWeddingDayPlanSchema,
  UpdateWeddingDayPlan: updateWeddingDayPlanSchema,
  CreateRunOfShowItem: createRunOfShowItemSchema,
  UpdateRunOfShowItem: updateRunOfShowItemSchema,
  RunOfShowTransition: runOfShowTransitionSchema,
  RunOfShowOrder: runOfShowOrderSchema,
  RunOfShowDependencies: runOfShowDependenciesSchema,
  CreateWeddingDayChecklist: createWeddingDayChecklistSchema,
  CreateWeddingDayChecklistItem: createWeddingDayChecklistItemSchema,
  UpdateWeddingDayChecklistItem: updateWeddingDayChecklistItemSchema,
  WeddingDayChecklistTransition: weddingDayChecklistTransitionSchema,
  CreateWeddingDayContact: createWeddingDayContactSchema,
  UpdateWeddingDayContact: updateWeddingDayContactSchema,
  CreateWeddingDayIncident: createWeddingDayIncidentSchema,
  WeddingDayIncidentTransition: weddingDayIncidentTransitionSchema,
  WeddingDayIncidentUpdate: weddingDayIncidentUpdateSchema,
  WeddingDayDecision: weddingDayDecisionSchema,
  CreateWeddingDayAnnouncement: createWeddingDayAnnouncementSchema,
  UpdateWeddingDayAnnouncement: updateWeddingDayAnnouncementSchema,
  CreateCheckInSession: createCheckInSessionSchema,
  UpdateCheckInSession: updateCheckInSessionSchema,
  CheckInSessionTransition: checkInSessionTransitionSchema,
  CreateCheckInStation: createCheckInStationSchema,
  UpdateCheckInStation: updateCheckInStationSchema,
  CreateCheckInDevice: createCheckInDeviceSchema,
  CreateCheckInCredential: createCheckInCredentialSchema,
  ValidateCheckInCredential: validateCheckInCredentialSchema,
  GuestCheckInCommand: guestCheckInCommandSchema,
  CheckInManifestRequest: checkInManifestRequestSchema,
  CheckInOfflineSync: checkInOfflineSyncSchema,
  CreateGuestMoment: createGuestMomentSchema,
  CompleteGuestMoment: completeGuestMomentSchema,
  GuestMomentTransition: guestMomentTransitionSchema,
  GuestMomentReport: guestMomentReportSchema,
  CreateGalleryCollection: createGalleryCollectionSchema,
  UpdateGalleryCollection: updateGalleryCollectionSchema,
  GalleryItems: galleryItemsSchema,
  PublicProductProofV1: publicProductProofV1Schema,
  PublicAggregateConsent: publicAggregateConsentSchema,
  UpdatePublicAggregateConsent: updatePublicAggregateConsentSchema,
  PlatformReason: platformReasonSchema,
  CreateSupportCase: createSupportCaseSchema,
  SupportCaseTransition: supportCaseTransitionSchema,
  SupportNote: supportNoteSchema,
  CreateFeatureFlag: createFeatureFlagSchema,
  UpdateFeatureFlag: updateFeatureFlagSchema,
  CreateLegalDocument: createLegalDocumentSchema,
  RecordConsent: recordConsentSchema,
  WithdrawConsent: withdrawConsentSchema,
  CookiePreference: cookiePreferenceSchema,
  CreateDataSubjectRequest: createDataSubjectRequestSchema,
  CreateDeletionRequest: createDeletionRequestSchema,
  DataSubjectTransition: dataSubjectTransitionSchema,
  CreateLegalHold: createLegalHoldSchema,
  ReleaseLegalHold: releaseLegalHoldSchema,
  CreateBackup: createBackupSchema,
  CreateRestore: createRestoreSchema,
  ScopedDeletionRequest: z.object({
    reason: z.string().trim().min(8).max(2000),
  }),
  EmptyCommand: z.object({}).strict(),
  PlatformResource: z
    .object({
      id: z.string().uuid().optional(),
      status: z.string().optional(),
      version: z.number().int().positive().optional(),
    })
    .passthrough(),
  PlatformResourceList: z
    .object({ items: z.array(z.record(z.unknown())) })
    .passthrough(),
  MfaEnrollment: z.object({
    label: z.string().trim().min(1).max(120).default("Authenticator"),
  }),
  MfaEnrollmentConfirmation: z.object({ code: z.string().regex(/^\d{6}$/) }),
  MfaDisable: z.object({
    password: z.string().min(8),
    code: z.string().min(6).max(32),
  }),
  MfaCode: z.object({ code: z.string().min(6).max(32) }),
  StepUpChallenge: z.object({
    purpose: z.string().min(3).max(120),
    password: z.string().min(8),
  }),
  StepUpVerification: z.object({
    challengeId: z.string().uuid(),
    code: z.string().min(6).max(32),
  }),
  MaintenanceWindow: z.object({
    scope: z.enum(["FULL_PLATFORM", "MUTATIONS", "MODULE", "PROVIDER"]),
    scopeKey: z.string().max(120).nullable().optional(),
    message: z.string().min(8).max(1000),
    supportUrl: z.string().url().nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime().nullable().optional(),
    reason: z.string().min(8).max(1000),
  }),
  MaintenanceTransition: z.object({
    version: z.number().int().positive(),
    reason: z.string().min(8).max(1000),
  }),
};

const requestByRoute: Array<[RegExp, string]> = [
  [/POST \/api\/v1\/platform\/beta\/programs$/, "CreateBetaProgram"],
  [/POST \/api\/v1\/platform\/beta\/cohorts$/, "CreateBetaCohort"],
  [/POST \/api\/v1\/platform\/beta\/invitations$/, "CreateBetaInvitation"],
  [
    /POST \/api\/v1\/platform\/beta\/participants\/\{participantId\}\/remove$/,
    "RemoveBetaParticipant",
  ],
  [
    /PATCH \/api\/v1\/platform\/beta\/feedback\/\{feedbackId\}$/,
    "TriageBetaFeedback",
  ],
  [/POST \/api\/v1\/beta\/invitations\/accept$/, "AcceptBetaInvitation"],
  [/PATCH \/api\/v1\/beta\/onboarding$/, "UpdateBetaOnboarding"],
  [/POST \/api\/v1\/beta\/feedback$/, "CreateBetaFeedback"],
  [
    /POST \/api\/v1\/beta\/feedback\/\{feedbackId\}\/messages$/,
    "BetaFeedbackMessage",
  ],
  [/POST \/api\/v1\/beta\/events$/, "BetaProductEvent"],
  [/POST \/api\/v1\/me\/mfa\/totp\/enrollments$/, "MfaEnrollment"],
  [
    /POST \/api\/v1\/me\/mfa\/totp\/enrollments\/\{enrollmentId\}\/confirm$/,
    "MfaEnrollmentConfirmation",
  ],
  [/DELETE \/api\/v1\/me\/mfa\/totp$/, "MfaDisable"],
  [/POST \/api\/v1\/me\/mfa\/recovery-codes\/regenerate$/, "MfaCode"],
  [/POST \/api\/v1\/auth\/step-up-challenges$/, "StepUpChallenge"],
  [/POST \/api\/v1\/auth\/step-up-verifications$/, "StepUpVerification"],
  [/POST \/api\/v1\/platform\/maintenance-windows$/, "MaintenanceWindow"],
  [
    /POST \/api\/v1\/platform\/maintenance-windows\/\{windowId\}\/(activate|complete)$/,
    "MaintenanceTransition",
  ],
  [
    /POST \/api\/v1\/platform\/(users\/\{userId\}|workspaces\/\{workspaceId\}|vendor-organizations\/\{organizationId\})\/(suspend|reactivate)$/,
    "PlatformReason",
  ],
  [/POST \/api\/v1\/platform\/support-cases$/, "CreateSupportCase"],
  [
    /POST \/api\/v1\/platform\/support-cases\/\{caseId\}\/transitions$/,
    "SupportCaseTransition",
  ],
  [
    /POST \/api\/v1\/platform\/support-cases\/\{caseId\}\/notes$/,
    "SupportNote",
  ],
  [/POST \/api\/v1\/platform\/feature-flags$/, "CreateFeatureFlag"],
  [
    /PATCH \/api\/v1\/platform\/feature-flags\/\{flagId\}$/,
    "UpdateFeatureFlag",
  ],
  [/POST \/api\/v1\/platform\/legal-documents$/, "CreateLegalDocument"],
  [
    /POST \/api\/v1\/platform\/legal-documents\/\{documentId\}\/publish$/,
    "PlatformReason",
  ],
  [
    /POST \/api\/v1\/platform\/data-subject-requests\/\{requestId\}\/transitions$/,
    "DataSubjectTransition",
  ],
  [/POST \/api\/v1\/platform\/legal-holds$/, "CreateLegalHold"],
  [
    /POST \/api\/v1\/platform\/legal-holds\/\{holdId\}\/release$/,
    "ReleaseLegalHold",
  ],
  [/POST \/api\/v1\/platform\/backups$/, "CreateBackup"],
  [
    /POST \/api\/v1\/platform\/backups\/\{backupId\}\/verify$/,
    "PlatformReason",
  ],
  [/POST \/api\/v1\/platform\/restores$/, "CreateRestore"],
  [/POST \/api\/v1\/me\/consents$/, "RecordConsent"],
  [/POST \/api\/v1\/me\/consents\/\{consentId\}\/withdraw$/, "WithdrawConsent"],
  [/POST \/api\/v1\/me\/cookie-preferences$/, "CookiePreference"],
  [/POST \/api\/v1\/me\/data-subject-requests$/, "CreateDataSubjectRequest"],
  [/POST \/api\/v1\/me\/deletion-requests$/, "CreateDeletionRequest"],
  [
    /POST \/api\/v1\/(workspaces\/\{workspaceId\}|vendor-organizations\/\{organizationId\})\/deletion-requests$/,
    "ScopedDeletionRequest",
  ],
  [
    /POST \/api\/v1\/(workspaces\/\{workspaceId\}|vendor-organizations\/\{organizationId\})\/data-exports$/,
    "EmptyCommand",
  ],
  [/POST \/api\/v1\/me\/data-exports$/, "EmptyCommand"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/conversations$/,
    "CreateCopilotConversation",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/conversations\/\{conversationId\}$/,
    "UpdateCopilotConversation",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/conversations\/\{conversationId\}\/messages$/,
    "CreateCopilotMessage",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/messages\/\{messageId\}\/feedback$/,
    "CreateCopilotFeedback",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/proposals\/\{proposalId\}\/reviews$/,
    "ReviewCopilotProposal",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/proposals\/\{proposalId\}$/,
    "UpdateCopilotProposal",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/proposals\/\{proposalId\}\/(approve|reject)$/,
    "CopilotProposalDecisionCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/proposals\/\{proposalId\}\/executions$/,
    "ExecuteCopilotProposal",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/proposals\/\{proposalId\}\/execute$/,
    "CopilotProposalExecuteCommand",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/risks$/, "CreateRisk"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/risks\/\{riskId\}$/,
    "UpdateRisk",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/risks\/\{riskId\}\/mitigations$/,
    "CreateRiskMitigation",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/risks\/\{riskId\}\/transitions$/,
    "RiskTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/risks\/\{riskId\}\/assessments$/,
    "CreateRiskAssessment",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans$/,
    "CreateContingencyPlan",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans\/\{planId\}$/,
    "UpdateContingencyPlan",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans\/\{planId\}\/simulations$/,
    "ContingencySimulation",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans\/\{planId\}\/activations$/,
    "ActivateContingencyPlan",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans\/\{planId\}\/activate$/,
    "ContingencyReasonCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans\/\{planId\}\/(approve|complete|cancel)$/,
    "ContingencyReasonCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automation-rules$/,
    "CreateAutomationRule",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/automation-rules\/\{ruleId\}$/,
    "UpdateAutomationRule",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automation-rules\/\{ruleId\}\/executions$/,
    "ExecuteAutomationRule",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automations$/,
    "CreateAutomationRule",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/automations\/\{automationId\}$/,
    "UpdateAutomationRule",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automations\/\{automationId\}\/(activate|pause)$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automations\/\{automationId\}\/(test|dry-run)$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automation-executions\/\{executionId\}\/(approve|reject)$/,
    "AutomationDecisionCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/weekly-digests$/,
    "CreateWeeklyDigest",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/public-aggregate-consent$/,
    "UpdatePublicAggregateConsent",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans$/,
    "CreateWeddingDayPlan",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}$/,
    "UpdateWeddingDayPlan",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/run-of-show\/items$/,
    "CreateRunOfShowItem",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/run-of-show\/items\/\{itemId\}$/,
    "UpdateRunOfShowItem",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/run-of-show\/items\/\{itemId\}\/transitions$/,
    "RunOfShowTransition",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/run-of-show\/order$/,
    "RunOfShowOrder",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/run-of-show\/items\/\{itemId\}\/dependencies$/,
    "RunOfShowDependencies",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/checklists$/,
    "CreateWeddingDayChecklist",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/checklists\/\{checklistId\}\/items$/,
    "CreateWeddingDayChecklistItem",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/checklist-items\/\{itemId\}$/,
    "UpdateWeddingDayChecklistItem",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/checklist-items\/\{itemId\}\/transitions$/,
    "WeddingDayChecklistTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/contacts$/,
    "CreateWeddingDayContact",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/contacts\/\{contactId\}$/,
    "UpdateWeddingDayContact",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/incidents$/,
    "CreateWeddingDayIncident",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/incidents\/\{incidentId\}\/updates$/,
    "WeddingDayIncidentUpdate",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/incidents\/\{incidentId\}\/transitions$/,
    "WeddingDayIncidentTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/incidents\/\{incidentId\}\/decisions$/,
    "WeddingDayDecision",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/announcements$/,
    "CreateWeddingDayAnnouncement",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/announcements\/\{announcementId\}$/,
    "UpdateWeddingDayAnnouncement",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions$/,
    "CreateCheckInSession",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}$/,
    "UpdateCheckInSession",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/transitions$/,
    "CheckInSessionTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/stations$/,
    "CreateCheckInStation",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/stations\/\{stationId\}$/,
    "UpdateCheckInStation",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/devices$/,
    "CreateCheckInDevice",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/credentials$/,
    "CreateCheckInCredential",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/validate$/,
    "ValidateCheckInCredential",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/(check-ins|check-outs)$/,
    "GuestCheckInCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/offline-manifests$/,
    "CheckInManifestRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions\/\{sessionId\}\/offline-sync$/,
    "CheckInOfflineSync",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/guest-moments\/\{momentId\}\/transitions$/,
    "GuestMomentTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/galleries$/,
    "CreateGalleryCollection",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day-exports$/,
    "WeddingDayExport",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/galleries\/\{galleryId\}$/,
    "UpdateGalleryCollection",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/galleries\/\{galleryId\}\/items$/,
    "GalleryItems",
  ],
  [/POST \/api\/v1\/guest\/moments$/, "CreateGuestMoment"],
  [
    /POST \/api\/v1\/guest\/moments\/\{momentId\}\/complete$/,
    "CompleteGuestMoment",
  ],
  [
    /POST \/api\/v1\/guest\/moments\/\{momentId\}\/reports$/,
    "GuestMomentReport",
  ],
  [/POST \/api\/v1\/auth\/registrations$/, "RegisterRequest"],
  [
    /POST \/api\/v1\/auth\/email-verification-requests$/,
    "EmailVerificationRequest",
  ],
  [/POST \/api\/v1\/auth\/email-verifications$/, "EmailVerification"],
  [/POST \/api\/v1\/auth\/sessions$/, "CreateSessionRequest"],
  [/POST \/api\/v1\/auth\/password-reset-requests$/, "PasswordResetRequest"],
  [/POST \/api\/v1\/auth\/password-resets$/, "PasswordReset"],
  [/POST \/api\/v1\/auth\/magic-link-requests$/, "MagicLinkRequest"],
  [/POST \/api\/v1\/auth\/magic-link-exchanges$/, "MagicLinkExchange"],
  [/PATCH \/api\/v1\/me$/, "UpdateProfileRequest"],
  [/POST \/api\/v1\/me\/mfa-challenges$/, "MfaChallengeRequest"],
  [/POST \/api\/v1\/me\/mfa-verifications$/, "MfaVerificationRequest"],
  [/PATCH \/api\/v1\/me\/preferences$/, "UpdateUserPreference"],
  [
    /PATCH \/api\/v1\/me\/notification-preferences$/,
    "UpdateNotificationPreference",
  ],
  [/POST \/api\/v1\/workspaces$/, "CreateWorkspaceRequest"],
  [/PATCH \/api\/v1\/workspaces\/\{workspaceId\}$/, "UpdateWorkspaceRequest"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/team-invitations$/,
    "CreateTeamInvitationRequest",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/members\/\{memberId\}$/,
    "UpdateMemberRequest",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/notifications\/\{notificationId\}$/,
    "UpdateNotificationRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/activity-exports$/,
    "ActivityExportRequest",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/onboarding$/,
    "UpdateOnboardingDraft",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/plan-generations$/,
    "CreatePlanGenerationRequest",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals\/\{proposalId\}$/,
    "UpdatePlanProposal",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals\/\{proposalId\}\/reject$/,
    "RejectPlanProposal",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals\/\{proposalId\}\/apply$/,
    "ApplyPlanProposalRequest",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks$/, "CreateTask"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}$/,
    "UpdateTask",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/transitions$/,
    "TaskTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/subtasks$/,
    "CreateTask",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/subtasks\/\{subtaskId\}$/,
    "UpdateTask",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/dependencies$/,
    "ReplaceTaskDependencies",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/copies$/,
    "CopyTask",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/comments$/,
    "CreateTaskComment",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/comments\/\{commentId\}$/,
    "UpdateTaskComment",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/calendar-events$/,
    "CreateCalendarEvent",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/calendar-events\/\{eventId\}$/,
    "UpdateCalendarEvent",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/milestones$/,
    "CreateMilestone",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/milestones\/\{milestoneId\}$/,
    "UpdateMilestone",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/timeline-recalculations$/,
    "TimelineRecalculationRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/planning-exports$/,
    "PlanningExportRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/households$/,
    "CreateHousehold",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/households\/\{householdId\}$/,
    "UpdateHousehold",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/guests$/, "CreateGuest"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guests\/\{guestId\}$/,
    "UpdateGuest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/guest-tags$/,
    "CreateGuestTag",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guest-tags\/\{tagId\}$/,
    "UpdateGuestTag",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/guest-bulk-commands$/,
    "GuestBulkCommand",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guest-imports\/\{importId\}\/mapping$/,
    "ImportMapping",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guest-imports\/\{importId\}\/rows\/\{rowId\}$/,
    "ImportRowDecision",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/guest-exports$/,
    "GuestExportRequest",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-site\/draft$/,
    "SaveInvitationDraft",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-recipients$/,
    "CreateInvitationRecipients",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns$/, "CreateCampaign"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns\/\{campaignId\}$/,
    "UpdateCampaign",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns\/\{campaignId\}\/transitions$/,
    "CampaignTransition",
  ],
  [/PUT \/api\/v1\/guest\/rsvp$/, "GuestRsvpRequest"],
  [/PUT \/api\/v1\/workspaces\/\{workspaceId\}\/rsvp-form$/, "SaveRsvpForm"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/rsvp-submissions\/\{submissionId\}$/,
    "AdminRsvpOverride",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/menus$/, "CreateMenu"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/menus\/\{menuId\}$/,
    "UpdateMenu",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/allergy-issues\/\{issueId\}$/,
    "ResolveAllergyIssue",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/catering-exports$/,
    "GuestExportRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/venue-spaces$/,
    "CreateVenueSpace",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/venue-spaces\/\{spaceId\}$/,
    "UpdateVenueSpace",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans$/,
    "CreateSeatingPlan",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}$/,
    "UpdateSeatingPlan",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/publish$/,
    "PublishOperation",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/unpublish$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/tables$/,
    "CreateSeatingTable",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/tables\/\{tableId\}$/,
    "UpdateSeatingTable",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/tables\/\{tableId\}\/seats\/\{seatId\}$/,
    "UpdateSeatingSeat",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/assignments$/,
    "SeatingAssignmentBatch",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/constraints$/,
    "SeatingConstraint",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/constraints\/\{constraintId\}$/,
    "UpdateSeatingConstraint",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/issues\/\{issueId\}$/,
    "SeatingIssueResolution",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/suggestions$/,
    "SeatingSuggestionRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/suggestions\/\{suggestionId\}\/apply$/,
    "SeatingSuggestionApply",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/exports$/,
    "SeatingExport",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/transport-requests\/\{requestId\}$/,
    "UpdateTransportRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans$/,
    "CreateTransportPlan",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}$/,
    "UpdateTransportPlan",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/publish$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/vehicles$/,
    "CreateTransportVehicle",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/vehicles\/\{vehicleId\}$/,
    "UpdateTransportVehicle",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/transport-stops$/,
    "CreateTransportStop",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/transport-stops\/\{stopId\}$/,
    "UpdateTransportStop",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/routes$/,
    "CreateTransportRoute",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/routes\/\{routeId\}$/,
    "UpdateTransportRoute",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/assignments$/,
    "TransportAssignmentBatch",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/transport-plans\/\{planId\}\/manifests$/,
    "TransportManifest",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-requests\/\{requestId\}$/,
    "UpdateAccommodationRequest",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-properties$/,
    "CreateAccommodationProperty",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-properties\/\{propertyId\}$/,
    "UpdateAccommodationProperty",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-properties\/\{propertyId\}\/rooms$/,
    "CreateAccommodationRoom",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-properties\/\{propertyId\}\/rooms\/\{roomId\}$/,
    "UpdateAccommodationRoom",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-stays$/,
    "CreateAccommodationStay",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-stays\/\{stayId\}$/,
    "UpdateAccommodationStay",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-stays\/\{stayId\}\/allocations$/,
    "AccommodationAllocationBatch",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-stays\/\{stayId\}\/publish$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/accommodation-stays\/\{stayId\}\/rooming-lists$/,
    "AccommodationRoomingList",
  ],
  [/POST \/api\/v1\/vendor-organizations$/, "CreateVendorOrganization"],
  [
    /POST \/api\/v1\/vendor-invitations\/(preview|accept|decline)$/,
    "VendorInvitationToken",
  ],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}$/,
    "UpdateVendorOrganization",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/invitations$/,
    "VendorInvitation",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/invitations\/\{invitationId\}\/resend$/,
    "EmptyOperationCommand",
  ],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}\/members\/\{memberId\}$/,
    "UpdateVendorMember",
  ],
  [
    /PUT \/api\/v1\/vendor-organizations\/\{organizationId\}\/profile$/,
    "UpsertVendorProfile",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/profile\/(publish|unpublish)$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/services$/,
    "CreateVendorService",
  ],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}\/services\/\{serviceId\}$/,
    "UpdateVendorService",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/services\/\{serviceId\}\/packages$/,
    "CreateVendorPackage",
  ],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}\/packages\/\{packageId\}$/,
    "UpdateVendorPackage",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/availability$/,
    "CreateVendorAvailability",
  ],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}\/availability\/\{blockId\}$/,
    "UpdateVendorAvailability",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/rfqs\/\{rfqId\}\/open$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/rfqs\/\{rfqId\}\/decline$/,
    "VendorRfqDecline",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/rfqs\/\{rfqId\}\/offers$/,
    "CreateOffer",
  ],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}\/offers\/\{offerId\}\/draft$/,
    "UpdateOfferDraft",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/offers\/\{offerId\}\/(submit|withdraw)$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/offers\/\{offerId\}\/negotiation\/messages$/,
    "NegotiationMessage",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/bookings\/\{bookingId\}\/transitions$/,
    "BookingTransition",
  ],
  [
    /PUT \/api\/v1\/vendor-organizations\/\{organizationId\}\/contracts\/\{contractId\}\/draft$/,
    "UpdateContractDraft",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/contracts\/\{contractId\}\/transitions$/,
    "ContractTransition",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/contracts\/\{contractId\}\/acknowledgements$/,
    "ContractAcknowledgement",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/vendor-shortlists$/,
    "CreateShortlist",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/vendor-shortlists\/\{shortlistId\}$/,
    "UpdateShortlist",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/vendor-(favorites\/\{vendorOrganizationId\}|shortlists\/\{shortlistId\}\/vendors\/\{vendorOrganizationId\})$/,
    "EmptyOperationCommand",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/rfqs$/, "CreateRfq"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/rfqs\/\{rfqId\}$/,
    "UpdateRfq",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/rfqs\/\{rfqId\}\/recipients$/,
    "ReplaceRfqRecipients",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/rfqs\/\{rfqId\}\/transitions$/,
    "RfqTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/offers\/\{offerId\}\/transitions$/,
    "OfferReviewTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/offers\/\{offerId\}\/negotiation\/messages$/,
    "NegotiationMessage",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/bookings\/\{bookingId\}$/,
    "UpdateBooking",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/bookings\/\{bookingId\}\/transitions$/,
    "BookingTransition",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/draft$/,
    "UpdateContractDraft",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/transitions$/,
    "ContractTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/acknowledgements$/,
    "ContractAcknowledgement",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/exports$/,
    "ContractExport",
  ],
  [/PUT \/api\/v1\/workspaces\/\{workspaceId\}\/budget$/, "UpdateBudgetPlan"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/budget\/categories$/,
    "CreateBudgetCategory",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/budget\/categories\/\{categoryId\}$/,
    "UpdateBudgetCategory",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/budget\/items$/,
    "CreateBudgetItem",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/budget\/items\/\{itemId\}$/,
    "UpdateBudgetItem",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/expenses$/, "CreateExpense"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/expenses\/\{expenseId\}$/,
    "UpdateExpense",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/payment-schedules$/,
    "CreatePaymentSchedule",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/payment-schedules\/\{scheduleId\}$/,
    "UpdatePaymentSchedule",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/payments$/, "CreatePayment"],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/payments\/\{paymentId\}$/,
    "UpdatePayment",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/payments\/\{paymentId\}\/transitions$/,
    "PaymentTransition",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/commercial-exports$/,
    "CommercialExport",
  ],
  [/POST \/api\/v1\/uploads$/, "CreateUploadSession"],
  [/POST \/api\/v1\/uploads\/\{uploadId\}\/complete$/, "CompleteUploadSession"],
  [
    /PATCH \/api\/v1\/vendor-organizations\/\{organizationId\}\/portfolio-assets\/\{assetId\}$/,
    "UpdateVendorPortfolioAsset",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/signature-envelopes\/\{envelopeId\}\/signing-link$/,
    "EmptyOperationCommand",
  ],
  [/POST \/api\/v1\/document-folders$/, "CreateDocumentFolder"],
  [/PATCH \/api\/v1\/document-folders\/\{folderId\}$/, "UpdateDocumentFolder"],
  [/POST \/api\/v1\/documents$/, "CreateVaultDocument"],
  [/PATCH \/api\/v1\/documents\/\{documentId\}$/, "UpdateVaultDocument"],
  [
    /POST \/api\/v1\/documents\/\{documentId\}\/versions$/,
    "CreateDocumentVersion",
  ],
  [/POST \/api\/v1\/documents\/\{documentId\}\/grants$/, "CreateDocumentGrant"],
  [
    /PUT \/api\/v1\/documents\/\{documentId\}\/retention$/,
    "UpdateDocumentRetention",
  ],
  [
    /POST \/api\/v1\/(?:workspaces\/\{workspaceId\}|vendor-organizations\/\{organizationId\})\/contracts\/\{contractId\}\/documents$/,
    "CreateVaultDocument",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/documents\/materializations$/,
    "ContractDocumentMaterialization",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/signature-envelopes$/,
    "CreateSignatureEnvelope",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/signature-envelopes$/,
    "CreateSignatureEnvelope",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/signature-envelopes\/\{envelopeId\}\/fake-actions$/,
    "FakeSignatureAction",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/signature-envelopes\/\{envelopeId\}\/cancel$/,
    "CancelSignatureEnvelope",
  ],
  [
    /POST \/api\/v1\/signature-signing-sessions\/\{envelopeId\}\/fake-actions$/,
    "FakeSignatureAction",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/payment-checkouts$/,
    "CreatePaymentCheckout",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/payment-checkouts\/\{checkoutId\}\/fake-actions$/,
    "FakePaymentAction",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/online-payment-transactions\/\{transactionId\}\/refunds$/,
    "CreateOnlinePaymentRefund",
  ],
  [
    /POST \/api\/v1\/provider-webhooks\/(payments|signatures)$/,
    "ProviderWebhookEnvelope",
  ],
  [
    /POST \/api\/v1\/webhooks\/(payments|electronic-signature)\/\{provider\}$/,
    "ProviderWebhookEnvelope",
  ],
  [
    /POST \/api\/v1\/internal\/payment-reconciliation$/,
    "PaymentReconciliation",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/reviews$/,
    "CreateVendorReview",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/reviews\/\{reviewId\}\/draft$/,
    "UpdateVendorReviewDraft",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/reviews\/\{reviewId\}\/publish$/,
    "PublishVendorReview",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/reviews\/\{reviewId\}\/reports$/,
    "ReviewReport",
  ],
  [
    /PUT \/api\/v1\/vendor-organizations\/\{organizationId\}\/reviews\/\{reviewId\}\/reply$/,
    "VendorReviewReply",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/reviews\/\{reviewId\}\/disputes$/,
    "VendorReviewDispute",
  ],
  [
    /POST \/api\/v1\/platform\/review-moderation\/\{caseId\}\/transitions$/,
    "ModerationTransition",
  ],
  [
    /POST \/api\/v1\/platform\/review-moderation\/\{caseId\}\/decisions$/,
    "ModerationDecision",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/subscription-checkouts$/,
    "SubscriptionCheckoutRequest",
  ],
  [
    /POST \/api\/v1\/(?:workspaces\/\{workspaceId\}\/reviews\/\{reviewId\}\/(?:submit|withdraw)|vendor-organizations\/\{organizationId\}\/(?:reviews\/\{reviewId\}\/reply\/publish|subscription-portal-sessions|subscription\/(?:cancel|resume)|payout-onboarding-links|settlements\/\{settlementId\}\/payouts)|platform\/settlements\/\{settlementId\}\/(?:finalize|payout))$/,
    "EmptyOperationCommand",
  ],
  [
    /POST \/api\/v1\/webhooks\/(?:subscriptions|payouts)\/\{provider\}$/,
    "ProviderWebhookEnvelope",
  ],
  [
    /(POST \/api\/v1\/platform\/subscription-products|PATCH \/api\/v1\/platform\/subscription-products\/\{productId\})$/,
    "SubscriptionProductMutation",
  ],
  [
    /(POST \/api\/v1\/platform\/subscription-prices|PATCH \/api\/v1\/platform\/subscription-prices\/\{priceId\})$/,
    "SubscriptionPriceMutation",
  ],
  [
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/payout-account$/,
    "PayoutAccountRequest",
  ],
  [
    /POST \/api\/v1\/platform\/settlements\/calculate$/,
    "SettlementCalculation",
  ],
];

const responseByRoute: Array<[RegExp, string]> = [
  [/(GET|POST|PATCH) \/api\/v1\/(?:platform\/)?beta(?:\/.*)?$/, "BetaResource"],
  [
    /(GET|POST|PATCH) \/api\/v1\/platform\/(dashboard|system-status|users|workspaces|vendor-organizations|support-cases|security-alerts|incidents|feature-flags|legal-documents|data-subject-requests|backups|restores|releases)(?:\/.*)?$/,
    "PlatformResource",
  ],
  [
    /(GET|POST) \/api\/v1\/me\/(privacy|consents|cookie-preferences|data-subject-requests|data-exports|deletion-requests)(?:\/.*)?$/,
    "PlatformResource",
  ],
  [
    /POST \/api\/v1\/(workspaces\/\{workspaceId\}|vendor-organizations\/\{organizationId\})\/(data-exports|deletion-requests)$/,
    "PlatformResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/(copilot\/conversations|copilot\/proposals|risks|contingency-plans|automation-templates|automation-rules|automations|automation-executions|weekly-digests)$/,
    "IntelligenceResourceList",
  ],
  [
    /(GET|POST|PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(copilot\/conversations(?:\/\{conversationId\})?|copilot\/messages\/\{messageId\}\/feedback|copilot\/proposals\/\{proposalId\}(?:\/(?:reviews|approve|reject))?|risks(?:\/\{riskId\}(?:\/(?:mitigations|transitions|assessments))?)?|contingency-plans(?:\/\{planId\}(?:\/(?:approve|complete|cancel))?)?|automation-rules(?:\/\{ruleId\})?|automations(?:\/\{automationId\}(?:\/(?:activate|pause))?)?|automation-executions\/\{executionId\}(?:\/(?:approve|reject))?)$/,
    "IntelligenceResource",
  ],
  [
    /(POST \/api\/v1\/workspaces\/\{workspaceId\}\/(copilot\/conversations\/\{conversationId\}\/messages|risk-detections|contingency-plans\/\{planId\}\/simulations|automation-rules\/\{ruleId\}\/executions|automations\/\{automationId\}\/(?:test|dry-run)|weekly-digests)|GET \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/runs\/\{runId\})$/,
    "IntelligenceJobResponse",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/(copilot\/proposals\/\{proposalId\}\/(?:executions|execute)|contingency-plans\/\{planId\}\/(?:activations|activate))$/,
    "IntelligenceResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/automation-rules\/\{ruleId\}\/executions$/,
    "IntelligenceResourceList",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/automation-executions\/\{executionId\}$/,
    "IntelligenceResource",
  ],
  [/GET \/api\/v1\/public\/product-proof$/, "PublicProductProofV1"],
  [
    /(GET|PUT) \/api\/v1\/workspaces\/\{workspaceId\}\/public-aggregate-consent$/,
    "PublicAggregateConsent",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day-exports$/,
    "WeddingDayExportResponse",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans$/,
    "OperationResourceList",
  ],
  [
    /(GET|POST|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day\/plans\/\{planId\}\/(run-of-show|checklists|incidents|announcements)$/,
    "OperationResourceList",
  ],
  [
    /(GET|POST|PATCH|PUT|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/wedding-day(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/check-in\/sessions$/,
    "OperationResourceList",
  ],
  [
    /(GET|POST|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/check-in(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/guest-moments$/,
    "OperationResourceList",
  ],
  [
    /(GET|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/guest-moments(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/galleries$/,
    "OperationResourceList",
  ],
  [
    /(POST|PATCH|PUT) \/api\/v1\/workspaces\/\{workspaceId\}\/galleries(?:\/.*)?$/,
    "OperationResource",
  ],
  [/GET \/api\/v1\/guest\/(moments|gallery)$/, "OperationResourceList"],
  [
    /(GET|POST) \/api\/v1\/guest\/(wedding-day|check-in|moments|gallery)(?:\/.*)?$/,
    "OperationResource",
  ],
  [/GET \/health$/, "Health"],
  [/GET \/ready$/, "Readiness"],
  [/POST \/api\/v1\/auth\/registrations$/, "RegisterResponse"],
  [
    /POST \/api\/v1\/auth\/(email-verification-requests|password-reset-requests|magic-link-requests)$/,
    "NeutralAuthResponse",
  ],
  [/POST \/api\/v1\/auth\/email-verifications$/, "VerifiedResponse"],
  [/POST \/api\/v1\/auth\/password-resets$/, "PasswordResetResponse"],
  [/POST \/api\/v1\/auth\/magic-link-exchanges$/, "SessionCreated"],
  [/POST \/api\/v1\/auth\/sessions$/, "SessionCreated"],
  [/GET \/api\/v1\/me$/, "CurrentUser"],
  [/PATCH \/api\/v1\/me$/, "ProfileUpdated"],
  [/GET \/api\/v1\/me\/sessions$/, "SessionSummary[]"],
  [/GET \/api\/v1\/me\/preferences$/, "UserPreference"],
  [/PATCH \/api\/v1\/me\/preferences$/, "UserPreference"],
  [/GET \/api\/v1\/me\/notification-preferences$/, "NotificationPreference"],
  [/PATCH \/api\/v1\/me\/notification-preferences$/, "NotificationPreference"],
  [/GET \/api\/v1\/workspaces$/, "WorkspaceSummary[]"],
  [/POST \/api\/v1\/workspaces$/, "WorkspaceSummary"],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/bootstrap$/,
    "WorkspaceBootstrap",
  ],
  [/PATCH \/api\/v1\/workspaces\/\{workspaceId\}$/, "WorkspaceMutation"],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/members$/, "TeamList"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/team-invitations$/,
    "TeamInvitation",
  ],
  [/GET \/api\/v1\/team-invitations\/\{token\}$/, "PublicTeamInvitation"],
  [
    /POST \/api\/v1\/team-invitations\/\{token\}\/accept$/,
    "InvitationAccepted",
  ],
  [
    /POST \/api\/v1\/team-invitations\/\{token\}\/decline$/,
    "InvitationDeclined",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/team-invitations\/\{invitationId\}\/resend$/,
    "TeamInvitation",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/members\/\{memberId\}$/,
    "TeamMember",
  ],
  [/GET \/api\/v1\/jobs\/\{jobId\}$/, "BackgroundJob"],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/notifications$/,
    "NotificationList",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/notifications\/unread-count$/,
    "UnreadNotificationCount",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/notifications\/\{notificationId\}$/,
    "Notification",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/notifications\/mark-all-read$/,
    "MarkAllNotificationsRead",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/activity$/, "ActivityList"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/activity-exports$/,
    "BackgroundJob",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/onboarding$/,
    "OnboardingDraft",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/onboarding$/,
    "OnboardingDraft",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/onboarding\/complete$/,
    "CompleteOnboardingResponse",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/plan-generations$/,
    "CreatePlanGenerationResponse",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals$/,
    "PlanProposalList",
  ],
  [
    /(GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals\/\{proposalId\}$/,
    "PlanProposal",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals\/\{proposalId\}\/reject$/,
    "PlanProposal",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/plan-proposals\/\{proposalId\}\/apply$/,
    "ApplyPlanProposalResponse",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/tasks$/, "TaskList"],
  [
    /(GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}$/,
    "TaskResource",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks$/, "TaskResource"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/(transitions|copies|subtasks)$/,
    "TaskResource",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/subtasks\/\{subtaskId\}$/,
    "TaskResource",
  ],
  [
    /PUT \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/dependencies$/,
    "DependencyImpact",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/comments$/,
    "TaskCommentList",
  ],
  [
    /(POST|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\/\{taskId\}\/comments(?:\/\{commentId\})?$/,
    "TaskComment",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/calendar-events$/,
    "CalendarList",
  ],
  [
    /(GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/calendar-events\/\{eventId\}$/,
    "CalendarEvent",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/calendar-events$/,
    "CalendarEvent",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/timeline$/, "Timeline"],
  [
    /(POST \/api\/v1\/workspaces\/\{workspaceId\}\/milestones|PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/milestones\/\{milestoneId\})$/,
    "TimelineMilestone",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/timeline-recalculations$/,
    "TimelineRecalculation",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/dashboard$/,
    "PlanningDashboard",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/search$/, "SearchResponse"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/planning-exports$/,
    "BackgroundJob",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/households$/, "HouseholdList"],
  [
    /(POST \/api\/v1\/workspaces\/\{workspaceId\}\/households|GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/households\/\{householdId\}$/,
    "Household",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/households$/, "Household"],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/guests$/, "GuestList"],
  [
    /(GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/guests\/\{guestId\}$/,
    "Guest",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/guests$/, "Guest"],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/guest-tags$/, "GuestTagList"],
  [
    /(POST \/api\/v1\/workspaces\/\{workspaceId\}\/guest-tags|PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guest-tags\/\{tagId\})$/,
    "GuestTag",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/guest-imports\/\{importId\}$/,
    "GuestImport",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guest-imports\/\{importId\}\/mapping$/,
    "GuestImport",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/guest-imports\/\{importId\}\/rows$/,
    "GuestImportRowList",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/guest-imports\/\{importId\}\/rows\/\{rowId\}$/,
    "GuestImportRow",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-site$/,
    "InvitationSite",
  ],
  [
    /(PUT \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-site\/draft|POST \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-site\/(publish|unpublish))$/,
    "InvitationSite",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-recipients$/,
    "InvitationRecipientList",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns$/, "CampaignList"],
  [
    /(GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns\/\{campaignId\}$/,
    "Campaign",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns$/, "Campaign"],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns\/\{campaignId\}\/statistics$/,
    "CampaignStatistics",
  ],
  [/GET \/api\/v1\/guest\/bootstrap$/, "GuestCompanionBootstrap"],
  [/GET \/api\/v1\/guest\/rsvp$/, "RsvpSubmission"],
  [/PUT \/api\/v1\/guest\/rsvp$/, "RsvpSubmission"],
  [/(GET|PUT) \/api\/v1\/workspaces\/\{workspaceId\}\/rsvp-form$/, "RsvpForm"],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/rsvp-form\/publish$/,
    "RsvpForm",
  ],
  [
    /PATCH \/api\/v1\/workspaces\/\{workspaceId\}\/rsvp-submissions\/\{submissionId\}$/,
    "RsvpSubmission",
  ],
  [/GET \/api\/v1\/workspaces\/\{workspaceId\}\/menus$/, "MenuList"],
  [
    /(GET|PATCH) \/api\/v1\/workspaces\/\{workspaceId\}\/menus\/\{menuId\}$/,
    "Menu",
  ],
  [/POST \/api\/v1\/workspaces\/\{workspaceId\}\/menus$/, "Menu"],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/guest-menu-selections$/,
    "CursorRecordList",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/allergy-issues$/,
    "CursorRecordList",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/(venue-spaces|seating-plans|transport-requests|transport-plans|transport-stops|accommodation-requests|accommodation-properties|accommodation-stays)$/,
    "OperationResourceList",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/seating-plans\/\{planId\}\/(constraints|issues)$/,
    "OperationResourceList",
  ],
  [
    /(GET|POST|PATCH|PUT|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(venue-spaces|seating-plans|transport-requests|transport-plans|transport-stops|accommodation-requests|accommodation-properties|accommodation-stays)(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /GET \/api\/v1\/vendor-organizations\/\{organizationId\}\/search$/,
    "TrustMonetizationList",
  ],
  [
    /(GET|POST|PATCH|PUT) \/api\/v1\/(?:workspaces\/\{workspaceId\}\/review-eligibilities|workspaces\/\{workspaceId\}\/reviews(?:\/.*)?|marketplace\/vendors\/\{slug\}\/(?:reviews|rating-summary)|vendor-subscription-plans|vendor-organizations\/\{organizationId\}\/(?:trust-monetization-overview|search|reviews|review-disputes|subscription|entitlements|usage|subscription-checkouts|subscription-portal-sessions|payout-account|payout-onboarding-links|balance|settlements|payouts)(?:\/.*)?|platform\/(?:review-moderation|subscription-products|subscription-prices|settlements)(?:\/.*)?|webhooks\/(?:subscriptions|payouts)\/\{provider\})$/,
    "TrustMonetizationResource",
  ],
  [/GET \/api\/v1\/marketplace\/vendors$/, "CommercialResourceList"],
  [/GET \/api\/v1\/marketplace\/vendors\/\{slug\}$/, "CommercialResource"],
  [/GET \/api\/v1\/vendor-organizations$/, "CommercialResource[]"],
  [
    /(GET|POST) \/api\/v1\/vendor-organizations\/\{organizationId\}\/(?:contracts\/\{contractId\}\/documents|signature-envelopes)(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /(GET|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/contracts\/\{contractId\}\/(?:documents|signature-envelopes)(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /(GET|POST|PATCH|PUT|DELETE) \/api\/v1\/vendor-invitations(?:\/.*)?$/,
    "CommercialResource",
  ],
  [
    /(GET|POST|PATCH|PUT|DELETE) \/api\/v1\/vendor-organizations(?:\/.*)?$/,
    "CommercialResource",
  ],
  [
    /(GET|POST|PATCH|PUT|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(vendor-favorites|vendor-shortlists|rfqs|offers|bookings|contracts|budget|expenses|payment-schedules|payments|commercial-exports)(?:\/.*)?$/,
    "CommercialResource",
  ],
  [/GET \/api\/v1\/documents$/, "OperationResourceList"],
  [
    /(GET|POST|PATCH|DELETE) \/api\/v1\/(uploads|documents|document-folders)(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /(GET|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/signature-envelopes(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /POST \/api\/v1\/signature-signing-sessions\/\{envelopeId\}(?:\/fake-actions)?$/,
    "OperationResource",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/(payment-checkouts|online-payment-transactions|online-payment-refunds)$/,
    "OperationResource[]",
  ],
  [
    /GET \/api\/v1\/workspaces\/\{workspaceId\}\/(payment-checkouts|online-payment-transactions|online-payment-refunds)\/\{[^}]+\}$/,
    "OperationResource",
  ],
  [
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/(payment-checkouts|online-payment-transactions)(?:\/.*)?$/,
    "OperationResource",
  ],
  [
    /POST \/api\/v1\/provider-webhooks\/(payments|signatures)$/,
    "OperationResource",
  ],
  [
    /POST \/api\/v1\/webhooks\/(payments|electronic-signature)\/\{provider\}$/,
    "OperationResource",
  ],
  [/POST \/api\/v1\/internal\/payment-reconciliation$/, "OperationResource"],
  [
    /(GET|POST|PATCH|PUT) \/api\/v1\/(?:workspaces\/\{workspaceId\}\/review-eligibilities|workspaces\/\{workspaceId\}\/reviews(?:\/.*)?|marketplace\/vendors\/\{slug\}\/(?:reviews|rating-summary)|vendor-subscription-plans|vendor-organizations\/\{organizationId\}\/(?:trust-monetization-overview|search|reviews|review-disputes|subscription|entitlements|usage|subscription-checkouts|subscription-portal-sessions|payout-account|payout-onboarding-links|balance|settlements|payouts)(?:\/.*)?|platform\/(?:review-moderation|subscription-products|subscription-prices|settlements)(?:\/.*)?|webhooks\/(?:subscriptions|payouts)\/\{provider\})$/,
    "TrustMonetizationResource",
  ],
];

export function applyOpenApiContracts(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.securitySchemes ??= {};
  document.components.securitySchemes.guestAccessToken = {
    type: "apiKey",
    in: "query",
    name: "token",
    description:
      "Opaque, revocable guest access token. Raw values are never persisted.",
  };
  document.components.securitySchemes.internalMetricsToken = {
    type: "http",
    scheme: "bearer",
    description:
      "Private-network metrics token. Never expose this endpoint through the public proxy.",
  };
  document.components.schemas = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      toOpenApiSchema(schema),
    ]),
  );
  document.components.schemas.ApiDataResponse = {
    type: "object",
    required: ["data", "meta"],
    properties: {
      data: { type: "object", additionalProperties: true },
      meta: {
        type: "object",
        required: ["requestId"],
        properties: {
          requestId: { type: "string" },
          version: { type: "integer" },
          nextCursor: { type: "string" },
        },
      },
    },
  };

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "patch", "put", "delete"] as const) {
      const operation = (pathItem as Record<string, unknown> | undefined)?.[
        method
      ] as OperationObject | undefined;
      if (!operation) continue;
      const route = `${method.toUpperCase()} ${path}`;
      operation.operationId ??= operationId(method, path);
      operation.responses ??= {};
      for (const status of Object.keys(operation.responses)) {
        if (/^2\d\d$/.test(status)) delete operation.responses[status];
      }
      const responseName = matchContract(responseByRoute, route);
      const successStatus = successStatusFor(route, method);
      if (successStatus !== "204") {
        operation.responses[successStatus] = {
          description: "Successful response",
          content: {
            "application/json": {
              schema:
                path === "/health" ||
                path === "/ready" ||
                path === "/api/v1/public/product-proof"
                  ? { $ref: `#/components/schemas/${responseName}` }
                  : responseEnvelope(responseName ?? "ApiDataResponse"),
            },
          },
        };
      } else operation.responses[successStatus] = { description: "No content" };
      operation.responses["400"] = problemResponse("Invalid request");
      operation.responses["401"] = problemResponse("Authentication required");
      operation.responses["403"] = problemResponse("Capability denied");
      operation.responses["409"] = problemResponse(
        "Version or idempotency conflict",
      );
      if (requiresIfMatch(route)) {
        operation.responses["412"] = problemResponse(
          "If-Match version is stale",
        );
        operation.responses["428"] = problemResponse(
          "Required If-Match precondition is missing",
        );
      }

      const requestName = matchContract(requestByRoute, route);
      if (requestName) {
        operation.requestBody = {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${requestName}` },
            },
          },
        };
      }
      if (route === "POST /api/v1/workspaces/{workspaceId}/guest-imports") {
        operation.requestBody = {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        };
      }
      const isPublic =
        path === "/health" ||
        path === "/ready" ||
        path === "/api/v1/status" ||
        path === "/api/v1/public/product-proof" ||
        (path.startsWith("/api/v1/auth/") &&
          !path.startsWith("/api/v1/auth/csrf") &&
          !path.startsWith("/api/v1/auth/step-up-")) ||
        path.startsWith("/api/v1/team-invitations/") ||
        path.startsWith("/api/v1/guest") ||
        path.startsWith("/api/v1/marketplace/portfolio-assets/") ||
        path.startsWith("/api/v1/provider-webhooks/") ||
        path.startsWith("/api/v1/webhooks/");
      operation.security = path.startsWith("/api/v1/guest")
        ? [{ guestAccessToken: [] }]
        : isPublic
          ? []
          : [{ cookie: [] }];
      if (path === "/api/v1/internal/metrics") {
        operation.security = [{ internalMetricsToken: [] }];
        delete operation.responses["401"];
      }
      if (isPublic) {
        delete operation.responses["401"];
        delete operation.responses["403"];
      }
      if (path === "/api/v1/public/product-proof") {
        const publicProofResponse = operation.responses["200"];
        if (publicProofResponse && !("$ref" in publicProofResponse)) {
          publicProofResponse.headers = {
            ETag: {
              description: "Strong validator for the exact public payload",
              schema: { type: "string" },
            },
            "Cache-Control": {
              description: "Public CDN cache policy; overrides global no-store",
              schema: { type: "string" },
            },
          };
        }
        operation.responses["304"] = { description: "ETag matched" };
        operation.responses["503"] = problemResponse(
          "No product proof snapshot newer than 24 hours",
        );
      }
      if (path.startsWith("/api/v1/guest"))
        (operation as OperationObject & Record<string, unknown>)[
          "x-guest-token-scoped"
        ] = true;
      if (path.startsWith("/api/v1/webhooks/email/"))
        addRequiredHeader(operation, route, "X-WeddingOS-Signature", true);
      if (
        path.startsWith("/api/v1/webhooks/payments/") ||
        path.startsWith("/api/v1/webhooks/electronic-signature/") ||
        path.startsWith("/api/v1/webhooks/subscriptions/") ||
        path.startsWith("/api/v1/webhooks/payouts/") ||
        path.startsWith("/api/v1/provider-webhooks/")
      ) {
        addRequiredHeader(
          operation,
          route,
          path.includes("subscriptions") || path.includes("payouts/")
            ? "X-WeddingOS-Signature"
            : "X-Provider-Signature",
          true,
        );
        addRequiredHeader(
          operation,
          route,
          path.includes("subscriptions") || path.includes("payouts/")
            ? "X-WeddingOS-Timestamp"
            : "X-Provider-Timestamp",
          true,
        );
      }
      if (route.includes("/mfa-")) {
        (operation as OperationObject & Record<string, unknown>)[
          "x-feature-flag"
        ] = "FEATURE_MFA_ENABLED";
        delete operation.responses[successStatus];
        operation.responses["501"] = problemResponse("Feature disabled");
      }
      if (route === "GET /api/v1/jobs/{jobId}/artifact") {
        operation.responses["200"] = {
          description: "Authorized generated artifact",
          content: {
            "text/csv": { schema: { type: "string", format: "binary" } },
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              { schema: { type: "string", format: "binary" } },
            "text/html": { schema: { type: "string" } },
          },
        };
      }
      if (route === "GET /api/v1/workspaces/{workspaceId}/calendar.ics") {
        operation.responses["200"] = {
          description: "Authorized iCalendar export",
          content: {
            "text/calendar": { schema: { type: "string" } },
          },
        };
      }
      if (route === "GET /api/v1/marketplace/portfolio-assets/{derivativeId}") {
        operation.responses["200"] = {
          description: "Published, sanitized marketplace derivative",
          content: {
            "image/webp": { schema: { type: "string", format: "binary" } },
          },
        };
      }
      if (
        /GET \/api\/v1\/workspaces\/\{workspaceId\}\/invitation-recipients\/\{recipientId\}\/qr$/.test(
          route,
        )
      ) {
        operation.responses["200"] = {
          description: "A newly rotated, recipient-scoped QR code",
          content: {
            "image/svg+xml": { schema: { type: "string" } },
            "image/png": { schema: { type: "string", format: "binary" } },
          },
        };
      }
      const capability = requiredCapability(route);
      if (capability)
        (operation as OperationObject & Record<string, unknown>)[
          "x-required-capability"
        ] = capability;
      const platformCapability = requiredPlatformCapability(route);
      if (platformCapability)
        (operation as OperationObject & Record<string, unknown>)[
          "x-required-platform-capability"
        ] = platformCapability;
      if (path.startsWith("/api/v1/signature-signing-sessions/"))
        (operation as OperationObject & Record<string, unknown>)[
          "x-required-capability"
        ] = "signature.sign";
      if (path === "/api/v1/internal/payment-reconciliation")
        (operation as OperationObject & Record<string, unknown>)[
          "x-required-capability"
        ] = "online_payment.reconcile";
      const vendorCapability = requiredVendorCapability(route);
      if (vendorCapability)
        (operation as OperationObject & Record<string, unknown>)[
          "x-required-vendor-capability"
        ] = vendorCapability;
      addRequiredHeader(
        operation,
        route,
        "Idempotency-Key",
        requiresIdempotencyKey(route),
      );
      addRequiredHeader(operation, route, "If-Match", requiresIfMatch(route));
    }
  }
  return document;
}

function matchContract(
  entries: Array<[RegExp, string]>,
  route: string,
): string | undefined {
  return entries.find(([pattern]) => pattern.test(route))?.[1];
}

function responseEnvelope(name: string): SchemaObject | ReferenceObject {
  if (name === "ApiDataResponse") {
    return { $ref: "#/components/schemas/ApiDataResponse" };
  }
  const array = name.endsWith("[]");
  const componentName = array ? name.slice(0, -2) : name;
  const item = array
    ? {
        type: "array" as const,
        items: { $ref: `#/components/schemas/${componentName}` },
      }
    : { $ref: `#/components/schemas/${componentName}` };
  return {
    type: "object",
    required: ["data", "meta"],
    properties: {
      data: item,
      meta: {
        type: "object",
        required: ["requestId"],
        properties: {
          requestId: { type: "string" },
          version: { type: "integer" },
          nextCursor: { type: "string" },
        },
      },
    },
  };
}

function successStatusFor(route: string, method: string): string {
  if (route.startsWith("DELETE /api/v1/documents/")) return "200";
  if (
    method === "delete" &&
    !route.includes("/api/v1/workspaces/{workspaceId}/")
  )
    return "204";
  if (route === "POST /api/v1/auth/registrations") return "201";
  if (
    /POST \/api\/v1\/auth\/(email-verification-requests|password-reset-requests|magic-link-requests)$/.test(
      route,
    )
  )
    return "202";
  if (method === "post" && !route.includes("/auth/")) return "201";
  return "200";
}

function requiresIdempotencyKey(route: string): boolean {
  return [
    "POST /api/v1/platform/beta/programs",
    "POST /api/v1/platform/beta/cohorts",
    "POST /api/v1/platform/beta/invitations",
    "POST /api/v1/beta/feedback",
    "/platform/users/",
    "/platform/workspaces/",
    "/platform/vendor-organizations/",
    "POST /api/v1/platform/support-cases",
    "POST /api/v1/platform/feature-flags",
    "POST /api/v1/platform/legal-holds",
    "POST /api/v1/platform/backups",
    "POST /api/v1/platform/restores",
    "POST /api/v1/me/data-subject-requests",
    "POST /api/v1/me/data-exports",
    "POST /api/v1/me/deletion-requests",
    "/data-exports",
    "/deletion-requests",
    "POST /api/v1/workspaces/{workspaceId}/wedding-day/",
    "POST /api/v1/workspaces/{workspaceId}/check-in/",
    "POST /api/v1/workspaces/{workspaceId}/guest-moments/",
    "POST /api/v1/workspaces/{workspaceId}/galleries",
    "POST /api/v1/guest/moments",
    "POST /api/v1/workspaces",
    "activity-exports",
    "onboarding/complete",
    "plan-generations",
    "plan-proposals/{proposalId}/apply",
    "POST /api/v1/workspaces/{workspaceId}/tasks",
    "/copies",
    "POST /api/v1/workspaces/{workspaceId}/calendar-events",
    "POST /api/v1/workspaces/{workspaceId}/milestones",
    "timeline-recalculations",
    "planning-exports",
    "POST /api/v1/workspaces/{workspaceId}/households",
    "POST /api/v1/workspaces/{workspaceId}/guests",
    "POST /api/v1/workspaces/{workspaceId}/guest-tags",
    "guest-bulk-commands",
    "guest-imports",
    "guest-exports",
    "invitation-site/publish",
    "invitation-recipients",
    "POST /api/v1/workspaces/{workspaceId}/campaigns",
    "/transitions",
    "rsvp-form/publish",
    "rsvp-submissions",
    "POST /api/v1/workspaces/{workspaceId}/menus",
    "catering-exports",
    "POST /api/v1/workspaces/{workspaceId}/venue-spaces",
    "POST /api/v1/workspaces/{workspaceId}/seating-plans",
    "/seating-plans/{planId}/suggestions",
    "/seating-plans/{planId}/assignments",
    "/seating-plans/{planId}/publish",
    "/seating-plans/{planId}/exports",
    "POST /api/v1/workspaces/{workspaceId}/transport-plans",
    "POST /api/v1/workspaces/{workspaceId}/transport-stops",
    "/transport-plans/{planId}/routes",
    "/transport-plans/{planId}/assignments",
    "/transport-plans/{planId}/publish",
    "/transport-plans/{planId}/manifests",
    "POST /api/v1/workspaces/{workspaceId}/accommodation-properties",
    "POST /api/v1/workspaces/{workspaceId}/accommodation-stays",
    "/accommodation-stays/{stayId}/allocations",
    "/accommodation-stays/{stayId}/publish",
    "/accommodation-stays/{stayId}/rooming-lists",
    "POST /api/v1/vendor-organizations",
    "/vendor-organizations/{organizationId}/invitations",
    "/vendor-organizations/{organizationId}/services",
    "/vendor-organizations/{organizationId}/packages",
    "/vendor-organizations/{organizationId}/availability",
    "/vendor-organizations/{organizationId}/rfqs/{rfqId}/offers",
    "/vendor-organizations/{organizationId}/negotiation/messages",
    "/vendor-organizations/{organizationId}/acknowledgements",
    "POST /api/v1/workspaces/{workspaceId}/vendor-shortlists",
    "POST /api/v1/workspaces/{workspaceId}/rfqs",
    "/workspaces/{workspaceId}/rfqs/{rfqId}/transitions",
    "/workspaces/{workspaceId}/offers/{offerId}/transitions",
    "/workspaces/{workspaceId}/offers/{offerId}/negotiation/messages",
    "/workspaces/{workspaceId}/contracts/{contractId}/acknowledgements",
    "/workspaces/{workspaceId}/contracts/{contractId}/exports",
    "/workspaces/{workspaceId}/budget/categories",
    "/workspaces/{workspaceId}/budget/items",
    "/workspaces/{workspaceId}/expenses",
    "/workspaces/{workspaceId}/payment-schedules",
    "POST /api/v1/workspaces/{workspaceId}/payments",
    "/workspaces/{workspaceId}/commercial-exports",
    "POST /api/v1/uploads",
    "POST /api/v1/documents",
    "/documents/{documentId}/versions",
    "/documents/{documentId}/grants",
    "/contracts/{contractId}/documents",
    "/contracts/{contractId}/documents/materializations",
    "/contracts/{contractId}/signature-envelopes",
    "POST /api/v1/workspaces/{workspaceId}/signature-envelopes",
    "/signature-envelopes/{envelopeId}/send",
    "POST /api/v1/workspaces/{workspaceId}/payment-checkouts",
    "/online-payment-transactions/{transactionId}/refunds",
    "POST /api/v1/workspaces/{workspaceId}/reviews",
    "/reviews/{reviewId}/publish",
    "/reviews/{reviewId}/withdraw",
    "/reviews/{reviewId}/reports",
    "/reviews/{reviewId}/reply/publish",
    "/reviews/{reviewId}/disputes",
    "subscription-checkouts",
    "subscription-portal-sessions",
    "/subscription/cancel",
    "/subscription/resume",
    "POST /api/v1/vendor-organizations/{organizationId}/payout-account",
    "payout-onboarding-links",
    "POST /api/v1/platform/subscription-products",
    "POST /api/v1/platform/subscription-prices",
    "POST /api/v1/platform/settlements",
    "POST /api/v1/workspaces/{workspaceId}/copilot/conversations",
    "/copilot/conversations/{conversationId}/messages",
    "/copilot/proposals/{proposalId}/approve",
    "/copilot/proposals/{proposalId}/reject",
    "/copilot/proposals/{proposalId}/execute",
    "/copilot/proposals/{proposalId}/executions",
    "POST /api/v1/workspaces/{workspaceId}/risks",
    "risk-detections",
    "POST /api/v1/workspaces/{workspaceId}/contingency-plans",
    "/contingency-plans/{planId}/approve",
    "/contingency-plans/{planId}/activate",
    "/contingency-plans/{planId}/activations",
    "/contingency-plans/{planId}/simulations",
    "POST /api/v1/workspaces/{workspaceId}/automation-rules",
    "POST /api/v1/workspaces/{workspaceId}/automations",
    "/automations/{automationId}/test",
    "/automations/{automationId}/dry-run",
    "/automation-rules/{ruleId}/executions",
    "/automation-executions/{executionId}/approve",
    "/automation-executions/{executionId}/reject",
    "POST /api/v1/workspaces/{workspaceId}/weekly-digests",
  ].some((pattern) => route === pattern || route.includes(pattern));
}

function requiresIfMatch(route: string): boolean {
  return (
    /PATCH \/api\/v1\/(?:platform\/)?beta\/(?:onboarding|feedback\/\{feedbackId\})$/.test(
      route,
    ) ||
    /POST \/api\/v1\/(?:platform\/beta\/participants\/\{participantId\}\/remove|beta\/feedback\/\{feedbackId\}\/messages)$/.test(
      route,
    ) ||
    /POST \/api\/v1\/platform\/(?:users\/\{userId\}|workspaces\/\{workspaceId\}|vendor-organizations\/\{organizationId\})\/(?:suspend|reactivate)$/.test(
      route,
    ) ||
    /PATCH \/api\/v1\/platform\/feature-flags\/\{flagId\}$/.test(route) ||
    /POST \/api\/v1\/platform\/(?:legal-documents\/\{documentId\}\/publish|legal-holds\/\{holdId\}\/release)$/.test(
      route,
    ) ||
    route === "PUT /api/v1/workspaces/{workspaceId}/public-aggregate-consent" ||
    /(?:PATCH|PUT|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(?:wedding-day|check-in|guest-moments|galleries)(?:\/.*)?$/.test(
      route,
    ) ||
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/(?:wedding-day\/plans\/\{planId\}\/(?:publish|go-live|pause|complete)|wedding-day\/run-of-show\/items\/\{itemId\}\/transitions|wedding-day\/checklist-items\/\{itemId\}\/transitions|wedding-day\/incidents\/\{incidentId\}\/transitions|wedding-day\/announcements\/\{announcementId\}\/(?:publish|cancel)|check-in\/sessions\/\{sessionId\}\/transitions|guest-moments\/\{momentId\}\/transitions|galleries\/\{galleryId\}\/(?:publish|unpublish))$/.test(
      route,
    ) ||
    /(?:PATCH|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/reviews\/\{reviewId\}\/(?:draft|submit|publish|withdraw)$/.test(
      route,
    ) ||
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/reviews\/\{reviewId\}\/(?:reply\/publish|disputes)$/.test(
      route,
    ) ||
    /POST \/api\/v1\/vendor-organizations\/\{organizationId\}\/subscription\/(?:cancel|resume)$/.test(
      route,
    ) ||
    /PATCH \/api\/v1\/platform\/subscription-(?:products|prices)\//.test(
      route,
    ) ||
    /POST \/api\/v1\/platform\/review-moderation\/\{caseId\}\/(?:transitions|decisions)$/.test(
      route,
    ) ||
    /POST \/api\/v1\/platform\/settlements\/\{settlementId\}\/finalize$/.test(
      route,
    ) ||
    route.includes("onboarding/complete") ||
    route.endsWith("/onboarding") ||
    route.includes("plan-generations") ||
    route.includes("plan-proposals/{proposalId}") ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/tasks\//.test(
      route,
    ) ||
    route.includes("/dependencies") ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/calendar-events\//.test(
      route,
    ) ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/milestones\//.test(
      route,
    ) ||
    route.includes("notifications/{notificationId}") ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(households|guests|guest-tags)\//.test(
      route,
    ) ||
    route.includes("guest-imports/{importId}/") ||
    route.includes("invitation-site/draft") ||
    route.includes("invitation-site/publish") ||
    route.includes("invitation-site/unpublish") ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/campaigns\//.test(
      route,
    ) ||
    route.includes("campaigns/{campaignId}/transitions") ||
    route.includes("rsvp-form/publish") ||
    route.includes("rsvp-submissions/{submissionId}") ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/menus\//.test(
      route,
    ) ||
    route.includes("allergy-issues/{issueId}") ||
    /(?:PATCH|PUT|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(venue-spaces|seating-plans|transport-requests|transport-plans|transport-stops|accommodation-requests|accommodation-properties|accommodation-stays)(?:\/.*)?$/.test(
      route,
    ) ||
    route.includes("/seating-plans/{planId}/publish") ||
    route.includes("/seating-plans/{planId}/unpublish") ||
    route.includes("/seating-plans/{planId}/suggestions") ||
    route.includes("/transport-plans/{planId}/publish") ||
    route.includes("/accommodation-stays/{stayId}/publish") ||
    /(?:PATCH|DELETE) \/api\/v1\/vendor-organizations\/\{organizationId\}(?:\/.*)?$/.test(
      route,
    ) ||
    route.includes(
      "/vendor-organizations/{organizationId}/invitations/{invitationId}/resend",
    ) ||
    /(?:PUT|POST) \/api\/v1\/vendor-organizations\/\{organizationId\}\/(profile(?:\/.*)?|rfqs\/\{rfqId\}\/(open|decline)|offers\/\{offerId\}\/(submit|withdraw)|bookings\/\{bookingId\}\/transitions|contracts\/\{contractId\}\/(draft|transitions|acknowledgements))$/.test(
      route,
    ) ||
    /(?:PATCH|PUT|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/(vendor-shortlists|rfqs|bookings|contracts|budget|expenses|payment-schedules|payments)(?:\/.*)?$/.test(
      route,
    ) ||
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/(rfqs\/\{rfqId\}\/transitions|offers\/\{offerId\}\/transitions|bookings\/\{bookingId\}\/transitions|contracts\/\{contractId\}\/(transitions|acknowledgements)|payments\/\{paymentId\}\/transitions)$/.test(
      route,
    ) ||
    route === "PATCH /api/v1/documents/{documentId}" ||
    /(?:PATCH|DELETE) \/api\/v1\/document-folders\/\{folderId\}$/.test(route) ||
    route.includes("/documents/{documentId}/versions") ||
    route.includes("/signature-envelopes/{envelopeId}/send") ||
    route.includes("/signature-envelopes/{envelopeId}/cancel") ||
    route.includes("/payment-checkouts/{checkoutId}/expire") ||
    route.includes("/online-payment-transactions/{transactionId}/refunds") ||
    /(?:PATCH|DELETE) \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/conversations\/\{conversationId\}$/.test(
      route,
    ) ||
    /(?:PATCH|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/copilot\/proposals\/\{proposalId\}(?:\/(?:approve|reject|execute))?$/.test(
      route,
    ) ||
    /(?:PATCH|DELETE|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/risks\/\{riskId\}(?:\/(?:transitions|assessments))?$/.test(
      route,
    ) ||
    /(?:PATCH|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/contingency-plans\/\{planId\}(?:\/(?:approve|activate|complete|cancel))?$/.test(
      route,
    ) ||
    /(?:PATCH|DELETE|POST) \/api\/v1\/workspaces\/\{workspaceId\}\/automations\/\{automationId\}(?:\/(?:activate|pause|test|dry-run))?$/.test(
      route,
    ) ||
    /POST \/api\/v1\/workspaces\/\{workspaceId\}\/automation-executions\/\{executionId\}\/(?:approve|reject)$/.test(
      route,
    )
  );
}

function requiredCapability(route: string): string | undefined {
  if (route.endsWith("/public-aggregate-consent"))
    return "workspace.manage_public_aggregation";
  if (!route.includes("/api/v1/workspaces/{workspaceId}/")) return undefined;
  if (route.includes("/copilot/")) {
    if (route.includes("/proposals/") && route.endsWith("/execute"))
      return "copilot.execute_proposals";
    if (
      route.includes("/proposals/") &&
      (route.endsWith("/approve") || route.endsWith("/reject"))
    )
      return "copilot.review_proposals";
    if (route.startsWith("PATCH") && route.includes("/proposals/"))
      return "copilot.create_proposal";
    return route.startsWith("GET") ? "copilot.read" : "copilot.use";
  }
  if (route.includes("/risk-detections")) return "risk.detect";
  if (route.includes("/risks")) {
    if (route.includes("/assessments")) return "risk.assess";
    return route.startsWith("GET") ? "risk.read" : "risk.write";
  }
  if (route.includes("/contingency-plans")) {
    if (route.endsWith("/approve")) return "contingency.approve";
    if (route.endsWith("/activate") || route.endsWith("/activations"))
      return "contingency.activate";
    if (route.endsWith("/complete")) return "contingency.complete";
    return route.startsWith("GET") ? "contingency.read" : "contingency.write";
  }
  if (route.includes("/automation-executions"))
    return route.startsWith("GET")
      ? "automation.view_executions"
      : "automation.approve";
  if (route.includes("/automation-templates")) return "automation.read";
  if (route.includes("/automations") || route.includes("/automation-rules")) {
    if (route.endsWith("/activate")) return "automation.activate";
    if (route.endsWith("/pause")) return "automation.pause";
    if (
      route.endsWith("/test") ||
      route.endsWith("/dry-run") ||
      route.endsWith("/executions")
    )
      return "automation.execute";
    return route.startsWith("GET") ? "automation.read" : "automation.write";
  }
  if (route.includes("/weekly-digests"))
    return route.startsWith("GET") ? "copilot.read" : "copilot.use";
  if (route.includes("/wedding-day-exports")) return "wedding_day.read";
  if (route.includes("/guest-moments"))
    return route.startsWith("GET")
      ? "guest_moment.read"
      : "guest_moment.moderate";
  if (route.includes("/galleries"))
    return route.includes("/publish") || route.includes("/unpublish")
      ? "gallery.publish"
      : route.startsWith("GET")
        ? "gallery.read"
        : "gallery.write";
  if (route.includes("/check-in/")) {
    if (route.includes("offline-manifests") || route.includes("offline-sync"))
      return "check_in.offline_sync";
    if (route.includes("/devices") || route.includes("/credentials"))
      return "check_in.manage_devices";
    if (
      route === "POST /api/v1/workspaces/{workspaceId}/check-in/sessions" ||
      route.startsWith(
        "PATCH /api/v1/workspaces/{workspaceId}/check-in/sessions/",
      ) ||
      route.includes("/sessions/{sessionId}/transitions") ||
      route.includes("/stations")
    )
      return "check_in.manage_sessions";
    return route.startsWith("GET") || route.endsWith("/validate")
      ? "check_in.read"
      : "check_in.write";
  }
  if (route.includes("/wedding-day/")) {
    if (route.includes("/contacts")) return "wedding_day.manage_contacts";
    if (route.includes("/incidents"))
      return route.startsWith("GET") ? "incident.read" : "incident.write";
    if (route.includes("/announcements"))
      return route.startsWith("GET")
        ? "announcement.read"
        : route.includes("/publish") || route.includes("/cancel")
          ? "announcement.publish"
          : "announcement.write";
    if (route.includes("/publish")) return "wedding_day.publish";
    if (
      route.includes("/go-live") ||
      route.includes("/pause") ||
      route.includes("/complete")
    )
      return "wedding_day.go_live";
    if (route.includes("/transitions")) return "wedding_day.transition";
    return route.startsWith("GET") ? "wedding_day.read" : "wedding_day.write";
  }
  if (route.includes("/review-eligibilities")) return "review.read";
  if (route.includes("/reviews")) {
    if (route.includes("/publish")) return "review.publish";
    if (route.includes("/withdraw")) return "review.withdraw";
    if (route.includes("/reports")) return "review.report";
    return route.startsWith("GET") ? "review.read" : "review.write";
  }
  if (route.includes("/contracts/{contractId}/documents"))
    return route.startsWith("GET") ? "document.read" : "document.write";
  if (route.includes("signature-envelopes")) {
    if (route.includes("/send")) return "signature.send";
    if (route.includes("/cancel")) return "signature.cancel";
    if (route.includes("/evidence")) return "signature.download_evidence";
    if (route.includes("signing-session") || route.includes("fake-actions"))
      return "signature.sign";
    return route.startsWith("GET") ? "signature.read" : "signature.create";
  }
  if (route.includes("payment-checkouts"))
    return route.includes("/expire")
      ? "online_payment.expire_checkout"
      : route.startsWith("GET")
        ? "online_payment.read"
        : "online_payment.create_checkout";
  if (route.includes("online-payment-transactions"))
    return route.includes("refunds")
      ? "online_payment.request_refund"
      : "online_payment.read";
  if (route.includes("online-payment-refunds")) return "online_payment.read";
  if (route.includes("vendor-favorites"))
    return route.startsWith("GET")
      ? "marketplace.read"
      : "marketplace.favorite";
  if (route.includes("vendor-shortlists"))
    return route.startsWith("GET")
      ? "marketplace.read"
      : "marketplace.shortlist";
  if (route.includes("/rfqs"))
    return route.includes("/transitions")
      ? "rfq.send"
      : route.startsWith("GET")
        ? "rfq.read"
        : "rfq.write";
  if (route.includes("/offers"))
    return route.includes("negotiation")
      ? route.startsWith("GET")
        ? "offer.read"
        : "offer.request_revision"
      : route.includes("/transitions")
        ? "offer.review"
        : "offer.read";
  if (route.includes("/bookings"))
    return route.includes("/transitions")
      ? "booking.transition"
      : route.startsWith("GET")
        ? "booking.read"
        : "booking.write";
  if (route.includes("/contracts"))
    return route.includes("acknowledgements")
      ? "contract.acknowledge"
      : route.includes("exports")
        ? "contract.export"
        : route.includes("/transitions")
          ? "contract.review"
          : route.startsWith("GET")
            ? "contract.read"
            : "contract.write";
  if (route.includes("/expenses"))
    return route.startsWith("GET") ? "expense.read" : "expense.write";
  if (route.includes("/budget"))
    return route.startsWith("GET") ? "budget.read" : "budget.write";
  if (route.includes("payment-schedules"))
    return route.startsWith("GET") ? "payment.read" : "payment.write";
  if (route.includes("/payments"))
    return route.includes("/transitions")
      ? "payment.confirm"
      : route.startsWith("GET")
        ? "payment.read"
        : "payment.write";
  if (route.includes("commercial-exports")) return "budget.export";
  if (route.includes("venue-spaces") || route.includes("seating-plans")) {
    if (route.includes("/assignments")) return "seating.assign";
    if (route.includes("/suggestions") && route.endsWith("/apply"))
      return "seating.assign";
    if (route.includes("/suggestions"))
      return route.startsWith("GET")
        ? "seating.read"
        : "seating.generate_suggestion";
    if (route.includes("/exports")) return "seating.export";
    if (route.includes("/publish") || route.includes("/unpublish"))
      return "seating.publish";
    return route.startsWith("GET") ? "seating.read" : "seating.write";
  }
  if (route.includes("transport-")) {
    if (route.includes("/assignments")) return "transport.assign";
    if (route.includes("/manifests")) return "transport.export";
    if (route.includes("/publish")) return "transport.publish";
    return route.startsWith("GET") ? "transport.read" : "transport.write";
  }
  if (route.includes("accommodation-")) {
    if (route.includes("/allocations")) return "accommodation.assign";
    if (route.includes("/rooming-lists")) return "accommodation.export";
    if (route.includes("/publish")) return "accommodation.publish";
    return route.startsWith("GET")
      ? "accommodation.read"
      : "accommodation.write";
  }
  if (route.includes("plan-generations")) return "planning.generate";
  if (route.includes("guest-imports")) return "guest.import";
  if (route.includes("guest-exports")) return "guest.export";
  if (
    route.includes("households") ||
    route.includes("/guests") ||
    route.includes("guest-tags") ||
    route.includes("guest-bulk-commands")
  )
    return route.startsWith("GET")
      ? "guest.read"
      : route.startsWith("DELETE")
        ? "guest.archive"
        : "guest.write";
  if (route.includes("invitation-recipients"))
    return "invitation.manage_recipients";
  if (route.includes("invitation-site"))
    return route.includes("publish")
      ? "invitation.publish"
      : route.startsWith("GET")
        ? "invitation.read"
        : "invitation.write";
  if (route.includes("campaigns"))
    return route.includes("transitions")
      ? "campaign.send"
      : route.includes("recipients") || route.includes("statistics")
        ? "campaign.view_delivery"
        : route.startsWith("GET")
          ? "campaign.read"
          : "campaign.write";
  if (route.includes("rsvp-form"))
    return route.startsWith("GET") ? "rsvp.read" : "rsvp.configure";
  if (route.includes("rsvp-submissions")) return "rsvp.override";
  if (route.includes("allergy-issues"))
    return route.startsWith("GET")
      ? "menu.read_allergies"
      : "menu.resolve_allergies";
  if (route.includes("catering-exports")) return "menu.export";
  if (route.includes("menus") || route.includes("guest-menu-selections"))
    return route.startsWith("GET") ? "menu.read" : "menu.write";
  if (route.includes("plan-proposals") && route.endsWith("/apply"))
    return "planning.apply";
  if (route.includes("plan-proposals"))
    return route.startsWith("GET") ? "planning.read" : "planning.write";
  if (route.includes("/tasks")) {
    if (route.startsWith("GET")) return "task.read";
    if (route.startsWith("DELETE")) return "task.delete";
    return route.includes("assigned") ? "task.assign" : "task.write";
  }
  if (route.includes("calendar"))
    return route.startsWith("GET") ? "calendar.read" : "calendar.write";
  if (route.includes("timeline-recalculations")) return "timeline.recalculate";
  if (route.includes("timeline") || route.includes("milestones"))
    return route.startsWith("GET") ? "timeline.read" : "timeline.write";
  if (
    route.includes("dashboard") ||
    route.includes("search") ||
    route.includes("planning-exports")
  )
    return "planning.read";
  return undefined;
}

function requiredPlatformCapability(route: string): string | undefined {
  if (!route.includes("/api/v1/platform/")) return undefined;
  if (route.includes("/platform/beta/")) {
    if (route.includes("/invitations")) return "platform.beta.invite";
    if (route.includes("/feedback") && !route.startsWith("GET"))
      return "platform.beta.triage";
    if (
      !route.startsWith("GET") ||
      route.includes("/participants/{participantId}/remove")
    )
      return "platform.beta.manage";
    return "platform.beta.read";
  }
  if (route.includes("/dashboard") || route.includes("/system-status"))
    return "platform.dashboard.read";
  if (route.includes("/users"))
    return route.startsWith("GET")
      ? "platform.user.read"
      : route.endsWith("/suspend")
        ? "platform.user.suspend"
        : "platform.user.reactivate";
  if (route.includes("/workspaces"))
    return route.startsWith("GET")
      ? "platform.workspace.read"
      : route.endsWith("/suspend")
        ? "platform.workspace.suspend"
        : "platform.workspace.reactivate";
  if (route.includes("/vendor-organizations"))
    return route.startsWith("GET")
      ? "platform.vendor.read"
      : route.endsWith("/suspend")
        ? "platform.vendor.suspend"
        : "platform.vendor.reactivate";
  if (route.includes("/support-cases"))
    return route.startsWith("GET")
      ? "platform.support.read"
      : "platform.support.write";
  if (route.includes("/security-alerts")) return "platform.security.read";
  if (route.includes("/incidents")) return "platform.dashboard.read";
  if (route.includes("/feature-flags"))
    return route.startsWith("GET")
      ? "platform.feature_flag.read"
      : "platform.feature_flag.write";
  if (
    route.includes("/legal-documents") ||
    route.includes("/data-subject-requests") ||
    route.includes("/legal-holds")
  )
    return route.startsWith("GET")
      ? "platform.privacy.read"
      : "platform.privacy.process";
  if (
    route.includes("/backups") ||
    route.includes("/restores") ||
    route.includes("/releases")
  )
    return route.startsWith("GET")
      ? "platform.release.read"
      : "platform.release.approve";
  return "platform.dashboard.read";
}

function requiredVendorCapability(route: string): string | undefined {
  if (!route.includes("/api/v1/vendor-organizations/{organizationId}"))
    return undefined;
  if (route.includes("/reviews") || route.includes("/review-disputes")) {
    if (route.includes("/reply")) return "vendor.review.reply";
    if (route.includes("/disputes")) return "vendor.review.dispute";
    return "vendor.review.read";
  }
  if (
    route.includes("/subscription") ||
    route.includes("/entitlements") ||
    route.includes("/usage") ||
    route.includes("trust-monetization-overview")
  ) {
    if (route.includes("subscription-checkouts"))
      return "vendor.subscription.checkout";
    if (route.includes("portal-sessions")) return "vendor.subscription.portal";
    if (route.includes("/cancel") || route.includes("/resume"))
      return "vendor.subscription.manage";
    if (route.includes("/usage")) return "vendor.subscription.view_usage";
    return "vendor.subscription.read";
  }
  if (
    route.includes("payout") ||
    route.includes("balance") ||
    route.includes("settlements")
  ) {
    if (route.endsWith("/payout-account") && route.startsWith("POST"))
      return "vendor.payout.onboard";
    if (route.includes("payout-onboarding-links"))
      return "vendor.payout.onboard";
    if (route.endsWith("/payouts") && route.startsWith("POST"))
      return "vendor.payout.request";
    return "vendor.payout.read";
  }
  if (route.includes("/contracts/{contractId}/documents"))
    return route.startsWith("GET") ? "document.read" : "document.write";
  if (route.includes("/signature-envelopes"))
    return route.includes("signing-link") ? "signature.sign" : "signature.read";
  if (route.includes("/profile"))
    return route.startsWith("GET")
      ? "vendor.profile.read"
      : "vendor.profile.write";
  if (route.includes("/services") || route.includes("/packages"))
    return route.startsWith("GET")
      ? "vendor.services.read"
      : "vendor.services.write";
  if (route.includes("/availability"))
    return route.startsWith("GET")
      ? "vendor.availability.read"
      : "vendor.availability.write";
  if (route.includes("/rfqs"))
    return route.endsWith("/offers")
      ? "vendor.offer.write"
      : route.includes("/decline")
        ? "vendor.rfq.decline"
        : "vendor.rfq.read";
  if (route.includes("/offers"))
    return route.includes("/submit")
      ? "vendor.offer.submit"
      : route.startsWith("GET")
        ? "vendor.offer.read"
        : "vendor.offer.write";
  if (route.includes("/bookings"))
    return route.startsWith("GET")
      ? "vendor.booking.read"
      : "vendor.booking.transition";
  if (route.includes("/contracts"))
    return route.includes("acknowledgements")
      ? "vendor.contract.acknowledge"
      : route.startsWith("GET")
        ? "vendor.contract.read"
        : "vendor.contract.write";
  if (route.includes("/members") || route.includes("/invitations"))
    return route.startsWith("GET")
      ? "vendor.members.read"
      : "vendor.members.write";
  return route.startsWith("GET")
    ? "vendor.organization.read"
    : "vendor.organization.write";
}

function problemResponse(description: string) {
  return {
    description,
    content: {
      "application/problem+json": {
        schema: { $ref: "#/components/schemas/ProblemDetails" },
      },
    },
  };
}

function addRequiredHeader(
  operation: OperationObject,
  _route: string,
  name: string,
  required: boolean,
): void {
  if (!required) return;
  operation.parameters ??= [];
  operation.parameters.push({
    name,
    in: "header",
    required: true,
    schema: { type: name === "If-Match" ? "string" : "string" },
    example: name === "If-Match" ? '"1"' : "request-uuid",
  });
}

function operationId(method: string, path: string): string {
  return `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function toOpenApiSchema(schema: ZodTypeAny): SchemaObject {
  const convert = zodToJsonSchema as unknown as (
    value: ZodTypeAny,
    options: { target: "openApi3"; $refStrategy: "none" },
  ) => unknown;
  return convert(schema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as SchemaObject;
}
