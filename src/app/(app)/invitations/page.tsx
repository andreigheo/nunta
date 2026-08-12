"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  MailPlus,
  Pencil,
  Plus,
  Send,
  UsersRound,
} from "lucide-react";
import type {
  CampaignResource,
  HouseholdResource,
  InvitationRecipientResource,
  InvitationSiteResource,
  InvitationVariantResource,
} from "@weddingos/contracts";
import {
  DistributionCenter,
  recipientName,
} from "@/components/invitations/distribution-center";
import { InvitationRenderer } from "@/components/invitations/invitation-renderer";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Table,
  TBody,
  TD,
  Textarea,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  applyInvitationVariant,
  snapshotFromPersisted,
} from "@/lib/invitations/editor-model";

const campaignStatus: Record<string, string> = {
  draft: "Ciornă",
  scheduled: "Programată",
  queued: "În coadă",
  sending: "În trimitere",
  completed: "Finalizată",
  partial: "Parțială",
  failed: "Eșuată",
  paused: "Pauză",
  cancelled: "Anulată",
  archived: "Arhivată",
};

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
  const [campaignToSend, setCampaignToSend] =
    React.useState<CampaignResource | null>(null);
  const [campaignAudience, setCampaignAudience] =
    React.useState<CampaignAudiencePreview | null>(null);
  const [audienceLoading, setAudienceLoading] = React.useState(false);
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
          ? weddingOsApi.campaigns(currentWorkspace.id)
          : Promise.resolve({ items: [], nextCursor: null }),
        canManageRecipients
          ? loadInvitationRecipients(currentWorkspace.id)
          : Promise.resolve({ items: [], truncated: false }),
      ]);
      const variantData = siteData
        ? await weddingOsApi.invitationVariants(currentWorkspace.id)
        : { items: [] };
      setSite(siteData);
      setCampaigns(campaignData.items);
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
      await weddingOsApi.createCampaign(currentWorkspace.id, {
        name: String(form.get("name")),
        purpose: "INVITATION",
        channel: "EMAIL",
        invitationVersionId: site?.published?.id ?? null,
        template: {
          subject: String(form.get("subject")),
          body: String(form.get("body")),
        },
        audienceFilter: {},
      });
      setCampaignOpen(false);
      toast({
        title: "Campanie creată",
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

  const reviewCampaignAudience = async (campaign: CampaignResource) => {
    if (!currentWorkspace || demoMode) return;
    setCampaignToSend(campaign);
    setCampaignAudience(null);
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
      const result = await weddingOsApi.transitionCampaign(
        currentWorkspace.id,
        campaignToSend.id,
        campaignToSend.version,
        "SEND_NOW",
        undefined,
        campaignAudience.audienceRevision,
      );
      setCampaignToSend(null);
      setCampaignAudience(null);
      toast({
        title: "Livrare pusă în coadă",
        description: result.job
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
    setBusyAction(`${recipient.id}:whatsapp`);
    try {
      const link = await personalLink(recipient, "WHATSAPP");
      const message = `Bună! Ai o invitație Sarbato: ${link.url}`;
      window.open(
        `https://wa.me/?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer",
      );
      toast({
        title: "WhatsApp deschis",
        description:
          "Mesajul este pregătit, dar îl verifici și îl trimiți tu din WhatsApp.",
        variant: "info",
      });
    } catch (caught) {
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
  const previewSnapshot = React.useMemo(
    () => {
      const persisted =
        previewRecipient && site?.published ? site.published : site?.draft;
      if (!persisted) return null;
      const base = snapshotFromPersisted(
        persisted.document.sections,
        persisted.settings as Parameters<typeof snapshotFromPersisted>[1],
      );
      if (!previewRecipient?.invitationVariantId) return base;
      const variant = variants.find(
        (item) => item.id === previewRecipient.invitationVariantId,
      );
      return variant
        ? applyInvitationVariant(
            base,
            (variant.published?.overrides ??
              variant.draft?.overrides) as Parameters<
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
              Studio invitație
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
              Previzualizare
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
          </>
        }
      />

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
                    <p className="text-[10px] font-semibold uppercase tracking-[.25em] text-faint">
                      Sarbato
                    </p>
                    <p className="mt-2 font-display text-2xl font-semibold text-brand-strong dark:text-brand">
                      {site.slug}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      Ciornă {site.draft?.versionNumber ?? "—"} ·{" "}
                      {site.defaultLanguage.toUpperCase()}
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
                  Alege varianta fiecărui destinatar, previzualizează fără tracking și
                  distribuie manual prin link, WhatsApp sau QR. Nicio acțiune de aici
                  nu declară mesajul trimis automat.
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
                onClick={() => setCampaignOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                Campanie nouă
              </Button>
            </CardHeader>
            {campaigns.length ? (
              <Table minWidth="760px">
                <THead>
                  <TR>
                    <TH>Campanie</TH>
                    <TH>Canal</TH>
                    <TH>Stare</TH>
                    <TH align="right">Destinatari</TH>
                    <TH align="right">E-mailuri deschise</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {campaigns.map((campaign) => (
                    <TR key={campaign.id}>
                      <TD className="font-medium">{campaign.name}</TD>
                      <TD>
                        <Badge variant="neutral">E-mail</Badge>
                      </TD>
                      <TD>
                        <Badge
                          variant={
                            campaign.status === "completed"
                              ? "success"
                              : campaign.status === "failed"
                                ? "danger"
                                : "info"
                          }
                          dot
                        >
                          {campaignStatus[campaign.status]}
                        </Badge>
                      </TD>
                      <TD align="right">{campaign.statistics.total}</TD>
                      <TD align="right">
                        {campaign.statistics.byStatus.opened ?? 0}
                      </TD>
                      <TD align="right">
                        {["draft", "failed", "partial"].includes(
                          campaign.status,
                        ) ? (
                          <Button
                            size="sm"
                            disabled={!canSendCampaign || saving}
                            onClick={() => void reviewCampaignAudience(campaign)}
                          >
                            <Send className="size-3" aria-hidden />
                            Trimite
                          </Button>
                        ) : null}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
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
        onClose={() => setCampaignOpen(false)}
        title="Campanie e-mail"
      >
        <form className="space-y-4" onSubmit={createCampaign}>
          <Field label="Nume" required>
            <Input name="name" required />
          </Field>
          <Field label="Subiect" required>
            <Input name="subject" required />
          </Field>
          <Field label="Mesaj" required>
            <Textarea name="body" required />
          </Field>
          <p className="text-xs text-faint">
            Destinatarii sunt fixați la trimitere; retry-ul nu retrimite persoanelor
            deja livrate.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setCampaignOpen(false)}
            >
              Renunță
            </Button>
            <Button type="submit" loading={saving} disabled={saving}>
              Salvează ciorna
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(campaignToSend)}
        onClose={() => {
          if (saving) return;
          setCampaignToSend(null);
          setCampaignAudience(null);
        }}
        title="Confirmă trimiterea"
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
                saving || audienceLoading || !campaignAudience?.valid
              }
              onClick={() => void sendCampaign()}
            >
              <Send className="size-4" aria-hidden />
              {campaignAudience
                ? `Trimite către ${campaignAudience.valid} ${campaignAudience.valid === 1 ? "destinatar" : "destinatari"}`
                : "Verifică audiența"}
            </Button>
          </div>
        </div>
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
            : "Previzualizare ciornă"
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
