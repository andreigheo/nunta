"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  Copy,
  Eye,
  Link2,
  MessageCircle,
  QrCode,
  Search,
  UsersRound,
} from "lucide-react";
import type {
  InvitationRecipientResource,
  InvitationVariantResource,
} from "@weddingos/contracts";
import { Button, Input, Select } from "@/components/ui";

type RecipientFilter = "all" | "not_opened" | "opened" | "rsvp";

export function DistributionCenter({
  recipients,
  variants,
  busyAction,
  canManage,
  onAssignVariant,
  onCopyLink,
  onPreview,
  onOpenWhatsApp,
  onDownloadQr,
}: {
  recipients: InvitationRecipientResource[];
  variants: InvitationVariantResource[];
  busyAction: string;
  canManage: boolean;
  onAssignVariant: (
    recipient: InvitationRecipientResource,
    variantId: string | null,
  ) => void;
  onCopyLink: (recipient: InvitationRecipientResource) => void;
  onPreview: (recipient: InvitationRecipientResource) => void;
  onOpenWhatsApp: (recipient: InvitationRecipientResource) => void;
  onDownloadQr: (recipient: InvitationRecipientResource) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<RecipientFilter>("all");
  const [variantFilter, setVariantFilter] = React.useState("all");
  const activeVariants = variants.filter(
    (variant) => variant.status === "active" && Boolean(variant.published),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("ro-RO");
  const filtered = recipients.filter((recipient) => {
    const name = recipientName(recipient).toLocaleLowerCase("ro-RO");
    if (normalizedSearch && !name.includes(normalizedSearch)) return false;
    if (
      variantFilter !== "all" &&
      (variantFilter === "base"
        ? recipient.invitationVariantId !== null
        : recipient.invitationVariantId !== variantFilter)
    )
      return false;
    if (filter === "not_opened") return !recipient.openedAt;
    if (filter === "opened") return Boolean(recipient.openedAt);
    if (filter === "rsvp") return Boolean(recipient.rsvpCompletedAt);
    return true;
  });

  return (
    <div>
      <div className="grid gap-3 border-b border-line p-4 lg:grid-cols-[minmax(14rem,1fr)_12rem_13rem] lg:p-5">
        <label className="relative block">
          <span className="sr-only">Caută destinatar</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
            aria-hidden
          />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Caută familie sau invitat"
          />
        </label>
        <Select
          value={filter}
          onChange={(event) => setFilter(event.target.value as RecipientFilter)}
          aria-label="Filtrează după activitate"
        >
          <option value="all">Toate activitățile</option>
          <option value="not_opened">Invitație nedeschisă</option>
          <option value="opened">Invitație deschisă</option>
          <option value="rsvp">RSVP completat</option>
        </Select>
        <Select
          value={variantFilter}
          onChange={(event) => setVariantFilter(event.target.value)}
          aria-label="Filtrează după variantă"
        >
          <option value="all">Toate variantele</option>
          <option value="base">Invitația de bază</option>
          {activeVariants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.name}
            </option>
          ))}
        </Select>
      </div>

      {filtered.length ? (
        <ul className="divide-y divide-line">
          {filtered.map((recipient) => {
            const name = recipientName(recipient);
            const busyPrefix = `${recipient.id}:`;
            const rowBusy = busyAction.startsWith(busyPrefix);
            return (
              <li key={recipient.id} className="p-4 lg:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(13rem,1fr)_minmax(12rem,.8fr)_minmax(17rem,1.15fr)] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-softer text-brand-strong">
                        <UsersRound className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          {name}
                        </p>
                        <p className="mt-0.5 text-xs text-faint">
                          {recipient.householdId ? "Gospodărie" : "Invitat individual"} · {languageName(recipient.preferredLanguage)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
                      Variantă livrată
                    </p>
                    <Select
                      value={recipient.invitationVariantId ?? "base"}
                      disabled={!canManage || rowBusy}
                      onChange={(event) =>
                        onAssignVariant(
                          recipient,
                          event.target.value === "base"
                            ? null
                            : event.target.value,
                        )
                      }
                      aria-label={`Varianta pentru ${name}`}
                    >
                      <option value="base">Invitația de bază</option>
                      {activeVariants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                      Parcurs real
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      <JourneyStep
                        complete={Boolean(recipient.lastAccessedAt)}
                        label="Link accesat"
                        at={recipient.lastAccessedAt}
                      />
                      <JourneyStep
                        complete={Boolean(recipient.openedAt)}
                        label="Invitație deschisă"
                        at={recipient.openedAt}
                      />
                      <JourneyStep
                        complete={Boolean(recipient.rsvpCompletedAt)}
                        label="RSVP"
                        at={recipient.rsvpCompletedAt}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:flex xl:col-span-3 xl:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canManage || rowBusy}
                      loading={busyAction === `${recipient.id}:copy`}
                      onClick={() => onCopyLink(recipient)}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      Copiază linkul
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => onPreview(recipient)}
                    >
                      <Eye className="size-3.5" aria-hidden />
                      Previzualizează
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canManage || rowBusy}
                      loading={busyAction === `${recipient.id}:whatsapp`}
                      onClick={() => onOpenWhatsApp(recipient)}
                    >
                      <MessageCircle className="size-3.5" aria-hidden />
                      WhatsApp manual
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!canManage || rowBusy}
                      loading={busyAction === `${recipient.id}:qr`}
                      onClick={() => onDownloadQr(recipient)}
                    >
                      <QrCode className="size-3.5" aria-hidden />
                      Descarcă QR
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="grid min-h-44 place-items-center p-6 text-center">
          <div>
            <Link2 className="mx-auto size-6 text-faint" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-ink">
              Niciun destinatar în filtrul curent
            </p>
            <p className="mt-1 text-xs text-muted">
              Schimbă filtrele sau pregătește destinatarii după publicare.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function JourneyStep({
  complete,
  label,
  at,
}: {
  complete: boolean;
  label: string;
  at: string | null;
}) {
  return (
    <div
      className={
        complete
          ? "rounded-lg bg-success-soft px-2 py-2 text-success"
          : "rounded-lg bg-subtle px-2 py-2 text-faint"
      }
    >
      <p className="flex items-center gap-1 text-xs font-semibold leading-tight">
        {complete ? (
          <CheckCircle2 className="size-3 shrink-0" aria-hidden />
        ) : (
          <Circle className="size-3 shrink-0" aria-hidden />
        )}
        {label}
      </p>
      <p className="mt-1 text-xs tabular-nums">
        {at ? shortDate(at) : "În așteptare"}
      </p>
    </div>
  );
}

export function recipientName(recipient: InvitationRecipientResource) {
  const value = recipient as InvitationRecipientResource & {
    householdName?: unknown;
    guestName?: unknown;
  };
  if (typeof value.householdName === "string" && value.householdName.trim())
    return value.householdName.trim();
  if (typeof value.guestName === "string" && value.guestName.trim())
    return value.guestName.trim();
  return recipient.householdId
    ? `Gospodărie ${recipient.householdId.slice(0, 6)}`
    : `Invitat ${recipient.guestId?.slice(0, 6) ?? recipient.id.slice(0, 6)}`;
}

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Înregistrat";
  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "short",
  });
}

function languageName(value: string) {
  return (
    {
      ro: "RO",
      en: "EN",
      ru: "RU",
      fr: "FR",
      de: "DE",
      it: "IT",
      es: "ES",
    } as Record<string, string>
  )[value.toLowerCase()] ?? value.toUpperCase();
}
