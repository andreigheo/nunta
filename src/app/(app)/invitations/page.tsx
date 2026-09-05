"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  MailPlus,
  Pencil,
  Plus,
  Send,
  UsersRound,
} from "lucide-react";
import type {
  CampaignRecipientResource,
  CampaignResource,
  CreateCampaign,
  GuestTagResource,
  HouseholdResource,
  InvitationRecipientResource,
  InvitationSiteResource,
  InvitationVariantResource,
} from "@weddingos/contracts";
import {
  DistributionCenter,
  recipientName,
} from "@/components/invitations/distribution-center";
import { CampaignList } from "@/components/invitations/campaign-list";
import { InvitationRenderer } from "@/components/invitations/invitation-renderer";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Textarea,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  applyInvitationVariant,
  snapshotFromPersisted,
} from "@/lib/invitations/editor-model";

type AudienceType = "all" | "tag" | "side" | "country" | "language" | "rsvp";
type DeliveryMode = "now" | "schedule";

type CampaignAudiencePreview = {
  total: number;
  valid: number;
  invalid: number;
  invalidRecipients: Array<{ recipientId: string; reason: string }>;
  audienceRevision: string;
};

export default function InvitationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const [site, setSite] = React.useState<InvitationSiteResource | null>(null);
  const [campaigns, setCampaigns] = React.useState<CampaignResource[]>([]);
  const [campaignsTruncated, setCampaignsTruncated] = React.useState(false);
  const [recipients, setRecipients] = React.useState<
    InvitationRecipientResource[]
  >([]);
  const [recipientsTruncated, setRecipientsTruncated] = React.useState(false);
  const [variants, setVariants] = React.useState<InvitationVariantResource[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [campaignOpen, setCampaignOpen] = React.useState(false);
  const [editingCampaign, setEditingCampaign] = React.useState<CampaignResource | null>(null);
  const [campaignToCancel, setCampaignToCancel] = React.useState<CampaignResource | null>(null);
  const [campaignAudienceType, setCampaignAudienceType] = React.useState<AudienceType>("all");
  const [campaignAudienceValue, setCampaignAudienceValue] = React.useState("");
  const [audienceHouseholds, setAudienceHouseholds] = React.useState<HouseholdResource[]>([]);
  const [audienceTags, setAudienceTags] = React.useState<GuestTagResource[]>([]);
  const [audienceOptionsLoading, setAudienceOptionsLoading] = React.useState(false);
  const [audienceOptionsError, setAudienceOptionsError] = React.useState<
    string | null
  >(null);
  const [campaignToSend, setCampaignToSend] =
    React.useState<CampaignResource | null>(null);
  const [campaignToInspect, setCampaignToInspect] =
    React.useState<CampaignResource | null>(null);
  const [campaignDeliveries, setCampaignDeliveries] = React.useState<
    CampaignRecipientResource[]
  >([]);
  const [campaignDeliveriesLoading, setCampaignDeliveriesLoading] =
    React.useState(false);
  const [campaignDeliveriesError, setCampaignDeliveriesError] = React.useState<
    string | null
  >(null);
  const [campaignDeliveriesTruncated, setCampaignDeliveriesTruncated] =
    React.useState(false);
  const [campaignAudience, setCampaignAudience] =
    React.useState<CampaignAudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = React.useState(false);
  const [deliveryMode, setDeliveryMode] = React.useState<DeliveryMode>("now");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewRecipient, setPreviewRecipient] =
    React.useState<InvitationRecipientResource | null>(null);
  const [prepareOpen, setPrepareOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState("");
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canManageRecipients = capabilities.includes(
    "invitation.manage_recipients",
  );
  const canWriteInvitation = capabilities.includes("invitation.write");
  const canReadCampaigns = capabilities.includes("campaign.read");
  const canPublish = capabilities.includes("invitation.publish");
  const canCreateCampaign = capabilities.includes("campaign.write");
  const canSendCampaign = capabilities.includes("campaign.send");
  const canViewCampaignDelivery = capabilities.includes(
    "campaign.view_delivery",
  );
  const canReadGuests = capabilities.includes("guest.read");
  const canManageDistribution =
    canManageRecipients && Boolean(site?.published) && !demoMode;

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [siteData, campaignData, recipientData] = await Promise.all([
        weddingOsApi.invitationSite(currentWorkspace.id),
        canReadCampaigns
          ? loadInvitationCampaigns(currentWorkspace.id)
          : Promise.resolve({ items: [], truncated: false }),
        canManageRecipients
          ? loadInvitationRecipients(currentWorkspace.id)
          : Promise.resolve({ items: [], truncated: false }),
      ]);
      const variantData = siteData
        ? await weddingOsApi.invitationVariants(currentWorkspace.id)
        : { items: [] };
      setSite(siteData);
      setCampaigns(campaignData.items);
      setCampaignsTruncated(campaignData.truncated);
      setRecipients(recipientData.items);
      setRecipientsTruncated(recipientData.truncated);
      setVariants(variantData.items);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [canManageRecipients, canReadCampaigns, currentWorkspace, demoMode]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openCampaignBuilder = async (campaign?: CampaignResource) => {
    setEditingCampaign(campaign ?? null);
    const existingAudience = campaign ? campaignAudienceSelection(campaign.audienceFilter) : { type: "all" as AudienceType, value: "" };
    setCampaignAudienceType(existingAudience.type);
    setCampaignAudienceValue(existingAudience.value);
    setAudienceOptionsError(null);
    setCampaignOpen(true);
    if (!currentWorkspace || !canReadGuests || audienceHouseholds.length || audienceOptionsLoading)
      return;
    setAudienceOptionsLoading(true);
    try {
      const [householdData, tagData] = await Promise.all([
        loadInvitationHouseholds(currentWorkspace.id),
        weddingOsApi.guestTags(currentWorkspace.id),
      ]);
      if (householdData.truncated)
        throw new Error("Lista de gospodării depășește limita sigură de 1.000. Folosește etichete și loturi controlate.");
      setAudienceHouseholds(householdData.items);
      setAudienceTags(tagData.items);
    } catch (caught) {
      setAudienceOptionsError(apiErrorMessage(caught));
      toast({
        title: "Segmentele nu au putut fi încărcate",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setAudienceOptionsLoading(false);
    }
  };

  const publish = async () => {
    if (!currentWorkspace || !site || demoMode || !canPublish) return;
    setSaving(true);
    try {
      const preflight = await weddingOsApi.invitationPreflight(
        currentWorkspace.id,
      );
      if (!preflight.ready)
        throw new Error(
          preflight.errors[0]?.message ??
            "Invitația nu trece verificările de publicare.",
        );
      const updated = await weddingOsApi.publishInvitation(
        currentWorkspace.id,
        site.version,
      );
      setSite(updated);
      toast({
        title: "Invitație publicată",
        description: `Baza și ${preflight.activeVariants} variante au fost verificate înainte de publicare.`,
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

  const prepareRecipients = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || !site?.published || demoMode) return;
    const form = new FormData(event.currentTarget);
    const selectedVariant = String(form.get("variantId") ?? "base");
    setSaving(true);
    try {
      const households = await loadInvitationHouseholds(currentWorkspace.id);
      if (households.truncated)
        throw new Error(
          `Pregătirea s-a oprit înainte de a crea accesuri: există mai mult de ${MAX_HOUSEHOLD_PAGES * HOUSEHOLD_PAGE_SIZE} gospodării. Împarte distribuția în audiențe controlate înainte de a continua.`,
        );
      if (!households.items.length)
        throw new Error(
          "Adaugă cel puțin o gospodărie înainte de a pregăti destinatarii.",
        );
      const householdIds = households.items.map((household) => household.id);
      const recipientIds = new Set<string>();
      let created = 0;
      for (
        let offset = 0;
        offset < householdIds.length;
        offset += RECIPIENT_CREATE_CHUNK_SIZE
      ) {
        const chunk = householdIds.slice(
          offset,
          offset + RECIPIENT_CREATE_CHUNK_SIZE,
        );
        const result = await weddingOsApi.createInvitationRecipients(
          currentWorkspace.id,
          {
            householdIds: chunk,
            guestIds: [],
            invitationVersionId: site.published.id,
            invitationVariantId:
              selectedVariant === "base" ? null : selectedVariant,
          },
          await recipientPreparationKey(
            site.published.id,
            selectedVariant,
            offset / RECIPIENT_CREATE_CHUNK_SIZE,
            chunk,
          ),
        );
        created += result.created;
        result.recipientIds.forEach((recipientId) =>
          recipientIds.add(recipientId),
        );
      }
      setPrepareOpen(false);
      toast({
        title: "Destinatari pregătiți",
        description: `${created} noi · ${recipientIds.size} selectați. Fiecare are acces personal stabil.`,
        variant: "success",
      });
      await load();
    } catch (caught) {
      toast({
        title: "Destinatarii nu au fost pregătiți",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const createCampaign = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentWorkspace || demoMode) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const audienceFilter = campaignAudienceFilter(
        campaignAudienceType,
        campaignAudienceValue,
        form.get("includeChildren") === "on",
        form.get("includePlusOnes") === "on",
      );
      const input: CreateCampaign = {
        name: String(form.get("name")),
        purpose: String(form.get("purpose")) as "INVITATION" | "RSVP_REMINDER" | "INFORMATION_UPDATE" | "THANK_YOU" | "CUSTOM",
        channel: "EMAIL",
        invitationVersionId: site?.published?.id ?? null,
        template: {
          subject: String(form.get("subject")),
          body: String(form.get("body")),
        },
        audienceFilter,
      };
      if (editingCampaign)
        await weddingOsApi.updateCampaign(currentWorkspace.id, editingCampaign.id, editingCampaign.version, input);
      else await weddingOsApi.createCampaign(currentWorkspace.id, input);
      setCampaignOpen(false);
      setEditingCampaign(null);
      setCampaignAudienceType("all");
      setCampaignAudienceValue("");
      toast({
        title: editingCampaign ? "Campanie actualizată" : "Campanie creată",
        description:
          "Este ciornă; destinatarii vor fi fixați numai la trimitere.",
        variant: "success",
      });
      await load();
    } catch (caught) {
      toast({
        title: "Campania nu a fost creată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelCampaign = async () => {
    if (!currentWorkspace || !campaignToCancel || demoMode) return;
    setSaving(true);
    try {
      await weddingOsApi.transitionCampaign(currentWorkspace.id, campaignToCancel.id, campaignToCancel.version, "CANCEL");
      toast({ title: "Campanie anulată", description: "Destinatarii care nu au fost deja trimiși au fost opriți.", variant: "success" });
      setCampaignToCancel(null);
      await load();
    } catch (caught) {
      toast({ title: "Campania nu a fost anulată", description: apiErrorMessage(caught), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const reviewCampaignAudience = async (campaign: CampaignResource) => {
    if (!currentWorkspace || demoMode) return;
    setCampaignToSend(campaign);
    setCampaignAudience(null);
    setDeliveryMode("now");
    setScheduledAt("");
    setAudienceLoading(true);
    try {
      const audience = await weddingOsApi.campaignAudiencePreview(
        currentWorkspace.id,
        campaign.id,
      );
      setCampaignAudience(audience);
    } catch (caught) {
      setCampaignToSend(null);
      toast({
        title: "Audiența nu a putut fi verificată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setAudienceLoading(false);
    }
  };

  const inspectCampaign = async (campaign: CampaignResource) => {
    if (!currentWorkspace || !canViewCampaignDelivery) return;
    setCampaignToInspect(campaign);
    setCampaignDeliveries([]);
    setCampaignDeliveriesError(null);
    setCampaignDeliveriesTruncated(false);
    setCampaignDeliveriesLoading(true);
    try {
      const result = await loadCampaignDeliveries(
        currentWorkspace.id,
        campaign.id,
      );
      setCampaignDeliveries(result.items);
      setCampaignDeliveriesTruncated(result.truncated);
    } catch (caught) {
      setCampaignDeliveriesError(apiErrorMessage(caught));
    } finally {
      setCampaignDeliveriesLoading(false);
    }
  };

  const sendCampaign = async () => {
    if (
      !currentWorkspace ||
      !campaignToSend ||
      !campaignAudience?.valid ||
      demoMode
    )
      return;
    setSaving(true);
    try {
      const scheduledIso = deliveryMode === "schedule" ? scheduledDateTime(scheduledAt) : undefined;
      const result = await weddingOsApi.transitionCampaign(
        currentWorkspace.id,
        campaignToSend.id,
        campaignToSend.version,
        deliveryMode === "schedule" ? "SCHEDULE" : "SEND_NOW",
        scheduledIso,
        campaignAudience.audienceRevision,
      );
      setCampaignToSend(null);
      setCampaignAudience(null);
      toast({
        title: deliveryMode === "schedule" ? "Campanie programată" : "Livrare pusă în coadă",
        description: deliveryMode === "schedule"
          ? `Trimiterea va începe la ${new Date(scheduledIso!).toLocaleString("ro-RO")}.`
          : result.job
          ? `Job ${result.job.id.slice(0, 8)} procesează destinatarii; e-mailurile nu sunt declarate livrate înainte de confirmarea furnizorului.`
          : "Destinatarii sunt procesați asincron.",
        variant: "info",
      });
      await load();
    } catch (caught) {
      toast({
        title: "Campania nu a fost pusă în coadă",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const assignVariant = async (
    recipient: InvitationRecipientResource,
    variantId: string | null,
  ) => {
    if (!currentWorkspace || !canManageDistribution) return;
    setBusyAction(`${recipient.id}:variant`);
    try {
      const updated = await weddingOsApi.assignInvitationRecipientVariant(
        currentWorkspace.id,
        recipient.id,
        recipient.version,
        variantId,
      );
      setRecipients((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast({
        title: "Varianta a fost alocată",
        description: `${recipientName(updated)} va primi ${updated.invitationVariantName ?? "invitația de bază"}.`,
        variant: "success",
      });
      void weddingOsApi
        .invitationVariants(currentWorkspace.id)
        .then((data) => setVariants(data.items))
        .catch(() => undefined);
    } catch (caught) {
      toast({
        title: "Varianta nu a fost alocată",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setBusyAction("");
    }
  };

  const personalLink = async (
    recipient: InvitationRecipientResource,
    channel: "MANUAL" | "WHATSAPP",
  ) => {
    if (!currentWorkspace) throw new Error("Spațiul de lucru nu este activ.");
    const result = await weddingOsApi.recipientAccessLinks(
      currentWorkspace.id,
      recipient.id,
      [channel],
    );
    const link = result.items.find((item) => item.channel === channel);
    if (!link) throw new Error("Linkul personal nu a fost creat.");
    return link;
  };

  const copyPersonalLink = async (recipient: InvitationRecipientResource) => {
    setBusyAction(`${recipient.id}:copy`);
    try {
      const link = await personalLink(recipient, "MANUAL");
      await navigator.clipboard.writeText(link.url);
      toast({
        title: "Link personal copiat",
        description: link.reused
          ? "Am refolosit accesul stabil al acestui destinatar."
          : "Accesul personal a fost creat și copiat.",
        variant: "success",
      });
    } catch (caught) {
      showDistributionError("Linkul nu a fost copiat", caught);
    } finally {
      setBusyAction("");
    }
  };

  const openWhatsApp = async (recipient: InvitationRecipientResource) => {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusyAction(`${recipient.id}:whatsapp`);
    try {
      const link = await personalLink(recipient, "WHATSAPP");
      const message = `Bună! Ai o invitație Sarbato: ${link.url}`;
      if (!popup)
        throw new Error(
          "Browserul a blocat fereastra WhatsApp. Permite ferestrele noi și încearcă din nou.",
        );
      popup.location.replace(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
      );
      toast({
        title: "WhatsApp deschis",
        description:
          "Mesajul este pregătit, dar îl verifici și îl trimiți tu din WhatsApp.",
        variant: "info",
      });
    } catch (caught) {
      popup?.close();
      showDistributionError("WhatsApp nu a fost deschis", caught);
    } finally {
      setBusyAction("");
    }
  };

  const downloadQr = async (recipient: InvitationRecipientResource) => {
    if (!currentWorkspace) return;
    setBusyAction(`${recipient.id}:qr`);
    try {
      const blob = await weddingOsApi.downloadRecipientQr(
        currentWorkspace.id,
        recipient.id,
      );
      downloadBlob(blob, `sarbato-${fileSlug(recipientName(recipient))}-qr.svg`);
      toast({
        title: "QR personal descărcat",
        description:
          "Codul QR are un grant izolat; linkurile de e-mail și WhatsApp rămân valide.",
        variant: "success",
      });
    } catch (caught) {
      showDistributionError("QR-ul nu a fost descărcat", caught);
    } finally {
      setBusyAction("");
    }
  };

  const showDistributionError = (title: string, caught: unknown) =>
    toast({
      title,
      description: apiErrorMessage(caught),
      variant: "error",
    });

  const deliveredEmails = campaigns.reduce(
    (sum, campaign) => sum + (campaign.statistics.byStatus.delivered ?? 0),
    0,
  );
  const openedEmails = campaigns.reduce(
    (sum, campaign) => sum + (campaign.statistics.byStatus.opened ?? 0),
    0,
  );
  const accessedLinks = recipients.filter((item) => item.lastAccessedAt).length;
  const openedInvitations = recipients.filter((item) => item.openedAt).length;
  const completedRsvp = recipients.filter((item) => item.rsvpCompletedAt).length;
  const startedCampaigns = campaigns.filter((campaign) =>
    ["scheduled", "queued", "sending", "completed", "partial"].includes(
      campaign.status,
    ),
  ).length;
  const previewSnapshot = React.useMemo(
    () => {
      const persisted = previewRecipient ? site?.published : site?.draft;
      if (!persisted) return null;
      const base = snapshotFromPersisted(
        persisted.document.sections,
        persisted.settings as Parameters<typeof snapshotFromPersisted>[1],
      );
      if (!previewRecipient?.invitationVariantId) return base;
      const variant = variants.find(
        (item) => item.id === previewRecipient.invitationVariantId,
      );
      const publishedVariant =
        variant?.published?.baseInvitationVersionId === persisted.id
          ? variant.published
          : null;
      return publishedVariant
        ? applyInvitationVariant(
            base,
            publishedVariant.overrides as Parameters<
              typeof applyInvitationVariant
            >[1],
          )
        : base;
    },
    [previewRecipient, site, variants],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Invitații digitale"
        description="Construiește experiența, publică versiunea verificată și distribuie accesul personal fiecărui invitat."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!canWriteInvitation}
              onClick={() => router.push("/invitations/editor")}
            >
              <Pencil className="size-3.5" aria-hidden />
              Editează invitația
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!previewSnapshot}
              onClick={() => {
                setPreviewRecipient(null);
                setPreviewOpen(true);
              }}
            >
              <Eye className="size-3.5" aria-hidden />
              Previzualizează ciorna
            </Button>
            <Button
              size="sm"
              disabled={!site?.draft || !canPublish || demoMode || saving}
              loading={saving}
              onClick={() => void publish()}
            >
              {site?.status === "published"
                ? "Actualizează publicarea"
                : "Publică invitația"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!site?.published || !canManageRecipients || demoMode}
              onClick={() => setPrepareOpen(true)}
            >
              <UsersRound className="size-3.5" aria-hidden />
              Pregătește destinatari
            </Button>
          </>
        }
      />

      <nav
        aria-label="Etapele distribuirii invitației"
        className="rounded-xl border border-line bg-elevated p-3 sm:p-4"
      >
        <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <WorkflowStep
            number={1}
            label="Creează"
            detail={site?.draft ? "Ciorna este salvată" : "Începe în studio"}
            complete={Boolean(site?.draft)}
          />
          <WorkflowStep
            number={2}
            label="Publică"
            detail={site?.published ? `Versiunea ${site.published.versionNumber}` : "Verifică și publică"}
            complete={Boolean(site?.published)}
          />
          <WorkflowStep
            number={3}
            label="Pregătește accesul"
            detail={
              recipients.length
                ? `${recipients.length} accesuri pregătite`
                : "După publicare"
            }
            complete={recipients.length > 0}
          />
          <WorkflowStep
            number={4}
            label="Trimite și urmărește"
            detail={startedCampaigns ? `${startedCampaigns} campanii pornite` : "Confirmă audiența"}
            complete={startedCampaigns > 0}
          />
        </ol>
      </nav>

      {error ? (
        <Card>
          <CardContent className="p-6 text-sm text-danger">
            {error}
            <Button size="sm" className="ml-3" onClick={() => void load()}>
              Reîncearcă
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="p-8 text-sm text-muted">
            Se încarcă invitația, distribuția și campaniile reale…
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(18rem,.9fr)_minmax(0,2.1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Invitația activă</CardTitle>
                <Badge
                  variant={site?.status === "published" ? "success" : "warning"}
                  dot
                >
                  {site?.status === "published" ? "Publicată" : "Ciornă"}
                </Badge>
              </CardHeader>
              <CardContent>
                {site ? (
                  <button
                    disabled={!canWriteInvitation}
                    onClick={() => router.push("/invitations/editor")}
                    className="block min-h-44 w-full rounded-xl border border-line bg-brand-softer p-6 text-center transition-colors enabled:cursor-pointer enabled:hover:border-brand disabled:cursor-default"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[.25em] text-faint">
                      Sarbato
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-brand-strong">
                      {site.slug}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {site.published
                        ? `Publicată v${site.published.versionNumber}`
                        : "Nepublicată"}
                      {site.draft
                        ? ` · Ciornă v${site.draft.versionNumber}`
                        : ""}
                      {` · ${site.defaultLanguage.toUpperCase()}`}
                    </p>
                    {canWriteInvitation ? (
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand">
                        <Pencil className="size-3" aria-hidden />
                        Continuă în studio
                      </span>
                    ) : (
                      <span className="mt-4 inline-flex text-xs font-medium text-muted">
                        Acces numai pentru vizualizare
                      </span>
                    )}
                  </button>
                ) : (
                  <EmptyState
                    icon={MailPlus}
                    title="Invitația nu este configurată"
                    description="Creează prima versiune în studio; nimic nu este publicat automat."
                    action={
                      canWriteInvitation
                        ? {
                            label: "Deschide studioul",
                            onClick: () => router.push("/invitations/editor"),
                          }
                        : undefined
                    }
                  />
                )}
              </CardContent>
            </Card>

            {canManageRecipients ? <div>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-brand text-lg font-semibold text-ink">
                    Parcursul invitației
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    Accesul linkului, deschiderea invitației și RSVP sunt evenimente
                    distincte.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatCard label="Destinatari" value={recipients.length} />
                <StatCard label="Link accesat" value={accessedLinks} />
                <StatCard label="Invitație deschisă" value={openedInvitations} />
                <StatCard label="RSVP completat" value={completedRsvp} />
              </div>
            </div> : null}
          </div>

          {canManageRecipients ? <Card>
            <CardHeader className="flex-col sm:flex-row">
              <div>
                <CardTitle>Centru de distribuție</CardTitle>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
                  Alege varianta fiecărui destinatar, previzualizează fără să
                  înregistrezi deschiderea și distribuie manual prin link,
                  WhatsApp sau QR. Nicio acțiune de aici nu declară mesajul
                  trimis automat.
                </p>
              </div>
              <Badge variant="brand">{recipients.length} destinatari</Badge>
            </CardHeader>
            {recipientsTruncated ? (
              <div className="mx-5 mb-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                Sunt afișați primii 500 de destinatari. Restrânge distribuția în
                loturi înainte de a continua.
              </div>
            ) : null}
            {recipients.length ? (
              <DistributionCenter
                recipients={recipients}
                variants={variants}
                busyAction={busyAction}
                canManage={canManageDistribution}
                onAssignVariant={(recipient, variantId) =>
                  void assignVariant(recipient, variantId)
                }
                onCopyLink={(recipient) => void copyPersonalLink(recipient)}
                onPreview={(recipient) => {
                  setPreviewRecipient(recipient);
                  setPreviewOpen(true);
                }}
                onOpenWhatsApp={(recipient) => void openWhatsApp(recipient)}
                onDownloadQr={(recipient) => void downloadQr(recipient)}
              />
            ) : (
              <CardContent>
                <EmptyState
                  icon={UsersRound}
                  title="Niciun destinatar pregătit"
                  description="După publicare, creează accesuri personale pentru gospodăriile tale."
                  action={
                    site?.published && canManageRecipients
                      ? {
                          label: "Pregătește destinatarii",
                          onClick: () => setPrepareOpen(true),
                        }
                      : undefined
                  }
                />
              </CardContent>
            )}
          </Card> : null}

          {canReadCampaigns ? <Card>
            <CardHeader className="flex-col sm:flex-row">
              <div>
                <CardTitle>Campanii e-mail</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Livrarea automată este pe e-mail. WhatsApp rămâne o acțiune manuală,
                  verificată de organizator.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="neutral">{deliveredEmails} livrate</Badge>
                  <Badge variant="neutral">{openedEmails} e-mailuri deschise</Badge>
                </div>
              </div>
              <Button
                size="sm"
                disabled={!site?.published || !canCreateCampaign || demoMode}
                onClick={() => void openCampaignBuilder()}
              >
                <Plus className="size-4" aria-hidden />
                Campanie nouă
              </Button>
            </CardHeader>
            {campaignsTruncated ? (
              <div className="mx-4 mb-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning sm:mx-5">
                Sunt afișate cele mai recente 500 de campanii. Arhivează
                campaniile vechi sau restrânge perioada urmărită.
              </div>
            ) : null}
            {campaigns.length ? (
              <CampaignList
                campaigns={campaigns}
                saving={saving}
                canCreate={canCreateCampaign}
                canSend={canSendCampaign}
                canViewDelivery={canViewCampaignDelivery}
                onEdit={(campaign) => void openCampaignBuilder(campaign)}
                onSend={(campaign) => void reviewCampaignAudience(campaign)}
                onCancel={setCampaignToCancel}
                onDetails={(campaign) => void inspectCampaign(campaign)}
              />
            ) : (
              <CardContent>
                <EmptyState
                  icon={Send}
                  title="Nu există campanii e-mail"
                  description="Creează o campanie după publicarea invitației și pregătirea destinatarilor."
                />
              </CardContent>
            )}
          </Card> : null}
        </>
      )}

      <Modal
        open={prepareOpen}
        onClose={() => setPrepareOpen(false)}
        title="Pregătește destinatarii"
        description="Se creează acces personal stabil pentru fiecare gospodărie existentă."
        size="sm"
      >
        <form className="space-y-4" onSubmit={prepareRecipients}>
          <Field
            label="Variantă inițială"
            hint="Poți schimba varianta individual din centrul de distribuție."
          >
            <Select name="variantId" defaultValue="base">
              <option value="base">Invitația de bază</option>
              {variants
                .filter(
                  (variant) =>
                    variant.status === "active" && Boolean(variant.published),
                )
                .map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name}
                  </option>
                ))}
            </Select>
          </Field>
          <p className="rounded-lg bg-subtle p-3 text-xs leading-relaxed text-muted">
            Pregătirea nu trimite mesaje. Ea fixează versiunea publicată și creează
            identitatea de acces; distribuția rămâne sub controlul tău.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPrepareOpen(false)}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving} disabled={saving}>
              Pregătește accesurile
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={campaignOpen}
        onClose={() => { setCampaignOpen(false); setEditingCampaign(null); setCampaignAudienceType("all"); setCampaignAudienceValue(""); }}
        title={editingCampaign ? "Editează campania" : "Campanie e-mail nouă"}
        description="Alege scopul și exact cui îi trimiți. Campania rămâne ciornă până la confirmarea audienței."
      >
        <form key={editingCampaign?.id ?? "new-campaign"} className="space-y-4" onSubmit={createCampaign}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scopul mesajului" required>
              <Select name="purpose" defaultValue={editingCampaign?.purpose.toUpperCase() ?? "INVITATION"}>
                <option value="INVITATION">Trimite invitația</option>
                <option value="RSVP_REMINDER">Reamintește RSVP-ul</option>
                <option value="INFORMATION_UPDATE">Anunță o modificare</option>
                <option value="THANK_YOU">Trimite mulțumiri</option>
                <option value="CUSTOM">Mesaj personalizat</option>
              </Select>
            </Field>
            <Field label="Audiență" required>
              <Select value={campaignAudienceType} onChange={(event) => { setCampaignAudienceType(event.target.value as AudienceType); setCampaignAudienceValue(""); }}>
                <option value="all">Toți destinatarii eligibili</option>
                <option value="tag">O etichetă</option>
                <option value="side">O parte a evenimentului</option>
                <option value="country">O țară</option>
                <option value="language">O limbă</option>
                <option value="rsvp">Un status RSVP</option>
              </Select>
            </Field>
          </div>
          {audienceOptionsError ? (
            <div
              className="rounded-lg bg-danger-soft p-3 text-sm text-danger"
              role="alert"
            >
              <p className="font-semibold">Segmentele nu sunt disponibile</p>
              <p className="mt-1 text-xs leading-relaxed">
                {audienceOptionsError} Poți folosi audiența completă sau poți
                închide formularul și reîncerca.
              </p>
            </div>
          ) : null}
          {campaignAudienceType !== "all" ? <AudienceValueField type={campaignAudienceType} value={campaignAudienceValue} onChange={setCampaignAudienceValue} tags={audienceTags} households={audienceHouseholds} loading={audienceOptionsLoading} /> : null}
          <div className="grid gap-2 rounded-lg bg-subtle p-3 text-sm sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2"><input name="includeChildren" type="checkbox" defaultChecked={editingCampaign?.audienceFilter.includeChildren !== false} className="size-4 accent-brand" />Include gospodăriile cu copii</label>
            <label className="flex min-h-11 items-center gap-2"><input name="includePlusOnes" type="checkbox" defaultChecked={editingCampaign?.audienceFilter.includePlusOnes !== false} className="size-4 accent-brand" />Include gospodăriile cu plus-unu</label>
          </div>
          <Field
            label="Nume intern"
            hint="Îl vezi numai tu în lista campaniilor."
            required
          >
            <Input
              name="name"
              required
              maxLength={180}
              defaultValue={editingCampaign?.name ?? ""}
              placeholder="Invitația principală"
            />
          </Field>
          <Field
            label="Subiectul e-mailului"
            hint="Spune clar cine invită; evită formulările generice."
            required
          >
            <Input
              name="subject"
              required
              maxLength={240}
              defaultValue={campaignTemplateValue(editingCampaign, "subject")}
              placeholder="Andrei & Andreea vă invită"
            />
          </Field>
          <Field
            label="Mesajul din e-mail"
            hint="Apare înaintea butonului care deschide invitația personală."
            required
          >
            <Textarea
              name="body"
              required
              maxLength={10000}
              defaultValue={campaignTemplateValue(editingCampaign, "body")}
              placeholder="Ne-ar bucura să fiți alături de noi. Deschideți invitația pentru toate detaliile și confirmare."
            />
          </Field>
          <div className="rounded-xl border border-line bg-subtle/60 p-3">
            <p className="text-xs font-semibold text-ink">
              Ce primește invitatul
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              E-mailul include identitatea vizuală aleasă și butonul către
              linkul personal. Înainte de trimitere vezi numărul exact de
              adrese valide; dacă audiența se schimbă, serverul oprește acțiunea.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setCampaignOpen(false); setEditingCampaign(null); setCampaignAudienceType("all"); setCampaignAudienceValue(""); }}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving} disabled={saving || audienceOptionsLoading || (campaignAudienceType !== "all" && !campaignAudienceValue)}>
              {editingCampaign ? "Salvează modificările" : "Salvează ciorna"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(campaignToCancel)}
        onClose={() => setCampaignToCancel(null)}
        onConfirm={() => void cancelCampaign()}
        title="Anulezi campania?"
        description="Mesajele acceptate deja de furnizor nu pot fi retrase. Destinatarii rămași în așteptare vor fi opriți."
        confirmLabel="Anulează campania"
        destructive
        loading={saving}
      />

      <Modal
        open={Boolean(campaignToSend)}
        onClose={() => {
          if (saving) return;
          setCampaignToSend(null);
          setCampaignAudience(null);
        }}
        title="Confirmă distribuirea"
        description={
          campaignToSend
            ? `Verifică audiența pentru „${campaignToSend.name}” înainte ca mesajele să intre în coadă.`
            : undefined
        }
        size="sm"
      >
        <div className="space-y-4">
          {audienceLoading ? (
            <div
              className="rounded-xl bg-subtle p-4 text-sm text-muted"
              role="status"
            >
              Verific destinatarii și adresele de e-mail…
            </div>
          ) : campaignAudience ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-success-soft p-4">
                  <p className="text-2xl font-semibold text-success">
                    {campaignAudience.valid}
                  </p>
                  <p className="mt-1 text-sm text-ink">
                    {campaignAudience.valid === 1
                      ? "destinatar valid"
                      : "destinatari valizi"}
                  </p>
                </div>
                <div className="rounded-xl bg-subtle p-4">
                  <p className="text-2xl font-semibold text-ink">
                    {campaignAudience.invalid}
                  </p>
                  <p className="mt-1 text-sm text-muted">fără adresă validă</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-muted">
                Sunt {campaignAudience.total} accesuri eligibile. Doar adresele
                valide intră în coadă; mesajele trimise nu mai pot fi retrase.
              </p>
              {campaignAudience.invalidRecipients.length ? <div className="rounded-lg bg-warning-soft p-3 text-xs text-warning"><p className="font-semibold">De ce sunt omise unele accesuri</p><ul className="mt-1 space-y-1">{campaignAudience.invalidRecipients.slice(0, 3).map((item) => <li key={item.recipientId}>{campaignAudienceReason(item.reason)}</li>)}</ul>{campaignAudience.invalidRecipients.length > 3 ? <p className="mt-1">Și încă {campaignAudience.invalidRecipients.length - 3} accesuri cu probleme.</p> : null}</div> : null}
              <div className="rounded-xl border border-line p-3">
                <Field label="Momentul trimiterii">
                  <Select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value as DeliveryMode)}>
                    <option value="now">Trimite acum</option>
                    <option value="schedule">Programează pentru mai târziu</option>
                  </Select>
                </Field>
                {deliveryMode === "schedule" ? <Field className="mt-3" label="Data și ora" hint="Folosește ora locală afișată de dispozitiv."><Input type="datetime-local" value={scheduledAt} min={minimumScheduleDate()} onChange={(event) => setScheduledAt(event.target.value)} /></Field> : null}
              </div>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setCampaignToSend(null);
                setCampaignAudience(null);
              }}
            >
              Renunță
            </Button>
            <Button
              type="button"
              loading={saving}
              disabled={
                saving || audienceLoading || !campaignAudience?.valid || (deliveryMode === "schedule" && !scheduledAt)
              }
              onClick={() => void sendCampaign()}
            >
              <Send className="size-4" aria-hidden />
              {campaignAudience
                ? `${deliveryMode === "schedule" ? "Programează" : "Trimite"} pentru ${campaignAudience.valid} ${campaignAudience.valid === 1 ? "destinatar" : "destinatari"}`
                : "Verifică audiența"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(campaignToInspect)}
        onClose={() => {
          setCampaignToInspect(null);
          setCampaignDeliveries([]);
          setCampaignDeliveriesError(null);
        }}
        title={
          campaignToInspect
            ? `Livrarea campaniei „${campaignToInspect.name}”`
            : "Detalii livrare"
        }
        description="Adresele sunt mascate. Stările provin din coada de livrare și din confirmările furnizorului de e-mail."
      >
        {campaignDeliveriesLoading ? (
          <div className="rounded-xl bg-subtle p-4 text-sm text-muted" role="status">
            Se încarcă parcursul livrărilor…
          </div>
        ) : campaignDeliveriesError ? (
          <div className="rounded-xl bg-danger-soft p-4 text-sm text-danger" role="alert">
            <p className="font-semibold">Detaliile nu au putut fi încărcate</p>
            <p className="mt-1">{campaignDeliveriesError}</p>
            {campaignToInspect ? (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => void inspectCampaign(campaignToInspect)}
              >
                Reîncearcă
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <DeliverySummary deliveries={campaignDeliveries} />
            {campaignDeliveriesTruncated ? (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                Sunt afișate primele 500 de livrări ale campaniei.
              </p>
            ) : null}
            {campaignDeliveries.length ? (
              <ul className="max-h-[55vh] divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {campaignDeliveries.map((delivery) => (
                  <li
                    key={delivery.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {delivery.address}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {deliveryMoment(delivery)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={deliveryBadge(delivery.status)} dot>
                        {deliveryStatusLabel(delivery.status)}
                      </Badge>
                      {delivery.failureCode ? (
                        <span className="max-w-52 truncate text-xs text-danger" title={delivery.failureCode}>
                          {deliveryFailureLabel(delivery.failureCode)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Send}
                title="Campania nu are încă livrări"
                description="Destinatarii apar aici după confirmarea audienței și punerea campaniei în coadă."
              />
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewRecipient(null);
        }}
        title={
          previewRecipient
            ? `Previzualizare pentru ${recipientName(previewRecipient)}`
            : "Previzualizează ciorna"
        }
        description={
          previewRecipient
            ? "Folosește versiunea publicată și varianta alocată, fără token și fără a modifica analiticele destinatarului."
            : "Același renderer folosit de invitația primită de destinatar."
        }
        size="full"
      >
        {previewSnapshot && currentWorkspace ? (
          <div className="rounded-xl bg-sunken p-2 sm:p-4">
            <div className="mx-auto w-full max-w-[768px] overflow-hidden rounded-xl shadow-overlay">
              <InvitationRenderer
                snapshot={previewSnapshot}
                resolveMedia={(mediaId, externalUrl = "") =>
                  mediaId
                    ? `/api/v1/workspaces/${encodeURIComponent(currentWorkspace.id)}/invitation-media/${encodeURIComponent(mediaId)}`
                    : safeImageUrl(externalUrl)
                }
              />
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Eye}
            title="Nu există o ciornă de previzualizat"
            description="Deschide studioul și salvează prima versiune."
          />
        )}
      </Modal>
    </div>
  );
}

function WorkflowStep({
  number,
  label,
  detail,
  complete,
}: {
  number: number;
  label: string;
  detail: string;
  complete: boolean;
}) {
  return (
    <li
      className={
        complete
          ? "flex min-w-0 items-center gap-3 rounded-lg bg-success-soft px-3 py-2.5"
          : "flex min-w-0 items-center gap-3 rounded-lg bg-subtle px-3 py-2.5"
      }
    >
      <span
        className={
          complete
            ? "grid size-8 shrink-0 place-items-center rounded-full bg-success text-white"
            : "grid size-8 shrink-0 place-items-center rounded-full border border-line bg-elevated text-sm font-semibold text-muted"
        }
        aria-hidden
      >
        {complete ? <CheckCircle2 className="size-4" /> : number}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </span>
    </li>
  );
}

function DeliverySummary({
  deliveries,
}: {
  deliveries: CampaignRecipientResource[];
}) {
  const delivered = deliveries.filter((delivery) =>
    ["delivered", "opened"].includes(delivery.status),
  ).length;
  const opened = deliveries.filter(
    (delivery) => delivery.status === "opened",
  ).length;
  const failed = deliveries.filter(
    (delivery) => delivery.status === "failed",
  ).length;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatCard label="Total" value={deliveries.length} />
      <StatCard label="Livrate" value={delivered} />
      <StatCard label="Deschise" value={opened} />
      <StatCard label="Eșuate" value={failed} />
    </div>
  );
}

function deliveryStatusLabel(status: CampaignRecipientResource["status"]) {
  return (
    {
      pending: "În așteptare",
      queued: "În coadă",
      sent: "Acceptat de furnizor",
      delivered: "Livrat",
      opened: "Deschis",
      failed: "Eșuat",
      cancelled: "Anulat",
      unsubscribed: "Dezabonat",
    } as Record<CampaignRecipientResource["status"], string>
  )[status];
}

function deliveryBadge(
  status: CampaignRecipientResource["status"],
): "success" | "danger" | "warning" | "info" | "neutral" {
  if (["delivered", "opened"].includes(status)) return "success";
  if (status === "failed") return "danger";
  if (status === "unsubscribed") return "warning";
  if (["queued", "sent"].includes(status)) return "info";
  return "neutral";
}

function deliveryMoment(delivery: CampaignRecipientResource) {
  const value =
    delivery.openedAt ??
    delivery.deliveredAt ??
    delivery.sentAt ??
    delivery.queuedAt ??
    delivery.failedAt;
  return value
    ? new Date(value).toLocaleString("ro-RO")
    : "Nu a început încă procesarea";
}

function deliveryFailureLabel(code: string) {
  if (code === "CAMPAIGN_ADDRESS_CHANGED")
    return "Adresa destinatarului s-a schimbat";
  if (code === "CAMPAIGN_TARGET_INACTIVE")
    return "Accesul destinatarului nu mai este activ";
  if (code === "CAMPAIGN_SITE_UNPUBLISHED")
    return "Invitația nu mai este publicată";
  return `Eroare: ${code.toLocaleLowerCase("ro-RO").replaceAll("_", " ")}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function fileSlug(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "invitatie"
  );
}

function safeImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : "";
  } catch {
    return "";
  }
}

function campaignAudienceFilter(
  type: AudienceType,
  value: string,
  includeChildren: boolean,
  includePlusOnes: boolean,
): CreateCampaign["audienceFilter"] {
  const common = { includeChildren, includePlusOnes };
  if (type === "all") return common;
  if (!value) throw new Error("Alege valoarea audienței înainte de a salva campania.");
  if (type === "tag") return { ...common, tagIds: [value] };
  if (type === "side")
    return {
      ...common,
      sides: [value as "PARTNER_ONE" | "PARTNER_TWO" | "COMMON" | "VENDOR" | "OTHER"],
    };
  if (type === "country") return { ...common, countries: [value] };
  if (type === "language") return { ...common, preferredLanguages: [value] };
  return {
    ...common,
    rsvpStatuses: [value as "CONFIRMED" | "DECLINED" | "UNSURE" | "NO_RESPONSE"],
  };
}

function campaignAudienceSelection(value: Record<string, unknown>): { type: AudienceType; value: string } {
  if (Array.isArray(value.tagIds) && value.tagIds[0]) return { type: "tag", value: String(value.tagIds[0]) };
  if (Array.isArray(value.sides) && value.sides[0]) return { type: "side", value: String(value.sides[0]) };
  if (Array.isArray(value.countries) && value.countries[0]) return { type: "country", value: String(value.countries[0]) };
  if (Array.isArray(value.preferredLanguages) && value.preferredLanguages[0]) return { type: "language", value: String(value.preferredLanguages[0]) };
  if (Array.isArray(value.rsvpStatuses) && value.rsvpStatuses[0]) return { type: "rsvp", value: String(value.rsvpStatuses[0]) };
  return { type: "all", value: "" };
}

function campaignTemplateValue(campaign: CampaignResource | null, key: "subject" | "body") {
  const value = campaign?.template[key];
  return typeof value === "string" ? value : "";
}

function campaignAudienceReason(reason: string) {
  if (reason === "missing_email") return "Lipsește o adresă de e-mail validă în gospodărie.";
  if (reason === "variant_unpublished") return "Varianta alocată nu este publicată.";
  return "Accesul nu mai este eligibil pentru această campanie.";
}

function AudienceValueField({ type, value, onChange, tags, households, loading }: { type: Exclude<AudienceType, "all">; value: string; onChange: (value: string) => void; tags: GuestTagResource[]; households: HouseholdResource[]; loading: boolean }) {
  const countries = [...new Set(households.map((household) => household.country).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "ro-RO"));
  const languages = [...new Set(households.map((household) => household.preferredLanguage).filter(Boolean))].sort();
  if (loading)
    return <div className="rounded-lg bg-subtle p-3 text-sm text-muted" role="status">Se încarcă segmentele reale…</div>;
  if (type === "tag")
    return <Field label="Etichetă" required><Select name="audienceValue" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Alege eticheta</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name} · {tag.assignedGuests ?? 0} persoane</option>)}</Select></Field>;
  if (type === "side")
    return <Field label="Parte" required><Select name="audienceValue" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Alege partea</option><option value="PARTNER_ONE">Partener 1</option><option value="PARTNER_TWO">Partener 2</option><option value="COMMON">Comună</option><option value="VENDOR">Furnizori</option><option value="OTHER">Altele</option></Select></Field>;
  if (type === "country")
    return <Field label="Țară" hint={countries.length ? "Sunt afișate țările salvate pe gospodării." : "Completează țara în gospodării pentru a folosi acest segment."} required><Select name="audienceValue" value={value} onChange={(event) => onChange(event.target.value)} required disabled={!countries.length}><option value="">Alege țara</option>{countries.map((country) => <option key={country} value={country}>{country}</option>)}</Select></Field>;
  if (type === "language")
    return <Field label="Limba comunicării" hint={languages.length ? "Folosește preferința salvată pe destinatar." : "Completează limba pe gospodării sau invitați."} required><Select name="audienceValue" value={value} onChange={(event) => onChange(event.target.value)} required disabled={!languages.length}><option value="">Alege limba</option>{languages.map((language) => <option key={language} value={language}>{languageName(language)}</option>)}</Select></Field>;
  return <Field label="Status RSVP" required><Select name="audienceValue" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Alege statusul</option><option value="NO_RESPONSE">Fără răspuns</option><option value="UNSURE">Nehotărât</option><option value="CONFIRMED">Confirmat</option><option value="DECLINED">Refuzat</option></Select></Field>;
}

function languageName(language: string) {
  return ({ ro: "Română", en: "Engleză", ru: "Rusă", fr: "Franceză", de: "Germană", it: "Italiană", es: "Spaniolă" } as Record<string, string>)[language.toLowerCase()] ?? language.toUpperCase();
}

function minimumScheduleDate() {
  const date = new Date(Date.now() + 5 * 60_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scheduledDateTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()))
    throw new Error("Alege o dată și o oră valide pentru programare.");
  if (date.getTime() < Date.now() + 5 * 60_000)
    throw new Error("Programarea trebuie să fie cu cel puțin 5 minute în viitor.");
  return date.toISOString();
}

async function loadInvitationCampaigns(workspaceId: string) {
  const items: CampaignResource[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await weddingOsApi.campaigns(workspaceId, cursor);
    for (const campaign of page.items) {
      if (seen.has(campaign.id)) continue;
      seen.add(campaign.id);
      items.push(campaign);
    }
    if (!page.nextCursor) return { items, truncated: false };
    if (page.nextCursor === cursor) return { items, truncated: true };
    cursor = page.nextCursor;
  }
  return { items, truncated: true };
}

async function loadCampaignDeliveries(
  workspaceId: string,
  campaignId: string,
) {
  const items: CampaignRecipientResource[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
    const page = await weddingOsApi.campaignRecipients(
      workspaceId,
      campaignId,
      cursor,
    );
    for (const delivery of page.items) {
      if (seen.has(delivery.id)) continue;
      seen.add(delivery.id);
      items.push(delivery);
    }
    if (!page.nextCursor) return { items, truncated: false };
    if (page.nextCursor === cursor) return { items, truncated: true };
    cursor = page.nextCursor;
  }
  return { items, truncated: true };
}

async function loadInvitationRecipients(workspaceId: string) {
  const items: InvitationRecipientResource[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const page = await weddingOsApi.invitationRecipients(workspaceId, cursor);
    for (const recipient of page.items) {
      if (seen.has(recipient.id)) continue;
      seen.add(recipient.id);
      items.push(recipient);
    }
    if (!page.nextCursor) return { items, truncated: false };
    cursor = page.nextCursor;
  }
  return { items, truncated: true };
}

const MAX_HOUSEHOLD_PAGES = 20;
const HOUSEHOLD_PAGE_SIZE = 50;
const RECIPIENT_CREATE_CHUNK_SIZE = 500;

async function loadInvitationHouseholds(workspaceId: string) {
  const items: HouseholdResource[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < MAX_HOUSEHOLD_PAGES; pageIndex += 1) {
    const page = await weddingOsApi.households(
      workspaceId,
      undefined,
      cursor,
    );
    for (const household of page.items) {
      if (seen.has(household.id)) continue;
      seen.add(household.id);
      items.push(household);
    }
    if (!page.nextCursor) return { items, truncated: false };
    if (page.nextCursor === cursor) return { items, truncated: true };
    cursor = page.nextCursor;
  }
  return { items, truncated: true };
}

async function recipientPreparationKey(
  invitationVersionId: string,
  variantId: string,
  chunkIndex: number,
  householdIds: string[],
) {
  const value = [invitationVersionId, variantId, ...householdIds].join(":");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const fingerprint = Array.from(new Uint8Array(digest).slice(0, 12), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `prepare-invitation-recipients:${chunkIndex}:${fingerprint}`;
}
