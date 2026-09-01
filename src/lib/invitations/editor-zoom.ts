import type { InvitationDevice } from "./editor-model";

export type InvitationCanvasZoom = "fit" | number;

export const invitationZoomPreferenceKey =
  "sarbato.invitation-editor.canvas-zoom.v1";
export const invitationCanvasZoomMin = 0.25;
export const invitationCanvasZoomMax = 1.5;
export const invitationCanvasFitFloor = 0.2;
export const invitationCanvasFitCeiling = 0.9;

const invitationDevices: InvitationDevice[] = ["desktop", "tablet", "mobile"];

export function clampInvitationCanvasZoom(value: number) {
  return Math.min(
    invitationCanvasZoomMax,
    Math.max(invitationCanvasZoomMin, Math.round(value * 100) / 100),
  );
}

export function resolveInvitationCanvasFitZoom(
  viewportWidth: number,
  canvasWidth: number,
) {
  if (viewportWidth <= 0 || canvasWidth <= 0)
    return invitationCanvasFitCeiling;
  return Math.min(
    invitationCanvasFitCeiling,
    Math.max(invitationCanvasFitFloor, viewportWidth / canvasWidth),
  );
}

export function parseInvitationZoomPreferences(value: string | null) {
  const preferences: Partial<
    Record<InvitationDevice, InvitationCanvasZoom>
  > = {};
  if (!value) return preferences;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    for (const device of invitationDevices) {
      const zoom = parsed[device];
      if (zoom === "fit") preferences[device] = zoom;
      else if (typeof zoom === "number" && Number.isFinite(zoom))
        preferences[device] = clampInvitationCanvasZoom(zoom);
    }
  } catch {
    return preferences;
  }

  return preferences;
}

export function serializeInvitationZoomPreferences(
  preferences: Partial<Record<InvitationDevice, InvitationCanvasZoom>>,
) {
  return JSON.stringify(preferences);
}
