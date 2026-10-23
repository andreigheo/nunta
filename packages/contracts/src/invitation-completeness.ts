/** Content checks shared by the editor and publication preflight. Hidden
 * sections are intentionally excluded; drafts may remain incomplete. */
export function invitationContentText(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return (
    ![
      "data evenimentului",
      "locatia va fi anuntata",
      "termenul de confirmare",
      "evenimentul nostru",
      "detalii in curand",
    ].includes(normalized) && !normalized.startsWith("adauga aici ")
  );
}

type Section = { id: string; type: string; content: Record<string, unknown> };
export type InvitationContentCheck = {
  code: string;
  label: string;
  done: boolean;
  sectionId?: string | undefined;
};

export function invitationContentChecks(
  document: unknown,
): InvitationContentCheck[] {
  const source =
    document && typeof document === "object"
      ? (document as Record<string, unknown>).sections
      : undefined;
  const visible: Section[] = [];
  for (const value of Array.isArray(source) ? source : []) {
    if (!value || typeof value !== "object") continue;
    const section = value as Record<string, unknown>;
    if (section.visible === false) continue;
    visible.push({
      id: String(section.id ?? ""),
      type: String(section.type ?? ""),
      content: record(section.content),
    });
  }
  const hero = visible.find((s) => s.type === "hero");
  const checks: InvitationContentCheck[] = [
    {
      code: "INVITATION_TITLE_MISSING",
      label: "Titlul evenimentului",
      done: invitationContentText(hero?.content.names),
      sectionId: hero?.id,
    },
    {
      code: "INVITATION_DATE_MISSING",
      label: "Data evenimentului",
      done: invitationContentText(hero?.content.date),
      sectionId: hero?.id,
    },
  ];
  for (const section of visible) {
    if (section.type === "schedule") {
      const items = records(section.content.items);
      checks.push({
        code: "INVITATION_SCHEDULE_INCOMPLETE",
        label: "Programul afișat este completat",
        done:
          items.length > 0 &&
          items.every(
            (item) =>
              invitationContentText(item.time) &&
              invitationContentText(item.title),
          ),
        sectionId: section.id,
      });
    }
    if (section.type === "locations") {
      const items = records(section.content.items);
      checks.push({
        code: "INVITATION_LOCATIONS_INCOMPLETE",
        label: "Locațiile afișate sunt completate",
        done:
          items.length > 0 &&
          items.every(
            (item) =>
              invitationContentText(item.name) &&
              invitationContentText(item.address),
          ),
        sectionId: section.id,
      });
    }
    if (section.type === "rsvp")
      checks.push({
        code: "INVITATION_RSVP_INCOMPLETE",
        label: "Confirmarea RSVP este configurată",
        done: invitationContentText(section.content.deadline),
        sectionId: section.id,
      });
  }
  return checks;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
