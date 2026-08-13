"use client";

import * as React from "react";
import {
  Aperture,
  Columns2,
  Eye,
  Gauge,
  ImagePlus,
  MailOpen,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui";
import type { InvitationExperienceSettings } from "@/lib/invitations/editor-model";
import { readableTextColor } from "./invitation-experience";

export function InvitationExperiencePanel({
  experience,
  onChange,
  uploading,
  onUploadCover,
  coverPreviewUrl,
}: {
  experience: InvitationExperienceSettings;
  onChange: (update: Partial<InvitationExperienceSettings>) => void;
  uploading: boolean;
  onUploadCover: (file: File) => void;
  coverPreviewUrl?: string;
}) {
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const panelInk = readableTextColor(experience.panelColor);
  const safeCoverPreviewUrl = safePreviewUrl(
    coverPreviewUrl || experience.coverImageUrl,
  );
  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="text-sm font-semibold text-ink">
          Cum se deschide invitația
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Alege ce vede invitatul înainte să apară invitația. Animația rulează o
          dată pentru fiecare versiune publicată și poate fi revăzută.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-ink">
          Alege animația de început
        </legend>
        <ExperienceStyleButton
          active={!experience.enabled}
          icon={<Eye className="size-4" aria-hidden />}
          title="Direct în invitație"
          description="Invitatul vede imediat conținutul, fără introducere"
          onClick={() => onChange({ enabled: false })}
        />
        <div className="grid grid-cols-2 gap-2">
          <ExperienceStyleButton
            active={experience.enabled && experience.style === "split_panels"}
            icon={<Columns2 className="size-4" aria-hidden />}
            title="Două panouri"
            description="Se deschid lateral"
            onClick={() => onChange({ enabled: true, style: "split_panels" })}
          />
          <ExperienceStyleButton
            active={experience.enabled && experience.style === "envelope"}
            icon={<MailOpen className="size-4" aria-hidden />}
            title="Plic animat"
            description="Plicul se deschide și apare invitația"
            onClick={() => onChange({ enabled: true, style: "envelope" })}
          />
        </div>
      </fieldset>

      {experience.enabled ? (
        <>
          <div
            className="relative isolate h-44 overflow-hidden rounded-xl bg-subtle"
            style={{
              backgroundColor: experience.backgroundColor,
            }}
            aria-label="Previzualizarea animației de început"
          >
            {experience.style === "split_panels" ? (
              <>
                <div className="absolute inset-3 rounded-lg bg-white/85" />
                <div
                  className="absolute inset-y-0 left-0 w-1/2 origin-left border-r border-white/20"
                  style={{
                    backgroundColor: experience.panelColor,
                    backgroundImage: textureBackground(experience.texture),
                  }}
                />
                <div
                  className="absolute inset-y-0 right-0 w-1/2 origin-right border-l border-black/10"
                  style={{
                    backgroundColor: experience.panelColor,
                    backgroundImage: textureBackground(experience.texture),
                  }}
                />
              </>
            ) : (
              <div className="absolute inset-0 grid place-items-center">
                <div
                  className="relative h-24 w-40 overflow-hidden rounded-lg shadow-md"
                  style={{ backgroundColor: experience.panelColor }}
                >
                  <div
                    className="absolute inset-x-0 top-0 z-20 h-16 origin-top"
                    style={{
                      backgroundColor: experience.panelColor,
                      clipPath: "polygon(0 0, 100% 0, 50% 88%)",
                      filter: "brightness(.78)",
                    }}
                  />
                  <div
                    className="absolute inset-x-3 top-2 h-20 rounded bg-white/90"
                    style={{
                      backgroundImage: safeCoverPreviewUrl
                        ? `linear-gradient(rgb(255 255 255 / 72%), rgb(255 255 255 / 72%)), url(${JSON.stringify(safeCoverPreviewUrl)})`
                        : undefined,
                      backgroundSize: "cover",
                    }}
                  />
                  <div
                    className="absolute inset-0 z-30"
                    style={{
                      backgroundColor: experience.panelColor,
                      clipPath:
                        "polygon(0 42%, 50% 78%, 100% 42%, 100% 100%, 0 100%)",
                      filter: "brightness(.92)",
                    }}
                  />
                  <span
                    className="absolute left-1/2 top-[58%] z-40 grid size-8 -translate-x-1/2 place-items-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: experience.accentColor,
                      color: readableTextColor(experience.accentColor),
                    }}
                    title={experience.monogram || "S"}
                  >
                    <span className="max-w-full break-all px-0.5 text-[9px] leading-none">
                      {experience.monogram || "S"}
                    </span>
                  </span>
                </div>
              </div>
            )}
            <div className="absolute inset-0 grid place-items-center text-center">
              <div
                className={
                  experience.style === "envelope" ? "sr-only" : undefined
                }
              >
                {safeCoverPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="mx-auto size-16 rounded-lg border-2 border-white/30 object-cover shadow-sm"
                    src={safeCoverPreviewUrl}
                    alt=""
                  />
                ) : null}
                <span
                  className={`${safeCoverPreviewUrl ? "-mt-4 size-9 text-xs" : "size-14 text-lg"} mx-auto grid place-items-center rounded-full border bg-white/10 font-display font-semibold`}
                  style={{
                    borderColor: experience.accentColor,
                    color: experience.accentColor,
                  }}
                >
                  {experience.monogram || "S"}
                </span>
                <p
                  className="mt-3 max-w-52 px-4 text-xs font-medium"
                  style={{ color: panelInk }}
                >
                  {experience.frontMessage || "Deschide invitația"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="outline"
              size="sm"
              loading={uploading}
              disabled={uploading}
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus className="size-4" aria-hidden />
              {experience.coverImageUrl || experience.coverMediaId
                ? "Înlocuiește coperta"
                : "Adaugă copertă"}
            </Button>
            {experience.coverImageUrl || experience.coverMediaId ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() =>
                  onChange({ coverImageUrl: null, coverMediaId: null })
                }
                aria-label="Elimină imaginea de copertă"
              >
                <Trash2 className="size-4 text-danger" aria-hidden />
              </Button>
            ) : null}
            <input
              ref={coverInputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadCover(file);
                event.currentTarget.value = "";
              }}
            />
          </div>
          <Field label="Link extern pentru copertă (opțional)">
            <Input
              type="url"
              value={experience.coverImageUrl ?? ""}
              placeholder="https://…"
              onChange={(event) =>
                onChange({
                  coverImageUrl: event.target.value || null,
                  ...(event.target.value ? { coverMediaId: null } : {}),
                })
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <ExperienceColor
              label="Panouri"
              value={experience.panelColor}
              onChange={(panelColor) => onChange({ panelColor })}
            />
            <ExperienceColor
              label="Sigiliu"
              value={experience.accentColor}
              onChange={(accentColor) => onChange({ accentColor })}
            />
          </div>
          <ExperienceColor
            label="Fundalul revelației"
            value={experience.backgroundColor}
            onChange={(backgroundColor) => onChange({ backgroundColor })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Monogramă">
              <Input
                value={experience.monogram ?? ""}
                maxLength={12}
                placeholder="A & M"
                onChange={(event) =>
                  onChange({ monogram: event.target.value || null })
                }
              />
            </Field>
            <Field label="Text frontal">
              <Input
                value={experience.frontMessage ?? ""}
                maxLength={160}
                placeholder="O invitație pentru voi"
                onChange={(event) =>
                  onChange({ frontMessage: event.target.value || null })
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Textură">
              <Select
                value={experience.texture}
                onChange={(event) =>
                  onChange({
                    texture: event.target
                      .value as InvitationExperienceSettings["texture"],
                  })
                }
              >
                <option value="paper">Hârtie fină</option>
                <option value="linen">In texturat</option>
                <option value="smooth">Neted</option>
              </Select>
            </Field>
            <Field
              label={`Durată ${(experience.durationMs / 1000).toFixed(1)}s`}
            >
              <input
                className="min-h-11 w-full accent-[var(--brand)]"
                type="range"
                min="900"
                max="3000"
                step="100"
                value={experience.durationMs}
                onChange={(event) =>
                  onChange({ durationMs: Number(event.target.value) })
                }
              />
            </Field>
          </div>

          <div className="space-y-2 rounded-xl bg-subtle/70 p-3 text-xs text-muted">
            <p className="flex gap-2">
              <Eye
                className="mt-0.5 size-3.5 shrink-0 text-brand"
                aria-hidden
              />
              Animația rulează la prima deschidere. La revenirile următoare,
              invitatul intră direct și o poate revedea dacă dorește.
            </p>
            <p className="flex gap-2">
              <Gauge
                className="mt-0.5 size-3.5 shrink-0 text-success"
                aria-hidden
              />
              Pentru reduced motion, conținutul apare imediat, fără tranziții
              care blochează accesul.
            </p>
            <p className="flex gap-2">
              <Sparkles
                className="mt-0.5 size-3.5 shrink-0 text-accent"
                aria-hidden
              />
              Mișcarea folosește doar transformări accelerate și nu pornește
              audio.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-subtle/70 p-4">
          <p className="text-sm font-semibold text-ink">
            Invitația se deschide direct
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Invitatul ajunge imediat la copertă și la conținut. Poți reveni
            oricând aici dacă vrei să adaugi un plic sau două panouri.
          </p>
        </div>
      )}
    </div>
  );
}

function textureBackground(texture: InvitationExperienceSettings["texture"]) {
  if (texture === "smooth") return "none";
  if (texture === "linen")
    return "linear-gradient(90deg, rgb(255 255 255 / 5%), transparent 24%, rgb(0 0 0 / 4%) 49%, transparent 72%, rgb(255 255 255 / 4%))";
  return "radial-gradient(circle at 18% 22%, rgb(255 255 255 / 10%), transparent 32%), linear-gradient(118deg, transparent 35%, rgb(255 255 255 / 6%) 49%, transparent 64%)";
}

function ExperienceStyleButton({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-20 rounded-xl p-3 text-left outline-none transition-[background-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
        active
          ? "bg-brand text-on-brand shadow-sm"
          : "bg-subtle text-ink hover:bg-brand-softer"
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </span>
      <span
        className={`mt-1 block text-xs ${active ? "text-white/75" : "text-muted"}`}
      >
        {description}
      </span>
    </button>
  );
}

function safePreviewUrl(value: string | null) {
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ||
      url.protocol === "http:" ||
      url.protocol === "blob:"
      ? value
      : "";
  } catch {
    return "";
  }
}

function ExperienceColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-2">
        <label
          className="relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-md border border-line"
          style={{ backgroundColor: value }}
        >
          <input
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#3B183F"}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
          />
        </label>
        <input
          key={value}
          className="min-h-11 min-w-0 flex-1 bg-transparent font-mono text-xs uppercase text-ink outline-none"
          defaultValue={value.toUpperCase()}
          pattern="#[0-9A-Fa-f]{6}"
          title="Folosește formatul #RRGGBB, de exemplu #3B183F"
          onBlur={(event) => {
            const candidate = event.currentTarget.value.trim();
            if (/^#[0-9a-f]{6}$/i.test(candidate)) {
              const normalized = candidate.toUpperCase();
              event.currentTarget.value = normalized;
              onChange(normalized);
            } else {
              event.currentTarget.value = value.toUpperCase();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = value.toUpperCase();
              event.currentTarget.blur();
            }
          }}
          aria-label={`${label} în format HEX`}
        />
        <Aperture className="size-3.5 text-faint" aria-hidden />
      </div>
    </Field>
  );
}
