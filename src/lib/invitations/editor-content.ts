import type {
  InvitationContent,
  InvitationSection,
} from "@/lib/invitations/editor-model";

export type InvitationEditableFieldKind =
  | "text"
  | "multiline"
  | "date-time"
  | "time"
  | "phone"
  | "url";

export type InvitationEditableField = {
  path: string;
  label: string;
  kind: InvitationEditableFieldKind;
  direct: boolean;
};

const direct = (
  path: string,
  label: string,
  kind: InvitationEditableFieldKind = "text",
): InvitationEditableField => ({ path, label, kind, direct: true });

const structured = (
  path: string,
  label: string,
  kind: InvitationEditableFieldKind,
): InvitationEditableField => ({ path, label, kind, direct: false });

/**
 * Canonical registry for every piece of user-owned copy shown by a section.
 * Paths are stable editor identifiers and also support nested repeater items.
 */
export function invitationEditableFields(
  section: InvitationSection,
): InvitationEditableField[] {
  const items = Array.isArray(section.content.items)
    ? section.content.items
    : [];
  const fields: InvitationEditableField[] = [];
  const add = (...entries: InvitationEditableField[]) => fields.push(...entries);

  if (section.type === "hero") {
    add(
      direct("eyebrow", "Supratitlu"),
      direct("names", "Numele sau titlul principal", "multiline"),
      direct("date", "Data afișată"),
      direct("venue", "Orașul sau locația"),
      direct("title", "Mesajul principal", "multiline"),
      direct("subtitle", "Introducerea", "multiline"),
      direct("buttonLabel", "Textul butonului RSVP"),
    );
  } else if (section.type === "story") {
    add(
      direct("title", "Titlu"),
      direct("body", "Poveste", "multiline"),
      direct("quote", "Citat sau încheiere", "multiline"),
    );
  } else if (section.type === "countdown") {
    add(
      direct("title", "Titlu"),
      structured("date", "Data și ora evenimentului", "date-time"),
    );
  } else if (section.type === "schedule") {
    add(direct("title", "Titlu"));
    items.forEach((_, index) =>
      add(
        structured(`items.${index}.time`, `Ora momentului ${index + 1}`, "time"),
        direct(`items.${index}.title`, `Momentul ${index + 1}`),
        direct(`items.${index}.detail`, `Detaliul momentului ${index + 1}`),
      ),
    );
  } else if (section.type === "locations") {
    add(direct("title", "Titlu"));
    items.forEach((_, index) =>
      add(
        direct(`items.${index}.name`, `Numele locației ${index + 1}`),
        direct(`items.${index}.address`, `Adresa locației ${index + 1}`),
        structured(`items.${index}.url`, `Linkul locației ${index + 1}`, "url"),
      ),
    );
  } else if (section.type === "rsvp") {
    add(
      direct("title", "Titlu"),
      direct("body", "Mesaj", "multiline"),
      structured("deadline", "Termen de confirmare", "date-time"),
      direct("buttonLabel", "Textul butonului"),
    );
  } else if (section.type === "dress_code") {
    add(direct("title", "Stil vestimentar"), direct("body", "Indicații", "multiline"));
  } else if (section.type === "gallery") {
    add(direct("title", "Titlu"), direct("body", "Introducere", "multiline"));
    items.forEach((_, index) =>
      add(direct(`items.${index}.caption`, `Legenda imaginii ${index + 1}`)),
    );
  } else if (section.type === "accommodation") {
    add(direct("title", "Titlu"), direct("body", "Introducere", "multiline"));
    items.forEach((_, index) =>
      add(
        direct(`items.${index}.name`, `Cazarea ${index + 1}`),
        direct(`items.${index}.detail`, `Detaliile cazării ${index + 1}`),
        structured(`items.${index}.url`, `Linkul cazării ${index + 1}`, "url"),
      ),
    );
  } else if (section.type === "faq") {
    add(direct("title", "Titlu"));
    items.forEach((_, index) =>
      add(
        direct(`items.${index}.question`, `Întrebarea ${index + 1}`),
        direct(`items.${index}.answer`, `Răspunsul ${index + 1}`, "multiline"),
      ),
    );
  } else if (section.type === "contact") {
    add(
      direct("title", "Titlu"),
      direct("body", "Mesaj", "multiline"),
      direct("name", "Persoană de contact"),
      structured("phone", "Telefon", "phone"),
    );
  } else {
    const blockKind = String(section.content.blockKind ?? "");
    if (blockKind === "divider") {
      add(direct("ornament", "Ornament"), direct("label", "Mesaj scurt"));
    } else {
      if ("title" in section.content) add(direct("title", "Titlu"));
      if ("body" in section.content) add(direct("body", "Conținut", "multiline"));
      if ("caption" in section.content) add(direct("caption", "Legendă"));
      if ("buttonLabel" in section.content)
        add(direct("buttonLabel", "Textul butonului"));
      if ("url" in section.content)
        add(structured("url", "Link", "url"));
    }
  }

  return fields;
}

export function invitationEditableField(
  section: InvitationSection,
  path: string,
) {
  return invitationEditableFields(section).find((field) => field.path === path);
}

export function firstInvitationEditableField(section: InvitationSection) {
  const fields = invitationEditableFields(section);
  return fields.find((field) => field.direct) ?? fields[0] ?? null;
}

export function invitationContentValue(
  content: InvitationContent,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return current[Number(segment)];
    if (current && typeof current === "object")
      return (current as Record<string, unknown>)[segment];
    return undefined;
  }, content);
}

export function setInvitationContentValue(
  content: InvitationContent,
  path: string,
  value: unknown,
): InvitationContent {
  const segments = path.split(".");
  const root = structuredClone(content);
  let current: Record<string, unknown> | unknown[] = root;

  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (Array.isArray(current)) {
      const itemIndex = Number(segment);
      if (last) current[itemIndex] = value;
      else {
        const next = current[itemIndex];
        if (!next || typeof next !== "object")
          current[itemIndex] = /^\d+$/.test(segments[index + 1] ?? "") ? [] : {};
        current = current[itemIndex] as Record<string, unknown> | unknown[];
      }
      return;
    }

    if (last) current[segment] = value;
    else {
      const next = current[segment];
      if (!next || typeof next !== "object")
        current[segment] = /^\d+$/.test(segments[index + 1] ?? "") ? [] : {};
      current = current[segment] as Record<string, unknown> | unknown[];
    }
  });

  return root;
}
