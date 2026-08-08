"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, GitCompareArrows, MessageSquare, X } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Card, CardContent, ConfirmDialog, Drawer, EmptyState, Field, PageHeader, Tabs, TabsList, TabsTrigger, Textarea, useToast } from "@/components/ui";

const tabs = ["ALL", "SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "REVISED", "ACCEPTED", "REJECTED"];

export default function OffersPage() {
  const router = useRouter();
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [offers, setOffers] = React.useState<OperationResource[]>([]);
  const [tab, setTab] = React.useState("ALL");
  const [detail, setDetail] = React.useState<OperationResource | null>(null);
  const [message, setMessage] = React.useState("");
  const [confirm, setConfirm] = React.useState<"ACCEPT" | "REJECT" | null>(null);

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return setOffers([]);
    try { setOffers((await weddingOsApi.offers(currentWorkspace.id)).items); }
    catch (error) { toast({ title: "Ofertele nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" }); }
  }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);

  const transition = async (offer: OperationResource, action: string, reason?: string) => {
    if (!currentWorkspace) return;
    try {
      const updated = await weddingOsApi.transitionOffer(currentWorkspace.id, offer.id, offer.version, action, reason);
      await load();
      setDetail(updated);
      toast({ title: action === "ACCEPT" ? "Oferta a fost acceptată" : "Oferta a fost actualizată", description: action === "ACCEPT" ? "Booking-ul, contractul operațional și proiecția de buget au fost create atomic." : undefined, variant: "success" });
    } catch (error) { toast({ title: "Tranziția nu a reușit", description: apiErrorMessage(error), variant: "error" }); }
  };
  const sendMessage = async () => {
    if (!currentWorkspace || !detail || !message.trim()) return;
    try { await weddingOsApi.sendNegotiationMessage(currentWorkspace.id, detail.id, { body: message }); setMessage(""); toast({ title: "Mesaj salvat în negociere", variant: "success" }); }
    catch (error) { toast({ title: "Mesajul nu a fost trimis", description: apiErrorMessage(error), variant: "error" }); }
  };

  const filtered = tab === "ALL" ? offers : offers.filter((offer) => offer.status === tab);
  return <div className="mx-auto max-w-7xl space-y-4">
    <PageHeader title="Oferte" description="Versiuni imuabile, linii normalizate, negocieri și acceptare atomică." actions={<Button variant="outline" size="sm" onClick={() => router.push("/shortlists")}><GitCompareArrows className="size-4" />Liste scurte</Button>} />
    <Tabs value={tab} onValueChange={setTab}><TabsList>{tabs.map((value) => <TabsTrigger key={value} value={value} badge={<Badge variant="neutral">{value === "ALL" ? offers.length : offers.filter((offer) => offer.status === value).length}</Badge>}>{label(value)}</TabsTrigger>)}</TabsList></Tabs>
    {filtered.length === 0 ? <EmptyState icon={GitCompareArrows} title="Nicio ofertă în această stare" description="Ofertele trimise de furnizori apar aici cu prețurile calculate pe server." action={{ label: "Vezi cererile", onClick: () => router.push("/requests") }} /> : <div className="grid gap-3 md:grid-cols-2">{filtered.map((offer) => { const vendor = record(offer.vendor); return <Card key={offer.id} interactive onClick={() => setDetail(offer)}><CardContent className="p-4"><div className="flex justify-between gap-3"><div><p className="font-semibold text-ink">{String(vendor.headline ?? "Furnizor")}</p><p className="text-xs text-faint">versiunea {String(record(offer.currentVersion).versionNumber ?? offer.currentVersionNumber)}</p></div><Badge variant={offer.status === "ACCEPTED" ? "success" : offer.status === "REJECTED" ? "neutral" : "brand"} dot>{label(String(offer.status))}</Badge></div><p className="mt-3 text-xl font-semibold text-ink">{formatRON(Number(offer.totalMinor ?? 0) / 100)} <span className="text-xs font-normal text-faint">{String(offer.currency)}</span></p><p className="mt-2 text-sm text-muted">{Array.isArray(offer.lineItems) ? offer.lineItems.length : 0} linii · valabil până la {offer.validUntil ? new Date(String(offer.validUntil)).toLocaleDateString("ro-RO") : "nespecificat"}</p></CardContent></Card>; })}</div>}
    <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(record(detail.vendor).headline ?? "Ofertă") : undefined} description={detail ? `${label(String(detail.status))} · versiunea ${detail.version}` : undefined} width="xl">{detail ? <div className="space-y-5 p-5"><div className="flex flex-wrap gap-2">{detail.status === "SUBMITTED" ? <Button onClick={() => void transition(detail, "START_REVIEW")}>Începe analiza</Button> : null}{["SUBMITTED", "UNDER_REVIEW", "REVISED"].includes(String(detail.status)) ? <><Button variant="outline" onClick={() => setConfirm("REJECT")}><X className="size-4" />Refuză</Button><Button onClick={() => setConfirm("ACCEPT")}><Check className="size-4" />Acceptă oferta</Button></> : null}<Button variant="outline" disabled>Analiză AI · planificată</Button><Button variant="outline" disabled>PDF · planificat</Button></div><div className="space-y-2">{(Array.isArray(detail.lineItems) ? detail.lineItems as OperationResource[] : []).map((line) => <Card key={line.id}><CardContent className="flex items-start justify-between gap-4 p-3"><div><p className="font-medium text-ink">{String(line.name)}</p><p className="text-xs text-muted">{String(line.description ?? "")}</p></div><p className="shrink-0 font-semibold text-ink">{formatRON(Number(line.lineTotalMinor ?? 0) / 100)}</p></CardContent></Card>)}</div><Card><CardContent className="p-4"><p className="font-semibold text-ink">Negociere</p><Field label="Mesaj" className="mt-3"><Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Cere o clarificare sau o revizie…" /></Field><Button className="mt-2" size="sm" disabled={!message.trim()} onClick={() => void sendMessage()}><MessageSquare className="size-4" />Trimite</Button></CardContent></Card><p className="rounded-lg bg-subtle p-3 text-xs text-muted">Totalurile, discountul și taxele sunt calculate pe server. Acceptarea creează booking, contract și proiecția bugetului într-o singură tranzacție.</p></div> : null}</Drawer>
    <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} onConfirm={() => { if (detail && confirm) void transition(detail, confirm); setConfirm(null); }} title={confirm === "ACCEPT" ? "Accepți oferta?" : "Refuzi oferta?"} description={confirm === "ACCEPT" ? "Se creează atomic booking-ul, contractul operațional și poziția de buget." : "Furnizorul va vedea starea actualizată. Datele istorice rămân păstrate."} confirmLabel={confirm === "ACCEPT" ? "Acceptă oferta" : "Refuză"} destructive={confirm === "REJECT"} />
  </div>;
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
