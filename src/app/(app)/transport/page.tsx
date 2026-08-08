"use client";

import * as React from "react";
import { Bus, Download, MapPin, Plus, Send, TriangleAlert, Users } from "lucide-react";
import {
  apiErrorMessage,
  type OperationResource,
  type TransportPlanResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  StatCard,
  useToast,
} from "@/components/ui";

export default function TransportPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [plans, setPlans] = React.useState<OperationResource[]>([]);
  const [plan, setPlan] = React.useState<TransportPlanResource | null>(null);
  const [requests, setRequests] = React.useState<OperationResource[]>([]);
  const [events, setEvents] = React.useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [vehicleOpen, setVehicleOpen] = React.useState(false);
  const [routeOpen, setRouteOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [eventId, setEventId] = React.useState("");
  const [name, setName] = React.useState("Transport principal");
  const [vehicleName, setVehicleName] = React.useState("");
  const [vehicleCapacity, setVehicleCapacity] = React.useState("20");
  const [routeName, setRouteName] = React.useState("");
  const [origin, setOrigin] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [departure, setDeparture] = React.useState("");
  const [vehicleId, setVehicleId] = React.useState("");
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("transport.write");
  const canAssign = capabilities.includes("transport.assign");
  const canPublish = capabilities.includes("transport.publish");

  const loadPlan = React.useCallback(async (id: string) => {
    if (!currentWorkspace) return;
    setPlan(await weddingOsApi.transportPlan(currentWorkspace.id, id));
  }, [currentWorkspace]);

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    setLoading(true);
    try {
      const [planList, requestList, calendar] = await Promise.all([
        weddingOsApi.transportPlans(currentWorkspace.id),
        weddingOsApi.transportRequests(currentWorkspace.id),
        weddingOsApi.calendar(currentWorkspace.id),
      ]);
      setPlans(planList.items);
      setRequests(requestList.items);
      const options = calendar.items.filter((item) => item.sourceType === "wedding_event").map((item) => ({ id: item.sourceId, title: item.title }));
      setEvents(options);
      setEventId((current) => current || options[0]?.id || "");
      if (planList.items[0]) await loadPlan(planList.items[0].id);
      else setPlan(null);
      setError(null);
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

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await operation();
      await load();
      toast({ title: success, variant: "success" });
      setPlanOpen(false); setVehicleOpen(false); setRouteOpen(false);
    } catch (cause) {
      toast({ title: "Operația nu a reușit", description: apiErrorMessage(cause), variant: "error" });
    } finally { setSaving(false); }
  };

  const assignRequest = async (request: OperationResource, routeId: string) => {
    if (!currentWorkspace || !plan) return;
    await run(() => weddingOsApi.replaceTransportAssignments(currentWorkspace.id, plan.id, plan.version, {
      assignments: [{ routeId, guestId: request.guestId, requestId: request.id, seatCount: 1 }],
      removeAssignmentIds: [],
    }), "Invitatul a fost alocat pe rută");
  };

  if (demoMode) return <EmptyState icon={Bus} title="Transportul este izolat în demo" description="Ieși din demo pentru operații persistente." />;
  if (loading) return <div className="py-24 text-center text-sm text-muted">Se încarcă transportul…</div>;
  if (error) return <EmptyState icon={TriangleAlert} title="Transportul nu este disponibil" description={error} action={{ label: "Reîncearcă", onClick: () => void load() }} />;
  if (!plan) return <><EmptyState icon={Bus} title="Nu există un plan de transport" description="Cererile RSVP sunt păstrate separat. Creează un draft înainte de a aloca pasageri." action={canWrite && events.length ? { label: "Creează plan", onClick: () => setPlanOpen(true), icon: <Plus className="size-4" /> } : undefined} /><PlanModal open={planOpen} onClose={() => setPlanOpen(false)} events={events} eventId={eventId} setEventId={setEventId} name={name} setName={setName} saving={saving} save={() => run(() => weddingOsApi.createTransportPlan(currentWorkspace!.id, { weddingEventId: eventId, name }), "Planul de transport a fost creat")} /></>;

  const totalCapacity = plan.vehicles.reduce((total, vehicle) => total + Number(vehicle.capacity ?? 0), 0);
  const unassigned = requests.filter((request) => request.requested === true && request.status !== "assigned");

  return <div className="mx-auto max-w-7xl space-y-5" data-testid="transport-page">
    <PageHeader title="Transport invitați" description="Cererile RSVP, vehiculele, rutele și manifestele sunt alimentate din API." actions={<>
      {plans.length > 1 && <Select value={plan.id} onChange={(event) => void loadPlan(event.target.value)}>{plans.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</Select>}
      <Badge variant={plan.status === "published" ? "success" : "warning"}>{plan.status === "published" ? "Publicat" : "Draft"}</Badge>
      <Button variant="outline" size="sm" onClick={() => setVehicleOpen(true)} disabled={!canWrite}><Bus className="size-3.5" /> Vehicul</Button>
      <Button variant="outline" size="sm" onClick={async () => { try { const result = await weddingOsApi.createTransportManifest(currentWorkspace!.id, plan.id); toast({ title: "Manifestul se generează", description: `Job ${result.job.id.slice(0, 8)} este în coadă.`, variant: "info" }); } catch (cause) { toast({ title: "Manifestul nu a pornit", description: apiErrorMessage(cause), variant: "error" }); } }}><Download className="size-3.5" /> Manifest</Button>
      <Button size="sm" onClick={() => void run(() => weddingOsApi.publishTransportPlan(currentWorkspace!.id, plan.id, plan.version), "Planul a fost publicat")} disabled={!canPublish || plan.status === "published"}><Send className="size-3.5" /> Publică</Button>
      <Button size="sm" variant="secondary" onClick={() => setRouteOpen(true)} disabled={!canWrite || !plan.vehicles.length}><Plus className="size-4" /> Rută</Button>
    </>} />

    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="Cereri transport" value={requests.filter((item) => item.requested === true).length} icon={Users}/><StatCard label="Rute" value={plan.routes.length} icon={MapPin}/><StatCard label="Vehicule" value={plan.vehicles.length} icon={Bus}/><StatCard label="Capacitate" value={totalCapacity}/><StatCard label="Nealocați" value={unassigned.length} tone={unassigned.length ? "warning" : "default"}/></div>

    {plan.issues.length > 0 && <Card><CardContent className="flex flex-wrap gap-2 p-3">{plan.issues.map((issue) => <Badge key={issue.id} variant="warning"><TriangleAlert className="size-3" /> {String(issue.type).replaceAll("_", " ")}</Badge>)}</CardContent></Card>}

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{plan.routes.length ? plan.routes.map((route) => {
      const vehicle = plan.vehicles.find((item) => item.id === route.vehicleId);
      const capacity = Number(route.capacityOverride ?? vehicle?.capacity ?? 0);
      const passengers = route.assignments.reduce((sum, item) => sum + Number(item.seatCount ?? 1), 0);
      return <Card key={route.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><p className="text-[15px] font-semibold text-ink">{route.name}</p><Badge variant={route.status === "confirmed" ? "success" : "brand"}>{String(route.status ?? "draft")}</Badge></div><dl className="mt-3 space-y-2 text-[13px] text-muted"><div className="flex gap-2"><MapPin className="size-3.5 text-faint" />{route.originName} → {route.destinationName}</div><div>{new Date(route.departureAt).toLocaleString("ro-RO")}</div><div className="flex gap-2"><Bus className="size-3.5 text-faint" />{String(vehicle?.name ?? "Fără vehicul")}</div></dl><div className="mt-3"><div className="mb-1 flex justify-between text-xs text-faint"><span>Pasageri</span><span>{passengers}/{capacity || "—"}</span></div><Progress value={passengers} max={Math.max(capacity, 1)} tone={capacity && passengers / capacity > .9 ? "warning" : "brand"}/></div></CardContent></Card>;
    }) : <EmptyState className="lg:col-span-3" icon={MapPin} title="Nu există rute" description="Adaugă mai întâi un vehicul, apoi ruta și orele reale." action={canWrite ? { label: plan.vehicles.length ? "Adaugă rută" : "Adaugă vehicul", onClick: () => plan.vehicles.length ? setRouteOpen(true) : setVehicleOpen(true) } : undefined}/>}</div>

    <Card><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold text-ink">Cereri nealocate</h2><p className="text-xs text-muted">Proiecție din RSVP; organizatorul poate face override numai cu motiv.</p></div><Badge variant={unassigned.length ? "warning" : "success"}>{unassigned.length}</Badge></div>{unassigned.length === 0 ? <p className="py-5 text-center text-sm text-muted">Nu există cereri nealocate.</p> : <div className="space-y-2">{unassigned.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"><div><p className="text-sm font-medium text-ink">Cerere invitat {String(request.guestId).slice(0, 8)}</p><p className="text-xs text-faint">{String(request.pickupArea ?? "Punct de preluare nespecificat")}</p></div><Select className="max-w-56" defaultValue="" onChange={(event) => event.target.value && void assignRequest(request, event.target.value)} disabled={!canAssign}><option value="">Alocă pe rută…</option>{plan.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</Select></div>)}</div>}</CardContent></Card>

    <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} events={events} eventId={eventId} setEventId={setEventId} name={name} setName={setName} saving={saving} save={() => run(() => weddingOsApi.createTransportPlan(currentWorkspace!.id, { weddingEventId: eventId, name }), "Planul de transport a fost creat")} />
    <Modal open={vehicleOpen} onClose={() => setVehicleOpen(false)} title="Vehicul nou" footer={<><Button variant="ghost" onClick={() => setVehicleOpen(false)}>Renunță</Button><Button disabled={saving || !vehicleName} onClick={() => void run(() => weddingOsApi.createTransportVehicle(currentWorkspace!.id, plan.id, { name: vehicleName, vehicleType: "minibus", capacity: Number(vehicleCapacity), accessibleCapacity: 0 }), "Vehiculul a fost adăugat")}>Adaugă</Button></>}><div className="grid grid-cols-2 gap-4"><Field label="Denumire" className="col-span-2"><Input value={vehicleName} onChange={(event) => setVehicleName(event.target.value)} placeholder="Microbuz principal" /></Field><Field label="Capacitate"><Input type="number" min="1" value={vehicleCapacity} onChange={(event) => setVehicleCapacity(event.target.value)} /></Field><Field label="Tip"><Select disabled><option>Microbuz</option></Select></Field></div></Modal>
    <Modal open={routeOpen} onClose={() => setRouteOpen(false)} title="Rută nouă" footer={<><Button variant="ghost" onClick={() => setRouteOpen(false)}>Renunță</Button><Button disabled={saving || !routeName || !origin || !destination || !departure} onClick={() => void run(() => weddingOsApi.createTransportRoute(currentWorkspace!.id, plan.id, { name: routeName, vehicleId: vehicleId || null, direction: "to_event", departureAt: new Date(departure).toISOString(), originName: origin, destinationName: destination, stops: [] }), "Ruta a fost adăugată")}>Adaugă ruta</Button></>}><div className="grid grid-cols-2 gap-4"><Field label="Nume" className="col-span-2"><Input value={routeName} onChange={(event) => setRouteName(event.target.value)} /></Field><Field label="Plecare"><Input value={origin} onChange={(event) => setOrigin(event.target.value)} /></Field><Field label="Destinație"><Input value={destination} onChange={(event) => setDestination(event.target.value)} /></Field><Field label="Ora plecării"><Input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} /></Field><Field label="Vehicul"><Select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Fără vehicul</option>{plan.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{String(vehicle.name)}</option>)}</Select></Field></div></Modal>
  </div>;
}

function PlanModal(props: { open: boolean; onClose: () => void; events: Array<{ id: string; title: string }>; eventId: string; setEventId: (value: string) => void; name: string; setName: (value: string) => void; saving: boolean; save: () => void }) {
  return <Modal open={props.open} onClose={props.onClose} title="Plan de transport nou" footer={<><Button variant="ghost" onClick={props.onClose}>Renunță</Button><Button disabled={props.saving || !props.eventId || !props.name} onClick={props.save}>Creează planul</Button></>}><div className="space-y-4"><Field label="Nume"><Input value={props.name} onChange={(event) => props.setName(event.target.value)} /></Field><Field label="Eveniment"><Select value={props.eventId} onChange={(event) => props.setEventId(event.target.value)}>{props.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</Select></Field></div></Modal>;
}
