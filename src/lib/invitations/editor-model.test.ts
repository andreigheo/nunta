import { describe, expect, it } from "vitest";
import {
  createDefaultSection,
  createInitialSnapshot,
  invitationReadiness,
  serializeSnapshot,
  snapshotFromPersisted,
} from "./editor-model";

describe("invitation editor model", () => {
  it("serializes rich section content and design without losing editor state", () => {
    const snapshot = createInitialSnapshot();
    const hero = snapshot.sections[0];
    hero.content.names = "Iulia & Radu";
    hero.content.mediaId = "b27a62b6-1b40-4ce8-ac21-a6c5e0aced10";
    hero.content.layout = "immersive";
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

  it("reports the invitation readiness from real visible content", () => {
    const snapshot = createInitialSnapshot();
    expect(invitationReadiness(snapshot)).toMatchObject({
      completed: 5,
      total: 5,
    });

    snapshot.sections.find((section) => section.type === "rsvp")!.visible = false;
    expect(invitationReadiness(snapshot).completed).toBe(4);
  });
});
