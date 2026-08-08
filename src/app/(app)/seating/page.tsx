"use client";

import * as React from "react";
import {
  Armchair,
  Download,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  TriangleAlert,
  Unlock,
} from "lucide-react";
import {
  apiErrorMessage,
  type OperationResource,
  type SeatingPlanResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@/components/ui";

type WeddingEventOption = { id: string; title: string };

export default function SeatingPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [plans, setPlans] = React.useState<OperationResource[]>([]);
  const [plan, setPlan] = React.useState<SeatingPlanResource | null>(null);
  const [spaces, setSpaces] = React.useState<OperationResource[]>([]);
  const [events, setEvents] = React.useState<WeddingEventOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [tableOpen, setTableOpen] = React.useState(false);
  const [planName, setPlanName] = React.useState("Plan principal");
  const [eventId, setEventId] = React.useState("");
  const [spaceId, setSpaceId] = React.useState("");
  const [tableName, setTableName] = React.useState("");
  const [capacity, setCapacity] = React.useState("8");
  const [selectedTableId, setSelectedTableId] = React.useState<string | null>(null);
  const [draggedGuestId, setDraggedGuestId] = React.useState<string | null>(null);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("seating.write");
  const canAssign = capabilities.includes("seating.assign");
  const canPublish = capabilities.includes("seating.publish");
  const canSuggest = capabilities.includes("seating.generate_suggestion");

  const loadPlan = React.useCallback(
    async (planId: string) => {
      if (!currentWorkspace) return;
      const detail = await weddingOsApi.seatingPlan(currentWorkspace.id, planId);
      setPlan(detail);
      setSelectedTableId((current) => current ?? detail.tables[0]?.id ?? null);
    },
    [currentWorkspace],
  );

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    setLoading(true);
    setError(null);
    try {
      const [planList, venueList, calendar] = await Promise.all([
        weddingOsApi.seatingPlans(currentWorkspace.id),
        weddingOsApi.venueSpaces(currentWorkspace.id),
        weddingOsApi.calendar(currentWorkspace.id),
      ]);
      setPlans(planList.items);
      setSpaces(venueList.items);
      const weddingEvents = calendar.items
        .filter((item) => item.sourceType === "wedding_event")
        .map((item) => ({ id: item.sourceId, title: item.title }));
      setEvents(weddingEvents);
      setEventId((current) => current || weddingEvents[0]?.id || "");
      setSpaceId((current) => current || String(venueList.items[0]?.id ?? ""));
      if (planList.items[0]) await loadPlan(planList.items[0].id);
      else setPlan(null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode, loadPlan]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const createPlan = async () => {
    if (!currentWorkspace || !eventId) return;
    setSaving(true);
    try {
      let venueId = spaceId;
      if (!venueId) {
        const venue = await weddingOsApi.createVenueSpace(currentWorkspace.id, {
          weddingEventId: eventId,
          name: "Sala principală",
          widthUnits: 100,
          heightUnits: 70,
          unit: "arbitrary_grid",
        });
        venueId = venue.id;
      }
      const created = await weddingOsApi.createSeatingPlan(currentWorkspace.id, {
        weddingEventId: eventId,
        venueSpaceId: venueId,
        name: planName,
      });
      setPlanOpen(false);
      await load();
      await loadPlan(created.id);
      toast({ title: "Planul de mese a fost creat", variant: "success" });
    } catch (cause) {
      toast({ title: "Planul nu a putut fi creat", description: apiErrorMessage(cause), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const createTable = async () => {
    if (!currentWorkspace || !plan) return;
    setSaving(true);
    try {
      const index = plan.tables.length;
      await weddingOsApi.createSeatingTable(currentWorkspace.id, plan.id, {
        name: tableName || `Masa ${index + 1}`,
        label: tableName || `M${index + 1}`,
        shape: "round",
        capacity: Number(capacity),
        x: 90 + (index % 4) * 190,
        y: 100 + Math.floor(index / 4) * 160,
        width: 120,
        height: 90,
        rotation: 0,
        position: index,
        locked: false,
      });
      setTableOpen(false);
      setTableName("");
      await loadPlan(plan.id);
      toast({ title: "Masa a fost adăugată", variant: "success" });
    } catch (cause) {
      toast({ title: "Masa nu a putut fi adăugată", description: apiErrorMessage(cause), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const assign = async (guestId: string, tableId: string) => {
    if (!currentWorkspace || !plan || !canAssign) return;
    const previous = plan;
    setPlan({
      ...plan,
      assignments: [
        ...plan.assignments.filter((item) => item.guestId !== guestId),
        {
          id: `optimistic-${guestId}`,
          version: 1,
          guestId,
          seatingTableId: tableId,
          seatingSeatId: null,
        },
      ],
    });
    try {
      const next = await weddingOsApi.replaceSeatingAssignments(
        currentWorkspace.id,
        plan.id,
        plan.version,
        {
          assignments: [{ guestId, tableId, source: "manual", locked: false }],
          removeAssignmentIds: [],
          confirmWarnings: true,
        },
      );
      setPlan(next);
    } catch (cause) {
      setPlan(previous);
      toast({ title: "Alocarea a fost anulată", description: apiErrorMessage(cause), variant: "error" });
    }
  };

  const toggleLock = async (table: SeatingPlanResource["tables"][number]) => {
    if (!currentWorkspace || !plan) return;
    try {
      await weddingOsApi.updateSeatingTable(currentWorkspace.id, plan.id, table.id, table.version, { locked: !table.locked });
      await loadPlan(plan.id);
    } catch (cause) {
      toast({ title: "Masa nu a putut fi actualizată", description: apiErrorMessage(cause), variant: "error" });
    }
  };

  const requestSuggestion = async () => {
    if (!currentWorkspace || !plan) return;
    try {
      const result = await weddingOsApi.requestSeatingSuggestion(currentWorkspace.id, plan.id, plan.version);
      toast({ title: "Propunerea este în curs de generare", description: `Job ${result.job.id.slice(0, 8)} a fost pus în coadă.`, variant: "info" });
    } catch (cause) {
      toast({ title: "Propunerea nu a pornit", description: apiErrorMessage(cause), variant: "error" });
    }
  };

  const publish = async () => {
    if (!currentWorkspace || !plan) return;
    try {
      const next = await weddingOsApi.publishSeatingPlan(currentWorkspace.id, plan.id, plan.version);
      setPlan(next.plan);
      toast({ title: "Plan publicat pentru invitații alocați", variant: "success" });
    } catch (cause) {
      toast({ title: "Planul nu a fost publicat", description: apiErrorMessage(cause), variant: "error" });
    }
  };

  const exportPlan = async () => {
    if (!currentWorkspace || !plan) return;
    try {
      const result = await weddingOsApi.createSeatingExport(currentWorkspace.id, plan.id, {
        format: "svg",
        kind: "visual_plan",
        includeSensitive: false,
      });
      toast({ title: "Exportul SVG este în curs", description: `Job ${result.job.id.slice(0, 8)} va produce un artefact securizat.`, variant: "info" });
    } catch (cause) {
      toast({ title: "Exportul nu a pornit", description: apiErrorMessage(cause), variant: "error" });
    }
  };

  if (demoMode)
    return <EmptyState icon={Armchair} title="Seating este izolat în demo" description="Ieși din modul demo pentru a lucra cu planurile persistente." />;
  if (loading)
    return <div className="py-24 text-center text-sm text-muted">Se încarcă planul de mese…</div>;
  if (error)
    return <EmptyState icon={TriangleAlert} title="Planul de mese nu este disponibil" description={error} action={{ label: "Reîncearcă", onClick: () => void load() }} />;

  if (!plan)
    return (<>
      <EmptyState
        icon={Armchair}
        title="Nu există încă un plan de mese"
        description="Creează spațiul și primul draft. Invitații vor vedea locurile numai după publicare."
        action={canWrite && events.length ? { label: "Creează plan", onClick: () => setPlanOpen(true), icon: <Plus className="size-4" /> } : undefined}
      />
      <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} events={events} spaces={spaces} eventId={eventId} setEventId={setEventId} spaceId={spaceId} setSpaceId={setSpaceId} planName={planName} setPlanName={setPlanName} save={createPlan} saving={saving} />
    </>);

  const assignmentByGuest = new Map(plan.assignments.map((item) => [item.guestId, item]));
  const unseated = plan.guests.filter((guest) => guest.eligible && !assignmentByGuest.has(guest.id));
  const eligibleCount = plan.guests.filter((guest) => guest.eligible).length;
  const selectedTable = plan.tables.find((table) => table.id === selectedTableId) ?? null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-4" data-testid="seating-page">
      <PageHeader
        title="Plan de mese"
        description={`${eligibleCount - unseated.length} din ${eligibleCount} invitați confirmați au loc la masă.`}
        actions={
          <>
            {plans.length > 1 && <Select value={plan.id} onChange={(event) => void loadPlan(event.target.value)}>{plans.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</Select>}
            <Badge variant={plan.status === "published" ? "success" : "warning"}>{plan.status === "published" ? "Publicat" : "Draft"}</Badge>
            <Button variant="outline" size="sm" onClick={() => void loadPlan(plan.id)}><RefreshCw className="size-3.5" /> Reîncarcă</Button>
            <Button variant="secondary" size="sm" onClick={requestSuggestion} disabled={!canSuggest}><Sparkles className="size-3.5 text-accent" /> Propunere</Button>
            <Button variant="outline" size="sm" onClick={exportPlan}><Download className="size-3.5" /> SVG</Button>
            <Button size="sm" onClick={publish} disabled={!canPublish || plan.status === "published"}><Save className="size-3.5" /> Publică</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[290px_1fr_290px]">
        <Card className="order-2 xl:order-1">
          <Tabs defaultValue="unseated">
            <div className="border-b border-line px-3 pt-3"><TabsList className="w-full"><TabsTrigger value="unseated" badge={<Badge variant="warning">{unseated.length}</Badge>}>Neașezați</TabsTrigger><TabsTrigger value="issues" badge={<Badge variant={plan.issues.length ? "danger" : "success"}>{plan.issues.length}</Badge>}>Probleme</TabsTrigger></TabsList></div>
            <TabsContent value="unseated" className="max-h-[640px] overflow-y-auto p-2">
              {unseated.length === 0 ? <p className="px-3 py-10 text-center text-sm text-muted">Toți invitații confirmați sunt alocați.</p> : <ul className="space-y-1">{unseated.map((guest) => <li key={guest.id}><button draggable={canAssign} onDragStart={() => setDraggedGuestId(guest.id)} onClick={() => selectedTableId && void assign(guest.id, selectedTableId)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-subtle"><Avatar name={`${guest.firstName} ${guest.lastName}`} size="sm"/><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium text-ink">{guest.firstName} {guest.lastName}</span><span className="text-[11px] text-faint">Trage pe o masă sau selectează masa</span></span><Plus className="size-4 text-faint"/></button></li>)}</ul>}
            </TabsContent>
            <TabsContent value="issues" className="max-h-[640px] overflow-y-auto p-2">
              {plan.issues.length === 0 ? <p className="px-3 py-10 text-center text-sm text-muted">Nu există probleme deschise.</p> : plan.issues.map((issue) => <div key={issue.id} className="mb-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3"><p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><TriangleAlert className="size-3.5 text-warning" /> {String(issue.type).replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{String(issue.detailsRedacted ?? "Necesită verificare manuală.")}</p></div>)}
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="order-1 overflow-hidden xl:order-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><div><p className="text-sm font-semibold text-ink">{plan.name}</p><p className="text-xs text-faint">Layout persistent · modificările de alocare sunt salvate imediat</p></div><Button size="sm" onClick={() => setTableOpen(true)} disabled={!canWrite}><Plus className="size-3.5" /> Masă</Button></div>
          <div className="relative min-h-[640px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,var(--color-line)_1px,transparent_0)] bg-[size:24px_24px] p-8" data-testid="seating-canvas">
            {plan.tables.length === 0 ? <div className="absolute inset-0 grid place-items-center"><EmptyState icon={Armchair} title="Adaugă prima masă" description="Definește capacitatea, apoi alocă invitații confirmați." action={canWrite ? { label: "Adaugă masă", onClick: () => setTableOpen(true), icon: <Plus className="size-4" /> } : undefined} /></div> : plan.tables.map((table) => {
              const guests = plan.guests.filter((guest) => assignmentByGuest.get(guest.id)?.seatingTableId === table.id);
              return <button key={table.id} onClick={() => setSelectedTableId(table.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedGuestId) void assign(draggedGuestId, table.id); setDraggedGuestId(null); }} className={`absolute rounded-[28px] border-2 bg-surface p-3 text-center shadow-sm transition ${selectedTableId === table.id ? "border-brand ring-4 ring-brand/10" : "border-line hover:border-brand/50"}`} style={{ left: `${Math.max(3, Math.min(82, Number(table.x) / 10))}%`, top: `${Math.max(5, Math.min(78, Number(table.y) / 8))}%`, width: 140, minHeight: 94 }} data-testid={`seating-table-${table.id}`}><span className="block text-sm font-semibold text-ink">{table.label}</span><span className="text-xs text-faint">{guests.length}/{table.capacity} locuri</span><span className="mt-2 block truncate text-[10px] text-muted">{guests.map((guest) => guest.firstName).join(", ") || "Masă liberă"}</span>{table.locked && <Lock className="absolute right-2 top-2 size-3.5 text-warning" />}</button>;
            })}
          </div>
        </Card>

        <Card className="order-3">
          <CardContent className="p-4">
            {selectedTable ? <><div className="flex items-start justify-between"><div><p className="font-semibold text-ink">{selectedTable.name}</p><p className="text-xs text-faint">{selectedTable.assigned}/{selectedTable.capacity} locuri</p></div><Button size="icon" variant="ghost" onClick={() => void toggleLock(selectedTable)} disabled={!canWrite}>{selectedTable.locked ? <Unlock className="size-4" /> : <Lock className="size-4" />}</Button></div><div className="mt-4 space-y-2">{plan.guests.filter((guest) => assignmentByGuest.get(guest.id)?.seatingTableId === selectedTable.id).map((guest) => <div key={guest.id} className="flex items-center gap-2 rounded-lg bg-subtle px-2.5 py-2"><Avatar name={`${guest.firstName} ${guest.lastName}`} size="sm"/><span className="min-w-0 flex-1 truncate text-sm text-ink">{guest.firstName} {guest.lastName}</span></div>)}{selectedTable.assigned === 0 && <p className="py-8 text-center text-xs text-muted">Trage aici invitații neașezați.</p>}</div></> : <p className="py-12 text-center text-sm text-muted">Selectează o masă.</p>}
          </CardContent>
        </Card>
      </div>

      <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} events={events} spaces={spaces} eventId={eventId} setEventId={setEventId} spaceId={spaceId} setSpaceId={setSpaceId} planName={planName} setPlanName={setPlanName} save={createPlan} saving={saving} />
      <Modal open={tableOpen} onClose={() => setTableOpen(false)} title="Masă nouă" footer={<><Button variant="ghost" onClick={() => setTableOpen(false)}>Renunță</Button><Button onClick={createTable} disabled={saving}>{saving ? "Se salvează…" : "Adaugă masa"}</Button></>}><div className="grid grid-cols-2 gap-4"><Field label="Nume / etichetă" className="col-span-2"><Input value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="Masa mirilor" /></Field><Field label="Capacitate"><Input type="number" min="1" max="100" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></Field><Field label="Formă"><Select disabled><option>Rotundă</option></Select></Field></div></Modal>
    </div>
  );
}

function PlanModal(props: {
  open: boolean;
  onClose: () => void;
  events: WeddingEventOption[];
  spaces: OperationResource[];
  eventId: string;
  setEventId: (value: string) => void;
  spaceId: string;
  setSpaceId: (value: string) => void;
  planName: string;
  setPlanName: (value: string) => void;
  save: () => void;
  saving: boolean;
}) {
  return <Modal open={props.open} onClose={props.onClose} title="Plan de mese nou" footer={<><Button variant="ghost" onClick={props.onClose}>Renunță</Button><Button onClick={props.save} disabled={props.saving || !props.eventId}>{props.saving ? "Se creează…" : "Creează planul"}</Button></>}><div className="space-y-4"><Field label="Numele planului"><Input value={props.planName} onChange={(event) => props.setPlanName(event.target.value)} /></Field><Field label="Eveniment"><Select value={props.eventId} onChange={(event) => props.setEventId(event.target.value)}>{props.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</Select></Field><Field label="Spațiu"><Select value={props.spaceId} onChange={(event) => props.setSpaceId(event.target.value)}><option value="">Creează automat sala principală</option>{props.spaces.filter((space) => !props.eventId || space.weddingEventId === props.eventId).map((space) => <option key={space.id} value={space.id}>{String(space.name)}</option>)}</Select></Field></div></Modal>;
}
