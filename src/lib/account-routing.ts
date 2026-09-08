import type { RegistrationIntent } from "@weddingos/contracts";

export type SelectedWorkspacePlan = "PLUS" | "PRO";

export function selectedWorkspacePlan(
  value: string | null | undefined,
): SelectedWorkspacePlan | null {
  return value === "PLUS" || value === "PRO" ? value : null;
}

function hasUnsafeInternalPathCharacter(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || code < 32 || code === 127;
  });
}

export function safeInternalPath(value: string | null | undefined) {
  if (!value) return null;
  const candidate = value.trim();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    hasUnsafeInternalPathCharacter(candidate)
  ) {
    return null;
  }
  try {
    const decoded = decodeURIComponent(candidate);
    if (
      decoded.startsWith("//") ||
      hasUnsafeInternalPathCharacter(decoded)
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return candidate;
}

function matchesRoute(path: string, route: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function destinationForRegistration(
  intent: RegistrationIntent,
  returnTo?: string | null,
) {
  const requested = safeInternalPath(returnTo);
  if (requested) return requested;
  if (intent === "SERVICE_PROVIDER") return "/vendor?setup=1";
  if (intent === "INVITED_MEMBER") return "/start";
  return "/onboarding";
}

export function inferredRegistrationIntent(returnTo?: string | null) {
  const requested = safeInternalPath(returnTo);
  if (requested && matchesRoute(requested, "/vendor-invitation"))
    return "SERVICE_PROVIDER" as const;
  if (requested && matchesRoute(requested, "/vendor"))
    return "SERVICE_PROVIDER" as const;
  if (requested && matchesRoute(requested, "/invitation"))
    return "INVITED_MEMBER" as const;
  if (requested && matchesRoute(requested, "/onboarding"))
    return "EVENT_ORGANIZER" as const;
  return null;
}

export function registrationIntentForEntry(
  returnTo?: string | null,
  requestedIntent?: string | null,
): RegistrationIntent | null {
  const inferred = inferredRegistrationIntent(returnTo);
  if (inferred) return inferred;
  return requestedIntent === "EVENT_ORGANIZER" ||
    requestedIntent === "SERVICE_PROVIDER" ||
    requestedIntent === "INVITED_MEMBER"
    ? requestedIntent
    : null;
}

export function destinationAfterAuthentication(input: {
  returnTo?: string | null;
  registrationIntent: RegistrationIntent;
  workspaceCount: number;
  hasVendorOrganizations: boolean;
  hasPlatformAccess: boolean;
}) {
  const requested = safeInternalPath(input.returnTo);
  if (requested) return requested;

  // The registration intent is the user's preferred working context. A user
  // may also own a provider profile or have platform access, but ordinary
  // organizer sign-in should still open the event dashboard. The explicit
  // /start route remains available from the account menu for switching.
  if (
    input.registrationIntent === "EVENT_ORGANIZER" &&
    input.workspaceCount > 0
  )
    return "/overview";
  if (
    input.registrationIntent === "SERVICE_PROVIDER" &&
    input.hasVendorOrganizations
  )
    return "/vendor";
  if (input.registrationIntent === "INVITED_MEMBER") return "/start";

  const contextCount = [
    input.workspaceCount > 0,
    input.hasVendorOrganizations,
    input.hasPlatformAccess,
  ].filter(Boolean).length;
  if (contextCount > 1) return "/start";
  if (input.hasPlatformAccess) return "/admin";
  if (input.workspaceCount > 0) return "/overview";
  if (input.hasVendorOrganizations) return "/vendor";
  return destinationForRegistration(input.registrationIntent);
}
