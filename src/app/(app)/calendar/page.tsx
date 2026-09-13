"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { CalendarItem, CreateCalendarEvent } from "@weddingos/contracts";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  MapPin,
  Plus,
} from "lucide-react";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { upcomingEvents } from "@/lib/data/wedding";
import { cn } from "@/lib/utils";
import {
  calendarDayKey,
  calendarInputValues,
  calendarMonthCells,
  calendarPeriodLabel,
  formatCalendarDateLong,
  itemsInCalendarPeriod,
  nextCalendarItem,
  zonedDateTimeToIso,
  type CalendarView,
} from "@/lib/calendar-model";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

const initialCalendarDate = (eventDate?: string | null) =>
  eventDate ? new Date(`${eventDate}T12:00:00`) : new Date();
const sourceLabels: Record<CalendarItem["sourceType"], string> = {
  native_event: "Eveniment",
  task_due: "Termen sarcină",
  task_start: "Început sarcină",
  milestone: "Reper de planificare",
  wedding_event: "Moment al evenimentului",
  contract: "Contract",
  payment_schedule: "Plată programată",
  booking: "Rezervare",
  signature_envelope: "Semnătură",
  payment_checkout: "Plată online",
};
const sourceTones: Record<
  CalendarItem["sourceType"],
  "brand" | "info" | "warning" | "accent" | "neutral"
> = {
  native_event: "brand",
  task_due: "warning",
  task_start: "info",
  milestone: "accent",
  wedding_event: "neutral",
  contract: "brand",
  payment_schedule: "warning",
  booking: "accent",
  signature_envelope: "info",
  payment_checkout: "warning",
};

function demoItems(): CalendarItem[] {
  return upcomingEvents.map((event) => ({
    id: event.id,
    sourceType: "native_event",
    sourceId: crypto.randomUUID(),
    title: event.title,
    description: null,
    startAt: new Date(event.date).toISOString(),
    endAt: null,
    allDay: true,
    timezone: "Europe/Bucharest",
    location: event.location ?? null,
    editable: true,
    href: "/calendar",
    version: 1,
  }));
}

function EventModal({
  open,
  event,
  timezone,
  busy,
  onClose,
  onSave,
  onDelete,
  defaultDate,
}: {
  open: boolean;
  event: CalendarItem | null;
  timezone: string;
  busy: boolean;
  onClose: () => void;
  onSave: (input: CreateCalendarEvent) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  defaultDate?: string | null;
}) {
  const initial = calendarInputValues(
    event?.startAt ?? new Date().toISOString(),
    timezone,
  );
  const initialEnd = event?.endAt
    ? calendarInputValues(event.endAt, timezone)
    : initial;
  const [title, setTitle] = React.useState(event?.title ?? "");
  const [description, setDescription] = React.useState(
    event?.description ?? "",
  );
  const [date, setDate] = React.useState(event ? initial.date : defaultDate ?? initial.date);
  const [time, setTime] = React.useState(initial.time);
  const [allDay, setAllDay] = React.useState(event?.allDay ?? false);
  const [hasEnd, setHasEnd] = React.useState(Boolean(event?.endAt));
  const [endDate, setEndDate] = React.useState(initialEnd.date);
  const [endTime, setEndTime] = React.useState(initialEnd.time);
  const [location, setLocation] = React.useState(event?.location ?? "");
  const [error, setError] = React.useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "Editează evenimentul" : "Eveniment nou"}
      description="Evenimentele adăugate aici pot fi editate. Termenele preluate din plan se modifică din pagina în care au fost create."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Șterge
            </Button>
          )}
          <Button
            loading={busy}
            onClick={() => {
              if (!title.trim()) {
                setError("Titlul este obligatoriu.");
                return;
              }
              const startAt = zonedDateTimeToIso(
                date,
                allDay ? "12:00" : time,
                timezone,
              );
              const endAt = hasEnd
                ? zonedDateTimeToIso(
                    endDate,
                    allDay ? "12:00" : endTime,
                    timezone,
                  )
                : null;
              if (endAt && endAt < startAt) {
                setError("Finalul nu poate fi înainte de început.");
                return;
              }
              void onSave({
                title: title.trim(),
                description: description.trim() || undefined,
                eventType: "meeting",
                startAt,
                endAt,
                allDay,
                timezone,
                location: location.trim() || undefined,
              });
            }}
          >
            {event ? "Salvează" : "Adaugă evenimentul"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Titlu"
          required
          error={!title.trim() ? error : undefined}
          className="sm:col-span-2"
        >
          <Input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError("");
            }}
          />
        </Field>
        <Field label="Descriere" className="sm:col-span-2">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Data">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="flex min-h-11 items-center">
          <Checkbox
            checked={allDay}
            onCheckedChange={setAllDay}
            label="Fără oră exactă"
          />
        </div>
        {!allDay && (
          <Field label="Ora">
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
        )}
        <div className="flex min-h-11 items-center sm:col-span-2">
          <Checkbox
            checked={hasEnd}
            onCheckedChange={(checked) => {
              setHasEnd(checked);
              if (checked && endDate < date) setEndDate(date);
            }}
            label="Are și o dată de final"
          />
        </div>
        {hasEnd && (
          <>
            <Field label="Data de final">
              <Input
                type="date"
                min={date}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
            {!allDay && (
              <Field label="Ora de final">
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </Field>
            )}
          </>
        )}
        <Field label="Locație" className="sm:col-span-2">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        {error && title.trim() && (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [items, setItems] = React.useState<CalendarItem[]>([]);
  const [view, setView] = React.useState<CalendarView>("month");
  const [cursorDate, setCursorDate] = React.useState(() =>
    initialCalendarDate(currentWorkspace?.eventDate),
  );
  const [source, setSource] = React.useState<
    CalendarItem["sourceType"] | "all"
  >("all");
  const [selected, setSelected] = React.useState<CalendarItem | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [newEventDate, setNewEventDate] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = demoMode || capabilities.includes("calendar.write");
  const timezone = bootstrap?.workspace.timezone ?? "Europe/Bucharest";

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError("");
    try {
      setItems(
        demoMode
          ? demoItems()
          : (await weddingOsApi.calendar(currentWorkspace.id)).items,
      );
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setCursorDate(initialCalendarDate(currentWorkspace?.eventDate));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentWorkspace?.id, currentWorkspace?.eventDate]);
  React.useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("create") !== "event" || !canWrite) return;
    const timer = window.setTimeout(() => {
      setSelected(null);
      setModalOpen(true);
    }, 0);
    query.delete("create");
    const suffix = query.size ? `?${query.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", suffix);
    return () => window.clearTimeout(timer);
  }, [canWrite]);
  React.useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener("weddingos:planning-changed", refresh);
    return () =>
      window.removeEventListener("weddingos:planning-changed", refresh);
  }, [load]);
  const visible = React.useMemo(
    () =>
      items
        .filter((item) => source === "all" || item.sourceType === source)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [items, source],
  );
  const periodItems = React.useMemo(
    () => itemsInCalendarPeriod(visible, view, cursorDate, timezone),
    [cursorDate, timezone, view, visible],
  );
  const nextItem = React.useMemo(
    () => nextCalendarItem(visible, timezone),
    [timezone, visible],
  );
  const projectedCount = periodItems.filter((item) => !item.editable).length;

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setError(message);
      toast({
        title: "Calendarul nu a fost actualizat",
        description: message,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };
  const openItem = (item: CalendarItem) => {
    if (!item.editable) {
      router.push(item.href);
      return;
    }
    if (!canWrite) return;
    setSelected(item);
    setModalOpen(true);
  };
  const openNewEvent = (date?: string) => {
    if (!canWrite) return;
    setSelected(null);
    setNewEventDate(date ?? null);
    setModalOpen(true);
  };
  const changePeriod = (direction: number) => {
    const next = new Date(cursorDate);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    setCursorDate(next);
  };

  if (!currentWorkspace || loading)
    return (
      <div className="mx-auto max-w-7xl">
        <div className="h-64 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Calendar"
        description="Vezi ce urmează și când. Datele din plan, plăți, furnizori și contracte se sincronizează aici automat."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void run(async () => {
                  if (demoMode) {
                    toast({
                      title: "Exportul este dezactivat în demo",
                      variant: "info",
                    });
                    return;
                  }
                  const blob = await weddingOsApi.downloadCalendar(
                    currentWorkspace.id,
                  );
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "weddingos-calendar.ics";
                  link.click();
                  URL.revokeObjectURL(url);
                  toast({
                    title: "Calendar ICS descărcat",
                    variant: "success",
                  });
                })
              }
            >
              <Download className="size-4" />
              Export ICS
            </Button>
            <Button
              size="sm"
              disabled={!canWrite}
              title={canWrite ? undefined : "Nu ai permisiunea de a adăuga evenimente"}
              onClick={() => {
                openNewEvent();
              }}
            >
              <Plus className="size-4" />
              Eveniment
            </Button>
          </>
        }
      />
      {error && (
        <ErrorState
          title="Calendarul nu este disponibil"
          description={error}
          onRetry={() => void load()}
        />
      )}
      <div className="grid gap-3 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-brand/20 bg-brand-softer/30">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">
                Următorul lucru din calendar
              </p>
              {nextItem ? (
                <>
                  <p className="mt-2 truncate font-brand text-xl font-semibold text-ink">
                    {nextItem.title}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatCalendarDateLong(nextItem.startAt, timezone)}
                    {!nextItem.allDay &&
                      ` · ${new Date(nextItem.startAt).toLocaleTimeString("ro-RO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })}`}
                    {nextItem.location ? ` · ${nextItem.location}` : ""}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Nu există încă o dată viitoare. Adaugă un eveniment sau setează termene în plan.
                </p>
              )}
            </div>
            {nextItem && (
              <Button variant="outline" size="sm" onClick={() => openItem(nextItem)}>
                {nextItem.editable ? "Vezi evenimentul" : "Deschide sursa"}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid h-full grid-cols-2 gap-4 p-5">
            <div>
              <p className="text-xs text-muted">În perioada afișată</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{periodItems.length}</p>
              <p className="text-xs text-faint">date și termene</p>
            </div>
            <div>
              <p className="text-xs text-muted">Sincronizate</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{projectedCount}</p>
              <p className="text-xs text-faint">din alte secțiuni</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<CalendarView>
          ariaLabel="Vizualizare calendar"
          value={view}
          onChange={setView}
          options={[
            { value: "month", label: "Lună" },
            { value: "week", label: "Săptămână" },
            { value: "agenda", label: "Agendă" },
          ]}
        />
        {view === "agenda" ? (
          <span className="text-sm font-semibold text-ink">Toate evenimentele</span>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursorDate(new Date())}
            >
              Astăzi
            </Button>
            <div className="flex">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Perioada anterioară"
                onClick={() => changePeriod(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Perioada următoare"
                onClick={() => changePeriod(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <span className="text-sm font-semibold capitalize text-ink">
              {calendarPeriodLabel(view, cursorDate)}
            </span>
          </>
        )}
        <span className="flex-1" />
        <Filter className="size-4 text-faint" />
        <Select
          aria-label="Filtrează calendarul după sursă"
          value={source}
          onChange={(e) => setSource(e.target.value as typeof source)}
          className="w-48"
        >
          <option value="all">Toate sursele</option>
          {Object.entries(sourceLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      </Card>
      {view === "month" ? (
        <MonthGrid
          items={periodItems}
          cursorDate={cursorDate}
          timezone={timezone}
          canWrite={canWrite}
          onOpen={openItem}
          onCreate={openNewEvent}
        />
      ) : periodItems.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nu există nimic în perioada aceasta"
          description="Schimbă perioada sau adaugă un eveniment. Termenele din Plan, Buget și Furnizori apar automat când le setezi acolo."
          action={canWrite ? { label: "Adaugă eveniment", onClick: () => openNewEvent() } : undefined}
        />
      ) : (
        <Agenda
          items={periodItems}
          timezone={timezone}
          onOpen={openItem}
        />
      )}
      <EventModal
        key={`${selected?.id ?? "new"}-${modalOpen}`}
        open={modalOpen}
        event={selected}
        defaultDate={newEventDate}
        timezone={timezone}
        busy={busy}
        onClose={() => setModalOpen(false)}
        onSave={async (input) =>
          run(async () => {
            if (demoMode) {
              const created: CalendarItem = {
                id: selected?.id ?? `demo-${Date.now()}`,
                sourceId: selected?.sourceId ?? crypto.randomUUID(),
                sourceType: "native_event",
                title: input.title,
                description: input.description ?? null,
                startAt: input.startAt,
                endAt: input.endAt ?? null,
                allDay: input.allDay,
                timezone: input.timezone,
                location: input.location ?? null,
                editable: true,
                href: "/calendar",
                version: (selected?.version ?? 0) + 1,
              };
              setItems((current) =>
                selected
                  ? current.map((item) =>
                      item.id === selected.id ? created : item,
                    )
                  : [...current, created],
              );
            } else if (selected)
              await weddingOsApi.updateCalendarEvent(
                currentWorkspace.id,
                selected.sourceId,
                selected.version ?? 1,
                input,
              );
            else
              await weddingOsApi.createCalendarEvent(
                currentWorkspace.id,
                input,
              );
            setModalOpen(false);
            if (!demoMode) await load();
            toast({
              title: selected ? "Eveniment actualizat" : "Eveniment creat",
              variant: "success",
            });
          })
        }
        onDelete={
          selected
            ? async () => setDeleteOpen(true)
            : null
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Ștergi evenimentul?"
        description={`„${selected?.title ?? "Acest eveniment"}” va fi eliminat din calendar.`}
        confirmLabel="Șterge evenimentul"
        destructive
        loading={busy}
        onConfirm={() => void run(async () => {
          if (!selected) return;
          if (demoMode) setItems((current) => current.filter((item) => item.id !== selected.id));
          else await weddingOsApi.deleteCalendarEvent(currentWorkspace.id, selected.sourceId, selected.version ?? 1);
          setDeleteOpen(false);
          setModalOpen(false);
          if (!demoMode) await load();
          toast({ title: "Eveniment șters", variant: "success" });
        })}
      />
    </div>
  );
}

function MonthGrid({
  items,
  cursorDate,
  timezone,
  onOpen,
  onCreate,
  canWrite,
}: {
  items: CalendarItem[];
  cursorDate: Date;
  timezone: string;
  onOpen: (item: CalendarItem) => void;
  onCreate: (dayKey: string) => void;
  canWrite: boolean;
}) {
  const cells = React.useMemo(() => calendarMonthCells(cursorDate), [cursorDate]);
  const todayKey = calendarDayKey(new Date(), timezone);
  const firstMonthDay = cells.find((cell) => cell.inMonth)?.dayKey ?? cells[0]!.dayKey;
  const [selectedDay, setSelectedDay] = React.useState(() =>
    cells.some((cell) => cell.dayKey === todayKey && cell.inMonth)
      ? todayKey
      : firstMonthDay,
  );
  const activeSelectedDay = cells.some(
    (cell) => cell.dayKey === selectedDay && cell.inMonth,
  )
    ? selectedDay
    : cells.some((cell) => cell.dayKey === todayKey && cell.inMonth)
      ? todayKey
      : firstMonthDay;
  const itemsByDay = React.useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of items) {
      const key = calendarDayKey(item.startAt, timezone);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [items, timezone]);
  const selectedItems = itemsByDay.get(activeSelectedDay) ?? [];
  const selectedDateLabel = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${activeSelectedDay}T12:00:00`));
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-subtle/60">
          {["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"].map((day) => (
            <div
              key={day}
              className="px-0.5 py-2 text-center text-[10px] font-semibold text-faint sm:px-2 sm:text-xs"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayItems = itemsByDay.get(cell.dayKey) ?? [];
            const isSelected = activeSelectedDay === cell.dayKey;
            return (
              <div
                key={cell.dayKey}
                className={cn(
                  "min-h-16 border-b border-r border-line p-0.5 sm:min-h-28 sm:p-1.5",
                  !cell.inMonth && "bg-subtle/40",
                  isSelected && "bg-brand-softer/50",
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedDay(cell.dayKey)}
                  aria-label={`${cell.dayNumber} ${cell.date.toLocaleDateString("ro-RO", { month: "long" })}, ${dayItems.length} elemente`}
                  aria-pressed={isSelected}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-full text-xs font-medium text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:size-7",
                    !cell.inMonth && "text-faint",
                    cell.dayKey === todayKey && "bg-action text-on-action",
                    isSelected && cell.dayKey !== todayKey && "bg-brand-soft text-brand-strong",
                  )}
                >
                  {cell.dayNumber}
                </button>
                <div className="mt-0.5 flex min-h-3 items-center justify-center gap-0.5 sm:hidden" aria-hidden>
                  {dayItems.slice(0, 3).map((item) => (
                    <span key={item.id} className="size-1.5 rounded-full bg-brand" />
                  ))}
                  {dayItems.length > 3 && <span className="text-[9px] font-semibold text-brand-strong">+{dayItems.length - 3}</span>}
                </div>
                <div className="mt-1 hidden space-y-1 sm:block">
                  {dayItems.slice(0, 2).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onOpen(item)}
                      className="block min-h-8 w-full truncate rounded-lg bg-brand-soft px-2 py-1 text-left text-[11px] font-medium text-brand-strong transition-colors hover:bg-brand-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {item.title}
                    </button>
                  ))}
                  {dayItems.length > 2 && (
                    <span className="block px-2 text-xs font-semibold text-brand-strong">
                      +{dayItems.length - 2} mai multe
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">Ziua selectată</p>
              <h2 className="mt-1 font-brand text-lg font-semibold capitalize text-ink">{selectedDateLabel}</h2>
            </div>
            {canWrite && (
              <Button size="sm" variant="outline" onClick={() => onCreate(activeSelectedDay)}>
                <Plus className="size-4" />
                Adaugă în această zi
              </Button>
            )}
          </div>
          {selectedItems.length ? (
            <div className="mt-4">
              <Agenda items={selectedItems} timezone={timezone} onOpen={onOpen} />
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-subtle px-4 py-3 text-sm text-muted">
              Nu ai nimic programat în această zi. Selectează altă zi sau adaugă primul eveniment.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Agenda({
  items,
  timezone,
  onOpen,
}: {
  items: CalendarItem[];
  timezone: string;
  onOpen: (item: CalendarItem) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item)}
          className="flex min-h-11 w-full flex-col items-start gap-2 rounded-xl border border-line bg-elevated p-4 text-left transition-colors hover:border-brand/40 sm:flex-row sm:gap-4"
        >
          <div className="shrink-0 sm:w-28">
            <p className="text-sm font-semibold text-ink">
              {formatCalendarDateLong(item.startAt, timezone)}
            </p>
            <p className="text-xs text-faint">
              {item.allDay ? "Toată ziua" : new Date(item.startAt).toLocaleTimeString("ro-RO", {
                timeZone: timezone,
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{item.title}</p>
              <Badge variant={sourceTones[item.sourceType]}>
                {sourceLabels[item.sourceType]}
              </Badge>
              {!item.editable && <Badge variant="outline">Proiecție</Badge>}
            </div>
            {item.description && (
              <p className="mt-1 text-sm text-muted">{item.description}</p>
            )}
            {item.location && (
              <p className="mt-1 flex items-center gap-1 text-xs text-faint">
                <MapPin className="size-3" />
                {item.location}
              </p>
            )}
            {!item.editable && (
              <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-strong">
                <CheckCircle2 className="size-3.5" />
                Sincronizat · deschide pentru a modifica la sursă
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
