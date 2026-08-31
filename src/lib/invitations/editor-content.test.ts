import { describe, expect, it } from "vitest";
import { createDefaultSection } from "./editor-model";
import {
  invitationContentValue,
  invitationEditableFields,
  setInvitationContentValue,
} from "./editor-content";

describe("invitation editor content registry", () => {
  it("exposes stable nested paths for repeated visible text", () => {
    const section = createDefaultSection("schedule", "schedule");
    expect(invitationEditableFields(section).map((field) => field.path)).toContain(
      "items.0.title",
    );
  });

  it("updates a nested field without mutating the source", () => {
    const section = createDefaultSection("faq", "faq");
    const next = setInvitationContentValue(
      section.content,
      "items.0.answer",
      "Răspuns nou",
    );
    expect(invitationContentValue(next, "items.0.answer")).toBe("Răspuns nou");
    expect(invitationContentValue(section.content, "items.0.answer")).not.toBe(
      "Răspuns nou",
    );
  });
});
