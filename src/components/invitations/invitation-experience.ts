export type CinematicRevealSettings = {
  enabled: boolean;
  style: "split_panels" | "envelope";
  persistenceKey: string;
  recipientLabel: string;
  message: string;
  monogram: string;
  panelColor: string;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
  accentTextColor: string;
  coverMediaId: string;
  coverImageUrl: string;
  texture: "paper" | "linen" | "smooth";
  durationMs: number;
};

export function shouldRecordDirectOpenOnBootstrap(
  experienceEnabled: boolean,
  shouldPlayReveal: boolean,
) {
  return !experienceEnabled && shouldPlayReveal;
}

export function shouldAutoRevealInvitation(
  experienceEnabled: boolean,
  serverShouldPlayReveal: boolean,
) {
  return experienceEnabled ? undefined : serverShouldPlayReveal;
}

export function invitationExperienceFromResource(
  invitation: Record<string, unknown>,
  recipientName = "",
  persistenceSeed = "",
): CinematicRevealSettings {
  const settings = record(invitation.settings);
  const experience = firstRecord(
    invitation.experience,
    settings.experience,
    settings.invitationExperience,
  );
  const cover = firstRecord(experience.cover, experience.aperture);
  const enabled =
    experience.enabled === true ||
    experience.mode === "cinematic" ||
    experience.mode === "aperture";
  const resourceId = firstText(
    invitation.id,
    invitation.publicationId,
    invitation.slug,
  );
  const version = finiteInteger(
    invitation.version,
    settings.version,
    invitation.publishedVersion,
  );
  const panelColor = safeColor(
    firstText(cover.panelColor, experience.panelColor),
    "#3B183F",
  );
  const accentColor = safeColor(
    firstText(cover.accentColor, experience.accentColor),
    "#F06449",
  );
  const requestedTextColor = firstText(
    cover.textColor,
    experience.textColor,
  );

  return {
    enabled,
    style: experience.style === "envelope" ? "envelope" : "split_panels",
    persistenceKey: resourceId
      ? `sarbato:invitation-reveal:${resourceId}:${version}`
      : `sarbato:invitation-reveal:session:${fingerprint(persistenceSeed)}:${version}`,
    recipientLabel: recipientName.trim()
      ? `Pentru ${recipientName.trim()}`
      : firstText(cover.recipientLabel, experience.recipientLabel) ||
        "Invitație privată",
    message:
      firstText(
        cover.frontMessage,
        experience.frontMessage,
        cover.message,
        experience.message,
      ) || "O invitație pentru tine",
    monogram: firstText(cover.monogram, experience.monogram),
    panelColor,
    backgroundColor: safeColor(
      firstText(
        cover.backgroundColor,
        experience.backgroundColor,
        cover.panelSecondaryColor,
        experience.panelSecondaryColor,
      ),
      "#F7F7F3",
    ),
    accentColor,
    textColor: ensureReadableTextColor(panelColor, requestedTextColor),
    accentTextColor: readableTextColor(accentColor),
    coverMediaId: firstText(cover.coverMediaId, experience.coverMediaId),
    coverImageUrl: safeUrl(
      firstText(cover.coverImageUrl, experience.coverImageUrl),
    ),
    texture:
      experience.texture === "linen" || experience.texture === "smooth"
        ? experience.texture
        : "paper",
    durationMs: clampNumber(experience.durationMs, 700, 3200, 1800),
  };
}

function firstRecord(...values: unknown[]) {
  return values.map(record).find((value) => Object.keys(value).length) ?? {};
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstText(...values: unknown[]) {
  return (
    values.find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )?.trim() ?? ""
  );
}

function finiteInteger(...values: unknown[]) {
  const found = values
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .find(Number.isFinite);
  return found === undefined ? 1 : Math.max(1, Math.trunc(found));
}

function safeColor(value: string, fallback: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.round(parsed)))
    : fallback;
}

export function ensureReadableTextColor(
  background: string,
  requested = "",
  minimumRatio = 4.5,
) {
  if (
    isHexColor(requested) &&
    contrastRatio(requested, background) >= minimumRatio
  )
    return requested;
  return readableTextColor(background, minimumRatio);
}

export function readableTextColor(background: string, minimumRatio = 4.5) {
  const preferred = ["#19151D", "#FFF9FF"]
    .map((color) => ({ color, ratio: contrastRatio(color, background) }))
    .sort((left, right) => right.ratio - left.ratio);
  if ((preferred[0]?.ratio ?? 0) >= minimumRatio)
    return preferred[0]?.color ?? "#19151D";

  const fallback = ["#000000", "#FFFFFF"]
    .map((color) => ({ color, ratio: contrastRatio(color, background) }))
    .sort((left, right) => right.ratio - left.ratio);
  return fallback[0]?.color ?? "#000000";
}

export function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string) {
  const safe = isHexColor(color) ? color : "#000000";
  return [1, 3, 5]
    .map((index) => Number.parseInt(safe.slice(index, index + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (total, channel, index) =>
        total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
      0,
    );
}

function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function fingerprint(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
