import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createDefaultSection,
  invitationTemplates,
  sectionCatalog,
  type InvitationEditorSnapshot,
} from "@/lib/invitations/editor-model";
import {
  countdownValuesAt,
  invitationDisplayDeadline,
  invitationDisplayTime,
  InvitationRenderer,
} from "./invitation-renderer";

describe("InvitationRenderer", () => {
  it("renders every existing section and the public CTAs from one snapshot", () => {
    const sections = sectionCatalog.map((entry, index) =>
      createDefaultSection(entry.type, `section-${index}`),
    );
    const accommodation = sections.find(
      (section) => section.type === "accommodation",
    );
    const schedule = sections.find((section) => section.type === "schedule");
    const rsvp = sections.find((section) => section.type === "rsvp");
    const registry = sections.find((section) => section.type === "registry");
    const custom = sections.find((section) => section.type === "custom");
    if (!accommodation || !schedule || !rsvp || !registry || !custom)
      throw new Error("fixture");
    accommodation.content.items = [
      {
        name: "Hotel Central",
        detail: "La 5 minute de locație",
        url: "https://example.com/hotel",
      },
    ];
    registry.content.url = "https://example.com/lista";
    custom.content.buttonLabel = "Detalii speciale";
    custom.content.url = "https://example.com/detalii";
    schedule.content.items = [
      {
        time: "2027-09-29T12:00:00.000Z",
        timezone: "Europe/Bucharest",
        title: "Ceremonia",
        detail: "Grădină",
      },
    ];
    rsvp.content.deadline = "2027-09-20T20:59:00.000Z";
    const snapshot: InvitationEditorSnapshot = {
      design: {
        ...invitationTemplates[0].design,
        buttonStyle: "pill",
      },
      experience: {
        enabled: false,
        style: "split_panels",
        replay: "first_visit",
        panelColor: "#3B183F",
        backgroundColor: "#F7F7F3",
        accentColor: "#F06449",
        texture: "paper",
        monogram: null,
        frontMessage: null,
        coverMediaId: null,
        coverImageUrl: null,
        durationMs: 1400,
      },
      sections,
    };

    const markup = renderToStaticMarkup(
      React.createElement(InvitationRenderer, {
        snapshot,
        resolveMedia: (_mediaId: string, url = "") => url,
      }),
    );

    expect(markup.match(/id="invitatie-/g)).toHaveLength(13);
    expect(markup).toContain("id=\"confirmare-invitatie\"");
    expect(markup).toContain('href="#confirmare-invitatie"');
    expect(markup).toContain("Hotel Central");
    expect(markup).toContain("https://example.com/lista");
    expect(markup).toContain("Detalii speciale");
    expect(markup).toContain("12:00");
    expect(markup).toMatch(/20.*septembrie.*2027.*23:59/i);
    expect(markup).not.toContain("2027-09-29T12:00:00.000Z");
    expect(markup).not.toContain("2027-09-20T20:59:00.000Z");
    expect(markup).toContain("rounded-full");
    expect(markup).toContain('role="timer"');
    expect(markup).toContain("—");

    const publicMarkup = renderToStaticMarkup(
      React.createElement(InvitationRenderer, {
        snapshot,
        resolveMedia: (_mediaId: string, url = "") => url,
        rsvpHref: "/guest/rsvp?token=personal",
      }),
    );
    expect(publicMarkup).toContain('href="/guest/rsvp?token=personal"');
    expect(publicMarkup).not.toContain('href="#confirmare-rsvp"');
  });

  it("uses readable foreground text for a coral invitation action", () => {
    const hero = createDefaultSection("hero", "hero-contrast");
    hero.content.layout = "minimal";
    const snapshot: InvitationEditorSnapshot = {
      design: {
        ...invitationTemplates[0].design,
        accent: "#F06449",
        buttonStyle: "solid",
      },
      experience: {
        enabled: false,
        style: "split_panels",
        replay: "first_visit",
        panelColor: "#3B183F",
        backgroundColor: "#F7F7F3",
        accentColor: "#F06449",
        texture: "paper",
        monogram: null,
        frontMessage: null,
        coverMediaId: null,
        coverImageUrl: null,
        durationMs: 1400,
      },
      sections: [hero],
    };

    const markup = renderToStaticMarkup(
      React.createElement(InvitationRenderer, {
        snapshot,
        resolveMedia: () => "",
      }),
    );

    expect(markup).toContain("background-color:#F06449;color:#19151D");
  });

  it("repairs unreadable custom section and gradient color combinations", () => {
    const custom = createDefaultSection("custom", "custom-contrast");
    custom.style.tone = "custom";
    custom.style.backgroundColor = "#FFFFFF";
    custom.style.textColor = "#FFFFFF";
    const gradient = createDefaultSection("story", "gradient-contrast");
    gradient.style.backgroundMode = "gradient";
    gradient.style.gradientFrom = "#F7F7F3";
    gradient.style.gradientTo = "#FFFFFF";
    gradient.style.textColor = "#FFFFFF";
    const snapshot: InvitationEditorSnapshot = {
      design: {
        ...invitationTemplates[0].design,
        accent: "#F4F0E8",
      },
      experience: {
        enabled: false,
        style: "split_panels",
        replay: "first_visit",
        panelColor: "#3B183F",
        backgroundColor: "#F7F7F3",
        accentColor: "#F06449",
        texture: "paper",
        monogram: null,
        frontMessage: null,
        coverMediaId: null,
        coverImageUrl: null,
        durationMs: 1400,
      },
      sections: [custom, gradient],
    };

    const markup = renderToStaticMarkup(
      React.createElement(InvitationRenderer, {
        snapshot,
        resolveMedia: () => "",
      }),
    );

    expect(markup).toContain("background-color:#FFFFFF;color:#19151D");
    expect(markup).toContain("color:#19151D");
  });

  it("calculates countdown values from an explicit instant", () => {
    expect(
      countdownValuesAt(
        "2030-01-03T01:02:03.000Z",
        Date.parse("2030-01-01T00:00:00.000Z"),
      ),
    ).toEqual([
      ["02", "zile"],
      ["01", "ore"],
      ["02", "minute"],
      ["03", "secunde"],
    ]);
    expect(countdownValuesAt("invalid", 0)[0]).toEqual(["—", "zile"]);
  });

  it("turns connected ISO values into deterministic guest-facing times and deadlines", () => {
    expect(invitationDisplayTime("2027-09-29T12:00:00.000Z")).toBe(
      "12:00",
    );
    expect(
      invitationDisplayDeadline(
        "2027-09-20T20:59:00.000Z",
        "Europe/Bucharest",
      ),
    ).toMatch(/20.*septembrie.*2027.*23:59/i);
    expect(invitationDisplayTime("16:00")).toBe("16:00");
    expect(
      invitationDisplayDeadline(
        "2027-09-29T12:00:00.000Z",
        "Not/A_Timezone",
      ),
    ).toMatch(/29.*septembrie.*2027.*12:00/i);
  });
});
