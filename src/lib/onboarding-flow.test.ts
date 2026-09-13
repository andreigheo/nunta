import { describe, expect, it } from "vitest";
import type { OnboardingDraftResource } from "@weddingos/contracts";
import {
  firstIncompleteOnboardingStep,
  onboardingEditHref,
  onboardingStepFromSearchParam,
} from "./onboarding-flow";

function draft(confirmedThrough: number): OnboardingDraftResource {
  const sections = Array.from({ length: 8 }, (_, index) => ({
    confirmed: index < confirmedThrough,
  }));
  return {
    id: "00000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000002",
    currentStep: Math.min(confirmedThrough + 1, 8),
    status: confirmedThrough === 8 ? "ready" : "draft",
    couple: sections[0]!,
    dateEvents: sections[1]!,
    location: sections[2]!,
    guests: sections[3]!,
    budget: sections[4]!,
    style: sections[5]!,
    existingProgress: sections[6]!,
    planningPreferences: sections[7]!,
    completedAt: confirmedThrough === 8 ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

describe("onboarding flow", () => {
  it("continues at the first incomplete section", () => {
    expect(firstIncompleteOnboardingStep(draft(3))).toBe(4);
    expect(onboardingEditHref(draft(3), "/overview")).toBe(
      "/onboarding?step=4&returnTo=%2Foverview",
    );
  });

  it("opens a completed setup at its editable first section", () => {
    expect(firstIncompleteOnboardingStep(draft(8))).toBeNull();
    expect(onboardingEditHref(draft(8), "/overview")).toContain("step=1");
  });

  it("accepts only real onboarding steps", () => {
    expect(onboardingStepFromSearchParam("6")).toBe(6);
    expect(onboardingStepFromSearchParam("0")).toBeNull();
    expect(onboardingStepFromSearchParam("x")).toBeNull();
  });
});
