"use client";

import * as React from "react";
import { MailWarning } from "lucide-react";
import type { GuestInvitationBootstrapResource } from "@weddingos/contracts";
import { CinematicReveal } from "@/components/invitations/cinematic-reveal";
import type { InvitationOpenSource } from "@/components/invitations/cinematic-reveal";
import {
  invitationExperienceFromResource,
  shouldAutoRevealInvitation,
  shouldRecordDirectOpenOnBootstrap,
} from "@/components/invitations/invitation-experience";
import { PublishedInvitation } from "@/components/invitations/published-invitation";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

type InvitationEvent = {
  id: string;
  title?: string;
  startAt?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
};

export default function PublicInvitationPage() {
  const [token, setToken] = React.useState("");
  const [data, setData] =
    React.useState<GuestInvitationBootstrapResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const invitationOpenAttemptRef = React.useRef<{
    token: string;
    idempotencyKey: string;
    requested: boolean;
  } | null>(null);
  const linkAccessAttemptRef = React.useRef<{
    token: string;
    idempotencyKey: string;
  } | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const value =
        new URLSearchParams(window.location.search).get("token") ?? "";
      setToken(value);
      if (!value) {
        setError(
          "Linkul personal lipsește. Folosește linkul sau codul QR primit de la organizatori.",
        );
        setLoading(false);
        return;
      }
      void weddingOsApi
        .guestInvitation(value)
        .then((bootstrap) => {
          setData(bootstrap);
          if (linkAccessAttemptRef.current?.token !== value) {
            linkAccessAttemptRef.current = {
              token: value,
              idempotencyKey: crypto.randomUUID(),
            };
          }
          void weddingOsApi
            .markGuestLinkAccess({
              token: value,
              idempotencyKey: linkAccessAttemptRef.current.idempotencyKey,
              source: "guest_page",
            })
            .catch(() => undefined);
        })
        .catch((caught) => setError(apiErrorMessage(caught)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const revealSettings = React.useMemo(() => {
    if (!data) return null;
    const experience = invitationExperienceFromResource(
      data.invitation,
      data.household.name,
      token,
    );
    return {
      ...experience,
      coverImageUrl: experience.coverMediaId
        ? `/api/v1/guest/invitation-media/${encodeURIComponent(experience.coverMediaId)}?token=${encodeURIComponent(token)}`
        : experience.coverImageUrl,
    };
  }, [data, token]);

  const markInvitationOpened = React.useCallback(
    (source: InvitationOpenSource) => {
      if (!token) return;
      if (invitationOpenAttemptRef.current?.token !== token) {
        invitationOpenAttemptRef.current = {
          token,
          idempotencyKey: crypto.randomUUID(),
          requested: false,
        };
      }
      if (invitationOpenAttemptRef.current.requested) return;
      invitationOpenAttemptRef.current.requested = true;
      const attempt = invitationOpenAttemptRef.current;
      return weddingOsApi
        .markGuestInvitationOpen({
          token,
          idempotencyKey: attempt.idempotencyKey,
          source,
        })
        .then(() => undefined)
        .catch(() => {
          if (invitationOpenAttemptRef.current === attempt) {
            invitationOpenAttemptRef.current.requested = false;
          }
        });
    },
    [token],
  );

  React.useEffect(() => {
    if (
      !data ||
      !revealSettings ||
      !shouldRecordDirectOpenOnBootstrap(
        revealSettings.enabled,
        data.interaction.shouldPlayReveal,
      )
    )
      return;
    void markInvitationOpened("direct");
  }, [data, markInvitationOpened, revealSettings]);

  const addCalendar = React.useCallback(() => {
    const events = (data?.events ?? []) as InvitationEvent[];
    if (!events.length) return;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sarbato//Invitation//RO",
      ...events.flatMap((event) => [
        "BEGIN:VEVENT",
        `UID:${event.id}@sarbato.space`,
        `DTSTART:${icsDate(event.startAt)}`,
        `SUMMARY:${icsEscape(event.title ?? "Eveniment")}`,
        `LOCATION:${icsEscape(event.locationAddress ?? event.locationName ?? "")}`,
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ].join("\r\n");
    downloadBlob(
      new Blob([lines], { type: "text/calendar" }),
      "sarbato-invitatie.ics",
    );
  }, [data]);

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <p className="text-sm font-medium text-muted" role="status">
          Se deschide invitația…
        </p>
      </main>
    );
  }

  if (error || !data || !revealSettings) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-6 py-12">
        <section className="max-w-md text-center" aria-labelledby="guest-error-title">
          <MailWarning className="mx-auto size-8 text-brand" aria-hidden />
          <h1 id="guest-error-title" className="mt-5 font-brand text-3xl font-semibold text-ink">
            Invitația nu este disponibilă
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            {error ?? "Tokenul este invalid sau a expirat."}
          </p>
        </section>
      </main>
    );
  }

  const invitation = (
    <main id="invitatia-publica" className="min-h-dvh bg-background">
      <PublishedInvitation
        invitation={data.invitation}
        token={token}
        onAddCalendar={addCalendar}
        rsvpHref={`/guest/rsvp?token=${encodeURIComponent(token)}`}
        className="min-h-dvh"
      />
    </main>
  );

  return (
    <CinematicReveal
      settings={revealSettings}
      onOpened={markInvitationOpened}
      shouldAutoReveal={shouldAutoRevealInvitation(
        revealSettings.enabled,
        data.interaction.shouldPlayReveal,
      )}
      showReplay={false}
    >
      {invitation}
    </CinematicReveal>
  );
}

function icsDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
