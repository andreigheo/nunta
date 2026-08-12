import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  ensureReadableTextColor,
  invitationExperienceFromResource,
  readableTextColor,
  shouldRecordDirectOpenOnBootstrap,
} from "./invitation-experience";

describe("invitationExperienceFromResource", () => {
  it("records a direct open on bootstrap only when no reveal is shown", () => {
    expect(shouldRecordDirectOpenOnBootstrap(false, true)).toBe(true);
    expect(shouldRecordDirectOpenOnBootstrap(true, true)).toBe(false);
    expect(shouldRecordDirectOpenOnBootstrap(false, false)).toBe(false);
  });

  it("keeps existing invitations direct until cinematic reveal is enabled", () => {
    const result = invitationExperienceFromResource({ id: "invite-1" }, "Familia Popescu");
    expect(result.enabled).toBe(false);
    expect(result.recipientLabel).toBe("Pentru Familia Popescu");
    expect(result.persistenceKey).not.toContain("Familia Popescu");
  });

  it("accepts the persisted aperture contract and validates colors", () => {
    const result = invitationExperienceFromResource({
      id: "invite-2",
      version: 4,
      settings: {
        experience: {
          mode: "aperture",
          frontMessage: "Ne bucurăm să fii alături de noi",
          monogram: "A&M",
          panelColor: "#402044",
          backgroundColor: "#F7F7F3",
          accentColor: "not-a-color",
          coverMediaId: "media-cover-1",
          coverImageUrl: "javascript:alert(1)",
          texture: "linen",
          durationMs: 2000,
        },
      },
    });

    expect(result).toMatchObject({
      enabled: true,
      message: "Ne bucurăm să fii alături de noi",
      monogram: "A&M",
      panelColor: "#402044",
      backgroundColor: "#F7F7F3",
      accentColor: "#F06449",
      accentTextColor: "#19151D",
      coverMediaId: "media-cover-1",
      coverImageUrl: "",
      texture: "linen",
      durationMs: 2000,
      persistenceKey: "sarbato:invitation-reveal:invite-2:4",
    });
  });

  it("chooses a WCAG-readable foreground for user-selected reveal colors", () => {
    expect(readableTextColor("#F06449")).toBe("#19151D");
    expect(contrastRatio(readableTextColor("#888888"), "#888888")).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(ensureReadableTextColor("#999999", "#FFF9FF")).toBe("#19151D");
    expect(ensureReadableTextColor("#3B183F", "#FFF9FF")).toBe("#FFF9FF");
  });

  it("replaces an explicitly persisted foreground when it is not readable", () => {
    const result = invitationExperienceFromResource({
      settings: {
        experience: {
          enabled: true,
          panelColor: "#999999",
          textColor: "#FFFFFF",
          accentColor: "#F06449",
        },
      },
    });

    expect(result.textColor).toBe("#19151D");
    expect(contrastRatio(result.textColor, result.panelColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(result.accentTextColor, result.accentColor)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});
