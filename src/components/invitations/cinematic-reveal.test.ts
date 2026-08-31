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
      style: "envelope",
      persistenceKey: "invitation:keyboard",
      recipientLabel: "Pentru Familia Popescu",
      message: "O invitație pentru tine",
      monogram: "A & A",
      panelColor: "#3B183F",
      backgroundColor: "#F7F7F3",
      accentColor: "#F06449",
      textColor: "#FFF9FF",
      accentTextColor: "#19151D",
      coverMediaId: "",
      coverImageUrl: "",
      texture: "paper",
      durationMs: 2300,
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
    expect(markup).toContain('data-reveal-style="envelope"');
    expect(markup).toContain("Deschide plicul");
    expect(markup).toContain("Sari peste introducere");
    expect(markup).toContain("A &amp; A");
  });

  it("keeps the existing split-panel opening as a separate selectable experience", () => {
    const settings: CinematicRevealSettings = {
      enabled: true,
      style: "split_panels",
      persistenceKey: "invitation:panels",
      recipientLabel: "Pentru Andrei",
      message: "Ne bucurăm să fii cu noi",
      monogram: "A & A",
      panelColor: "#3B183F",
      backgroundColor: "#180F1C",
      accentColor: "#F06449",
      textColor: "#FFF9FF",
      accentTextColor: "#19151D",
      coverMediaId: "",
      coverImageUrl: "",
      texture: "smooth",
      durationMs: 1800,
    };
    const markup = renderToStaticMarkup(
      React.createElement(
        TestableCinematicReveal,
        { settings, shouldAutoReveal: true },
        React.createElement("main", null, "Invitația"),
      ),
    );

    expect(markup).toContain('data-reveal-style="split_panels"');
    expect(markup).toContain("Deschide invitația");
    expect(markup).not.toContain("Deschide plicul");
  });

  it("can keep the public invitation free of the replay control", () => {
    const settings: CinematicRevealSettings = {
      enabled: true,
      style: "envelope",
      persistenceKey: "invitation:clean",
      recipientLabel: "Pentru invitați",
      message: "O invitație pentru voi",
      monogram: "S",
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
        { settings, shouldAutoReveal: false, showReplay: false },
        React.createElement("main", null, "Invitația curată"),
      ),
    );
    expect(markup).toContain("Invitația curată");
    expect(markup).not.toContain("Revede introducerea");
  });

  it("embeds the envelope without locking the page as a guest dialog", () => {
    const settings: CinematicRevealSettings = {
      enabled: true,
      style: "envelope",
      persistenceKey: "invitation:marketing-hero",
      recipientLabel: "Invitația ta",
      message: "Toate informațiile importante, într-un singur loc.",
      monogram: "S",
      panelColor: "#3B183F",
      backgroundColor: "#F7F7F3",
      accentColor: "#F06449",
      textColor: "#FFF9FF",
      accentTextColor: "#19151D",
      coverMediaId: "",
      coverImageUrl: "",
      texture: "paper",
      durationMs: 2300,
    };
    const markup = renderToStaticMarkup(
      React.createElement(
        TestableCinematicReveal,
        { settings, shouldAutoReveal: true, variant: "embedded" },
        React.createElement("p", null, "Confirmă participarea"),
      ),
    );

    expect(markup).toContain('data-reveal-variant="embedded"');
    expect(markup).toContain('data-reveal-style="envelope"');
    expect(markup).toContain("Deschide plicul");
    expect(markup).toContain("Invitația ta");
    expect(markup).not.toContain("aria-modal");
    expect(markup).not.toContain("Sari peste introducere");
    expect(markup).not.toContain("Revede introducerea");
    expect(markup).not.toContain("Familia");
    expect(markup).not.toContain('role="dialog"');
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
