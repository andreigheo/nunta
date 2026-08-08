"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, MailPlus, Pencil, Plus, QrCode, Send } from "lucide-react";
import type { CampaignResource, InvitationSiteResource } from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Modal, PageHeader, StatCard, Table, TBody, TD, Textarea, TH, THead, TR, useToast } from "@/components/ui";

const campaignStatus: Record<string, string> = { draft: "Ciornă", scheduled: "Programată", queued: "În coadă", sending: "În trimitere", completed: "Finalizată", partial: "Parțială", failed: "Eșuată", paused: "Pauză", cancelled: "Anulată", archived: "Arhivată" };

export default function InvitationsPage() {
  const router = useRouter(); const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [site, setSite] = React.useState<InvitationSiteResource | null>(null);
  const [campaigns, setCampaigns] = React.useState<CampaignResource[]>([]);
  const [firstRecipientId, setFirstRecipientId] = React.useState<string | null>(null);
  const [recipientCount, setRecipientCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = React.useState(false); const [previewOpen, setPreviewOpen] = React.useState(false); const [saving, setSaving] = React.useState(false);
  const capabilities = bootstrap?.membership.capabilities ?? [];

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [siteData, campaignData, recipients] = await Promise.all([
        weddingOsApi.invitationSite(currentWorkspace.id), weddingOsApi.campaigns(currentWorkspace.id), weddingOsApi.invitationRecipients(currentWorkspace.id),
      ]);
      setSite(siteData); setCampaigns(campaignData.items); setRecipientCount(recipients.items.length); setFirstRecipientId(typeof recipients.items[0]?.id === "string" ? recipients.items[0].id : null);
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }, [currentWorkspace, demoMode]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const publish = async () => {
    if (!currentWorkspace || !site || demoMode) return; setSaving(true);
    try { const updated = await weddingOsApi.publishInvitation(currentWorkspace.id, site.version); setSite(updated); toast({ title: "Invitație publicată", description: "Versiunea verificată este acum activă.", variant: "success" }); }
    catch (caught) { toast({ title: "Publicarea a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const prepareRecipients = async () => {
    if (!currentWorkspace || !site?.published || demoMode) return;
    setSaving(true);
    try {
      const households = await weddingOsApi.households(currentWorkspace.id);
      if (!households.items.length) throw new Error("Adaugă cel puțin o gospodărie înainte de a pregăti destinatarii.");
      const result = await weddingOsApi.createInvitationRecipients(currentWorkspace.id, {
        householdIds: households.items.map((household) => household.id),
        guestIds: [],
        invitationVersionId: site.published.id,
      });
      toast({ title: "Destinatari pregătiți", description: `${result.created} noi · ${result.recipientIds.length} selectați. Snapshot-urile au fost salvate.`, variant: "success" });
      await load();
    } catch (caught) {
      toast({ title: "Destinatarii nu au fost pregătiți", description: apiErrorMessage(caught), variant: "error" });
    } finally { setSaving(false); }
  };

  const createCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || demoMode) return; const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await weddingOsApi.createCampaign(currentWorkspace.id, { name: String(form.get("name")), purpose: "INVITATION", channel: "EMAIL", invitationVersionId: site?.published?.id ?? null, template: { subject: String(form.get("subject")), body: String(form.get("body")) }, audienceFilter: {} });
      setCampaignOpen(false); toast({ title: "Campanie creată", description: "Este ciornă; destinatarii vor fi fotografiați abia la trimitere.", variant: "success" }); await load();
    } catch (caught) { toast({ title: "Campania nu a fost creată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const sendCampaign = async (campaign: CampaignResource) => {
    if (!currentWorkspace || demoMode) return; setSaving(true);
    try { const result = await weddingOsApi.transitionCampaign(currentWorkspace.id, campaign.id, campaign.version, "SEND_NOW"); toast({ title: "Livrare pusă în coadă", description: result.job ? `Job ${result.job.id.slice(0, 8)} a primit intenția durabilă; e-mailurile nu sunt încă declarate livrate.` : "Destinatarii sunt procesați asincron.", variant: "info" }); await load(); }
    catch (caught) { toast({ title: "Campania nu a fost pusă în coadă", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const copyLink = async () => {
    if (!site || site.status !== "published") return;
    const link = `${window.location.origin}/guest`;
    await navigator.clipboard.writeText(link); toast({ title: "Link public copiat", description: "Accesul la conținutul privat necesită în continuare tokenul personal.", variant: "success" });
  };
  const downloadQr = async () => {
    if (!currentWorkspace || !firstRecipientId) return;
    try { const blob = await weddingOsApi.downloadRecipientQr(currentWorkspace.id, firstRecipientId); downloadBlob(blob, "weddingos-invitation-qr.svg"); toast({ title: "QR rotit și descărcat", description: "Codul anterior pentru acest destinatar a fost revocat.", variant: "success" }); }
    catch (caught) { toast({ title: "QR indisponibil", description: apiErrorMessage(caught), variant: "error" }); }
  };

  const delivered = campaigns.reduce((sum, campaign) => sum + (campaign.statistics.byStatus.delivered ?? 0), 0);
  const opened = campaigns.reduce((sum, campaign) => sum + (campaign.statistics.byStatus.opened ?? 0), 0);
  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="Invitații digitale" description="Site-ul nunții și campaniile către invitați." actions={<>
      <Button variant="outline" size="sm" disabled={!site || site.status !== "published"} onClick={() => void copyLink()}><Copy className="size-3.5" />Copiază linkul</Button>
      <Button variant="outline" size="sm" disabled={!site?.published || !capabilities.includes("invitation.manage_recipients") || demoMode || saving} onClick={() => void prepareRecipients()}><MailPlus className="size-3.5" />Pregătește destinatari ({recipientCount})</Button>
      <Button variant="outline" size="sm" disabled={!firstRecipientId || !capabilities.includes("invitation.manage_recipients")} onClick={() => void downloadQr()}><QrCode className="size-3.5" />QR personal</Button>
      <Button variant="outline" size="sm" disabled={!site} onClick={() => setPreviewOpen(true)}><Eye className="size-3.5" />Previzualizare</Button>
      <Button size="sm" disabled={!site?.draft || !capabilities.includes("invitation.publish") || demoMode || saving} onClick={() => void publish()}>{site?.status === "published" ? "Actualizează publicarea" : "Publică invitația"}</Button>
    </>} />
    {error ? <Card><CardContent className="p-6 text-sm text-danger">{error}<Button size="sm" className="ml-3" onClick={() => void load()}>Reîncearcă</Button></CardContent></Card> : loading ? <Card><CardContent className="p-8 text-sm text-muted">Se încarcă invitația și campaniile reale…</CardContent></Card> : <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3"><Card><CardHeader><CardTitle>Invitația activă</CardTitle><Badge variant={site?.status === "published" ? "success" : "warning"} dot>{site?.status === "published" ? "Publicată" : "Ciornă"}</Badge></CardHeader><CardContent>
        {site ? <button onClick={() => router.push("/invitations/editor")} className="block w-full cursor-pointer rounded-xl border border-line bg-brand-softer p-6 text-center"><p className="text-[10px] font-semibold uppercase tracking-[.25em] text-faint">Sarbato</p><p className="mt-2 font-display text-2xl font-semibold text-brand-strong dark:text-brand">{site.slug}</p><p className="mt-2 text-xs text-muted">Versiune draft {site.draft?.versionNumber ?? "—"} · {site.defaultLanguage.toUpperCase()}</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand"><Pencil className="size-3" />Editează</span></button> : <EmptyState icon={MailPlus} title="Invitația nu este configurată" description="Creează prima versiune în editor; nimic nu este publicat automat." action={{ label: "Deschide editorul", onClick: () => router.push("/invitations/editor") }} />}
        <Button className="mt-3 w-full" variant="outline" onClick={() => router.push("/invitations/editor")}><Pencil className="size-3.5" />Editor</Button>
      </CardContent></Card><div className="grid grid-cols-2 gap-3 lg:col-span-2"><StatCard label="Campanii" value={campaigns.length} /><StatCard label="În coadă / trimitere" value={campaigns.filter((item) => ["queued", "sending", "scheduled"].includes(item.status)).length} /><StatCard label="Livrate" value={delivered} /><StatCard label="Deschise" value={opened} /></div></div>
      <Card><CardHeader><div><CardTitle>Campanii de comunicare</CardTitle><p className="mt-1 text-xs text-muted">Slice 3 livrează e-mail; WhatsApp, SMS și push rămân planificate.</p></div><Button size="sm" disabled={!site?.published || !capabilities.includes("campaign.write") || demoMode} onClick={() => setCampaignOpen(true)}><Plus className="size-4" />Campanie nouă</Button></CardHeader>
        {campaigns.length ? <Table minWidth="760px"><THead><TR><TH>Campanie</TH><TH>Canal</TH><TH>Stare</TH><TH align="right">Destinatari</TH><TH align="right">Deschise</TH><TH /></TR></THead><TBody>{campaigns.map((campaign) => <TR key={campaign.id}><TD className="font-medium">{campaign.name}</TD><TD><Badge variant="neutral">Email</Badge></TD><TD><Badge variant={campaign.status === "completed" ? "success" : campaign.status === "failed" ? "danger" : "info"} dot>{campaignStatus[campaign.status]}</Badge></TD><TD align="right">{campaign.statistics.total}</TD><TD align="right">{campaign.statistics.byStatus.opened ?? 0}</TD><TD align="right">{["draft", "failed", "partial"].includes(campaign.status) && <Button size="sm" disabled={!capabilities.includes("campaign.send") || saving} onClick={() => void sendCampaign(campaign)}><Send className="size-3" />Trimite</Button>}</TD></TR>)}</TBody></Table> : <CardContent><EmptyState icon={Send} title="Nu există campanii" description="Creează o campanie după publicarea invitației și pregătirea destinatarilor." /></CardContent>}
      </Card>
    </>}
    <Modal open={campaignOpen} onClose={() => setCampaignOpen(false)} title="Campanie e-mail"><form className="space-y-4" onSubmit={createCampaign}><Field label="Nume" required><Input name="name" required /></Field><Field label="Subiect" required><Input name="subject" required /></Field><Field label="Mesaj" required><Textarea name="body" required /></Field><p className="text-xs text-faint">Destinatarii sunt fotografiați la SEND_NOW; retry-ul nu retrimite persoanelor deja livrate.</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setCampaignOpen(false)}>Renunță</Button><Button type="submit" disabled={saving}>Salvează ciorna</Button></div></form></Modal>
    <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Previzualizare invitație" size="lg"><div className="rounded-xl bg-brand-softer p-8 text-center"><p className="text-xs uppercase tracking-[.25em] text-faint">Ne căsătorim</p><h2 className="mt-3 font-display text-3xl text-brand-strong dark:text-brand">{site?.slug ?? "Invitația noastră"}</h2><p className="mt-3 text-sm text-muted">{site?.draft ? "Previzualizare sigură a draftului curent" : "Niciun draft disponibil"}</p></div></Modal>
  </div>;
}

function downloadBlob(blob: Blob, fileName: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url); }
