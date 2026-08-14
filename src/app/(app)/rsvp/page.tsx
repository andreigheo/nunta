"use client";

import * as React from "react";
import { BellPlus, CalendarClock, Download, FilePenLine } from "lucide-react";
import type { CampaignResource, GuestResource, InvitationSiteResource, RsvpFormResource } from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Donut, DonutLegend, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Switch, Table, TBody, TD, Textarea, TH, THead, TR, useToast } from "@/components/ui";

type Summary = { totalGuests: number; rsvp: Record<string, number>; menu: { complete: number; incomplete: number; allergyIssues: number } };
type ReminderAudience = { total: number; valid: number; invalid: number; audienceRevision: string };
const initialSummary: Summary = { totalGuests: 0, rsvp: {}, menu: { complete: 0, incomplete: 0, allergyIssues: 0 } };

type RsvpConfig = {
  deadline: string;
  attendanceEnabled: boolean;
  perEventAttendance: boolean;
  plusOneQuestion: boolean;
  childrenConfirmation: boolean;
  menuSelection: boolean;
  allergyCollection: boolean;
  accessibilityCollection: boolean;
  transportQuestion: boolean;
  accommodationQuestion: boolean;
  guestMessage: boolean;
  allowEdits: boolean;
  closedMessage: string;
  language: string;
};

const defaultRsvpConfig: RsvpConfig = {
  deadline: "",
  attendanceEnabled: true,
  perEventAttendance: true,
  plusOneQuestion: true,
  childrenConfirmation: true,
  menuSelection: true,
  allergyCollection: true,
  accessibilityCollection: true,
  transportQuestion: true,
  accommodationQuestion: true,
  guestMessage: true,
  allowEdits: true,
  closedMessage: "Perioada RSVP s-a încheiat. Contactează organizatorii.",
  language: "ro",
};

export default function RsvpPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace(); const { toast } = useToast();
  const [form, setForm] = React.useState<RsvpFormResource | null>(null); const [site, setSite] = React.useState<InvitationSiteResource | null>(null); const [guests, setGuests] = React.useState<GuestResource[]>([]); const [summary, setSummary] = React.useState<Summary>(initialSummary);
  const [formOpen, setFormOpen] = React.useState(false); const [loading, setLoading] = React.useState(true); const [error, setError] = React.useState<string | null>(null); const [saving, setSaving] = React.useState(false); const [reminderCampaign, setReminderCampaign] = React.useState<CampaignResource | null>(null); const [reminderAudience, setReminderAudience] = React.useState<ReminderAudience | null>(null);
  const [formConfig, setFormConfig] = React.useState<RsvpConfig>(defaultRsvpConfig);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const load = React.useCallback(async () => { if (!currentWorkspace || demoMode) { setLoading(false); return; } setLoading(true); setError(null); try { const [formData, guestData, siteData] = await Promise.all([weddingOsApi.rsvpForm(currentWorkspace.id), weddingOsApi.guests(currentWorkspace.id), weddingOsApi.invitationSite(currentWorkspace.id)]); setForm(formData); setGuests(guestData.items); setSummary(guestData.summary as Summary); setSite(siteData); } catch (caught) { setError(apiErrorMessage(caught)); } finally { setLoading(false); } }, [currentWorkspace, demoMode]);
  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const openFormEditor = () => {
    setFormConfig(configFromResource(form));
    setFormOpen(true);
  };
  const setConfig = <Key extends keyof RsvpConfig>(key: Key, value: RsvpConfig[Key]) => {
    setFormConfig((current) => ({ ...current, [key]: value }));
  };
  const saveForm = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); if (!currentWorkspace || demoMode) return; setSaving(true); try { const updated = await weddingOsApi.saveRsvpForm(currentWorkspace.id, form?.version ?? null, { deadline: formConfig.deadline ? new Date(formConfig.deadline).toISOString() : null, attendanceEnabled: formConfig.attendanceEnabled, perEventAttendance: formConfig.perEventAttendance, plusOneQuestion: formConfig.plusOneQuestion, childrenConfirmation: formConfig.childrenConfirmation, menuSelection: formConfig.menuSelection, allergyCollection: formConfig.allergyCollection, accessibilityCollection: formConfig.accessibilityCollection, transportQuestion: formConfig.transportQuestion, accommodationQuestion: formConfig.accommodationQuestion, guestMessage: formConfig.guestMessage, allowEdits: formConfig.allowEdits, closedMessage: formConfig.closedMessage.trim() || defaultRsvpConfig.closedMessage, languages: [formConfig.language] }); setForm(updated); setFormOpen(false); toast({ title: "Formular RSVP salvat", description: "Ciorna este persistentă; publicarea rămâne explicită.", variant: "success" }); } catch (caught) { toast({ title: "Formularul nu a fost salvat", description: apiErrorMessage(caught), variant: "error" }); } finally { setSaving(false); } };
  const publish = async () => { if (!currentWorkspace || !form || demoMode) return; setSaving(true); try { const updated = await weddingOsApi.publishRsvpForm(currentWorkspace.id, form.version); setForm(updated); toast({ title: "Formular RSVP publicat", variant: "success" }); } catch (caught) { toast({ title: "Publicarea a eșuat", description: apiErrorMessage(caught), variant: "error" }); } finally { setSaving(false); } };
  const reminder = async () => { if (!currentWorkspace || !site?.published || demoMode) return; setSaving(true); try { const campaign = await weddingOsApi.createCampaign(currentWorkspace.id, { name: `Reamintire RSVP ${new Date().toLocaleDateString("ro-RO")}`, purpose: "RSVP_REMINDER", channel: "EMAIL", invitationVersionId: site.published.id, template: { subject: "Reamintire RSVP", body: "Te rugăm să confirmi participarea folosind invitația personală." }, audienceFilter: {} }); const audience = await weddingOsApi.campaignAudiencePreview(currentWorkspace.id, campaign.id); setReminderCampaign(campaign); setReminderAudience(audience); } catch (caught) { toast({ title: "Audiența reamintirii nu a fost verificată", description: apiErrorMessage(caught), variant: "error" }); } finally { setSaving(false); } };
  const sendReminder = async () => { if (!currentWorkspace || !reminderCampaign || !reminderAudience?.valid || demoMode) return; setSaving(true); try { const queued = await weddingOsApi.transitionCampaign(currentWorkspace.id, reminderCampaign.id, reminderCampaign.version, "SEND_NOW", undefined, reminderAudience.audienceRevision); setReminderCampaign(null); setReminderAudience(null); toast({ title: "Reamintire pusă în coadă", description: queued.job ? `Job ${queued.job.id.slice(0, 8)} va procesa numai cei ${reminderAudience.valid} destinatari verificați.` : "Livrarea se procesează asincron.", variant: "info" }); await load(); } catch (caught) { toast({ title: "Reamintirea nu a fost programată", description: apiErrorMessage(caught), variant: "error" }); } finally { setSaving(false); } };
  const exportRsvp = async () => { if (!currentWorkspace || demoMode) return; try { const { job } = await weddingOsApi.createGuestExport(currentWorkspace.id, { format: "xlsx", includeContactData: false, includeRsvp: true, includeMenu: true, includeAllergies: false, includeLogistics: true }); toast({ title: "Export RSVP pus în coadă", variant: "info" }); await waitForJob(job.id); downloadBlob(await weddingOsApi.downloadJobArtifact(job.id), "weddingos-rsvp.xlsx"); } catch (caught) { toast({ title: "Exportul a eșuat", description: apiErrorMessage(caught), variant: "error" }); } };

  const segments = [{ label: "Confirmați", value: summary.rsvp.confirmed ?? 0, color: "var(--success)" }, { label: "Refuzați", value: summary.rsvp.declined ?? 0, color: "var(--danger)" }, { label: "Nesiguri", value: summary.rsvp.unsure ?? 0, color: "var(--warning)" }, { label: "Fără răspuns", value: summary.rsvp.noResponse ?? 0, color: "var(--line-strong)" }];
  return <div className="mx-auto max-w-7xl space-y-5"><PageHeader title="RSVP" description="Răspunsurile invitaților, persistente și izolate pe workspace." actions={<><Button variant="outline" size="sm" disabled={!capabilities.includes("rsvp.configure") || demoMode} onClick={openFormEditor}><FilePenLine className="size-3.5" />Editează formularul</Button><Button variant="outline" size="sm" disabled={!capabilities.includes("guest.export") || demoMode} onClick={() => void exportRsvp()}><Download className="size-3.5" />Export</Button><Button variant="outline" size="sm" disabled={!form?.draft || !capabilities.includes("rsvp.configure") || demoMode || saving} onClick={() => void publish()}><CalendarClock className="size-3.5" />Publică formularul</Button><Button size="sm" disabled={!site?.published || !capabilities.includes("campaign.send") || demoMode || saving} onClick={() => void reminder()}><BellPlus className="size-4" />Reamintire</Button></>} />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"><StatCard label="Confirmați" value={summary.rsvp.confirmed ?? 0} /><StatCard label="Refuzați" value={summary.rsvp.declined ?? 0} /><StatCard label="Nesiguri" value={summary.rsvp.unsure ?? 0} /><StatCard label="Fără răspuns" value={summary.rsvp.noResponse ?? 0} tone="warning" /><StatCard label="Meniu incomplet" value={summary.menu.incomplete} tone="warning" href="/menus" /><StatCard label="Households parțiale" value={summary.rsvp.partialHouseholds ?? 0} /></div>
    {error ? <Card><CardContent className="p-6 text-sm text-danger">{error}</CardContent></Card> : loading ? <Card><CardContent className="p-8 text-sm text-muted">Se încarcă RSVP real…</CardContent></Card> : guests.length === 0 ? <EmptyState icon={BellPlus} title="Nu există invitați" description="Adaugă invitați înainte de a colecta RSVP." /> : <><div className="grid grid-cols-1 gap-5 lg:grid-cols-3"><Card><CardHeader><CardTitle>Progres răspunsuri</CardTitle></CardHeader><CardContent className="flex flex-col items-center gap-5 sm:flex-row"><Donut segments={segments} size={150} thickness={18} centerValue={`${summary.totalGuests ? Math.round(((summary.rsvp.confirmed ?? 0) / summary.totalGuests) * 100) : 0}%`} centerLabel="confirmări" /><DonutLegend items={segments.map((item) => ({ color: item.color, label: item.label, value: String(item.value) }))} /></CardContent></Card><Card className="lg:col-span-2"><CardContent className="p-5"><p className="text-sm font-semibold">Formular</p><p className="mt-2 text-sm text-muted">Stare: <Badge variant={form?.status === "published" ? "success" : "warning"}>{form?.status ?? "neconfigurat"}</Badge></p><p className="mt-2 text-xs text-faint">Răspunsurile pot fi editate de invitat numai în limitele versiunii publicate și ale deadline-ului.</p></CardContent></Card></div><Table minWidth="720px"><THead><TR><TH>Invitat</TH><TH>Gospodărie</TH><TH>RSVP</TH><TH>Meniu</TH><TH>Logistică</TH></TR></THead><TBody>{guests.map((guest) => <TR key={guest.id}><TD><span className="flex items-center gap-2"><Avatar name={`${guest.firstName} ${guest.lastName}`} size="xs" /><span className="font-medium">{guest.firstName} {guest.lastName}</span></span></TD><TD>{guest.householdName ?? "—"}</TD><TD><Badge variant={guest.rsvpStatus === "confirmed" ? "success" : guest.rsvpStatus === "declined" ? "danger" : guest.rsvpStatus === "unsure" ? "warning" : "neutral"}>{guest.rsvpStatus ?? "no-response"}</Badge></TD><TD>{guest.menuName ?? "—"}</TD><TD>{[guest.needsTransport && "transport", guest.needsAccommodation && "cazare"].filter(Boolean).join(", ") || "—"}</TD></TR>)}</TBody></Table></>}
    <Modal open={Boolean(reminderCampaign)} onClose={() => { if (!saving) { setReminderCampaign(null); setReminderAudience(null); } }} title="Confirmă reamintirea RSVP" description="Audiența este reverificată de server înainte ca mesajele să intre în coadă." size="sm"><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-success-soft p-4"><p className="text-2xl font-semibold text-success">{reminderAudience?.valid ?? "—"}</p><p className="mt-1 text-sm text-ink">destinatari valizi</p></div><div className="rounded-xl bg-subtle p-4"><p className="text-2xl font-semibold text-ink">{reminderAudience?.invalid ?? "—"}</p><p className="mt-1 text-sm text-muted">fără adresă validă</p></div></div><p className="text-sm leading-relaxed text-muted">{reminderAudience?.total ?? 0} accesuri sunt eligibile pentru această reamintire. Mesajele trimise nu mai pot fi retrase.</p><div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={() => { setReminderCampaign(null); setReminderAudience(null); }}>Renunță</Button><Button type="button" loading={saving} disabled={saving || !reminderAudience?.valid} onClick={() => void sendReminder()}><BellPlus className="size-4" />Trimite către {reminderAudience?.valid ?? 0}</Button></div></div></Modal>
    <Modal open={formOpen} onClose={() => setFormOpen(false)} title="Configurare formular RSVP" description="Alegi exact ce întrebări văd invitații. Modificările devin publice numai după publicare." size="lg"><form className="space-y-5" onSubmit={saveForm}><div className="grid gap-4 sm:grid-cols-2"><Field label="Termen RSVP"><Input name="deadline" type="datetime-local" value={formConfig.deadline} onChange={(event) => setConfig("deadline", event.target.value)} /></Field><Field label="Limba formularului"><Select value={formConfig.language} onChange={(event) => setConfig("language", event.target.value)}><option value="ro">Română</option></Select></Field></div><div className="rounded-xl border border-line p-4"><p className="text-sm font-semibold text-ink">Participare</p><div className="mt-2 divide-y divide-line"><Switch checked={formConfig.attendanceEnabled} onCheckedChange={(value) => setConfig("attendanceEnabled", value)} label="Colectează participarea" description="Invitații pot confirma, refuza sau răspunde «nu sunt sigur»." /><Switch checked={formConfig.perEventAttendance} disabled={!formConfig.attendanceEnabled} onCheckedChange={(value) => setConfig("perEventAttendance", value)} label="Răspuns separat pentru fiecare eveniment" description="Util pentru ceremonie, petrecere sau brunch cu audiențe diferite." /><Switch checked={formConfig.plusOneQuestion} onCheckedChange={(value) => setConfig("plusOneQuestion", value)} label="Permite răspuns pentru însoțitor" description="Afișează întrebarea de plus-one când accesul invitatului permite." /><Switch checked={formConfig.childrenConfirmation} onCheckedChange={(value) => setConfig("childrenConfirmation", value)} label="Confirmare pentru copii" description="Adulții răspund și pentru copiii din gospodărie." /><Switch checked={formConfig.allowEdits} onCheckedChange={(value) => setConfig("allowEdits", value)} label="Permite modificarea răspunsului" description="După prima trimitere, invitatul poate reveni până la termen." /></div></div><div className="rounded-xl border border-line p-4"><p className="text-sm font-semibold text-ink">Întrebări suplimentare</p><div className="mt-2 grid gap-x-6 sm:grid-cols-2"><Switch checked={formConfig.menuSelection} onCheckedChange={(value) => setConfig("menuSelection", value)} label="Alegerea meniului" /><Switch checked={formConfig.allergyCollection} onCheckedChange={(value) => setConfig("allergyCollection", value)} label="Alergii și restricții alimentare" /><Switch checked={formConfig.accessibilityCollection} onCheckedChange={(value) => setConfig("accessibilityCollection", value)} label="Nevoi de accesibilitate" /><Switch checked={formConfig.transportQuestion} onCheckedChange={(value) => setConfig("transportQuestion", value)} label="Are nevoie de transport" /><Switch checked={formConfig.accommodationQuestion} onCheckedChange={(value) => setConfig("accommodationQuestion", value)} label="Are nevoie de cazare" /><Switch checked={formConfig.guestMessage} onCheckedChange={(value) => setConfig("guestMessage", value)} label="Mesaj pentru organizatori" /></div></div><Field label="Mesaj afișat după închiderea RSVP"><Textarea value={formConfig.closedMessage} onChange={(event) => setConfig("closedMessage", event.target.value)} rows={3} maxLength={1000} /></Field><p className="rounded-lg bg-subtle p-3 text-xs leading-relaxed text-muted">Ciorna este versionată. Invitații continuă să vadă ultima versiune publicată până când apeși „Publică formularul”.</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Renunță</Button><Button type="submit" loading={saving} disabled={saving || !formConfig.closedMessage.trim()}>Salvează ciorna</Button></div></form></Modal>
  </div>;
}

function configFromResource(form: RsvpFormResource | null): RsvpConfig {
  const version = (form?.draft ?? form?.published ?? {}) as Record<string, unknown>;
  const config = (version.config ?? {}) as Record<string, unknown>;
  const boolean = (key: keyof RsvpConfig) => config[key] !== false;
  const languages = Array.isArray(config.languages) ? config.languages : [];
  return {
    deadline: isoToLocalInput(typeof config.deadline === "string" ? config.deadline : null),
    attendanceEnabled: boolean("attendanceEnabled"),
    perEventAttendance: boolean("perEventAttendance"),
    plusOneQuestion: boolean("plusOneQuestion"),
    childrenConfirmation: boolean("childrenConfirmation"),
    menuSelection: boolean("menuSelection"),
    allergyCollection: boolean("allergyCollection"),
    accessibilityCollection: boolean("accessibilityCollection"),
    transportQuestion: boolean("transportQuestion"),
    accommodationQuestion: boolean("accommodationQuestion"),
    guestMessage: boolean("guestMessage"),
    allowEdits: boolean("allowEdits"),
    closedMessage: typeof config.closedMessage === "string" ? config.closedMessage : defaultRsvpConfig.closedMessage,
    language: typeof languages[0] === "string" ? languages[0] : "ro",
  };
}

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function waitForJob(jobId: string) { for (let attempt = 0; attempt < 60; attempt += 1) { const job = await weddingOsApi.job(jobId); if (job.status === "completed") return; if (["failed", "dead_letter", "cancelled"].includes(job.status)) throw new Error(job.error?.message ?? "Job eșuat"); await new Promise((resolve) => window.setTimeout(resolve, 500)); } throw new Error("Exportul nu s-a încheiat la timp"); }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }
