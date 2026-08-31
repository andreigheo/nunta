"use client";

import * as React from "react";
import type { ReactNode } from "react";
import styles from "./product-first-control-room.module.css";

const dashboardDwellMs = 3600;
const phoneMorphMs = 520;

type ShowcaseView = "dashboard" | "morphing" | "invitation";

export function HeroShowcaseCycle({
  dashboard,
  invitation,
}: {
  dashboard: ReactNode;
  invitation: ReactNode;
}) {
  const [view, setView] = React.useState<ShowcaseView>("dashboard");
  const [autoTransitionCancelled, setAutoTransitionCancelled] =
    React.useState(false);

  React.useEffect(() => {
    if (autoTransitionCancelled) return;
    let morphTimer: number | undefined;
    const dwellTimer = window.setTimeout(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setView("invitation");
        return;
      }

      setView("morphing");
      morphTimer = window.setTimeout(
        () => setView("invitation"),
        phoneMorphMs,
      );
    }, dashboardDwellMs);
    return () => {
      window.clearTimeout(dwellTimer);
      if (morphTimer !== undefined) window.clearTimeout(morphTimer);
    };
  }, [autoTransitionCancelled]);

  const preserveDashboard = React.useCallback(() => {
    if (view === "dashboard") setAutoTransitionCancelled(true);
  }, [view]);

  const preserveDashboardForControl = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("a, button, input, select, textarea")
      ) {
        preserveDashboard();
      }
    },
    [preserveDashboard],
  );

  return (
    <div
      id="produs"
      className={styles.heroShowcaseCycle}
      data-hero-thread-end
      data-testid="product-showcase"
      data-showcase-view={view}
      role="region"
      aria-label="Previzualizare produs Sarbato"
      onFocusCapture={preserveDashboard}
      onPointerDownCapture={preserveDashboardForControl}
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
              {invitation}
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
