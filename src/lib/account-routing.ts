import type { RegistrationIntent } from "@weddingos/contracts";

export function safeInternalPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function inferredRegistrationIntent(
  returnTo: string | null | undefined,
): RegistrationIntent | null {
  const path = safeInternalPath(returnTo);
  if (path?.startsWith("/invitation") || path?.startsWith("/vendor-invitation")) {
    return "INVITED_MEMBER";
  }
  return null;
}

export function destinationForRegistration(
  intent: RegistrationIntent,
  returnTo?: string | null,
) {
  const safeReturnTo = safeInternalPath(returnTo);
  if (safeReturnTo) return safeReturnTo;
  if (intent === "SERVICE_PROVIDER") return "/vendor?setup=1";
  if (intent === "INVITED_MEMBER") return "/start";
  return "/onboarding";
}
