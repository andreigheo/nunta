"use client";

import * as React from "react";
import { ArrowRight, Bus, Download, LockKeyhole, MapPin, Pencil, Plus, Send, Trash2, TriangleAlert, Users } from "lucide-react";
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
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  StatCard,
  Textarea,
  useToast,
} from "@/components/ui";

export default function TransportPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [plans, setPlans] = React.useState<OperationResource[]>([]);
  const [plan, setPlan] = React.useState<TransportPlanResource | null>(null);
  const activePlanId = React.useRef("");
  const [requests, setRequests] = React.useState<OperationResource[]>([]);
  const [events, setEvents] = React.useState<Array<{ id: string; title: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [planEditOpen, setPlanEditOpen] = React.useState(false);
  const [planName, setPlanName] = React.useState("");
  const [deletePlanOpen, setDeletePlanOpen] = React.useState(false);
  const [vehicleOpen, setVehicleOpen] = React.useState(false);
  const [editingVehicleId, setEditingVehicleId] = React.useState<string | null>(null);
  const [deleteVehicle, setDeleteVehicle] = React.useState<OperationResource | null>(null);
  const [routeOpen, setRouteOpen] = React.useState(false);
  const [editingRouteId, setEditingRouteId] = React.useState<string | null>(null);
  const [deleteRoute, setDeleteRoute] = React.useState<OperationResource | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [eventId, setEventId] = React.useState("");
  const [name, setName] = React.useState("Transport principal");
  const [vehicleName, setVehicleName] = React.useState("");
  const [vehicleCapacity, setVehicleCapacity] = React.useState("20");
  const [vehicleAccessibleCapacity, setVehicleAccessibleCapacity] = React.useState("0");
  const [vehicleType, setVehicleType] = React.useState("minibus");
  const [vehicleRegistration, setVehicleRegistration] = React.useState("");
  const [driverName, setDriverName] = React.useState("");
  const [driverPhone, setDriverPhone] = React.useState("");
  const [vehicleNotes, setVehicleNotes] = React.useState("");
  const [routeName, setRouteName] = React.useState("");
  const [origin, setOrigin] = React.useState("");
  const [destination, setDestination] = React.useState("");
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const [routeDirection, setRouteDirection] = React.useState("to_event");
  const [capacityOverride, setCapacityOverride] = React.useState("");
  const [vehicleId, setVehicleId] = React.useState("");
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("transport.write");
  const canAssign = capabilities.includes("transport.assign");
  const canPublish = capabilities.includes("transport.publish");
  const canExport = capabilities.includes("transport.export");

  const loadPlan = React.useCallback(async (id: string) => {
    if (!currentWorkspace) return;
    activePlanId.current = id;
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
      const selected =
        planList.items.find((item) => item.id === activePlanId.current) ??
        planList.items[0];
      if (selected) await loadPlan(selected.id);
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
      return true;
    } catch (cause) {
      toast({ title: "Operația nu a reușit", description: apiErrorMessage(cause), variant: "error" });
      return false;
    } finally { setSaving(false); }
  };

  const assignRequest = async (request: OperationResource, routeId: string) => {
    if (!currentWorkspace || !plan) return;
    await run(() => weddingOsApi.replaceTransportAssignments(currentWorkspace.id, plan.id, plan.version, {
      assignments: [{ routeId, guestId: request.guestId, requestId: request.id, seatCount: 1 }],
      removeAssignmentIds: [],
    }), "Invitatul a fost alocat pe rută");
  };

  const openNewVehicle = () => {
    setEditingVehicleId(null);
    setVehicleName("");
    setVehicleCapacity("20");
    setVehicleAccessibleCapacity("0");
    setVehicleType("minibus");
    setVehicleRegistration("");
    setDriverName("");
    setDriverPhone("");
    setVehicleNotes("");
    setVehicleOpen(true);
  };

  const openEditVehicle = (vehicle: OperationResource) => {
    setEditingVehicleId(vehicle.id);
    setVehicleName(String(vehicle.name ?? ""));
    setVehicleCapacity(String(vehicle.capacity ?? 1));
    setVehicleAccessibleCapacity(String(vehicle.accessibleCapacity ?? 0));
    setVehicleType(String(vehicle.vehicleType ?? "minibus"));
    setVehicleRegistration(String(vehicle.registrationLabel ?? ""));
    setDriverName(String(vehicle.driverName ?? ""));
    setDriverPhone(String(vehicle.driverPhone ?? ""));
    setVehicleNotes(String(vehicle.notesPrivate ?? ""));
    setVehicleOpen(true);
  };

  const saveVehicle = () => {
    const input = {
      name: vehicleName.trim(),
      vehicleType,
      capacity: Number(vehicleCapacity),
      accessibleCapacity: Number(vehicleAccessibleCapacity),
      registrationLabel: vehicleRegistration.trim() || null,
      driverName: driverName.trim() || null,
      driverPhone: driverPhone.trim() || null,
      notesPrivate: vehicleNotes.trim() || null,
    };
    const current = plan?.vehicles.find((item) => item.id === editingVehicleId);
    return run(
      () =>
        current
          ? weddingOsApi.updateTransportVehicle(
              currentWorkspace!.id,
              plan!.id,
              current.id,
              current.version,
              input,
            )
          : weddingOsApi.createTransportVehicle(
              currentWorkspace!.id,
              plan!.id,
              input,
            ),
      current ? "Vehiculul a fost actualizat" : "Vehiculul a fost adăugat",
    );
  };

  const openNewRoute = () => {
    setEditingRouteId(null);
    setRouteName("");
    setOrigin("");
    setDestination("");
    setDeparture("");
    setArrival("");
    setRouteDirection("to_event");
    setCapacityOverride("");
    setVehicleId("");
    setRouteOpen(true);
  };

  const openEditRoute = (route: OperationResource) => {
    setEditingRouteId(route.id);
    setRouteName(String(route.name ?? ""));
    setOrigin(String(route.originName ?? ""));
    setDestination(String(route.destinationName ?? ""));
    setDeparture(toLocalDateTime(String(route.departureAt ?? "")));
    setArrival(toLocalDateTime(String(route.arrivalAt ?? "")));
    setRouteDirection(String(route.direction ?? "to_event"));
    setCapacityOverride(String(route.capacityOverride ?? ""));
    setVehicleId(String(route.vehicleId ?? ""));
    setRouteOpen(true);
  };

  const saveRoute = () => {
    const current = plan?.routes.find((item) => item.id === editingRouteId);
    const input = {
      name: routeName.trim(),
      vehicleId: vehicleId || null,
      direction: routeDirection,
      departureAt: new Date(departure).toISOString(),
      arrivalAt: arrival ? new Date(arrival).toISOString() : null,
      originName: origin.trim(),
      destinationName: destination.trim(),
      capacityOverride: capacityOverride ? Number(capacityOverride) : null,
      ...(current ? {} : { stops: [] }),
    };
    return run(
      () =>
        current
          ? weddingOsApi.updateTransportRoute(
              currentWorkspace!.id,
              plan!.id,
              current.id,
              current.version,
              input,
            )
          : weddingOsApi.createTransportRoute(
              currentWorkspace!.id,
              plan!.id,
              input,
            ),
      current ? "Ruta a fost actualizată" : "Ruta a fost adăugată",
    );
  };

  if (demoMode) return <EmptyState icon={Bus} title="Transportul este izolat în demo" description="Ieși din demo pentru operații persistente." />;
  if (loading) return <div className="py-24 text-center text-sm text-muted">Se încarcă transportul…</div>;
  if (error) return <EmptyState icon={TriangleAlert} title="Transportul nu este disponibil" description={error} action={{ label: "Reîncearcă", onClick: () => void load() }} />;
  if (!plan) return <><EmptyState icon={Bus} title={!canWrite ? "Transportul invitaților este disponibil în Plus" : events.length === 0 ? "Adaugă mai întâi evenimentul nunții" : "Nu există un plan de transport"} description={!canWrite ? "Planurile existente rămân vizibile după revenirea la Free, iar crearea, alocarea și publicarea transportului necesită funcțiile logistice din Plus." : events.length === 0 ? "Planul de transport trebuie legat de un eveniment confirmat. Completează programul nunții, apoi revino aici." : "Cererile RSVP sunt păstrate separat. Creează un draft înainte de a aloca pasageri."} action={!canWrite ? { label: "Vezi opțiunile Plus", onClick: () => window.location.assign("/settings?tab=billing"), icon: <LockKeyhole className="size-4" /> } : events.length ? { label: "Creează plan", onClick: () => setPlanOpen(true), icon: <Plus className="size-4" /> } : { label: "Completează programul", onClick: () => window.location.assign("/onboarding"), icon: <ArrowRight className="size-4" /> }} /><PlanModal open={planOpen} onClose={() => setPlanOpen(false)} events={events} eventId={eventId} setEventId={setEventId} name={name} setName={setName} saving={saving} save={() => run(() => weddingOsApi.createTransportPlan(currentWorkspace!.id, { weddingEventId: eventId, name }), "Planul de transport a fost creat")} /></>;

  const totalCapacity = plan.vehicles.reduce((total, vehicle) => total + Number(vehicle.capacity ?? 0), 0);
  const relevantRequests = requests.filter(
    (request) => request.weddingEventId === plan.weddingEventId,
  );
  const assignedRequestIds = new Set(
    plan.routes.flatMap((route) =>
      route.assignments
        .map((assignment) => assignment.transportRequestId)
        .filter((requestId): requestId is string => Boolean(requestId)),
    ),
  );
  const unassigned = relevantRequests.filter(
    (request) =>
      request.requested === true && !assignedRequestIds.has(request.id),
  );
  const activeIssues = plan.issues.filter((issue) => issue.status !== "resolved");

  return <div className="mx-auto max-w-7xl space-y-5" data-testid="transport-page">
    <PageHeader title="Transport invitați" description={`Plan activ: ${String(plan.name ?? "Fără nume")} · cererile RSVP, vehiculele, rutele și manifestele sunt alimentate din API.`} actions={<>
      {plans.length > 1 && <Select aria-label="Plan de transport activ" value={plan.id} onChange={(event) => void loadPlan(event.target.value)}>{plans.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</Select>}
      <Badge variant={plan.status === "published" ? "success" : "warning"}>{plan.status === "published" ? "Publicat" : "Draft"}</Badge>
      <Button variant="outline" size="icon-sm" aria-label="Redenumește planul de transport" disabled={!canWrite} onClick={() => { setPlanName(String(plan.name ?? "")); setPlanEditOpen(true); }}><Pencil className="size-4" /></Button>
      <Button variant="outline" size="icon-sm" aria-label="Arhivează planul de transport" disabled={!canWrite || plan.status === "published"} onClick={() => setDeletePlanOpen(true)}><Trash2 className="size-4 text-danger" /></Button>
      <Button variant="outline" size="sm" onClick={openNewVehicle} disabled={!canWrite}><Bus className="size-3.5" /> Vehicul</Button>
      <Button variant="outline" size="sm" disabled={!canExport} onClick={async () => { try { const result = await weddingOsApi.createTransportManifest(currentWorkspace!.id, plan.id); toast({ title: "Manifestul se generează", description: `Job ${result.job.id.slice(0, 8)} este în coadă.`, variant: "info" }); } catch (cause) { toast({ title: "Manifestul nu a pornit", description: apiErrorMessage(cause), variant: "error" }); } }}><Download className="size-3.5" /> Manifest</Button>
      <Button size="sm" onClick={() => void run(() => weddingOsApi.publishTransportPlan(currentWorkspace!.id, plan.id, plan.version), "Planul a fost publicat")} disabled={!canPublish || plan.status === "published"}><Send className="size-3.5" /> Publică</Button>
      <Button size="sm" variant="secondary" onClick={openNewRoute} disabled={!canWrite || !plan.vehicles.length}><Plus className="size-4" /> Rută</Button>
    </>} />

    <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="Cereri transport" value={relevantRequests.filter((item) => item.requested === true).length} icon={Users}/><StatCard label="Rute" value={plan.routes.length} icon={MapPin}/><StatCard label="Vehicule" value={plan.vehicles.length} icon={Bus}/><StatCard label="Capacitate" value={totalCapacity}/><StatCard label="Nealocați" value={unassigned.length} tone={unassigned.length ? "warning" : "default"}/></div>

    {activeIssues.length > 0 && <Card><CardContent className="flex flex-wrap gap-2 p-3">{activeIssues.map((issue) => <Badge key={issue.id} variant="warning"><TriangleAlert className="size-3" /> {String(issue.type).replaceAll("_", " ")}</Badge>)}</CardContent></Card>}

    <Card><CardContent className="p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">Vehicule</h2><p className="text-xs text-muted">Datele operaționale pot fi corectate până la publicarea planului.</p></div><Badge variant="neutral">{plan.vehicles.length}</Badge></div>{plan.vehicles.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{plan.vehicles.map((vehicle) => <div key={vehicle.id} className="rounded-xl border border-line p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-ink">{String(vehicle.name)}</p><p className="mt-1 text-xs text-muted">{String(vehicle.vehicleType).replaceAll("_", " ")} · {String(vehicle.capacity)} locuri · {String(vehicle.accessibleCapacity ?? 0)} accesibile</p>{vehicle.registrationLabel ? <p className="mt-1 text-xs text-faint">{String(vehicle.registrationLabel)}</p> : null}</div>{canWrite ? <div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label={`Editează ${String(vehicle.name)}`} onClick={() => openEditVehicle(vehicle)}><Pencil className="size-4" /></Button><Button size="icon-sm" variant="ghost" aria-label={`Șterge ${String(vehicle.name)}`} onClick={() => setDeleteVehicle(vehicle)}><Trash2 className="size-4 text-danger" /></Button></div> : null}</div></div>)}</div> : <p className="py-4 text-center text-sm text-muted">Nu există vehicule.</p>}</CardContent></Card>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">{plan.routes.length ? plan.routes.map((route) => {
      const vehicle = plan.vehicles.find((item) => item.id === route.vehicleId);
      const capacity = Number(route.capacityOverride ?? vehicle?.capacity ?? 0);
      const passengers = route.assignments.reduce((sum, item) => sum + Number(item.seatCount ?? 1), 0);
      return <Card key={route.id}><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-[15px] font-semibold text-ink">{route.name}</p><Badge className="mt-1" variant={route.status === "confirmed" ? "success" : "brand"}>{String(route.status ?? "draft")}</Badge></div>{canWrite ? <div className="flex gap-1"><Button size="icon-sm" variant="ghost" aria-label={`Editează ruta ${route.name}`} onClick={() => openEditRoute(route)}><Pencil className="size-4" /></Button><Button size="icon-sm" variant="ghost" aria-label={`Șterge ruta ${route.name}`} onClick={() => setDeleteRoute(route)}><Trash2 className="size-4 text-danger" /></Button></div> : null}</div><dl className="mt-3 space-y-2 text-[13px] text-muted"><div className="flex gap-2"><MapPin className="size-3.5 text-faint" />{route.originName} → {route.destinationName}</div><div>{new Date(route.departureAt).toLocaleString("ro-RO")}</div><div className="flex gap-2"><Bus className="size-3.5 text-faint" />{String(vehicle?.name ?? "Fără vehicul")}</div></dl><div className="mt-3"><div className="mb-1 flex justify-between text-xs text-faint"><span>Pasageri</span><span>{passengers}/{capacity || "—"}</span></div><Progress value={passengers} max={Math.max(capacity, 1)} tone={capacity && passengers / capacity > .9 ? "warning" : "brand"}/></div></CardContent></Card>;
    }) : <EmptyState className="lg:col-span-3" icon={MapPin} title="Nu există rute" description="Adaugă mai întâi un vehicul, apoi ruta și orele reale." action={canWrite ? { label: plan.vehicles.length ? "Adaugă rută" : "Adaugă vehicul", onClick: () => plan.vehicles.length ? openNewRoute() : openNewVehicle() } : undefined}/>}</div>

    <Card><CardContent className="p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold text-ink">Cereri nealocate</h2><p className="text-xs text-muted">Proiecție din RSVP; fiecare cerere este legată de invitat și de eveniment.</p></div><Badge variant={unassigned.length ? "warning" : "success"}>{unassigned.length}</Badge></div>{unassigned.length === 0 ? <p className="py-5 text-center text-sm text-muted">Nu există cereri nealocate.</p> : <div className="space-y-2">{unassigned.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"><div className="min-w-0"><p className="text-sm font-medium text-ink">{String(request.guestName ?? "Invitat")}</p><p className="mt-0.5 text-xs text-muted">{String(request.eventTitle ?? "Eveniment")}{request.householdName ? ` · ${String(request.householdName)}` : ""}</p><p className="mt-1 text-xs text-faint">{String(request.pickupArea ?? "Punct de preluare nespecificat")}</p></div><Select aria-label={`Alocă ${String(request.guestName ?? "invitatul")} la ${String(request.eventTitle ?? "eveniment")}`} className="max-w-56" defaultValue="" onChange={(event) => event.target.value && void assignRequest(request, event.target.value)} disabled={!canAssign}><option value="">Alocă pe rută…</option>{plan.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</Select></div>)}</div>}</CardContent></Card>

    <PlanModal open={planOpen} onClose={() => setPlanOpen(false)} events={events} eventId={eventId} setEventId={setEventId} name={name} setName={setName} saving={saving} save={() => run(() => weddingOsApi.createTransportPlan(currentWorkspace!.id, { weddingEventId: eventId, name }), "Planul de transport a fost creat")} />
    <Modal open={planEditOpen} onClose={() => setPlanEditOpen(false)} title="Redenumește planul de transport" footer={<><Button variant="ghost" onClick={() => setPlanEditOpen(false)}>Renunță</Button><Button disabled={saving || !planName.trim()} onClick={async () => { const updated = await run(() => weddingOsApi.updateTransportPlan(currentWorkspace!.id, plan.id, plan.version, { name: planName.trim() }), "Planul de transport a fost redenumit"); if (updated) setPlanEditOpen(false); }}>Salvează</Button></>}><Field label="Nume"><Input value={planName} onChange={(event) => setPlanName(event.target.value)} /></Field></Modal>
    <Modal open={vehicleOpen} onClose={() => setVehicleOpen(false)} title={editingVehicleId ? "Editează vehiculul" : "Vehicul nou"} description="Capacitatea, accesibilitatea și datele șoferului vor apărea în planul operațional." size="lg" footer={<><Button variant="ghost" onClick={() => setVehicleOpen(false)}>Renunță</Button><Button disabled={saving || !vehicleName.trim() || Number(vehicleCapacity) < 1 || Number(vehicleAccessibleCapacity) < 0 || Number(vehicleAccessibleCapacity) > Number(vehicleCapacity)} onClick={() => void saveVehicle()}>{editingVehicleId ? "Salvează" : "Adaugă"}</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Denumire" className="sm:col-span-2"><Input value={vehicleName} onChange={(event) => setVehicleName(event.target.value)} placeholder="Microbuz principal" /></Field><Field label="Tip"><Select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}><option value="bus">Autobuz</option><option value="minibus">Microbuz</option><option value="van">Van</option><option value="car">Autoturism</option><option value="shuttle">Shuttle</option><option value="other">Alt tip</option></Select></Field><Field label="Număr de înmatriculare"><Input value={vehicleRegistration} onChange={(event) => setVehicleRegistration(event.target.value)} placeholder="B 123 ABC" /></Field><Field label="Capacitate totală"><Input type="number" min="1" value={vehicleCapacity} onChange={(event) => setVehicleCapacity(event.target.value)} /></Field><Field label="Locuri accesibile"><Input type="number" min="0" max={vehicleCapacity} value={vehicleAccessibleCapacity} onChange={(event) => setVehicleAccessibleCapacity(event.target.value)} /></Field><Field label="Nume șofer"><Input value={driverName} onChange={(event) => setDriverName(event.target.value)} /></Field><Field label="Telefon șofer"><Input type="tel" value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} /></Field><Field label="Note private" className="sm:col-span-2"><Textarea rows={3} value={vehicleNotes} onChange={(event) => setVehicleNotes(event.target.value)} placeholder="Instrucțiuni pentru echipa de organizare" /></Field></div></Modal>
    <Modal open={routeOpen} onClose={() => setRouteOpen(false)} title={editingRouteId ? "Editează ruta" : "Rută nouă"} description="Definește sensul, intervalul și vehiculul. Orele sunt salvate în fusul orar al dispozitivului." size="lg" footer={<><Button variant="ghost" onClick={() => setRouteOpen(false)}>Renunță</Button><Button disabled={saving || !routeName.trim() || !origin.trim() || !destination.trim() || !departure || Boolean(arrival && new Date(arrival) <= new Date(departure))} onClick={() => void saveRoute()}>{editingRouteId ? "Salvează ruta" : "Adaugă ruta"}</Button></>}><div className="grid gap-4 sm:grid-cols-2"><Field label="Nume" className="sm:col-span-2"><Input value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="Hotel → locația evenimentului" /></Field><Field label="Sens"><Select value={routeDirection} onChange={(event) => setRouteDirection(event.target.value)}><option value="to_event">Spre eveniment</option><option value="from_event">De la eveniment</option><option value="round_trip">Dus-întors</option><option value="custom">Rută personalizată</option></Select></Field><Field label="Vehicul"><Select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Fără vehicul</option>{plan.vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{String(vehicle.name)}</option>)}</Select></Field><Field label="Plecare"><Input value={origin} onChange={(event) => setOrigin(event.target.value)} /></Field><Field label="Destinație"><Input value={destination} onChange={(event) => setDestination(event.target.value)} /></Field><Field label="Ora plecării"><Input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} /></Field><Field label="Ora estimată a sosirii"><Input type="datetime-local" value={arrival} min={departure || undefined} onChange={(event) => setArrival(event.target.value)} /></Field><Field label="Capacitate specială (opțional)"><Input type="number" min="1" value={capacityOverride} onChange={(event) => setCapacityOverride(event.target.value)} placeholder="Folosește capacitatea vehiculului" /></Field></div>{arrival && departure && new Date(arrival) <= new Date(departure) ? <p role="alert" className="mt-3 text-sm text-danger">Sosirea trebuie să fie după plecare.</p> : null}</Modal>
    <ConfirmDialog open={Boolean(deleteVehicle)} onClose={() => setDeleteVehicle(null)} onConfirm={async () => { const current = deleteVehicle; if (!current) return; const deleted = await run(() => weddingOsApi.deleteTransportVehicle(currentWorkspace!.id, plan.id, current.id, current.version), "Vehiculul a fost eliminat"); if (deleted) setDeleteVehicle(null); }} title="Ștergi vehiculul?" description="Vehiculul poate fi eliminat numai dacă nu este folosit de o rută." confirmLabel="Șterge vehiculul" destructive loading={saving} />
    <ConfirmDialog open={Boolean(deleteRoute)} onClose={() => setDeleteRoute(null)} onConfirm={async () => { const current = deleteRoute; if (!current) return; const deleted = await run(() => weddingOsApi.deleteTransportRoute(currentWorkspace!.id, plan.id, current.id, current.version), "Ruta a fost eliminată"); if (deleted) setDeleteRoute(null); }} title="Ștergi ruta?" description="Ruta poate fi eliminată numai dacă nu are invitați alocați." confirmLabel="Șterge ruta" destructive loading={saving} />
    <ConfirmDialog open={deletePlanOpen} onClose={() => setDeletePlanOpen(false)} onConfirm={async () => { const deleted = await run(() => weddingOsApi.deleteTransportPlan(currentWorkspace!.id, plan.id, plan.version), "Planul de transport a fost arhivat"); if (deleted) { activePlanId.current = ""; setDeletePlanOpen(false); } }} title="Arhivezi planul de transport?" description="Planul dispare din lista activă. Un plan publicat trebuie retras înainte de arhivare." confirmLabel="Arhivează planul" destructive loading={saving} />
  </div>;
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function PlanModal(props: { open: boolean; onClose: () => void; events: Array<{ id: string; title: string }>; eventId: string; setEventId: (value: string) => void; name: string; setName: (value: string) => void; saving: boolean; save: () => void }) {
  return <Modal open={props.open} onClose={props.onClose} title="Plan de transport nou" footer={<><Button variant="ghost" onClick={props.onClose}>Renunță</Button><Button disabled={props.saving || !props.eventId || !props.name} onClick={props.save}>Creează planul</Button></>}><div className="space-y-4"><Field label="Nume"><Input value={props.name} onChange={(event) => props.setName(event.target.value)} /></Field><Field label="Eveniment"><Select value={props.eventId} onChange={(event) => props.setEventId(event.target.value)}>{props.events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</Select></Field></div></Modal>;
}
