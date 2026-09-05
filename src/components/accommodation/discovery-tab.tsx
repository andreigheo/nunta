"use client";

import * as React from "react";
import Link from "next/link";
import type {
  AccommodationDiscoveryItem,
  AccommodationDiscoveryResponse,
  AccommodationDiscoveryType,
  AccommodationFacility,
  AccommodationRecommendationResource,
  CalendarItem,
} from "@weddingos/contracts";
import {
  BedDouble,
  Check,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MapPin,
  Phone,
  Route,
  Search,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  CardSkeleton,
  Field,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { cn } from "@/lib/utils";
import {
  accommodationFacilities,
  accommodationTypes,
  addressLabel,
  discoveryItemToRecommendation,
  facilityLabel,
  formatDistance,
  formatFreshness,
  formatPrice,
  safeExternalUrl,
  sortDiscoveryItems,
  type DiscoverySort,
  typeLabel,
} from "./model";

type EventOption = Pick<CalendarItem, "sourceId" | "title" | "location">;

export function AccommodationDiscoveryTab({ canWrite }: { canWrite: boolean }) {
  const { currentWorkspace, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const currency = bootstrap?.workspace.currency ?? "RON";
  const [events, setEvents] = React.useState<EventOption[]>([]);
  const [eventId, setEventId] = React.useState("");
  const [eventsError, setEventsError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [radiusKm, setRadiusKm] = React.useState(10);
  const [types, setTypes] = React.useState<AccommodationDiscoveryType[]>([]);
  const [facilities, setFacilities] = React.useState<AccommodationFacility[]>([]);
  const [budget, setBudget] = React.useState("");
  const [sort, setSort] = React.useState<DiscoverySort>("distance");
  const [response, setResponse] = React.useState<AccommodationDiscoveryResponse | null>(null);
  const [existing, setExisting] = React.useState<AccommodationRecommendationResource[]>([]);
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [searching, setSearching] = React.useState(false);
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [hasSearched, setHasSearched] = React.useState(false);

  React.useEffect(() => {
    if (!currentWorkspace) return;
    let active = true;
    Promise.allSettled([
      weddingOsApi.calendar(currentWorkspace.id),
      weddingOsApi.accommodationRecommendations(currentWorkspace.id),
    ]).then(([calendarResult, recommendationsResult]) => {
      if (!active) return;
      if (calendarResult.status === "fulfilled") {
        const options = calendarResult.value.items
          .filter((item) => item.sourceType === "wedding_event")
          .map((item) => ({
            sourceId: item.sourceId,
            title: item.title,
            location: item.location,
          }));
        setEvents(options);
        setEventId((current) => current || options[0]?.sourceId || "");
        setEventsError(null);
      } else {
        setEventsError(apiErrorMessage(calendarResult.reason));
      }
      if (recommendationsResult.status === "fulfilled") {
        setExisting(recommendationsResult.value.items);
      }
      setLoadingInitial(false);
    });
    return () => {
      active = false;
    };
  }, [currentWorkspace]);

  const selectedEvent = events.find((item) => item.sourceId === eventId);
  const knownPrices = response?.items.filter((item) => item.priceSnapshot) ?? [];
  const knownUnits = new Set(knownPrices.map((item) => item.priceSnapshot?.unit));
  const knownCurrencies = new Set(
    knownPrices.map((item) => item.priceSnapshot?.currency),
  );
  const priceSortAvailable =
    knownPrices.length > 0 &&
    knownCurrencies.size === 1 &&
    knownUnits.size === 1;
  const effectiveSort: DiscoverySort =
    sort === "price" && !priceSortAvailable ? "distance" : sort;
  const sortedItems = React.useMemo(
    () => sortDiscoveryItems(response?.items ?? [], effectiveSort),
    [effectiveSort, response],
  );

  const toggleType = (value: AccommodationDiscoveryType) => {
    setTypes((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const toggleFacility = (value: AccommodationFacility) => {
    setFacilities((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace) return;
    const normalizedQuery = query.trim();
    if (!eventId && normalizedQuery.length < 2) {
      setValidationError("Alege un eveniment sau scrie o zonă ori o adresă de cel puțin două caractere.");
      return;
    }
    const budgetNumber = budget ? Number(budget) : undefined;
    if (budgetNumber !== undefined && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) {
      setValidationError("Bugetul trebuie să fie o valoare pozitivă.");
      return;
    }

    setValidationError(null);
    setSearchError(null);
    setSearching(true);
    setHasSearched(true);
    try {
      const next = await weddingOsApi.accommodationDiscovery(currentWorkspace.id, {
        eventId: eventId || undefined,
        query: normalizedQuery || undefined,
        radiusKm,
        types,
        facilities,
        budgetMaxMinor:
          budgetNumber === undefined ? undefined : Math.round(budgetNumber * 100),
        currency,
      });
      setResponse(next);
    } catch (cause) {
      setResponse(null);
      setSearchError(apiErrorMessage(cause));
    } finally {
      setSearching(false);
    }
  };

  const addRecommendation = async (item: AccommodationDiscoveryItem) => {
    if (!currentWorkspace || !eventId || !canWrite) return;
    setSavingId(item.id);
    try {
      const created = await weddingOsApi.createAccommodationRecommendation(
        currentWorkspace.id,
        discoveryItemToRecommendation(
          item,
          eventId,
          existing
            .filter(
              (recommendation) =>
                recommendation.weddingEventId === eventId,
            )
            .reduce(
              (maximum, recommendation) =>
                Math.max(maximum, recommendation.position + 1),
              0,
            ),
        ),
      );
      setExisting((current) => [...current, created]);
      toast({
        title: "Cazarea a fost adăugată la recomandări",
        description: "Este încă draft și nu este vizibilă invitaților.",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: "Recomandarea nu a fost salvată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setSavingId(null);
    }
  };

  const isSaved = (item: AccommodationDiscoveryItem) =>
    existing.some(
      (recommendation) =>
        recommendation.weddingEventId === eventId &&
        ((item.externalId && recommendation.provenance.externalId === item.externalId) ||
          (!item.externalId && recommendation.name === item.name)),
    );

  return (
    <div className="space-y-6" data-testid="accommodation-discovery-tab">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:items-start">
        <form onSubmit={search} className="space-y-5 rounded-xl border border-line bg-surface p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-softer text-brand">
              <Search className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-brand text-2xl font-semibold leading-tight tracking-[-0.025em] text-ink">
                Caută în jurul evenimentului
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-muted">
                Selectează centrul și raza. Sarbato îți arată informațiile publice disponibile,
                fără să pretindă că face rezervarea.
              </p>
            </div>
          </div>

          {loadingInitial ? (
            <div className="space-y-3" role="status" aria-label="Se încarcă evenimentele">
              <div className="h-11 animate-pulse rounded-lg bg-subtle" />
              <div className="h-11 animate-pulse rounded-lg bg-subtle" />
            </div>
          ) : (
            <div className="grid gap-4">
              <Field
                label="Eveniment"
                hint={
                  selectedEvent?.location
                    ? `Locație salvată: ${selectedEvent.location}`
                    : events.length
                      ? "Dacă locația evenimentului nu este completă, scrie zona mai jos."
                      : "Nu există încă un eveniment disponibil; poți căuta direct după zonă."
                }
              >
                <Select value={eventId} onChange={(event) => setEventId(event.target.value)}>
                  <option value="">Fără eveniment selectat</option>
                  {events.map((item) => (
                    <option key={item.sourceId} value={item.sourceId}>{item.title}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Zonă sau adresă diferită (opțional)"
                hint="Textul înlocuiește locația evenimentului și este trimis serviciului OpenStreetMap pentru localizare. Nu include date personale sau confidențiale. Nu folosim autocomplete."
                error={eventsError ?? undefined}
              >
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="De exemplu: Piața Sfatului, Brașov"
                  autoComplete="street-address"
                  maxLength={240}
                  icon={<MapPin className="size-4" />}
                />
              </Field>
            </div>
          )}

          <fieldset>
            <legend className="text-sm font-medium text-ink">Rază de căutare</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[2, 5, 10, 20].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={radiusKm === value}
                  onClick={() => setRadiusKm(value)}
                  className={cn(
                    "min-h-11 rounded-lg border px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    radiusKm === value
                      ? "border-action bg-action text-on-action"
                      : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {value} km
                </button>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl bg-brand-softer/60 p-4" aria-label="Fir de proximitate">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-action text-on-action">
                <MapPin className="size-4" aria-hidden />
              </span>
              <span className="h-px min-w-4 flex-1 bg-gradient-to-r from-brand via-accent to-sage" aria-hidden />
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-sage bg-sage-soft text-success">
                <Route className="size-4" aria-hidden />
              </span>
            </div>
            <div className="mt-2 flex items-start justify-between gap-4 text-xs text-muted">
              <span className="max-w-[55%] break-words">
                {query.trim() || selectedEvent?.location || selectedEvent?.title || "Punct de plecare"}
              </span>
              <span className="shrink-0 font-semibold text-brand">până la {radiusKm} km</span>
            </div>
          </div>

          <details className="group rounded-xl border border-line bg-background open:bg-surface">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-brand" aria-hidden />
                Filtre pentru ședere
              </span>
              <span className="text-xs font-medium text-muted group-open:hidden">
                {types.length + facilities.length ? `${types.length + facilities.length} active` : "Opțional"}
              </span>
              <span className="hidden text-xs font-medium text-muted group-open:inline">Închide</span>
            </summary>
            <div className="space-y-5 border-t border-line px-4 pb-4 pt-4">
              <fieldset>
                <legend className="text-sm font-medium text-ink">Tip de cazare</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {accommodationTypes.map((item) => (
                    <FilterChip
                      key={item.value}
                      selected={types.includes(item.value)}
                      onClick={() => toggleType(item.value)}
                    >
                      {item.label}
                    </FilterChip>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-sm font-medium text-ink">Facilități</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {accommodationFacilities.map((item) => (
                    <FilterChip
                      key={item.value}
                      selected={facilities.includes(item.value)}
                      onClick={() => toggleFacility(item.value)}
                    >
                      {item.label}
                    </FilterChip>
                  ))}
                </div>
              </fieldset>

              <Field
                label={`Buget maxim / noapte (${currency})`}
                hint="Sursa publică OpenStreetMap nu oferă, de regulă, prețuri. Evaluăm doar prețurile introduse și datate explicit; variantele fără preț rămân vizibile."
              >
                <Input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  placeholder="De exemplu: 450"
                />
              </Field>
            </div>
          </details>

          {validationError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {validationError}
            </p>
          )}
          <Button type="submit" loading={searching} className="w-full sm:w-auto">
            <Search className="size-4" aria-hidden />
            Caută variante
          </Button>
        </form>

        <section aria-labelledby="discovery-results-title" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="discovery-results-title" className="font-brand text-2xl font-semibold tracking-[-0.02em] text-ink">
                Variante în zonă
              </h2>
              <p className="mt-1 text-sm text-muted" aria-live="polite">
                {searching
                  ? "Căutăm informațiile publice disponibile…"
                  : response
                    ? `${response.items.length} variante în raza de ${response.radiusKm} km`
                    : "Rezultatele apar după ce alegi zona și pornești căutarea."}
              </p>
            </div>
            {response && response.items.length > 1 && (
              <Field label="Ordonează" className="w-full sm:w-56">
                <Select value={effectiveSort} onChange={(event) => setSort(event.target.value as DiscoverySort)}>
                  <option value="distance">Distanță față de centru</option>
                  <option value="price" disabled={!priceSortAvailable}>
                    {priceSortAvailable ? "Preț public comparabil" : "Preț: lipsesc date comparabile"}
                  </option>
                </Select>
              </Field>
            )}
          </div>

          {!canWrite && (
            <div className="flex flex-col gap-3 rounded-xl border border-brand/20 bg-brand-softer/55 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 gap-3">
                <LockKeyhole className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink">Explorarea rămâne gratuită</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Salvarea, editarea și publicarea recomandărilor sunt disponibile în Plus și Pro.
                  </p>
                </div>
              </div>
              <Link
                href="/settings?tab=billing"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand transition-colors hover:border-action hover:bg-action hover:text-on-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Vezi abonamentele
              </Link>
            </div>
          )}

          {searching && (
            <div className="grid gap-3" aria-hidden>
              <CardSkeleton lines={4} />
              <CardSkeleton lines={4} />
            </div>
          )}

          {!searching && searchError && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/50 p-5">
              <div className="flex gap-3">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                <div>
                  <h3 className="font-semibold text-ink">Căutarea nu este disponibilă acum</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{searchError}</p>
                  <p className="mt-2 text-xs text-faint">
                    Aceasta este o eroare de furnizor sau de localizare, nu un rezultat cu zero variante.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!searching && !searchError && !hasSearched && (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-xl bg-sage-soft text-success">
                <MapPin className="size-6" aria-hidden />
              </span>
              <h3 className="mt-4 font-brand text-xl font-semibold text-ink">Pornește de la locul evenimentului</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                Nu afișăm rezultate demonstrative. După căutare vei vedea numai variante provenite din sursa indicată.
              </p>
            </div>
          )}

          {!searching && response && response.metadata.warnings.length > 0 && (
            <div className="space-y-2" role="status">
              {response.metadata.warnings.map((warning) => (
                <p key={warning} className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm leading-5 text-warning">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {warning}
                </p>
              ))}
            </div>
          )}

          {!searching && response?.metadata.status === "degraded" && (
            <div role="status" className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft/55 p-4">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
              <div>
                <h3 className="text-sm font-semibold text-ink">Rezultate disponibile din ultima copie sigură</h3>
                <p className="mt-1 text-sm leading-6 text-muted">
                  Furnizorul răspunde parțial. Verifică informațiile direct cu proprietatea înainte să recomanzi o variantă.
                </p>
              </div>
            </div>
          )}

          {!searching && response?.metadata.status === "unavailable" && (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/50 p-5">
              <div className="flex gap-3">
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
                <div>
                  <h3 className="font-semibold text-ink">Sursa de cazare nu este disponibilă acum</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Nu putem spune că zona nu are cazări. OpenStreetMap nu a răspuns și nu există o copie sigură suficient de recentă pentru această căutare.
                  </p>
                  <AttributionLink
                    href={response.metadata.attribution.url}
                    label={response.metadata.attribution.text}
                    className="mt-3 inline-flex"
                  />
                </div>
              </div>
            </div>
          )}

          {!searching && response?.metadata.status === "available" && response.items.length === 0 && (
            <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
              <BedDouble className="mx-auto size-7 text-brand" aria-hidden />
              <h3 className="mt-3 font-brand text-xl font-semibold text-ink">Nicio variantă nu corespunde căutării</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Zona a fost găsită, dar sursa nu a întors rezultate pentru raza și filtrele selectate. Mărește raza sau elimină un filtru.
              </p>
              <AttributionLink
                href={response.metadata.attribution.url}
                label={response.metadata.attribution.text}
                className="mt-4 inline-flex"
              />
            </div>
          )}

          {!searching && response?.metadata.status === "degraded" && response.items.length === 0 && (
            <div className="rounded-xl border border-line bg-surface px-6 py-8 text-center">
              <p className="mx-auto max-w-md text-sm leading-6 text-muted">
                Copia păstrată nu conține variante pentru această căutare. Nu interpretăm acest lucru ca lipsă de cazare în zonă.
              </p>
              <AttributionLink
                href={response.metadata.attribution.url}
                label={response.metadata.attribution.text}
                className="mt-4 inline-flex"
              />
            </div>
          )}

          {!searching && response && response.metadata.status !== "unavailable" && sortedItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex items-start gap-3 border-b border-line bg-brand-softer/55 px-4 py-4 sm:px-5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-action text-on-action">
                  <MapPin className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-faint">Centrul căutării · 0 km</p>
                  <p className="mt-0.5 break-words text-sm font-semibold text-ink">
                    {response.center.label || "Coordonatele selectate"}
                  </p>
                </div>
              </div>

              <ol className="relative divide-y divide-line">
                {sortedItems.map((item) => (
                  <DiscoveryResult
                    key={item.id}
                    item={item}
                    budgetApplied={Boolean(response.metadata.budget)}
                    saved={isSaved(item)}
                    saving={savingId === item.id}
                    canWrite={canWrite}
                    canSave={Boolean(eventId)}
                    onAdd={() => void addRecommendation(item)}
                  />
                ))}
              </ol>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-subtle/55 px-4 py-3 text-xs text-faint sm:px-5">
                <p>
                  Informații preluate {formatFreshness(response.metadata.fetchedAt).toLowerCase()} · disponibilitatea se verifică direct.
                </p>
                <AttributionLink
                  href={response.metadata.attribution.url}
                  label={response.metadata.attribution.text}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-brand bg-brand-softer text-brand"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {selected && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function DiscoveryResult({
  item,
  budgetApplied,
  saved,
  saving,
  canWrite,
  canSave,
  onAdd,
}: {
  item: AccommodationDiscoveryItem;
  budgetApplied: boolean;
  saved: boolean;
  saving: boolean;
  canWrite: boolean;
  canSave: boolean;
  onAdd: () => void;
}) {
  const bookingUrl = safeExternalUrl(item.bookingUrl);
  const contactUrl = safeExternalUrl(item.contactUrl);

  return (
    <li className="relative grid min-w-0 gap-5 px-4 py-5 pl-12 sm:px-5 sm:pl-14 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
      <span className="absolute left-5 top-7 z-[1] size-3 rounded-full border-2 border-surface bg-accent shadow-[0_0_0_1px_var(--color-line)] sm:left-6" aria-hidden />
      <span className="absolute bottom-0 left-[25px] top-0 w-px bg-line sm:left-[30px]" aria-hidden />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{typeLabel(item.type)}</Badge>
          <Badge variant="info"><Route className="size-3" aria-hidden />{formatDistance(item.distanceKm)}</Badge>
          <span className="text-xs text-faint">Sursă: {item.source === "osm" ? "OpenStreetMap" : "organizator"}</span>
        </div>
        <h3 className="mt-3 break-words font-brand text-xl font-semibold leading-tight tracking-[-0.015em] text-ink">
          {item.name}
        </h3>
        <p className="mt-1 flex min-w-0 items-start gap-2 text-sm leading-6 text-muted">
          <MapPin className="mt-1 size-4 shrink-0 text-brand" aria-hidden />
          <span className="min-w-0 break-words">{addressLabel(item)}</span>
        </p>

        {item.facilities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Facilități publicate">
            {item.facilities.map((facility) => (
              <span key={facility} className="rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-muted">
                {facilityLabel(facility)}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-faint">
          {formatFreshness(item.sourceUpdatedAt ?? item.fetchedAt)}
        </p>
      </div>

      <div className="min-w-0 border-t border-line pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
        <p className="text-xs font-medium text-faint">Informație de preț</p>
        <p className="mt-1 break-words text-sm font-semibold text-ink">{formatPrice(item.priceSnapshot)}</p>
        {!item.priceSnapshot && budgetApplied && (
          <p className="mt-1 text-xs leading-5 text-warning">
            Nu poate fi evaluată față de buget; varianta rămâne vizibilă.
          </p>
        )}
        {!item.priceSnapshot && !budgetApplied && (
          <p className="mt-1 text-xs leading-5 text-faint">Verifică direct cu proprietatea.</p>
        )}

        <div className="mt-4 grid gap-2">
          {bookingUrl && (
            <ExternalAction href={bookingUrl}>Vezi site-ul</ExternalAction>
          )}
          {contactUrl && contactUrl !== bookingUrl && (
            <ExternalAction href={contactUrl}>Contact online</ExternalAction>
          )}
          {item.contactPhone && (
            <a
              href={`tel:${item.contactPhone.replace(/[^0-9+]/g, "")}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Phone className="size-3.5" aria-hidden /> Sună proprietatea
            </a>
          )}
          {canWrite && (
            <Button
              variant="secondary"
              onClick={onAdd}
              disabled={saved || saving || !canSave}
              aria-label={
                !canSave
                  ? `Alege un eveniment înainte să adaugi ${item.name}`
                  : undefined
              }
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : saved ? <Check className="size-4" aria-hidden /> : null}
              {saved ? "Adăugată" : !canSave ? "Alege un eveniment" : "Adaugă la recomandări"}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function ExternalAction({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-brand transition-colors hover:border-brand hover:bg-brand-softer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      <ExternalLink className="size-3.5" aria-hidden />
      <span className="sr-only"> (se deschide într-un tab nou)</span>
    </a>
  );
}

function AttributionLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "min-h-11 py-3 font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      {label}
      <span className="sr-only"> (se deschide într-un tab nou)</span>
    </a>
  );
}
