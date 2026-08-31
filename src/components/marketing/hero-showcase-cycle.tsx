"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { HeroInvitationDemo } from "./hero-invitation-demo";
import styles from "./product-first-control-room.module.css";

const dashboardDwellMs = 3600;
const phoneMorphMs = 520;
const invitationReviewMs = 3000;
const phoneReturnMs = 520;

type ShowcaseView = "dashboard" | "morphing" | "invitation" | "returning";

export function HeroShowcaseCycle({
  dashboard,
}: {
  dashboard: ReactNode;
}) {
  const [view, setView] = React.useState<ShowcaseView>("dashboard");
  const [autoTransitionCancelled, setAutoTransitionCancelled] =
    React.useState(false);
  const [invitationPresentationComplete, setInvitationPresentationComplete] =
    React.useState(false);

  React.useEffect(() => {
    if (autoTransitionCancelled) return;
    let nextView: ShowcaseView | undefined;
    let delay = 0;

    if (view === "dashboard") {
      nextView = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "invitation"
        : "morphing";
      delay = dashboardDwellMs;
    } else if (view === "morphing") {
      nextView = "invitation";
      delay = phoneMorphMs;
    } else if (view === "returning") {
      nextView = "dashboard";
      delay = phoneReturnMs;
    }

    if (!nextView) return;
    const timer = window.setTimeout(() => {
      if (nextView === "dashboard") setInvitationPresentationComplete(false);
      setView(nextView);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoTransitionCancelled, view]);

  React.useEffect(() => {
    if (
      autoTransitionCancelled ||
      view !== "invitation" ||
      !invitationPresentationComplete ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;

    const reviewTimer = window.setTimeout(
      () => setView("returning"),
      invitationReviewMs,
    );
    return () => window.clearTimeout(reviewTimer);
  }, [autoTransitionCancelled, invitationPresentationComplete, view]);

  const stopAutoCycle = React.useCallback(() => {
    setAutoTransitionCancelled(true);
  }, []);

  const finishInvitationPresentation = React.useCallback(() => {
    setInvitationPresentationComplete(true);
  }, []);

  return (
    <div
      id="produs"
      className={styles.heroShowcaseCycle}
      data-hero-thread-end
      data-testid="product-showcase"
      data-showcase-view={view}
      data-auto-cycle={autoTransitionCancelled ? "paused" : "running"}
      role="region"
      aria-label="Previzualizare produs Sarbato"
      onFocusCapture={stopAutoCycle}
      onPointerDownCapture={stopAutoCycle}
    >
      <div
        className={styles.heroShowcaseDashboard}
        inert={view !== "dashboard" ? true : undefined}
        aria-hidden={view !== "dashboard" || undefined}
      >
        {dashboard}
      </div>
      <div
        className={styles.heroShowcaseInvitation}
        inert={view !== "invitation" ? true : undefined}
        aria-hidden={view !== "invitation" || undefined}
      >
        {view !== "dashboard" ? (
          <div
            className={styles.heroPhoneShell}
            data-testid="hero-invitation-phone"
          >
            <div
              className={styles.heroPhoneScreen}
              data-testid="hero-invitation-screen"
            >
              <HeroInvitationDemo
                onPresentationComplete={finishInvitationPresentation}
                onUserInteraction={stopAutoCycle}
              />
            </div>
            <span
              className={styles.heroPhoneChargePort}
              data-hero-thread-charge
              aria-hidden
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
