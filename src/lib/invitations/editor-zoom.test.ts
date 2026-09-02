import { describe, expect, it } from "vitest";
import {
  clampInvitationCanvasZoom,
  parseInvitationZoomPreferences,
  resolveInvitationCanvasFitZoom,
  serializeInvitationZoomPreferences,
} from "./editor-zoom";

describe("invitation editor zoom", () => {
  it("fits the fixed device canvas inside the available editor width", () => {
    expect(resolveInvitationCanvasFitZoom(1008, 1440)).toBeCloseTo(0.7);
    expect(resolveInvitationCanvasFitZoom(342, 390)).toBeCloseTo(0.877);
    expect(resolveInvitationCanvasFitZoom(1440, 768)).toBe(0.9);
    expect(resolveInvitationCanvasFitZoom(0, 1440)).toBe(0.9);
  });

  it("keeps fit usable when desktop is previewed on a phone", () => {
    expect(resolveInvitationCanvasFitZoom(288, 1440)).toBe(0.2);
  });

  it("sanitizes persisted preferences independently for every device", () => {
    const parsed = parseInvitationZoomPreferences(
      JSON.stringify({ desktop: 0.7, tablet: "fit", mobile: 9, ignored: 0.5 }),
    );

    expect(parsed).toEqual({ desktop: 0.7, tablet: "fit", mobile: 1.5 });
    expect(parseInvitationZoomPreferences("not-json")).toEqual({});
  });

  it("rounds and clamps manual zoom before persistence", () => {
    expect(clampInvitationCanvasZoom(0.733)).toBe(0.73);
    expect(clampInvitationCanvasZoom(0.1)).toBe(0.25);
    expect(clampInvitationCanvasZoom(2)).toBe(1.5);
    expect(
      serializeInvitationZoomPreferences({ desktop: 0.7, mobile: "fit" }),
    ).toBe('{"desktop":0.7,"mobile":"fit"}');
  });
});
