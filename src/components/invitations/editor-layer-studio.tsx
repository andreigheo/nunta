"use client";

import * as React from "react";
import {
  Circle,
  ImagePlus,
  Layers3,
  Trash2,
  Type,
} from "lucide-react";
import { Button, Field, Input, Switch } from "@/components/ui";
import type {
  InvitationArtDirection,
  InvitationDecorationLayer,
  InvitationDevice,
  InvitationSection,
} from "@/lib/invitations/editor-model";
import { cn } from "@/lib/utils";

const devices: Array<{ value: InvitationDevice; label: string }> = [
  { value: "desktop", label: "Desktop" },
  { value: "tablet", label: "Tabletă" },
  { value: "mobile", label: "Mobil" },
];

export function EditorLayerStudio({
  section,
  device,
  uploading,
  onUpdateContent,
  onUploadImage,
}: {
  section: InvitationSection;
  device: InvitationDevice;
  uploading: boolean;
  onUpdateContent: (key: string, value: unknown) => void;
  onUploadImage: (
    file: File,
    apply: (mediaId: string, fileName: string) => void,
  ) => Promise<void>;
}) {
  const layers = decorationLayers(section.content.decorations);
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

  return (
    <div className="space-y-4 border-t border-line pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Layers3 className="size-4 text-brand" aria-hidden />
            Straturi decorative
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Elementele stau în zona sigură și se adaptează separat pe fiecare
            dispozitiv. Maximum 8 pe secțiune.
          </p>
        </div>
        <span className="text-xs tabular-nums text-faint">{layers.length}/8</span>
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
                onClick={() => setSelectedLayerId(layer.id)}
                className={cn(
                  "min-h-11 shrink-0 rounded-lg border px-3 text-xs font-medium",
                  selected?.id === layer.id
                    ? "border-brand bg-brand-softer text-brand-strong"
                    : "border-line text-muted hover:border-line-strong",
                )}
              >
                {layer.label}
              </button>
            ))}
          </div>

          {selected && (
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
                      value={selected.color ?? "#F06449"}
                      onChange={(event) =>
                        updateSelected({ color: event.target.value })
                      }
                    />
                    <Input
                      className="border-0"
                      value={selected.color ?? "#F06449"}
                      onChange={(event) =>
                        updateSelected({ color: event.target.value })
                      }
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
              <div>
                <p className="text-xs font-medium text-ink">Vizibil pe</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {devices.map((entry) => {
                    const active = selected.visibleOn.includes(entry.value);
                    return (
                      <button
                        key={entry.value}
                        className={cn(
                          "min-h-11 rounded-lg border text-[11px] font-semibold",
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
          Adaugă o monogramă, o formă sau o imagine transparentă. Conținutul
          invitației rămâne mereu deasupra și accesibil.
        </p>
      )}

      {supportsArtDirection(section) && (
        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                Art direction · {deviceLabel(device)}
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
              label={`Focal X ${currentDirection.focalX}%`}
              min={0}
              max={100}
              value={currentDirection.focalX}
              onChange={(focalX) => updateDirection({ focalX })}
            />
            <RangeField
              label={`Focal Y ${currentDirection.focalY}%`}
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
      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-line text-[11px] font-semibold text-muted hover:border-brand hover:bg-brand-softer hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-45"
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
