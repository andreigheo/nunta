import type { GuestAccommodationRecommendationResource } from "@weddingos/contracts";
import type { ReactNode } from "react";
import {
  BedDouble,
  CalendarClock,
  ExternalLink,
  MapPin,
  Phone,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

const typeLabels: Record<GuestAccommodationRecommendationResource["type"], string> = {
  hotel: "Hotel",
  guest_house: "Pensiune",
  hostel: "Hostel",
  motel: "Motel",
  apartment: "Apartament",
  chalet: "Cabană",
  other: "Cazare",
};

const facilityLabels: Record<string, string> = {
  parking: "Parcare",
  wifi: "Wi-Fi",
  breakfast: "Mic dejun",
  restaurant: "Restaurant",
  accessible: "Accesibilitate",
  air_conditioning: "Aer condiționat",
  pets_allowed: "Acceptă animale",
  family_rooms: "Camere de familie",
  late_check_in: "Check-in târziu",
  shuttle: "Transfer",
};

const sourceLabels: Record<GuestAccommodationRecommendationResource["source"], string> = {
  osm: "Sursă OpenStreetMap",
  organizer: "Adăugat de organizatori",
  other: "Sursă externă",
};

export function GuestAccommodationRecommendations({
  items,
  eventTitles = {},
}: {
  items: GuestAccommodationRecommendationResource[];
  eventTitles?: Record<string, string>;
}) {
  if (!items.length) return null;

  const groups = groupByEvent(items);

  return (
    <section
      id="cazare-recomandata"
      className="mt-8 scroll-mt-6 overflow-hidden rounded-[18px] border border-line bg-surface"
      aria-labelledby="cazare-recomandata-title"
    >
      <div className="grid gap-5 border-b border-line bg-brand-softer/45 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.45fr)] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-brand">
            Aproape de eveniment
          </p>
          <h2
            id="cazare-recomandata-title"
            className="mt-2 max-w-2xl font-brand text-2xl font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-3xl"
          >
            Cazări alese pentru invitați
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            Organizatorii au selectat aceste variante din jurul evenimentului.
            Disponibilitatea și rezervarea se confirmă direct cu proprietatea.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-surface/80 p-4 text-sm text-muted">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p>
            Sarbato nu încasează și nu rezervă în numele tău. Primești informația,
            contactul și traseul.
          </p>
        </div>
      </div>

      <div className="divide-y divide-line">
        {groups.map((group) => (
          <section key={group.eventId} aria-labelledby={`cazare-eveniment-${group.eventId}`}>
            <div className="bg-subtle/45 px-5 py-3 sm:px-7">
              <p
                id={`cazare-eveniment-${group.eventId}`}
                className="break-words text-xs font-semibold uppercase tracking-[0.08em] text-brand"
              >
                Pentru {eventTitles[group.eventId] ?? "eveniment"}
              </p>
            </div>
            <ol className="relative divide-y divide-line px-5 sm:px-7">
              {group.items.map((item, index) => (
                <li
                  key={item.id}
                  className="relative grid gap-5 py-6 pl-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-8"
                >
                  <span
                    className="absolute left-1 top-8 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-brand text-[10px] font-bold text-on-brand shadow-[0_0_0_1px_var(--color-line)]"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  {index < group.items.length - 1 ? (
                    <span
                      className="absolute -bottom-8 left-[13px] top-[52px] w-px bg-line"
                      aria-hidden
                    />
                  ) : null}

            <div className="min-w-0 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="neutral">{typeLabels[item.type]}</Badge>
                <Badge variant="neutral">{sourceLabels[item.source]}</Badge>
                {item.distanceKm != null ? (
                  <Badge variant="info">
                    <Route className="size-3" aria-hidden />
                    {formatDistance(item.distanceKm)} de eveniment
                  </Badge>
                ) : null}
                <span className="text-xs text-faint">
                  Informație preluată {formatDate(item.provenance.sourceUpdatedAt ?? item.provenance.fetchedAt)}
                </span>
              </div>
              <h3 className="mt-3 break-words font-brand text-xl font-semibold tracking-[-0.015em] text-ink sm:text-2xl">
                {item.name}
              </h3>
              <p className="mt-1 flex min-w-0 items-start gap-2 text-sm leading-6 text-muted">
                <MapPin className="mt-1 size-4 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0 break-words">{addressLabel(item)}</span>
              </p>

              {item.organizerNote ? (
                <p className="mt-4 max-w-3xl break-words border-l-2 border-accent pl-3 text-sm leading-6 text-ink">
                  {item.organizerNote}
                </p>
              ) : null}

              {item.facilities.length ? (
                <div className="mt-4 flex flex-wrap gap-2" aria-label="Facilități">
                  {item.facilities.slice(0, 6).map((facility) => (
                    <span
                      key={facility}
                      className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted"
                    >
                      {facilityLabels[facility] ?? facility.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="w-full min-w-0 rounded-xl border border-line bg-background p-4 lg:w-[292px]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-faint">Preț orientativ</p>
                  <p className="mt-1 font-semibold text-ink">
                    {item.priceSnapshot
                      ? formatPrice(item.priceSnapshot.amountMinor, item.priceSnapshot.currency)
                      : "De verificat"}
                  </p>
                  {item.priceSnapshot ? (
                    <p className="mt-0.5 text-xs text-faint">
                      {item.priceSnapshot.unit === "per_night" ? "pe noapte" : "pentru sejur"}
                      {` · observat ${formatDate(item.priceSnapshot.observedAt)}`}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-faint">Întreabă direct proprietatea</p>
                  )}
                </div>
                <BedDouble className="size-5 text-brand" aria-hidden />
              </div>

              {(item.groupCode || item.deadline) && (
                <div className="mt-4 border-t border-line pt-3 text-sm">
                  {item.groupCode ? (
                    <p className="min-w-0 break-words">
                      <span className="text-faint">Cod grup:</span>{" "}
                      <strong className="break-all font-semibold text-ink">
                        {item.groupCode}
                      </strong>
                    </p>
                  ) : null}
                  {item.deadline ? (
                    <p className="mt-1 flex items-center gap-1.5 text-muted">
                      <CalendarClock className="size-3.5" aria-hidden />
                      Rezervă până la {formatDate(item.deadline)}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="mt-4 grid gap-2">
                {item.bookingUrl ? (
                  <ExternalAction href={item.bookingUrl} primary>
                    Vezi site-ul
                  </ExternalAction>
                ) : null}
                {item.contactUrl && item.contactUrl !== item.bookingUrl ? (
                  <ExternalAction href={item.contactUrl} primary={!item.bookingUrl}>
                    Contactează proprietatea
                  </ExternalAction>
                ) : null}
                {item.contactPhone ? (
                  <ExternalAction
                    href={`tel:${item.contactPhone.replace(/[^+\d]/g, "")}`}
                    primary={!item.bookingUrl && !item.contactUrl}
                    newTab={false}
                    icon={<Phone className="size-3.5" aria-hidden />}
                  >
                    Sună proprietatea
                  </ExternalAction>
                ) : null}
                {item.latitude != null && item.longitude != null ? (
                  <ExternalAction
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`}
                  >
                    Deschide traseul
                  </ExternalAction>
                ) : null}
              </div>
            </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-subtle/55 px-5 py-3 text-xs text-faint sm:px-7">
        <p>Informațiile pot fi modificate de proprietăți după publicare.</p>
        {items.some((item) => item.source === "osm") ? (
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Date cartografice © OpenStreetMap contributors
            <span className="sr-only"> (se deschide într-o filă nouă)</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}

function groupByEvent(items: GuestAccommodationRecommendationResource[]) {
  const groups = new Map<string, GuestAccommodationRecommendationResource[]>();
  for (const item of items) {
    const group = groups.get(item.weddingEventId) ?? [];
    group.push(item);
    groups.set(item.weddingEventId, group);
  }
  return [...groups.entries()].map(([eventId, eventItems]) => ({
    eventId,
    items: eventItems,
  }));
}

function ExternalAction({
  href,
  primary = false,
  newTab = true,
  icon,
  children,
}: {
  href: string;
  primary?: boolean;
  newTab?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noreferrer" : undefined}
      className={cn(
        "inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 break-words rounded-lg px-4 text-center text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        primary
          ? "bg-brand text-on-brand hover:bg-brand-strong"
          : "border border-line bg-surface text-ink hover:bg-subtle",
      )}
    >
      {children}
      {newTab ? <span className="sr-only"> (se deschide într-o filă nouă)</span> : null}
      {icon ?? <ExternalLink className="size-3.5" aria-hidden />}
    </a>
  );
}

function addressLabel(item: GuestAccommodationRecommendationResource) {
  return [item.address, item.city, item.country].filter(Boolean).join(", ") || "Adresa se confirmă direct cu proprietatea";
}

function formatDistance(value: number) {
  if (value < 1) return `${Math.max(1, Math.round(value * 1000))} m`;
  return `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 1 }).format(value)} km`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatPrice(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
