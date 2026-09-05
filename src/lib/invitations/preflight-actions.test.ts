import { describe, expect, it } from "vitest";
import { invitationPreflightGuide } from "./preflight-actions";

const serverCodes = [
  "INVITATION_SITE_MISSING",
  "INVITATION_DRAFT_MISSING",
  "RSVP_FORM_NOT_PUBLISHED",
  "GUEST_EVENT_MISSING",
  "INVITATION_STARTER_CONTENT",
  "VARIANT_DRAFT_MISSING",
  "VARIANT_STARTER_CONTENT",
  "VARIANT_SECTION_MISSING",
  "RECIPIENT_VARIANT_UNAVAILABLE",
  "INVITATION_MEDIA_INVALID",
  "INVITATION_MEDIA_UNAVAILABLE",
  "VARIANT_MEDIA_INVALID",
  "VARIANT_MEDIA_UNAVAILABLE",
  "NO_RECIPIENTS",
];

describe("invitation preflight guides", () => {
  it("covers every code the server can emit with its own Romanian copy", () => {
    for (const code of serverCodes) {
      const guide = invitationPreflightGuide(code, "Publish the RSVP form");
      expect(guide.title).not.toBe("Verificare nepromovată de server");
      expect(guide.detail).not.toBe("Publish the RSVP form");
      expect(guide.detail.length).toBeGreaterThan(20);
    }
  });

  it("routes fixable blockers to the screen that owns them", () => {
    expect(
      invitationPreflightGuide("RSVP_FORM_NOT_PUBLISHED", ""),
    ).toMatchObject({ action: { kind: "route", href: "/rsvp" } });
    expect(
      invitationPreflightGuide("RECIPIENT_VARIANT_UNAVAILABLE", ""),
    ).toMatchObject({ action: { kind: "route", href: "/invitations" } });
    expect(invitationPreflightGuide("VARIANT_SECTION_MISSING", "")).toMatchObject(
      { action: { kind: "workflow" } },
    );
    expect(
      invitationPreflightGuide("INVITATION_STARTER_CONTENT", ""),
    ).toMatchObject({ action: { kind: "starter-section" } });
  });

  it("routes a missing guest moment to the screen that owns it", () => {
    const guide = invitationPreflightGuide("GUEST_EVENT_MISSING", "");
    expect(guide.action).toEqual({
      kind: "route",
      href: "/event-day",
      label: "Adaugă momentul",
    });
    expect(guide.detail).toContain("nu se adaugă din editorul de invitații");
  });

  it("opens the media-owning section for an unavailable image", () => {
    expect(
      invitationPreflightGuide("INVITATION_MEDIA_UNAVAILABLE", "").action,
    ).toEqual({ kind: "media-section", label: "Verifică imaginile" });
  });

  it("falls back to the server message for an unknown code", () => {
    const guide = invitationPreflightGuide("SOMETHING_NEW", "Mesaj de server");
    expect(guide.detail).toBe("Mesaj de server");
    expect(guide.action).toEqual({ kind: "none" });
  });
});
