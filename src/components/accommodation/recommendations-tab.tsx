"use client";

import * as React from "react";
import Link from "next/link";
import type {
  AccommodationRecommendationResource,
  AccommodationRecommendationStatus,
  CalendarItem,
  UpdateAccommodationRecommendation,
} from "@weddingos/contracts";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  FilePenLine,
  LockKeyhole,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { GuestAccommodationRecommendations } from "@/components/guest/accommodation-recommendations";
import {
  Badge,
  Button,
  CardSkeleton,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { cn } from "@/lib/utils";
import {
  accommodationTypes,
  addressLabel,
  formatDistance,
  formatFreshness,
  formatPrice,
  safeExternalUrl,
  typeLabel,
} from "./model";

type EventOption = Pick<CalendarItem, "sourceId" | "title">;
type StatusFilter = "all" | AccommodationRecommendationStatus;

const statusLabels: Record<AccommodationRecommendationStatus, string> = {
  draft: "Draft",
  published: "Publicată",
  archived: "Arhivată",
};

export function AccommodationRecommendationsTab({
  canWrite,
  canPublish,
}: {
  canWrite: boolean;
  canPublish: boolean;
}) {
  const { currentWorkspace, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const currency = bootstrap?.workspace.currency ?? "RON";
  const [items, setItems] = React.useState<AccommodationRecommendationResource[]>([]);
  const [events, setEvents] = React.useState<EventOption[]>([]);
  const [eventId, setEventId] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [manualEventId, setManualEventId] = React.useState("");
  const [manualName, setManualName] = React.useState("");
  const [manualType, setManualType] = React.useState<AccommodationRecommendationResource["type"]>("hotel");
  const [manualAddress, setManualAddress] = React.useState("");
  const [manualCity, setManualCity] = React.useState("");
  const [manualCountry, setManualCountry] = React.useState("");
  const [manualWebsite, setManualWebsite] = React.useState("");
  const [manualPhone, setManualPhone] = React.useState("");
  const [manualNote, setManualNote] = React.useState("");
  const [manualPrice, setManualPrice] = React.useState("");
  const [manualPriceUnit, setManualPriceUnit] = React.useState<"per_night" | "total_stay">("per_night");
  const [manualPriceNote, setManualPriceNote] = React.useState("");
  const [manualError, setManualError] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AccommodationRecommendationResource | null>(null);

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [list, calendar] = await Promise.all([
        weddingOsApi.accommodationRecommendations(currentWorkspace.id),
        weddingOsApi.calendar(currentWorkspace.id),
      ]);
      const nextEvents = calendar.items
        .filter((item) => item.sourceType === "wedding_event")
        .map((item) => ({ sourceId: item.sourceId, title: item.title }));
      setItems(list.items);
      setEvents(nextEvents);
      setEventId((current) => current || nextEvents[0]?.sourceId || "");
      setManualEventId((current) => current || nextEvents[0]?.sourceId || "");
      setSelectedId((current) =>
        current && list.items.some((item) => item.id === current)
          ? current
          : list.items[0]?.id ?? null,
      );
      setError(null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredItems = React.useMemo(
    () =>
      items
        .filter((item) => !eventId || item.weddingEventId === eventId)
        .filter((item) => statusFilter === "all" || item.status === statusFilter)
        .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt)),
    [eventId, items, statusFilter],
  );

  const selected =
    filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;

  const updateLocal = (next: AccommodationRecommendationResource) => {
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
  };

  const save = async (input: UpdateAccommodationRecommendation) => {
    if (!currentWorkspace || !selected || !canWrite) return;
    setSaving(true);
    try {
      const updated = await weddingOsApi.updateAccommodationRecommendation(
        currentWorkspace.id,
        selected.id,
        selected.version,
        input,
      );
      updateLocal(updated);
      toast({ title: "Recomandarea a fost actualizată", variant: "success" });
    } catch (cause) {
      toast({
        title: "Modificările nu au fost salvate",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!currentWorkspace || !deleteTarget || !canWrite) return;
    setSaving(true);
    try {
      await weddingOsApi.deleteAccommodationRecommendation(
        currentWorkspace.id,
        deleteTarget.id,
        deleteTarget.version,
      );
      setItems((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      setSelectedId(null);
      setDeleteTarget(null);
      toast({ title: "Varianta a fost ștearsă", variant: "success" });
    } catch (cause) {
      toast({
        title: "Varianta nu a fost ștearsă",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const transition = async (target: "publish" | "archive") => {
    if (!currentWorkspace || !selected || !canPublish) return;
    setSaving(true);
    try {
      const updated =
        target === "publish"
          ? await weddingOsApi.publishAccommodationRecommendation(
              currentWorkspace.id,
              selected.id,
              selected.version,
            )
          : await weddingOsApi.archiveAccommodationRecommendation(
              currentWorkspace.id,
              selected.id,
              selected.version,
            );
      updateLocal(updated);
      toast({
        title: target === "publish" ? "Recomandarea este vizibilă invitaților" : "Recomandarea a fost arhivată",
        variant: "success",
      });
    } catch (cause) {
      toast({
        title: target === "publish" ? "Recomandarea nu a fost publicată" : "Recomandarea nu a fost arhivată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const move = async (direction: -1 | 1) => {
    if (!currentWorkspace || !selected || !canWrite) return;
    const ordered = items
      .filter((item) => item.weddingEventId === selected.weddingEventId)
      .sort(
        (left, right) =>
          left.position - right.position ||
          left.createdAt.localeCompare(right.createdAt),
      );
    const currentIndex = ordered.findIndex((item) => item.id === selected.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length)
      return;
    const reordered = [...ordered];
    [reordered[currentIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[currentIndex],
    ];
    setSaving(true);
    try {
      const result = await weddingOsApi.reorderAccommodationRecommendations(
        currentWorkspace.id,
        reordered.map((item, position) => ({
          id: item.id,
          version: item.version,
          position,
        })),
      );
      const updated = new Map(result.items.map((item) => [item.id, item]));
      setItems((current) =>
        current.map((item) => updated.get(item.id) ?? item),
      );
    } catch (cause) {
      toast({
        title: "Ordinea nu a fost schimbată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const createManual = async () => {
    if (!currentWorkspace || !canWrite) return;
    if (!manualEventId || !manualName.trim()) {
      setManualError("Alege evenimentul și completează numele proprietății.");
      return;
    }
    const website = manualWebsite.trim()
      ? safeExternalUrl(manualWebsite.trim())
      : null;
    if (manualWebsite.trim() && !website) {
      setManualError("Site-ul trebuie să fie o adresă completă care începe cu http:// sau https://.");
      return;
    }
    const priceAmount = manualPrice ? Number(manualPrice) : undefined;
    if (
      priceAmount !== undefined &&
      (!Number.isFinite(priceAmount) || priceAmount < 0)
    ) {
      setManualError("Prețul observat trebuie să fie o valoare pozitivă.");
      return;
    }
    setManualError(null);
    setSaving(true);
    try {
      const created = await weddingOsApi.createAccommodationRecommendation(
        currentWorkspace.id,
        {
          weddingEventId: manualEventId,
          source: "organizer",
          name: manualName.trim(),
          type: manualType,
          address: manualAddress.trim() || null,
          city: manualCity.trim() || null,
          country: manualCountry.trim() || null,
          contactUrl: website,
          contactPhone: manualPhone.trim() || null,
          facilities: [],
          organizerNote: manualNote.trim() || null,
          priceSnapshot:
            priceAmount === undefined
              ? null
              : {
                  amountMinor: Math.round(priceAmount * 100),
                  currency,
                  unit: manualPriceUnit,
                  observedAt: new Date().toISOString(),
                  note: manualPriceNote.trim() || null,
                },
          position: items
            .filter((item) => item.weddingEventId === manualEventId)
            .reduce(
              (maximum, item) => Math.max(maximum, item.position + 1),
              0,
            ),
        },
      );
      setItems((current) => [...current, created]);
      setEventId(manualEventId);
      setSelectedId(created.id);
      setManualOpen(false);
      setManualName("");
      setManualAddress("");
      setManualCity("");
      setManualCountry("");
      setManualWebsite("");
      setManualPhone("");
      setManualNote("");
      setManualPrice("");
      setManualPriceUnit("per_night");
      setManualPriceNote("");
      toast({
        title: "Varianta a fost adăugată",
        description: "Este draft și nu este încă vizibilă invitaților.",
        variant: "success",
      });
    } catch (cause) {
      setManualError(apiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,.7fr)_minmax(0,1.3fr)]">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft/50 p-5">
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
          <div>
            <h2 className="font-semibold text-ink">Recomandările nu sunt disponibile</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => void load()}>Reîncearcă</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="accommodation-recommendations-tab">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-brand text-2xl font-semibold tracking-[-0.02em] text-ink">
            Lista pe care o pregătești pentru invitați
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Recomandarea nu rezervă nimic. Invitatul vede informația, codul de grup și legătura directă către proprietate.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
          {events.length > 1 && (
            <Field label="Eveniment" className="w-full sm:w-64">
              <Select value={eventId} onChange={(event) => setEventId(event.target.value)}>
                <option value="">Toate evenimentele</option>
                {events.map((event) => (
                  <option key={event.sourceId} value={event.sourceId}>{event.title}</option>
                ))}
              </Select>
            </Field>
          )}
          {canWrite && (
            <Button
              variant="outline"
              onClick={() => {
                setManualEventId(eventId || events[0]?.sourceId || "");
                setManualOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden /> Adaugă o variantă lipsă
            </Button>
          )}
        </div>
      </div>

      {!canWrite && <ReadOnlyNotice />}

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrează după stare">
        {([
          ["all", "Toate"],
          ["draft", "Draft"],
          ["published", "Publicate"],
          ["archived", "Arhivate"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
            className={cn(
              "min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              statusFilter === value
                ? "border-brand bg-brand text-on-brand"
                : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <FilePenLine className="mx-auto size-7 text-brand" aria-hidden />
          <h3 className="mt-3 font-brand text-xl font-semibold text-ink">Nu există recomandări în această stare</h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Revino în „Descoperă”, caută zona evenimentului și adaugă numai variantele pe care vrei să le pregătești pentru invitați.
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(280px,.72fr)_minmax(0,1.28fr)] lg:items-start">
          <section aria-label="Recomandări salvate" className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
            <ol className="divide-y divide-line">
              {filteredItems.map((item, index) => (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    aria-current={selected?.id === item.id ? "true" : undefined}
                    className={cn(
                      "min-h-11 w-full min-w-0 px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                      selected?.id === item.id ? "bg-brand-softer" : "hover:bg-subtle/70",
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                          selected?.id === item.id
                            ? "bg-brand text-on-brand"
                            : "border border-line bg-surface text-muted",
                        )}
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="break-words text-sm font-semibold text-ink">{item.name}</span>
                          <StatusBadge status={item.status} />
                        </span>
                        <span className="mt-1 block break-words text-xs leading-5 text-muted">
                          {formatDistance(item.distanceKm)} · {addressLabel(item)}
                        </span>
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          {selected && (
            <div className="min-w-0 space-y-5">
              <section className="rounded-xl border border-line bg-surface p-4 sm:p-6" aria-labelledby="recommendation-editor-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{typeLabel(selected.type)}</Badge>
                      <StatusBadge status={selected.status} />
                    </div>
                    <h3 id="recommendation-editor-title" className="mt-3 break-words font-brand text-2xl font-semibold leading-tight tracking-[-0.02em] text-ink">
                      {selected.name}
                    </h3>
                    <p className="mt-1 break-words text-sm leading-6 text-muted">{addressLabel(selected)}</p>
                  </div>
                  {canWrite && statusFilter === "all" && Boolean(eventId) && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void move(-1)}
                        disabled={
                          saving ||
                          items
                            .filter(
                              (item) =>
                                item.weddingEventId ===
                                selected.weddingEventId,
                            )
                            .sort((left, right) => left.position - right.position)[0]
                            ?.id === selected.id
                        }
                        aria-label={`Mută ${selected.name} mai sus`}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void move(1)}
                        disabled={
                          saving ||
                          items
                            .filter(
                              (item) =>
                                item.weddingEventId ===
                                selected.weddingEventId,
                            )
                            .sort((left, right) => left.position - right.position)
                            .at(-1)?.id === selected.id
                        }
                        aria-label={`Mută ${selected.name} mai jos`}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>

                <dl className="mt-5 grid gap-3 border-y border-line py-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-faint">Distanță</dt>
                    <dd className="mt-1 font-medium text-ink">{formatDistance(selected.distanceKm)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Preț public</dt>
                    <dd className="mt-1 font-medium text-ink">{formatPrice(selected.priceSnapshot)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Proveniență</dt>
                    <dd className="mt-1 font-medium text-ink">
                      {selected.source === "osm" ? "OpenStreetMap" : "Organizator"}
                    </dd>
                  </div>
                </dl>

                {canWrite ? (
                  <RecommendationEditorForm
                    key={`${selected.id}:${selected.version}`}
                    item={selected}
                    saving={saving}
                    canPublish={canPublish}
                    currency={currency}
                    onSave={save}
                    onPublish={() => transition("publish")}
                    onArchive={() => transition("archive")}
                    onDelete={() => setDeleteTarget(selected)}
                  />
                ) : (
                  <div className="mt-5 rounded-lg bg-subtle p-4 text-sm leading-6 text-muted">
                    {selected.organizerNote ? (
                      <p className="break-words"><strong className="text-ink">Nota invitaților:</strong> {selected.organizerNote}</p>
                    ) : (
                      <p>Nu există încă o notă pentru invitați.</p>
                    )}
                    {selected.groupCode && <p className="mt-2 break-words"><strong className="text-ink">Cod grup:</strong> {selected.groupCode}</p>}
                  </div>
                )}

                <p className="mt-4 text-xs text-faint">{formatFreshness(selected.updatedAt)}</p>
              </section>

              <section aria-labelledby="guest-preview-title">
                <div className="mb-3 flex items-center gap-2">
                  <Eye className="size-4 text-brand" aria-hidden />
                  <h3 id="guest-preview-title" className="text-sm font-semibold text-ink">
                    Previzualizare exactă pentru invitat
                  </h3>
                </div>
                <GuestAccommodationRecommendations
                  items={[selected]}
                  eventTitles={{
                    [selected.weddingEventId]:
                      events.find(
                        (event) =>
                          event.sourceId === selected.weddingEventId,
                      )?.title ?? "Eveniment",
                  }}
                />
              </section>
            </div>
          )}
        </div>
      )}

      <Modal
        open={manualOpen}
        onClose={() => {
          if (!saving) setManualOpen(false);
        }}
        title="Variantă adăugată de organizator"
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)} disabled={saving}>
              Renunță
            </Button>
            <Button
              onClick={() => void createManual()}
              loading={saving}
              disabled={!manualEventId || !manualName.trim()}
            >
              Adaugă în recomandări
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Eveniment"
            required
            className="sm:col-span-2"
            hint={events.length ? undefined : "Creează mai întâi evenimentul și locația lui."}
          >
            <Select
              value={manualEventId}
              onChange={(event) => setManualEventId(event.target.value)}
            >
              <option value="">Alege evenimentul</option>
              {events.map((event) => (
                <option key={event.sourceId} value={event.sourceId}>{event.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Numele proprietății" required className="sm:col-span-2">
            <Input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              maxLength={180}
            />
          </Field>
          <Field label="Tip">
            <Select
              value={manualType}
              onChange={(event) =>
                setManualType(event.target.value as AccommodationRecommendationResource["type"])
              }
            >
              {accommodationTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Localitate">
            <Input
              value={manualCity}
              onChange={(event) => setManualCity(event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Adresă" className="sm:col-span-2">
            <Input
              value={manualAddress}
              onChange={(event) => setManualAddress(event.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Țară">
            <Input
              value={manualCountry}
              onChange={(event) => setManualCountry(event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Telefon">
            <Input
              type="tel"
              value={manualPhone}
              onChange={(event) => setManualPhone(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field
            label="Site"
            hint="Adresă completă HTTP(S); rezervarea rămâne în afara Sarbato."
            className="sm:col-span-2"
          >
            <Input
              type="url"
              value={manualWebsite}
              onChange={(event) => setManualWebsite(event.target.value)}
              placeholder="https://"
              maxLength={2048}
            />
          </Field>
          <div className="rounded-xl bg-subtle p-4 sm:col-span-2">
            <p className="text-sm font-semibold text-ink">Preț observat (opțional)</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Este o informație datată pentru comparație, nu o ofertă și nu confirmă disponibilitatea.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={`Sumă (${currency})`}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={manualPrice}
                  onChange={(event) => setManualPrice(event.target.value)}
                />
              </Field>
              <Field label="Unitate">
                <Select
                  value={manualPriceUnit}
                  onChange={(event) =>
                    setManualPriceUnit(
                      event.target.value as "per_night" | "total_stay",
                    )
                  }
                >
                  <option value="per_night">Pe noapte</option>
                  <option value="total_stay">Pentru sejurul observat</option>
                </Select>
              </Field>
              <Field label="Notă despre preț" className="sm:col-span-2">
                <Input
                  value={manualPriceNote}
                  onChange={(event) => setManualPriceNote(event.target.value)}
                  maxLength={240}
                  placeholder="De exemplu: tarif afișat pe site, fără taxe locale"
                />
              </Field>
            </div>
          </div>
          <Field label="Notă pentru invitați" className="sm:col-span-2">
            <Textarea
              value={manualNote}
              onChange={(event) => setManualNote(event.target.value)}
              maxLength={2000}
            />
          </Field>
          {manualError && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">
              {manualError}
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!saving) setDeleteTarget(null);
        }}
        onConfirm={() => void remove()}
        title="Ștergi recomandarea?"
        description={`„${deleteTarget?.name ?? "Această variantă"}” va fi eliminată numai din recomandările evenimentului. Informația din sursa externă nu este modificată.`}
        confirmLabel="Șterge recomandarea"
        destructive
        loading={saving}
      />
    </div>
  );
}

function RecommendationEditorForm({
  item,
  currency,
  saving,
  canPublish,
  onSave,
  onPublish,
  onArchive,
  onDelete,
}: {
  item: AccommodationRecommendationResource;
  currency: string;
  saving: boolean;
  canPublish: boolean;
  onSave: (input: UpdateAccommodationRecommendation) => Promise<void>;
  onPublish: () => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => void;
}) {
  const [note, setNote] = React.useState(item.organizerNote ?? "");
  const [groupCode, setGroupCode] = React.useState(item.groupCode ?? "");
  const [deadline, setDeadline] = React.useState(toLocalDateTime(item.deadline));
  const [name, setName] = React.useState(item.name);
  const [type, setType] = React.useState(item.type);
  const [address, setAddress] = React.useState(item.address ?? "");
  const [city, setCity] = React.useState(item.city ?? "");
  const [country, setCountry] = React.useState(item.country ?? "");
  const [website, setWebsite] = React.useState(item.contactUrl ?? "");
  const [phone, setPhone] = React.useState(item.contactPhone ?? "");
  const [price, setPrice] = React.useState(
    item.priceSnapshot ? String(item.priceSnapshot.amountMinor / 100) : "",
  );
  const [priceUnit, setPriceUnit] = React.useState<
    "per_night" | "total_stay"
  >(item.priceSnapshot?.unit ?? "per_night");
  const [priceNote, setPriceNote] = React.useState(
    item.priceSnapshot?.note ?? "",
  );
  const [formError, setFormError] = React.useState<string | null>(null);
  const priceCurrency = item.priceSnapshot?.currency ?? currency;

  const submit = async () => {
    const normalizedWebsite = website.trim()
      ? safeExternalUrl(website.trim())
      : null;
    if (item.source === "organizer" && !name.trim()) {
      setFormError("Numele proprietății este obligatoriu.");
      return;
    }
    if (item.source === "organizer" && website.trim() && !normalizedWebsite) {
      setFormError(
        "Site-ul trebuie să fie o adresă completă care începe cu http:// sau https://.",
      );
      return;
    }
    const priceAmount = price ? Number(price) : undefined;
    if (
      priceAmount !== undefined &&
      (!Number.isFinite(priceAmount) || priceAmount < 0)
    ) {
      setFormError("Prețul observat trebuie să fie o valoare pozitivă.");
      return;
    }
    const amountMinor =
      priceAmount === undefined ? undefined : Math.round(priceAmount * 100);
    const priceChanged =
      amountMinor !== item.priceSnapshot?.amountMinor ||
      priceUnit !== item.priceSnapshot?.unit ||
      (priceNote.trim() || null) !== (item.priceSnapshot?.note ?? null);

    const input: UpdateAccommodationRecommendation = {
      organizerNote: note.trim() || null,
      groupCode: groupCode.trim() || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      priceSnapshot:
        amountMinor === undefined
          ? null
          : {
              amountMinor,
              currency: priceCurrency,
              unit: priceUnit,
              observedAt:
                !priceChanged && item.priceSnapshot
                  ? item.priceSnapshot.observedAt
                  : new Date().toISOString(),
              note: priceNote.trim() || null,
            },
      ...(item.source === "organizer"
        ? {
            name: name.trim(),
            type,
            address: address.trim() || null,
            city: city.trim() || null,
            country: country.trim() || null,
            contactUrl: normalizedWebsite,
            contactPhone: phone.trim() || null,
          }
        : {}),
    };
    setFormError(null);
    await onSave(input);
  };

  return (
    <div className="mt-5 space-y-5">
      {item.source === "organizer" && (
        <div className="grid gap-4 rounded-xl bg-subtle p-4 sm:grid-cols-2">
          <p className="text-sm font-semibold text-ink sm:col-span-2">
            Detaliile variantei introduse manual
          </p>
          <Field label="Nume" required className="sm:col-span-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={180}
            />
          </Field>
          <Field label="Tip">
            <Select
              value={type}
              onChange={(event) =>
                setType(
                  event.target
                    .value as AccommodationRecommendationResource["type"],
                )
              }
            >
              {accommodationTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Localitate">
            <Input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Adresă" className="sm:col-span-2">
            <Input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Țară">
            <Input
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label="Telefon">
            <Input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={80}
            />
          </Field>
          <Field
            label="Site"
            hint="Link HTTP(S), deschis direct de invitat."
            className="sm:col-span-2"
          >
            <Input
              type="url"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
              maxLength={2048}
            />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Notă pentru invitați"
          hint="Explică de ce recomanzi varianta; nu promite disponibilitatea."
          className="sm:col-span-2"
        >
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={2000}
            placeholder="De exemplu: aproape de punctul de plecare al transferului."
          />
        </Field>
        <Field label="Cod de grup (opțional)">
          <Input
            value={groupCode}
            onChange={(event) => setGroupCode(event.target.value)}
            maxLength={120}
          />
        </Field>
        <Field label="Termen recomandat (opțional)">
          <Input
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-xl bg-subtle p-4">
        <p className="text-sm font-semibold text-ink">Preț observat (opțional)</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Folosit doar pentru comparație. Nu este ofertă și nu confirmă disponibilitatea.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={`Sumă (${priceCurrency})`}>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Field>
          <Field label="Unitate">
            <Select
              value={priceUnit}
              onChange={(event) =>
                setPriceUnit(
                  event.target.value as "per_night" | "total_stay",
                )
              }
            >
              <option value="per_night">Pe noapte</option>
              <option value="total_stay">Pentru sejurul observat</option>
            </Select>
          </Field>
          <Field label="Notă despre preț" className="sm:col-span-2">
            <Input
              value={priceNote}
              onChange={(event) => setPriceNote(event.target.value)}
              maxLength={240}
            />
          </Field>
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void submit()} loading={saving}>
            Salvează modificările
          </Button>
          {item.status !== "published" && (
            <Button
              variant="outline"
              onClick={() => void onPublish()}
              disabled={saving || !canPublish}
            >
              <Send className="size-4" aria-hidden /> Publică pentru invitați
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {item.status !== "archived" && (
            <Button
              variant="ghost"
              onClick={() => void onArchive()}
              disabled={saving || !canPublish}
            >
              <Archive className="size-4" aria-hidden /> Arhivează
            </Button>
          )}
          <Button
            variant="destructive-outline"
            onClick={onDelete}
            disabled={saving}
          >
            <Trash2 className="size-4" aria-hidden /> Șterge
          </Button>
        </div>
      </div>
      {!canPublish && item.status !== "published" && (
        <p className="text-xs leading-5 text-warning">
          Poți edita recomandarea, dar publicarea cere rolul cu permisiunea „Publică cazarea”.
        </p>
      )}
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand/20 bg-brand-softer/55 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <LockKeyhole className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-ink">Listă în mod doar citire</p>
          <p className="mt-1 text-sm leading-6 text-muted">
            Poți vedea recomandările existente. Salvarea și publicarea sunt incluse în Plus și Pro.
          </p>
        </div>
      </div>
      <Link
        href="/settings?tab=billing"
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-brand px-4 text-sm font-semibold text-brand transition-colors hover:bg-brand hover:text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Vezi abonamentele
      </Link>
    </div>
  );
}

function StatusBadge({ status }: { status: AccommodationRecommendationStatus }) {
  return (
    <Badge variant={status === "published" ? "success" : status === "archived" ? "neutral" : "warning"}>
      {status === "published" && <Check className="size-3" aria-hidden />}
      {statusLabels[status]}
    </Badge>
  );
}

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.valueOf() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}
