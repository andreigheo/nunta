import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CinematicReveal,
  dialogFocusBoundaryTarget,
  invitationOpenReportStateForKey,
} from "./cinematic-reveal";
import type { CinematicRevealSettings } from "./invitation-experience";

type TestableRevealProps = Omit<
  React.ComponentProps<typeof CinematicReveal>,
  "children"
> & { children?: React.ReactNode };
const TestableCinematicReveal =
  CinematicReveal as React.ComponentType<TestableRevealProps>;

describe("cinematic reveal open reporting", () => {
  it("keeps replay idempotent for one invitation and resets for a new key", () => {
    const reported = {
      persistenceKey: "invitation:first",
      reported: true,
    };

    expect(
      invitationOpenReportStateForKey(reported, "invitation:first"),
    ).toBe(reported);
    expect(
      invitationOpenReportStateForKey(reported, "invitation:second"),
    ).toEqual({
      persistenceKey: "invitation:second",
      reported: false,
    });
  });

  it("removes the entire guest portal from the tab order while the dialog is closed", () => {
    const settings: CinematicRevealSettings = {
      enabled: true,
      persistenceKey: "invitation:keyboard",
      recipientLabel: "Pentru Familia Popescu",
      message: "O invitație pentru tine",
      monogram: "AP",
      panelColor: "#3B183F",
      backgroundColor: "#F7F7F3",
      accentColor: "#F06449",
      textColor: "#FFF9FF",
      accentTextColor: "#19151D",
      coverMediaId: "",
      coverImageUrl: "",
      texture: "paper",
      durationMs: 1400,
    };
    const markup = renderToStaticMarkup(
      React.createElement(
        TestableCinematicReveal,
        { settings, shouldAutoReveal: true },
        React.createElement("button", { type: "button" }, "Control portal"),
      ),
    );

    expect(markup).toContain('inert="" aria-hidden="true"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain("Deschide invitația");
    expect(markup).toContain("Sari peste introducere");
  });

  it("cycles focus only when Tab reaches a dialog boundary", () => {
    expect(dialogFocusBoundaryTarget(1, 2, false)).toBe(0);
    expect(dialogFocusBoundaryTarget(0, 2, true)).toBe(1);
    expect(dialogFocusBoundaryTarget(0, 2, false)).toBeNull();
    expect(dialogFocusBoundaryTarget(-1, 2, false)).toBe(0);
    expect(dialogFocusBoundaryTarget(-1, 2, true)).toBe(1);
    expect(dialogFocusBoundaryTarget(-1, 0, false)).toBe(-1);
  });
});
