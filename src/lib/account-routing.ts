import type { RegistrationIntent } from "@weddingos/contracts";

export function safeInternalPath(value: string | null | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
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
  return requested?.startsWith("/invitation") ||
    requested?.startsWith("/vendor-invitation")
    ? ("INVITED_MEMBER" as const)
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

  const contextCount = [
    input.workspaceCount > 0,
    input.hasVendorOrganizations,
    input.hasPlatformAccess,
  ].filter(Boolean).length;
  if (contextCount > 1) return "/start";
  if (input.hasPlatformAccess) return "/admin";
  if (
    input.registrationIntent === "SERVICE_PROVIDER" &&
    input.hasVendorOrganizations
  )
    return "/vendor";
  if (input.workspaceCount > 0) return "/overview";
  if (input.hasVendorOrganizations) return "/vendor";
  return destinationForRegistration(input.registrationIntent);
}
