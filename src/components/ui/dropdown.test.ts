import { describe, expect, it } from "vitest";
import { resolveMenuPlacement } from "./dropdown";

const viewport = { width: 390, height: 844 };

describe("resolveMenuPlacement", () => {
  it("keeps an end-aligned menu inside the viewport when the trigger is near the left edge", () => {
    const placement = resolveMenuPlacement({
      align: "end",
      triggerRect: { left: 16, right: 140, top: 100, bottom: 144, width: 124 },
      menuWidth: 224,
      menuHeight: 360,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.left).toBe(8);
    expect(placement.left + 224).toBeLessThanOrEqual(viewport.width - 8);
    expect(placement.top).toBe(150);
  });

  it("keeps a start-aligned menu inside the viewport when the trigger is near the right edge", () => {
    const placement = resolveMenuPlacement({
      align: "start",
      triggerRect: { left: 340, right: 374, top: 100, bottom: 144, width: 34 },
      menuWidth: 224,
      menuHeight: 360,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.left).toBe(viewport.width - 224 - 8);
  });

  it("keeps the default end-aligned menu below a right-edge trigger inside the viewport", () => {
    const placement = resolveMenuPlacement({
      align: "end",
      triggerRect: { left: 300, right: 374, top: 100, bottom: 144, width: 74 },
      menuWidth: 224,
      menuHeight: 360,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.left).toBe(374 - 224);
    expect(placement.left).toBeGreaterThanOrEqual(8);
  });

  it("centers a center-aligned menu on the trigger", () => {
    const placement = resolveMenuPlacement({
      align: "center",
      triggerRect: { left: 100, right: 200, top: 100, bottom: 144, width: 100 },
      menuWidth: 200,
      menuHeight: 100,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.left).toBe(100 + 50 - 100);
  });

  it("flips the menu above the trigger when it does not fit below", () => {
    const placement = resolveMenuPlacement({
      align: "end",
      triggerRect: { left: 16, right: 140, top: 700, bottom: 744, width: 124 },
      menuWidth: 224,
      menuHeight: 360,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.top).toBe(700 - 6 - 360);
  });

  it("stays below the trigger when there is not enough space above either", () => {
    const placement = resolveMenuPlacement({
      align: "end",
      triggerRect: { left: 16, right: 140, top: 60, bottom: 104, width: 124 },
      menuWidth: 224,
      menuHeight: 700,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.top).toBe(110);
  });

  it("clamps a menu wider than the viewport to the left margin", () => {
    const placement = resolveMenuPlacement({
      align: "end",
      triggerRect: { left: 16, right: 140, top: 100, bottom: 144, width: 124 },
      menuWidth: 500,
      menuHeight: 360,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    expect(placement.left).toBe(8);
  });
});
