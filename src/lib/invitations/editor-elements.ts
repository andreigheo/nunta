import type {
  InvitationContent,
  InvitationDevice,
  InvitationTextElementStyle,
} from "./editor-model";

export type InvitationTextStyleScope = "all" | InvitationDevice;

export function invitationTextStyles(content: InvitationContent) {
  return content.textStyles && typeof content.textStyles === "object"
    ? (content.textStyles as Record<string, unknown>)
    : {};
}

export function invitationTextStyleAt(
  content: InvitationContent,
  key: string,
  scope: InvitationTextStyleScope,
): InvitationTextElementStyle {
  const entry = invitationTextStyles(content)[key];
  if (!entry || typeof entry !== "object") return {};
  const value = (entry as Record<string, unknown>)[scope];
  return value && typeof value === "object"
    ? (value as InvitationTextElementStyle)
    : {};
}

export function resolveInvitationTextStyle(
  content: InvitationContent,
  key: string,
  device: InvitationDevice,
): InvitationTextElementStyle {
  return {
    ...invitationTextStyleAt(content, key, "all"),
    ...invitationTextStyleAt(content, key, device),
  };
}

export function updateInvitationTextStyle(
  content: InvitationContent,
  key: string,
  scope: InvitationTextStyleScope,
  update: Partial<InvitationTextElementStyle>,
) {
  const styles = structuredClone(invitationTextStyles(content));
  const entry =
    styles[key] && typeof styles[key] === "object"
      ? (styles[key] as Record<string, unknown>)
      : {};
  const current =
    entry[scope] && typeof entry[scope] === "object"
      ? (entry[scope] as InvitationTextElementStyle)
      : {};
  entry[scope] = { ...current, ...update };
  styles[key] = entry;
  return styles;
}

export function resetInvitationTextStyle(
  content: InvitationContent,
  key: string,
  scope: InvitationTextStyleScope,
  property?: keyof InvitationTextElementStyle,
) {
  const styles = structuredClone(invitationTextStyles(content));
  const entry =
    styles[key] && typeof styles[key] === "object"
      ? (styles[key] as Record<string, unknown>)
      : {};
  if (!property) delete entry[scope];
  else if (entry[scope] && typeof entry[scope] === "object") {
    const scoped = { ...(entry[scope] as InvitationTextElementStyle) };
    delete scoped[property];
    if (Object.keys(scoped).length) entry[scope] = scoped;
    else delete entry[scope];
  }
  if (Object.keys(entry).length) styles[key] = entry;
  else delete styles[key];
  return styles;
}

export function invitationTextHasOverride(
  content: InvitationContent,
  key: string,
  device: InvitationDevice,
) {
  return Object.keys(invitationTextStyleAt(content, key, device)).length > 0;
}
