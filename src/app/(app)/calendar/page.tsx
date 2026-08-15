"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { CalendarItem, CreateCalendarEvent } from "@weddingos/contracts";
import {
  CalendarDays,
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
import { cn, formatDateLong } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
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

type View = "month" | "week" | "agenda";
const initialCalendarDate = (weddingDate?: string | null) =>
  weddingDate ? new Date(`${weddingDate}T12:00:00`) : new Date();
const sourceLabels: Record<CalendarItem["sourceType"], string> = {
  native_event: "Eveniment",
  task_due: "Deadline",
  task_start: "Start task",
  milestone: "Milestone",
  wedding_event: "Eveniment principal",
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
}: {
  open: boolean;
  event: CalendarItem | null;
  timezone: string;
  busy: boolean;
  onClose: () => void;
  onSave: (input: CreateCalendarEvent) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
}) {
  const initial = event?.startAt ? new Date(event.startAt) : new Date();
  const [title, setTitle] = React.useState(event?.title ?? "");
  const [description, setDescription] = React.useState(
    event?.description ?? "",
  );
  const [date, setDate] = React.useState(initial.toISOString().slice(0, 10));
  const [time, setTime] = React.useState(
    event?.allDay ? "09:00" : initial.toISOString().slice(11, 16),
  );
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
              void onSave({
                title: title.trim(),
                description: description.trim() || undefined,
                eventType: "meeting",
                startAt: new Date(`${date}T${time}:00`).toISOString(),
                endAt: null,
                allDay: false,
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
        <Field label="Titlu" required error={error} className="sm:col-span-2">
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
        <Field label="Ora">
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        <Field label="Locație" className="sm:col-span-2">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [items, setItems] = React.useState<CalendarItem[]>([]);
  const [view, setView] = React.useState<View>("month");
  const [cursorDate, setCursorDate] = React.useState(() =>
    initialCalendarDate(currentWorkspace?.weddingDate),
  );
  const [source, setSource] = React.useState<
    CalendarItem["sourceType"] | "all"
  >("all");
  const [selected, setSelected] = React.useState<CalendarItem | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

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
    setSelected(item);
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
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Calendar"
        description="Vezi într-un singur loc evenimentele nunții și termenele preluate din plan."
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
              onClick={() => {
                setSelected(null);
                setModalOpen(true);
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
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<View>
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
              {cursorDate.toLocaleDateString("ro-RO", {
                month: "long",
                year: "numeric",
              })}
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
      {visible.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nu există evenimente"
          description="Evenimentele și deadline-urile taskurilor vor apărea aici."
          action={{
            label: "Adaugă eveniment",
            onClick: () => setModalOpen(true),
          }}
        />
      ) : view === "month" ? (
        <MonthGrid items={visible} cursorDate={cursorDate} onOpen={openItem} />
      ) : (
        <Agenda
          items={visible}
          compact={view === "week"}
          anchorTime={cursorDate.getTime()}
          onOpen={openItem}
        />
      )}
      <EventModal
        key={`${selected?.id ?? "new"}-${modalOpen}`}
        open={modalOpen}
        event={selected}
        timezone={bootstrap?.workspace.timezone ?? "Europe/Chisinau"}
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
            await load();
            toast({
              title: selected ? "Eveniment actualizat" : "Eveniment creat",
              variant: "success",
            });
          })
        }
        onDelete={
          selected
            ? async () =>
                run(async () => {
                  if (demoMode)
                    setItems((current) =>
                      current.filter((item) => item.id !== selected.id),
                    );
                  else
                    await weddingOsApi.deleteCalendarEvent(
                      currentWorkspace.id,
                      selected.sourceId,
                      selected.version ?? 1,
                    );
                  setModalOpen(false);
                  await load();
                })
            : null
        }
      />
    </div>
  );
}

function MonthGrid({
  items,
  cursorDate,
  onOpen,
}: {
  items: CalendarItem[];
  cursorDate: Date;
  onOpen: (item: CalendarItem) => void;
}) {
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => index - offset + 1);
  const monthItems = items.filter((item) => {
    const date = new Date(item.startAt);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  return (
    <>
      <div className="sm:hidden">
        <p className="mb-3 text-sm leading-6 text-muted">
          Pe ecrane mici, luna este afișată ca agendă pentru a păstra datele
          lizibile și ușor de atins.
        </p>
        {monthItems.length ? (
          <Agenda
            items={monthItems}
            compact={false}
            anchorTime={cursorDate.getTime()}
            onOpen={onOpen}
          />
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Luna aceasta nu are evenimente"
            description="Adaugă un eveniment sau schimbă luna pentru a continua planificarea."
          />
        )}
      </div>
      <Card className="hidden overflow-hidden sm:block">
        <div className="grid grid-cols-7 border-b border-line bg-subtle/60">
          {["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"].map((day) => (
            <div
              key={day}
              className="px-2 py-2 text-center text-xs font-semibold text-faint"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, index) => {
            const inMonth = day >= 1 && day <= days;
            const dayItems = inMonth
              ? items.filter((item) => {
                  const date = new Date(item.startAt);
                  return (
                    date.getFullYear() === year &&
                    date.getMonth() === month &&
                    date.getDate() === day
                  );
                })
              : [];
            return (
              <div
                key={index}
                className={cn(
                  "min-h-28 border-b border-r border-line p-1.5",
                  !inMonth && "bg-subtle/30",
                )}
              >
                <span className="text-xs font-medium text-muted">
                  {inMonth ? day : ""}
                </span>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onOpen(item)}
                      className="block min-h-11 w-full truncate rounded-lg bg-brand-soft px-2 py-1 text-left text-[11px] font-medium text-brand-strong"
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function Agenda({
  items,
  compact,
  anchorTime,
  onOpen,
}: {
  items: CalendarItem[];
  compact: boolean;
  anchorTime: number;
  onOpen: (item: CalendarItem) => void;
}) {
  const filtered = compact
    ? items.filter(
        (item) =>
          Math.abs(new Date(item.startAt).getTime() - anchorTime) <=
          7 * 86_400_000,
      )
    : items;
  return (
    <div className="space-y-2">
      {filtered.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item)}
          className="flex min-h-11 w-full flex-col items-start gap-2 rounded-xl border border-line bg-elevated p-4 text-left transition-colors hover:border-brand/40 sm:flex-row sm:gap-4"
        >
          <div className="shrink-0 sm:w-28">
            <p className="text-sm font-semibold text-ink">
              {formatDateLong(item.startAt)}
            </p>
            <p className="text-xs text-faint">
              {new Date(item.startAt).toLocaleTimeString("ro-RO", {
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
          </div>
        </button>
      ))}
    </div>
  );
}
