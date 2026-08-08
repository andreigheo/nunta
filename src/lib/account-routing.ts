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
