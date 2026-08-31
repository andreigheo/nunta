import { readFile, writeFile } from "node:fs/promises";

const registryPath = new URL(
  "../docs/API_OPERATION_REGISTRY.json",
  import.meta.url,
);
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const sliceDomains = new Set([
  "auth_session",
  "workspace_team_onboarding_billing",
  "bootstrap_search_notifications_activity",
]);

const active = {
  "AUTH.REGISTER": {
    body: [
      "firstName",
      "lastName",
      "email",
      "password",
      "acceptedTermsVersion",
      "marketingConsent?",
    ],
    response: "RegisterResponse",
    permissions: ["public"],
    events: ["user.registered.v1"],
  },
  "AUTH.SESSION_CREATE": {
    body: ["email", "password", "remember"],
    response: "SessionCreated (token only in HttpOnly cookie)",
    permissions: ["public"],
    events: ["session.created.v1"],
  },
  "AUTH.SESSION_DELETE": {
    response: "NoContent",
    events: ["session.revoked.v1"],
  },
  "AUTH.ME_GET": { response: "CurrentUserResponse", audit: false },
  "AUTH.MAGIC_LINK_REQUEST": {
    body: ["email"],
    response: "NeutralAuthResponse",
    permissions: ["public"],
    events: ["magic_link.requested.v1"],
  },
  "AUTH.MAGIC_LINK_EXCHANGE": {
    body: ["token"],
    response: "SessionCreated (token only in HttpOnly cookie)",
    permissions: ["public"],
    events: ["magic_link.exchanged.v1"],
  },
  "AUTH.EMAIL_VERIFICATION_REQUEST": {
    body: ["email"],
    response: "NeutralAuthResponse",
    permissions: ["public"],
    events: ["user.email_verification_requested.v1"],
  },
  "AUTH.EMAIL_VERIFY": {
    body: ["token | email + code"],
    response: "EmailVerificationResult",
    permissions: ["public"],
    events: ["user.email_verified.v1"],
  },
  "AUTH.PASSWORD_RESET_REQUEST": {
    body: ["email"],
    response: "NeutralAuthResponse",
    permissions: ["public"],
    events: ["password.reset_requested.v1"],
  },
  "AUTH.PASSWORD_RESET": {
    body: ["token", "password"],
    response: "PasswordResetResult",
    permissions: ["public"],
    events: ["password.changed.v1"],
  },
  "AUTH.SESSION_LIST": { response: "SessionSummary[]", audit: false },
  "AUTH.SESSION_REVOKE": {
    response: "NoContent",
    events: ["session.revoked.v1"],
  },
  "WORKSPACE.LIST": { response: "WorkspaceSummary[]", audit: false },
  "WORKSPACE.CREATE": {
    body: [
      "title",
      "eventType",
      "eventDate?",
      "organizerName?",
      "partnerOneName?",
      "partnerTwoName?",
      "weddingDate? (deprecated alias)",
      "location?",
      "locale?",
      "timezone?",
      "currency?",
    ],
    response: "WorkspaceSummary",
    permissions: ["authenticated_user"],
    events: ["workspace.created.v1"],
    idempotency:
      "Idempotency-Key required; same key and payload replays the stored response",
  },
  "WORKSPACE.UPDATE": {
    body: [
      "title?",
      "eventType?",
      "eventDate?",
      "organizerName?",
      "partnerOneName?",
      "partnerTwoName?",
      "weddingDate? (deprecated alias)",
      "location?",
      "locale?",
      "timezone?",
      "currency?",
      "version",
    ],
    response: "WorkspaceUpdateResponse",
    permissions: ["workspace.update"],
    events: ["workspace.updated.v1"],
  },
  "TEAM.MEMBER_LIST": {
    response: "TeamListResponse",
    permissions: ["team.read"],
    audit: false,
  },
  "TEAM.INVITATION_CREATE": {
    body: ["email", "roleTemplate", "capabilityOverrides"],
    response: "TeamInvitationResponse",
    permissions: ["team.invite"],
    events: ["membership.invited.v1"],
  },
  "TEAM.INVITATION_GET": {
    response: "PublicTeamInvitationResponse",
    permissions: ["public"],
    audit: false,
  },
  "TEAM.INVITATION_ACCEPT": {
    response: "TeamInvitationAcceptanceResponse",
    permissions: ["authenticated_user; token email must equal session email"],
    events: ["membership.invitation_accepted.v1"],
  },
  "TEAM.INVITATION_DECLINE": {
    response: "TeamInvitationDeclineResponse",
    permissions: ["authenticated_user; token email must equal session email"],
    events: ["membership.invitation_declined.v1"],
  },
  "TEAM.INVITATION_RESEND": {
    response: "TeamInvitationResponse",
    permissions: ["team.invite"],
    events: ["membership.invitation_resent.v1"],
  },
  "TEAM.INVITATION_REVOKE": {
    response: "NoContent",
    permissions: ["team.invite"],
    events: ["membership.invitation_revoked.v1"],
  },
  "TEAM.MEMBER_UPDATE": {
    body: ["roleTemplate?", "capabilityOverrides?", "version"],
    response: "TeamMemberResponse",
    permissions: ["team.update_role"],
    events: ["membership.role_changed.v1"],
  },
  "TEAM.MEMBER_REMOVE": {
    response: "NoContent",
    permissions: ["team.remove"],
    events: ["membership.removed.v1"],
  },
  "SHELL.BOOTSTRAP_GET": {
    response: "WorkspaceBootstrapResponse",
    permissions: ["workspace.read"],
    audit: false,
  },
  "NOTIFICATION.PREFERENCES_GET": {
    response: "NotificationPreferenceResponse",
    permissions: ["authenticated_user"],
    audit: false,
  },
  "NOTIFICATION.PREFERENCES_UPDATE": {
    method: "PATCH",
    body: [
      "securityEmail?",
      "tasksEmail?",
      "paymentsEmail?",
      "rsvpEmail?",
      "vendorsEmail?",
      "digestEmail?",
      "marketingEmail?",
      "productPush?",
    ],
    response: "NotificationPreferenceResponse",
    permissions: ["authenticated_user"],
    audit: false,
  },
};

const currentUserOperationIds = new Set([
  "AUTH.ME_UPDATE",
  "AUTH.PREFERENCES_GET",
  "AUTH.PREFERENCES_UPDATE",
]);

const unitTested = new Set([
  "AUTH.REGISTER",
  "AUTH.EMAIL_VERIFY",
  "AUTH.PASSWORD_RESET",
  "AUTH.MAGIC_LINK_EXCHANGE",
  "TEAM.INVITATION_CREATE",
  "TEAM.INVITATION_GET",
  "TEAM.INVITATION_ACCEPT",
  "TEAM.INVITATION_DECLINE",
  "TEAM.INVITATION_RESEND",
  "TEAM.INVITATION_REVOKE",
  "TEAM.MEMBER_UPDATE",
  "TEAM.MEMBER_REMOVE",
]);

const integrationTested = new Set([
  "AUTH.REGISTER",
  "AUTH.SESSION_CREATE",
  "AUTH.SESSION_DELETE",
  "AUTH.ME_GET",
  "AUTH.EMAIL_VERIFY",
  "AUTH.PASSWORD_RESET_REQUEST",
  "AUTH.PASSWORD_RESET",
  "AUTH.SESSION_LIST",
  "AUTH.SESSION_REVOKE",
  "WORKSPACE.LIST",
  "WORKSPACE.CREATE",
  "WORKSPACE.UPDATE",
  "TEAM.MEMBER_LIST",
  "TEAM.INVITATION_CREATE",
  "TEAM.INVITATION_GET",
  "TEAM.INVITATION_ACCEPT",
  "TEAM.INVITATION_DECLINE",
  "TEAM.INVITATION_RESEND",
  "TEAM.INVITATION_REVOKE",
  "TEAM.MEMBER_UPDATE",
  "TEAM.MEMBER_REMOVE",
  "SHELL.BOOTSTRAP_GET",
]);

const e2eTested = new Set([
  "AUTH.REGISTER",
  "AUTH.SESSION_CREATE",
  "AUTH.ME_GET",
  "AUTH.EMAIL_VERIFY",
  "AUTH.SESSION_LIST",
  "AUTH.SESSION_REVOKE",
  "WORKSPACE.LIST",
  "WORKSPACE.CREATE",
  "WORKSPACE.UPDATE",
  "TEAM.MEMBER_LIST",
  "TEAM.INVITATION_CREATE",
  "TEAM.INVITATION_GET",
  "TEAM.INVITATION_ACCEPT",
  "TEAM.MEMBER_REMOVE",
  "SHELL.BOOTSTRAP_GET",
]);

for (const operation of registry.operations) {
  if (!sliceDomains.has(operation.domain)) continue;
  operation.route = operation.route.replace(/^\/v1/, "/api/v1");
  operation.implementationStatus = "planned";
  operation.currentBackendCoverage = "PLANNED_FUTURE_SLICE";
  operation.response = {
    data: "PlannedResponse (not implemented in Slice 0/1)",
    meta: ["requestId"],
  };
  operation.eventsEmitted = [];
  operation.jobsTriggered = [];
  operation.validation = operation.permissions.includes("public")
    ? [
        "public request; no session or tenant required",
        "server-side schema validation",
      ]
    : [
        "authenticated server-side request",
        "server-side schema validation",
        "workspace membership/capability validation when tenant-scoped",
      ];
  operation.errors = operation.errors.filter(
    (code) =>
      !(operation.method === "GET" && code === "VERSION_CONFLICT") &&
      !(
        operation.permissions.includes("public") &&
        ["UNAUTHENTICATED", "FORBIDDEN"].includes(code)
      ),
  );

  const spec = active[operation.id];
  if (!spec) {
    if (
      ["AUTH.MFA_CHALLENGE_CREATE", "AUTH.MFA_VERIFY"].includes(operation.id)
    ) {
      operation.implementationStatus = "feature_flagged_planned";
      operation.currentBackendCoverage = "FEATURE_DISABLED_SLICE_1";
      operation.response = {
        data: "FeatureDisabledProblem",
        meta: ["requestId"],
      };
      operation.errors = [
        "UNAUTHENTICATED",
        "VALIDATION_FAILED",
        "FEATURE_DISABLED",
      ];
      operation.request.body =
        operation.id === "AUTH.MFA_CHALLENGE_CREATE"
          ? ["method"]
          : ["challengeId", "code"];
    }
    continue;
  }

  operation.method = spec.method ?? operation.method;
  operation.implementationStatus = "active";
  operation.currentBackendCoverage = "IMPLEMENTED_SLICE_1";
  operation.request.body = spec.body ?? [];
  operation.response = {
    data: spec.response,
    meta: [
      "requestId",
      ...(spec.response === "NoContent" ? [] : ["version when mutable"]),
    ],
  };
  operation.permissions = spec.permissions ?? operation.permissions;
  operation.validation = operation.permissions.includes("public")
    ? [
        "public request; no session or tenant required",
        "shared Zod request schema",
        "rate limit where security-sensitive",
      ]
    : [
        "valid server-side session",
        "shared Zod request schema",
        "active workspace membership and atomic capability when tenant-scoped",
      ];
  operation.errors = activeErrors(
    operation.id,
    operation.method,
    operation.permissions,
  );
  operation.idempotency =
    spec.idempotency ??
    "not required; one-time token/uniqueness semantics apply where relevant";
  operation.concurrency = spec.body?.includes("version")
    ? "body.version required and compared transactionally"
    : "transactional uniqueness or read-only";
  operation.audit = spec.audit ?? true;
  operation.eventsEmitted = spec.events ?? [];
}

const workspaceIndex = registry.operations.findIndex(
  (operation) => operation.id === "WORKSPACE.LIST",
);
registry.operations = registry.operations.filter(
  (operation) => !currentUserOperationIds.has(operation.id),
);
const insertionIndex = registry.operations.findIndex(
  (operation) => operation.id === "WORKSPACE.LIST",
);
const currentUserOperations = [
  operation(
    "AUTH.ME_UPDATE",
    "PATCH",
    "/api/v1/me",
    ["firstName", "lastName"],
    "UserProfileResponse",
  ),
  operation(
    "AUTH.PREFERENCES_GET",
    "GET",
    "/api/v1/me/preferences",
    [],
    "UserPreferenceResponse",
    false,
  ),
  operation(
    "AUTH.PREFERENCES_UPDATE",
    "PATCH",
    "/api/v1/me/preferences",
    ["locale?", "timezone?", "theme?", "lastActiveWorkspaceId?"],
    "UserPreferenceResponse",
  ),
];
registry.operations.splice(
  insertionIndex === -1 ? workspaceIndex : insertionIndex,
  0,
  ...currentUserOperations,
);

for (const operation of registry.operations) {
  if (!sliceDomains.has(operation.domain)) continue;
  if (operation.implementationStatus === "active") {
    operation.handoffStatuses = [
      "IMPLEMENTED",
      ...(unitTested.has(operation.id) ? ["UNIT_TESTED"] : []),
      ...(integrationTested.has(operation.id) ? ["INTEGRATION_TESTED"] : []),
      ...(e2eTested.has(operation.id) ? ["E2E_TESTED"] : []),
    ];
  } else if (operation.implementationStatus === "feature_flagged_planned") {
    operation.handoffStatuses = ["FEATURE_FLAGGED"];
  } else {
    operation.handoffStatuses = ["PLANNED"];
  }
}

registry.schemaVersion = "2.2.0";
registry.generatedAt = "2026-07-18";
registry.count = registry.operations.length;
registry.countsByDomain = Object.fromEntries(
  Object.entries(
    registry.operations.reduce((counts, operation) => {
      counts[operation.domain] = (counts[operation.domain] ?? 0) + 1;
      return counts;
    }, {}),
  ),
);
registry.slice01Handoff = {
  active: registry.operations.filter(
    (operation) =>
      sliceDomains.has(operation.domain) &&
      operation.implementationStatus === "active",
  ).length,
  featureFlagged: registry.operations.filter(
    (operation) =>
      sliceDomains.has(operation.domain) &&
      operation.implementationStatus === "feature_flagged_planned",
  ).length,
  planned: registry.operations.filter(
    (operation) =>
      sliceDomains.has(operation.domain) &&
      operation.implementationStatus === "planned",
  ).length,
};
registry.repositoryCoverage =
  "Slice 0/1 active contracts are implemented in apps/api and shared through @weddingos/contracts; later module contracts remain planned.";

await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

function activeErrors(id, method, permissions) {
  const errors = new Set(["VALIDATION_FAILED"]);
  if (!permissions.includes("public")) errors.add("UNAUTHENTICATED");
  if (
    id.startsWith("WORKSPACE.") ||
    id.startsWith("TEAM.") ||
    id === "SHELL.BOOTSTRAP_GET"
  ) {
    errors.add("FORBIDDEN");
    errors.add("WORKSPACE_ARCHIVED");
  }
  if (
    method !== "POST" ||
    id.includes("VERIFY") ||
    id.includes("EXCHANGE") ||
    id.includes("RESET")
  )
    errors.add("NOT_FOUND");
  if (
    id.includes("TOKEN") ||
    id.includes("VERIF") ||
    id.includes("MAGIC") ||
    id.includes("PASSWORD_RESET") ||
    id.includes("INVITATION")
  ) {
    errors.add("TOKEN_INVALID");
    errors.add("TOKEN_EXPIRED");
  }
  if (id === "AUTH.SESSION_CREATE") {
    errors.add("INVALID_CREDENTIALS");
    errors.add("EMAIL_NOT_VERIFIED");
    errors.add("RATE_LIMITED");
  }
  if (
    id.includes("REGISTER") ||
    id.includes("REQUEST") ||
    id.includes("RESEND")
  )
    errors.add("RATE_LIMITED");
  if (id.includes("UPDATE")) errors.add("VERSION_CONFLICT");
  if (id === "WORKSPACE.CREATE") errors.add("IDEMPOTENCY_CONFLICT");
  if (id === "TEAM.MEMBER_UPDATE" || id === "TEAM.MEMBER_REMOVE")
    errors.add("LAST_OWNER_PROTECTED");
  if (id === "TEAM.INVITATION_REVOKE") errors.add("INVITATION_REVOKED");
  return [...errors];
}

function operation(id, method, route, body, response, audit = true) {
  return {
    id,
    domain: "auth_session",
    method,
    route,
    purpose:
      id === "AUTH.ME_UPDATE"
        ? "Update the authenticated profile"
        : id.endsWith("GET")
          ? "Read authenticated user preferences"
          : "Update authenticated user preferences",
    request: { path: [], body },
    response: { data: response, meta: ["requestId", "version when mutable"] },
    permissions: ["authenticated_user"],
    validation: ["valid server-side session", "shared Zod request schema"],
    errors: [
      "UNAUTHENTICATED",
      "VALIDATION_FAILED",
      ...(method === "PATCH" ? ["VERSION_CONFLICT"] : []),
    ],
    idempotency: "not required",
    concurrency: "transactional update",
    audit,
    eventsEmitted: [],
    jobsTriggered: [],
    currentBackendCoverage: "IMPLEMENTED_SLICE_1",
    implementationStatus: "active",
    reusedBy: [],
  };
}
