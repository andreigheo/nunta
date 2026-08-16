"use client";

import { Eye, Pencil, Send, XCircle } from "lucide-react";
import type { CampaignResource } from "@weddingos/contracts";
import {
  Badge,
  Button,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui";

const statusLabels: Record<string, string> = {
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

const purposeLabels: Record<string, string> = {
  invitation: "Invitație",
  rsvp_reminder: "Reminder RSVP",
  information_update: "Actualizare importantă",
  thank_you: "Mulțumire",
  custom: "Mesaj personalizat",
};

export function CampaignList({
  campaigns,
  saving,
  canCreate,
  canSend,
  canViewDelivery,
  onEdit,
  onSend,
  onCancel,
  onDetails,
}: {
  campaigns: CampaignResource[];
  saving: boolean;
  canCreate: boolean;
  canSend: boolean;
  canViewDelivery: boolean;
  onEdit: (campaign: CampaignResource) => void;
  onSend: (campaign: CampaignResource) => void;
  onCancel: (campaign: CampaignResource) => void;
  onDetails: (campaign: CampaignResource) => void;
}) {
  return (
    <>
      <ul className="divide-y divide-line lg:hidden">
        {campaigns.map((campaign) => (
          <li key={campaign.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-ink">
                  {campaign.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {purposeLabels[campaign.purpose] ?? "Mesaj"} · E-mail
                </p>
              </div>
              <CampaignStatus campaign={campaign} />
            </div>
            <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
              {campaignAudienceSummary(campaign.audienceFilter)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Destinatari" value={campaign.statistics.total} />
              <Metric
                label="E-mailuri deschise"
                value={campaign.statistics.byStatus.opened ?? 0}
              />
            </div>
            <CampaignActions
              campaign={campaign}
              saving={saving}
              canCreate={canCreate}
              canSend={canSend}
              canViewDelivery={canViewDelivery}
              onEdit={onEdit}
              onSend={onSend}
              onCancel={onCancel}
              onDetails={onDetails}
            />
          </li>
        ))}
      </ul>

      <div className="hidden lg:block">
        <Table minWidth="820px">
          <THead>
            <TR>
              <TH>Campanie</TH>
              <TH>Scop</TH>
              <TH>Stare</TH>
              <TH align="right">Destinatari</TH>
              <TH align="right">Deschise</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {campaigns.map((campaign) => (
              <TR key={campaign.id}>
                <TD>
                  <p className="font-medium text-ink">{campaign.name}</p>
                  <p className="mt-0.5 max-w-64 truncate text-xs text-muted">
                    {campaignAudienceSummary(campaign.audienceFilter)}
                  </p>
                </TD>
                <TD className="text-muted">
                  {purposeLabels[campaign.purpose] ?? "Mesaj"}
                  <span className="mt-0.5 block text-xs text-faint">E-mail</span>
                </TD>
                <TD>
                  <CampaignStatus campaign={campaign} />
                </TD>
                <TD align="right">{campaign.statistics.total}</TD>
                <TD align="right">
                  {campaign.statistics.byStatus.opened ?? 0}
                </TD>
                <TD align="right">
                  <CampaignActions
                    campaign={campaign}
                    saving={saving}
                    canCreate={canCreate}
                    canSend={canSend}
                    canViewDelivery={canViewDelivery}
                    onEdit={onEdit}
                    onSend={onSend}
                    onCancel={onCancel}
                    onDetails={onDetails}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </>
  );
}

function CampaignStatus({ campaign }: { campaign: CampaignResource }) {
  return (
    <div className="shrink-0">
      <Badge
        variant={
          campaign.status === "completed"
            ? "success"
            : campaign.status === "failed"
              ? "danger"
              : campaign.status === "cancelled"
                ? "neutral"
                : "info"
        }
        dot
      >
        {statusLabels[campaign.status] ?? campaign.status}
      </Badge>
      {campaign.scheduledAt ? (
        <p className="mt-1 text-right text-xs text-muted">
          {new Date(campaign.scheduledAt).toLocaleString("ro-RO")}
        </p>
      ) : null}
    </div>
  );
}

function CampaignActions({
  campaign,
  saving,
  canCreate,
  canSend,
  canViewDelivery,
  onEdit,
  onSend,
  onCancel,
  onDetails,
}: {
  campaign: CampaignResource;
  saving: boolean;
  canCreate: boolean;
  canSend: boolean;
  canViewDelivery: boolean;
  onEdit: (campaign: CampaignResource) => void;
  onSend: (campaign: CampaignResource) => void;
  onCancel: (campaign: CampaignResource) => void;
  onDetails: (campaign: CampaignResource) => void;
}) {
  const canQueue = ["draft", "failed", "partial"].includes(campaign.status);
  const canCancel = ["scheduled", "queued", "sending"].includes(
    campaign.status,
  );
  return (
    <div className="flex flex-wrap justify-end gap-1.5 max-md:grid max-md:grid-cols-2">
      {canViewDelivery && campaign.statistics.total > 0 ? (
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => onDetails(campaign)}
        >
          <Eye className="size-3.5" aria-hidden />
          Detalii livrare
        </Button>
      ) : null}
      {campaign.status === "draft" && canCreate ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => onEdit(campaign)}
        >
          <Pencil className="size-3.5" aria-hidden />
          Editează
        </Button>
      ) : null}
      {canQueue ? (
        <Button
          size="sm"
          disabled={!canSend || saving}
          onClick={() => onSend(campaign)}
        >
          <Send className="size-3.5" aria-hidden />
          {campaign.status === "draft" ? "Trimite" : "Retrimite"}
        </Button>
      ) : null}
      {canCancel && canSend ? (
        <Button
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => onCancel(campaign)}
        >
          <XCircle className="size-3.5" aria-hidden />
          Anulează
        </Button>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-subtle px-3 py-2">
      <p className="text-lg font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function campaignAudienceSummary(value: Record<string, unknown>) {
  if (Array.isArray(value.tagIds) && value.tagIds.length)
    return "Segment: etichetă";
  if (Array.isArray(value.sides) && value.sides.length)
    return `Parte: ${sideLabel(String(value.sides[0]))}`;
  if (Array.isArray(value.countries) && value.countries.length)
    return `Țară: ${String(value.countries[0])}`;
  if (
    Array.isArray(value.preferredLanguages) &&
    value.preferredLanguages.length
  )
    return `Limbă: ${languageName(String(value.preferredLanguages[0]))}`;
  if (Array.isArray(value.rsvpStatuses) && value.rsvpStatuses.length)
    return `RSVP: ${rsvpLabel(String(value.rsvpStatuses[0]))}`;
  return "Toți destinatarii eligibili";
}

function sideLabel(value: string) {
  return (
    {
      PARTNER_ONE: "partenerul 1",
      PARTNER_TWO: "partenerul 2",
      COMMON: "comună",
      VENDOR: "furnizori",
      OTHER: "altele",
    } as Record<string, string>
  )[value] ?? value.toLocaleLowerCase("ro-RO").replaceAll("_", " ");
}

function rsvpLabel(value: string) {
  return (
    {
      NO_RESPONSE: "fără răspuns",
      UNSURE: "nehotărât",
      CONFIRMED: "confirmat",
      DECLINED: "refuzat",
    } as Record<string, string>
  )[value] ?? value.toLocaleLowerCase("ro-RO").replaceAll("_", " ");
}

function languageName(language: string) {
  return (
    {
      ro: "Română",
      en: "Engleză",
      ru: "Rusă",
      fr: "Franceză",
      de: "Germană",
      it: "Italiană",
      es: "Spaniolă",
    } as Record<string, string>
  )[language.toLowerCase()] ?? language.toUpperCase();
}
