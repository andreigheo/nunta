import { describe, expect, it } from "vitest";
import {
  invitationTextHasOverride,
  resetInvitationTextStyle,
  resolveInvitationTextStyle,
  updateInvitationTextStyle,
} from "./editor-elements";

describe("invitation editor elements", () => {
  it("inherits shared text geometry and applies a device override", () => {
    const content = {
      textStyles: {
        names: {
          all: { offsetX: 12, offsetY: 4, zIndex: 10 },
          mobile: { offsetX: -8, locked: true },
        },
      },
    };

    expect(resolveInvitationTextStyle(content, "names", "desktop")).toEqual({
      offsetX: 12,
      offsetY: 4,
      zIndex: 10,
    });
    expect(resolveInvitationTextStyle(content, "names", "mobile")).toEqual({
      offsetX: -8,
      offsetY: 4,
      zIndex: 10,
      locked: true,
    });
    expect(invitationTextHasOverride(content, "names", "mobile")).toBe(true);
  });

  it("updates one viewport without mutating the source", () => {
    const content = { textStyles: { title: { all: { width: 80 } } } };
    const next = updateInvitationTextStyle(content, "title", "tablet", {
      offsetY: 22,
    });

    expect(content).toEqual({ textStyles: { title: { all: { width: 80 } } } });
    expect(next).toEqual({
      title: { all: { width: 80 }, tablet: { offsetY: 22 } },
    });
  });

  it("removes a property or the whole device override cleanly", () => {
    const content = {
      textStyles: { title: { mobile: { offsetX: 4, offsetY: 8 } } },
    };
    const withoutX = resetInvitationTextStyle(
      content,
      "title",
      "mobile",
      "offsetX",
    );
    expect(withoutX).toEqual({ title: { mobile: { offsetY: 8 } } });
    expect(resetInvitationTextStyle(content, "title", "mobile")).toEqual({});
  });

  it("keeps grouping semantic while positions remain device-specific", () => {
    const content = {
      textStyles: {
        names: {
          all: { groupId: "hero-heading" },
          mobile: { offsetX: 14 },
        },
      },
    };

    expect(resolveInvitationTextStyle(content, "names", "desktop")).toEqual({
      groupId: "hero-heading",
    });
    expect(resolveInvitationTextStyle(content, "names", "mobile")).toEqual({
      groupId: "hero-heading",
      offsetX: 14,
    });
  });
});
