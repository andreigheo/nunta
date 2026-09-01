"use client";

import * as React from "react";
import { CinematicReveal } from "@/components/invitations/cinematic-reveal";
import { invitationExperienceFromResource } from "@/components/invitations/invitation-experience";
import { createInitialSnapshot } from "@/lib/invitations/editor-model";
import { HeroAssemblyInvitation } from "./hero-assembly-invitation";
import styles from "./product-first-control-room.module.css";

const heroInvitationExperience = {
  ...createInitialSnapshot().experience,
  enabled: true,
  style: "envelope" as const,
  monogram: "A26",
  frontMessage: "THE ASSEMBLY / 2026",
  coverImageUrl: "/invitation-art/the-assembly-scenes-v1.png",
  durationMs: 3200,
};
const heroInvitationAutoRevealDelayMs = 1300;
const heroInvitationSettleMs = 650;
const heroInvitationReveal = invitationExperienceFromResource(
  {
    id: "marketing-hero-invitation",
    version: 1,
    settings: { experience: heroInvitationExperience },
  },
  "tine",
);

export function HeroInvitationDemo({
  onPresentationComplete,
  onUserInteraction,
}: {
  onPresentationComplete: () => void;
  onUserInteraction: () => void;
}) {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const [autoScrollState, setAutoScrollState] = React.useState<
    "waiting" | "running" | "stopped" | "complete" | "disabled"
  >("waiting");

  React.useEffect(() => {
    const scroller = viewportRef.current?.querySelector<HTMLElement>(
      "[data-invitation-renderer]",
    );
    if (!scroller) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const disabledTimer = window.setTimeout(
        () => setAutoScrollState("disabled"),
        0,
      );
      return () => window.clearTimeout(disabledTimer);
    }

    let animationFrame = 0;
    let cancelled = false;

    const stopAutoScroll = () => {
      if (cancelled) return;
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      setAutoScrollState("stopped");
      onUserInteraction();
    };

    const interactionEvents: Array<keyof HTMLElementEventMap> = [
      "pointerdown",
      "touchstart",
      "wheel",
      "keydown",
    ];
    interactionEvents.forEach((eventName) =>
      scroller.addEventListener(eventName, stopAutoScroll, { passive: true }),
    );

    const startTimer = window.setTimeout(() => {
      if (cancelled) return;
      const distance = scroller.scrollHeight - scroller.clientHeight;
      if (distance <= 0) {
        setAutoScrollState("complete");
        onPresentationComplete();
        return;
      }

      const duration = Math.min(12_000, Math.max(8_000, distance * 10));
      const startedAt = window.performance.now();
      setAutoScrollState("running");

      const advance = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        scroller.scrollTop = distance * eased;
        if (progress < 1) {
          animationFrame = window.requestAnimationFrame(advance);
        } else {
          setAutoScrollState("complete");
          onPresentationComplete();
        }
      };

      animationFrame = window.requestAnimationFrame(advance);
    },
    heroInvitationAutoRevealDelayMs +
      heroInvitationExperience.durationMs +
      heroInvitationSettleMs,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.cancelAnimationFrame(animationFrame);
      interactionEvents.forEach((eventName) =>
        scroller.removeEventListener(eventName, stopAutoScroll),
      );
    };
  }, [onPresentationComplete, onUserInteraction]);

  return (
    <div className={styles.heroInvitationStage}>
      <CinematicReveal
        settings={heroInvitationReveal}
        shouldAutoReveal
        autoRevealDelayMs={heroInvitationAutoRevealDelayMs}
        variant="embedded"
      >
        <div
          ref={viewportRef}
          className={styles.heroInvitationViewport}
          data-testid="hero-complete-invitation"
          data-auto-scroll={autoScrollState}
          aria-label="Invitație Sarbato derulabilă"
        >
          <HeroAssemblyInvitation />
        </div>
      </CinematicReveal>
    </div>
  );
}
