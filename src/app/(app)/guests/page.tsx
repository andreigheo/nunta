"use client";

import * as React from "react";
import { Archive, Download, Search, Send, Tag, Upload, UserPlus, Users, UsersRound } from "lucide-react";
import type {
  CampaignResource, GuestImportResource, GuestImportRowResource, GuestResource,
  GuestTagResource, HouseholdResource,
} from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Avatar, Badge, Button, Card, CardContent, Checkbox, Drawer, EmptyState, Field, Input,
  Modal, PageHeader, Select, StatCard, Table, Tabs, TabsContent, TabsList,
  TabsTrigger, TBody, TD, Textarea, TH, THead, TR, useToast,
} from "@/components/ui";

const invitationLabel: Record<string, string> = {
  NOT_PREPARED: "Nepregătită", READY: "Pregătită", QUEUED: "În coadă",
  SENT: "Trimisă", OPENED: "Deschisă", PARTIALLY_RESPONDED: "RSVP parțial",
  RESPONDED: "RSVP complet",
};

type Summary = {
  totalGuests: number;
  totalHouseholds: number;
  invitation: Record<string, number>;
  rsvp: Record<string, number>;
  people: { adults: number; children: number; plusOnes: number };
  menu: { complete: number; incomplete: number; allergyIssues: number };
  logistics: { transportRequested: number; accommodationRequested: number };
};

const emptySummary: Summary = {
  totalGuests: 0, totalHouseholds: 0, invitation: {}, rsvp: {},
  people: { adults: 0, children: 0, plusOnes: 0 },
  menu: { complete: 0, incomplete: 0, allergyIssues: 0 },
  logistics: { transportRequested: 0, accommodationRequested: 0 },
};

type GuestDetail = GuestResource & {
  communication?: Array<{
    id: string;
    channel: string;
    direction: string;
    summary: string;
    occurredAt: string;
  }>;
};

type ImportReview = {
  resource: GuestImportResource;
  rows: GuestImportRowResource[];
};

const importFieldLabels: Record<string, string> = {
  firstName: "Prenume",
  lastName: "Nume",
  email: "Email",
  phone: "Telefon",
  household: "Gospodărie",
};

export default function GuestsPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [guests, setGuests] = React.useState<GuestResource[]>([]);
  const [households, setHouseholds] = React.useState<HouseholdResource[]>([]);
  const [tags, setTags] = React.useState<GuestTagResource[]>([]);
  const [campaigns, setCampaigns] = React.useState<CampaignResource[]>([]);
  const [summary, setSummary] = React.useState<Summary>(emptySummary);
  const [query, setQuery] = React.useState("");
  const [side, setSide] = React.useState("");
  const [rsvpStatus, setRsvpStatus] = React.useState("");
  const [invitationStatus, setInvitationStatus] = React.useState("");
  const [menuStatus, setMenuStatus] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [sort, setSort] = React.useState("last_name");
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkCommand, setBulkCommand] = React.useState("ADD_TAG");
  const [bulkTarget, setBulkTarget] = React.useState("");
  const [tagOpen, setTagOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [guestOpen, setGuestOpen] = React.useState(false);
  const [householdOpen, setHouseholdOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<GuestDetail | null>(null);
  const [selectedHousehold, setSelectedHousehold] = React.useState<HouseholdResource | null>(null);
  const [guestKind, setGuestKind] = React.useState<"adult" | "child" | "plus_one">("adult");
  const [primaryGuestId, setPrimaryGuestId] = React.useState("");
  const [importReview, setImportReview] = React.useState<ImportReview | null>(null);
  const [importMapping, setImportMapping] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("guest.write");
  const canImport = capabilities.includes("guest.import");
  const canExport = capabilities.includes("guest.export");

  const load = React.useCallback(async (search: string, cursor?: string, append = false) => {
    if (!currentWorkspace || demoMode) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [guestData, householdData, tagData, campaignData] = await Promise.all([
        weddingOsApi.guests(currentWorkspace.id, {
          search: search || undefined, side: side || undefined,
          rsvpStatus: rsvpStatus || undefined, invitationStatus: invitationStatus || undefined,
          menuStatus: menuStatus || undefined, tag: tagFilter || undefined,
          sort, cursor, limit: "25",
        }),
        weddingOsApi.households(currentWorkspace.id),
        weddingOsApi.guestTags(currentWorkspace.id),
        weddingOsApi.campaigns(currentWorkspace.id),
      ]);
      setGuests((current) => append ? [...current, ...guestData.items] : guestData.items);
      setHouseholds(householdData.items);
      setTags(tagData.items);
      setCampaigns(campaignData.items);
      setNextCursor(guestData.nextCursor);
      setSummary(guestData.summary as Summary);
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }, [currentWorkspace, demoMode, invitationStatus, menuStatus, rsvpStatus, side, sort, tagFilter]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const createHousehold = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await weddingOsApi.createHousehold(currentWorkspace.id, {
        name: String(form.get("name")), preferredLanguage: "ro",
        city: String(form.get("city") || "") || null, side: String(form.get("side")) as "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER",
      });
      setHouseholdOpen(false); toast({ title: "Gospodărie creată", variant: "success" }); await load("");
    } catch (caught) { toast({ title: "Gospodăria nu a fost creată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const createGuest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      const primary = guestKind === "plus_one"
        ? guests.find((guest) => guest.id === primaryGuestId)
        : undefined;
      await weddingOsApi.createGuest(currentWorkspace.id, {
        householdId: primary?.householdId ?? String(form.get("householdId")), firstName: String(form.get("firstName")), lastName: String(form.get("lastName")),
        email: String(form.get("email") || "") || null, phone: String(form.get("phone") || "") || null,
        preferredLanguage: "ro", side: String(form.get("side")) as "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER",
        isChild: guestKind === "child", dateOfBirth: String(form.get("dateOfBirth") || "") || null,
        isPlusOne: guestKind === "plus_one", primaryGuestId: primary?.id ?? null,
        plusOneAllowed: form.get("plusOneAllowed") === "on",
        needsTransport: form.get("needsTransport") === "on",
        needsAccommodation: form.get("needsAccommodation") === "on",
      });
      setGuestOpen(false); setGuestKind("adult"); setPrimaryGuestId("");
      toast({ title: guestKind === "child" ? "Copil adăugat" : guestKind === "plus_one" ? "Plus-unu adăugat" : "Invitat adăugat", variant: "success" }); await load("");
    } catch (caught) { toast({ title: "Invitatul nu a fost adăugat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const createTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await weddingOsApi.createGuestTag(currentWorkspace.id, { name: String(form.get("name")), color: String(form.get("color") || "") || null });
      setTagOpen(false); toast({ title: "Etichetă creată", variant: "success" }); await load(query);
    } catch (caught) { toast({ title: "Eticheta nu a fost creată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const runBulk = async () => {
    if (!currentWorkspace || demoMode || selectedIds.size === 0) return;
    const guestIds = [...selectedIds];
    const command: Record<string, unknown> = { command: bulkCommand, guestIds };
    if (["ADD_TAG", "REMOVE_TAG"].includes(bulkCommand)) command.tagId = bulkTarget;
    if (bulkCommand === "ADD_TO_CAMPAIGN") command.campaignId = bulkTarget;
    if (bulkCommand === "MOVE_TO_HOUSEHOLD") command.householdId = bulkTarget;
    setSaving(true);
    try {
      await weddingOsApi.bulkGuests(currentWorkspace.id, command);
      setSelectedIds(new Set());
      toast({ title: "Acțiune aplicată", description: `${guestIds.length} invitați au fost procesați.`, variant: "success" });
      await load(query);
    } catch (caught) { toast({ title: "Acțiunea bulk a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const openGuest = async (guest: GuestResource) => {
    setSelected(guest);
    if (!currentWorkspace || demoMode) return;
    try { setSelected(await weddingOsApi.guest(currentWorkspace.id, guest.id)); }
    catch (caught) { toast({ title: "Detaliile nu au putut fi încărcate", description: apiErrorMessage(caught), variant: "error" }); }
  };

  const updateGuest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || !selected || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      const logisticsOnly = form.get("formScope") === "logistics";
      const input = logisticsOnly ? {
        needsTransport: form.get("needsTransport") === "on",
        needsAccommodation: form.get("needsAccommodation") === "on",
      } : {
        firstName: String(form.get("firstName")), lastName: String(form.get("lastName")),
        email: String(form.get("email") || "") || null, phone: String(form.get("phone") || "") || null,
        householdId: String(form.get("householdId")), side: String(form.get("side")),
        relationship: String(form.get("relationship") || "") || null,
        category: String(form.get("category") || "") || null,
        plusOneAllowed: form.get("plusOneAllowed") === "on",
      };
      await weddingOsApi.updateGuest(currentWorkspace.id, selected.id, selected.version, input);
      setSelected(null); toast({ title: "Invitat actualizat", variant: "success" }); await load(query);
    } catch (caught) { toast({ title: "Actualizarea a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const archiveGuest = async () => {
    if (!currentWorkspace || !selected || demoMode) return;
    setSaving(true);
    try {
      await weddingOsApi.archiveGuest(currentWorkspace.id, selected.id, selected.version);
      setSelected(null); toast({ title: "Invitat arhivat", variant: "success" }); await load("");
    } catch (caught) { toast({ title: "Arhivarea a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const savePrivateNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || !selected || demoMode) return;
    const form = new FormData(event.currentTarget);
    const note = String(form.get("notesPrivate") || "").trim();
    if (!note) return;
    setSaving(true);
    try {
      const updated = await weddingOsApi.updateGuest(currentWorkspace.id, selected.id, selected.version, { notesPrivate: note });
      setSelected({ ...updated, communication: selected.communication });
      event.currentTarget.reset();
      toast({ title: "Notă privată salvată", description: "Conținutul este criptat și nu este returnat în listări.", variant: "success" });
    } catch (caught) { toast({ title: "Nota nu a fost salvată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const updateHousehold = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || !selectedHousehold || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await weddingOsApi.updateHousehold(currentWorkspace.id, selectedHousehold.id, selectedHousehold.version, {
        name: String(form.get("name")), city: String(form.get("city") || "") || null,
        side: String(form.get("side")) as "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER",
      });
      setSelectedHousehold(null); toast({ title: "Gospodărie actualizată", variant: "success" }); await load(query);
    } catch (caught) { toast({ title: "Actualizarea gospodăriei a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const archiveHousehold = async () => {
    if (!currentWorkspace || !selectedHousehold || demoMode) return;
    setSaving(true);
    try {
      await weddingOsApi.archiveHousehold(currentWorkspace.id, selectedHousehold.id, selectedHousehold.version);
      setSelectedHousehold(null); toast({ title: "Gospodărie arhivată", variant: "success" }); await load(query);
    } catch (caught) { toast({ title: "Arhivarea gospodăriei a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const refreshImportReview = async (importId: string, resource?: GuestImportResource) => {
    if (!currentWorkspace) return;
    const [nextResource, rowData] = await Promise.all([
      resource ? Promise.resolve(resource) : weddingOsApi.guestImport(currentWorkspace.id, importId),
      weddingOsApi.guestImportRows(currentWorkspace.id, importId),
    ]);
    setImportReview({ resource: nextResource, rows: rowData.items });
    setImportMapping(Object.fromEntries(Object.entries(nextResource.mapping).filter((entry): entry is [string, string] => typeof entry[1] === "string")));
  };

  const importFile = async (file: File) => {
    if (!currentWorkspace || demoMode) return;
    try {
      const result = await weddingOsApi.uploadGuestImport(currentWorkspace.id, file);
      toast({ title: "Import pus în coadă", description: `Job ${result.job.id.slice(0, 8)} procesează fișierul.`, variant: "info" });
      await waitForJob(result.job.id); await refreshImportReview(result.import.id);
      toast({ title: "Fișier analizat", description: "Verifică rândurile și duplicatele înainte de commit.", variant: "success" });
    } catch (caught) { toast({ title: "Importul a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
  };

  const saveImportMapping = async () => {
    if (!currentWorkspace || !importReview) return;
    setSaving(true);
    try {
      const resource = await weddingOsApi.updateGuestImportMapping(currentWorkspace.id, importReview.resource.id, importReview.resource.version, importMapping);
      await refreshImportReview(resource.id, resource);
      toast({ title: "Coloane confirmate", description: "Previzualizarea este pregătită pentru deciziile finale.", variant: "success" });
    } catch (caught) { toast({ title: "Maparea nu a fost salvată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const decideImportRow = async (row: GuestImportRowResource, decision: "CREATE_NEW" | "MERGE_WITH_EXISTING" | "SKIP") => {
    if (!currentWorkspace || !importReview) return;
    setSaving(true);
    try {
      const updated = await weddingOsApi.decideGuestImportRow(
        currentWorkspace.id, importReview.resource.id, row.id, row.version, decision,
        decision === "MERGE_WITH_EXISTING" ? row.duplicateGuestId ?? undefined : undefined,
      );
      setImportReview((current) => current ? { ...current, rows: current.rows.map((item) => item.id === updated.id ? updated : item) } : current);
    } catch (caught) { toast({ title: "Decizia nu a fost salvată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const commitImport = async () => {
    if (!currentWorkspace || !importReview) return;
    setSaving(true);
    try {
      const result = await weddingOsApi.commitGuestImport(currentWorkspace.id, importReview.resource.id, importReview.resource.version);
      setImportReview(null); await load("");
      toast({ title: "Import finalizat", description: `${result.committedRows} rânduri au fost aplicate.`, variant: "success" });
    } catch (caught) { toast({ title: "Importul nu a fost aplicat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const exportGuests = async () => {
    if (!currentWorkspace || demoMode) return;
    try {
      const { job } = await weddingOsApi.createGuestExport(currentWorkspace.id, { format: "xlsx", includeContactData: capabilities.includes("guest.read_pii"), includeRsvp: true, includeMenu: true, includeAllergies: capabilities.includes("guest.read_sensitive"), includeLogistics: true });
      toast({ title: "Export pus în coadă", description: "Fișierul va fi descărcat după generare.", variant: "info" });
      await waitForJob(job.id); const blob = await weddingOsApi.downloadJobArtifact(job.id); downloadBlob(blob, "weddingos-guests.xlsx");
      toast({ title: "Export descărcat", variant: "success" });
    } catch (caught) { toast({ title: "Exportul a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
  };

  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="CRM Invitați" description="Fiecare persoană, gospodărie și detaliu logistic — într-un singur loc." actions={<>
      <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} />
      <Button variant="outline" size="sm" disabled={!canImport || demoMode} onClick={() => fileRef.current?.click()}><Upload className="size-3.5" />Import</Button>
      <Button variant="outline" size="sm" disabled={!canExport || demoMode} onClick={() => void exportGuests()}><Download className="size-3.5" />Export</Button>
      <Button variant="secondary" size="sm" disabled={!canWrite || demoMode} onClick={() => setHouseholdOpen(true)}><UsersRound className="size-3.5" />Gospodărie</Button>
      <Button size="sm" disabled={!canWrite || demoMode || households.length === 0} onClick={() => setGuestOpen(true)}><UserPlus className="size-4" />Invitat</Button>
    </>} />

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
      <StatCard label="Total" value={summary.totalGuests} /><StatCard label="Gospodării" value={summary.totalHouseholds} />
      <StatCard label="Confirmați" value={summary.rsvp.confirmed ?? 0} href="/rsvp" /><StatCard label="Refuzați" value={summary.rsvp.declined ?? 0} />
      <StatCard label="Fără răspuns" value={summary.rsvp.noResponse ?? 0} tone="warning" /><StatCard label="Copii" value={summary.people.children} />
      <StatCard label="Plus-unu" value={summary.people.plusOnes} /><StatCard label="Alergii" value={summary.menu.allergyIssues} tone={summary.menu.allergyIssues ? "danger" : undefined} />
    </div>

    <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
      <Field label="Căutare" className="min-w-64 flex-1"><Input icon={<Search className="size-4" />} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nume, gospodărie sau contact…" /></Field>
      <Field label="Parte"><Select value={side} onChange={(event) => setSide(event.target.value)}><option value="">Toate</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option><option value="COMMON">Comună</option></Select></Field>
      <Field label="RSVP"><Select value={rsvpStatus} onChange={(event) => setRsvpStatus(event.target.value)}><option value="">Toate</option><option value="CONFIRMED">Confirmat</option><option value="DECLINED">Refuzat</option><option value="UNSURE">Nehotărât</option><option value="NO_RESPONSE">Fără răspuns</option></Select></Field>
      <Field label="Invitație"><Select value={invitationStatus} onChange={(event) => setInvitationStatus(event.target.value)}><option value="">Toate</option><option value="NOT_PREPARED">Nepregătită</option><option value="READY">Pregătită</option><option value="SENT">Trimisă</option><option value="OPENED">Deschisă</option><option value="RESPONDED">RSVP complet</option></Select></Field>
      <Field label="Meniu"><Select value={menuStatus} onChange={(event) => setMenuStatus(event.target.value)}><option value="">Toate</option><option value="complete">Selectat</option><option value="incomplete">Lipsă</option></Select></Field>
      <Field label="Etichetă"><Select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">Toate</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</Select></Field>
      <Field label="Sortare"><Select value={sort} onChange={(event) => setSort(event.target.value)}><option value="last_name">Nume</option><option value="first_name">Prenume</option><option value="created_at">Adăugați recent</option></Select></Field>
      <Button size="sm" variant="outline" disabled={!canWrite || demoMode} onClick={() => setTagOpen(true)}><Tag className="size-3.5" />Etichetă nouă</Button>
    </CardContent></Card>
    {selectedIds.size > 0 && <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
      <p className="mr-auto text-sm font-medium">{selectedIds.size} selectați</p>
      <Field label="Acțiune"><Select value={bulkCommand} onChange={(event) => { setBulkCommand(event.target.value); setBulkTarget(""); }}><option value="ADD_TAG">Adaugă etichetă</option><option value="REMOVE_TAG">Elimină etichetă</option><option value="MOVE_TO_HOUSEHOLD">Mută în gospodărie</option><option value="CREATE_INVITATION_RECIPIENTS">Pregătește invitații</option><option value="ADD_TO_CAMPAIGN">Adaugă în campanie</option><option value="SEND_RSVP_REMINDER">Trimite reminder RSVP</option><option value="ARCHIVE">Arhivează</option></Select></Field>
      {["ADD_TAG", "REMOVE_TAG"].includes(bulkCommand) && <Field label="Etichetă"><Select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)}><option value="">Alege</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</Select></Field>}
      {bulkCommand === "MOVE_TO_HOUSEHOLD" && <Field label="Gospodărie"><Select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)}><option value="">Alege</option>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {bulkCommand === "ADD_TO_CAMPAIGN" && <Field label="Campanie draft"><Select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)}><option value="">Alege</option>{campaigns.filter((campaign) => campaign.status === "draft").map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></Field>}
      <Button size="sm" disabled={saving || (["ADD_TAG", "REMOVE_TAG", "MOVE_TO_HOUSEHOLD", "ADD_TO_CAMPAIGN"].includes(bulkCommand) && !bulkTarget)} onClick={() => void runBulk()}><Send className="size-3.5" />Aplică</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Anulează selecția</Button>
    </CardContent></Card>}
    {error ? <Card><CardContent className="p-6"><p className="text-sm text-danger">{error}</p><Button className="mt-3" size="sm" onClick={() => void load(query)}>Reîncearcă</Button></CardContent></Card> :
      loading ? <Card><CardContent className="p-8 text-sm text-muted">Se încarcă lista reală de invitați…</CardContent></Card> :
      guests.length === 0 ? <EmptyState icon={Users} title="Lista de invitați este goală" description="Adaugă prima gospodărie și primul invitat sau importă lista din CSV/XLSX." action={canWrite && !demoMode ? { label: "Adaugă gospodărie", onClick: () => setHouseholdOpen(true) } : undefined} /> :
      <><Table minWidth="1040px"><THead><TR><TH><Checkbox aria-label="Selectează pagina" checked={guests.length > 0 && guests.every((guest) => selectedIds.has(guest.id))} onCheckedChange={(checked) => setSelectedIds(checked ? new Set(guests.map((guest) => guest.id)) : new Set())} /></TH><TH>Invitat</TH><TH>Gospodărie</TH><TH>Contact</TH><TH>Partea</TH><TH>Invitație</TH><TH>RSVP / Meniu</TH><TH>Logistică</TH></TR></THead><TBody>
        {guests.map((guest) => <TR key={guest.id} onClick={() => void openGuest(guest)}>
          <TD><span onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Selectează ${guest.firstName} ${guest.lastName}`} checked={selectedIds.has(guest.id)} onCheckedChange={(checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(guest.id); else next.delete(guest.id); return next; })} /></span></TD>
          <TD><span className="flex items-center gap-2"><Avatar name={`${guest.firstName} ${guest.lastName}`} size="xs" /><span><span className="font-medium">{guest.firstName} {guest.lastName}</span><span className="mt-1 flex gap-1">{guest.tags.map((tag) => <Badge key={tag.id} variant="neutral">{tag.name}</Badge>)}</span></span>{guest.isChild && <Badge variant="info">Copil</Badge>}{guest.isPlusOne && <Badge variant="neutral">+1</Badge>}</span></TD>
          <TD className="text-muted"><button type="button" className="text-left hover:text-brand hover:underline" onClick={(event) => { event.stopPropagation(); setSelectedHousehold(households.find((item) => item.id === guest.householdId) ?? null); }}>{guest.householdName ?? households.find((item) => item.id === guest.householdId)?.name ?? "—"}</button></TD>
          <TD className="text-muted">{guest.email ?? guest.phone ?? "Protejat / absent"}</TD><TD><Badge variant="neutral">{guest.side.replaceAll("_", " ")}</Badge></TD>
          <TD><Badge variant="brand">{invitationLabel[guest.invitationStatus ?? ""] ?? "Nepregătită"}</Badge></TD><TD className="text-muted">{guest.rsvpStatus?.replaceAll("-", " ") ?? "fără răspuns"}<br />{guest.menuName ?? "meniu lipsă"}</TD>
          <TD className="text-muted">{[guest.needsTransport && "transport", guest.needsAccommodation && "cazare"].filter(Boolean).join(", ") || "—"}</TD>
        </TR>)}
      </TBody></Table>{nextCursor && <div className="flex justify-center pt-3"><Button variant="outline" size="sm" disabled={loading} onClick={() => void load(query, nextCursor, true)}>Încarcă următorii invitați</Button></div>}</>}

    <Modal open={householdOpen} onClose={() => setHouseholdOpen(false)} title="Gospodărie nouă"><form id="household-form" className="space-y-4" onSubmit={createHousehold}><Field label="Nume" required><Input name="name" required /></Field><Field label="Oraș"><Input name="city" /></Field><Field label="Parte"><Select name="side" defaultValue="COMMON"><option value="COMMON">Comună</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option></Select></Field><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setHouseholdOpen(false)}>Renunță</Button><Button type="submit" disabled={saving}>Creează</Button></div></form></Modal>
    <Modal open={guestOpen} onClose={() => { setGuestOpen(false); setGuestKind("adult"); setPrimaryGuestId(""); }} title="Invitat nou" description="Adaugă un adult, un copil sau persoana plus-unu aprobată pentru un invitat.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={createGuest}>
        <Field label="Tip" className="sm:col-span-2"><Select value={guestKind} onChange={(event) => { setGuestKind(event.target.value as typeof guestKind); setPrimaryGuestId(""); }}><option value="adult">Adult</option><option value="child">Copil</option><option value="plus_one">Plus-unu</option></Select></Field>
        <Field label="Prenume" required><Input name="firstName" required /></Field><Field label="Nume" required><Input name="lastName" required /></Field>
        {guestKind === "plus_one" ? <Field label="Invitat principal" required className="sm:col-span-2"><Select value={primaryGuestId} onChange={(event) => setPrimaryGuestId(event.target.value)} required><option value="">Alege invitatul cu plus-unu permis</option>{guests.filter((guest) => guest.plusOneAllowed && !guest.isChild && !guest.isPlusOne).map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName}</option>)}</Select></Field> : <Field label="Gospodărie" required className="sm:col-span-2"><Select name="householdId" required>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
        {guestKind === "child" && <Field label="Data nașterii"><Input name="dateOfBirth" type="date" /></Field>}
        <Field label="Parte"><Select name="side" defaultValue="COMMON"><option value="COMMON">Comună</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option><option value="OTHER">Altele</option></Select></Field>
        <Field label="Email"><Input name="email" type="email" /></Field><Field label="Telefon"><Input name="phone" /></Field>
        <div className="grid gap-2 rounded-xl bg-subtle p-3 text-sm sm:col-span-2">
          {guestKind === "adult" && <label className="flex items-center gap-2"><input name="plusOneAllowed" type="checkbox" className="size-4 accent-brand" />Permite adăugarea unui plus-unu</label>}
          <label className="flex items-center gap-2"><input name="needsTransport" type="checkbox" className="size-4 accent-brand" />Are nevoie de transport</label>
          <label className="flex items-center gap-2"><input name="needsAccommodation" type="checkbox" className="size-4 accent-brand" />Are nevoie de cazare</label>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setGuestOpen(false)}>Renunță</Button><Button type="submit" disabled={saving || (guestKind === "plus_one" && !primaryGuestId)}>Adaugă</Button></div>
      </form>
    </Modal>
    <Modal open={tagOpen} onClose={() => setTagOpen(false)} title="Etichetă nouă"><form className="space-y-4" onSubmit={createTag}><Field label="Nume" required><Input name="name" required /></Field><Field label="Culoare" hint="Format hex, de exemplu #6d5dfc"><Input name="color" defaultValue="#6d5dfc" pattern="#[0-9a-fA-F]{6}" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setTagOpen(false)}>Renunță</Button><Button type="submit" disabled={saving}>Creează</Button></div></form></Modal>
    <Modal open={Boolean(selectedHousehold)} onClose={() => setSelectedHousehold(null)} title="Editează gospodăria" description={selectedHousehold ? `${selectedHousehold.guestsCount} persoane asociate` : undefined}>{selectedHousehold && <form key={`${selectedHousehold.id}:${selectedHousehold.version}`} className="space-y-4" onSubmit={updateHousehold}><Field label="Nume" required><Input name="name" defaultValue={selectedHousehold.name} required /></Field><Field label="Oraș"><Input name="city" defaultValue={selectedHousehold.city ?? ""} /></Field><Field label="Parte"><Select name="side" defaultValue={sideInput(selectedHousehold.side)}><option value="COMMON">Comună</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option><option value="OTHER">Altele</option></Select></Field><p className="text-xs text-faint">Mutarea persoanelor se face din acțiunile bulk ale listei.</p><div className="flex justify-between gap-2"><Button type="button" variant="destructive" disabled={saving || !capabilities.includes("guest.archive")} onClick={() => void archiveHousehold()}><Archive className="size-4" />Arhivează</Button><span className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setSelectedHousehold(null)}>Renunță</Button><Button type="submit" disabled={saving}>Salvează</Button></span></div></form>}</Modal>
    <Modal open={Boolean(importReview)} onClose={() => setImportReview(null)} title="Revizuire import invitați" description={importReview?.resource.sourceFileName} size="full">
      {importReview && <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><StatCard label="Rânduri" value={importReview.resource.totalRows} /><StatCard label="Valide" value={importReview.resource.validRows} /><StatCard label="Erori" value={importReview.resource.invalidRows} tone={importReview.resource.invalidRows ? "danger" : undefined} /><StatCard label="Duplicate" value={importReview.resource.duplicateRows} tone={importReview.resource.duplicateRows ? "warning" : undefined} /><StatCard label="Aplicate" value={importReview.resource.committedRows} /></div>
        <Card><CardContent className="space-y-4 p-4"><div><h3 className="font-medium">1. Mapează coloanele</h3><p className="text-sm text-muted">Verifică asocierea coloanelor înainte de a decide ce se întâmplă cu fiecare rând.</p></div><div className="grid gap-3 sm:grid-cols-5">{Object.entries(importFieldLabels).map(([key, label]) => <Field key={key} label={label} required={key === "firstName" || key === "lastName"}><Select aria-label={`Coloană ${label}`} value={importMapping[key] ?? ""} onChange={(event) => setImportMapping((current) => ({ ...current, [key]: event.target.value }))}><option value="">Nu importa</option>{Object.keys(importReview.rows[0]?.rawDataRedacted ?? {}).map((header) => <option key={header} value={header}>{header}</option>)}</Select></Field>)}</div><Button size="sm" variant="outline" disabled={saving || !importMapping.firstName || !importMapping.lastName} onClick={() => void saveImportMapping()}>Confirmă maparea</Button></CardContent></Card>
        <div><h3 className="font-medium">2. Previzualizează și rezolvă duplicatele</h3><p className="text-sm text-muted">Datele de contact brute sunt mascate. Un rând cu erori este omis automat.</p></div>
        <Table minWidth="900px"><THead><TR><TH>Rând</TH><TH>Persoană</TH><TH>Contact</TH><TH>Gospodărie</TH><TH>Validare</TH><TH>Decizie</TH></TR></THead><TBody>{importReview.rows.map((row) => <TR key={row.id}><TD>{row.rowNumber}</TD><TD className="font-medium">{importValue(row, "firstName")} {importValue(row, "lastName")}</TD><TD className="text-muted">{importValue(row, "email") || importValue(row, "phone") || "—"}</TD><TD className="text-muted">{importValue(row, "household") || "—"}</TD><TD>{row.validationErrors.length ? <Badge variant="danger">{row.validationErrors.join(", ")}</Badge> : row.duplicateGuestId ? <Badge variant="warning">Duplicat găsit</Badge> : <Badge variant="success">Valid</Badge>}</TD><TD><Select aria-label={`Decizie rând ${row.rowNumber}`} value={(row.decision ?? "skip").toUpperCase()} disabled={saving || row.validationErrors.length > 0} onChange={(event) => void decideImportRow(row, event.target.value as "CREATE_NEW" | "MERGE_WITH_EXISTING" | "SKIP")}><option value="CREATE_NEW">Creează invitat</option>{row.duplicateGuestId && <option value="MERGE_WITH_EXISTING">Combină cu existent</option>}<option value="SKIP">Omite</option></Select></TD></TR>)}</TBody></Table>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle p-4"><p className="text-sm text-muted">Commit-ul este idempotent: un retry nu creează persoane duplicate.</p><span className="flex gap-2"><Button variant="ghost" onClick={() => setImportReview(null)}>Continuă mai târziu</Button><Button disabled={saving || !importMapping.firstName || !importMapping.lastName} onClick={() => void commitImport()}>Aplică importul</Button></span></div>
      </div>}
    </Modal>
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `${selected.firstName} ${selected.lastName}` : "Invitat"} width="xl">{selected && <Tabs defaultValue="profile" className="space-y-5 p-5"><TabsList><TabsTrigger value="profile">Profil</TabsTrigger><TabsTrigger value="rsvp">RSVP</TabsTrigger><TabsTrigger value="events">Evenimente</TabsTrigger><TabsTrigger value="menu">Meniu</TabsTrigger><TabsTrigger value="logistics">Logistică</TabsTrigger><TabsTrigger value="seating">Seating</TabsTrigger><TabsTrigger value="transport">Transport</TabsTrigger><TabsTrigger value="accommodation">Cazare</TabsTrigger><TabsTrigger value="communication">Comunicare</TabsTrigger><TabsTrigger value="notes">Note</TabsTrigger><TabsTrigger value="activity">Activitate</TabsTrigger></TabsList>
      <TabsContent value="profile"><form key={`${selected.id}:${selected.version}`} className="space-y-4" onSubmit={updateGuest}><div className="grid grid-cols-2 gap-3"><Field label="Prenume"><Input name="firstName" defaultValue={selected.firstName} required /></Field><Field label="Nume"><Input name="lastName" defaultValue={selected.lastName} required /></Field></div><Field label="Gospodărie"><Select name="householdId" defaultValue={selected.householdId}>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><div className="grid grid-cols-2 gap-3"><Field label="Email"><Input name="email" type="email" defaultValue={selected.email ?? ""} /></Field><Field label="Telefon"><Input name="phone" defaultValue={selected.phone ?? ""} /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Relație"><Input name="relationship" defaultValue={selected.relationship ?? ""} /></Field><Field label="Categorie"><Input name="category" defaultValue={selected.category ?? ""} /></Field></div><Field label="Parte"><Select name="side" defaultValue={sideInput(selected.side)}><option value="COMMON">Comună</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option><option value="VENDOR">Furnizor</option><option value="OTHER">Altele</option></Select></Field><div className="flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge key={tag.id} variant="neutral">{tag.name}</Badge>)}</div><label className="flex items-center gap-2 text-sm"><input name="plusOneAllowed" type="checkbox" defaultChecked={selected.plusOneAllowed} className="size-4 accent-brand" />Permite plus-unu</label><p className="text-xs text-faint">Versiune server: {selected.version}</p><div className="flex flex-wrap gap-2">{canWrite && <Button type="submit" disabled={saving}>Salvează</Button>}{capabilities.includes("guest.archive") && <Button type="button" variant="destructive" disabled={saving} onClick={() => void archiveGuest()}><Archive className="size-4" />Arhivează</Button>}</div></form></TabsContent>
      <TabsContent value="rsvp"><DetailPanel title="Status RSVP" lines={[selected.rsvpStatus?.replaceAll("-", " ") ?? "Fără răspuns", `Invitație: ${invitationLabel[selected.invitationStatus ?? ""] ?? "Nepregătită"}`]} /></TabsContent>
      <TabsContent value="events"><DetailPanel title="Participare pe evenimente" lines={["Răspunsurile pe evenimente sunt administrate din pagina RSVP.", selected.rsvpStatus ? `Status agregat: ${selected.rsvpStatus.replaceAll("-", " ")}` : "Nu există încă un răspuns publicat."]} /></TabsContent>
      <TabsContent value="menu"><DetailPanel title="Selecție meniu" lines={[selected.menuName ?? "Meniul nu a fost selectat încă.", "Alergiile și excepțiile sunt vizibile în pagina Meniuri, conform permisiunilor."]} /></TabsContent>
      <TabsContent value="logistics"><form key={`logistics:${selected.id}:${selected.version}`} className="space-y-4" onSubmit={updateGuest}><input type="hidden" name="formScope" value="logistics" /><label className="flex items-center gap-2 text-sm"><input name="needsTransport" type="checkbox" defaultChecked={selected.needsTransport} className="size-4 accent-brand" />Solicită transport</label><label className="flex items-center gap-2 text-sm"><input name="needsAccommodation" type="checkbox" defaultChecked={selected.needsAccommodation} className="size-4 accent-brand" />Solicită cazare</label>{canWrite && <Button type="submit" disabled={saving}>Salvează logistica</Button>}</form></TabsContent>
      <TabsContent value="seating"><DetailPanel title="Loc la masă" lines={[selected.rsvpStatus === "confirmed" ? "Invitat eligibil pentru planul de mese." : "Alocarea necesită un RSVP confirmat.", "Detaliile se actualizează din planul canonic, nu din profil."]} /><Button className="mt-3" variant="outline" onClick={() => window.location.assign(`/seating?guest=${selected.id}`)}>Deschide planul de mese</Button></TabsContent>
      <TabsContent value="transport"><DetailPanel title="Transport" lines={[selected.needsTransport ? "Invitatul a solicitat transport." : "Nu există o cerere activă de transport.", "Alocarea pe rută este administrată în modulul Transport."]} /><Button className="mt-3" variant="outline" onClick={() => window.location.assign(`/transport?guest=${selected.id}`)}>Deschide transportul</Button></TabsContent>
      <TabsContent value="accommodation"><DetailPanel title="Cazare" lines={[selected.needsAccommodation ? "Invitatul a solicitat cazare." : "Nu există o cerere activă de cazare.", "Camera și intervalul se publică din sejurul canonic."]} /><Button className="mt-3" variant="outline" onClick={() => window.location.assign(`/accommodation?guest=${selected.id}`)}>Deschide cazarea</Button></TabsContent>
      <TabsContent value="communication"><div className="space-y-3">{selected.communication?.length ? selected.communication.map((item) => <div key={item.id} className="rounded-xl border border-line p-3"><div className="flex justify-between gap-3 text-xs text-faint"><span>{item.channel} · {item.direction}</span><span>{new Date(item.occurredAt).toLocaleString("ro-RO")}</span></div><p className="mt-1 text-sm">{item.summary}</p></div>) : <p className="rounded-xl bg-subtle p-4 text-sm text-muted">Nu există comunicări înregistrate pentru acest invitat.</p>}</div></TabsContent>
      <TabsContent value="notes"><form className="space-y-3" onSubmit={savePrivateNote}><Field label="Notă privată" hint="Conținutul este criptat și nu este reafișat după salvare."><Textarea name="notesPrivate" rows={5} maxLength={4000} required /></Field>{canWrite && <Button type="submit" disabled={saving}>Salvează nota</Button>}</form></TabsContent>
      <TabsContent value="activity"><DetailPanel title="Activitate semantică" lines={["Crearea, actualizarea, RSVP-ul și comunicările acestui invitat sunt înregistrate în Activity Feed."]} /><Button className="mt-3" variant="outline" onClick={() => window.location.assign("/activity")}>Deschide Activity Feed</Button></TabsContent>
    </Tabs>}</Drawer>
  </div>;
}

async function waitForJob(jobId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await weddingOsApi.job(jobId);
    if (job.status === "completed") return job;
    if (["failed", "dead_letter", "cancelled"].includes(job.status)) throw new Error(job.error?.message ?? "Jobul a eșuat");
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error("Jobul nu s-a încheiat în intervalul de așteptare");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
}

function importValue(row: GuestImportRowResource, field: string) {
  const value = row.normalizedData[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function sideInput(side: HouseholdResource["side"] | GuestResource["side"]) {
  return side.toUpperCase();
}

function DetailPanel({ title, lines }: { title: string; lines: string[] }) {
  return <div className="rounded-xl border border-line bg-subtle p-4"><h3 className="font-medium">{title}</h3><div className="mt-2 space-y-1 text-sm text-muted">{lines.map((line) => <p key={line}>{line}</p>)}</div></div>;
}
