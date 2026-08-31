"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Download,
  ImageIcon,
  ListChecks,
  MapPin,
  Pause,
  Play,
  Plus,
  Radio,
  Siren,
  Users,
} from "lucide-react";
import {
  apiErrorMessage,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  OfflineBanner,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";

type RunItem = OperationResource & {
  title: string;
  type: string;
  status: string;
  priority: string;
  plannedStartAt: string;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  locationName: string | null;
  isCritical: boolean;
};

type Incident = OperationResource & {
  title: string;
  type: string;
  severity: string;
  status: string;
  descriptionPrivate?: string;
  restricted?: boolean;
  startedAt: string;
};

type CommandCenter = {
  plan: null | {
    id: string;
    version: number;
    status: string;
    eventId: string;
    title: string;
    timezone: string;
  };
  availableEvents: Array<{
    id: string;
    title: string;
    startAt: string | null;
    endAt: string | null;
    locationName: string | null;
  }>;
  now: {
    serverTime: string;
    currentItems: RunItem[];
    nextItems: RunItem[];
    delayedItems: RunItem[];
    blockedItems: RunItem[];
  };
  attendance: {
    expectedGuests: number;
    checkedInGuests: number;
    checkedOutGuests: number;
    notArrivedGuests: number;
    deniedGuests: number;
    householdsArrived: number;
  };
  operations: {
    openChecklistItems: number;
    blockedChecklistItems: number;
    openIncidents: number;
    criticalIncidents: number;
    unresolvedDecisions: number;
  };
  announcements: {
    active: number;
    scheduled: number;
    failedDeliveries: number;
  };
  media: {
    pendingReview: number;
    approved: number;
    published: number;
    rejected: number;
  };
  checkInSession?: { id: string; status: string; version: number } | null;
};

const tabs = [
  { value: "now", label: "Acum" },
  { value: "timeline", label: "Run of Show" },
  { value: "attendance", label: "Check-in" },
  { value: "checklists", label: "Checklist-uri" },
  { value: "incidents", label: "Incidente" },
  { value: "media", label: "Momente" },
];

const eventNames = [
  "wedding_day.plan_live.v1",
  "wedding_day.plan_paused.v1",
  "wedding_day.item_started.v1",
  "wedding_day.item_delayed.v1",
  "wedding_day.item_blocked.v1",
  "wedding_day.item_completed.v1",
  "wedding_day.incident_created.v1",
  "wedding_day.incident_resolved.v1",
  "check_in.guest_checked_in.v1",
  "check_in.guest_checked_out.v1",
  "wedding_day.announcement_published.v1",
];

export default function EventDayPage() {
  const {
    currentWorkspace,
    demoMode,
    loading: workspaceLoading,
  } = useWorkspace();
  const { toast } = useToast();
  const [data, setData] = React.useState<CommandCenter | null>(null);
  const [timeline, setTimeline] = React.useState<RunItem[]>([]);
  const [incidents, setIncidents] = React.useState<Incident[]>([]);
  const [checklists, setChecklists] = React.useState<OperationResource[]>([]);
  const [tab, setTab] = React.useState("now");
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");
  const [streamConnected, setStreamConnected] = React.useState(false);
  const [clock, setClock] = React.useState("");
  const [createPlanOpen, setCreatePlanOpen] = React.useState(false);
  const [incidentOpen, setIncidentOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportType, setExportType] = React.useState("RUN_SHEET");
  const [exportFormat, setExportFormat] = React.useState("csv");
  const [incidentForm, setIncidentForm] = React.useState({
    type: "SCHEDULE",
    severity: "MEDIUM",
    title: "",
    descriptionPrivate: "",
  });

  const load = React.useCallback(
    async (quiet = false) => {
      if (!currentWorkspace || demoMode) {
        setLoading(false);
        return;
      }
      if (!quiet) setLoading(true);
      try {
        const center = (await weddingOsApi.eventDayCommandCenter(
          currentWorkspace.id,
        )) as CommandCenter;
        setData(center);
        if (center.plan) {
          const [run, incidentList, checklistList] = await Promise.all([
            weddingOsApi.eventDayRunOfShow(
              currentWorkspace.id,
              center.plan.id,
            ),
            weddingOsApi.eventDayIncidents(
              currentWorkspace.id,
              center.plan.id,
            ),
            weddingOsApi.eventDayChecklists(
              currentWorkspace.id,
              center.plan.id,
            ),
          ]);
          setTimeline(run.items as RunItem[]);
          setIncidents(incidentList.items as Incident[]);
          setChecklists(checklistList.items);
        } else {
          setTimeline([]);
          setIncidents([]);
          setChecklists([]);
        }
        setError("");
      } catch (caught) {
        setError(apiErrorMessage(caught));
      } finally {
        setLoading(false);
      }
    },
    [currentWorkspace, demoMode],
  );

  React.useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  React.useEffect(() => {
    const update = () =>
      setClock(
        new Intl.DateTimeFormat("ro-RO", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date()),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const livePlanId = data?.plan?.id;
  React.useEffect(() => {
    if (!currentWorkspace || demoMode || !livePlanId) return;
    const stream = new EventSource(
      `/api/v1/workspaces/${encodeURIComponent(currentWorkspace.id)}/event-day/live`,
      { withCredentials: true },
    );
    const refresh = () => void load(true);
    stream.onopen = () => setStreamConnected(true);
    stream.onerror = () => setStreamConnected(false);
    for (const eventName of eventNames)
      stream.addEventListener(eventName, refresh);
    return () => {
      for (const eventName of eventNames)
        stream.removeEventListener(eventName, refresh);
      stream.close();
    };
  }, [currentWorkspace, demoMode, livePlanId, load]);

  const transitionPlan = async (
    action: "publish" | "go-live" | "pause" | "complete",
  ) => {
    if (!currentWorkspace || !data?.plan) return;
    setWorking(true);
    try {
      await weddingOsApi.transitionEventDayPlan(
        currentWorkspace.id,
        data.plan.id,
        data.plan.version,
        action,
      );
      await load(true);
      toast({
        title: "Starea planului a fost actualizată",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Actualizarea nu a reușit",
        description: apiErrorMessage(caught),
        variant: "error",
      });
      await load(true);
    } finally {
      setWorking(false);
    }
  };

  const transitionItem = async (
    item: RunItem,
    transition: "START" | "COMPLETE" | "MARK_DELAYED" | "UNBLOCK",
  ) => {
    if (!currentWorkspace) return;
    setWorking(true);
    try {
      await weddingOsApi.transitionRunOfShowItem(
        currentWorkspace.id,
        item.id,
        item.version,
        transition,
        transition === "MARK_DELAYED"
          ? "Întârziere raportată din Command Center"
          : undefined,
        transition === "MARK_DELAYED" ? 10 : undefined,
      );
      await load(true);
      toast({ title: "Run of Show actualizat", variant: "success" });
    } catch (caught) {
      toast({
        title: "Tranziția nu a reușit",
        description: apiErrorMessage(caught),
        variant: "error",
      });
      await load(true);
    } finally {
      setWorking(false);
    }
  };

  const createIncident = async () => {
    if (
      !currentWorkspace ||
      !data?.plan ||
      !incidentForm.title ||
      !incidentForm.descriptionPrivate
    )
      return;
    setWorking(true);
    try {
      await weddingOsApi.createEventDayIncident(
        currentWorkspace.id,
        data.plan.id,
        incidentForm,
      );
      setIncidentOpen(false);
      setIncidentForm({
        type: "SCHEDULE",
        severity: "MEDIUM",
        title: "",
        descriptionPrivate: "",
      });
      setTab("incidents");
      await load(true);
      toast({
        title: "Incident raportat",
        description:
          "A fost înregistrat în fluxul operațional și în Activity Feed.",
        variant: "warning",
      });
    } catch (caught) {
      toast({
        title: "Incidentul nu a fost salvat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setWorking(false);
    }
  };

  const exportEventDay = async () => {
    if (!currentWorkspace || !data?.plan || demoMode) return;
    setExporting(true);
    try {
      const needsSession = ["CHECK_IN_MANIFEST", "ATTENDANCE"].includes(
        exportType,
      );
      if (needsSession && !data.checkInSession)
        throw new Error("Creează mai întâi o sesiune de check-in.");
      const requested = await weddingOsApi.eventDayExport(
        currentWorkspace.id,
        {
          type: exportType,
          format: exportFormat,
          planId: needsSession ? null : data.plan.id,
          sessionId: needsSession ? data.checkInSession?.id : null,
        },
      );
      let job = requested.job;
      for (
        let attempt = 0;
        attempt < 80 &&
        !["completed", "failed", "dead_letter"].includes(job.status);
        attempt += 1
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        job = await weddingOsApi.job(job.id);
      }
      if (job.status !== "completed")
        throw new Error(job.error?.message ?? "Exportul nu a fost finalizat.");
      const blob = await weddingOsApi.downloadJobArtifact(job.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `weddingos-${exportType.toLowerCase().replaceAll("_", "-")}.${exportFormat}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      toast({ title: "Export operațional pregătit", variant: "success" });
    } catch (caught) {
      toast({
        title: "Exportul nu a putut fi creat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  if (workspaceLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 pb-24">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (demoMode) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 pb-24">
        <OfflineBanner className="rounded-xl" />
        <PageHeader
          title="Ziua evenimentului"
          description="Programul, echipa, check-in-ul și incidentele, coordonate într-o singură vedere."
        />
        <EmptyState
          icon={Radio}
          title="Centrul operațional este disponibil în spațiul real"
          description="Intră în cont pentru planul zilei, check-in, incidente și actualizări în timp real."
        />
      </div>
    );
  }

  if (error)
    return (
      <div className="mx-auto max-w-5xl pb-24">
        <PageHeader
          className="mb-4"
          title="Ziua evenimentului"
          description="Datele operaționale nu au putut fi încărcate."
        />
        <ErrorState description={error} onRetry={() => void load()} />
      </div>
    );

  if (!currentWorkspace || !data) return null;

  if (!data.plan) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 pb-24">
        <OfflineBanner className="rounded-xl" />
        <PageHeader
          title="Ziua evenimentului"
          description="Configurează programul operațional înainte de a porni coordonarea live."
        />
        <EmptyState
          icon={CalendarClock}
          title="Planul operațional nu este configurat"
          description="Creează programul zilei, apoi adaugă momente, liste de verificare, stații de check-in și responsabili."
          action={{
            label: "Creează planul operațional",
            onClick: () => setCreatePlanOpen(true),
            icon: <Plus className="size-4" />,
          }}
        />
        <CreatePlanModal
          open={createPlanOpen}
          onClose={() => setCreatePlanOpen(false)}
          events={data.availableEvents}
          working={working}
          onCreate={async (eventId) => {
            const event = data.availableEvents.find(
              (candidate) => candidate.id === eventId,
            );
            if (!event) return;
            setWorking(true);
            try {
              const created = await weddingOsApi.createEventDayPlan(
                currentWorkspace.id,
                {
                  weddingEventId: event.id,
                  name: `Plan operațional · ${event.title}`,
                  title: event.title,
                  timezone: "Europe/Bucharest",
                  operationalDate: (
                    event.startAt ?? new Date().toISOString()
                  ).slice(0, 10),
                  settings: {},
                },
              );
              await weddingOsApi.updateEventDayPlan(
                currentWorkspace.id,
                created.id,
                created.version,
                { title: event.title },
              );
              setCreatePlanOpen(false);
              await load(true);
              toast({ title: "Plan operațional creat", variant: "success" });
            } catch (caught) {
              toast({
                title: "Planul nu a fost creat",
                description: apiErrorMessage(caught),
                variant: "error",
              });
            } finally {
              setWorking(false);
            }
          }}
        />
      </div>
    );
  }

  const current = data.now.currentItems[0];
  const next = data.now.nextItems[0];
  const statusAction =
    data.plan.status === "READY"
      ? { label: "Publică planul", action: "publish" as const }
      : data.plan.status === "PUBLISHED"
        ? { label: "Pornește live", action: "go-live" as const }
        : data.plan.status === "LIVE"
          ? { label: "Pune pe pauză", action: "pause" as const }
          : data.plan.status === "PAUSED"
            ? { label: "Reia live", action: "go-live" as const }
            : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28">
      <OfflineBanner className="rounded-xl" />

      <div className="rounded-2xl bg-brand p-5 text-on-brand">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={data.plan.status === "LIVE" ? "success" : "warning"}
                dot
              >
                {data.plan.status}
              </Badge>
              <span className="flex items-center gap-1 text-xs text-on-brand/75">
                <CircleDot
                  className={cn("size-3", streamConnected && "text-success")}
                />
                {streamConnected
                  ? "Actualizări live conectate"
                  : "Reconectare în curs"}
              </span>
            </div>
            <h1 className="mt-2 font-brand text-3xl font-semibold tracking-tight">
              {data.plan.title}
            </h1>
            <p className="mt-1 text-sm text-on-brand/75">
              Programul, echipa și incidentele — sincronizate într-o singură
              vedere
            </p>
          </div>
          <div className="text-right">
            <p
              className="text-2xl font-semibold tabular-nums"
              aria-live="polite"
            >
              {clock || "—"}
            </p>
            {statusAction && (
              <Button
                className="mt-2"
                variant="secondary"
                size="sm"
                disabled={working}
                onClick={() => void transitionPlan(statusAction.action)}
              >
                {statusAction.action === "pause" ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
                {statusAction.label}
              </Button>
            )}
            <Button
              className="mt-2 ml-2"
              variant="secondary"
              size="sm"
              disabled={working}
              onClick={() => setExportOpen(true)}
            >
              <Download className="size-4" />
              Exportă
            </Button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <HeaderMetric
            label="Prezenți"
            value={`${data.attendance.checkedInGuests}/${data.attendance.expectedGuests}`}
          />
          <HeaderMetric
            label="Incidente active"
            value={data.operations.openIncidents}
            danger={data.operations.criticalIncidents > 0}
          />
          <HeaderMetric
            label="Întârzieri"
            value={data.now.delayedItems.length}
            danger={data.now.delayedItems.length > 0}
          />
          <HeaderMetric
            label="Checklist deschis"
            value={data.operations.openChecklistItems}
          />
        </div>
      </div>

      <SegmentedControl
        ariaLabel="Secțiuni Command Center"
        value={tab}
        onChange={setTab}
        className="w-full overflow-x-auto scrollbar-none"
        options={tabs}
      />

      {tab === "now" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          {current ? (
            <RunItemCard
              item={current}
              label="ACUM"
              working={working}
              onTransition={transitionItem}
            />
          ) : next ? (
            <RunItemCard
              item={next}
              label="URMEAZĂ"
              working={working}
              onTransition={transitionItem}
            />
          ) : (
            <EmptyState
              icon={Clock3}
              title="Niciun moment activ"
              description="Adaugă momente în Run of Show sau pornește următorul element pregătit."
            />
          )}
          <div className="space-y-3">
            <StatusCard
              icon={AlertTriangle}
              title="Atenție operațională"
              rows={[
                ["Întârziate", data.now.delayedItems.length],
                ["Blocate", data.now.blockedItems.length],
                ["Incidente critice", data.operations.criticalIncidents],
                ["Livrări anunț eșuate", data.announcements.failedDeliveries],
              ]}
            />
            {next && current && (
              <Card>
                <CardContent className="p-4">
                  <Badge variant="warning" dot>
                    URMEAZĂ
                  </Badge>
                  <p className="mt-2 font-semibold text-ink">{next.title}</p>
                  <p className="mt-1 text-xs text-faint">
                    {formatTime(next.plannedStartAt)} ·{" "}
                    {next.locationName || "Locație neprecizată"}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "timeline" &&
        (timeline.length ? (
          <ol className="space-y-2">
            {timeline.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-surface p-3.5",
                  item.status === "IN_PROGRESS"
                    ? "border-brand"
                    : item.status === "DELAYED" || item.status === "BLOCKED"
                      ? "border-warning/50"
                      : "border-line",
                  item.status === "COMPLETED" && "opacity-60",
                )}
              >
                <span className="w-16 shrink-0 text-center text-sm font-semibold tabular-nums text-ink">
                  {formatTime(item.plannedStartAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-sm font-semibold text-ink",
                      item.status === "COMPLETED" && "line-through",
                    )}
                  >
                    {item.title}
                  </p>
                  <p className="truncate text-xs text-faint">
                    {item.locationName || "Locație neprecizată"}
                  </p>
                </div>
                <Badge variant={statusTone(item.status)}>
                  {statusLabel(item.status)}
                </Badge>
                {!["COMPLETED", "CANCELLED", "SKIPPED"].includes(
                  item.status,
                ) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working}
                    onClick={() =>
                      void transitionItem(
                        item,
                        item.status === "IN_PROGRESS" ||
                          item.status === "DELAYED"
                          ? "COMPLETE"
                          : item.status === "BLOCKED"
                            ? "UNBLOCK"
                            : "START",
                      )
                    }
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="Run of Show este gol"
            description="Momentele operaționale adăugate planului vor apărea aici."
          />
        ))}

      {tab === "attendance" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            icon={Users}
            label="Așteptați"
            value={data.attendance.expectedGuests}
          />
          <MetricCard
            icon={Check}
            label="Check-in"
            value={data.attendance.checkedInGuests}
            tone="success"
          />
          <MetricCard
            icon={Clock3}
            label="Nu au sosit"
            value={data.attendance.notArrivedGuests}
            tone="warning"
          />
          <MetricCard
            icon={Users}
            label="Household-uri sosite"
            value={data.attendance.householdsArrived}
          />
          <MetricCard
            icon={ChevronRight}
            label="Check-out"
            value={data.attendance.checkedOutGuests}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Scanări refuzate"
            value={data.attendance.deniedGuests}
            tone="danger"
          />
        </div>
      )}

      {tab === "checklists" &&
        (checklists.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {checklists.map((list) => {
              const items = Array.isArray(list.items)
                ? (list.items as OperationResource[])
                : [];
              return (
                <Card key={list.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink">
                        {String(list.title ?? "Checklist")}
                      </p>
                      <Badge variant="neutral">
                        {
                          items.filter((item) => item.status !== "COMPLETED")
                            .length
                        }{" "}
                        deschise
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {items.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 text-sm text-muted"
                        >
                          <span
                            className={cn(
                              "size-2 rounded-full",
                              item.status === "COMPLETED"
                                ? "bg-success"
                                : item.status === "BLOCKED"
                                  ? "bg-danger"
                                  : "bg-line-strong",
                            )}
                          />
                          <span
                            className={cn(
                              item.status === "COMPLETED" && "line-through",
                            )}
                          >
                            {String(item.title)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={ListChecks}
            title="Nu există checklist-uri"
            description="Checklist-urile operaționale persistente vor apărea aici."
          />
        ))}

      {tab === "incidents" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button onClick={() => setIncidentOpen(true)}>
              <Plus className="size-4" />
              Raportează incident
            </Button>
          </div>
          {incidents.length ? (
            incidents.map((incident) => (
              <Card key={incident.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            incident.severity === "CRITICAL"
                              ? "danger"
                              : incident.severity === "HIGH"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {incident.severity}
                        </Badge>
                        <Badge
                          variant={
                            incident.status === "RESOLVED" ||
                            incident.status === "CLOSED"
                              ? "success"
                              : "warning"
                          }
                          dot
                        >
                          {incident.status}
                        </Badge>
                      </div>
                      <p className="mt-2 font-semibold text-ink">
                        {incident.title}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {incident.restricted
                          ? "Detalii restricționate pentru rolul curent."
                          : incident.descriptionPrivate}
                      </p>
                    </div>
                    {!["RESOLVED", "CLOSED", "CANCELLED"].includes(
                      incident.status,
                    ) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={working}
                        onClick={async () => {
                          if (!currentWorkspace) return;
                          try {
                            const transition =
                              incident.status === "OPEN"
                                ? "ACKNOWLEDGE"
                                : incident.status === "ACKNOWLEDGED"
                                  ? "INVESTIGATE"
                                  : incident.status === "INVESTIGATING"
                                    ? "MITIGATE"
                                    : "RESOLVE";
                            await weddingOsApi.transitionEventDayIncident(
                              currentWorkspace.id,
                              incident.id,
                              incident.version,
                              transition,
                              transition === "RESOLVE"
                                ? "Rezolvat și confirmat din Command Center"
                                : undefined,
                            );
                            await load(true);
                          } catch (caught) {
                            toast({
                              title: "Incidentul nu a fost actualizat",
                              description: apiErrorMessage(caught),
                              variant: "error",
                            });
                          }
                        }}
                      >
                        Avansează starea
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <EmptyState
              icon={Siren}
              title="Niciun incident"
              description="Incidentele raportate vor apărea aici, fără detalii sensibile în notificări."
            />
          )}
        </div>
      )}

      {tab === "media" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={ImageIcon}
            label="În verificare"
            value={data.media.pendingReview}
            tone="warning"
          />
          <MetricCard
            icon={Check}
            label="Aprobate"
            value={data.media.approved}
            tone="success"
          />
          <MetricCard
            icon={Radio}
            label="Publicate"
            value={data.media.published}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Respinse"
            value={data.media.rejected}
            tone="danger"
          />
        </div>
      )}

      <Button
        size="lg"
        variant="destructive"
        className="fixed bottom-24 right-4 z-40 min-h-14 gap-2 rounded-full px-5 shadow-overlay lg:bottom-8"
        onClick={() => setIncidentOpen(true)}
      >
        <Siren className="size-5" />
        Raportează incident
      </Button>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export operațional"
        description="Fișierul este generat asincron într-un artifact securizat și limitat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              Renunță
            </Button>
            <Button loading={exporting} onClick={() => void exportEventDay()}>
              Generează și descarcă
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Raport" required>
            <Select
              value={exportType}
              onChange={(event) => setExportType(event.target.value)}
            >
              <option value="RUN_SHEET">Wedding Day Run Sheet</option>
              <option value="CONTACT_SHEET">Contact sheet</option>
              <option value="CHECK_IN_MANIFEST" disabled={!data.checkInSession}>
                Manifest check-in
              </option>
              <option value="ATTENDANCE" disabled={!data.checkInSession}>
                Raport prezență
              </option>
              <option value="INCIDENTS">Raport incidente</option>
            </Select>
          </Field>
          <Field label="Format" required>
            <Select
              value={exportFormat}
              onChange={(event) => setExportFormat(event.target.value)}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
            </Select>
          </Field>
          <p className="sm:col-span-2 text-xs text-muted">
            Detaliile medicale și de securitate nu sunt incluse în raportul de
            incidente.
          </p>
        </div>
      </Modal>

      <Modal
        open={incidentOpen}
        onClose={() => setIncidentOpen(false)}
        title="Raportează un incident"
        description="Raportul este salvat imediat și proiectat în fluxul operațional."
        footer={
          <>
            <Button variant="ghost" onClick={() => setIncidentOpen(false)}>
              Renunță
            </Button>
            <Button
              variant="destructive"
              disabled={
                working ||
                !incidentForm.title ||
                !incidentForm.descriptionPrivate
              }
              onClick={() => void createIncident()}
            >
              Trimite raportul
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tip" required>
              <Select
                value={incidentForm.type}
                onChange={(event) =>
                  setIncidentForm((currentForm) => ({
                    ...currentForm,
                    type: event.target.value,
                  }))
                }
              >
                <option value="SCHEDULE">Program</option>
                <option value="VENDOR">Furnizor</option>
                <option value="VENUE">Locație</option>
                <option value="GUEST">Invitat</option>
                <option value="MEDICAL">Medical</option>
                <option value="SECURITY">Securitate</option>
                <option value="TRANSPORT">Transport</option>
                <option value="WEATHER">Meteo</option>
                <option value="TECHNICAL">Tehnic</option>
                <option value="OTHER">Altul</option>
              </Select>
            </Field>
            <Field label="Severitate" required>
              <Select
                value={incidentForm.severity}
                onChange={(event) =>
                  setIncidentForm((currentForm) => ({
                    ...currentForm,
                    severity: event.target.value,
                  }))
                }
              >
                <option value="LOW">Scăzută</option>
                <option value="MEDIUM">Medie</option>
                <option value="HIGH">Ridicată</option>
                <option value="CRITICAL">Critică</option>
              </Select>
            </Field>
          </div>
          <Field label="Titlu" required>
            <Input
              value={incidentForm.title}
              maxLength={240}
              onChange={(event) =>
                setIncidentForm((currentForm) => ({
                  ...currentForm,
                  title: event.target.value,
                }))
              }
              placeholder="Ce necesită atenție?"
            />
          </Field>
          <Field label="Detalii private" required>
            <Textarea
              value={incidentForm.descriptionPrivate}
              maxLength={8000}
              onChange={(event) =>
                setIncidentForm((currentForm) => ({
                  ...currentForm,
                  descriptionPrivate: event.target.value,
                }))
              }
              placeholder="Ce s-a întâmplat, unde și cine este afectat?"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function CreatePlanModal({
  open,
  onClose,
  events,
  working,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  events: CommandCenter["availableEvents"];
  working: boolean;
  onCreate: (eventId: string) => Promise<void>;
}) {
  const [eventId, setEventId] = React.useState("");
  const selectedEventId = eventId || events[0]?.id || "";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Creează planul operațional"
      description="Planul pornește ca draft versionat. Publicarea și intrarea live sunt acțiuni explicite."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button
            disabled={!selectedEventId || working}
            onClick={() => void onCreate(selectedEventId)}
          >
            Creează planul
          </Button>
        </>
      }
    >
      <Field label="Eveniment" required>
        <Select
          value={selectedEventId}
          onChange={(event) => setEventId(event.target.value)}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
              {event.startAt
                ? ` · ${new Date(event.startAt).toLocaleDateString("ro-RO")}`
                : ""}
            </option>
          ))}
        </Select>
      </Field>
      {events.length === 0 && (
        <p className="mt-3 text-sm text-danger">
          Nu există un sub-eveniment configurat. Adaugă mai întâi data și
          evenimentul în Calendar.
        </p>
      )}
    </Modal>
  );
}

function RunItemCard({
  item,
  label,
  working,
  onTransition,
}: {
  item: RunItem;
  label: string;
  working: boolean;
  onTransition: (
    item: RunItem,
    transition: "START" | "COMPLETE" | "MARK_DELAYED" | "UNBLOCK",
  ) => Promise<void>;
}) {
  return (
    <Card className="border-brand">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge
            variant={
              item.status === "DELAYED" || item.status === "BLOCKED"
                ? "warning"
                : "brand"
            }
            dot
          >
            {label}
          </Badge>
          <span className="text-sm font-semibold tabular-nums text-ink">
            {formatTime(item.plannedStartAt)}
            {item.plannedEndAt ? ` – ${formatTime(item.plannedEndAt)}` : ""}
          </span>
        </div>
        <h2 className="mt-3 font-brand text-2xl font-semibold tracking-tight text-ink">
          {item.title}
        </h2>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-4 text-accent" />
          {item.locationName || "Locație neprecizată"}
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          {["NOT_STARTED", "READY"].includes(item.status) && (
            <Button
              size="lg"
              disabled={working}
              onClick={() => void onTransition(item, "START")}
            >
              <Play className="size-4" />
              Pornește
            </Button>
          )}
          {["IN_PROGRESS", "DELAYED", "BLOCKED"].includes(item.status) && (
            <Button
              size="lg"
              disabled={working}
              onClick={() =>
                void onTransition(
                  item,
                  item.status === "BLOCKED" ? "UNBLOCK" : "COMPLETE",
                )
              }
            >
              <Check className="size-4" />
              {item.status === "BLOCKED" ? "Deblochează" : "Finalizează"}
            </Button>
          )}
          {["READY", "IN_PROGRESS"].includes(item.status) && (
            <Button
              size="lg"
              variant="destructive-outline"
              disabled={working}
              onClick={() => void onTransition(item, "MARK_DELAYED")}
            >
              <Clock3 className="size-4" />
              Întârziere
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function HeaderMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg bg-on-brand/10 px-3 py-2">
      <p className="text-[11px] text-on-brand/65">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          danger && "text-warning-soft",
        )}
      >
        {value}
      </p>
    </div>
  );
}
function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "brand",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: "brand" | "success" | "warning" | "danger";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-xl",
            tone === "success"
              ? "bg-success-soft text-success"
              : tone === "warning"
                ? "bg-warning-soft text-warning"
                : tone === "danger"
                  ? "bg-danger-soft text-danger"
                  : "bg-brand-soft text-brand",
          )}
        >
          <Icon className="size-5" />
        </span>
        <div>
          <p className="text-xs text-faint">{label}</p>
          <p className="text-2xl font-semibold tabular-nums text-ink">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
function StatusCard({
  icon: Icon,
  title,
  rows,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  rows: Array<[string, number]>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-warning" />
          <p className="font-semibold text-ink">{title}</p>
        </div>
        <div className="mt-3 space-y-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted">{label}</span>
              <Badge variant={value > 0 ? "warning" : "success"}>{value}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function statusLabel(status: string) {
  return (
    (
      {
        NOT_STARTED: "Neînceput",
        READY: "Pregătit",
        IN_PROGRESS: "În curs",
        DELAYED: "Întârziat",
        BLOCKED: "Blocat",
        COMPLETED: "Finalizat",
        SKIPPED: "Sărit",
        CANCELLED: "Anulat",
      } as Record<string, string>
    )[status] ?? status
  );
}
function statusTone(
  status: string,
): "neutral" | "brand" | "warning" | "danger" | "success" {
  if (status === "COMPLETED") return "success";
  if (status === "DELAYED") return "warning";
  if (status === "BLOCKED" || status === "CANCELLED") return "danger";
  if (status === "IN_PROGRESS") return "brand";
  return "neutral";
}
