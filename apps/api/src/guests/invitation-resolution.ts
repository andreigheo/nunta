export function resolvedInvitationContainsMedia(
  baseDocument: unknown,
  baseSettings: unknown,
  overrides: unknown,
  objectId: string,
) {
  return invitationMediaReferences(baseDocument, baseSettings, overrides).has(
    objectId,
  );
}

export function invitationMediaReferences(
  baseDocument: unknown,
  baseSettings: unknown,
  overrides?: unknown,
) {
  const resolved = resolveInvitationVariant(
    baseDocument,
    baseSettings,
    overrides,
  );
  const references = new Set<string>();
  const settings = object(resolved.settings);
  for (const experienceValue of [
    settings.experience,
    settings.invitationExperience,
  ]) {
    const experience = object(experienceValue);
    const enabled =
      experience.enabled === true ||
      experience.mode === "cinematic" ||
      experience.mode === "aperture";
    if (!enabled) continue;
    addReference(references, experience.coverMediaId);
    addReference(references, object(experience.cover).coverMediaId);
    addReference(references, object(experience.aperture).coverMediaId);
  }

  const sections = Array.isArray(resolved.document.sections)
    ? resolved.document.sections
    : [];
  for (const item of sections) {
    const section = object(item);
    if (section.visible === false) continue;
    const content = object(section.content);
    const type = text(section.type);
    const editorType = text(content.editorType);
    const blockKind = text(content.blockKind);
    const sectionStyle = object(content.sectionStyle);

    if (sectionStyle.backgroundMode === "image") {
      addReference(references, content.backgroundMediaId);
      addReference(references, content.mediaId);
    }
    if (type === "hero") addReference(references, content.mediaId);
    if (type === "gallery" || (type === "custom" && editorType === "gallery"))
      for (const galleryItem of array(content.items))
        addReference(references, galleryItem.mediaId);
    if (
      type === "custom" &&
      (blockKind === "artwork" || blockKind === "media_text")
    )
      addReference(references, content.mediaId);
    if (type === "custom" && blockKind === "video" && isHttpUrl(content.url))
      addReference(references, content.posterMediaId);
    const artDirection = object(content.artDirection);
    for (const decoration of array(content.decorations)) {
      const requestedDevices = stringArray(decoration.visibleOn);
      const devices = requestedDevices.length
        ? requestedDevices
        : ["desktop", "tablet", "mobile"];
      const rendered = devices.some(
        (device) =>
          ["desktop", "tablet", "mobile"].includes(device) &&
          object(artDirection[device]).hideDecorations !== true,
      );
      if (rendered && text(decoration.kind) === "image")
        addReference(references, decoration.mediaId);
    }
  }
  return references;
}

export function visibleInvitationDocument(value: unknown) {
  const document = cloneObject(value);
  if (Array.isArray(document.sections))
    document.sections = document.sections.filter(
      (section) => object(section).visible !== false,
    );
  return document;
}

export function resolveInvitationVariant(
  baseDocument: unknown,
  baseSettings: unknown,
  overrides: unknown,
) {
  const document = cloneObject(baseDocument);
  const settings = cloneObject(baseSettings);
  const override = object(overrides);
  const documentOverride = object(override.document);
  if (
    Array.isArray(documentOverride.sections) &&
    Array.isArray(document.sections)
  ) {
    const byId = new Map(
      documentOverride.sections.map((item) => {
        const record = object(item);
        return [String(record.id ?? ""), record] as const;
      }),
    );
    document.sections = document.sections.map((item) => {
      const section = cloneObject(item);
      const sectionOverride = byId.get(String(section.id ?? ""));
      if (!sectionOverride) return section;
      return {
        ...section,
        ...(sectionOverride.title === undefined
          ? {}
          : { title: sectionOverride.title }),
        ...(sectionOverride.visible === undefined
          ? {}
          : { visible: sectionOverride.visible }),
        ...(sectionOverride.content === undefined
          ? {}
          : {
              content: deepMerge(
                object(section.content),
                object(sectionOverride.content),
              ),
            }),
      };
    });
  }
  return {
    document,
    settings: deepMerge(settings, object(override.settings)),
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addReference(references: Set<string>, value: unknown) {
  const reference = text(value);
  if (reference) references.add(reference);
}

function isHttpUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function cloneObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {};
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = cloneObject(base);
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      current &&
      value &&
      typeof current === "object" &&
      typeof value === "object" &&
      !Array.isArray(current) &&
      !Array.isArray(value)
        ? deepMerge(object(current), object(value))
        : structuredClone(value);
  }
  return result;
}
