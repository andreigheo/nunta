"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Navigation, Users } from "lucide-react";
import type {
  GuestAccommodationRecommendationResource,
  GuestCompanionBootstrapResource,
} from "@weddingos/contracts";
import { GuestAccommodationRecommendations } from "@/components/guest/accommodation-recommendations";
import {
  GuestEventDayPanel,
  GuestOperationsCards,
  type EventItem,
  type GuestOperations,
} from "@/components/guest/guest-experience";
import { PortalShell } from "@/components/portals/portal-shell";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";

type CompanionBootstrap = GuestCompanionBootstrapResource & {
  operations?: GuestOperations;
  accommodationRecommendations?: GuestAccommodationRecommendationResource[];
};

export default function GuestCompanionPage() {
  const [token, setToken] = React.useState("");
  const [data, setData] = React.useState<CompanionBootstrap | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const value =
        new URLSearchParams(window.location.search).get("token") ?? "";
      setToken(value);
      if (!value) {
        setError(
          "Linkul personal lipsește. Revino la invitația primită de la organizatori.",
        );
        setLoading(false);
        return;
      }
      void weddingOsApi
        .guestBootstrap(value)
        .then(setData)
        .catch((caught) => setError(apiErrorMessage(caught)))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const events = (data?.events ?? []) as EventItem[];

  return (
    <PortalShell
      role="Detaliile evenimentului"
      title={data ? `Pentru ${data.household.name}` : "Spațiul invitaților"}
      subtitle="Programul, traseele și informațiile actualizate de organizatori sunt reunite aici."
      backHref={token ? `/guest?token=${encodeURIComponent(token)}` : "/guest"}
      backLabel="invitație"
    >
      {loading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted" role="status">
            Se încarcă detaliile evenimentului…
          </CardContent>
        </Card>
      ) : error || !data ? (
        <EmptyState
          icon={Users}
          title="Detaliile nu sunt disponibile"
          description={error ?? "Token invalid sau expirat."}
        />
      ) : (
        <>
          <nav aria-label="Navigare invitat" className="mb-6 flex flex-wrap gap-3 text-sm">
            <Link
              href={`/guest?token=${encodeURIComponent(token)}`}
              className="font-semibold text-brand underline decoration-brand/35 underline-offset-4 hover:decoration-brand"
            >
              Înapoi la invitație
            </Link>
            <Link
              href={`/guest/rsvp?token=${encodeURIComponent(token)}`}
              className="font-semibold text-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
            >
              Completează RSVP
            </Link>
          </nav>

          <GuestAccommodationRecommendations
            items={data.accommodationRecommendations ?? []}
            eventTitles={Object.fromEntries(
              events.map((event) => [event.id, event.title || "Eveniment"]),
            )}
          />

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Programul evenimentului</CardTitle>
                  <CardDescription>
                    Orele, locațiile și traseele publicate de organizatori.
                  </CardDescription>
                </div>
                <CalendarDays className="size-4 text-faint" aria-hidden />
              </CardHeader>
              <CardContent>
                {events.length ? (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
                    >
                      <p className="text-sm font-semibold">{event.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {formatGuestEventDate(event)}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <MapPin className="size-3" aria-hidden />
                        {event.locationName ??
                          event.locationAddress ??
                          "Locația va fi anunțată"}
                      </p>
                      {event.directions?.googleMaps ? (
                        <Button
                          size="sm"
                          variant="link"
                          className="mt-2 h-auto px-0 py-1"
                          onClick={() =>
                            window.open(
                              event.directions?.googleMaps,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <Navigation className="size-3" aria-hidden />
                          Deschide traseul
                        </Button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-muted">
                    Programul public va apărea aici după ce este pregătit de organizatori.
                  </p>
                )}
              </CardContent>
            </Card>
            <GuestOperationsCards operations={data.operations ?? {}} />
          </div>

          <GuestEventDayPanel token={token} events={events} />
        </>
      )}
    </PortalShell>
  );
}

function formatGuestEventDate(event: EventItem) {
  if (!event.startAt) return "Data va fi anunțată";
  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: event.timezone || "Europe/Bucharest",
  }).format(new Date(event.startAt));
}
