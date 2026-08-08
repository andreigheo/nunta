"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Eye, FileText, Plus, Send } from "lucide-react";
import { formatDateShort } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Drawer, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Textarea, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";

const categories = ["VENUE", "PHOTOGRAPHY", "VIDEOGRAPHY", "CATERING", "MUSIC", "DECOR", "FLOWERS", "TRANSPORT", "ACCOMMODATION", "CAKE", "OTHER"];

export default function RequestsPage() {
  const searchParams = useSearchParams();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [rfqs, setRfqs] = React.useState<OperationResource[]>([]);
  const [vendors, setVendors] = React.useState<OperationResource[]>([]);
  const [detail, setDetail] = React.useState<OperationResource | null>(null);
  const [open, setOpen] = React.useState(Boolean(searchParams.get("vendor")));
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", category: "OTHER", description: "", eventDate: "", guestCount: "", budget: "", deadline: "", vendorId: searchParams.get("vendor") ?? "" });

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return setRfqs([]);
    try {
      const [rows, marketplace] = await Promise.all([weddingOsApi.rfqs(currentWorkspace.id), weddingOsApi.marketplaceVendors()]);
      setRfqs(rows.items);
      setVendors(marketplace.items);
    } catch (error) {
      toast({ title: "Cererile nu au putut fi încărcate", description: apiErrorMessage(error), variant: "error" });
    }
  }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);

  const submit = async (send: boolean) => {
    if (!currentWorkspace || demoMode) return;
    setSaving(true);
    try {
      const created = await weddingOsApi.createRfq(currentWorkspace.id, {
        title: form.title,
        category: form.category,
        description: form.description,
        eventDate: form.eventDate || null,
        guestCount: form.guestCount ? Number(form.guestCount) : null,
        locationSnapshot: {},
        budgetRangeMaxMinor: form.budget ? Math.round(Number(form.budget) * 100) : null,
        currency: bootstrap?.workspace.currency ?? "RON",
        responseDeadline: new Date(`${form.deadline}T18:00:00.000Z`).toISOString(),
        requirements: [],
        questions: [],
      });
      if (send) {
        if (!form.vendorId) throw new Error("Selectează un furnizor publicat.");
        const recipients = await weddingOsApi.replaceRfqRecipients(currentWorkspace.id, created.id, created.version, [form.vendorId]);
        const ready = await weddingOsApi.transitionRfq(currentWorkspace.id, created.id, Number(recipients.version), "MARK_READY");
        await weddingOsApi.transitionRfq(currentWorkspace.id, created.id, ready.version, "SEND");
      }
      setOpen(false);
      setForm({ title: "", category: "OTHER", description: "", eventDate: "", guestCount: "", budget: "", deadline: "", vendorId: "" });
      await load();
      toast({ title: send ? "Cerere pusă în coadă" : "Ciornă salvată", description: send ? "Destinatarul și intenția durabilă de livrare au fost salvate; livrarea se procesează asincron." : "Cererea persistă și poate fi completată ulterior.", variant: "success" });
    } catch (error) {
      toast({ title: "Cererea nu a fost salvată", description: apiErrorMessage(error), variant: "error" });
    } finally { setSaving(false); }
  };

  const close = async (rfq: OperationResource) => {
    if (!currentWorkspace) return;
    try {
      await weddingOsApi.transitionRfq(currentWorkspace.id, rfq.id, rfq.version, "CLOSE");
      await load();
      setDetail(null);
      toast({ title: "Cerere închisă", variant: "success" });
    } catch (error) { toast({ title: "Cererea nu a fost închisă", description: apiErrorMessage(error), variant: "error" }); }
  };

  return <div className="mx-auto max-w-7xl space-y-4">
    <PageHeader title="Cereri de ofertă" description="Brief-uri persistente, destinatari publicați și livrare asincronă urmărită." actions={<><Button variant="outline" size="sm" disabled title="Generarea AI a brief-ului este planificată">Brief cu AI · planificat</Button><Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />Cerere nouă</Button></>} />
    {rfqs.length === 0 ? <EmptyState icon={FileText} title="Nicio cerere de ofertă" description="Creează un brief, salvează-l ca draft sau trimite-l unui furnizor publicat." action={{ label: "Creează cererea", onClick: () => setOpen(true), icon: <Plus className="size-4" /> }} /> : <Table minWidth="760px"><THead><TR><TH>Cerere</TH><TH>Categorie</TH><TH>Termen</TH><TH>Destinatari</TH><TH>Stare</TH><TH /></TR></THead><TBody>{rfqs.map((rfq) => <TR key={rfq.id} onClick={() => setDetail(rfq)}><TD className="font-medium">{String(rfq.title)}</TD><TD><Badge variant="neutral">{label(String(rfq.category))}</Badge></TD><TD>{formatDateShort(String(rfq.responseDeadline))}</TD><TD>{Array.isArray(rfq.recipients) ? rfq.recipients.length : 0}</TD><TD><Badge variant={rfq.status === "SENT" ? "success" : rfq.status === "DRAFT" ? "neutral" : "info"} dot>{label(String(rfq.status))}</Badge></TD><TD><Button variant="ghost" size="icon-sm" aria-label="Vezi"><Eye className="size-4" /></Button></TD></TR>)}</TBody></Table>}
    <Drawer open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? String(detail.title) : undefined} description={detail ? `${label(String(detail.category))} · versiunea ${detail.version}` : undefined}>{detail ? <div className="space-y-4 p-5"><p className="whitespace-pre-wrap text-sm text-muted">{String(detail.description)}</p><pre className="overflow-auto rounded-lg bg-subtle p-3 text-xs text-muted">{JSON.stringify({ requirements: detail.requirements ?? [], questions: detail.questions ?? [], recipients: detail.recipients ?? [] }, null, 2)}</pre><div className="flex gap-2">{["SENT", "PARTIALLY_RESPONDED", "RESPONDED"].includes(String(detail.status)) ? <Button variant="destructive-outline" onClick={() => void close(detail)}>Închide cererea</Button> : null}<Button variant="outline" disabled>Duplicare · planificat</Button></div></div> : null}</Drawer>
    <Modal open={open} onClose={() => setOpen(false)} title="Cerere de ofertă nouă" description="Un brief structurat pentru un furnizor publicat" size="xl" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Renunță</Button><Button variant="outline" disabled={saving || !form.title || !form.description || !form.deadline} onClick={() => void submit(false)}>Salvează ciorna</Button><Button disabled={saving || !form.title || !form.description || !form.deadline || !form.vendorId} onClick={() => void submit(true)}><Send className="size-4" />Pune în coadă</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Titlu" required><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field><Field label="Categorie" required><Select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{categories.map((category) => <option key={category} value={category}>{label(category)}</option>)}</Select></Field><Field label="Data evenimentului"><Input type="date" value={form.eventDate} onChange={(event) => setForm({ ...form, eventDate: event.target.value })} /></Field><Field label="Număr invitați"><Input inputMode="numeric" value={form.guestCount} onChange={(event) => setForm({ ...form, guestCount: event.target.value })} /></Field><Field label="Buget maxim (RON)"><Input inputMode="numeric" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} /></Field><Field label="Termen de răspuns" required><Input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></Field><Field label="Furnizor publicat" className="sm:col-span-2"><Select value={form.vendorId} onChange={(event) => setForm({ ...form, vendorId: event.target.value })}><option value="">Selectează furnizorul</option>{vendors.map((vendor) => <option key={vendor.id} value={String(vendor.vendorOrganizationId)}>{String(vendor.headline)}</option>)}</Select></Field><Field label="Brief" required className="sm:col-span-2"><Textarea rows={6} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field><p className="sm:col-span-2 rounded-lg bg-subtle p-3 text-xs text-muted">Atașamentele rămân dezactivate până la storage securizat. Nu se simulează upload.</p></div>
    </Modal>
  </div>;
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
