import type { OnboardingDraftResource } from "@weddingos/contracts";

const onboardingSections: Array<keyof Pick<
  OnboardingDraftResource,
  | "couple"
  | "dateEvents"
  | "location"
  | "guests"
  | "budget"
  | "style"
  | "existingProgress"
  | "planningPreferences"
>> = [
  "couple",
  "dateEvents",
  "location",
  "guests",
  "budget",
  "style",
  "existingProgress",
  "planningPreferences",
];

export function onboardingStepFromSearchParam(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 8 ? parsed : null;
}

export function firstIncompleteOnboardingStep(
  draft: OnboardingDraftResource | null,
) {
  if (!draft) return 1;
  const index = onboardingSections.findIndex(
    (section) => draft[section].confirmed !== true,
  );
  return index === -1 ? null : index + 1;
}

export function onboardingEditHref(
  draft: OnboardingDraftResource | null,
  returnTo: string,
) {
  const step = firstIncompleteOnboardingStep(draft) ?? 1;
  return `/onboarding?step=${step}&returnTo=${encodeURIComponent(returnTo)}`;
}
