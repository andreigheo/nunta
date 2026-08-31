import { describe, expect, it } from "vitest";
import {
  applyInvitationVariant,
  createAdvancedSection,
  createDefaultSection,
  createInitialSnapshot,
  isInvitationHexColor,
  invitationTemplates,
  invitationVariantOverrides,
  invitationReadiness,
  nextInvitationPaletteColor,
  removeInvitationPaletteColor,
  serializeSnapshot,
  snapshotFromPersisted,
} from "./editor-model";

describe("invitation editor model", () => {
  it("keeps new palette colors distinct and the active accent represented", () => {
    const snapshot = createInitialSnapshot();
    const nextColor = nextInvitationPaletteColor(snapshot.design.palette);

    expect(
      snapshot.design.palette.map((color) => color.toLowerCase()),
    ).not.toContain(nextColor.toLowerCase());

    const updated = removeInvitationPaletteColor(snapshot.design, 0);
    expect(updated.palette).not.toContain(snapshot.design.palette[0]);
    expect(updated.palette).toContain(updated.accent);
    expect(isInvitationHexColor(updated.accent)).toBe(true);
    expect(isInvitationHexColor("#fff")).toBe(false);
  });

  it("serializes rich section content and design without losing editor state", () => {
    const snapshot = createInitialSnapshot();
    const hero = snapshot.sections[0];
    hero.content.names = "Iulia & Radu";
    hero.content.mediaId = "b27a62b6-1b40-4ce8-ac21-a6c5e0aced10";
    hero.content.layout = "immersive";
    hero.content.focalX = 0;
    hero.content.overlayOpacity = 0;
    hero.content.textWidth = 640;
    hero.content.textOffsetX = -20;
    hero.content.textOffsetY = 32;
    hero.content.namesGap = 28;
    hero.content.metaGap = 44;
    hero.style.tone = "soft";
    hero.style.backgroundMode = "gradient";
    hero.style.gradientFrom = "#123456";
    hero.style.gradientTo = "#FEDCBA";
    snapshot.design.accent = "#345C4A";
    snapshot.design.palette = ["#345C4A", "#F4F0E8", "#A8613A"];

    const serialized = serializeSnapshot(snapshot);
    const restored = snapshotFromPersisted(
      serialized.document.sections,
      serialized.settings,
    );

    expect(restored.sections[0].content.names).toBe("Iulia & Radu");
    expect(restored.sections[0].content.mediaId).toBe(
      "b27a62b6-1b40-4ce8-ac21-a6c5e0aced10",
    );
    expect(restored.sections[0].content.layout).toBe("immersive");
    expect(restored.sections[0].content.focalX).toBe(0);
    expect(restored.sections[0].content.overlayOpacity).toBe(0);
    expect(restored.sections[0].content.textWidth).toBe(640);
    expect(restored.sections[0].content.textOffsetX).toBe(-20);
    expect(restored.sections[0].content.textOffsetY).toBe(32);
    expect(restored.sections[0].content.namesGap).toBe(28);
    expect(restored.sections[0].content.metaGap).toBe(44);
    expect(restored.sections[0].style.tone).toBe("soft");
    expect(restored.sections[0].style.backgroundMode).toBe("gradient");
    expect(restored.sections[0].style.gradientFrom).toBe("#123456");
    expect(restored.sections[0].style.gradientTo).toBe("#FEDCBA");
    expect(restored.design.accent).toBe("#345C4A");
    expect(restored.design.palette).toEqual([
      "#345C4A",
      "#F4F0E8",
      "#A8613A",
    ]);
  });

  it("stores the gallery as a compatible custom block and restores its editor type", () => {
    const snapshot = createInitialSnapshot();
    const gallery = createDefaultSection("gallery", "gallery");
    gallery.content.items = [
      { url: "https://images.example.test/us.jpg", caption: "Noi doi" },
    ];
    snapshot.sections.push(gallery);

    const serialized = serializeSnapshot(snapshot);
    const persistedGallery = serialized.document.sections.at(-1);
    const restored = snapshotFromPersisted(
      serialized.document.sections,
      serialized.settings,
    );

    expect(persistedGallery?.type).toBe("custom");
    expect(persistedGallery?.content.editorType).toBe("gallery");
    expect(restored.sections.at(-1)?.type).toBe("gallery");
    expect(restored.sections.at(-1)?.content.items).toEqual(gallery.content.items);
  });

  it("repairs malformed persisted colors and layout values without breaking the editor", () => {
    const snapshot = createInitialSnapshot();
    const serialized = serializeSnapshot(snapshot);
    const restored = snapshotFromPersisted(serialized.document.sections, {
      ...serialized.settings,
      colors: {
        ...serialized.settings.colors,
        accent: "not-a-color",
      },
      editorStyle: {
        ...serialized.settings.editorStyle,
        palette: ["bad", "#abcdef", "#ABCDEF", "#123456"],
        radius: "broken",
        buttonStyle: "broken",
      },
    });

    expect(restored.design.accent).toBe(invitationTemplates[0].design.accent);
    expect(restored.design.palette).toEqual(["#ABCDEF", "#123456"]);
    expect(restored.design.radius).toBe(invitationTemplates[0].design.radius);
    expect(restored.design.buttonStyle).toBe(
      invitationTemplates[0].design.buttonStyle,
    );
  });

  it("reports the invitation readiness from real visible content", () => {
    const snapshot = createInitialSnapshot();
    const initialReadiness = invitationReadiness(snapshot);
    expect(initialReadiness).toMatchObject({
      completed: 5,
      total: 6,
    });
    expect(
      initialReadiness.checks.find((check) => !check.done)?.sectionId,
    ).toBeTruthy();

    const hero = snapshot.sections.find((section) => section.type === "hero")!;
    hero.content.names = "Andrei & Andreea";
    hero.content.date = "8 august 2028";
    hero.content.venue = "Grădina noastră";
    snapshot.sections.find((section) => section.type === "schedule")!.content.items = [
      { time: "15:00", title: "Ceremonia", detail: "Grădina noastră" },
    ];
    snapshot.sections.find((section) => section.type === "locations")!.content.items = [
      { name: "Grădina noastră", address: "Strada Florilor 8", url: "" },
    ];
    const rsvp = snapshot.sections.find((section) => section.type === "rsvp")!;
    rsvp.content.title = "Confirmați până la începutul verii";
    rsvp.content.body = "Spuneți-ne câți dintre voi pot ajunge.";
    rsvp.content.deadline = "1 iulie 2028";
    for (const type of ["story", "countdown", "dress_code", "faq"])
      snapshot.sections.find((section) => section.type === type)!.visible = false;

    expect(invitationReadiness(snapshot)).toMatchObject({
      completed: 6,
      total: 6,
    });
  });

  it("persists the cinematic cover and device art direction", () => {
    const snapshot = createInitialSnapshot();
    snapshot.experience = {
      ...snapshot.experience,
      enabled: true,
      monogram: "I & R",
      sealStyle: "botanical",
      texture: "linen",
      coverMediaId: "b27a62b6-1b40-4ce8-ac21-a6c5e0aced10",
      durationMs: 1200,
    };
    const hero = snapshot.sections[0];
    hero.content.artDirection = {
      desktop: { focalX: 44, focalY: 38, headingScale: 100, hideDecorations: false },
      tablet: { focalX: 50, focalY: 42, headingScale: 92, hideDecorations: false },
      mobile: { focalX: 64, focalY: 40, headingScale: 76, hideDecorations: true },
    };

    const serialized = serializeSnapshot(snapshot);
    const restored = snapshotFromPersisted(
      serialized.document.sections,
      serialized.settings,
    );

    expect(restored.experience).toMatchObject({
      enabled: true,
      monogram: "I & R",
      sealStyle: "botanical",
      texture: "linen",
      coverMediaId: "b27a62b6-1b40-4ce8-ac21-a6c5e0aced10",
      durationMs: 1200,
    });
    expect(restored.sections[0].content.artDirection).toEqual(
      hero.content.artDirection,
    );
  });

  it("keeps legacy invitation drafts on the monogram seal", () => {
    const snapshot = createInitialSnapshot();
    const serialized = serializeSnapshot(snapshot);
    const experience = {
      ...serialized.settings.experience,
    } as Record<string, unknown>;
    delete experience.sealStyle;

    const restored = snapshotFromPersisted(serialized.document.sections, {
      ...serialized.settings,
      experience,
    });

    expect(restored.experience.sealStyle).toBe("monogram");
  });

  it("creates advanced blocks inside the compatible custom contract", () => {
    const mediaText = createAdvancedSection("media_text", "media-story");
    const snapshot = createInitialSnapshot();
    snapshot.sections.push(mediaText);

    const persisted = serializeSnapshot(snapshot).document.sections.at(-1);

    expect(mediaText.type).toBe("custom");
    expect(mediaText.content.blockKind).toBe("media_text");
    expect(persisted).toMatchObject({
      id: "media-story",
      type: "custom",
      content: { blockKind: "media_text" },
    });
  });

  it("stores only named variant differences and can resolve them over the base", () => {
    const base = createInitialSnapshot();
    const variant = structuredClone(base);
    variant.sections[0].content.subtitle = "Un mesaj numai pentru familie.";
    variant.sections.find((section) => section.type === "dress_code")!.visible = false;
    variant.experience.frontMessage = "Familia noastră";

    const overrides = invitationVariantOverrides(base, variant);
    const resolved = applyInvitationVariant(base, overrides);

    expect(overrides.document?.sections).toHaveLength(2);
    expect(resolved.sections[0].content.subtitle).toBe(
      "Un mesaj numai pentru familie.",
    );
    expect(
      resolved.sections.find((section) => section.type === "dress_code")?.visible,
    ).toBe(false);
    expect(resolved.experience.frontMessage).toBe("Familia noastră");
    expect(base.sections[0].content.subtitle).not.toBe(
      "Un mesaj numai pentru familie.",
    );
  });

  it("rejects structural drift in a named variant instead of losing it silently", () => {
    const base = createInitialSnapshot();
    const variant = structuredClone(base);
    variant.sections.push(createAdvancedSection("divider", "variant-divider"));

    expect(() => invitationVariantOverrides(base, variant)).toThrow(
      "Structura unei variante trebuie modificată în invitația de bază.",
    );
  });
});
