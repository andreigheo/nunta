"use client";

import * as React from "react";
import {
  CheckSquare2,
  ChevronsDown,
  ChevronsUp,
  Circle,
  Eye,
  EyeOff,
  ImagePlus,
  Layers3,
  Lock,
  Group,
  Square,
  Trash2,
  Type,
  Ungroup,
  Unlock,
} from "lucide-react";
import { Button, Field, Input, Switch } from "@/components/ui";
import type {
  InvitationArtDirection,
  InvitationDecorationLayer,
  InvitationDevice,
  InvitationSection,
} from "@/lib/invitations/editor-model";
import {
  invitationTextHasOverride,
  resolveInvitationTextStyle,
  updateInvitationTextStyle,
} from "@/lib/invitations/editor-elements";
import {
  invitationContentValue,
  invitationEditableFields,
} from "@/lib/invitations/editor-content";
import { cn } from "@/lib/utils";

const devices: Array<{ value: InvitationDevice; label: string }> = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tabletă" },
  { value: "mobile", label: "Mobil" },
];

export function EditorLayerStudio({
  section,
  device,
  selectedContentKey,
  onSelectContentKey,
  uploading,
  onUpdateContent,
  onUploadImage,
}: {
  section: InvitationSection;
  device: InvitationDevice;
  selectedContentKey: string | null;
  onSelectContentKey: (key: string | null) => void;
  uploading: boolean;
  onUpdateContent: (key: string, value: unknown) => void;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
}) {
  const layers = decorationLayers(section.content.decorations);
  const textLayers = invitationEditableFields(section).filter(
    (field) =>
      String(invitationContentValue(section.content, field.path) ?? "").trim(),
  );
  const [selectedTextKeys, setSelectedTextKeys] = React.useState<string[]>([]);
  const [selectedLayerId, setSelectedLayerId] = React.useState<string | null>(
    layers[0]?.id ?? null,
  );
  const effectiveSelectedLayerId = layers.some(
    (layer) => layer.id === selectedLayerId,
  )
    ? selectedLayerId
    : (layers[0]?.id ?? null);
  const selected =
    layers.find((layer) => layer.id === effectiveSelectedLayerId) ?? layers[0];
  const artDirection = normalizeArtDirection(section.content.artDirection);
  const currentDirection = artDirection[device];
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pendingUploadIdRef = React.useRef<string | null>(null);
  const layersRef = React.useRef(layers);

  React.useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  const setLayers = (next: InvitationDecorationLayer[]) => {
    layersRef.current = next;
    onUpdateContent("decorations", next);
  };

  const addLayer = (kind: InvitationDecorationLayer["kind"]) => {
    if (layers.length >= 8) return;
    const id = `decor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const layer: InvitationDecorationLayer = {
      id,
      kind,
      label:
        kind === "monogram"
          ? "Monogramă"
          : kind === "shape"
            ? "Formă"
            : "Imagine decorativă",
      ...(kind === "monogram" ? { text: "A & M" } : {}),
      ...(kind === "shape" ? { color: "#F06449" } : {}),
      x: 50,
      y: kind === "monogram" ? 24 : 50,
      scale: kind === "monogram" ? 100 : 70,
      rotation: 0,
      opacity: 100,
      zIndex: layers.length + 1,
      visibleOn: ["desktop", "tablet", "mobile"],
    };
    const next = [...layers, layer];
    setLayers(next);
    setSelectedLayerId(id);
    if (kind === "image") {
      pendingUploadIdRef.current = id;
      fileRef.current?.click();
    }
  };

  const updateSelected = (update: Partial<InvitationDecorationLayer>) => {
    if (!selected) return;
    setLayers(
      layers.map((layer) =>
        layer.id === selected.id ? { ...layer, ...update } : layer,
      ),
    );
  };

  const updateDirection = (
    update: Partial<InvitationArtDirection[InvitationDevice]>,
  ) =>
    onUpdateContent("artDirection", {
      ...artDirection,
      [device]: { ...currentDirection, ...update },
    });

  const updateTextLayer = (
    key: string,
    update: Parameters<typeof updateInvitationTextStyle>[3],
  ) =>
    onUpdateContent(
      "textStyles",
      updateInvitationTextStyle(section.content, key, device, update),
    );

  const groupSelectedTexts = () => {
    if (selectedTextKeys.length < 2) return;
    const groupId = `text-group-${Date.now().toString(36)}`;
    let nextTextStyles = section.content.textStyles;
    for (const key of selectedTextKeys) {
      nextTextStyles = updateInvitationTextStyle(
        { ...section.content, textStyles: nextTextStyles },
        key,
        "all",
        { groupId },
      );
    }
    onUpdateContent("textStyles", nextTextStyles);
    setSelectedTextKeys([selectedTextKeys[0]]);
  };

  const ungroupSelectedText = () => {
    const firstKey = selectedTextKeys[0] ?? selectedContentKey;
    if (!firstKey) return;
    const groupId = resolveInvitationTextStyle(
      section.content,
      firstKey,
      device,
    ).groupId;
    if (!groupId) return;
    let nextTextStyles = section.content.textStyles;
    for (const field of textLayers) {
      if (
        resolveInvitationTextStyle(section.content, field.path, device)
          .groupId !== groupId
      )
        continue;
      nextTextStyles = updateInvitationTextStyle(
        { ...section.content, textStyles: nextTextStyles },
        field.path,
        "all",
        { groupId: null },
      );
    }
    onUpdateContent("textStyles", nextTextStyles);
    setSelectedTextKeys([]);
  };

  const selectedGroupId = (() => {
    const key = selectedTextKeys[0] ?? selectedContentKey;
    return key
      ? resolveInvitationTextStyle(section.content, key, device).groupId
      : null;
  })();

  return (
    <div className="space-y-4 border-t border-line pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Layers3 className="size-4 text-brand" aria-hidden />
            Straturi în secțiune
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Textele și decorațiunile au aceeași ordine vizuală. Selectează,
            blochează sau ascunde fără să cauți elementul în canvas.
          </p>
        </div>
        <span className="text-xs tabular-nums text-faint">
          {textLayers.length + layers.length} straturi
        </span>
      </div>

      <div className="space-y-1 rounded-xl border border-line bg-surface p-1.5">
        {textLayers.map((field) => {
          const style = resolveInvitationTextStyle(
            section.content,
            field.path,
            device,
          );
          const active = selectedContentKey === field.path;
          const overridden = invitationTextHasOverride(
            section.content,
            field.path,
            device,
          );
          return (
            <div
              key={field.path}
              className={cn(
                "rounded-lg",
                active && "bg-brand-softer/70 ring-1 ring-brand/25",
              )}
            >
              <div className="flex min-h-11 items-center gap-1">
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-brand"
                  onClick={() =>
                    setSelectedTextKeys((current) =>
                      current.includes(field.path)
                        ? current.filter((key) => key !== field.path)
                        : [...current, field.path],
                    )
                  }
                  aria-label={`${selectedTextKeys.includes(field.path) ? "Scoate" : "Selectează"} ${field.label} pentru grupare`}
                  aria-pressed={selectedTextKeys.includes(field.path)}
                >
                  {selectedTextKeys.includes(field.path) ? (
                    <CheckSquare2 className="size-4" aria-hidden />
                  ) : (
                    <Square className="size-4" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLayerId(null);
                    onSelectContentKey(field.path);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left"
                  aria-pressed={active}
                >
                  <Type className="size-3.5 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {field.label}
                  </span>
                  {overridden ? (
                    <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-xs font-semibold text-brand-strong">
                      {deviceLabel(device)}
                    </span>
                  ) : null}
                  {style.groupId ? (
                    <Group
                      className="size-3.5 shrink-0 text-brand"
                      aria-label="Face parte dintr-un grup"
                    />
                  ) : null}
                </button>
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink"
                  onClick={() =>
                    updateTextLayer(field.path, { locked: !style.locked })
                  }
                  aria-label={`${style.locked ? "Deblochează" : "Blochează"} ${field.label}`}
                  aria-pressed={style.locked === true}
                >
                  {style.locked ? (
                    <Lock className="size-3.5" aria-hidden />
                  ) : (
                    <Unlock className="size-3.5" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-subtle hover:text-ink"
                  onClick={() =>
                    updateTextLayer(field.path, { hidden: !style.hidden })
                  }
                  aria-label={`${style.hidden ? "Afișează" : "Ascunde"} ${field.label}`}
                  aria-pressed={style.hidden === true}
                >
                  {style.hidden ? (
                    <EyeOff className="size-3.5" aria-hidden />
                  ) : (
                    <Eye className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>
              {active ? (
                <div className="flex items-center justify-between border-t border-brand/15 px-2 py-1.5">
                  <span className="text-xs text-muted">
                    Strat {style.zIndex ?? 10}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-ink"
                      onClick={() =>
                        updateTextLayer(field.path, {
                          zIndex: Math.max(0, (style.zIndex ?? 10) - 1),
                        })
                      }
                    >
                      <ChevronsDown className="size-3" aria-hidden />
                      În spate
                    </button>
                    <button
                      type="button"
                      className="flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-ink"
                      onClick={() =>
                        updateTextLayer(field.path, {
                          zIndex: Math.min(60, (style.zIndex ?? 10) + 1),
                        })
                      }
                    >
                      <ChevronsUp className="size-3" aria-hidden />
                      În față
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        {selectedTextKeys.length > 1 ? (
          <div className="flex items-center justify-between gap-2 border-t border-line px-2 pt-2">
            <span className="text-xs text-muted">
              {selectedTextKeys.length} texte selectate
            </span>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-lg bg-action px-3 text-xs font-semibold text-on-action"
              onClick={groupSelectedTexts}
            >
              <Group className="size-3.5" aria-hidden />
              Grupează
            </button>
          </div>
        ) : selectedGroupId ? (
          <div className="flex items-center justify-between gap-2 border-t border-line px-2 pt-2">
            <span className="text-xs text-muted">Element într-un grup</span>
            <button
              type="button"
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-brand hover:bg-brand-softer"
              onClick={ungroupSelectedText}
            >
              <Ungroup className="size-3.5" aria-hidden />
              Degrupează
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <p className="text-xs font-semibold text-ink">Adaugă decorațiune</p>
        <span className="text-xs tabular-nums text-faint">
          {layers.length}/8
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <LayerButton
          icon={Type}
          label="Monogramă"
          disabled={layers.length >= 8}
          onClick={() => addLayer("monogram")}
        />
        <LayerButton
          icon={Circle}
          label="Formă"
          disabled={layers.length >= 8}
          onClick={() => addLayer("shape")}
        />
        <LayerButton
          icon={ImagePlus}
          label="Imagine"
          disabled={layers.length >= 8 || uploading}
          onClick={() => addLayer("image")}
        />
      </div>
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const targetId = pendingUploadIdRef.current ?? selected?.id;
          pendingUploadIdRef.current = null;
          if (file && targetId) {
            void onUploadImage(file, (mediaId, fileName) => {
              setLayers(
                layersRef.current.map((layer) =>
                  layer.id === targetId
                    ? { ...layer, mediaId, label: fileName }
                    : layer,
                ),
              );
            });
          }
          event.currentTarget.value = "";
        }}
      />

      {layers.length ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {layers.map((layer) => (
              <button
                key={layer.id}
                onClick={() => {
                  setSelectedLayerId(layer.id);
                  onSelectContentKey(null);
                }}
                className={cn(
                  "min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium",
                  selected?.id === layer.id && selectedContentKey === null
                    ? "border-brand bg-brand-softer text-brand-strong"
                    : "border-line text-muted hover:border-line-strong",
                )}
              >
                {layer.label}
              </button>
            ))}
          </div>

          {selected && selectedContentKey === null && (
            <div className="space-y-3 rounded-xl bg-subtle/60 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={selected.label}
                  aria-label="Numele stratului"
                  onChange={(event) =>
                    updateSelected({ label: event.target.value })
                  }
                />
                <button
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-danger hover:bg-danger-soft"
                  onClick={() => {
                    setLayers(layers.filter((layer) => layer.id !== selected.id));
                    setSelectedLayerId(null);
                  }}
                  aria-label={`Șterge ${selected.label}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
              {selected.kind === "monogram" && (
                <Field label="Text">
                  <Input
                    value={selected.text ?? ""}
                    maxLength={40}
                    onChange={(event) =>
                      updateSelected({ text: event.target.value })
                    }
                  />
                </Field>
              )}
              {selected.kind === "shape" && (
                <Field label="Culoare">
                  <div className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-2">
                    <input
                      className="size-8 cursor-pointer rounded-md"
                      type="color"
                      value={validHexColor(selected.color, "#F06449")}
                      onChange={(event) =>
                        updateSelected({
                          color: event.target.value.toUpperCase(),
                        })
                      }
                      aria-label="Alege culoarea formei"
                    />
                    <input
                      key={selected.color ?? "#F06449"}
                      className="min-h-11 min-w-0 flex-1 bg-transparent font-mono text-xs uppercase text-ink outline-none"
                      defaultValue={(selected.color ?? "#F06449").toUpperCase()}
                      pattern="#[0-9A-Fa-f]{6}"
                      title="Folosește formatul #RRGGBB, de exemplu #F06449"
                      onBlur={(event) => {
                        const candidate = event.currentTarget.value.trim();
                        if (/^#[0-9a-f]{6}$/i.test(candidate)) {
                          const normalized = candidate.toUpperCase();
                          event.currentTarget.value = normalized;
                          updateSelected({ color: normalized });
                        } else {
                          event.currentTarget.value = (
                            selected.color ?? "#F06449"
                          ).toUpperCase();
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          event.currentTarget.value = (
                            selected.color ?? "#F06449"
                          ).toUpperCase();
                          event.currentTarget.blur();
                        }
                      }}
                      aria-label="Culoarea formei în format HEX"
                    />
                  </div>
                </Field>
              )}
              {selected.kind === "image" && (
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => {
                    pendingUploadIdRef.current = selected.id;
                    fileRef.current?.click();
                  }}
                >
                  <ImagePlus className="size-4" aria-hidden />
                  {selected.mediaId ? "Înlocuiește imaginea" : "Alege imaginea"}
                </Button>
              )}
              <div className="grid grid-cols-2 gap-3">
                <RangeField
                  label={`Orizontal ${selected.x}%`}
                  min={0}
                  max={100}
                  value={selected.x}
                  onChange={(x) => updateSelected({ x })}
                />
                <RangeField
                  label={`Vertical ${selected.y}%`}
                  min={0}
                  max={100}
                  value={selected.y}
                  onChange={(y) => updateSelected({ y })}
                />
                <RangeField
                  label={`Scară ${selected.scale}%`}
                  min={25}
                  max={200}
                  value={selected.scale}
                  onChange={(scale) => updateSelected({ scale })}
                />
                <RangeField
                  label={`Rotație ${selected.rotation}°`}
                  min={-180}
                  max={180}
                  value={selected.rotation}
                  onChange={(rotation) => updateSelected({ rotation })}
                />
              </div>
              <RangeField
                label={`Opacitate ${selected.opacity}%`}
                min={10}
                max={100}
                value={selected.opacity}
                onChange={(opacity) => updateSelected({ opacity })}
              />
              <RangeField
                label={`Ordine strat ${selected.zIndex ?? layers.indexOf(selected) + 1}`}
                min={0}
                max={60}
                value={selected.zIndex ?? layers.indexOf(selected) + 1}
                onChange={(zIndex) => updateSelected({ zIndex })}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 rounded-lg border text-xs font-semibold",
                    selected.locked
                      ? "border-brand bg-brand-softer text-brand-strong"
                      : "border-line text-muted",
                  )}
                  onClick={() => updateSelected({ locked: !selected.locked })}
                  aria-pressed={selected.locked === true}
                >
                  {selected.locked ? (
                    <Lock className="size-3.5" aria-hidden />
                  ) : (
                    <Unlock className="size-3.5" aria-hidden />
                  )}
                  {selected.locked ? "Blocat" : "Deblocat"}
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 rounded-lg border text-xs font-semibold",
                    selected.hidden
                      ? "border-warning bg-warning-soft text-warning"
                      : "border-line text-muted",
                  )}
                  onClick={() => updateSelected({ hidden: !selected.hidden })}
                  aria-pressed={selected.hidden === true}
                >
                  {selected.hidden ? (
                    <EyeOff className="size-3.5" aria-hidden />
                  ) : (
                    <Eye className="size-3.5" aria-hidden />
                  )}
                  {selected.hidden ? "Ascuns" : "Vizibil"}
                </button>
              </div>
              <div>
                <p className="text-xs font-medium text-ink">Vizibil pe</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {devices.map((entry) => {
                    const active = selected.visibleOn.includes(entry.value);
                    return (
                      <button
                        key={entry.value}
                        className={cn(
                          "min-h-11 rounded-lg border text-xs font-semibold",
                          active
                            ? "border-brand bg-brand-softer text-brand-strong"
                            : "border-line text-muted",
                        )}
                        onClick={() =>
                          updateSelected({
                            visibleOn: active && selected.visibleOn.length > 1
                              ? selected.visibleOn.filter(
                                  (value) => value !== entry.value,
                                )
                              : active
                                ? selected.visibleOn
                                : [...selected.visibleOn, entry.value],
                          })
                        }
                        aria-pressed={active}
                      >
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
          Adaugă o monogramă, o formă sau o imagine transparentă. Poziția în
          strat stabilește dacă elementul stă în fața sau în spatele textelor.
        </p>
      )}

      {supportsArtDirection(section) && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                Compoziție pe {deviceLabel(device)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Reglează compoziția pentru viewportul selectat în canvas.
              </p>
            </div>
            <Switch
              checked={currentDirection.hideDecorations}
              onCheckedChange={(hideDecorations) =>
                updateDirection({ hideDecorations })
              }
              aria-label={`Ascunde decorațiunile pe ${deviceLabel(device)}`}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RangeField
              label={`Centru imagine orizontal ${currentDirection.focalX}%`}
              min={0}
              max={100}
              value={currentDirection.focalX}
              onChange={(focalX) => updateDirection({ focalX })}
            />
            <RangeField
              label={`Centru imagine vertical ${currentDirection.focalY}%`}
              min={0}
              max={100}
              value={currentDirection.focalY}
              onChange={(focalY) => updateDirection({ focalY })}
            />
          </div>
          <RangeField
            label={`Scară titlu ${currentDirection.headingScale}%`}
            min={70}
            max={130}
            value={currentDirection.headingScale}
            onChange={(headingScale) => updateDirection({ headingScale })}
          />
        </div>
      )}
    </div>
  );
}

function LayerButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-line text-xs font-semibold text-muted hover:border-brand hover:bg-brand-softer hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        className="min-h-11 w-full accent-[var(--brand)]"
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function decorationLayers(value: unknown): InvitationDecorationLayer[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is InvitationDecorationLayer => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Partial<InvitationDecorationLayer>;
    return (
      typeof item.id === "string" &&
      (item.kind === "monogram" ||
        item.kind === "shape" ||
        item.kind === "image") &&
      Array.isArray(item.visibleOn)
    );
  });
}

function normalizeArtDirection(value: unknown): InvitationArtDirection {
  const fallback: InvitationArtDirection = {
    desktop: { focalX: 50, focalY: 50, headingScale: 100, hideDecorations: false },
    tablet: { focalX: 50, focalY: 50, headingScale: 92, hideDecorations: false },
    mobile: { focalX: 50, focalY: 50, headingScale: 80, hideDecorations: false },
  };
  if (!value || typeof value !== "object") return fallback;
  const stored = value as Record<string, unknown>;
  return Object.fromEntries(
    devices.map(({ value: device }) => {
      const current =
        stored[device] && typeof stored[device] === "object"
          ? (stored[device] as Record<string, unknown>)
          : {};
      return [
        device,
        {
          focalX: numberInRange(current.focalX, fallback[device].focalX, 0, 100),
          focalY: numberInRange(current.focalY, fallback[device].focalY, 0, 100),
          headingScale: numberInRange(
            current.headingScale,
            fallback[device].headingScale,
            70,
            130,
          ),
          hideDecorations:
            typeof current.hideDecorations === "boolean"
              ? current.hideDecorations
              : false,
        },
      ];
    }),
  ) as InvitationArtDirection;
}

function numberInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  return typeof value === "number"
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function supportsArtDirection(section: InvitationSection) {
  const blockKind = section.content.blockKind;
  return (
    section.type === "hero" ||
    blockKind === "artwork" ||
    blockKind === "media_text" ||
    blockKind === "video"
  );
}

function deviceLabel(device: InvitationDevice) {
  return devices.find((entry) => entry.value === device)?.label ?? device;
}

function validHexColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
