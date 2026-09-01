"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, CheckCircle2, Download, Pencil, Search, Send, Tag, Trash2, Upload, UserPlus, Users, UsersRound } from "lucide-react";
import type {
  CampaignResource, GuestImportResource, GuestImportRowResource, GuestResource,
  GuestTagResource, HouseholdResource,
} from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Avatar, Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, Drawer, EmptyState, Field, Input,
  Modal, PageHeader, Select, StatCard, Table, Tabs, TabsContent, TabsList,
  TabsTrigger, TBody, TD, Textarea, TH, THead, TR, useToast,
} from "@/components/ui";

const invitationLabel: Record<string, string> = {
  NOT_PREPARED: "Nepregătită", READY: "Pregătită", QUEUED: "În coadă",
  SENT: "Trimisă", OPENED: "Deschisă", PARTIALLY_RESPONDED: "RSVP parțial",
  RESPONDED: "RSVP complet",
};

const sideLabels: Record<string, string> = {
  partner_one: "Partener 1",
  partner_two: "Partener 2",
  common: "Comună",
  vendor: "Furnizor",
  other: "Altele",
};

const rsvpLabels: Record<string, string> = {
  confirmed: "Confirmat",
  declined: "Refuzat",
  unsure: "Nehotărât",
  no_response: "Fără răspuns",
};

type BulkAction = {
  value: string;
  label: string;
  allowed: boolean;
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

type ReminderAudience = {
  total: number;
  valid: number;
  invalid: number;
  audienceRevision: string;
};

const importFieldLabels: Record<string, string> = {
  firstName: "Prenume",
  lastName: "Nume",
  email: "Email",
  phone: "Telefon",
  household: "Gospodărie",
};

export default function GuestsPage() {
  const router = useRouter();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [guests, setGuests] = React.useState<GuestResource[]>([]);
  const [households, setHouseholds] = React.useState<HouseholdResource[]>([]);
  const [householdsTruncated, setHouseholdsTruncated] = React.useState(false);
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
  const [reminderCampaign, setReminderCampaign] =
    React.useState<CampaignResource | null>(null);
  const [reminderAudience, setReminderAudience] =
    React.useState<ReminderAudience | null>(null);
  const [tagOpen, setTagOpen] = React.useState(false);
  const [editingTag, setEditingTag] = React.useState<GuestTagResource | null>(null);
  const [tagToDelete, setTagToDelete] = React.useState<GuestTagResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [guestOpen, setGuestOpen] = React.useState(false);
  const [householdOpen, setHouseholdOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<GuestDetail | null>(null);
  const [selectedHousehold, setSelectedHousehold] = React.useState<HouseholdResource | null>(null);
  const [guestKind, setGuestKind] = React.useState<"adult" | "child" | "plus_one">("adult");
  const [primaryGuestId, setPrimaryGuestId] = React.useState("");
  const [plusOneCandidates, setPlusOneCandidates] = React.useState<GuestResource[]>([]);
  const [plusOneCandidatesLoading, setPlusOneCandidatesLoading] = React.useState(false);
  const [importReview, setImportReview] = React.useState<ImportReview | null>(null);
  const [importMapping, setImportMapping] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("guest.write");
  const canImport = capabilities.includes("guest.import");
  const canExport = capabilities.includes("guest.export");
  const canArchive = capabilities.includes("guest.archive");
  const canReadCampaigns = capabilities.includes("campaign.read");
  const canWriteCampaigns = capabilities.includes("campaign.write");
  const canSendCampaigns = capabilities.includes("campaign.send");
  const canManageRecipients = capabilities.includes("invitation.manage_recipients");
  const bulkActions = React.useMemo<BulkAction[]>(() => [
    { value: "ADD_TAG", label: "Adaugă etichetă", allowed: canWrite },
    { value: "REMOVE_TAG", label: "Elimină etichetă", allowed: canWrite },
    { value: "MOVE_TO_HOUSEHOLD", label: "Mută în gospodărie", allowed: canWrite },
    { value: "CREATE_INVITATION_RECIPIENTS", label: "Pregătește accesul la invitație", allowed: canManageRecipients },
    { value: "ADD_TO_CAMPAIGN", label: "Adaugă în campanie", allowed: canWriteCampaigns && canReadCampaigns },
    { value: "SEND_RSVP_REMINDER", label: "Pregătește reminder RSVP", allowed: canWriteCampaigns && canSendCampaigns },
    { value: "ARCHIVE", label: "Arhivează", allowed: canArchive },
  ].filter((action) => action.allowed), [canArchive, canManageRecipients, canReadCampaigns, canSendCampaigns, canWrite, canWriteCampaigns]);
  const canSelectGuests = bulkActions.length > 0;
  const effectiveBulkCommand = bulkActions.some((action) => action.value === bulkCommand)
    ? bulkCommand
    : (bulkActions[0]?.value ?? "");

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
        loadAllHouseholds(currentWorkspace.id),
        weddingOsApi.guestTags(currentWorkspace.id),
        canReadCampaigns
          ? weddingOsApi.campaigns(currentWorkspace.id)
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      setGuests((current) => append ? [...current, ...guestData.items] : guestData.items);
      setHouseholds(householdData.items);
      setHouseholdsTruncated(householdData.truncated);
      setTags(tagData.items);
      setCampaigns(campaignData.items);
      setNextCursor(guestData.nextCursor);
      setSummary(guestData.summary as Summary);
    } catch (caught) { setError(apiErrorMessage(caught)); }
    finally { setLoading(false); }
  }, [canReadCampaigns, currentWorkspace, demoMode, invitationStatus, menuStatus, rsvpStatus, side, sort, tagFilter]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(query), 250);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  const createHousehold = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      await weddingOsApi.createHousehold(currentWorkspace.id, {
        name: String(form.get("name")),
        preferredLanguage: String(form.get("preferredLanguage") || "ro"),
        city: String(form.get("city") || "") || null,
        country: String(form.get("country") || "") || null,
        address: String(form.get("address") || "") || null,
        category: String(form.get("category") || "") || null,
        side: String(form.get("side")) as "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER",
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
        ? plusOneCandidates.find((guest) => guest.id === primaryGuestId)
        : undefined;
      await weddingOsApi.createGuest(currentWorkspace.id, {
        householdId: primary?.householdId ?? String(form.get("householdId")), firstName: String(form.get("firstName")), lastName: String(form.get("lastName")),
        email: String(form.get("email") || "") || null, phone: String(form.get("phone") || "") || null,
        displayName: String(form.get("displayName") || "") || null,
        preferredLanguage: String(form.get("preferredLanguage") || "ro"),
        relationship: String(form.get("relationship") || "") || null,
        category: String(form.get("category") || "") || null,
        side: String(form.get("side")) as "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER",
        isChild: guestKind === "child", dateOfBirth: String(form.get("dateOfBirth") || "") || null,
        isPlusOne: guestKind === "plus_one", primaryGuestId: primary?.id ?? null,
        plusOneAllowed: form.get("plusOneAllowed") === "on",
        needsTransport: form.get("needsTransport") === "on",
        needsAccommodation: form.get("needsAccommodation") === "on",
      });
      setGuestOpen(false); setGuestKind("adult"); setPrimaryGuestId("");
      setPlusOneCandidates([]);
      toast({ title: guestKind === "child" ? "Copil adăugat" : guestKind === "plus_one" ? "Plus-unu adăugat" : "Invitat adăugat", variant: "success" }); await load("");
    } catch (caught) { toast({ title: "Invitatul nu a fost adăugat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const loadPlusOneCandidates = async () => {
    if (!currentWorkspace || demoMode || plusOneCandidatesLoading || plusOneCandidates.length) return;
    setPlusOneCandidatesLoading(true);
    try {
      const items: GuestResource[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const result = await weddingOsApi.guests(currentWorkspace.id, { child: false, plusOne: false, cursor, limit: "100", sort: "last_name" });
        items.push(...result.items.filter((guest) => guest.plusOneAllowed));
        if (!result.nextCursor) break;
        cursor = result.nextCursor;
      }
      setPlusOneCandidates(items);
    } catch (caught) {
      toast({ title: "Lista persoanelor eligibile nu a fost încărcată", description: apiErrorMessage(caught), variant: "error" });
    } finally {
      setPlusOneCandidatesLoading(false);
    }
  };

  const createTag = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!currentWorkspace || demoMode) return;
    const form = new FormData(event.currentTarget); setSaving(true);
    try {
      const input = { name: String(form.get("name")), color: String(form.get("color") || "") || null };
      if (editingTag) await weddingOsApi.updateGuestTag(currentWorkspace.id, editingTag.id, editingTag.version, input);
      else await weddingOsApi.createGuestTag(currentWorkspace.id, input);
      setTagOpen(false); setEditingTag(null); toast({ title: editingTag ? "Etichetă actualizată" : "Etichetă creată", variant: "success" }); await load(query);
    } catch (caught) { toast({ title: editingTag ? "Eticheta nu a fost actualizată" : "Eticheta nu a fost creată", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const deleteTag = async () => {
    if (!currentWorkspace || !tagToDelete || demoMode) return;
    setSaving(true);
    try {
      const result = await weddingOsApi.deleteGuestTag(currentWorkspace.id, tagToDelete.id, tagToDelete.version);
      setTagToDelete(null);
      if (tagFilter === tagToDelete.id) setTagFilter("");
      toast({ title: "Etichetă ștearsă", description: result.affectedGuests ? `Eliminată de la ${result.affectedGuests} invitați.` : undefined, variant: "success" });
      await load(query);
    } catch (caught) { toast({ title: "Eticheta nu a fost ștearsă", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const runBulk = async () => {
    if (!currentWorkspace || demoMode || selectedIds.size === 0 || !effectiveBulkCommand) return;
    const guestIds = [...selectedIds];
    const command: Record<string, unknown> = { command: effectiveBulkCommand, guestIds };
    if (["ADD_TAG", "REMOVE_TAG"].includes(effectiveBulkCommand)) command.tagId = bulkTarget;
    if (effectiveBulkCommand === "ADD_TO_CAMPAIGN") command.campaignId = bulkTarget;
    if (effectiveBulkCommand === "MOVE_TO_HOUSEHOLD") command.householdId = bulkTarget;
    setSaving(true);
    try {
      if (effectiveBulkCommand === "SEND_RSVP_REMINDER") {
        const prepared = await weddingOsApi.prepareBulkRsvpReminder(
          currentWorkspace.id,
          guestIds,
        );
        setReminderCampaign(prepared.campaign);
        setReminderAudience(prepared.audience);
        return;
      }
      await weddingOsApi.bulkGuests(currentWorkspace.id, command);
      setSelectedIds(new Set());
      toast({ title: "Acțiune aplicată", description: `${guestIds.length} invitați au fost procesați.`, variant: "success" });
      await load(query);
    } catch (caught) { toast({ title: "Acțiunea bulk a eșuat", description: apiErrorMessage(caught), variant: "error" }); }
    finally { setSaving(false); }
  };

  const confirmReminder = async () => {
    if (
      !currentWorkspace ||
      !reminderCampaign ||
      !reminderAudience?.valid ||
      demoMode
    )
      return;
    setSaving(true);
    try {
      await weddingOsApi.transitionCampaign(
        currentWorkspace.id,
        reminderCampaign.id,
        reminderCampaign.version,
        "SEND_NOW",
        undefined,
        reminderAudience.audienceRevision,
      );
      toast({
        title: "Reamintire pusă în coadă",
        description: `Serverul a reverificat și a acceptat exact ${reminderAudience.valid} destinatari.`,
        variant: "success",
      });
      setReminderCampaign(null);
      setReminderAudience(null);
      setSelectedIds(new Set());
      await load(query);
    } catch (caught) {
      toast({
        title: "Reamintirea nu a fost trimisă",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
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
        displayName: String(form.get("displayName") || "") || null,
        preferredLanguage: String(form.get("preferredLanguage") || "ro"),
        plusOneAllowed: form.get("plusOneAllowed") === "on",
      };
      await weddingOsApi.updateGuest(currentWorkspace.id, selected.id, selected.version, input);
      setSelected(null); setPlusOneCandidates([]); toast({ title: "Invitat actualizat", variant: "success" }); await load(query);
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
        country: String(form.get("country") || "") || null,
        address: String(form.get("address") || "") || null,
        category: String(form.get("category") || "") || null,
        preferredLanguage: String(form.get("preferredLanguage") || "ro"),
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

  const preparedInvitations = (summary.invitation.ready ?? 0) + (summary.invitation.queued ?? 0) + (summary.invitation.sent ?? 0) + (summary.invitation.opened ?? 0);
  const deliveredInvitations = (summary.invitation.sent ?? 0) + (summary.invitation.opened ?? 0);
  const completedResponses = (summary.rsvp.confirmed ?? 0) + (summary.rsvp.declined ?? 0) + (summary.rsvp.unsure ?? 0);

  return <div className="mx-auto max-w-7xl space-y-5">
    <PageHeader title="Invitați și gospodării" description="Construiește lista, pregătește accesul personal, distribuie invitația și urmărește răspunsurile." actions={<>
      <input ref={fileRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} />
      <Button variant="outline" size="sm" disabled={!canImport || demoMode} onClick={() => fileRef.current?.click()}><Upload className="size-3.5" />Import</Button>
      <Button variant="outline" size="sm" disabled={!canExport || demoMode} onClick={() => void exportGuests()}><Download className="size-3.5" />Export</Button>
      <Button variant="secondary" size="sm" disabled={!canWrite || demoMode} onClick={() => setHouseholdOpen(true)}><UsersRound className="size-3.5" />Gospodărie</Button>
      <Button size="sm" disabled={!canWrite || demoMode || households.length === 0} onClick={() => setGuestOpen(true)}><UserPlus className="size-4" />Invitat</Button>
    </>} />

    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2 className="font-brand text-lg font-semibold text-ink">De la listă la confirmare</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">Urmează pașii în ordine. Datele introduse aici alimentează invitația, RSVP-ul, mesele, transportul și cazarea.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push("/invitations")}>
            Deschide distribuirea invitațiilor <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <WorkflowStep number={1} title="Adaugă contactele" value={`${summary.totalGuests} persoane · ${summary.totalHouseholds} gospodării`} complete={summary.totalGuests > 0} />
          <WorkflowStep number={2} title="Pregătește accesurile" value={`${preparedInvitations} din ${summary.totalHouseholds} gospodării pregătite`} complete={summary.totalHouseholds > 0 && preparedInvitations >= summary.totalHouseholds} />
          <WorkflowStep number={3} title="Distribuie invitația" value={`${deliveredInvitations} accesuri trimise`} complete={deliveredInvitations > 0} />
          <WorkflowStep number={4} title="Urmărește RSVP" value={`${completedResponses} răspunsuri complete`} complete={summary.totalGuests > 0 && completedResponses >= summary.totalGuests} />
        </ol>
      </CardContent>
    </Card>

    {householdsTruncated ? <div className="rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning" role="status">Sunt afișate primele 1.000 de gospodării în selectoare. Lista de invitați rămâne disponibilă, dar operațiile de mutare trebuie împărțite în loturi controlate.</div> : null}

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
      <Button size="sm" variant="outline" disabled={!canWrite || demoMode} onClick={() => { setEditingTag(null); setTagOpen(true); }}><Tag className="size-3.5" />Gestionează etichete</Button>
    </CardContent></Card>
    {canSelectGuests && selectedIds.size > 0 && <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
      <p className="mr-auto text-sm font-medium">{selectedIds.size} selectați</p>
      <Field label="Acțiune"><Select value={effectiveBulkCommand} onChange={(event) => { setBulkCommand(event.target.value); setBulkTarget(""); }}>{bulkActions.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}</Select></Field>
      {["ADD_TAG", "REMOVE_TAG"].includes(effectiveBulkCommand) && <Field label="Etichetă"><Select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)}><option value="">Alege</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</Select></Field>}
      {effectiveBulkCommand === "MOVE_TO_HOUSEHOLD" && <Field label="Gospodărie"><Select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)}><option value="">Alege</option>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
      {effectiveBulkCommand === "ADD_TO_CAMPAIGN" && <Field label="Campanie draft"><Select value={bulkTarget} onChange={(event) => setBulkTarget(event.target.value)}><option value="">Alege</option>{campaigns.filter((campaign) => campaign.status === "draft").map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></Field>}
      <Button size="sm" disabled={saving || (["ADD_TAG", "REMOVE_TAG", "MOVE_TO_HOUSEHOLD", "ADD_TO_CAMPAIGN"].includes(effectiveBulkCommand) && !bulkTarget)} onClick={() => void runBulk()}><Send className="size-3.5" />Aplică</Button>
      <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Anulează selecția</Button>
    </CardContent></Card>}
    {error ? <Card><CardContent className="p-6"><p className="text-sm text-danger">{error}</p><Button className="mt-3" size="sm" onClick={() => void load(query)}>Reîncearcă</Button></CardContent></Card> :
      loading ? <Card><CardContent className="p-8 text-sm text-muted">Se încarcă lista reală de invitați…</CardContent></Card> :
      guests.length === 0 ? <EmptyState icon={Users} title="Lista de invitați este goală" description="Adaugă prima gospodărie și primul invitat sau importă lista din CSV/XLSX." action={canWrite && !demoMode ? { label: "Adaugă gospodărie", onClick: () => setHouseholdOpen(true) } : undefined} /> :
      <><div className="hidden md:block"><Table minWidth="1040px"><THead><TR>{canSelectGuests && <TH><Checkbox aria-label="Selectează pagina" checked={guests.length > 0 && guests.every((guest) => selectedIds.has(guest.id))} onCheckedChange={(checked) => setSelectedIds(checked ? new Set(guests.map((guest) => guest.id)) : new Set())} /></TH>}<TH>Invitat</TH><TH>Gospodărie</TH><TH>Contact</TH><TH>Partea</TH><TH>Invitație</TH><TH>RSVP / Meniu</TH><TH>Logistică</TH></TR></THead><TBody>
        {guests.map((guest) => <TR key={guest.id} onClick={() => void openGuest(guest)}>
          {canSelectGuests && <TD><span onClick={(event) => event.stopPropagation()}><Checkbox aria-label={`Selectează ${guest.firstName} ${guest.lastName}`} checked={selectedIds.has(guest.id)} onCheckedChange={(checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(guest.id); else next.delete(guest.id); return next; })} /></span></TD>}
          <TD><span className="flex items-center gap-2"><Avatar name={`${guest.firstName} ${guest.lastName}`} size="xs" /><span><span className="font-medium">{guest.firstName} {guest.lastName}</span><span className="mt-1 flex gap-1">{guest.tags.map((tag) => <Badge key={tag.id} variant="neutral">{tag.name}</Badge>)}</span></span>{guest.isChild && <Badge variant="info">Copil</Badge>}{guest.isPlusOne && <Badge variant="neutral">+1</Badge>}</span></TD>
          <TD className="text-muted"><button type="button" className="text-left hover:text-brand hover:underline" onClick={(event) => { event.stopPropagation(); setSelectedHousehold(households.find((item) => item.id === guest.householdId) ?? null); }}>{guest.householdName ?? households.find((item) => item.id === guest.householdId)?.name ?? "Fără gospodărie"}</button></TD>
          <TD className="text-muted">{guest.email ?? guest.phone ?? "Protejat / absent"}</TD><TD><Badge variant="neutral">{sideLabel(guest.side)}</Badge></TD>
          <TD><Badge variant="brand">{invitationLabel[guest.invitationStatus ?? ""] ?? "Nepregătită"}</Badge></TD><TD className="text-muted">{rsvpLabel(guest.rsvpStatus)}<br />{guest.menuName ?? "Meniu neales"}</TD>
          <TD className="text-muted">{[guest.needsTransport && "transport", guest.needsAccommodation && "cazare"].filter(Boolean).join(", ") || "Nicio nevoie"}</TD>
        </TR>)}
      </TBody></Table></div><ul className="space-y-3 md:hidden">{guests.map((guest) => <GuestMobileCard key={guest.id} guest={guest} household={households.find((item) => item.id === guest.householdId)} selectable={canSelectGuests} selected={selectedIds.has(guest.id)} onSelect={(checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(guest.id); else next.delete(guest.id); return next; })} onOpen={() => void openGuest(guest)} onOpenHousehold={() => setSelectedHousehold(households.find((item) => item.id === guest.householdId) ?? null)} />)}</ul>{nextCursor && <div className="flex justify-center pt-3"><Button variant="outline" size="sm" disabled={loading} onClick={() => void load(query, nextCursor, true)}>Încarcă următorii invitați</Button></div>}</>}

    <Modal open={householdOpen} onClose={() => setHouseholdOpen(false)} title="Gospodărie nouă" description="Grupează persoanele care primesc aceeași invitație și confirmă împreună."><form id="household-form" className="grid gap-4 sm:grid-cols-2" onSubmit={createHousehold}><Field label="Numele gospodăriei" required className="sm:col-span-2"><Input name="name" required placeholder="Familia Popescu" /></Field><Field label="Oraș"><Input name="city" autoComplete="address-level2" /></Field><Field label="Țară"><Input name="country" autoComplete="country-name" placeholder="România" /></Field><Field label="Adresă" className="sm:col-span-2"><Input name="address" autoComplete="street-address" /></Field><Field label="Limba comunicării"><Select name="preferredLanguage" defaultValue="ro"><LanguageOptions /></Select></Field><Field label="Categorie"><Input name="category" placeholder="Familie, prieteni, colegi…" /></Field><Field label="Parte" className="sm:col-span-2"><Select name="side" defaultValue="COMMON"><SideOptions /></Select></Field><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setHouseholdOpen(false)}>Renunță</Button><Button type="submit" loading={saving} disabled={saving}>Creează gospodăria</Button></div></form></Modal>
    <Modal open={guestOpen} onClose={() => { setGuestOpen(false); setGuestKind("adult"); setPrimaryGuestId(""); }} title="Invitat nou" description="Adaugă un adult, un copil sau persoana plus-unu aprobată pentru un invitat.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={createGuest}>
        <Field label="Tip" className="sm:col-span-2"><Select value={guestKind} onChange={(event) => { const nextKind = event.target.value as typeof guestKind; setGuestKind(nextKind); setPrimaryGuestId(""); if (nextKind === "plus_one") void loadPlusOneCandidates(); }}><option value="adult">Adult</option><option value="child">Copil</option><option value="plus_one">Plus-unu</option></Select></Field>
        <Field label="Prenume" required><Input name="firstName" required autoComplete="given-name" /></Field><Field label="Nume" required><Input name="lastName" required autoComplete="family-name" /></Field>
        {guestKind === "plus_one" ? <Field label="Invitat principal" hint={plusOneCandidatesLoading ? "Se încarcă toate persoanele eligibile…" : plusOneCandidates.length ? "Sunt afișate persoanele care au opțiunea plus-unu activă." : "Nu există încă o persoană eligibilă. Activează mai întâi opțiunea plus-unu din profil."} required className="sm:col-span-2"><Select value={primaryGuestId} disabled={plusOneCandidatesLoading || !plusOneCandidates.length} onChange={(event) => setPrimaryGuestId(event.target.value)} required><option value="">Alege invitatul cu plus-unu permis</option>{plusOneCandidates.map((guest) => <option key={guest.id} value={guest.id}>{guest.firstName} {guest.lastName}</option>)}</Select></Field> : <Field label="Gospodărie" required className="sm:col-span-2"><Select name="householdId" required>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>}
        {guestKind === "child" && <Field label="Data nașterii"><Input name="dateOfBirth" type="date" /></Field>}
        <Field label="Nume afișat" hint="Opțional, pentru adresarea din invitație."><Input name="displayName" /></Field>
        <Field label="Relație"><Input name="relationship" placeholder="Naș, coleg, verișoară…" /></Field>
        <Field label="Categorie"><Input name="category" placeholder="Familie, prieteni…" /></Field>
        <Field label="Limba comunicării"><Select name="preferredLanguage" defaultValue="ro"><LanguageOptions /></Select></Field>
        <Field label="Parte"><Select name="side" defaultValue="COMMON"><SideOptions /></Select></Field>
        <Field label="Email"><Input name="email" type="email" autoComplete="email" /></Field><Field label="Telefon" hint="Include prefixul internațional, de exemplu +40."><Input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+40 7…" /></Field>
        <div className="grid gap-2 rounded-xl bg-subtle p-3 text-sm sm:col-span-2">
          {guestKind === "adult" && <label className="flex items-center gap-2"><input name="plusOneAllowed" type="checkbox" className="size-4 accent-brand" />Permite adăugarea unui plus-unu</label>}
          <label className="flex items-center gap-2"><input name="needsTransport" type="checkbox" className="size-4 accent-brand" />Are nevoie de transport</label>
          <label className="flex items-center gap-2"><input name="needsAccommodation" type="checkbox" className="size-4 accent-brand" />Are nevoie de cazare</label>
        </div>
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setGuestOpen(false)}>Renunță</Button><Button type="submit" disabled={saving || (guestKind === "plus_one" && !primaryGuestId)}>Adaugă</Button></div>
      </form>
    </Modal>
    <Modal
      open={Boolean(reminderCampaign)}
      onClose={() => {
        if (!saving) {
          setReminderCampaign(null);
          setReminderAudience(null);
        }
      }}
      title="Confirmă reamintirea RSVP"
      description="Niciun mesaj nu pleacă până nu confirmi audiența verificată de server."
      size="sm"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-success-soft p-4">
            <p className="text-2xl font-semibold text-success">{reminderAudience?.valid ?? 0}</p>
            <p className="mt-1 text-sm text-ink">destinatari valizi</p>
          </div>
          <div className="rounded-xl bg-subtle p-4">
            <p className="text-2xl font-semibold text-ink">{reminderAudience?.invalid ?? 0}</p>
            <p className="mt-1 text-sm text-muted">fără adresă validă</p>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          Au fost selectate {reminderAudience?.total ?? 0} accesuri. Serverul
          compară din nou audiența la confirmare și oprește trimiterea dacă s-a
          schimbat între timp.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => { setReminderCampaign(null); setReminderAudience(null); }}>Renunță</Button>
          <Button type="button" loading={saving} disabled={saving || !reminderAudience?.valid} onClick={() => void confirmReminder()}><Send className="size-4" />Trimite către {reminderAudience?.valid ?? 0}</Button>
        </div>
      </div>
    </Modal>
    <Modal open={tagOpen} onClose={() => { setTagOpen(false); setEditingTag(null); }} title={editingTag ? "Editează eticheta" : "Gestionează etichetele"} description="Creează, redenumește sau elimină etichetele folosite pentru filtrare și acțiuni de grup."><div className="space-y-5">{!editingTag && tags.length ? <div className="space-y-2">{tags.map((tag) => <div key={tag.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"><span className="flex min-w-0 items-center gap-2"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: tag.color ?? "#6d5dfc" }} /><span className="truncate text-sm font-medium text-ink">{tag.name}</span><span className="text-xs text-muted">{tag.assignedGuests ?? 0} invitați</span></span><span className="flex gap-1"><Button type="button" size="icon-sm" variant="ghost" aria-label={`Editează eticheta ${tag.name}`} onClick={() => setEditingTag(tag)}><Pencil className="size-4" /></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Șterge eticheta ${tag.name}`} onClick={() => setTagToDelete(tag)}><Trash2 className="size-4 text-danger" /></Button></span></div>)}</div> : null}<form key={editingTag?.id ?? "new"} className="space-y-4" onSubmit={createTag}><Field label={editingTag ? "Nume" : "Etichetă nouă"} required><Input name="name" defaultValue={editingTag?.name ?? ""} required /></Field><Field label="Culoare" hint="Format hex, de exemplu #6d5dfc"><Input name="color" defaultValue={editingTag?.color ?? "#6d5dfc"} pattern="#[0-9a-fA-F]{6}" /></Field><div className="flex justify-end gap-2">{editingTag ? <Button type="button" variant="ghost" onClick={() => setEditingTag(null)}>Înapoi la listă</Button> : <Button type="button" variant="ghost" onClick={() => setTagOpen(false)}>Închide</Button>}<Button type="submit" disabled={saving}>{editingTag ? "Salvează" : "Creează"}</Button></div></form></div></Modal>
    <ConfirmDialog open={Boolean(tagToDelete)} onClose={() => setTagToDelete(null)} onConfirm={() => void deleteTag()} title="Ștergi eticheta?" description="Eticheta va fi eliminată și de la invitații care o folosesc. Invitații nu sunt șterși." confirmLabel="Șterge eticheta" destructive loading={saving} />
    <Modal open={Boolean(selectedHousehold)} onClose={() => setSelectedHousehold(null)} title="Editează gospodăria" description={selectedHousehold ? `${selectedHousehold.guestsCount} persoane asociate` : undefined}>{selectedHousehold && <form key={`${selectedHousehold.id}:${selectedHousehold.version}`} className="grid gap-4 sm:grid-cols-2" onSubmit={updateHousehold}><Field label="Nume" required className="sm:col-span-2"><Input name="name" defaultValue={selectedHousehold.name} required /></Field><Field label="Oraș"><Input name="city" defaultValue={selectedHousehold.city ?? ""} autoComplete="address-level2" /></Field><Field label="Țară"><Input name="country" defaultValue={selectedHousehold.country ?? ""} autoComplete="country-name" /></Field><Field label="Adresă" className="sm:col-span-2"><Input name="address" defaultValue={selectedHousehold.address ?? ""} autoComplete="street-address" /></Field><Field label="Limba comunicării"><Select name="preferredLanguage" defaultValue={selectedHousehold.preferredLanguage}><LanguageOptions /></Select></Field><Field label="Categorie"><Input name="category" defaultValue={selectedHousehold.category ?? ""} /></Field><Field label="Parte" className="sm:col-span-2"><Select name="side" defaultValue={sideInput(selectedHousehold.side)}><SideOptions /></Select></Field><p className="text-xs text-faint sm:col-span-2">Mutarea persoanelor se face din acțiunile de grup ale listei.</p><div className="flex flex-wrap justify-between gap-2 sm:col-span-2"><Button type="button" variant="destructive" disabled={saving || !canArchive} onClick={() => void archiveHousehold()}><Archive className="size-4" />Arhivează</Button><span className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setSelectedHousehold(null)}>Renunță</Button>{canWrite && <Button type="submit" loading={saving} disabled={saving}>Salvează</Button>}</span></div></form>}</Modal>
    <Modal open={Boolean(importReview)} onClose={() => setImportReview(null)} title="Revizuire import invitați" description={importReview?.resource.sourceFileName} size="full">
      {importReview && <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><StatCard label="Rânduri" value={importReview.resource.totalRows} /><StatCard label="Valide" value={importReview.resource.validRows} /><StatCard label="Erori" value={importReview.resource.invalidRows} tone={importReview.resource.invalidRows ? "danger" : undefined} /><StatCard label="Duplicate" value={importReview.resource.duplicateRows} tone={importReview.resource.duplicateRows ? "warning" : undefined} /><StatCard label="Aplicate" value={importReview.resource.committedRows} /></div>
        <Card><CardContent className="space-y-4 p-4"><div><h3 className="font-medium">1. Mapează coloanele</h3><p className="text-sm text-muted">Verifică asocierea coloanelor înainte de a decide ce se întâmplă cu fiecare rând.</p></div><div className="grid gap-3 sm:grid-cols-5">{Object.entries(importFieldLabels).map(([key, label]) => <Field key={key} label={label} required={key === "firstName" || key === "lastName"}><Select aria-label={`Coloană ${label}`} value={importMapping[key] ?? ""} onChange={(event) => setImportMapping((current) => ({ ...current, [key]: event.target.value }))}><option value="">Nu importa</option>{Object.keys(importReview.rows[0]?.rawDataRedacted ?? {}).map((header) => <option key={header} value={header}>{header}</option>)}</Select></Field>)}</div><Button size="sm" variant="outline" disabled={saving || !importMapping.firstName || !importMapping.lastName} onClick={() => void saveImportMapping()}>Confirmă maparea</Button></CardContent></Card>
        <div><h3 className="font-medium">2. Previzualizează și rezolvă duplicatele</h3><p className="text-sm text-muted">Datele de contact brute sunt mascate. Un rând cu erori este omis automat.</p></div>
        <Table minWidth="900px"><THead><TR><TH>Rând</TH><TH>Persoană</TH><TH>Contact</TH><TH>Gospodărie</TH><TH>Validare</TH><TH>Decizie</TH></TR></THead><TBody>{importReview.rows.map((row) => <TR key={row.id}><TD>{row.rowNumber}</TD><TD className="font-medium">{importValue(row, "firstName")} {importValue(row, "lastName")}</TD><TD className="text-muted">{importValue(row, "email") || importValue(row, "phone") || "Contact necompletat"}</TD><TD className="text-muted">{importValue(row, "household") || "Fără gospodărie"}</TD><TD>{row.validationErrors.length ? <Badge variant="danger">{row.validationErrors.join(", ")}</Badge> : row.duplicateGuestId ? <Badge variant="warning">Duplicat găsit</Badge> : <Badge variant="success">Valid</Badge>}</TD><TD><Select aria-label={`Decizie rând ${row.rowNumber}`} value={(row.decision ?? "skip").toUpperCase()} disabled={saving || row.validationErrors.length > 0} onChange={(event) => void decideImportRow(row, event.target.value as "CREATE_NEW" | "MERGE_WITH_EXISTING" | "SKIP")}><option value="CREATE_NEW">Creează invitat</option>{row.duplicateGuestId && <option value="MERGE_WITH_EXISTING">Combină cu existent</option>}<option value="SKIP">Omite</option></Select></TD></TR>)}</TBody></Table>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-subtle p-4"><p className="text-sm text-muted">Commit-ul este idempotent: un retry nu creează persoane duplicate.</p><span className="flex gap-2"><Button variant="ghost" onClick={() => setImportReview(null)}>Continuă mai târziu</Button><Button disabled={saving || !importMapping.firstName || !importMapping.lastName} onClick={() => void commitImport()}>Aplică importul</Button></span></div>
      </div>}
    </Modal>
    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? `${selected.firstName} ${selected.lastName}` : "Invitat"} width="xl">{selected && <Tabs defaultValue="profile" className="space-y-5 p-5"><TabsList><TabsTrigger value="profile">Profil</TabsTrigger><TabsTrigger value="rsvp">RSVP</TabsTrigger><TabsTrigger value="events">Evenimente</TabsTrigger><TabsTrigger value="menu">Meniu</TabsTrigger><TabsTrigger value="logistics">Logistică</TabsTrigger><TabsTrigger value="seating">Seating</TabsTrigger><TabsTrigger value="transport">Transport</TabsTrigger><TabsTrigger value="accommodation">Cazare</TabsTrigger><TabsTrigger value="communication">Comunicare</TabsTrigger><TabsTrigger value="notes">Note</TabsTrigger><TabsTrigger value="activity">Activitate</TabsTrigger></TabsList>
      <TabsContent value="profile"><form key={`${selected.id}:${selected.version}`} className="space-y-4" onSubmit={updateGuest}><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Prenume"><Input name="firstName" defaultValue={selected.firstName} required /></Field><Field label="Nume"><Input name="lastName" defaultValue={selected.lastName} required /></Field></div><Field label="Nume afișat" hint="Cum vrei să fie adresată persoana în invitație."><Input name="displayName" defaultValue={selected.displayName ?? ""} /></Field><Field label="Gospodărie"><Select name="householdId" defaultValue={selected.householdId}>{households.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Email"><Input name="email" type="email" defaultValue={selected.email ?? ""} /></Field><Field label="Telefon" hint="Cu prefix internațional."><Input name="phone" type="tel" inputMode="tel" defaultValue={selected.phone ?? ""} /></Field></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Relație"><Input name="relationship" defaultValue={selected.relationship ?? ""} /></Field><Field label="Categorie"><Input name="category" defaultValue={selected.category ?? ""} /></Field></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Limba comunicării"><Select name="preferredLanguage" defaultValue={selected.preferredLanguage}><LanguageOptions /></Select></Field><Field label="Parte"><Select name="side" defaultValue={sideInput(selected.side)}><SideOptions /></Select></Field></div><div className="flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge key={tag.id} variant="neutral">{tag.name}</Badge>)}</div><label className="flex items-center gap-2 text-sm"><input name="plusOneAllowed" type="checkbox" defaultChecked={selected.plusOneAllowed} className="size-4 accent-brand" />Permite plus-unu</label><div className="flex flex-wrap gap-2">{canWrite && <Button type="submit" loading={saving} disabled={saving}>Salvează profilul</Button>}{canArchive && <Button type="button" variant="destructive" disabled={saving} onClick={() => void archiveGuest()}><Archive className="size-4" />Arhivează</Button>}</div></form></TabsContent>
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

async function loadAllHouseholds(workspaceId: string) {
  const items: HouseholdResource[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await weddingOsApi.households(workspaceId, undefined, cursor);
    for (const household of result.items) {
      if (seen.has(household.id)) continue;
      seen.add(household.id);
      items.push(household);
    }
    if (!result.nextCursor)
      return { ...result, items, nextCursor: null, truncated: false };
    if (result.nextCursor === cursor)
      return { items, nextCursor: cursor, truncated: true };
    cursor = result.nextCursor;
  }
  return { items, nextCursor: cursor ?? null, truncated: true };
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

function sideLabel(side: HouseholdResource["side"] | GuestResource["side"]) {
  return sideLabels[side.toLowerCase()] ?? "Altele";
}

function rsvpLabel(status?: string) {
  return status ? (rsvpLabels[status.toLowerCase().replaceAll("-", "_")] ?? status) : "Fără răspuns";
}

function SideOptions() {
  return <><option value="COMMON">Comună</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option><option value="VENDOR">Furnizor</option><option value="OTHER">Altele</option></>;
}

function LanguageOptions() {
  return <><option value="ro">Română</option><option value="en">Engleză</option><option value="ru">Rusă</option><option value="fr">Franceză</option><option value="de">Germană</option><option value="it">Italiană</option><option value="es">Spaniolă</option></>;
}

function WorkflowStep({ number, title, value, complete }: { number: number; title: string; value: string; complete: boolean }) {
  return <li className="flex min-w-0 items-start gap-3 rounded-lg bg-subtle p-3"><span className={complete ? "grid size-7 shrink-0 place-items-center rounded-full bg-success-soft text-success" : "grid size-7 shrink-0 place-items-center rounded-full bg-surface text-muted"}>{complete ? <CheckCircle2 className="size-4" aria-hidden /> : number}</span><span className="min-w-0"><span className="block text-sm font-semibold text-ink">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted">{value}</span></span></li>;
}

function GuestMobileCard({ guest, household, selectable, selected, onSelect, onOpen, onOpenHousehold }: { guest: GuestResource; household?: HouseholdResource; selectable: boolean; selected: boolean; onSelect: (checked: boolean) => void; onOpen: () => void; onOpenHousehold: () => void }) {
  return <li className="rounded-xl border border-line bg-surface p-4"><div className="flex items-start gap-3">{selectable && <Checkbox aria-label={`Selectează ${guest.firstName} ${guest.lastName}`} checked={selected} onCheckedChange={onSelect} />}<button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}><span className="flex items-center gap-2"><Avatar name={`${guest.firstName} ${guest.lastName}`} size="xs" /><span className="min-w-0"><span className="block truncate font-semibold text-ink">{guest.firstName} {guest.lastName}</span><span className="block truncate text-xs text-muted">{guest.email ?? guest.phone ?? "Contact necompletat"}</span></span></span></button><Badge variant="brand">{invitationLabel[guest.invitationStatus ?? ""] ?? "Nepregătită"}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><button type="button" className="min-w-0 rounded-lg bg-subtle p-2 text-left text-muted hover:text-brand" onClick={onOpenHousehold}><span className="block text-faint">Gospodărie</span><span className="mt-0.5 block truncate font-medium text-ink">{guest.householdName ?? household?.name ?? "Fără gospodărie"}</span></button><div className="rounded-lg bg-subtle p-2 text-muted"><span className="block text-faint">RSVP</span><span className="mt-0.5 block font-medium text-ink">{rsvpLabel(guest.rsvpStatus)}</span></div></div><div className="mt-3 flex flex-wrap gap-1.5"><Badge variant="neutral">{sideLabel(guest.side)}</Badge>{guest.isChild && <Badge variant="info">Copil</Badge>}{guest.isPlusOne && <Badge variant="neutral">Plus-unu</Badge>}{guest.tags.map((tag) => <Badge key={tag.id} variant="neutral">{tag.name}</Badge>)}</div></li>;
}

function DetailPanel({ title, lines }: { title: string; lines: string[] }) {
  return <div className="rounded-xl border border-line bg-subtle p-4"><h3 className="font-medium">{title}</h3><div className="mt-2 space-y-1 text-sm text-muted">{lines.map((line) => <p key={line}>{line}</p>)}</div></div>;
}
