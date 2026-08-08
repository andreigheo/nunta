"use client";

import * as React from "react";
import { CalendarClock, FileSignature, Play, CheckCircle2, XCircle } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Card, CardContent, Drawer, EmptyState, Field, Input, PageHeader, useToast } from "@/components/ui";

export default function BookingsPage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<OperationResource | null>(null);
  const [dates, setDates] = React.useState({ start: "", end: "" });
  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return setItems([]);
    try { setItems((await weddingOsApi.commercialBookings(currentWorkspace.id)).items); }
    catch (error) { toast({ title: "Booking-urile nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); }
  }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);

  const transition = async (item: OperationResource, action: string) => {
    if (!currentWorkspace) return;
    try { await weddingOsApi.transitionBooking(currentWorkspace.id, item.id, item.version, action, action === "CANCEL" ? "Anulat de utilizator" : undefined); await load(); setSelected(null); toast({ title: "Booking actualizat", variant: "success" }); }
    catch (error) { toast({ title: "Booking-ul nu a fost actualizat", description: apiErrorMessage(error), variant: "error" }); }
  };
  const saveDates = async () => {
    if (!currentWorkspace || !selected) return;
    try { const updated = await weddingOsApi.updateCommercialBooking(currentWorkspace.id, selected.id, selected.version, { serviceStartAt: dates.start ? new Date(dates.start).toISOString() : null, serviceEndAt: dates.end ? new Date(dates.end).toISOString() : null }); setSelected(updated); await load(); toast({ title: "Programarea a fost salvată", variant: "success" }); }
    catch (error) { toast({ title: "Programarea nu a fost salvată", description: apiErrorMessage(error), variant: "error" }); }
  };

  return <div className="mx-auto max-w-7xl space-y-4"><PageHeader title="Rezervări" description="Serviciile confirmate, programările și contractele lor, într-un singur loc." />{items.length === 0 ? <EmptyState icon={CalendarClock} title="Nicio rezervare" description="Acceptă o ofertă pentru a crea rezervarea, contractul și poziția din buget." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <Card key={item.id} interactive onClick={() => { setSelected(item); setDates({ start: item.serviceStartAt ? String(item.serviceStartAt).slice(0, 16) : "", end: item.serviceEndAt ? String(item.serviceEndAt).slice(0, 16) : "" }); }}><CardContent className="p-4"><div className="flex justify-between gap-3"><p className="font-semibold text-ink">{String(item.title)}</p><Badge variant={item.status === "COMPLETED" ? "success" : item.status === "CANCELLED" ? "danger" : "brand"} dot>{label(String(item.status))}</Badge></div><p className="mt-3 text-lg font-semibold text-ink">{formatRON(Number(item.totalMinor ?? 0) / 100)}</p><p className="text-xs text-muted">Plătit: {formatRON(Number(item.paidTotalMinor ?? 0) / 100)} · restant: {formatRON(Number(item.outstandingTotalMinor ?? 0) / 100)}</p><p className="mt-2 text-xs text-faint">{Array.isArray(item.items) ? item.items.length : 0} servicii · {Array.isArray(item.milestones) ? item.milestones.length : 0} repere</p></CardContent></Card>)}</div>}
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? String(selected.title) : undefined} description={selected ? `${label(String(selected.status))} · versiunea ${selected.version}` : undefined}>{selected ? <div className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-2"><Field label="Început serviciu"><Input type="datetime-local" value={dates.start} onChange={(event) => setDates({ ...dates, start: event.target.value })} /></Field><Field label="Sfârșit serviciu"><Input type="datetime-local" value={dates.end} onChange={(event) => setDates({ ...dates, end: event.target.value })} /></Field></div><Button size="sm" onClick={() => void saveDates()}>Salvează programarea</Button><div className="flex flex-wrap gap-2">{selected.status === "CONFIRMED" ? <Button onClick={() => void transition(selected, "START")}><Play className="size-4" />Începe</Button> : null}{selected.status === "IN_PROGRESS" ? <Button onClick={() => void transition(selected, "COMPLETE")}><CheckCircle2 className="size-4" />Finalizează</Button> : null}{!["CANCELLED", "COMPLETED", "ARCHIVED"].includes(String(selected.status)) ? <Button variant="destructive-outline" onClick={() => void transition(selected, "CANCEL")}><XCircle className="size-4" />Anulează</Button> : null}{selected.contract ? <Button variant="outline" onClick={() => window.location.assign(`/contracts?contract=${String(record(selected.contract).id)}`)}><FileSignature className="size-4" />Contract</Button> : null}</div><pre className="overflow-auto rounded-lg bg-subtle p-3 text-xs text-muted">{JSON.stringify({ services: selected.items ?? [], milestones: selected.milestones ?? [] }, null, 2)}</pre></div> : null}</Drawer>
  </div>;
}
function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
