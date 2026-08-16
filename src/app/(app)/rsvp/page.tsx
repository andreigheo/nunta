"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BedDouble,
  BellPlus,
  BusFront,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Download,
  FilePenLine,
  HelpCircle,
  MessageSquareText,
  Search,
  Send,
  Users,
  UtensilsCrossed,
  XCircle,
} from "lucide-react";
import type {
  CampaignResource,
  InvitationSiteResource,
  RsvpDashboardHouseholdResource,
  RsvpDashboardResource,
  RsvpDashboardStatus,
  RsvpFormResource,
} from "@weddingos/contracts";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  Donut,
  DonutLegend,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Switch,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";

type ReminderAudience = {
  total: number;
  valid: number;
  invalid: number;
  audienceRevision: string;
};
type OverrideAnswer = "" | "CONFIRMED" | "DECLINED" | "UNSURE";

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

const statusOptions: Array<{
  value: "" | RsvpDashboardStatus;
  label: string;
}> = [
  { value: "", label: "Toate răspunsurile" },
  { value: "confirmed", label: "Participă" },
  { value: "declined", label: "Nu participă" },
  { value: "unsure", label: "Încă nu știe" },
  { value: "mixed", label: "Răspuns mixt" },
  { value: "incomplete", label: "Răspuns incomplet" },
  { value: "no_response", label: "Fără răspuns" },
];

export default function RsvpPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canConfigure = capabilities.includes("rsvp.configure") && !demoMode;
  const canOverride = capabilities.includes("rsvp.override") && !demoMode;
  const canExport = capabilities.includes("guest.export") && !demoMode;
  const canSendReminder =
    capabilities.includes("campaign.send") &&
    capabilities.includes("campaign.write") &&
    !demoMode;

  const [form, setForm] = React.useState<RsvpFormResource | null>(null);
  const [site, setSite] = React.useState<InvitationSiteResource | null>(null);
  const [dashboard, setDashboard] =
    React.useState<RsvpDashboardResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const deferredSearch = React.useDeferredValue(search.trim());
  const [status, setStatus] = React.useState<"" | RsvpDashboardStatus>("");
  const [selectedHousehold, setSelectedHousehold] =
    React.useState<RsvpDashboardHouseholdResource | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [formConfig, setFormConfig] =
    React.useState<RsvpConfig>(defaultRsvpConfig);
  const [reminderCampaign, setReminderCampaign] =
    React.useState<CampaignResource | null>(null);
  const [reminderAudience, setReminderAudience] =
    React.useState<ReminderAudience | null>(null);
  const [overrideHousehold, setOverrideHousehold] =
    React.useState<RsvpDashboardHouseholdResource | null>(null);
  const [overrideReason, setOverrideReason] = React.useState("");
  const [overrideMessage, setOverrideMessage] = React.useState("");
  const [overrideResponses, setOverrideResponses] = React.useState<
    Record<string, OverrideAnswer>
  >({});

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [formData, dashboardData, siteData] = await Promise.all([
        weddingOsApi.rsvpForm(currentWorkspace.id),
        weddingOsApi.rsvpDashboard(currentWorkspace.id, {
          search: deferredSearch || undefined,
          status: status || undefined,
          limit: 20,
        }),
        canSendReminder
          ? weddingOsApi.invitationSite(currentWorkspace.id)
          : Promise.resolve(null),
      ]);
      setForm(formData);
      setDashboard(dashboardData);
      setSite(siteData);
      setSelectedHousehold((current) =>
        current
          ? (dashboardData.items.find(
              (item) => item.householdId === current.householdId,
            ) ?? null)
          : null,
      );
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [canSendReminder, currentWorkspace, deferredSearch, demoMode, status]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 120);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadMore = async () => {
    if (!currentWorkspace || !dashboard?.nextCursor || demoMode) return;
    setLoadingMore(true);
    try {
      const next = await weddingOsApi.rsvpDashboard(currentWorkspace.id, {
        search: deferredSearch || undefined,
        status: status || undefined,
        cursor: dashboard.nextCursor,
        limit: 20,
      });
      setDashboard((current) =>
        current
          ? { ...next, items: [...current.items, ...next.items] }
          : next,
      );
    } catch (caught) {
      toast({
        title: "Nu am putut încărca următoarele răspunsuri",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setLoadingMore(false);
    }
  };

  const openFormEditor = () => {
    setFormConfig(configFromResource(form));
    setFormOpen(true);
  };
  const setConfig = <Key extends keyof RsvpConfig>(
    key: Key,
    value: RsvpConfig[Key],
  ) => setFormConfig((current) => ({ ...current, [key]: value }));

  const saveForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || demoMode) return;
    setSaving(true);
    try {
      const updated = await weddingOsApi.saveRsvpForm(
        currentWorkspace.id,
        form?.version ?? null,
        {
          deadline: formConfig.deadline
            ? new Date(formConfig.deadline).toISOString()
            : null,
          attendanceEnabled: formConfig.attendanceEnabled,
          perEventAttendance: formConfig.perEventAttendance,
          plusOneQuestion: formConfig.plusOneQuestion,
          childrenConfirmation: formConfig.childrenConfirmation,
          menuSelection: formConfig.menuSelection,
          allergyCollection: formConfig.allergyCollection,
          accessibilityCollection: formConfig.accessibilityCollection,
          transportQuestion: formConfig.transportQuestion,
          accommodationQuestion: formConfig.accommodationQuestion,
          guestMessage: formConfig.guestMessage,
          allowEdits: formConfig.allowEdits,
          closedMessage:
            formConfig.closedMessage.trim() || defaultRsvpConfig.closedMessage,
          languages: [formConfig.language],
        },
      );
      setForm(updated);
      setFormOpen(false);
      toast({
        title: "Ciorna formularului a fost salvată",
        description:
          "Invitații văd în continuare ultima versiune publicată.",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Formularul nu a fost salvat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!currentWorkspace || !form || demoMode) return;
    setSaving(true);
    try {
      const updated = await weddingOsApi.publishRsvpForm(
        currentWorkspace.id,
        form.version,
      );
      setForm(updated);
      toast({
        title: "Formularul pentru invitați este actualizat",
        description: `Versiunea ${updated.published?.versionNumber ?? "nouă"} este acum activă.`,
        variant: "success",
      });
      await load();
    } catch (caught) {
      toast({
        title: "Publicarea a eșuat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const reminder = async () => {
    if (!currentWorkspace || !site?.published || demoMode) return;
    setSaving(true);
    let campaign: CampaignResource | null = null;
    try {
      campaign = await weddingOsApi.createCampaign(currentWorkspace.id, {
        name: `Reamintire RSVP ${new Date().toLocaleDateString("ro-RO")}`,
        purpose: "RSVP_REMINDER",
        channel: "EMAIL",
        invitationVersionId: site.published.id,
        template: {
          subject: "Reamintire: așteptăm răspunsul tău",
          body: "Te rugăm să confirmi participarea folosind invitația personală.",
        },
        audienceFilter: {},
      });
      const audience = await weddingOsApi.campaignAudiencePreview(
        currentWorkspace.id,
        campaign.id,
      );
      setReminderCampaign(campaign);
      setReminderAudience(audience);
    } catch (caught) {
      if (campaign)
        await weddingOsApi
          .discardCampaignDraft(
            currentWorkspace.id,
            campaign.id,
            campaign.version,
          )
          .catch(() => undefined);
      toast({
        title: "Destinatarii reamintirii nu au putut fi verificați",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const closeReminder = async () => {
    if (!currentWorkspace || !reminderCampaign || saving) return;
    setSaving(true);
    try {
      await weddingOsApi.discardCampaignDraft(
        currentWorkspace.id,
        reminderCampaign.id,
        reminderCampaign.version,
      );
      setReminderCampaign(null);
      setReminderAudience(null);
    } catch (caught) {
      toast({
        title: "Previzualizarea nu a putut fi închisă în siguranță",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const sendReminder = async () => {
    if (
      !currentWorkspace ||
      !reminderCampaign ||
      !reminderAudience?.valid ||
      demoMode
    )
      return;
    setSaving(true);
    try {
      const validRecipients = reminderAudience.valid;
      const queued = await weddingOsApi.transitionCampaign(
        currentWorkspace.id,
        reminderCampaign.id,
        reminderCampaign.version,
        "SEND_NOW",
        undefined,
        reminderAudience.audienceRevision,
      );
      setReminderCampaign(null);
      setReminderAudience(null);
      toast({
        title: "Reamintirea a intrat în coada de trimitere",
        description: queued.job
          ? `${validRecipients} destinatari confirmați vor fi procesați de jobul ${queued.job.id.slice(0, 8)}.`
          : `${validRecipients} destinatari confirmați vor fi procesați asincron.`,
        variant: "info",
      });
      await load();
    } catch (caught) {
      toast({
        title: "Reamintirea nu a fost programată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const exportRsvp = async () => {
    if (!currentWorkspace || demoMode) return;
    setSaving(true);
    try {
      const { job } = await weddingOsApi.createGuestExport(
        currentWorkspace.id,
        {
          format: "xlsx",
          includeContactData: false,
          includeRsvp: true,
          includeMenu: true,
          includeAllergies: false,
          includeLogistics: true,
        },
      );
      toast({ title: "Pregătim exportul RSVP", variant: "info" });
      await waitForJob(job.id);
      downloadBlob(
        await weddingOsApi.downloadJobArtifact(job.id),
        "sarbato-raspunsuri-invitati.xlsx",
      );
    } catch (caught) {
      toast({
        title: "Exportul a eșuat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const openOverride = (household: RsvpDashboardHouseholdResource) => {
    const values: typeof overrideResponses = {};
    for (const member of household.members)
      for (const response of member.responses)
        values[`${member.guestId}:${response.eventId}`] = response.attendance
          ? (response.attendance.toUpperCase() as
              | "CONFIRMED"
              | "DECLINED"
              | "UNSURE")
          : "";
    setOverrideResponses(values);
    setOverrideReason("");
    setOverrideMessage(household.submission?.message ?? "");
    setOverrideHousehold(household);
  };

  const saveOverride = async () => {
    if (!currentWorkspace || !overrideHousehold?.submission || demoMode) return;
    const allAnswered = overrideHousehold.members.every((member) =>
      dashboard?.events.every(
        (event) => overrideResponses[`${member.guestId}:${event.id}`],
      ),
    );
    if (!allAnswered || overrideReason.trim().length < 3) return;
    setSaving(true);
    try {
      await weddingOsApi.overrideRsvpSubmission(
        currentWorkspace.id,
        overrideHousehold.submission.id,
        overrideHousehold.submission.version,
        {
          reason: overrideReason.trim(),
          message: overrideMessage.trim() || undefined,
          members: overrideHousehold.members.map((member) => ({
            guestId: member.guestId,
            events: (dashboard?.events ?? []).map((event) => ({
              eventId: event.id,
              attendance: overrideResponses[
                `${member.guestId}:${event.id}`
              ] as "CONFIRMED" | "DECLINED" | "UNSURE",
            })),
            menuId: member.menuId ?? undefined,
            needsTransport: member.needsTransport,
            needsAccommodation: member.needsAccommodation,
          })),
        },
      );
      setOverrideHousehold(null);
      setSelectedHousehold(null);
      toast({
        title: "Răspunsul a fost corectat",
        description: "Modificarea administrativă și motivul ei au fost salvate.",
        variant: "success",
      });
      await load();
    } catch (caught) {
      toast({
        title: "Răspunsul nu a fost corectat",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const summary = dashboard?.summary;
  const segments = [
    {
      label: "Participă",
      value: summary?.confirmed ?? 0,
      color: "var(--success)",
    },
    {
      label: "Nu participă",
      value: summary?.declined ?? 0,
      color: "var(--danger)",
    },
    {
      label: "De clarificat",
      value:
        (summary?.unsure ?? 0) +
        (summary?.mixed ?? 0) +
        (summary?.incomplete ?? 0),
      color: "var(--warning)",
    },
    {
      label: "Fără răspuns",
      value: summary?.noResponse ?? 0,
      color: "var(--line-strong)",
    },
  ];
  const answeredGuests = Math.max(
    0,
    (summary?.totalGuests ?? 0) - (summary?.noResponse ?? 0),
  );
  const draftNeedsPublishing = Boolean(
    form?.draft &&
      (!form.published || form.draft.contentHash !== form.published.contentHash),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Răspunsuri invitați"
        description="Urmărește cine participă, ce răspunsuri lipsesc și unde trebuie să revii cu o reamintire."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!canConfigure}
              onClick={openFormEditor}
            >
              <FilePenLine className="size-3.5" />
              Întrebările formularului
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canExport || saving}
              onClick={() => void exportRsvp()}
            >
              <Download className="size-3.5" />
              Exportă răspunsurile
            </Button>
            <Button
              size="sm"
              disabled={!canSendReminder || !site?.published || saving}
              onClick={() => void reminder()}
            >
              <BellPlus className="size-4" />
              Trimite reamintire
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            <WorkflowStep
              number="1"
              title="Configurează întrebările"
              description={
                form?.published
                  ? `Versiunea ${form.published.versionNumber} este activă pentru invitați.`
                  : "Formularul nu este încă publicat."
              }
              done={Boolean(form?.published)}
              action={
                canConfigure ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand hover:underline"
                    onClick={openFormEditor}
                  >
                    Verifică formularul
                  </button>
                ) : null
              }
            />
            <WorkflowStep
              number="2"
              title="Publică modificările"
              description={
                draftNeedsPublishing
                  ? "Ai o ciornă salvată pe care invitații încă nu o văd."
                  : form?.published
                    ? `Publicat${formatDeadline(form.published.config.deadline) ? ` · termen ${formatDeadline(form.published.config.deadline)}` : " fără termen limită"}.`
                    : "Salvează mai întâi întrebările formularului."
              }
              done={Boolean(form?.published && !draftNeedsPublishing)}
              action={
                draftNeedsPublishing && canConfigure ? (
                  <Button
                    size="sm"
                    loading={saving}
                    disabled={saving}
                    onClick={() => void publish()}
                  >
                    <CalendarClock className="size-3.5" />
                    Publică acum
                  </Button>
                ) : null
              }
            />
            <WorkflowStep
              number="3"
              title="Urmărește și revino"
              description={`${summary?.respondedHouseholds ?? 0} din ${summary?.totalHouseholds ?? 0} gospodării au trimis un răspuns.`}
              done={
                Boolean(summary?.totalHouseholds) &&
                summary?.respondedHouseholds === summary?.totalHouseholds
              }
              action={
                summary?.noResponse && canSendReminder ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand hover:underline"
                    onClick={() => void reminder()}
                  >
                    Verifică destinatarii reamintirii
                  </button>
                ) : null
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Participă"
          value={summary?.confirmed ?? 0}
          tone="success"
        />
        <StatCard label="Nu participă" value={summary?.declined ?? 0} />
        <StatCard
          label="De clarificat"
          value={
            (summary?.unsure ?? 0) +
            (summary?.mixed ?? 0) +
            (summary?.incomplete ?? 0)
          }
          tone="warning"
        />
        <StatCard
          label="Fără răspuns"
          value={summary?.noResponse ?? 0}
          tone="warning"
        />
      </div>

      {error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-semibold text-danger">
              Răspunsurile nu au putut fi încărcate
            </p>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              Încearcă din nou
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted">
            Se verifică formularul publicat și răspunsurile curente…
          </CardContent>
        </Card>
      ) : !summary?.totalGuests ? (
        <EmptyState
          icon={Users}
          title="Nu există invitați activi"
          description="Adaugă invitații și pregătește accesul lor înainte de a colecta răspunsuri."
          action={{
            label: "Mergi la invitați",
            onClick: () => window.location.assign("/guests"),
          }}
        />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
            <Card>
              <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
                <Donut
                  segments={segments}
                  size={150}
                  thickness={18}
                  centerValue={`${summary.totalGuests ? Math.round((answeredGuests / summary.totalGuests) * 100) : 0}%`}
                  centerLabel="au răspuns"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-brand text-lg font-semibold text-ink">
                    Progresul confirmărilor
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Fiecare invitat apare într-o singură stare, calculată din
                    răspunsurile versiunii publicate acum.
                  </p>
                  <div className="mt-4">
                    <DonutLegend
                      items={segments.map((item) => ({
                        color: item.color,
                        label: item.label,
                        value: String(item.value),
                      }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="font-brand text-lg font-semibold text-ink">
                  Ce necesită atenție
                </p>
                <div className="mt-4 space-y-3">
                  <AttentionRow
                    icon={UtensilsCrossed}
                    label="Meniu neales"
                    value={summary.menuIncomplete}
                    href="/menus"
                  />
                  <AttentionRow
                    icon={BusFront}
                    label="Au nevoie de transport"
                    value={summary.transportRequested}
                    href="/transport"
                  />
                  <AttentionRow
                    icon={BedDouble}
                    label="Au nevoie de cazare"
                    value={summary.accommodationRequested}
                    href="/accommodation"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="font-brand text-lg font-semibold text-ink">
                    Răspunsuri pe gospodării
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Deschide o gospodărie pentru răspunsurile fiecărei persoane
                    și fiecărui moment al evenimentului.
                  </p>
                </div>
                <p className="text-sm tabular-nums text-muted">
                  {dashboard?.matchedHouseholds ?? 0} rezultate
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                <Field>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
                      aria-hidden
                    />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Caută după nume…"
                      className="pl-9"
                      aria-label="Caută invitat sau gospodărie"
                    />
                  </div>
                </Field>
                <Field>
                  <Select
                    value={status}
                    onChange={(event) =>
                      setStatus(event.target.value as typeof status)
                    }
                    aria-label="Filtrează după răspuns"
                  >
                    {statusOptions.map((option) => (
                      <option key={option.value || "all"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          {!dashboard?.items.length ? (
            <EmptyState
              icon={Search}
              title="Nu există rezultate pentru filtrul ales"
              description="Schimbă starea sau caută după alt nume. Răspunsurile nu au fost modificate."
              action={{
                label: "Șterge filtrele",
                onClick: () => {
                  setSearch("");
                  setStatus("");
                },
              }}
            />
          ) : (
            <>
              <div className="space-y-3 lg:hidden">
                {dashboard.items.map((household) => (
                  <button
                    key={household.householdId}
                    type="button"
                    onClick={() => setSelectedHousehold(household)}
                    className="flex min-h-24 w-full items-center gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition hover:border-line-strong hover:bg-subtle/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Avatar name={household.householdName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">
                        {household.householdName}
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {household.members.map((member) => member.name).join(", ")}
                      </span>
                      <span className="mt-2 block">
                        <RsvpStatusBadge status={household.status} />
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                  </button>
                ))}
              </div>
              <div className="hidden lg:block">
                <Table minWidth="860px">
                  <THead>
                    <TR>
                      <TH>Gospodărie</TH>
                      <TH>Persoane</TH>
                      <TH>Răspuns</TH>
                      <TH>Meniu</TH>
                      <TH>Logistică</TH>
                      <TH>Actualizat</TH>
                      <TH aria-label="Acțiuni" />
                    </TR>
                  </THead>
                  <TBody>
                    {dashboard.items.map((household) => (
                      <TR
                        key={household.householdId}
                        onClick={() => setSelectedHousehold(household)}
                        aria-label={`Deschide răspunsurile pentru ${household.householdName}`}
                      >
                        <TD>
                          <span className="flex items-center gap-2">
                            <Avatar name={household.householdName} size="xs" />
                            <span className="font-medium">
                              {household.householdName}
                            </span>
                          </span>
                        </TD>
                        <TD>
                          <span className="line-clamp-2 max-w-64 text-sm text-muted">
                            {household.members.map((member) => member.name).join(", ")}
                          </span>
                        </TD>
                        <TD>
                          <RsvpStatusBadge status={household.status} />
                        </TD>
                        <TD>
                          {household.members.filter((member) => member.menuId)
                            .length || "—"}
                          {household.members.some((member) => member.menuId) && (
                            <span className="text-muted">
                              /{household.members.length} alese
                            </span>
                          )}
                        </TD>
                        <TD>
                          <LogisticsSummary household={household} />
                        </TD>
                        <TD className="text-sm text-muted">
                          {formatDateTime(
                            household.submission?.lastModifiedAt ??
                              household.submission?.submittedAt,
                          )}
                        </TD>
                        <TD align="right">
                          <ChevronRight className="ml-auto size-4 text-faint" aria-hidden />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
              {dashboard.nextCursor && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    loading={loadingMore}
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    Încarcă alte gospodării
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <Drawer
        open={Boolean(selectedHousehold)}
        onClose={() => setSelectedHousehold(null)}
        title={selectedHousehold?.householdName}
        description="Răspunsul comun și detaliile fiecărei persoane"
        width="lg"
        footer={
          selectedHousehold?.submission && canOverride ? (
            <Button onClick={() => openOverride(selectedHousehold)}>
              <FilePenLine className="size-4" />
              Corectează răspunsul
            </Button>
          ) : undefined
        }
      >
        {selectedHousehold && dashboard && (
          <HouseholdDetails
            household={selectedHousehold}
            events={dashboard.events}
          />
        )}
      </Drawer>

      <Modal
        open={Boolean(overrideHousehold)}
        onClose={() => {
          if (!saving) setOverrideHousehold(null);
        }}
        title={`Corectează răspunsul · ${overrideHousehold?.householdName ?? ""}`}
        description="Modificarea este salvată ca intervenție a organizatorului și nu șterge istoricul trimiterii."
        size="lg"
      >
        {overrideHousehold && dashboard && (
          <div className="space-y-5">
            {overrideHousehold.members.map((member) => (
              <div key={member.guestId} className="rounded-xl border border-line p-4">
                <p className="font-semibold text-ink">{member.name}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {dashboard.events.map((event) => (
                    <Field key={event.id} label={event.title}>
                      <Select
                        value={
                          overrideResponses[`${member.guestId}:${event.id}`] ?? ""
                        }
                        onChange={(input) =>
                          setOverrideResponses((current) => ({
                            ...current,
                            [`${member.guestId}:${event.id}`]: input.target
                              .value as OverrideAnswer,
                          }))
                        }
                      >
                        <option value="">Alege răspunsul</option>
                        <option value="CONFIRMED">Participă</option>
                        <option value="DECLINED">Nu participă</option>
                        <option value="UNSURE">Încă nu știe</option>
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>
            ))}
            <Field
              label="Motivul corectării"
              hint="Obligatoriu pentru audit; invitații nu văd acest text."
            >
              <Textarea
                value={overrideReason}
                onChange={(event) => setOverrideReason(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Exemplu: confirmare primită telefonic de la familie"
              />
            </Field>
            <Field label="Mesajul familiei (opțional)">
              <Textarea
                value={overrideMessage}
                onChange={(event) => setOverrideMessage(event.target.value)}
                rows={3}
                maxLength={2000}
              />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setOverrideHousehold(null)}
              >
                Renunță
              </Button>
              <Button
                type="button"
                loading={saving}
                disabled={
                  saving ||
                  overrideReason.trim().length < 3 ||
                  overrideHousehold.members.some((member) =>
                    dashboard.events.some(
                      (event) =>
                        !overrideResponses[`${member.guestId}:${event.id}`],
                    ),
                  )
                }
                onClick={() => void saveOverride()}
              >
                Salvează corectarea
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(reminderCampaign)}
        onClose={() => void closeReminder()}
        title="Confirmă reamintirea"
        description="Serverul a reverificat acum cine nu a răspuns și are o adresă de e-mail validă."
        size="sm"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-success-soft p-4">
              <p className="text-2xl font-semibold text-success">
                {reminderAudience?.valid ?? "—"}
              </p>
              <p className="mt-1 text-sm text-ink">vor primi e-mail</p>
            </div>
            <div className="rounded-xl bg-subtle p-4">
              <p className="text-2xl font-semibold text-ink">
                {reminderAudience?.invalid ?? "—"}
              </p>
              <p className="mt-1 text-sm text-muted">nu pot fi contactați</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Din {reminderAudience?.total ?? 0} accesuri eligibile, doar
            destinatarii valizi de mai sus intră în coadă. Mesajele trimise nu
            mai pot fi retrase.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => void closeReminder()}
            >
              Renunță
            </Button>
            <Button
              type="button"
              loading={saving}
              disabled={saving || !reminderAudience?.valid}
              onClick={() => void sendReminder()}
            >
              <Send className="size-4" />
              Trimite către {reminderAudience?.valid ?? 0}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        title="Întrebările formularului pentru invitați"
        description="Salvezi o ciornă aici. Invitații o văd numai după publicare."
        size="lg"
      >
        <form className="space-y-5" onSubmit={saveForm}>
          <div className="rounded-xl border border-line bg-subtle/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Versiunea văzută acum de invitați
                </p>
                <p className="mt-1 text-sm text-muted">
                  {form?.published
                    ? `Versiunea ${form.published.versionNumber}${formatDeadline(form.published.config.deadline) ? ` · termen ${formatDeadline(form.published.config.deadline)}` : " · fără termen limită"}`
                    : "Niciun formular publicat încă"}
                </p>
              </div>
              <Badge variant={form?.published ? "success" : "warning"}>
                {form?.published ? "Activ" : "Nepublicat"}
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Termen pentru răspuns"
              hint="După acest moment, formularul se închide automat."
            >
              <Input
                name="deadline"
                type="datetime-local"
                value={formConfig.deadline}
                onChange={(event) => setConfig("deadline", event.target.value)}
              />
            </Field>
            <Field label="Limba formularului">
              <Select
                value={formConfig.language}
                onChange={(event) => setConfig("language", event.target.value)}
              >
                <option value="ro">Română</option>
              </Select>
            </Field>
          </div>
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              Confirmarea participării
            </legend>
            <div className="divide-y divide-line">
              <Switch
                checked={formConfig.attendanceEnabled}
                onCheckedChange={(value) =>
                  setConfig("attendanceEnabled", value)
                }
                label="Întreabă dacă participă"
                description="Invitații aleg: participă, nu participă sau încă nu știu."
              />
              <Switch
                checked={formConfig.perEventAttendance}
                disabled={!formConfig.attendanceEnabled}
                onCheckedChange={(value) =>
                  setConfig("perEventAttendance", value)
                }
                label="Răspuns separat pentru fiecare moment"
                description="Util când ceremonia, petrecerea sau brunch-ul au invitați diferiți."
              />
              <Switch
                checked={formConfig.plusOneQuestion}
                disabled={!formConfig.attendanceEnabled}
                onCheckedChange={(value) =>
                  setConfig("plusOneQuestion", value)
                }
                label="Permite confirmarea unui însoțitor"
              />
              <Switch
                checked={formConfig.childrenConfirmation}
                disabled={!formConfig.attendanceEnabled}
                onCheckedChange={(value) =>
                  setConfig("childrenConfirmation", value)
                }
                label="Adulții răspund și pentru copii"
              />
              <Switch
                checked={formConfig.allowEdits}
                onCheckedChange={(value) => setConfig("allowEdits", value)}
                label="Permite modificarea răspunsului"
                description="După prima trimitere, familia poate reveni până la termen."
              />
            </div>
          </fieldset>
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold text-ink">
              Detalii utile pentru organizare
            </legend>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Switch
                checked={formConfig.menuSelection}
                onCheckedChange={(value) => setConfig("menuSelection", value)}
                label="Alegerea meniului"
              />
              <Switch
                checked={formConfig.allergyCollection}
                onCheckedChange={(value) =>
                  setConfig("allergyCollection", value)
                }
                label="Alergii și restricții alimentare"
              />
              <Switch
                checked={formConfig.accessibilityCollection}
                onCheckedChange={(value) =>
                  setConfig("accessibilityCollection", value)
                }
                label="Nevoi de accesibilitate"
              />
              <Switch
                checked={formConfig.transportQuestion}
                onCheckedChange={(value) =>
                  setConfig("transportQuestion", value)
                }
                label="Nevoie de transport"
              />
              <Switch
                checked={formConfig.accommodationQuestion}
                onCheckedChange={(value) =>
                  setConfig("accommodationQuestion", value)
                }
                label="Nevoie de cazare"
              />
              <Switch
                checked={formConfig.guestMessage}
                onCheckedChange={(value) => setConfig("guestMessage", value)}
                label="Mesaj pentru organizatori"
              />
            </div>
          </fieldset>
          <Field label="Mesaj afișat după închiderea formularului">
            <Textarea
              value={formConfig.closedMessage}
              onChange={(event) => setConfig("closedMessage", event.target.value)}
              rows={3}
              maxLength={1000}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => setFormOpen(false)}
            >
              Renunță
            </Button>
            <Button
              type="submit"
              loading={saving}
              disabled={saving || !formConfig.closedMessage.trim()}
            >
              Salvează ciorna
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  description,
  done,
  action,
}: {
  number: string;
  title: string;
  description: string;
  done: boolean;
  action: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 p-4 sm:p-5">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-success-soft text-success" : "bg-brand-softer text-brand"}`}
        aria-hidden
      >
        {done ? <CheckCircle2 className="size-4" /> : number}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

function AttentionRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg px-2 transition hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-softer text-brand">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm text-ink">{label}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
      <ChevronRight className="size-4 text-faint" aria-hidden />
    </Link>
  );
}

function RsvpStatusBadge({ status }: { status: RsvpDashboardStatus }) {
  const presentation: Record<
    RsvpDashboardStatus,
    { label: string; variant: "success" | "danger" | "warning" | "neutral" }
  > = {
    confirmed: { label: "Participă", variant: "success" },
    declined: { label: "Nu participă", variant: "danger" },
    unsure: { label: "Încă nu știe", variant: "warning" },
    mixed: { label: "Răspuns mixt", variant: "warning" },
    incomplete: { label: "Incomplet", variant: "warning" },
    no_response: { label: "Fără răspuns", variant: "neutral" },
  };
  const current = presentation[status];
  return <Badge variant={current.variant}>{current.label}</Badge>;
}

function LogisticsSummary({
  household,
}: {
  household: RsvpDashboardHouseholdResource;
}) {
  const transport = household.members.filter(
    (member) => member.needsTransport,
  ).length;
  const accommodation = household.members.filter(
    (member) => member.needsAccommodation,
  ).length;
  if (!transport && !accommodation) return <>—</>;
  return (
    <span className="flex flex-wrap gap-2 text-xs text-muted">
      {transport > 0 && (
        <span className="inline-flex items-center gap-1">
          <BusFront className="size-3.5" aria-hidden /> {transport}
        </span>
      )}
      {accommodation > 0 && (
        <span className="inline-flex items-center gap-1">
          <BedDouble className="size-3.5" aria-hidden /> {accommodation}
        </span>
      )}
    </span>
  );
}

function HouseholdDetails({
  household,
  events,
}: {
  household: RsvpDashboardHouseholdResource;
  events: RsvpDashboardResource["events"];
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-subtle/40 p-4">
        <RsvpStatusBadge status={household.status} />
        <span className="text-sm text-muted">
          {household.submission
            ? `Trimis ${formatDateTime(household.submission.submittedAt)}${household.submission.source === "admin_override" ? " · corectat de organizator" : ""}`
            : "Familia nu a trimis încă formularul"}
        </span>
      </div>
      {household.members.map((member) => (
        <section key={member.guestId} className="rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Avatar name={member.name} size="xs" />
              <div>
                <h3 className="font-semibold text-ink">{member.name}</h3>
                {(member.isChild || member.isPlusOne) && (
                  <p className="text-xs text-muted">
                    {member.isPlusOne ? "Însoțitor" : "Copil"}
                  </p>
                )}
              </div>
            </div>
            <RsvpStatusBadge status={member.status} />
          </div>
          <div className="mt-4 space-y-2">
            {events.map((event) => {
              const response = member.responses.find(
                (item) => item.eventId === event.id,
              );
              return (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-4 rounded-lg bg-subtle/60 px-3 py-2.5"
                >
                  <span className="text-sm text-ink">{event.title}</span>
                  <AttendanceLabel attendance={response?.attendance ?? null} />
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
            {member.menuName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1">
                <UtensilsCrossed className="size-3.5" /> {member.menuName}
              </span>
            )}
            {member.needsTransport && (
              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1">
                <BusFront className="size-3.5" /> Transport
              </span>
            )}
            {member.needsAccommodation && (
              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2.5 py-1">
                <BedDouble className="size-3.5" /> Cazare
              </span>
            )}
            {!member.menuName &&
              !member.needsTransport &&
              !member.needsAccommodation && (
                <span>Fără alte cerințe înregistrate</span>
              )}
          </div>
        </section>
      ))}
      {household.submission?.message && (
        <div className="rounded-xl border border-line p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <MessageSquareText className="size-4 text-brand" />
            Mesajul familiei
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
            {household.submission.message}
          </p>
        </div>
      )}
    </div>
  );
}

function AttendanceLabel({
  attendance,
}: {
  attendance: "confirmed" | "declined" | "unsure" | null;
}) {
  if (attendance === "confirmed")
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
        <CheckCircle2 className="size-4" /> Participă
      </span>
    );
  if (attendance === "declined")
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-danger">
        <XCircle className="size-4" /> Nu participă
      </span>
    );
  if (attendance === "unsure")
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-warning">
        <HelpCircle className="size-4" /> Încă nu știe
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted">
      <AlertTriangle className="size-4" /> Lipsește
    </span>
  );
}

function configFromResource(form: RsvpFormResource | null): RsvpConfig {
  const config = form?.draft?.config ?? form?.published?.config;
  return {
    deadline: isoToLocalInput(config?.deadline ?? null),
    attendanceEnabled: config?.attendanceEnabled ?? true,
    perEventAttendance: config?.perEventAttendance ?? true,
    plusOneQuestion: config?.plusOneQuestion ?? true,
    childrenConfirmation: config?.childrenConfirmation ?? true,
    menuSelection: config?.menuSelection ?? true,
    allergyCollection: config?.allergyCollection ?? true,
    accessibilityCollection: config?.accessibilityCollection ?? true,
    transportQuestion: config?.transportQuestion ?? true,
    accommodationQuestion: config?.accommodationQuestion ?? true,
    guestMessage: config?.guestMessage ?? true,
    allowEdits: config?.allowEdits ?? true,
    closedMessage: config?.closedMessage ?? defaultRsvpConfig.closedMessage,
    language: config?.languages[0] ?? "ro",
  };
}

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDeadline(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function waitForJob(jobId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const job = await weddingOsApi.job(jobId);
    if (job.status === "completed") return;
    if (["failed", "dead_letter", "cancelled"].includes(job.status))
      throw new Error(job.error?.message ?? "Job eșuat");
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }
  throw new Error("Exportul nu s-a încheiat la timp");
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 1_000);
}
