import type {
  ApiProblem,
  ApiResponse,
  ActivityList,
  ActivityExportRequest,
  BackgroundJobResource,
  CreateTeamInvitationRequest,
  CreateWorkspaceRequest,
  CurrentUser,
  EmailVerification,
  NotificationPreference,
  NotificationList,
  NotificationResource,
  OnboardingDraftResource,
  RegisterRequest,
  RegisterResponse,
  SessionCreated,
  MagicLinkSessionCreated,
  PasswordResetResponse,
  SessionSummary,
  TeamInvitation,
  TeamList,
  TeamMember,
  UpdateMemberRequest,
  UpdateNotificationPreference,
  UpdateOnboardingDraft,
  UpdateUserPreference,
  UpdateWorkspaceRequest,
  UserPreference,
  WorkspaceBootstrap,
  WorkspaceSummary,
  WorkspaceBillingOverview,
  WorkspaceSubscriptionPlanKey,
  PublicAggregateConsent,
  UpdatePublicAggregateConsent,
  ApplyPlanProposalResponse,
  CalendarItem,
  CreateCalendarEvent,
  CreatePlanGenerationRequest,
  CreatePlanGenerationResponse,
  CreateTask,
  PlanningDashboard,
  PlanProposalResource,
  TaskList,
  TaskResource,
  TaskTransitionRequest,
  TimelineMilestone,
  UpdatePlanProposal,
  UpdateTask,
  CampaignResource,
  CampaignRecipientResource,
  CreateCampaign,
  CreateGuest,
  CreateHousehold,
  CreateMenu,
  GuestCompanionBootstrapResource,
  GuestInvitationOpen,
  GuestLinkAccess,
  GuestRsvpRequest,
  GuestImportResource,
  GuestImportRowResource,
  GuestListResource,
  GuestResource,
  GuestTagResource,
  HouseholdListResource,
  HouseholdResource,
  ApplyInvitationSync,
  CreateInvitationVariant,
  InvitationPreflightResource,
  InvitationRecipientResource,
  InvitationSiteResource,
  InvitationSyncPreviewResource,
  InvitationVariantResource,
  InvitationVersionHistoryResource,
  RecipientAccessLinkResource,
  SaveInvitationVariantDraft,
  MenuResource,
  RsvpFormResource,
  RsvpDashboardResource,
  RsvpDashboardStatus,
  RsvpSubmissionResource,
  SaveInvitationDraft,
  UpdateHousehold,
  AccommodationDiscoveryQuery,
  AccommodationDiscoveryResponse,
  AccommodationRecommendationResource,
  AccommodationRecommendationStatus,
  CreateAccommodationRecommendation,
  UpdateAccommodationRecommendation,
  UpdateWorkspaceCreativeState,
  VerifiedResponse,
  WorkspaceCreativeState,
} from "@weddingos/contracts";
import {
  classifyApiProblem,
  isDemoCookieHeader,
  type ApiProblemPolicy,
} from "./transport-policy";

export { classifyApiProblem } from "./transport-policy";
export type { ApiProblemPolicy } from "./transport-policy";

export const browserApiBasePath = "/api/v1" as const;

export class ApiClientError extends Error {
  constructor(public readonly problem: ApiProblem) {
    super(problem.detail ?? problem.title);
    this.name = "ApiClientError";
  }

  get code() {
    return this.problem.code;
  }

  get status() {
    return this.problem.status;
  }
}

export class DemoModeApiBlockedError extends Error {
  constructor(public readonly path: string) {
    super("Modul demo este izolat și nu poate accesa API-ul real.");
    this.name = "DemoModeApiBlockedError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  problemPolicy?: ApiProblemPolicy;
};

let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;
const adminStepUpTokens = new Map<string, string>();

async function currentCsrfToken(force = false): Promise<string | null> {
  if (force) csrfToken = null;
  if (csrfToken) return csrfToken;
  if (!csrfPromise) {
    csrfPromise = fetch(`${browserApiBasePath}/auth/csrf`, {
      credentials: "include",
      cache: "no-store",
      headers: { "X-Correlation-ID": crypto.randomUUID() },
    })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok)
          throw new Error(`CSRF bootstrap failed (${response.status})`);
        const payload = (await response.json()) as ApiResponse<{
          token: string;
        }>;
        csrfToken = payload.data.token;
        return csrfToken;
      })
      .finally(() => {
        csrfPromise = null;
      });
  }
  return csrfPromise;
}

export function hasDemoCookie(): boolean {
  return typeof document !== "undefined" && isDemoCookieHeader(document.cookie);
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (hasDemoCookie()) {
    throw new DemoModeApiBlockedError(path);
  }
  const headers = new Headers(options.headers);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  if (options.idempotencyKey)
    headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.ifMatch !== undefined)
    headers.set("If-Match", `"${options.ifMatch}"`);
  if (!headers.has("X-Correlation-ID"))
    headers.set("X-Correlation-ID", crypto.randomUUID());

  const method = options.method?.toUpperCase() ?? "GET";
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (unsafe) {
    const token = await currentCsrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  const attempts = method === "GET" || method === "HEAD" ? 2 : 2;
  let response: Response | undefined;
  let networkError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      response = await fetch(`${browserApiBasePath}${path}`, {
        ...options,
        credentials: "include",
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: "no-store",
      });
      if (unsafe && response.status === 403 && attempt === 0) {
        const problem = (await response
          .clone()
          .json()
          .catch(() => null)) as ApiProblem | null;
        if (problem?.code === "CSRF_TOKEN_INVALID") {
          const token = await currentCsrfToken(true);
          if (token) headers.set("X-CSRF-Token", token);
          continue;
        }
      }
      if (unsafe || response.status < 500 || attempt === attempts - 1) break;
    } catch (error) {
      networkError = error;
      if (unsafe || attempt === attempts - 1) throw error;
    }
  }
  if (!response) throw networkError ?? new Error("API request failed");
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as ApiResponse<T> | ApiProblem;
  if (!response.ok) {
    const error = new ApiClientError(payload as ApiProblem);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("weddingos:api-problem", {
          detail: {
            problem: error.problem,
            policy:
              options.problemPolicy ?? classifyApiProblem(error.status),
          },
        }),
      );
    }
    throw error;
  }
  return (payload as ApiResponse<T>).data;
}

async function download(path: string): Promise<Blob> {
  if (hasDemoCookie()) throw new DemoModeApiBlockedError(path);
  const response = await fetch(`${browserApiBasePath}${path}`, {
    credentials: "include",
    cache: "no-store",
    headers: { "X-Correlation-ID": crypto.randomUUID() },
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiProblem;
    throw new ApiClientError(payload);
  }
  return response.blob();
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  if (hasDemoCookie()) throw new DemoModeApiBlockedError(path);
  const token = await currentCsrfToken();
  const requestHeaders: Record<string, string> = {
    "X-Correlation-ID": crypto.randomUUID(),
    "Idempotency-Key": crypto.randomUUID(),
  };
  if (token) requestHeaders["X-CSRF-Token"] = token;
  const response = await fetch(`${browserApiBasePath}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: requestHeaders,
    body: formData,
  });
  const payload = (await response.json()) as ApiResponse<T> | ApiProblem;
  if (!response.ok) throw new ApiClientError(payload as ApiProblem);
  return (payload as ApiResponse<T>).data;
}

async function putSigned(
  url: string,
  file: File,
  headers: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, { method: "PUT", headers, body: file });
  if (!response.ok)
    throw new Error(`Object storage upload failed (${response.status})`);
}

async function publicRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  headers.set("X-Correlation-ID", crypto.randomUUID());
  const response = await fetch(`${browserApiBasePath}${path}`, {
    ...options,
    credentials: "omit",
    cache: "no-store",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json()) as T | ApiProblem;
  if (!response.ok) throw new ApiClientError(payload as ApiProblem);
  return payload as T;
}

function queryString(
  input: Record<string, string | number | boolean | null | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export type OperationResource = {
  id: string;
  version: number;
  status?: string;
  name?: string;
  [key: string]: unknown;
};

export type BetaParticipantResource = OperationResource & {
  programId: string;
  cohortId: string;
  participantType: string;
  status: string;
  onboardingChecklist: Record<string, boolean>;
  activatedAt: string | null;
};

export type BetaFeedbackResource = OperationResource & {
  participantId: string;
  type: string;
  severity: string;
  status: string;
  currentRoute: string;
  description: string;
  expectedBehavior: string;
  actualBehavior: string;
  releaseVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type BetaStatusResource = {
  participant: BetaParticipantResource | null;
  betaAccess: boolean;
  releaseVersion?: string;
  environment?: string;
  sandbox?: boolean;
};

export type BetaMetricsResource = {
  generatedAt: string;
  environment: string;
  releaseVersion: string | null;
  participants: Array<{ status: string; _count: number }>;
  feedback: Array<{ status: string; severity: string; _count: number }>;
  productEvents: Array<{ eventName: string; _count: number }>;
  openBetaSupportCases: number;
  openIncidents: number;
  latestBackup: OperationResource | null;
};

export type PlatformDashboardResource = {
  environment: string;
  identity: "Platform Admin";
  counts: {
    users: number;
    workspaces: number;
    vendors: number;
    supportOpen: number;
    incidentsOpen: number;
    alertsOpen: number;
  };
  latestBackup: OperationResource | null;
  productionReadiness: {
    gitProvenance: boolean;
    stagingConfigured: boolean;
    tlsConfigured: boolean;
    offHostBackupConfigured: boolean;
    verdict: string;
  };
};

export type PlatformSystemStatusResource = {
  status: string;
  environment: string;
  services: Record<string, { status: string; [key: string]: unknown }>;
  maintenance: OperationResource | null;
  latestBackup: OperationResource | null;
  latestRestore: OperationResource | null;
  providers: Record<string, string>;
};

export type PlatformUserResource = OperationResource & {
  email: string;
  status: string;
  emailVerified: boolean;
  profile?: { firstName?: string; lastName?: string } | null;
  membershipCount: number;
  sessionCount: number;
};

export type PersonalPrivacyResource = {
  consents: OperationResource[];
  withdrawals: OperationResource[];
  cookie: OperationResource & {
    essential: boolean;
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  };
  requests: OperationResource[];
  deletions: OperationResource[];
  sessions: Array<{ id: string; active: boolean; lastSeenAt: string }>;
  retentionNotice: string;
};

export type CopilotConversationResource = {
  id: string;
  title: string;
  surface: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  messages?: CopilotMessageResource[];
  proposals?: CopilotProposalResource[];
};

export type CopilotMessageResource = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CopilotRunResource = {
  id: string;
  conversationId: string;
  status: string;
  provider: string | null;
  model: string | null;
  fallbackUsed: boolean;
  errorCode: string | null;
  completedAt: string | null;
  sources?: Array<{
    id: string;
    resourceType: string;
    resourceId: string;
    excerpt: string | null;
  }>;
  proposal?: CopilotProposalResource | null;
  proposals?: CopilotProposalResource[];
  plan?: {
    id: string;
    title: string;
    summary: string;
    status: string;
  } | null;
  webResearch?: {
    id: string;
    query: string;
    expiresAt: string;
    citations: Array<{ url: string; title: string; excerpt: string }>;
  } | null;
};

export type CopilotProposalResource = OperationResource & {
  runId: string;
  planId?: string | null;
  stepPosition?: number | null;
  title: string;
  summary: string;
  riskLevel: string;
  actions?: Array<
    OperationResource & {
      actionType: string;
      payload: Record<string, unknown>;
      riskLevel: string;
      position: number;
    }
  >;
};

export type CopilotSettingsResource = {
  id: string | null;
  workspaceId: string;
  memoryEnabled: boolean;
  webResearchEnabled: boolean;
  webResearchAvailable: boolean;
  proactiveSuggestions: boolean;
  memoryRetentionDays: number;
  version: number;
  updatedAt: string | null;
};

export type CopilotMemoryResource = {
  id: string;
  workspaceId: string;
  scope: "WORKSPACE" | "USER";
  ownerUserId: string | null;
  subjectType: string | null;
  subjectId: string | null;
  kind: string;
  title: string;
  content: string;
  sourceType: string;
  sourceId: string | null;
  confidence: number;
  confirmedByUser: boolean;
  sensitivity: "NORMAL" | "SENSITIVE" | "RESTRICTED";
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type RiskResource = OperationResource & {
  title: string;
  description: string | null;
  category: string;
  probability: number;
  impact: number;
  score: number;
  level: string;
  ownerMembershipId: string | null;
  dueAt: string | null;
  source: string;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  mitigations?: OperationResource[];
  contingencyPlans?: ContingencyPlanResource[];
};

export type ContingencyPlanResource = OperationResource & {
  riskId: string | null;
  title: string;
  summary: string | null;
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  triggers?: OperationResource[];
  actions?: OperationResource[];
  simulations?: OperationResource[];
};

export type AutomationRuleResource = OperationResource & {
  name: string;
  description: string | null;
  triggerType: string;
  triggerConfiguration: Record<string, unknown>;
  requiresApproval: boolean;
  dslVersion: string;
  lastExecutedAt: string | null;
  actions?: OperationResource[];
  conditions?: OperationResource[];
};

export type SeatingPlanResource = OperationResource & {
  weddingEventId: string;
  venueSpaceId: string;
  hasUnpublishedChanges: boolean;
  tables: Array<
    OperationResource & {
      label: string;
      shape: "round" | "rectangle" | "oval" | "square" | "custom";
      capacity: number;
      minimumCapacity: number | null;
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      position: number;
      zone: string | null;
      notesPrivate: string | null;
      locked: boolean;
      assigned: number;
      seats: Array<
        OperationResource & {
          label: string;
          position: number;
          accessible: boolean;
          status: "available" | "blocked" | "reserved";
        }
      >;
    }
  >;
  assignments: Array<
    OperationResource & {
      guestId: string;
      seatingTableId: string;
      seatingSeatId: string | null;
      source: string;
      status: string;
      locked: boolean;
    }
  >;
  guests: Array<
    OperationResource & {
      firstName: string;
      lastName: string;
      displayName: string | null;
      householdId: string;
      householdName: string | null;
      isChild: boolean;
      isPlusOne: boolean;
      menu: {
        id: string;
        name: string;
        selectionId: string;
        selectionVersion: number;
      } | null;
      allergies?: Array<{
        id: string;
        label: string;
        severity: string;
      }>;
      eligible: boolean;
      assigned: boolean;
    }
  >;
  constraints: OperationResource[];
  issues: OperationResource[];
};

export type SeatingSuggestionResource = OperationResource & {
  status: string;
  unassignedGuestIds: string[];
  hardConflicts: unknown[];
  warnings: unknown[];
  violatedOptionalPreferences: unknown[];
  tableUtilization: Record<string, unknown> | unknown[];
  score: number;
  assignments: Array<
    OperationResource & {
      guestId: string;
      tableId: string;
      seatId: string | null;
      rationale: unknown;
    }
  >;
};

export type OrganizerMenuSelectionResource = {
  id?: string;
  guestId: string;
  menuId: string | null;
  menuName: string | null;
  selectedAt?: string;
  source?: string;
  version: number | null;
};

export type TransportPlanResource = OperationResource & {
  weddingEventId: string;
  vehicles: OperationResource[];
  routes: Array<
    OperationResource & {
      direction: string;
      departureAt: string;
      originName: string;
      destinationName: string;
      vehicleId: string | null;
      assignments: OperationResource[];
      stops: OperationResource[];
    }
  >;
  issues: OperationResource[];
};

export type AccommodationStayResource = OperationResource & {
  propertyId: string;
  checkInDate: string;
  checkOutDate: string;
  property: OperationResource;
  rooms: Array<OperationResource & { allocations: OperationResource[] }>;
  issues: OperationResource[];
};

export const weddingOsApi = {
  mfaStatus: () =>
    request<{
      required: boolean;
      enrolled: boolean;
      pendingEnrollmentId: string | null;
      recoveryCodesRemaining: number;
    }>("/me/mfa"),
  enrollMfa: (label = "Sarbato Authenticator") =>
    request<{
      enrollmentId: string;
      secret: string;
      provisioningUri: string;
      qrDataUrl: string;
      expiresInSeconds: number;
    }>("/me/mfa/totp/enrollments", { method: "POST", body: { label } }),
  confirmMfa: (enrollmentId: string, code: string) =>
    request<{ enrolled: true; recoveryCodes: string[] }>(
      `/me/mfa/totp/enrollments/${encodeURIComponent(enrollmentId)}/confirm`,
      { method: "POST", body: { code } },
    ),
  createAdminStepUp: (purpose: string, password: string) =>
    request<{ challengeId: string; purpose: string; expiresAt: string }>(
      "/auth/step-up-challenges",
      { method: "POST", body: { purpose, password } },
    ),
  verifyAdminStepUp: (challengeId: string, code: string) =>
    request<{ stepUpToken: string; purpose: string; expiresAt: string }>(
      "/auth/step-up-verifications",
      { method: "POST", body: { challengeId, code } },
    ).then((result) => {
      adminStepUpTokens.set(result.purpose, result.stepUpToken);
      return result;
    }),
  platformDashboard: () =>
    request<PlatformDashboardResource>("/platform/dashboard"),
  platformSystemStatus: () =>
    request<PlatformSystemStatusResource>("/platform/system-status"),
  betaStatus: () => request<BetaStatusResource>("/beta/status"),
  acceptBetaInvitation: (token: string, analyticsConsent: boolean) =>
    request<{
      participant: BetaParticipantResource;
      analyticsConsent: boolean;
      releaseVersion: string;
    }>("/beta/invitations/accept", {
      method: "POST",
      body: {
        token,
        betaTermsAccepted: true,
        privacyNoticeAcknowledged: true,
        knownLimitationsAcknowledged: true,
        analyticsConsent,
      },
    }),
  updateBetaOnboarding: (version: number, checklist: Record<string, boolean>) =>
    request<BetaParticipantResource>("/beta/onboarding", {
      method: "PATCH",
      body: { version, checklist },
      ifMatch: version,
    }),
  betaFeedback: () =>
    request<{ items: BetaFeedbackResource[] }>("/beta/feedback"),
  createBetaFeedback: (input: Record<string, unknown>) =>
    request<BetaFeedbackResource>("/beta/feedback", {
      method: "POST",
      body: input,
      idempotencyKey: crypto.randomUUID(),
    }),
  betaFeedbackDetail: (feedbackId: string) =>
    request<
      BetaFeedbackResource & {
        messages: OperationResource[];
        history: OperationResource[];
      }
    >(`/beta/feedback/${encodeURIComponent(feedbackId)}`),
  addBetaFeedbackMessage: (feedbackId: string, version: number, body: string) =>
    request<OperationResource>(
      `/beta/feedback/${encodeURIComponent(feedbackId)}/messages`,
      {
        method: "POST",
        body: { body, version },
        ifMatch: version,
      },
    ),
  recordBetaEvent: (input: Record<string, unknown>) =>
    request<{ recorded: boolean; reason?: string; eventId?: string }>(
      "/beta/events",
      { method: "POST", body: input },
    ),
  platformBetaPrograms: () =>
    request<{ items: OperationResource[] }>("/platform/beta/programs"),
  createPlatformBetaProgram: (input: Record<string, unknown>) =>
    request<OperationResource>("/platform/beta/programs", {
      method: "POST",
      body: input,
      idempotencyKey: crypto.randomUUID(),
    }),
  platformBetaCohorts: () =>
    request<{ items: OperationResource[] }>("/platform/beta/cohorts"),
  createPlatformBetaCohort: (input: Record<string, unknown>) =>
    request<OperationResource>("/platform/beta/cohorts", {
      method: "POST",
      body: input,
      idempotencyKey: crypto.randomUUID(),
    }),
  platformBetaParticipants: () =>
    request<{ items: BetaParticipantResource[] }>(
      "/platform/beta/participants",
    ),
  platformBetaInvitations: () =>
    request<{ items: OperationResource[] }>("/platform/beta/invitations"),
  createPlatformBetaInvitation: (input: Record<string, unknown>) =>
    request<{
      invitation: OperationResource;
      acceptanceToken: string | null;
      tokenDisclosure: string;
    }>("/platform/beta/invitations", {
      method: "POST",
      body: input,
      idempotencyKey: crypto.randomUUID(),
    }),
  removePlatformBetaParticipant: (
    participantId: string,
    version: number,
    reason: string,
  ) =>
    request<BetaParticipantResource>(
      `/platform/beta/participants/${encodeURIComponent(participantId)}/remove`,
      {
        method: "POST",
        body: { version, reason },
        ifMatch: version,
      },
    ),
  platformBetaFeedback: () =>
    request<{ items: BetaFeedbackResource[] }>("/platform/beta/feedback"),
  triagePlatformBetaFeedback: (
    feedbackId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<BetaFeedbackResource>(
      `/platform/beta/feedback/${encodeURIComponent(feedbackId)}`,
      {
        method: "PATCH",
        body: { ...input, version },
        ifMatch: version,
      },
    ),
  platformBetaMetrics: () =>
    request<BetaMetricsResource>("/platform/beta/metrics"),
  platformBetaExitCriteria: () =>
    request<{
      checks: Record<string, boolean>;
      passed: boolean;
      publicLaunchReady: false;
      verdict: string;
      metrics: BetaMetricsResource;
    }>("/platform/beta/exit-criteria"),
  platformUsers: () =>
    request<{ items: PlatformUserResource[] }>("/platform/users"),
  platformWorkspaces: () =>
    request<{ items: OperationResource[] }>("/platform/workspaces"),
  platformVendors: () =>
    request<{ items: OperationResource[] }>("/platform/vendor-organizations"),
  platformSupportCases: () =>
    request<{ items: OperationResource[] }>("/platform/support-cases"),
  platformIncidents: () =>
    request<{ items: OperationResource[] }>("/platform/incidents"),
  platformSecurityAlerts: () =>
    request<{ items: OperationResource[] }>("/platform/security-alerts"),
  platformFeatureFlags: () =>
    request<{ items: OperationResource[] }>("/platform/feature-flags"),
  platformBackups: () =>
    request<{ items: OperationResource[] }>("/platform/backups"),
  platformBackupSchedules: () =>
    request<{ items: OperationResource[] }>("/platform/backup-schedules"),
  platformRetentionRuns: () =>
    request<{ policies: OperationResource[]; items: OperationResource[] }>(
      "/platform/retention-runs",
    ),
  runPlatformRetention: (
    policyId: string,
    version: number,
    mode: "DRY_RUN" | "EXECUTE",
    reason: string,
  ) =>
    request<OperationResource>("/platform/retention-runs", {
      method: "POST",
      headers: adminStepUpTokens.get("RETENTION_EXECUTION")
        ? {
            "X-Admin-Step-Up": adminStepUpTokens.get("RETENTION_EXECUTION")!,
          }
        : undefined,
      body: {
        policyId,
        mode,
        limit: 250,
        reason,
        ...(mode === "EXECUTE" ? { confirmation: "EXECUTE_RETENTION" } : {}),
      },
      ifMatch: version,
      idempotencyKey: crypto.randomUUID(),
    }),
  setPlatformBackupSchedule: (
    scheduleId: string,
    enabled: boolean,
    version: number,
    reason: string,
  ) =>
    request<OperationResource>(
      `/platform/backup-schedules/${encodeURIComponent(scheduleId)}/${enabled ? "resume" : "pause"}`,
      {
        method: "POST",
        headers: adminStepUpTokens.get("BACKUP_POLICY_CHANGE")
          ? {
              "X-Admin-Step-Up": adminStepUpTokens.get("BACKUP_POLICY_CHANGE")!,
            }
          : undefined,
        body: { version, reason },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createPlatformBackup: (
    backupType: "DATABASE" | "OBJECT_INVENTORY" | "FULL",
    reason: string,
  ) =>
    request<OperationResource>("/platform/backups", {
      method: "POST",
      body: { backupType, reason },
      idempotencyKey: crypto.randomUUID(),
    }),
  verifyPlatformBackup: (backupId: string, version: number, reason: string) =>
    request<OperationResource>(
      `/platform/backups/${encodeURIComponent(backupId)}/verify`,
      {
        method: "POST",
        headers: adminStepUpTokens.get("RESTORE_APPROVAL")
          ? {
              "X-Admin-Step-Up": adminStepUpTokens.get("RESTORE_APPROVAL")!,
            }
          : undefined,
        body: { version, reason },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  platformRestores: () =>
    request<{ items: OperationResource[] }>("/platform/restores"),
  platformReleases: () =>
    request<{ items: OperationResource[] }>("/platform/releases"),
  changePlatformUserStatus: (
    userId: string,
    action: "suspend" | "reactivate",
    version: number,
    reason: string,
  ) =>
    request<PlatformUserResource>(
      `/platform/users/${encodeURIComponent(userId)}/${action}`,
      {
        method: "POST",
        headers:
          action === "suspend" && adminStepUpTokens.get("USER_SUSPEND")
            ? { "X-Admin-Step-Up": adminStepUpTokens.get("USER_SUSPEND")! }
            : undefined,
        body: { reason, version },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  changePlatformWorkspaceStatus: (
    workspaceId: string,
    action: "suspend" | "reactivate",
    version: number,
    reason: string,
  ) =>
    request<OperationResource>(
      `/platform/workspaces/${encodeURIComponent(workspaceId)}/${action}`,
      {
        method: "POST",
        headers:
          action === "suspend" && adminStepUpTokens.get("WORKSPACE_SUSPEND")
            ? {
                "X-Admin-Step-Up": adminStepUpTokens.get("WORKSPACE_SUSPEND")!,
              }
            : undefined,
        body: { reason, version },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  changePlatformVendorStatus: (
    organizationId: string,
    action: "suspend" | "reactivate",
    version: number,
    reason: string,
  ) =>
    request<OperationResource>(
      `/platform/vendor-organizations/${encodeURIComponent(organizationId)}/${action}`,
      {
        method: "POST",
        headers:
          action === "suspend" && adminStepUpTokens.get("VENDOR_SUSPEND")
            ? {
                "X-Admin-Step-Up": adminStepUpTokens.get("VENDOR_SUSPEND")!,
              }
            : undefined,
        body: { reason, version },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  privacyOverview: () => request<PersonalPrivacyResource>("/me/privacy"),
  saveCookiePreferences: (input: {
    preferences: boolean;
    analytics: boolean;
    marketing: boolean;
  }) =>
    request<OperationResource>("/me/cookie-preferences", {
      method: "POST",
      body: input,
    }),
  requestPersonalDataExport: () =>
    request<OperationResource>("/me/data-exports", {
      method: "POST",
      idempotencyKey: crypto.randomUUID(),
    }),
  requestAccountDeletion: (userId: string, reason: string) =>
    request<OperationResource>("/me/deletion-requests", {
      method: "POST",
      body: { targetType: "USER_ACCOUNT", targetId: userId, reason },
      idempotencyKey: crypto.randomUUID(),
    }),
  requestWorkspaceDataExport: (workspaceId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/data-exports`,
      {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  requestWorkspaceDeletion: (workspaceId: string, reason: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/deletion-requests`,
      {
        method: "POST",
        body: { reason },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  requestVendorDataExport: (organizationId: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/data-exports`,
      {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  requestVendorDeletion: (organizationId: string, reason: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/deletion-requests`,
      {
        method: "POST",
        body: { reason },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  register: (input: RegisterRequest) =>
    request<RegisterResponse>("/auth/registrations", {
      method: "POST",
      body: input,
    }),
  requestEmailVerification: (email: string) =>
    request<{ accepted: true }>("/auth/email-verification-requests", {
      method: "POST",
      body: { email },
    }),
  verifyEmail: (input: EmailVerification) =>
    request<VerifiedResponse>("/auth/email-verifications", {
      method: "POST",
      body: input,
    }),
  signIn: (email: string, password: string, remember: boolean) =>
    request<SessionCreated>("/auth/sessions", {
      method: "POST",
      body: { email, password, remember },
      problemPolicy: "inline",
    }),
  logout: () =>
    request<void>("/auth/session", {
      method: "DELETE",
      problemPolicy: "inline",
    }),
  requestPasswordReset: (email: string, returnTo?: string | null) =>
    request<{ accepted: true }>("/auth/password-reset-requests", {
      method: "POST",
      body: { email, returnTo: returnTo ?? undefined },
      problemPolicy: "inline",
    }),
  resetPassword: (token: string, password: string) =>
    request<PasswordResetResponse>("/auth/password-resets", {
      method: "POST",
      body: { token, password },
      problemPolicy: "inline",
    }),
  requestMagicLink: (email: string, returnTo?: string | null) =>
    request<{ accepted: true }>("/auth/magic-link-requests", {
      method: "POST",
      body: { email, returnTo: returnTo ?? undefined },
      problemPolicy: "inline",
    }),
  exchangeMagicLink: (token: string) =>
    request<MagicLinkSessionCreated>("/auth/magic-link-exchanges", {
      method: "POST",
      body: { token },
      problemPolicy: "inline",
    }),
  me: () => request<CurrentUser>("/me"),
  updateProfile: (firstName: string, lastName: string) =>
    request<{ firstName: string; lastName: string; version: number }>("/me", {
      method: "PATCH",
      body: { firstName, lastName },
    }),
  sessions: () => request<SessionSummary[]>("/me/sessions"),
  revokeSession: (sessionId: string) =>
    request<void>(`/me/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    }),
  preference: () => request<UserPreference>("/me/preferences"),
  updatePreference: (input: UpdateUserPreference) =>
    request<UserPreference>("/me/preferences", {
      method: "PATCH",
      body: input,
    }),
  notificationPreference: () =>
    request<NotificationPreference>("/me/notification-preferences"),
  updateNotificationPreference: (input: UpdateNotificationPreference) =>
    request<NotificationPreference>("/me/notification-preferences", {
      method: "PATCH",
      body: input,
    }),
  workspaces: () => request<WorkspaceSummary[]>("/workspaces"),
  createWorkspace: (
    input: CreateWorkspaceRequest,
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<WorkspaceSummary & { version: number }>("/workspaces", {
      method: "POST",
      body: input,
      idempotencyKey,
    }),
  workspaceBootstrap: (workspaceId: string) =>
    request<WorkspaceBootstrap>(
      `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`,
    ),
  workspaceBilling: (workspaceId: string) =>
    request<
      WorkspaceBillingOverview & {
        clientToken: string | null;
        paddleEnvironment: "sandbox" | "production";
      }
    >(`/workspaces/${encodeURIComponent(workspaceId)}/billing`),
  startWorkspaceCheckout: (
    workspaceId: string,
    plan: Exclude<WorkspaceSubscriptionPlanKey, "FREE">,
  ) =>
    request<{
      mode: "checkout" | "portal";
      url: string;
      transactionId?: string;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/billing/checkout`, {
      method: "POST",
      body: { plan },
      idempotencyKey: crypto.randomUUID(),
    }),
  workspaceBillingPortal: (workspaceId: string) =>
    request<{ url: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/billing/portal`,
      { method: "POST" },
    ),
  publicAggregateConsent: (workspaceId: string) =>
    request<PublicAggregateConsent>(
      `/workspaces/${encodeURIComponent(workspaceId)}/public-aggregate-consent`,
    ),
  updatePublicAggregateConsent: (
    workspaceId: string,
    input: UpdatePublicAggregateConsent,
    version: number,
  ) =>
    request<PublicAggregateConsent>(
      `/workspaces/${encodeURIComponent(workspaceId)}/public-aggregate-consent`,
      {
        method: "PUT",
        body: input,
        ifMatch: version,
      },
    ),
  updateWorkspace: (workspaceId: string, input: UpdateWorkspaceRequest) =>
    request<{
      id: string;
      title: string;
      weddingDate: string | null;
      location: string | null;
      timezone: string;
      currency: string;
      version: number;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      body: input,
    }),
  team: (workspaceId: string) =>
    request<TeamList>(`/workspaces/${encodeURIComponent(workspaceId)}/members`),
  invite: (workspaceId: string, input: CreateTeamInvitationRequest) =>
    request<TeamInvitation>(
      `/workspaces/${encodeURIComponent(workspaceId)}/team-invitations`,
      {
        method: "POST",
        body: input,
      },
    ),
  invitation: (token: string) =>
    request<TeamInvitation & { weddingDate: string | null }>(
      `/team-invitations/${encodeURIComponent(token)}`,
    ),
  acceptInvitation: (token: string) =>
    request<{ workspaceId: string; membershipId: string }>(
      `/team-invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST", problemPolicy: "inline" },
    ),
  declineInvitation: (token: string) =>
    request<{ declined: true }>(
      `/team-invitations/${encodeURIComponent(token)}/decline`,
      {
        method: "POST",
        problemPolicy: "inline",
      },
    ),
  vendorInvitationPreview: (token: string) =>
    request<{
      id: string;
      vendorOrganizationId: string;
      organizationName: string;
      roleName: string;
      expiresAt: string;
      version: number;
    }>("/vendor-invitations/preview", {
      method: "POST",
      body: { token },
      problemPolicy: "inline",
    }),
  acceptVendorInvitation: (token: string) =>
    request<{
      accepted: true;
      invitationId: string;
      vendorOrganizationId: string;
      membershipId: string;
    }>("/vendor-invitations/accept", {
      method: "POST",
      body: { token },
      problemPolicy: "inline",
    }),
  declineVendorInvitation: (token: string) =>
    request<{ declined: true }>("/vendor-invitations/decline", {
      method: "POST",
      body: { token },
      problemPolicy: "inline",
    }),
  resendInvitation: (workspaceId: string, invitationId: string) =>
    request<TeamInvitation>(
      `/workspaces/${encodeURIComponent(workspaceId)}/team-invitations/${encodeURIComponent(invitationId)}/resend`,
      { method: "POST" },
    ),
  revokeInvitation: (workspaceId: string, invitationId: string) =>
    request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/team-invitations/${encodeURIComponent(invitationId)}`,
      { method: "DELETE" },
    ),
  updateMember: (
    workspaceId: string,
    memberId: string,
    input: UpdateMemberRequest,
  ) =>
    request<TeamMember>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
      { method: "PATCH", body: input },
    ),
  removeMember: (workspaceId: string, memberId: string) =>
    request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE" },
    ),
  job: (jobId: string) =>
    request<BackgroundJobResource>(`/jobs/${encodeURIComponent(jobId)}`),
  downloadJobArtifact: (jobId: string) =>
    download(`/jobs/${encodeURIComponent(jobId)}/artifact`),
  notifications: (workspaceId: string, cursor?: string) =>
    request<NotificationList>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notifications${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  unreadNotifications: (workspaceId: string) =>
    request<{ count: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notifications/unread-count`,
    ),
  updateNotification: (
    workspaceId: string,
    notificationId: string,
    read: boolean,
    version: number,
  ) =>
    request<NotificationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notifications/${encodeURIComponent(notificationId)}`,
      { method: "PATCH", body: { read }, ifMatch: version },
    ),
  markAllNotificationsRead: (workspaceId: string) =>
    request<{ updated: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notifications/mark-all-read`,
      {
        method: "POST",
      },
    ),
  removeNotification: (workspaceId: string, notificationId: string) =>
    request<void>(
      `/workspaces/${encodeURIComponent(workspaceId)}/notifications/${encodeURIComponent(notificationId)}`,
      {
        method: "DELETE",
      },
    ),
  activity: (workspaceId: string, category?: string) =>
    request<ActivityList>(
      `/workspaces/${encodeURIComponent(workspaceId)}/activity${category ? `?category=${encodeURIComponent(category)}` : ""}`,
    ),
  exportActivity: (
    workspaceId: string,
    input: ActivityExportRequest,
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<BackgroundJobResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/activity-exports`,
      { method: "POST", body: input, idempotencyKey },
    ),
  onboarding: (workspaceId: string) =>
    request<OnboardingDraftResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/onboarding`,
    ),
  updateOnboarding: (
    workspaceId: string,
    input: UpdateOnboardingDraft,
    version: number,
  ) =>
    request<OnboardingDraftResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/onboarding`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  completeOnboarding: (
    workspaceId: string,
    version: number,
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<{
      completed: true;
      planGeneration: "not_started";
      message: "Date salvate. Pregătim propunerea planului tău.";
      jobId: string;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/onboarding/complete`, {
      method: "POST",
      idempotencyKey,
      ifMatch: version,
    }),
  createPlanGeneration: (
    workspaceId: string,
    onboardingVersion: number,
    input: CreatePlanGenerationRequest = { mode: "auto" },
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<CreatePlanGenerationResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/plan-generations`,
      {
        method: "POST",
        body: input,
        ifMatch: onboardingVersion,
        idempotencyKey,
      },
    ),
  planProposals: (workspaceId: string) =>
    request<{
      items: Array<Omit<PlanProposalResource, "items">>;
      nextCursor: string | null;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/plan-proposals`),
  planProposal: (workspaceId: string, proposalId: string) =>
    request<PlanProposalResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/plan-proposals/${encodeURIComponent(proposalId)}`,
    ),
  updatePlanProposal: (
    workspaceId: string,
    proposalId: string,
    version: number,
    input: UpdatePlanProposal,
  ) =>
    request<PlanProposalResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/plan-proposals/${encodeURIComponent(proposalId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  rejectPlanProposal: (
    workspaceId: string,
    proposalId: string,
    version: number,
    reason?: string,
  ) =>
    request<PlanProposalResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/plan-proposals/${encodeURIComponent(proposalId)}/reject`,
      { method: "POST", body: { reason }, ifMatch: version },
    ),
  applyPlanProposal: (
    workspaceId: string,
    proposalId: string,
    version: number,
    confirmWarnings: boolean,
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<ApplyPlanProposalResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/plan-proposals/${encodeURIComponent(proposalId)}/apply`,
      {
        method: "POST",
        body: { confirmWarnings },
        ifMatch: version,
        idempotencyKey,
      },
    ),
  tasks: (
    workspaceId: string,
    filters: Record<string, string | number | boolean | null | undefined> = {},
  ) =>
    request<TaskList>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks${queryString(filters)}`,
    ),
  task: (workspaceId: string, taskId: string) =>
    request<TaskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`,
    ),
  createTask: (
    workspaceId: string,
    input: CreateTask,
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<TaskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks`,
      {
        method: "POST",
        body: input,
        idempotencyKey,
      },
    ),
  updateTask: (
    workspaceId: string,
    taskId: string,
    version: number,
    input: UpdateTask,
  ) =>
    request<TaskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteTask: (workspaceId: string, taskId: string, version: number) =>
    request<{ deleted: true; dependentTaskCount: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  transitionTask: (
    workspaceId: string,
    taskId: string,
    input: TaskTransitionRequest,
  ) =>
    request<TaskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/transitions`,
      { method: "POST", body: input, ifMatch: input.version },
    ),
  createSubtask: (workspaceId: string, taskId: string, input: CreateTask) =>
    request<TaskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/subtasks`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  taskComments: (workspaceId: string, taskId: string) =>
    request<{
      items: Array<{
        id: string;
        taskId: string;
        authorUserId: string;
        authorName: string;
        body: string;
        createdAt: string;
        updatedAt: string;
        version: number;
      }>;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/comments`,
    ),
  createTaskComment: (workspaceId: string, taskId: string, body: string) =>
    request<{
      id: string;
      taskId: string;
      authorUserId: string;
      authorName: string;
      body: string;
      createdAt: string;
      updatedAt: string;
      version: number;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/comments`,
      { method: "POST", body: { body } },
    ),
  copyTask: (workspaceId: string, taskId: string, dueDateShiftDays = 0) =>
    request<TaskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/copies`,
      {
        method: "POST",
        body: {
          includeSubtasks: true,
          includeDependencies: false,
          dueDateShiftDays,
        },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  replaceTaskDependencies: (
    workspaceId: string,
    taskId: string,
    version: number,
    dependsOnTaskIds: string[],
  ) =>
    request<{
      task: TaskResource;
      added: string[];
      removed: string[];
      blockedByIncomplete: string[];
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/dependencies`,
      { method: "PUT", body: { dependsOnTaskIds, version }, ifMatch: version },
    ),
  calendar: (workspaceId: string, from?: string, to?: string) =>
    request<{ items: CalendarItem[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/calendar-events${queryString({ from, to })}`,
    ),
  createCalendarEvent: (
    workspaceId: string,
    input: CreateCalendarEvent,
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<CalendarItem>(
      `/workspaces/${encodeURIComponent(workspaceId)}/calendar-events`,
      {
        method: "POST",
        body: input,
        idempotencyKey,
      },
    ),
  updateCalendarEvent: (
    workspaceId: string,
    eventId: string,
    version: number,
    input: Partial<CreateCalendarEvent>,
  ) =>
    request<CalendarItem>(
      `/workspaces/${encodeURIComponent(workspaceId)}/calendar-events/${encodeURIComponent(eventId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteCalendarEvent: (
    workspaceId: string,
    eventId: string,
    version: number,
  ) =>
    request<{ deleted: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/calendar-events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  downloadCalendar: (workspaceId: string) =>
    download(`/workspaces/${encodeURIComponent(workspaceId)}/calendar.ics`),
  timeline: (workspaceId: string) =>
    request<{
      phases: Array<{
        id: string;
        title: string;
        description: string | null;
        position: number;
        startAt: string | null;
        endAt: string | null;
        relativeStartOffsetDays: number | null;
        relativeEndOffsetDays: number | null;
        status: "not_started" | "in_progress" | "completed";
        version: number;
        milestones: TimelineMilestone[];
        taskTotal: number;
        taskCompleted: number;
        progressPercent: number;
        delayedItems: number;
      }>;
      unphasedMilestones: TimelineMilestone[];
      criticalTaskIds: string[];
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/timeline`),
  createMilestone: (
    workspaceId: string,
    input: {
      phaseId?: string | null;
      title: string;
      description?: string;
      targetAt?: string | null;
      relativeOffsetDays?: number | null;
      position?: number;
    },
  ) =>
    request<TimelineMilestone>(
      `/workspaces/${encodeURIComponent(workspaceId)}/milestones`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateMilestone: (
    workspaceId: string,
    milestoneId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<TimelineMilestone>(
      `/workspaces/${encodeURIComponent(workspaceId)}/milestones/${encodeURIComponent(milestoneId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteMilestone: (
    workspaceId: string,
    milestoneId: string,
    version: number,
  ) =>
    request<{ deleted: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/milestones/${encodeURIComponent(milestoneId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  recalculateTimeline: (
    workspaceId: string,
    input: { applyRelativeDates?: boolean } = {},
  ) =>
    request<{
      preview: boolean;
      proposedChanges: Array<Record<string, unknown>>;
      overdueTaskIds: string[];
      blockedTaskIds: string[];
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/timeline-recalculations`,
      {
        method: "POST",
        body: { applyRelativeDates: input.applyRelativeDates ?? false },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  dashboard: (workspaceId: string) =>
    request<PlanningDashboard>(
      `/workspaces/${encodeURIComponent(workspaceId)}/dashboard`,
    ),
  creativeState: (workspaceId: string) =>
    request<WorkspaceCreativeState>(
      `/workspaces/${encodeURIComponent(workspaceId)}/creative-state`,
    ),
  updateCreativeState: (
    workspaceId: string,
    version: number,
    input: UpdateWorkspaceCreativeState,
  ) =>
    request<WorkspaceCreativeState>(
      `/workspaces/${encodeURIComponent(workspaceId)}/creative-state`,
      {
        method: "PUT",
        body: input,
        ...(version > 0 ? { ifMatch: version } : {}),
      },
    ),
  search: (workspaceId: string, query: string) =>
    request<{
      items: Array<{
        id: string;
        type:
          | "task"
          | "milestone"
          | "phase"
          | "calendar_event"
          | "member"
          | "guest"
          | "household"
          | "campaign"
          | "invitation"
          | "menu"
          | "allergy_issue"
          | "seating_plan"
          | "seating_table"
          | "transport_route"
          | "transport_stop"
          | "accommodation_property"
          | "accommodation_room"
          | "shortcut";
        title: string;
        subtitle: string | null;
        href: string;
      }>;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/search${queryString({ q: query })}`,
    ),
  createPlanningExport: (
    workspaceId: string,
    filters: Record<string, string> = {},
  ) =>
    request<BackgroundJobResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/planning-exports`,
      { method: "POST", body: filters, idempotencyKey: crypto.randomUUID() },
    ),
  venueSpaces: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/venue-spaces`,
    ),
  createVenueSpace: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/venue-spaces`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  seatingPlans: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans`,
    ),
  seatingPlan: (workspaceId: string, planId: string) =>
    request<SeatingPlanResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}`,
    ),
  createSeatingPlan: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateSeatingPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteSeatingPlan: (workspaceId: string, planId: string, version: number) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createSeatingTable: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/tables`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateSeatingTable: (
    workspaceId: string,
    planId: string,
    tableId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/tables/${encodeURIComponent(tableId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteSeatingTable: (
    workspaceId: string,
    planId: string,
    tableId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/tables/${encodeURIComponent(tableId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  replaceSeatingAssignments: (
    workspaceId: string,
    planId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<{ changed: number; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/assignments`,
      {
        method: "PUT",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  removeSeatingAssignment: (
    workspaceId: string,
    planId: string,
    assignmentId: string,
    version: number,
  ) =>
    request<{ removed: true; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/assignments/${encodeURIComponent(assignmentId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createSeatingConstraint: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/constraints`,
      { method: "POST", body: input },
    ),
  deleteSeatingConstraint: (
    workspaceId: string,
    planId: string,
    constraintId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/constraints/${encodeURIComponent(constraintId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  resolveSeatingIssue: (
    workspaceId: string,
    planId: string,
    issueId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/issues/${encodeURIComponent(issueId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  requestSeatingSuggestion: (
    workspaceId: string,
    planId: string,
    version: number,
  ) =>
    request<{ runId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/suggestions`,
      {
        method: "POST",
        body: { preserveManualAssignments: true },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  seatingSuggestion: (
    workspaceId: string,
    planId: string,
    suggestionId: string,
  ) =>
    request<SeatingSuggestionResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/suggestions/${encodeURIComponent(suggestionId)}`,
    ),
  applySeatingSuggestion: (
    workspaceId: string,
    planId: string,
    suggestionId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<{
      applied: number;
      planVersion: number;
      suggestionVersion: number;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/suggestions/${encodeURIComponent(suggestionId)}/apply`,
      {
        method: "POST",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  publishSeatingPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    reason?: string,
  ) =>
    request<{ plan: OperationResource; snapshot: OperationResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/publish`,
      {
        method: "POST",
        body: reason ? { reason } : {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  unpublishSeatingPlan: (
    workspaceId: string,
    planId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/unpublish`,
      { method: "POST", body: {}, ifMatch: version },
    ),
  createSeatingExport: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<{ artifactId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/seating-plans/${encodeURIComponent(planId)}/exports`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  transportRequests: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-requests`,
    ),
  transportPlans: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans`,
    ),
  transportPlan: (workspaceId: string, planId: string) =>
    request<TransportPlanResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}`,
    ),
  createTransportPlan: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateTransportPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteTransportPlan: (
    workspaceId: string,
    planId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createTransportVehicle: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/vehicles`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateTransportVehicle: (
    workspaceId: string,
    planId: string,
    vehicleId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/vehicles/${encodeURIComponent(vehicleId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteTransportVehicle: (
    workspaceId: string,
    planId: string,
    vehicleId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/vehicles/${encodeURIComponent(vehicleId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createTransportRoute: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/routes`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateTransportRoute: (
    workspaceId: string,
    planId: string,
    routeId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/routes/${encodeURIComponent(routeId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteTransportRoute: (
    workspaceId: string,
    planId: string,
    routeId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/routes/${encodeURIComponent(routeId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  replaceTransportAssignments: (
    workspaceId: string,
    planId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<{ changed: number; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/assignments`,
      {
        method: "PUT",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  publishTransportPlan: (
    workspaceId: string,
    planId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/publish`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createTransportManifest: (
    workspaceId: string,
    planId: string,
    includeSensitive = false,
  ) =>
    request<{ artifactId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/transport-plans/${encodeURIComponent(planId)}/manifests`,
      {
        method: "POST",
        body: { format: "xlsx", includeSensitive },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  accommodationDiscovery: (
    workspaceId: string,
    input: AccommodationDiscoveryQuery,
  ) =>
    request<AccommodationDiscoveryResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-discovery${queryString(
        {
          eventId: input.eventId,
          query: input.query,
          lat: input.lat,
          lng: input.lng,
          radiusKm: input.radiusKm,
          types: input.types.join(","),
          facilities: input.facilities.join(","),
          budgetMaxMinor: input.budgetMaxMinor,
          currency: input.currency,
        },
      )}`,
    ),
  accommodationRecommendations: (
    workspaceId: string,
    input: {
      eventId?: string;
      status?: AccommodationRecommendationStatus;
    } = {},
  ) =>
    request<{ items: AccommodationRecommendationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations${queryString(input)}`,
    ),
  createAccommodationRecommendation: (
    workspaceId: string,
    input: CreateAccommodationRecommendation,
  ) =>
    request<AccommodationRecommendationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateAccommodationRecommendation: (
    workspaceId: string,
    recommendationId: string,
    version: number,
    input: UpdateAccommodationRecommendation,
  ) =>
    request<AccommodationRecommendationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations/${encodeURIComponent(recommendationId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  reorderAccommodationRecommendations: (
    workspaceId: string,
    items: Array<{ id: string; version: number; position: number }>,
  ) =>
    request<{ items: AccommodationRecommendationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations/order`,
      {
        method: "PUT",
        body: { items },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  deleteAccommodationRecommendation: (
    workspaceId: string,
    recommendationId: string,
    version: number,
  ) =>
    request<{ deleted: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations/${encodeURIComponent(recommendationId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  publishAccommodationRecommendation: (
    workspaceId: string,
    recommendationId: string,
    version: number,
  ) =>
    request<AccommodationRecommendationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations/${encodeURIComponent(recommendationId)}/publish`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  archiveAccommodationRecommendation: (
    workspaceId: string,
    recommendationId: string,
    version: number,
  ) =>
    request<AccommodationRecommendationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-recommendations/${encodeURIComponent(recommendationId)}/archive`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  accommodationRequests: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-requests`,
    ),
  accommodationProperties: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties`,
    ),
  accommodationProperty: (workspaceId: string, propertyId: string) =>
    request<OperationResource & { rooms: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties/${encodeURIComponent(propertyId)}`,
    ),
  createAccommodationProperty: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateAccommodationProperty: (
    workspaceId: string,
    propertyId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties/${encodeURIComponent(propertyId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteAccommodationProperty: (
    workspaceId: string,
    propertyId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties/${encodeURIComponent(propertyId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createAccommodationRoom: (
    workspaceId: string,
    propertyId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties/${encodeURIComponent(propertyId)}/rooms`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateAccommodationRoom: (
    workspaceId: string,
    propertyId: string,
    roomId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties/${encodeURIComponent(propertyId)}/rooms/${encodeURIComponent(roomId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteAccommodationRoom: (
    workspaceId: string,
    propertyId: string,
    roomId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-properties/${encodeURIComponent(propertyId)}/rooms/${encodeURIComponent(roomId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  accommodationStays: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays`,
    ),
  accommodationStay: (workspaceId: string, stayId: string) =>
    request<AccommodationStayResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays/${encodeURIComponent(stayId)}`,
    ),
  createAccommodationStay: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateAccommodationStay: (
    workspaceId: string,
    stayId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays/${encodeURIComponent(stayId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteAccommodationStay: (
    workspaceId: string,
    stayId: string,
    version: number,
  ) =>
    request<{ deleted: true; id: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays/${encodeURIComponent(stayId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  replaceAccommodationAllocations: (
    workspaceId: string,
    stayId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<{ changed: number; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays/${encodeURIComponent(stayId)}/allocations`,
      {
        method: "PUT",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  publishAccommodationStay: (
    workspaceId: string,
    stayId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays/${encodeURIComponent(stayId)}/publish`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createRoomingList: (
    workspaceId: string,
    stayId: string,
    includeSensitive = false,
  ) =>
    request<{ artifactId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/accommodation-stays/${encodeURIComponent(stayId)}/rooming-lists`,
      {
        method: "POST",
        body: { format: "xlsx", includeSensitive },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  households: (workspaceId: string, search?: string, cursor?: string) =>
    request<HouseholdListResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/households${queryString({ search, cursor })}`,
    ),
  household: (workspaceId: string, householdId: string) =>
    request<HouseholdResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/households/${encodeURIComponent(householdId)}`,
    ),
  createHousehold: (workspaceId: string, input: CreateHousehold) =>
    request<HouseholdResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/households`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateHousehold: (
    workspaceId: string,
    householdId: string,
    version: number,
    input: UpdateHousehold,
  ) =>
    request<HouseholdResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/households/${encodeURIComponent(householdId)}`,
      {
        method: "PATCH",
        body: input,
        ifMatch: version,
      },
    ),
  archiveHousehold: (
    workspaceId: string,
    householdId: string,
    version: number,
  ) =>
    request<{ deleted: true; householdId: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/households/${encodeURIComponent(householdId)}`,
      {
        method: "DELETE",
        ifMatch: version,
      },
    ),
  guests: (
    workspaceId: string,
    filters: Record<string, string | boolean | undefined> = {},
  ) =>
    request<GuestListResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guests${queryString(filters)}`,
    ),
  guest: (workspaceId: string, guestId: string) =>
    request<
      GuestResource & {
        communication?: Array<{
          id: string;
          channel: string;
          direction: string;
          summary: string;
          occurredAt: string;
        }>;
      }
    >(
      `/workspaces/${encodeURIComponent(workspaceId)}/guests/${encodeURIComponent(guestId)}`,
    ),
  createGuest: (workspaceId: string, input: CreateGuest) =>
    request<GuestResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guests`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  guestTags: (workspaceId: string) =>
    request<{ items: GuestTagResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-tags`,
    ),
  createGuestTag: (
    workspaceId: string,
    input: { name: string; color?: string | null },
  ) =>
    request<GuestTagResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-tags`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateGuestTag: (
    workspaceId: string,
    tagId: string,
    version: number,
    input: { name?: string; color?: string | null },
  ) =>
    request<GuestTagResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-tags/${encodeURIComponent(tagId)}`,
      {
        method: "PATCH",
        body: input,
        ifMatch: version,
      },
    ),
  deleteGuestTag: (workspaceId: string, tagId: string, version: number) =>
    request<{ deleted: true; tagId: string; affectedGuests: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-tags/${encodeURIComponent(tagId)}`,
      {
        method: "DELETE",
        ifMatch: version,
      },
    ),
  updateGuest: (
    workspaceId: string,
    guestId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<GuestResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guests/${encodeURIComponent(guestId)}`,
      {
        method: "PATCH",
        body: input,
        ifMatch: version,
      },
    ),
  archiveGuest: (workspaceId: string, guestId: string, version: number) =>
    request<GuestResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guests/${encodeURIComponent(guestId)}`,
      {
        method: "DELETE",
        ifMatch: version,
      },
    ),
  bulkGuests: (workspaceId: string, input: Record<string, unknown>) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-bulk-commands`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  prepareBulkRsvpReminder: (workspaceId: string, guestIds: string[]) =>
    request<{
      campaign: CampaignResource;
      audience: {
        total: number;
        valid: number;
        invalid: number;
        invalidRecipients: Array<{ recipientId: string; reason: string }>;
        audienceRevision: string;
      };
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/guest-bulk-commands`, {
      method: "POST",
      body: { command: "SEND_RSVP_REMINDER", guestIds },
      idempotencyKey: crypto.randomUUID(),
    }),
  uploadGuestImport: (workspaceId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return upload<{ import: GuestImportResource; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-imports`,
      form,
    );
  },
  guestImport: (workspaceId: string, importId: string) =>
    request<GuestImportResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-imports/${encodeURIComponent(importId)}`,
    ),
  guestImportRows: (workspaceId: string, importId: string, cursor?: string) =>
    request<{ items: GuestImportRowResource[]; nextCursor: string | null }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-imports/${encodeURIComponent(importId)}/rows${queryString({ cursor })}`,
    ),
  updateGuestImportMapping: (
    workspaceId: string,
    importId: string,
    version: number,
    mapping: Record<string, string>,
  ) =>
    request<GuestImportResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-imports/${encodeURIComponent(importId)}/mapping`,
      {
        method: "PATCH",
        body: { mapping },
        ifMatch: version,
      },
    ),
  decideGuestImportRow: (
    workspaceId: string,
    importId: string,
    rowId: string,
    version: number,
    decision: "CREATE_NEW" | "MERGE_WITH_EXISTING" | "SKIP",
    mergeGuestId?: string,
  ) =>
    request<GuestImportRowResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-imports/${encodeURIComponent(importId)}/rows/${encodeURIComponent(rowId)}`,
      {
        method: "PATCH",
        body: { decision, ...(mergeGuestId ? { mergeGuestId } : {}) },
        ifMatch: version,
      },
    ),
  commitGuestImport: (workspaceId: string, importId: string, version: number) =>
    request<{ import: GuestImportResource; committedRows: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-imports/${encodeURIComponent(importId)}/commit`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createGuestExport: (workspaceId: string, input: Record<string, unknown>) =>
    request<{ job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-exports`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  invitationSite: (workspaceId: string) =>
    request<InvitationSiteResource | null>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site`,
    ),
  invitationRecipients: (workspaceId: string, cursor?: string) =>
    request<{
      items: InvitationRecipientResource[];
      nextCursor: string | null;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-recipients${queryString({ cursor })}`,
    ),
  invitationVersions: (workspaceId: string, cursor?: string) =>
    request<InvitationVersionHistoryResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/versions${queryString({ cursor })}`,
    ),
  restoreInvitationVersion: (
    workspaceId: string,
    versionId: string,
    version: number,
  ) =>
    request<InvitationSiteResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/versions/${encodeURIComponent(versionId)}/restore`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  invitationPreflight: (workspaceId: string) =>
    request<InvitationPreflightResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/preflight`,
      { method: "POST", body: {} },
    ),
  invitationSyncPreview: (workspaceId: string) =>
    request<InvitationSyncPreviewResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/sync-preview`,
    ),
  applyInvitationSync: (
    workspaceId: string,
    version: number,
    input: ApplyInvitationSync,
  ) =>
    request<InvitationSiteResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/sync-apply`,
      {
        method: "POST",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  invitationVariants: (workspaceId: string) =>
    request<{ items: InvitationVariantResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/variants`,
    ),
  createInvitationVariant: (
    workspaceId: string,
    input: CreateInvitationVariant,
  ) =>
    request<InvitationVariantResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/variants`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  saveInvitationVariantDraft: (
    workspaceId: string,
    variantId: string,
    version: number,
    input: SaveInvitationVariantDraft,
  ) =>
    request<InvitationVariantResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/variants/${encodeURIComponent(variantId)}/draft`,
      { method: "PUT", body: input, ifMatch: version },
    ),
  archiveInvitationVariant: (
    workspaceId: string,
    variantId: string,
    version: number,
  ) =>
    request<InvitationVariantResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/variants/${encodeURIComponent(variantId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  assignInvitationRecipientVariant: (
    workspaceId: string,
    recipientId: string,
    version: number,
    variantId: string | null,
  ) =>
    request<InvitationRecipientResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-recipients/${encodeURIComponent(recipientId)}/variant`,
      { method: "PUT", body: { variantId }, ifMatch: version },
    ),
  recipientAccessLinks: (
    workspaceId: string,
    recipientId: string,
    channels: Array<"MANUAL" | "WHATSAPP">,
  ) =>
    request<{ items: RecipientAccessLinkResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-recipients/${encodeURIComponent(recipientId)}/access-links`,
      { method: "POST", body: { channels } },
    ),
  createInvitationRecipients: (
    workspaceId: string,
    input: {
      householdIds: string[];
      guestIds: string[];
      invitationVersionId?: string;
      invitationVariantId?: string | null;
    },
    idempotencyKey = crypto.randomUUID(),
  ) =>
    request<{ created: number; recipientIds: string[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-recipients`,
      {
        method: "POST",
        body: input,
        idempotencyKey,
      },
    ),
  downloadRecipientQr: (
    workspaceId: string,
    recipientId: string,
    format: "svg" | "png" = "svg",
  ) =>
    download(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-recipients/${encodeURIComponent(recipientId)}/qr?format=${format}`,
    ),
  saveInvitationDraft: (
    workspaceId: string,
    version: number | null,
    input: SaveInvitationDraft,
  ) =>
    request<InvitationSiteResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/draft`,
      {
        method: "PUT",
        body: input,
        ...(version ? { ifMatch: version } : {}),
      },
    ),
  publishInvitation: (workspaceId: string, version: number) =>
    request<InvitationSiteResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitation-site/publish`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  campaigns: (workspaceId: string, cursor?: string) =>
    request<{ items: CampaignResource[]; nextCursor: string | null }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  createCampaign: (workspaceId: string, input: CreateCampaign) =>
    request<CampaignResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateCampaign: (
    workspaceId: string,
    campaignId: string,
    version: number,
    input: Partial<CreateCampaign>,
  ) =>
    request<CampaignResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${encodeURIComponent(campaignId)}`,
      {
        method: "PATCH",
        body: input,
        ifMatch: version,
      },
    ),
  discardCampaignDraft: (
    workspaceId: string,
    campaignId: string,
    version: number,
  ) =>
    request<{ deleted: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${encodeURIComponent(campaignId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  campaignAudiencePreview: (workspaceId: string, campaignId: string) =>
    request<{
      total: number;
      valid: number;
      invalid: number;
      invalidRecipients: Array<{ recipientId: string; reason: string }>;
      audienceRevision: string;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${encodeURIComponent(campaignId)}/audience-preview`,
    ),
  campaignRecipients: (
    workspaceId: string,
    campaignId: string,
    cursor?: string,
  ) =>
    request<{
      items: CampaignRecipientResource[];
      nextCursor: string | null;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${encodeURIComponent(campaignId)}/recipients${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  transitionCampaign: (
    workspaceId: string,
    campaignId: string,
    version: number,
    transition: string,
    scheduledAt?: string,
    audienceRevision?: string,
  ) =>
    request<{ campaign: CampaignResource; job?: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${encodeURIComponent(campaignId)}/transitions`,
      {
        method: "POST",
        body: { transition, scheduledAt, audienceRevision },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  rsvpForm: (workspaceId: string) =>
    request<RsvpFormResource | null>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rsvp-form`,
    ),
  rsvpDashboard: (
    workspaceId: string,
    query: {
      search?: string;
      status?: RsvpDashboardStatus;
      cursor?: string;
      limit?: number;
    } = {},
  ) =>
    request<RsvpDashboardResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rsvp-dashboard${queryString(query)}`,
    ),
  overrideRsvpSubmission: (
    workspaceId: string,
    submissionId: string,
    version: number,
    input: {
      reason: string;
      members: GuestRsvpRequest["members"];
      message?: string;
    },
  ) =>
    request<RsvpSubmissionResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rsvp-submissions/${encodeURIComponent(submissionId)}`,
      {
        method: "PATCH",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  saveRsvpForm: (
    workspaceId: string,
    version: number | null,
    config: Record<string, unknown>,
  ) =>
    request<RsvpFormResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rsvp-form`,
      {
        method: "PUT",
        body: { config },
        ...(version ? { ifMatch: version } : {}),
      },
    ),
  publishRsvpForm: (workspaceId: string, version: number) =>
    request<RsvpFormResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rsvp-form/publish`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  menus: (workspaceId: string) =>
    request<{ items: MenuResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/menus`,
    ),
  createMenu: (workspaceId: string, input: CreateMenu) =>
    request<MenuResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/menus`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateMenu: (
    workspaceId: string,
    menuId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<MenuResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/menus/${encodeURIComponent(menuId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteMenu: (workspaceId: string, menuId: string, version: number) =>
    request<{ deleted: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/menus/${encodeURIComponent(menuId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  guestMenuSelections: (workspaceId: string) =>
    request<{
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/guest-menu-selections`),
  setGuestMenuSelection: (
    workspaceId: string,
    guestId: string,
    input: { menuId: string | null; selectionVersion: number | null },
  ) =>
    request<OrganizerMenuSelectionResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-menu-selections/${encodeURIComponent(guestId)}`,
      { method: "PUT", body: input },
    ),
  allergyIssues: (workspaceId: string) =>
    request<{
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/allergy-issues`),
  resolveAllergyIssue: (
    workspaceId: string,
    issueId: string,
    version: number,
    input: {
      status:
        "UNREVIEWED" | "REVIEWING" | "CONFIRMED_WITH_CATERER" | "RESOLVED";
      resolutionNote?: string | null;
    },
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/allergy-issues/${encodeURIComponent(issueId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  createCateringExport: (workspaceId: string, includeAllergies = false) =>
    request<{ job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/catering-exports`,
      {
        method: "POST",
        body: { format: "xlsx", includeAllergies },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  marketplaceVendors: (
    filters: Record<string, string | number | boolean | undefined> = {},
  ) =>
    request<{
      items: OperationResource[];
      nextCursor: string | null;
      availableSorts: string[];
    }>(`/marketplace/vendors${queryString(filters)}`),
  marketplaceVendor: (slug: string) =>
    request<
      OperationResource & {
        services: OperationResource[];
        packages: OperationResource[];
        serviceRegions: OperationResource[];
        portfolio: OperationResource[];
      }
    >(`/marketplace/vendors/${encodeURIComponent(slug)}`),
  vendorFavorites: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-favorites`,
    ),
  setVendorFavorite: (
    workspaceId: string,
    vendorOrganizationId: string,
    active: boolean,
  ) =>
    request<{ vendorOrganizationId: string; favorite: boolean }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-favorites/${encodeURIComponent(vendorOrganizationId)}`,
      { method: active ? "PUT" : "DELETE" },
    ),
  vendorShortlists: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-shortlists`,
    ),
  createVendorShortlist: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-shortlists`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateVendorShortlist: (
    workspaceId: string,
    shortlistId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-shortlists/${encodeURIComponent(shortlistId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteVendorShortlist: (
    workspaceId: string,
    shortlistId: string,
    version: number,
  ) =>
    request<{ id: string; deleted: true; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-shortlists/${encodeURIComponent(shortlistId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  setShortlistVendor: (
    workspaceId: string,
    shortlistId: string,
    vendorOrganizationId: string,
    active: boolean,
  ) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/vendor-shortlists/${encodeURIComponent(shortlistId)}/vendors/${encodeURIComponent(vendorOrganizationId)}`,
      { method: active ? "PUT" : "DELETE" },
    ),
  rfqs: (
    workspaceId: string,
    filters: Record<string, string | undefined> = {},
  ) =>
    request<{ items: OperationResource[]; nextCursor: string | null }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs${queryString(filters)}`,
    ),
  rfq: (workspaceId: string, rfqId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs/${encodeURIComponent(rfqId)}`,
    ),
  createRfq: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateRfq: (
    workspaceId: string,
    rfqId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs/${encodeURIComponent(rfqId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  replaceRfqRecipients: (
    workspaceId: string,
    rfqId: string,
    version: number,
    vendorOrganizationIds: string[],
  ) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs/${encodeURIComponent(rfqId)}/recipients`,
      { method: "PUT", body: { vendorOrganizationIds }, ifMatch: version },
    ),
  rfqRecipientPreview: (workspaceId: string, rfqId: string) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs/${encodeURIComponent(rfqId)}/recipient-preview`,
    ),
  transitionRfq: (
    workspaceId: string,
    rfqId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs/${encodeURIComponent(rfqId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  offers: (
    workspaceId: string,
    filters: Record<string, string | undefined> = {},
  ) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/offers${queryString(filters)}`,
    ),
  offer: (workspaceId: string, offerId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/offers/${encodeURIComponent(offerId)}`,
    ),
  offerComparison: (workspaceId: string, rfqId: string) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/rfqs/${encodeURIComponent(rfqId)}/offer-comparison`,
    ),
  transitionOffer: (
    workspaceId: string,
    offerId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/offers/${encodeURIComponent(offerId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  negotiationMessages: (workspaceId: string, offerId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/offers/${encodeURIComponent(offerId)}/negotiation/messages`,
    ),
  sendNegotiationMessage: (
    workspaceId: string,
    offerId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/offers/${encodeURIComponent(offerId)}/negotiation/messages`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  commercialBookings: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/bookings`,
    ),
  commercialBooking: (workspaceId: string, bookingId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/bookings/${encodeURIComponent(bookingId)}`,
    ),
  updateCommercialBooking: (
    workspaceId: string,
    bookingId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/bookings/${encodeURIComponent(bookingId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  transitionBooking: (
    workspaceId: string,
    bookingId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/bookings/${encodeURIComponent(bookingId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  commercialContracts: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts`,
    ),
  commercialContract: (workspaceId: string, contractId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts/${encodeURIComponent(contractId)}`,
    ),
  transitionContract: (
    workspaceId: string,
    contractId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts/${encodeURIComponent(contractId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  acknowledgeContract: (
    workspaceId: string,
    contractId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts/${encodeURIComponent(contractId)}/acknowledgements`,
      {
        method: "POST",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  exportContract: (
    workspaceId: string,
    contractId: string,
    input: Record<string, unknown>,
  ) =>
    request<{ artifactId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts/${encodeURIComponent(contractId)}/exports`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  budget: (workspaceId: string) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget`,
    ),
  upsertBudget: (
    workspaceId: string,
    version: number | null,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget`,
      {
        method: "PUT",
        body: input,
        ...(version ? { ifMatch: version } : {}),
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createBudgetCategory: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget/categories`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateBudgetCategory: (
    workspaceId: string,
    categoryId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget/categories/${encodeURIComponent(categoryId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteBudgetCategory: (
    workspaceId: string,
    categoryId: string,
    version: number,
  ) =>
    request<{ id: string; deleted: boolean; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget/categories/${encodeURIComponent(categoryId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createBudgetItem: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget/items`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateBudgetItem: (
    workspaceId: string,
    itemId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget/items/${encodeURIComponent(itemId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteBudgetItem: (workspaceId: string, itemId: string, version: number) =>
    request<{ id: string; deleted: boolean; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/budget/items/${encodeURIComponent(itemId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  expenses: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/expenses`,
    ),
  createExpense: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/expenses`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateExpense: (
    workspaceId: string,
    expenseId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  deleteExpense: (workspaceId: string, expenseId: string, version: number) =>
    request<{ id: string; deleted: boolean; version: number }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/expenses/${encodeURIComponent(expenseId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  paymentSchedules: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-schedules`,
    ),
  createPaymentSchedule: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-schedules`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  commercialPayments: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payments`,
    ),
  createCommercialPayment: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payments`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  transitionCommercialPayment: (
    workspaceId: string,
    paymentId: string,
    version: number,
    transition: string,
    reason = "Actualizare confirmată de utilizator",
    amountMinor?: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payments/${encodeURIComponent(paymentId)}/transitions`,
      {
        method: "POST",
        body: {
          transition,
          reason,
          ...(amountMinor === undefined ? {} : { amountMinor }),
        },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  commercialExport: (workspaceId: string, input: Record<string, unknown>) =>
    request<{ artifactId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/commercial-exports`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  documentFolders: (workspaceId: string) =>
    request<OperationResource[]>(
      `/document-folders?workspaceId=${encodeURIComponent(workspaceId)}`,
    ),
  createDocumentFolder: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/document-folders?workspaceId=${encodeURIComponent(workspaceId)}`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  documents: (workspaceId: string, search?: string) =>
    request<{ items: OperationResource[]; nextCursor: null }>(
      `/documents${queryString({ workspaceId, search })}`,
    ),
  document: (workspaceId: string, documentId: string) =>
    request<OperationResource>(
      `/documents/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
    ),
  createUploadSession: (
    workspaceId: string,
    input: {
      purpose: string;
      originalFileName: string;
      contentType: string;
      sizeBytes: number;
      checksumSha256: string;
    },
  ) =>
    request<
      OperationResource & {
        upload: {
          method: "PUT";
          url: string;
          headers: Record<string, string>;
          expiresAt: string;
        };
      }
    >("/uploads", {
      method: "POST",
      body: { workspaceId, ...input },
      idempotencyKey: crypto.randomUUID(),
    }),
  createVendorUploadSession: (
    vendorOrganizationId: string,
    input: {
      purpose: string;
      originalFileName: string;
      contentType: string;
      sizeBytes: number;
      checksumSha256: string;
    },
  ) =>
    request<
      OperationResource & {
        upload: {
          method: "PUT";
          url: string;
          headers: Record<string, string>;
          expiresAt: string;
        };
      }
    >("/uploads", {
      method: "POST",
      body: { vendorOrganizationId, ...input },
      idempotencyKey: crypto.randomUUID(),
    }),
  putSignedUpload: (url: string, file: File, headers: Record<string, string>) =>
    putSigned(url, file, headers),
  completeUploadSession: (uploadId: string, checksumSha256: string) =>
    request<
      OperationResource & {
        storageObjectId?: string | null;
      }
    >(`/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      body: { checksumSha256 },
    }),
  uploadSession: (uploadId: string) =>
    request<
      OperationResource & {
        storageObjectId?: string | null;
        objectStatus?: string | null;
        scanStatus?: string | null;
        contentType?: string | null;
      }
    >(`/uploads/${encodeURIComponent(uploadId)}`),
  createVaultDocument: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>("/documents", {
      method: "POST",
      body: { workspaceId, ...input },
      idempotencyKey: crypto.randomUUID(),
    }),
  createDocumentDownload: (workspaceId: string, documentId: string) =>
    request<{ url: string; expiresAt: string }>(
      `/documents/${encodeURIComponent(documentId)}/downloads?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "POST" },
    ),
  createDocumentGrant: (
    workspaceId: string,
    documentId: string,
    input: {
      granteeType: "USER" | "WORKSPACE" | "VENDOR_ORGANIZATION" | "CONTRACT_PARTY" | "BOOKING_PARTY";
      granteeId: string;
      permission: "READ" | "DOWNLOAD" | "MANAGE" | "SHARE";
      expiresAt?: string | null;
    },
  ) =>
    request<OperationResource>(
      `/documents/${encodeURIComponent(documentId)}/grants?workspaceId=${encodeURIComponent(workspaceId)}`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  revokeDocumentGrant: (
    workspaceId: string,
    documentId: string,
    grantId: string,
  ) =>
    request<OperationResource>(
      `/documents/${encodeURIComponent(documentId)}/grants/${encodeURIComponent(grantId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "DELETE" },
    ),
  deleteVaultDocument: (workspaceId: string, documentId: string) =>
    request<OperationResource>(
      `/documents/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "DELETE" },
    ),
  signatureEnvelopes: (workspaceId: string) =>
    request<OperationResource[]>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes`,
    ),
  contractDocuments: (workspaceId: string, contractId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts/${encodeURIComponent(contractId)}/documents`,
    ),
  createContractDocument: (
    workspaceId: string,
    contractId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contracts/${encodeURIComponent(contractId)}/documents`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  cancelSignatureEnvelope: (
    workspaceId: string,
    envelopeId: string,
    version: number,
    reason: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes/${encodeURIComponent(envelopeId)}/cancel`,
      { method: "POST", body: { reason }, ifMatch: version },
    ),
  signatureEvidence: (workspaceId: string, envelopeId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes/${encodeURIComponent(envelopeId)}/evidence`,
    ),
  signatureCandidates: (workspaceId: string, contractVersionId: string) =>
    request<{
      wedding: Array<{
        membershipId: string;
        userId: string;
        name: string;
        email: string;
      }>;
      vendor: Array<{
        membershipId: string;
        userId: string;
        name: string;
        email: string;
      }>;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes/signer-candidates?contractVersionId=${encodeURIComponent(contractVersionId)}`,
    ),
  createSignatureEnvelope: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  sendSignatureEnvelope: (
    workspaceId: string,
    envelopeId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes/${encodeURIComponent(envelopeId)}/send`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  signatureSigningSession: (workspaceId: string, envelopeId: string) =>
    request<{ url: string; expiresAt: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes/${encodeURIComponent(envelopeId)}/signing-session`,
      { method: "POST" },
    ),
  fakeSignatureAction: (
    workspaceId: string,
    envelopeId: string,
    signerId: string,
    action: "VIEW" | "SIGN" | "DECLINE",
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/signature-envelopes/${encodeURIComponent(envelopeId)}/fake-actions`,
      { method: "POST", body: { signerId, action } },
    ),
  signerSession: (envelopeId: string) =>
    request<{ url: string; expiresAt: string }>(
      `/signature-signing-sessions/${encodeURIComponent(envelopeId)}`,
      { method: "POST" },
    ),
  signerFakeAction: (
    envelopeId: string,
    signerId: string,
    action: "VIEW" | "SIGN" | "DECLINE",
  ) =>
    request<OperationResource>(
      `/signature-signing-sessions/${encodeURIComponent(envelopeId)}/fake-actions`,
      { method: "POST", body: { signerId, action } },
    ),
  paymentCheckouts: (workspaceId: string) =>
    request<OperationResource[]>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-checkouts`,
    ),
  paymentCheckout: (workspaceId: string, checkoutId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-checkouts/${encodeURIComponent(checkoutId)}`,
    ),
  expirePaymentCheckout: (
    workspaceId: string,
    checkoutId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-checkouts/${encodeURIComponent(checkoutId)}/expire`,
      { method: "POST", ifMatch: version },
    ),
  onlinePaymentTransactions: (workspaceId: string) =>
    request<OperationResource[]>(
      `/workspaces/${encodeURIComponent(workspaceId)}/online-payment-transactions`,
    ),
  onlinePaymentRefunds: (workspaceId: string) =>
    request<OperationResource[]>(
      `/workspaces/${encodeURIComponent(workspaceId)}/online-payment-refunds`,
    ),
  createPaymentCheckout: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-checkouts`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  fakePaymentAction: (
    workspaceId: string,
    checkoutId: string,
    action: "CAPTURE" | "FAIL" | "DISPUTE",
  ) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/payment-checkouts/${encodeURIComponent(checkoutId)}/fake-actions`,
      { method: "POST", body: { action } },
    ),
  refundOnlinePayment: (
    workspaceId: string,
    transactionId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/online-payment-transactions/${encodeURIComponent(transactionId)}/refunds`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
        ifMatch: version,
      },
    ),
  vendorOrganizations: () =>
    request<{ items: OperationResource[] }>("/vendor-organizations"),
  createVendorOrganization: (input: Record<string, unknown>) =>
    request<OperationResource>("/vendor-organizations", {
      method: "POST",
      body: input,
      idempotencyKey: crypto.randomUUID(),
    }),
  vendorOrganization: (organizationId: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}`,
    ),
  vendorProfile: (organizationId: string) =>
    request<OperationResource | null>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/profile`,
    ),
  upsertVendorProfile: (
    organizationId: string,
    version: number | null,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/profile`,
      { method: "PUT", body: input, ...(version ? { ifMatch: version } : {}) },
    ),
  publishVendorProfile: (
    organizationId: string,
    version: number,
    publish: boolean,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/profile/${publish ? "publish" : "unpublish"}`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  vendorPortfolioAssets: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/portfolio-assets`,
    ),
  updateVendorPortfolioAsset: (
    organizationId: string,
    assetId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/portfolio-assets/${encodeURIComponent(assetId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  vendorServices: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/services`,
    ),
  createVendorService: (
    organizationId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/services`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  createVendorPackage: (
    organizationId: string,
    serviceId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/services/${encodeURIComponent(serviceId)}/packages`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  vendorAvailability: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/availability`,
    ),
  createVendorAvailability: (
    organizationId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/availability`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  vendorRfqs: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/rfqs`,
    ),
  vendorOpenRfq: (organizationId: string, rfqId: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/rfqs/${encodeURIComponent(rfqId)}/open`,
      { method: "POST", body: {}, idempotencyKey: crypto.randomUUID() },
    ),
  vendorDeclineRfq: (organizationId: string, rfqId: string, reason?: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/rfqs/${encodeURIComponent(rfqId)}/decline`,
      { method: "POST", body: { ...(reason ? { reason } : {}) } },
    ),
  vendorCreateOffer: (
    organizationId: string,
    rfqId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/rfqs/${encodeURIComponent(rfqId)}/offers`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  vendorOffer: (organizationId: string, offerId: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}`,
    ),
  vendorUpdateOfferDraft: (
    organizationId: string,
    offerId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/draft`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  vendorSubmitOffer: (
    organizationId: string,
    offerId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/submit`,
      {
        method: "POST",
        body: {},
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  vendorWithdrawOffer: (
    organizationId: string,
    offerId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/withdraw`,
      { method: "POST", body: {}, ifMatch: version },
    ),
  vendorNegotiationMessages: (organizationId: string, offerId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/negotiation/messages`,
    ),
  vendorSendNegotiationMessage: (
    organizationId: string,
    offerId: string,
    body: string,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/negotiation/messages`,
      { method: "POST", body: { body } },
    ),
  vendorBookings: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/bookings`,
    ),
  vendorTransitionBooking: (
    organizationId: string,
    bookingId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/bookings/${encodeURIComponent(bookingId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  vendorContracts: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/contracts`,
    ),
  vendorTransitionContract: (
    organizationId: string,
    contractId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/contracts/${encodeURIComponent(contractId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  vendorAcknowledgeContract: (
    organizationId: string,
    contractId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/contracts/${encodeURIComponent(contractId)}/acknowledgements`,
      {
        method: "POST",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  reviewEligibilities: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/review-eligibilities`,
    ),
  review: (workspaceId: string, reviewId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}`,
    ),
  createReview: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/reviews`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateReviewDraft: (
    workspaceId: string,
    reviewId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/draft`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  publishReview: (workspaceId: string, reviewId: string, version: number) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/publish`,
      {
        method: "POST",
        body: { authenticityConfirmed: true },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  withdrawReview: (workspaceId: string, reviewId: string, version: number) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/withdraw`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  reportReview: (
    workspaceId: string,
    reviewId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/reviews/${encodeURIComponent(reviewId)}/reports`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  marketplaceReviews: (slug: string) =>
    request<{
      items: OperationResource[];
      summary: OperationResource | Record<string, unknown>;
      nextCursor: string | null;
    }>(`/marketplace/vendors/${encodeURIComponent(slug)}/reviews`),
  vendorReviews: (organizationId: string) =>
    request<{ items: OperationResource[]; summary: Record<string, unknown> }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/reviews`,
    ),
  saveVendorReviewReply: (
    organizationId: string,
    reviewId: string,
    body: string,
    version?: number,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/reviews/${encodeURIComponent(reviewId)}/reply`,
      {
        method: "PUT",
        body: { body },
        ...(version ? { ifMatch: version } : {}),
      },
    ),
  publishVendorReviewReply: (
    organizationId: string,
    reviewId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/reviews/${encodeURIComponent(reviewId)}/reply/publish`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  vendorReviewDisputes: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/review-disputes`,
    ),
  createVendorReviewDispute: (
    organizationId: string,
    reviewId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/reviews/${encodeURIComponent(reviewId)}/disputes`,
      {
        method: "POST",
        body: input,
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  vendorSubscriptionPlans: () =>
    request<{ items: OperationResource[] }>("/vendor-subscription-plans"),
  vendorSubscription: (organizationId: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/subscription`,
    ),
  vendorEntitlements: (organizationId: string) =>
    request<Record<string, unknown>>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/entitlements`,
    ),
  vendorUsage: (organizationId: string) =>
    request<Record<string, unknown>>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/usage`,
    ),
  createVendorSubscriptionCheckout: (
    organizationId: string,
    planKey: string,
    priceId?: string,
  ) =>
    request<Record<string, unknown>>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/subscription-checkouts`,
      {
        method: "POST",
        body: { planKey, priceId },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createVendorSubscriptionPortal: (organizationId: string) =>
    request<Record<string, unknown>>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/subscription-portal-sessions`,
      { method: "POST", idempotencyKey: crypto.randomUUID() },
    ),
  cancelVendorSubscription: (organizationId: string, version: number) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/subscription/cancel`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  resumeVendorSubscription: (organizationId: string, version: number) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/subscription/resume`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  vendorPayoutAccount: (organizationId: string) =>
    request<OperationResource | null>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/payout-account`,
    ),
  createVendorPayoutAccount: (
    organizationId: string,
    country = "RO",
    currency = "RON",
  ) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/payout-account`,
      {
        method: "POST",
        body: { country, currency },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createVendorPayoutOnboarding: (organizationId: string) =>
    request<OperationResource>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/payout-onboarding-links`,
      { method: "POST", idempotencyKey: crypto.randomUUID() },
    ),
  vendorBalance: (organizationId: string) =>
    request<Record<string, unknown>>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/balance`,
    ),
  vendorSettlements: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/settlements`,
    ),
  vendorPayouts: (organizationId: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/payouts`,
    ),
  vendorMonetizationOverview: (organizationId: string) =>
    request<Record<string, unknown>>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/trust-monetization-overview`,
    ),
  vendorTrustSearch: (organizationId: string, query: string) =>
    request<{ items: OperationResource[] }>(
      `/vendor-organizations/${encodeURIComponent(organizationId)}/search?q=${encodeURIComponent(query)}`,
    ),
  platformReviewModeration: () =>
    request<{ items: OperationResource[] }>("/platform/review-moderation"),
  platformModerationCase: (caseId: string) =>
    request<OperationResource>(
      `/platform/review-moderation/${encodeURIComponent(caseId)}`,
    ),
  platformModerationDecision: (
    caseId: string,
    version: number,
    decision: string,
    reason: string,
  ) =>
    request<OperationResource>(
      `/platform/review-moderation/${encodeURIComponent(caseId)}/decisions`,
      {
        method: "POST",
        body: { decision, reason },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  platformSubscriptionProducts: () =>
    request<{ items: OperationResource[] }>("/platform/subscription-products"),
  platformSubscriptionPrices: () =>
    request<{ items: OperationResource[] }>("/platform/subscription-prices"),
  platformSettlements: () =>
    request<{ items: OperationResource[] }>("/platform/settlements"),
  platformCalculateSettlement: (
    vendorOrganizationId: string,
    currency = "RON",
  ) =>
    request<OperationResource>("/platform/settlements/calculate", {
      method: "POST",
      body: { vendorOrganizationId, currency },
      idempotencyKey: crypto.randomUUID(),
    }),
  platformFinalizeSettlement: (settlementId: string, version: number) =>
    request<OperationResource>(
      `/platform/settlements/${encodeURIComponent(settlementId)}/finalize`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  platformCreatePayout: (settlementId: string) =>
    request<OperationResource>(
      `/platform/settlements/${encodeURIComponent(settlementId)}/payout`,
      { method: "POST", idempotencyKey: crypto.randomUUID() },
    ),
  weddingDayCommandCenter: (workspaceId: string) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/command-center`,
    ),
  weddingDayPlans: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans`,
    ),
  weddingDayPlan: (workspaceId: string, planId: string) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}`,
    ),
  createWeddingDayPlan: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  updateWeddingDayPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  transitionWeddingDayPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    action: "publish" | "go-live" | "pause" | "complete",
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/${action}`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  weddingDayRunOfShow: (workspaceId: string, planId: string) =>
    request<{
      items: OperationResource[];
      dependencies: OperationResource[];
      assignments: OperationResource[];
      serverTime: string;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/run-of-show`,
    ),
  createRunOfShowItem: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/run-of-show/items`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  transitionRunOfShowItem: (
    workspaceId: string,
    itemId: string,
    version: number,
    transition: string,
    reason?: string,
    delayEstimateMinutes?: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/run-of-show/items/${encodeURIComponent(itemId)}/transitions`,
      {
        method: "POST",
        body: {
          transition,
          ...(reason ? { reason } : {}),
          ...(delayEstimateMinutes === undefined
            ? {}
            : { delayEstimateMinutes }),
        },
        ifMatch: version,
      },
    ),
  weddingDayIncidents: (workspaceId: string, planId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/incidents`,
    ),
  createWeddingDayIncident: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/incidents`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  transitionWeddingDayIncident: (
    workspaceId: string,
    incidentId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/incidents/${encodeURIComponent(incidentId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
      },
    ),
  weddingDayChecklists: (workspaceId: string, planId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/checklists`,
    ),
  createWeddingDayChecklistItem: (
    workspaceId: string,
    checklistId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/checklists/${encodeURIComponent(checklistId)}/items`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  weddingDayAnnouncements: (workspaceId: string, planId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/announcements`,
    ),
  createWeddingDayAnnouncement: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/plans/${encodeURIComponent(planId)}/announcements`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  publishWeddingDayAnnouncement: (
    workspaceId: string,
    announcementId: string,
    version: number,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day/announcements/${encodeURIComponent(announcementId)}/publish`,
      { method: "POST", ifMatch: version, idempotencyKey: crypto.randomUUID() },
    ),
  checkInSessions: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/check-in/sessions`,
    ),
  checkInAttendance: (workspaceId: string, sessionId: string) =>
    request<Record<string, unknown>>(
      `/workspaces/${encodeURIComponent(workspaceId)}/check-in/sessions/${encodeURIComponent(sessionId)}/attendance`,
    ),
  manualGuestCheckIn: (
    workspaceId: string,
    sessionId: string,
    guestId: string,
    reason: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/check-in/sessions/${encodeURIComponent(sessionId)}/check-ins`,
      {
        method: "POST",
        body: {
          commandId: crypto.randomUUID(),
          guestIds: [guestId],
          override: true,
          overrideReason: reason,
        },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  createGallery: (workspaceId: string, input: Record<string, unknown>) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/galleries`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  weddingDayExport: (workspaceId: string, input: Record<string, unknown>) =>
    request<{ artifactId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/wedding-day-exports`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  guestMomentsForModeration: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-moments`,
    ),
  guestMomentPreview: (workspaceId: string, momentId: string) =>
    request<{ url: string; expiresAt: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-moments/${encodeURIComponent(momentId)}/preview`,
    ),
  moderateGuestMoment: (
    workspaceId: string,
    momentId: string,
    version: number,
    transition: string,
    reason?: string,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/guest-moments/${encodeURIComponent(momentId)}/transitions`,
      {
        method: "POST",
        body: { transition, ...(reason ? { reason } : {}) },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  guestBootstrap: (token: string) =>
    publicRequest<GuestCompanionBootstrapResource>(
      `/guest/bootstrap?token=${encodeURIComponent(token)}`,
    ),
  markGuestInvitationOpen: (input: GuestInvitationOpen) =>
    publicRequest<{
      recipientId: string;
      invitationOpenedAt: string;
      duplicate: boolean;
    }>("/guest/invitation-open", {
      method: "POST",
      body: input,
    }),
  markGuestLinkAccess: (input: GuestLinkAccess) =>
    publicRequest<{
      recipientId: string;
      linkAccessedAt: string;
      duplicate: boolean;
    }>("/guest/link-access", {
      method: "POST",
      body: input,
    }),
  guestRsvp: (token: string) =>
    publicRequest<RsvpSubmissionResource>(
      `/guest/rsvp?token=${encodeURIComponent(token)}`,
    ),
  submitGuestRsvp: (input: Record<string, unknown>) =>
    publicRequest<RsvpSubmissionResource>("/guest/rsvp", {
      method: "PUT",
      body: input,
    }),
  guestWeddingDayLive: (token: string) =>
    publicRequest<Record<string, unknown>>(
      `/guest/wedding-day/live?token=${encodeURIComponent(token)}`,
    ),
  guestCheckInCredential: (token: string) =>
    publicRequest<(OperationResource & { token: string }) | null>(
      `/guest/check-in/credential?token=${encodeURIComponent(token)}`,
    ),
  guestMoments: (token: string) =>
    publicRequest<{ items: OperationResource[] }>(
      `/guest/moments?token=${encodeURIComponent(token)}`,
    ),
  createGuestMoment: (token: string, input: Record<string, unknown>) =>
    publicRequest<{
      moment: OperationResource;
      media: OperationResource;
      upload: {
        method: "PUT";
        url: string;
        headers: Record<string, string>;
        expiresAt: string;
      };
    }>(`/guest/moments?token=${encodeURIComponent(token)}`, {
      method: "POST",
      body: input,
      idempotencyKey: crypto.randomUUID(),
    }),
  completeGuestMoment: (
    token: string,
    momentId: string,
    checksumSha256: string,
  ) =>
    publicRequest<OperationResource>(
      `/guest/moments/${encodeURIComponent(momentId)}/complete?token=${encodeURIComponent(token)}`,
      { method: "POST", body: { checksumSha256 } },
    ),
  guestGallery: (token: string) =>
    publicRequest<{ items: OperationResource[] }>(
      `/guest/gallery?token=${encodeURIComponent(token)}`,
    ),
  reportGuestMoment: (
    token: string,
    momentId: string,
    reason: string,
    details?: string,
  ) =>
    publicRequest<{ reported: true; id: string }>(
      `/guest/moments/${encodeURIComponent(momentId)}/reports?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        body: { reason, details },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  copilotConversations: (workspaceId: string, surface?: string) =>
    request<{
      items: CopilotConversationResource[];
      nextCursor: string | null;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/conversations${surface ? `?surface=${encodeURIComponent(surface)}` : ""}`,
    ),
  copilotSettings: (workspaceId: string) =>
    request<CopilotSettingsResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/settings`,
    ),
  updateCopilotSettings: (
    workspaceId: string,
    input: Partial<
      Pick<
        CopilotSettingsResource,
        | "memoryEnabled"
        | "webResearchEnabled"
        | "proactiveSuggestions"
        | "memoryRetentionDays"
      >
    > & { version: number },
  ) =>
    request<CopilotSettingsResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/settings`,
      { method: "PATCH", body: input, ifMatch: input.version },
    ),
  copilotMemories: (workspaceId: string) =>
    request<{ items: CopilotMemoryResource[]; nextCursor: string | null }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/memories`,
    ),
  createCopilotMemory: (
    workspaceId: string,
    input: {
      scope: "WORKSPACE" | "USER";
      kind: "FACT" | "PREFERENCE" | "DECISION" | "CONSTRAINT";
      title: string;
      content: string;
      sensitivity?: "NORMAL" | "SENSITIVE";
    },
  ) =>
    request<CopilotMemoryResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/memories`,
      {
        method: "POST",
        body: {
          ...input,
          sourceType: "USER_CONFIRMED",
          confirmedByUser: true,
        },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  deleteCopilotMemory: (
    workspaceId: string,
    memoryId: string,
    version: number,
  ) =>
    request<CopilotMemoryResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/memories/${encodeURIComponent(memoryId)}`,
      { method: "DELETE", ifMatch: version },
    ),
  createCopilotConversation: (
    workspaceId: string,
    input: { title?: string; surface?: string } = {},
  ) =>
    request<CopilotConversationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/conversations`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  copilotConversation: (workspaceId: string, conversationId: string) =>
    request<CopilotConversationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/conversations/${encodeURIComponent(conversationId)}`,
    ),
  sendCopilotMessage: (
    workspaceId: string,
    conversationId: string,
    input: {
      content: string;
      mode?: "deterministic" | "ai_enriched" | "auto";
      research?: boolean;
      surface?: string;
    },
  ) =>
    request<{
      message: CopilotMessageResource;
      run: CopilotRunResource;
      job: BackgroundJobResource;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  copilotRun: (workspaceId: string, runId: string) =>
    request<CopilotRunResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/runs/${encodeURIComponent(runId)}`,
    ),
  copilotFeedback: (
    workspaceId: string,
    messageId: string,
    rating: "HELPFUL" | "NOT_HELPFUL",
    reason?: string,
  ) =>
    request<{ id: string; rating: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/messages/${encodeURIComponent(messageId)}/feedback`,
      { method: "POST", body: { rating, reason } },
    ),
  copilotProposal: (workspaceId: string, proposalId: string) =>
    request<CopilotProposalResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/proposals/${encodeURIComponent(proposalId)}`,
    ),
  updateCopilotProposal: (
    workspaceId: string,
    proposalId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<CopilotProposalResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/proposals/${encodeURIComponent(proposalId)}`,
      {
        method: "PATCH",
        body: { ...input, version },
        ifMatch: version,
      },
    ),
  reviewCopilotProposal: (
    workspaceId: string,
    proposalId: string,
    version: number,
    decision: "APPROVE" | "REJECT",
    reason?: string,
  ) =>
    request<CopilotProposalResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/proposals/${encodeURIComponent(proposalId)}/${decision === "APPROVE" ? "approve" : "reject"}`,
      {
        method: "POST",
        body: { reason },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  executeCopilotProposal: (
    workspaceId: string,
    proposalId: string,
    version: number,
    confirmHighRisk = false,
  ) =>
    request<{
      executionId: string;
      resources: Array<{ type: string; id: string }>;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/copilot/proposals/${encodeURIComponent(proposalId)}/execute`,
      {
        method: "POST",
        body: { confirmHighRisk },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  risks: (
    workspaceId: string,
    filters: Record<string, string | undefined> = {},
  ) =>
    request<{
      items: RiskResource[];
      nextCursor: string | null;
      summary: Record<string, number>;
    }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks${queryString(filters)}`,
    ),
  risk: (workspaceId: string, riskId: string) =>
    request<RiskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks/${encodeURIComponent(riskId)}`,
    ),
  createRisk: (workspaceId: string, input: Record<string, unknown>) =>
    request<RiskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateRisk: (
    workspaceId: string,
    riskId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<RiskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks/${encodeURIComponent(riskId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  assessRisk: (
    workspaceId: string,
    riskId: string,
    version: number,
    input: { probability: number; impact: number; reason?: string },
  ) =>
    request<RiskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks/${encodeURIComponent(riskId)}/assessments`,
      {
        method: "POST",
        body: { ...input, version },
        ifMatch: version,
      },
    ),
  transitionRisk: (
    workspaceId: string,
    riskId: string,
    version: number,
    transition: string,
    reason: string,
  ) =>
    request<RiskResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks/${encodeURIComponent(riskId)}/transitions`,
      {
        method: "POST",
        body: { transition, reason, version },
        ifMatch: version,
      },
    ),
  addRiskMitigation: (
    workspaceId: string,
    riskId: string,
    input: Record<string, unknown>,
  ) =>
    request<OperationResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risks/${encodeURIComponent(riskId)}/mitigations`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  updateContingencyPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<ContingencyPlanResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans/${encodeURIComponent(planId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  detectRisks: (workspaceId: string) =>
    request<{ detectionRunId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/risk-detections`,
      { method: "POST", body: {}, idempotencyKey: crypto.randomUUID() },
    ),
  contingencyPlans: (workspaceId: string) =>
    request<{ items: ContingencyPlanResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans`,
    ),
  contingencyPlan: (workspaceId: string, planId: string) =>
    request<ContingencyPlanResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans/${encodeURIComponent(planId)}`,
    ),
  createContingencyPlan: (
    workspaceId: string,
    input: Record<string, unknown>,
  ) =>
    request<ContingencyPlanResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  simulateContingencyPlan: (
    workspaceId: string,
    planId: string,
    input: Record<string, unknown>,
  ) =>
    request<{ simulationId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans/${encodeURIComponent(planId)}/simulations`,
      { method: "POST", body: input, idempotencyKey: crypto.randomUUID() },
    ),
  approveContingencyPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    reason: string,
  ) =>
    request<ContingencyPlanResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans/${encodeURIComponent(planId)}/approve`,
      {
        method: "POST",
        body: { reason },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  activateContingencyPlan: (
    workspaceId: string,
    planId: string,
    version: number,
    reason: string,
  ) =>
    request<{ activationId: string; activatedAt: string }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/contingency-plans/${encodeURIComponent(planId)}/activate`,
      {
        method: "POST",
        body: { reason },
        ifMatch: version,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  automationTemplates: (workspaceId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-templates`,
    ),
  automationRules: (workspaceId: string) =>
    request<{ items: AutomationRuleResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-rules`,
    ),
  automationRule: (workspaceId: string, ruleId: string) =>
    request<AutomationRuleResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-rules/${encodeURIComponent(ruleId)}`,
    ),
  updateAutomationRule: (
    workspaceId: string,
    ruleId: string,
    version: number,
    input: Record<string, unknown>,
  ) =>
    request<AutomationRuleResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-rules/${encodeURIComponent(ruleId)}`,
      { method: "PATCH", body: input, ifMatch: version },
    ),
  createAutomationRule: (workspaceId: string, input: Record<string, unknown>) =>
    request<AutomationRuleResource>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-rules`,
      {
        method: "POST",
        body: input,
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  executeAutomationRule: (
    workspaceId: string,
    ruleId: string,
    version: number,
    mode: "DRY_RUN" | "EXECUTE",
  ) =>
    request<{ executionId: string; job: BackgroundJobResource }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-rules/${encodeURIComponent(ruleId)}/executions`,
      {
        method: "POST",
        body: { mode, version },
        idempotencyKey: crypto.randomUUID(),
      },
    ),
  automationExecutions: (workspaceId: string, ruleId: string) =>
    request<{ items: OperationResource[] }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/automation-rules/${encodeURIComponent(ruleId)}/executions`,
    ),
};

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof DemoModeApiBlockedError) return error.message;
  return "Serviciul Sarbato nu este disponibil momentan. Încearcă din nou.";
}
