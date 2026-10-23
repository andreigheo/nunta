import { describe, expect, it } from "vitest";
import { invitationContentChecks } from "@weddingos/contracts";
import {
  createInitialSnapshot,
  invitationReadiness,
  serializeSnapshot,
} from "./editor-model";

describe("invitation content completeness", () => {
  it("does not fill a real organizer's missing details with the example wedding", () => {
    for (const eventType of ["corporate", "wedding"] as const) {
      const snapshot = createInitialSnapshot({
        eventType,
        title: "Eveniment de test",
      });
      expect(
        snapshot.sections.find((s) => s.type === "countdown")?.content.date,
      ).toBe("");
      const checks = invitationReadiness(snapshot).checks;
      for (const code of [
        "INVITATION_DATE_MISSING",
        "INVITATION_SCHEDULE_INCOMPLETE",
        "INVITATION_LOCATIONS_INCOMPLETE",
        "INVITATION_RSVP_INCOMPLETE",
      ])
        expect(checks.find((c) => c.code === code)?.done).toBe(false);
    }
  });
  it("detects placeholders in previously saved drafts on the server as well as in the editor", () => {
    const snapshot = createInitialSnapshot({
      eventType: "corporate",
      title: "Conferința echipei",
    });
    snapshot.sections.find((s) => s.type === "hero")!.content.date =
      "Data evenimentului";
    snapshot.sections.find((s) => s.type === "locations")!.content.items = [
      { name: "Locația evenimentului", address: "Locația va fi anunțată" },
    ];
    const checks = invitationContentChecks(
      serializeSnapshot(snapshot).document,
    );
    expect(checks.filter((c) => !c.done).map((c) => c.code)).toContain(
      "INVITATION_DATE_MISSING",
    );
    expect(
      checks.find((c) => c.code === "INVITATION_LOCATIONS_INCOMPLETE")?.done,
    ).toBe(false);
  });
  it("accepts reviewed content and ignores sections the organizer chose to hide", () => {
    const snapshot = createInitialSnapshot({
      eventType: "corporate",
      purpose: "save_the_date",
      title: "Conferința echipei",
      eventDate: "2027-06-10",
      location: "București, Sala Centrală",
    });
    expect(invitationReadiness(snapshot).completed).toBe(
      invitationReadiness(snapshot).total,
    );
    expect(
      invitationContentChecks(serializeSnapshot(snapshot).document).every(
        (c) => c.done,
      ),
    ).toBe(true);
  });
  it("requires every displayed agenda entry and venue to be complete", () => {
    const checks = invitationContentChecks({
      sections: [
        {
          id: "hero",
          type: "hero",
          content: { names: "Conferință", date: "10 iunie 2027" },
        },
        {
          id: "agenda",
          type: "schedule",
          content: {
            items: [
              { time: "10:00", title: "Deschidere" },
              { time: "", title: "Pauză" },
            ],
          },
        },
        {
          id: "venue",
          type: "locations",
          content: {
            items: [{ name: "Sala Centrală", address: "București" }, {}],
          },
        },
      ],
    });
    expect(checks.filter((c) => !c.done).map((c) => c.sectionId)).toEqual([
      "agenda",
      "venue",
    ]);
  });
});
