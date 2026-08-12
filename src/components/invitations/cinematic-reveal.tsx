"use client";

import * as React from "react";
import { Eye, MoveHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CinematicRevealSettings } from "./invitation-experience";
import styles from "./cinematic-reveal.module.css";

type RevealState = "closed" | "opening" | "open";
const dialogFocusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export type InvitationOpenSource = "cover" | "skip" | "direct" | "replay";
export type InvitationOpenReportState = {
  persistenceKey: string;
  reported: boolean;
};

export function invitationOpenReportStateForKey(
  state: InvitationOpenReportState,
  persistenceKey: string,
): InvitationOpenReportState {
  return state.persistenceKey === persistenceKey
    ? state
    : { persistenceKey, reported: false };
}

export function dialogFocusBoundaryTarget(
  activeIndex: number,
  total: number,
  backwards: boolean,
) {
  if (total <= 0) return -1;
  if (activeIndex < 0) return backwards ? total - 1 : 0;
  if (backwards && activeIndex === 0) return total - 1;
  if (!backwards && activeIndex === total - 1) return 0;
  return null;
}

export function CinematicReveal({
  settings,
  children,
  onOpened,
  shouldAutoReveal,
}: {
  settings: CinematicRevealSettings;
  children: React.ReactNode;
  onOpened?: (source: InvitationOpenSource) => void | Promise<void>;
  shouldAutoReveal?: boolean;
}) {
  const autoReveal = settings.enabled && (shouldAutoReveal ?? true);
  const [state, setState] = React.useState<RevealState>(
    autoReveal ? "closed" : "open",
  );
  const rootRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const openButtonRef = React.useRef<HTMLButtonElement>(null);
  const openingTimerRef = React.useRef<number | null>(null);
  const openReportRef = React.useRef<InvitationOpenReportState>({
    persistenceKey: settings.persistenceKey,
    reported: false,
  });
  const reducedMotionRef = React.useRef(false);

  React.useEffect(() => {
    if (openingTimerRef.current !== null) {
      window.clearTimeout(openingTimerRef.current);
      openingTimerRef.current = null;
    }
    openReportRef.current = invitationOpenReportStateForKey(
      openReportRef.current,
      settings.persistenceKey,
    );
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let nextState: RevealState = "closed";
    if (!settings.enabled || shouldAutoReveal === false) {
      if (shouldAutoReveal === false) openReportRef.current.reported = true;
      nextState = "open";
    } else {
      try {
        if (
          shouldAutoReveal === undefined &&
          window.sessionStorage.getItem(settings.persistenceKey) === "opened"
        ) {
          openReportRef.current.reported = true;
          nextState = "open";
        }
      } catch {
        // Storage is an enhancement; the invitation still opens without it.
      }
    }

    let focusFrame = 0;
    const stateTimer = window.setTimeout(() => {
      setState(nextState);
      if (nextState === "closed") {
        focusFrame = window.requestAnimationFrame(() =>
          openButtonRef.current?.focus(),
        );
      }
    }, 0);
    return () => {
      window.clearTimeout(stateTimer);
      window.cancelAnimationFrame(focusFrame);
    };
  }, [settings.enabled, settings.persistenceKey, shouldAutoReveal]);

  React.useEffect(() => {
    if (!settings.enabled || state === "open") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [settings.enabled, state]);

  React.useEffect(
    () => () => {
      if (openingTimerRef.current !== null)
        window.clearTimeout(openingTimerRef.current);
    },
    [],
  );

  const focusInvitation = React.useCallback(() => {
    rootRef.current
      ?.querySelector<HTMLElement>("[data-invitation-renderer]")
      ?.focus();
  }, []);

  const reportOpen = React.useCallback(
    (source: InvitationOpenSource) => {
      openReportRef.current = invitationOpenReportStateForKey(
        openReportRef.current,
        settings.persistenceKey,
      );
      if (openReportRef.current.reported) return;
      openReportRef.current.reported = true;
      try {
        window.sessionStorage.setItem(settings.persistenceKey, "opened");
      } catch {
        // Private browsing/storage failures must never block the reveal.
      }
      try {
        void Promise.resolve(onOpened?.(source)).catch(() => undefined);
      } catch {
        // Telemetry is fail-open: invitation access does not depend on it.
      }
    },
    [onOpened, settings.persistenceKey],
  );

  const finishImmediately = React.useCallback(
    (source: InvitationOpenSource) => {
      if (openingTimerRef.current !== null) {
        window.clearTimeout(openingTimerRef.current);
        openingTimerRef.current = null;
      }
      reportOpen(source);
      setState("open");
      window.requestAnimationFrame(focusInvitation);
    },
    [focusInvitation, reportOpen],
  );

  const open = React.useCallback(() => {
    if (state !== "closed") return;
    reportOpen("cover");
    if (reducedMotionRef.current) {
      setState("open");
      window.requestAnimationFrame(focusInvitation);
      return;
    }
    setState("opening");
    openingTimerRef.current = window.setTimeout(() => {
      openingTimerRef.current = null;
      setState("open");
      window.requestAnimationFrame(focusInvitation);
    }, settings.durationMs + 40);
  }, [focusInvitation, reportOpen, settings.durationMs, state]);

  const replay = React.useCallback(() => {
    setState("closed");
    window.requestAnimationFrame(() => openButtonRef.current?.focus());
  }, []);

  const contentHidden = settings.enabled && state !== "open";
  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finishImmediately("skip");
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = overlayRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(dialogFocusableSelector),
    ).filter((element) => !element.hasAttribute("hidden"));
    const activeIndex = focusable.indexOf(
      dialog.ownerDocument.activeElement as HTMLElement,
    );
    const targetIndex = dialogFocusBoundaryTarget(
      activeIndex,
      focusable.length,
      event.shiftKey,
    );
    if (targetIndex === null) return;

    event.preventDefault();
    if (targetIndex < 0) dialog.focus();
    else focusable[targetIndex]?.focus();
  };

  return (
    <div ref={rootRef} className={styles.root}>
      {settings.enabled && state === "open" ? (
        <div className={styles.replayRow}>
          <button type="button" className={styles.replayButton} onClick={replay}>
            <Eye className="size-4" aria-hidden />
            Revede introducerea
          </button>
        </div>
      ) : null}
      <div
        inert={contentHidden ? true : undefined}
        aria-hidden={contentHidden || undefined}
      >
        {children}
      </div>
      {settings.enabled && state !== "open" ? (
        <div
          ref={overlayRef}
          className={cn(styles.overlay, state === "opening" && styles.opening)}
          style={
            {
              "--reveal-panel": settings.panelColor,
              "--reveal-panel-secondary": settings.backgroundColor,
              "--reveal-accent": settings.accentColor,
              "--reveal-accent-text": settings.accentTextColor,
              "--reveal-text": settings.textColor,
              "--reveal-duration": `${settings.durationMs}ms`,
            } as React.CSSProperties
          }
          role="dialog"
          tabIndex={-1}
          data-texture={settings.texture}
          aria-modal="true"
          aria-labelledby="invitation-reveal-title"
          onKeyDown={handleDialogKeyDown}
        >
          <div className={cn(styles.shutter, styles.shutterLeft)} aria-hidden />
          <div className={cn(styles.shutter, styles.shutterRight)} aria-hidden />
          <div className={styles.seam} aria-hidden />
          <div className={styles.content}>
            <p className={styles.recipient}>{settings.recipientLabel}</p>
            {settings.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.coverImageUrl}
                alt=""
                className={styles.coverImage}
                decoding="async"
              />
            ) : null}
            {settings.monogram ? (
              <div className={styles.monogram} aria-hidden>
                {settings.monogram.slice(0, 4)}
              </div>
            ) : !settings.coverImageUrl ? (
              <div className={styles.mark} aria-hidden />
            ) : null}
            <h1 id="invitation-reveal-title" className={styles.message}>
              {settings.message}
            </h1>
            <button
              ref={openButtonRef}
              type="button"
              className={styles.openButton}
              onClick={open}
              disabled={state === "opening"}
            >
              <MoveHorizontal className="size-4" aria-hidden />
              Deschide invitația
            </button>
            <button
              type="button"
              className={styles.skipButton}
              onClick={() => finishImmediately("skip")}
              disabled={state === "opening"}
            >
              Sari peste introducere
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
