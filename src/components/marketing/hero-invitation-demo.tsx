"use client";

import * as React from "react";
import { CinematicReveal } from "@/components/invitations/cinematic-reveal";
import { invitationExperienceFromResource } from "@/components/invitations/invitation-experience";
import { InvitationRenderer } from "@/components/invitations/invitation-renderer";
import {
  createInitialSnapshot,
  invitationTemplates,
  type InvitationEditorSnapshot,
} from "@/lib/invitations/editor-model";
import styles from "./product-first-control-room.module.css";

const heroInvitationSnapshot = createHeroInvitationSnapshot();
const heroInvitationAutoRevealDelayMs = 1300;
const heroInvitationSettleMs = 650;
const heroInvitationReveal = invitationExperienceFromResource(
  {
    id: "marketing-hero-invitation",
    version: 1,
    settings: { experience: heroInvitationSnapshot.experience },
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
      heroInvitationSnapshot.experience.durationMs +
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
          <InvitationRenderer
            className={styles.heroInvitationDocument}
            snapshot={heroInvitationSnapshot}
            resolveMedia={(_, externalUrl) => externalUrl ?? ""}
          />
        </div>
      </CinematicReveal>
    </div>
  );
}

function createHeroInvitationSnapshot(): InvitationEditorSnapshot {
  const base = createInitialSnapshot();
  const template =
    invitationTemplates.find((item) => item.id === "garden") ??
    invitationTemplates[0]!;
  const hero = base.sections[0]!;
  const schedule = base.sections.find((section) => section.type === "schedule")!;
  const locations = base.sections.find(
    (section) => section.type === "locations",
  )!;
  const rsvp = base.sections.find((section) => section.type === "rsvp")!;

  return {
    design: {
      ...template.design,
      palette: [...template.design.palette],
    },
    experience: {
      ...base.experience,
      enabled: true,
      style: "envelope",
      monogram: "S",
      frontMessage: "O invitație pentru tine",
      coverImageUrl: "/invitation-art/nocturne-glass.webp",
      durationMs: 3200,
    },
    sections: [
      {
        ...hero,
        label: "Invitație demonstrativă",
        content: {
          ...hero.content,
          eyebrow: "Invitație Sarbato",
          names: "Gala de toamnă",
          date: "12 septembrie 2026",
          venue: "Grădina Centrală",
          title: "Ne vedem acolo",
          subtitle:
            "Programul, locația și confirmarea participării, într-un singur loc.",
          buttonLabel: "Confirmă participarea",
          coverImage: "/invitation-art/nocturne-glass.webp",
          imageAlt: "Compoziție abstractă aubergine și coral",
          layout: "immersive",
          heroHeight: 520,
          contentY: "center",
          headingSize: 68,
          overlayColor: "#251629",
          overlayOpacity: 38,
        },
      },
      {
        ...schedule,
        content: {
          ...schedule.content,
          title: "Programul serii",
          items: [
            {
              time: "18:00",
              title: "Bun venit",
              detail: "Primirea invitaților",
            },
            {
              time: "19:00",
              title: "Momentul principal",
              detail: "Gala de toamnă",
            },
            {
              time: "20:30",
              title: "Cină și muzică",
              detail: "Seara continuă împreună",
            },
          ],
        },
      },
      {
        ...locations,
        content: {
          ...locations.content,
          title: "Locația evenimentului",
          items: [
            {
              name: "Grădina Centrală",
              address: "Detaliile de acces sunt incluse în invitație",
              url: "",
            },
          ],
        },
      },
      {
        ...rsvp,
        content: {
          ...rsvp.content,
          title: "Vii alături de noi?",
          body: "Răspunsul tău ne ajută să pregătim fiecare detaliu.",
          deadline: "5 septembrie 2026",
          buttonLabel: "Confirmă participarea",
        },
      },
    ],
  };
}
