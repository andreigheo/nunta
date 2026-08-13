"use client";

import * as React from "react";
import {
  Archive,
  Check,
  GitCompareArrows,
  History,
  Plus,
  RefreshCw,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import type {
  InvitationSyncPath,
  InvitationSyncPreviewResource,
  InvitationVariantResource,
  InvitationVersionHistoryItemResource,
} from "@weddingos/contracts";
import { Badge, Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";

const pathLabels: Record<InvitationSyncPath, string> = {
  "hero.names": "Numele afișate",
  "hero.date": "Data evenimentului",
  "hero.venue": "Locul principal",
  "schedule.items": "Programul zilei",
  "locations.items": "Locațiile",
  "rsvp.deadline": "Termenul RSVP",
  "accommodation.items": "Recomandările de cazare",
};

const sourceLabels: Record<string, string> = {
  wedding_profile: "Profilul evenimentului",
  wedding_events: "Calendarul evenimentului",
  rsvp_form: "Formularul RSVP",
  accommodation_recommendations: "Cazările publicate",
};

export function EditorWorkflowPanel({
  variants,
  activeVariantId,
  versions,
  syncPreview,
  busy,
  onSelectVariant,
  onCreateVariant,
  onArchiveVariant,
  onRestoreVersion,
  onRefreshSync,
  onApplySync,
}: {
  variants: InvitationVariantResource[];
  activeVariantId: string | null;
  versions: InvitationVersionHistoryItemResource[];
  syncPreview: InvitationSyncPreviewResource | null;
  busy: boolean;
  onSelectVariant: (variantId: string | null) => void;
  onCreateVariant: () => void;
  onArchiveVariant: (variant: InvitationVariantResource) => void;
  onRestoreVersion: (version: InvitationVersionHistoryItemResource) => void;
  onRefreshSync: () => void;
  onApplySync: (paths: InvitationSyncPath[]) => void;
}) {
  const activeVariant =
    variants.find((variant) => variant.id === activeVariantId) ?? null;
  const [selectedPaths, setSelectedPaths] = React.useState<
    InvitationSyncPath[]
  >([]);
  const availablePaths = new Set(
    syncPreview?.differences.map((difference) => difference.path) ?? [],
  );
  const effectiveSelectedPaths = selectedPaths.filter((path) =>
    availablePaths.has(path),
  );

  return (
    <div className="space-y-6 p-4">
      <section>
        <div className="flex items-center gap-2">
          <UsersRound className="size-4 text-brand" aria-hidden />
          <h3 className="text-sm font-semibold text-ink">
            Personalizări pentru grupuri
          </h3>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Invitația principală rămâne neschimbată. Aici poți adapta anumite
          texte pentru familie, prieteni sau alte grupuri.
        </p>
        <div className="mt-3 flex gap-2">
          <Select
            value={activeVariantId ?? "base"}
            onChange={(event) =>
              onSelectVariant(
                event.target.value === "base" ? null : event.target.value,
              )
            }
            aria-label="Varianta editată"
          >
            <option value="base">Invitația principală</option>
            {variants
              .filter((variant) => variant.status === "active")
              .map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.name} · {variant.assignedRecipients} destinatari
                </option>
              ))}
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onCreateVariant}
            aria-label="Creează o variantă"
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </div>
        {activeVariant ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-brand-softer px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-brand-strong">
                Editezi: {activeVariant.name}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {activeVariant.assignedRecipients
                  ? `Mută cei ${activeVariant.assignedRecipients} destinatari înainte de arhivare.`
                  : "Baza continuă să se actualizeze; aici se păstrează doar suprascrierile."}
              </p>
            </div>
            <button
              className="grid size-11 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onArchiveVariant(activeVariant)}
              disabled={activeVariant.assignedRecipients > 0}
              aria-label={`Arhivează varianta ${activeVariant.name}`}
              title={
                activeVariant.assignedRecipients
                  ? "Mută destinatarii înainte de arhivare"
                  : "Arhivează varianta"
              }
            >
              <Archive className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}
      </section>

      <section className="border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <GitCompareArrows className="size-4 text-brand" aria-hidden />
              Actualizează din eveniment
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Verifică dacă programul, locațiile sau termenul RSVP s-au schimbat
              și alege ce vrei să actualizezi în invitație.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRefreshSync}
            loading={busy}
            aria-label="Verifică diferențele din dashboard"
          >
            <RefreshCw className="size-4" aria-hidden />
          </Button>
        </div>
        {!syncPreview ? (
          <button
            className="mt-3 min-h-11 w-full rounded-lg border border-line px-3 text-xs font-semibold text-brand hover:bg-brand-softer"
            onClick={onRefreshSync}
          >
            Verifică datele evenimentului
          </button>
        ) : syncPreview.differences.length ? (
          <div className="mt-3 space-y-2">
            {syncPreview.differences.map((difference) => {
              const selected = effectiveSelectedPaths.includes(difference.path);
              return (
                <button
                  key={difference.path}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left",
                    selected
                      ? "border-brand bg-brand-softer"
                      : "border-line hover:border-line-strong",
                  )}
                  onClick={() =>
                    setSelectedPaths((current) =>
                      current.includes(difference.path)
                        ? current.filter((path) => path !== difference.path)
                        : [...current, difference.path],
                    )
                  }
                  aria-pressed={selected}
                >
                  <span className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                        selected
                          ? "border-brand bg-brand text-on-brand"
                          : "border-line-strong bg-surface",
                      )}
                    >
                      {selected ? (
                        <Check className="size-3" aria-hidden />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-ink">
                        {pathLabels[difference.path]}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {sourceLabels[difference.source] ?? difference.source}
                      </span>
                      <span className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                        <span className="whitespace-normal break-words rounded-md bg-surface px-2 py-1.5 leading-relaxed text-faint">
                          Acum: {compactValue(difference.currentValue)}
                        </span>
                        <span className="whitespace-normal break-words rounded-md bg-success-soft px-2 py-1.5 leading-relaxed text-success">
                          Sursă: {compactValue(difference.sourceValue)}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
            <Button
              className="w-full"
              disabled={!effectiveSelectedPaths.length || busy}
              loading={busy}
              onClick={() => onApplySync(effectiveSelectedPaths)}
            >
              Aplică {effectiveSelectedPaths.length || ""} în ciornă
            </Button>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
            <Check className="size-4" aria-hidden />
            Ciorna folosește deja datele curente ale evenimentului.
          </p>
        )}
      </section>

      <section className="border-t border-line pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <History className="size-4 text-brand" aria-hidden />
            Versiuni anterioare
          </h3>
          <Badge variant="neutral">{versions.length}</Badge>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Restaurarea creează o ciornă nouă. Nicio versiune din istoric nu este
          rescrisă.
        </p>
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {versions.slice(0, 8).map((version) => (
            <li
              key={version.id}
              className="flex min-h-14 items-center justify-between gap-3 py-2"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold text-ink">
                  Versiunea {version.versionNumber}
                  {version.isCurrentDraft ? (
                    <Badge variant="info">Ciorna curentă</Badge>
                  ) : version.isPublished ? (
                    <Badge variant="success">Publicată</Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-faint">
                  {new Date(version.createdAt).toLocaleString("ro-RO", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {!version.isCurrentDraft ? (
                <button
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-brand hover:bg-brand-softer"
                  onClick={() => onRestoreVersion(version)}
                  aria-label={`Restaurează versiunea ${version.versionNumber}`}
                >
                  <RotateCcw className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function compactValue(value: unknown) {
  if (typeof value === "string") return value || "—";
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (!value.length) return "listă goală";
    const visible = value.slice(0, 3).map((item) => compactItem(item));
    const remaining = value.length - visible.length;
    return `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`;
  }
  if (typeof value === "object") return compactItem(value);
  return String(value);
}

function compactItem(value: unknown) {
  if (!value || typeof value !== "object") return String(value ?? "—");
  const item = value as Record<string, unknown>;
  const time = stringValue(item.time);
  const title =
    stringValue(item.title) ||
    stringValue(item.name) ||
    stringValue(item.label) ||
    stringValue(item.question);
  const detail =
    stringValue(item.address) ||
    stringValue(item.detail) ||
    stringValue(item.body);
  const summary = [time, title, detail].filter(Boolean).join(" — ");
  if (summary) return summary;
  const values = Object.values(item)
    .filter(
      (entry): entry is string | number =>
        typeof entry === "string" || typeof entry === "number",
    )
    .slice(0, 3);
  return values.length ? values.join(" — ") : "detalii actualizate";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
