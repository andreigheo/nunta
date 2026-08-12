import { invitationContainsStarterContent } from "@weddingos/contracts";

export type InvitationSectionType =
  | "hero"
  | "story"
  | "countdown"
  | "schedule"
  | "locations"
  | "rsvp"
  | "dress_code"
  | "gallery"
  | "transport"
  | "accommodation"
  | "faq"
  | "contact"
  | "registry"
  | "custom";

export type InvitationContent = Record<string, unknown>;

export type InvitationDevice = "desktop" | "tablet" | "mobile";

export type InvitationBlockKind =
  | "artwork"
  | "video"
  | "media_text"
  | "divider";

export type InvitationDecorationLayer = {
  id: string;
  kind: "monogram" | "shape" | "image";
  label: string;
  text?: string;
  mediaId?: string;
  url?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  color?: string;
  visibleOn: InvitationDevice[];
};

export type InvitationArtDirection = Record<
  InvitationDevice,
  {
    focalX: number;
    focalY: number;
    headingScale: number;
    hideDecorations: boolean;
  }
>;

export type InvitationExperienceSettings = {
  enabled: boolean;
  style: "split_panels";
  replay: "first_visit";
  panelColor: string;
  backgroundColor: string;
  accentColor: string;
  texture: "paper" | "linen" | "smooth";
  monogram: string | null;
  frontMessage: string | null;
  coverImageUrl: string | null;
  coverMediaId: string | null;
  durationMs: number;
};

export type InvitationSection = {
  id: string;
  type: InvitationSectionType;
  label: string;
  visible: boolean;
  content: InvitationContent;
  style: {
    align: "left" | "center" | "right";
    tone: "plain" | "soft" | "accent" | "dark" | "custom";
    backgroundMode: "solid" | "gradient" | "image";
    backgroundColor: string;
    textColor: string;
    gradientFrom: string;
    gradientTo: string;
    gradientAngle: number;
    padding: number;
  };
};

export type InvitationDesign = {
  template: "garden" | "editorial" | "minimal" | "classic";
  accent: string;
  background: string;
  surface: string;
  text: string;
  headingFont: "display" | "sans";
  palette: string[];
  spacing: "compact" | "comfortable" | "airy";
  radius: "none" | "soft" | "round";
  buttonStyle: "solid" | "outline" | "pill";
};

export type InvitationEditorSnapshot = {
  sections: InvitationSection[];
  design: InvitationDesign;
  experience: InvitationExperienceSettings;
};

export type InvitationDocumentSection = {
  id: string;
  type: string;
  title?: string;
  visible: boolean;
  content?: Record<string, unknown>;
};

export const sectionCatalog: Array<{
  type: InvitationSectionType;
  label: string;
  description: string;
}> = [
  { type: "hero", label: "Copertă", description: "Nume, dată, loc și imagine principală" },
  { type: "story", label: "Povestea noastră", description: "Text editorial și citat" },
  { type: "countdown", label: "Numărătoare inversă", description: "Timp rămas până la eveniment" },
  { type: "schedule", label: "Program", description: "Momentele zilei, în ordine" },
  { type: "locations", label: "Locații", description: "Adrese și linkuri către hartă" },
  { type: "rsvp", label: "Confirmare RSVP", description: "Îndemn și termen de confirmare" },
  { type: "dress_code", label: "Dress code", description: "Stil, explicații și paletă" },
  { type: "gallery", label: "Galerie", description: "Fotografii și momente cu poveste" },
  { type: "transport", label: "Transport", description: "Plecări, traseu și indicații" },
  { type: "accommodation", label: "Cazare", description: "Recomandări pentru invitați" },
  { type: "faq", label: "Întrebări frecvente", description: "Răspunsuri la detaliile importante" },
  { type: "contact", label: "Contact", description: "Persoane de legătură și telefon" },
  { type: "registry", label: "Cadouri", description: "Mesaj despre daruri sau listă" },
  { type: "custom", label: "Secțiune liberă", description: "Titlu, text și acțiune proprie" },
];

export const advancedBlockCatalog: Array<{
  blockKind: InvitationBlockKind;
  label: string;
  description: string;
}> = [
  {
    blockKind: "media_text",
    label: "Imagine + text",
    description: "Compoziție editorială cu media și text alăturate",
  },
  {
    blockKind: "artwork",
    label: "Art card",
    description: "O lucrare vizuală proprie, afișată fără compromisuri",
  },
  {
    blockKind: "video",
    label: "Video",
    description: "Clip cu poster, titlu și subtitrare opțională",
  },
  {
    blockKind: "divider",
    label: "Separator",
    description: "Pauză vizuală cu ornament sau mesaj scurt",
  },
];

export const defaultInvitationExperience: InvitationExperienceSettings = {
  enabled: false,
  style: "split_panels",
  replay: "first_visit",
  panelColor: "#3B183F",
  backgroundColor: "#F7F7F3",
  accentColor: "#F06449",
  texture: "paper",
  monogram: "A & M",
  frontMessage: "O invitație pentru voi",
  coverImageUrl: null,
  coverMediaId: null,
  durationMs: 1400,
};

export const defaultArtDirection: InvitationArtDirection = {
  desktop: {
    focalX: 50,
    focalY: 50,
    headingScale: 100,
    hideDecorations: false,
  },
  tablet: {
    focalX: 50,
    focalY: 50,
    headingScale: 92,
    hideDecorations: false,
  },
  mobile: {
    focalX: 50,
    focalY: 50,
    headingScale: 80,
    hideDecorations: false,
  },
};

export const invitationTemplates: Array<{
  id: InvitationDesign["template"];
  name: string;
  description: string;
  design: InvitationDesign;
}> = [
  {
    id: "garden",
    name: "Grădină de seară",
    description: "Cald, organic și editorial",
    design: {
      template: "garden",
      accent: "#21483A",
      background: "#F4F0E8",
      surface: "#FFFCF7",
      text: "#20211F",
      headingFont: "display",
      palette: ["#21483A", "#B4774B", "#91A899", "#F4F0E8", "#FFFCF7", "#20211F"],
      spacing: "comfortable",
      radius: "soft",
      buttonStyle: "solid",
    },
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Contrast puternic și compoziție curată",
    design: {
      template: "editorial",
      accent: "#20211F",
      background: "#F1EEE8",
      surface: "#FFFEFB",
      text: "#20211F",
      headingFont: "display",
      palette: ["#20211F", "#6B6258", "#D8D1C7", "#F1EEE8", "#FFFEFB", "#9A5F3B"],
      spacing: "airy",
      radius: "none",
      buttonStyle: "outline",
    },
  },
  {
    id: "minimal",
    name: "Minimal contemporan",
    description: "Aerisit, discret și modern",
    design: {
      template: "minimal",
      accent: "#557565",
      background: "#EEF2ED",
      surface: "#FFFFFF",
      text: "#1D2923",
      headingFont: "sans",
      palette: ["#557565", "#8FA89A", "#CBD8D0", "#EEF2ED", "#FFFFFF", "#1D2923"],
      spacing: "comfortable",
      radius: "round",
      buttonStyle: "pill",
    },
  },
  {
    id: "classic",
    name: "Clasic cald",
    description: "Ceremonial, elegant și atemporal",
    design: {
      template: "classic",
      accent: "#9A5F3B",
      background: "#F6EFE8",
      surface: "#FFFCF8",
      text: "#33251E",
      headingFont: "display",
      palette: ["#9A5F3B", "#C18B68", "#DFC8B7", "#F6EFE8", "#FFFCF8", "#33251E"],
      spacing: "airy",
      radius: "soft",
      buttonStyle: "solid",
    },
  },
];

export function createDefaultSection(
  type: InvitationSectionType,
  id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
): InvitationSection {
  const entry = sectionCatalog.find((item) => item.type === type);
  const defaults: Record<InvitationSectionType, InvitationContent> = {
    hero: {
      eyebrow: "Ne căsătorim",
      names: "Ana & Mihai",
      date: "12 septembrie 2027",
      venue: "Conacul Ambient · Cristian",
      title: "Vino să sărbătorim împreună",
      subtitle: "O zi despre noi, alături de oamenii care ne sunt aproape.",
      buttonLabel: "Confirmă prezența",
      coverImage: "",
      mediaId: "",
      mediaName: "",
      layout: "immersive",
      heroHeight: 620,
      focalX: 50,
      focalY: 50,
      overlayColor: "#14251D",
      overlayOpacity: 46,
      contentY: "bottom",
      headingSize: 76,
      artDirection: defaultArtDirection,
      decorations: [],
    },
    story: {
      title: "Povestea noastră",
      body: "Ne-am cunoscut într-o seară de septembrie, iar de atunci fiecare drum important l-am făcut împreună.",
      quote: "Acum vrem să vă avem aproape la începutul următorului capitol.",
    },
    countdown: {
      title: "Până spunem «da»",
      date: "2027-09-12T16:00",
    },
    schedule: {
      title: "Programul zilei",
      items: [
        { time: "16:00", title: "Ceremonia", detail: "Biserica Sf. Nicolae" },
        { time: "17:30", title: "Cocktail în grădină", detail: "Conacul Ambient" },
        { time: "18:30", title: "Petrecerea", detail: "Cină, muzică și dans" },
      ],
    },
    locations: {
      title: "Unde ne întâlnim",
      items: [
        { name: "Ceremonia", address: "Biserica Sf. Nicolae, Brașov", url: "" },
        { name: "Petrecerea", address: "Conacul Ambient, Cristian", url: "" },
      ],
    },
    rsvp: {
      title: "Vei fi alături de noi?",
      body: "Răspunsul tău ne ajută să pregătim fiecare detaliu.",
      deadline: "15 iunie 2027",
      buttonLabel: "Confirmă prezența",
    },
    dress_code: {
      title: "Garden formal",
      body: "Ținute elegante și confortabile, potrivite unei seri în grădină.",
      colors: ["#21483A", "#91A899", "#E9E1D5", "#B4774B", "#20211F"],
    },
    gallery: {
      title: "Momentele noastre",
      body: "Câteva cadre din povestea care ne-a adus aici.",
      items: [],
      layout: "mosaic",
    },
    transport: {
      title: "Ajungi fără griji",
      body: "Asigurăm transport dus-întors din centrul Brașovului.",
      details: "Plecarea: 17:00 · Piața Sfatului. Întoarceri: 01:00 și 03:00.",
    },
    accommodation: {
      title: "Rămâi peste noapte",
      body: "Am pregătit câteva recomandări aproape de locație.",
      items: [
        { name: "Ambient Guest House", detail: "La 3 minute · cod SARBATO", url: "" },
      ],
    },
    faq: {
      title: "Bine de știut",
      items: [
        { question: "Pot veni cu copiii?", answer: "Da. Spune-ne în formularul RSVP câți copii vă însoțesc." },
        { question: "Există parcare?", answer: "Da, parcarea locației este gratuită și semnalizată." },
      ],
    },
    contact: {
      title: "Ai nevoie de ajutor?",
      body: "Pentru întrebări în ziua evenimentului, scrie sau sună persoana noastră de contact.",
      name: "Andreea",
      phone: "+40 700 000 000",
    },
    registry: {
      title: "Cel mai frumos dar este prezența voastră",
      body: "Dacă vă doriți totuși să contribuiți la aventura noastră, găsiți aici câteva idei.",
      buttonLabel: "Vezi lista",
      url: "",
    },
    custom: {
      title: "Un detaliu important",
      body: "Folosește această secțiune pentru orice mesaj care face invitația voastră unică.",
      buttonLabel: "",
      url: "",
    },
  };
  return {
    id,
    type,
    label: entry?.label ?? "Secțiune",
    visible: true,
    content: structuredClone(defaults[type]),
    style: {
      align: type === "schedule" || type === "locations" ? "left" : "center",
      tone: "plain",
      backgroundMode: "solid",
      backgroundColor: "",
      textColor: "",
      gradientFrom: "#F6F1E8",
      gradientTo: "#E6EFE9",
      gradientAngle: 135,
      padding: type === "hero" ? 64 : 48,
    },
  };
}

export function createAdvancedSection(
  blockKind: InvitationBlockKind,
  id = `section-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
): InvitationSection {
  const entry = advancedBlockCatalog.find((item) => item.blockKind === blockKind);
  const defaults: Record<InvitationBlockKind, InvitationContent> = {
    artwork: {
      blockKind,
      title: "Un detaliu doar al nostru",
      mediaId: "",
      url: "",
      alt: "",
      caption: "",
      decorations: [],
    },
    video: {
      blockKind,
      title: "Povestea noastră, în mișcare",
      url: "",
      posterMediaId: "",
      posterUrl: "",
      caption: "",
      decorations: [],
    },
    media_text: {
      blockKind,
      title: "Un moment important",
      body: "Adaugă fotografia și povestea care merită să rămână împreună.",
      mediaId: "",
      url: "",
      alt: "",
      mediaPosition: "left",
      decorations: [],
    },
    divider: {
      blockKind,
      ornament: "✦",
      label: "Ne vedem curând",
      decorations: [],
    },
  };
  const section = createDefaultSection("custom", id);
  return {
    ...section,
    label: entry?.label ?? "Bloc creativ",
    content: defaults[blockKind],
    style: {
      ...section.style,
      padding: blockKind === "divider" ? 28 : 48,
    },
  };
}

export function createInitialSnapshot(): InvitationEditorSnapshot {
  return {
    design: {
      ...invitationTemplates[0].design,
      palette: [...invitationTemplates[0].design.palette],
    },
    experience: { ...defaultInvitationExperience },
    sections: [
      createDefaultSection("hero", "hero"),
      createDefaultSection("story", "story"),
      createDefaultSection("countdown", "countdown"),
      createDefaultSection("schedule", "schedule"),
      createDefaultSection("locations", "locations"),
      createDefaultSection("rsvp", "rsvp"),
      createDefaultSection("dress_code", "dress-code"),
      createDefaultSection("faq", "faq"),
    ],
  };
}

export function snapshotFromPersisted(
  sections: InvitationDocumentSection[] | undefined,
  settings:
    | {
        colors?: Record<string, string>;
        typography?: Record<string, string>;
        spacing?: string;
        template?: string;
        [key: string]: unknown;
      }
    | undefined,
): InvitationEditorSnapshot {
  const initial = createInitialSnapshot();
  if (!sections?.length) return initial;
  const template =
    invitationTemplates.find((item) => item.id === settings?.template) ??
    invitationTemplates[0];
  const storedStyle =
    settings && typeof settings.editorStyle === "object" && settings.editorStyle
      ? (settings.editorStyle as Partial<InvitationDesign>)
      : {};
  const design: InvitationDesign = {
    ...template.design,
    ...storedStyle,
    template: template.id,
    accent: safeColor(settings?.colors?.accent, storedStyle.accent ?? template.design.accent),
    background: safeColor(settings?.colors?.background, storedStyle.background ?? template.design.background),
    surface: safeColor(settings?.colors?.surface, storedStyle.surface ?? template.design.surface),
    text: safeColor(settings?.colors?.text, storedStyle.text ?? template.design.text),
    headingFont:
      settings?.typography?.heading === "sans" || storedStyle.headingFont === "sans"
        ? "sans"
        : "display",
    spacing:
      settings?.spacing === "compact" || settings?.spacing === "airy"
        ? settings.spacing
        : "comfortable",
  };
  const experience = invitationExperienceFromSettings(settings?.experience);
  return {
    design,
    experience,
    sections: sections.map((item, index) => {
      const storedEditorType =
        typeof item.content?.editorType === "string" ? item.content.editorType : "";
      const type =
        item.type === "custom" &&
        (storedEditorType === "gallery" || item.title?.toLocaleLowerCase("ro-RO").includes("galerie"))
          ? "gallery"
          : isSectionType(item.type)
            ? item.type
            : "custom";
      const base = createDefaultSection(type, item.id || `section-${index + 1}`);
      const stored = item.content ?? {};
      const storedSectionStyle =
        typeof stored.sectionStyle === "object" && stored.sectionStyle
          ? (stored.sectionStyle as Partial<InvitationSection["style"]>)
          : {};
      const content = { ...base.content, ...stored };
      delete content.sectionStyle;
      delete content.editorType;
      return {
        ...base,
        label: item.title || base.label,
        visible: item.visible,
        content,
        style: {
          ...base.style,
          ...storedSectionStyle,
          align:
            storedSectionStyle.align === "left" ||
            storedSectionStyle.align === "right"
              ? storedSectionStyle.align
              : "center",
          tone: ["plain", "soft", "accent", "dark", "custom"].includes(
            storedSectionStyle.tone ?? "",
          )
            ? (storedSectionStyle.tone as InvitationSection["style"]["tone"])
            : "plain",
          backgroundMode: ["solid", "gradient", "image"].includes(
            storedSectionStyle.backgroundMode ?? "",
          )
            ? (storedSectionStyle.backgroundMode as InvitationSection["style"]["backgroundMode"])
            : "solid",
        },
      };
    }),
  };
}

export function serializeSnapshot(snapshot: InvitationEditorSnapshot) {
  return {
    document: {
      sections: snapshot.sections.map((section) => ({
        id: section.id,
        type: section.type === "gallery" ? "custom" : section.type,
        title: section.label,
        visible: section.visible,
        content: {
          ...section.content,
          sectionStyle: section.style,
          ...(section.type === "gallery" ? { editorType: "gallery" } : {}),
        },
      })),
    },
    settings: {
      colors: {
        accent: snapshot.design.accent,
        background: snapshot.design.background,
        surface: snapshot.design.surface,
        text: snapshot.design.text,
      },
      typography: { heading: snapshot.design.headingFont },
      spacing: snapshot.design.spacing,
      template: snapshot.design.template,
      editorStyle: snapshot.design,
      experience: snapshot.experience,
    },
  };
}

export type InvitationVariantOverrides = {
  document?: {
    sections?: Array<{
      id: string;
      title?: string | null;
      visible?: boolean;
      content?: Record<string, unknown>;
    }>;
  };
  settings?: Record<string, unknown>;
};

export function applyInvitationVariant(
  base: InvitationEditorSnapshot,
  overrides: InvitationVariantOverrides | null | undefined,
): InvitationEditorSnapshot {
  if (!overrides) return structuredClone(base);
  const serialized = serializeSnapshot(base);
  const sectionOverrides = new Map(
    (overrides.document?.sections ?? []).map((section) => [section.id, section]),
  );
  const sections = serialized.document.sections.map((section) => {
    const override = sectionOverrides.get(section.id);
    if (!override) return section;
    return {
      ...section,
      ...(typeof override.title === "string" ? { title: override.title } : {}),
      ...(typeof override.visible === "boolean"
        ? { visible: override.visible }
        : {}),
      content: { ...section.content, ...(override.content ?? {}) },
    };
  });
  return snapshotFromPersisted(sections, {
    ...serialized.settings,
    ...(overrides.settings ?? {}),
  });
}

export function invitationVariantOverrides(
  base: InvitationEditorSnapshot,
  variant: InvitationEditorSnapshot,
): InvitationVariantOverrides {
  const baseStructure = base.sections.map((section) => section.id);
  const variantStructure = variant.sections.map((section) => section.id);
  if (
    baseStructure.length !== variantStructure.length ||
    baseStructure.some((id, index) => id !== variantStructure[index])
  )
    throw new Error(
      "Structura unei variante trebuie modificată în invitația de bază.",
    );
  const baseSerialized = serializeSnapshot(base);
  const variantSerialized = serializeSnapshot(variant);
  const baseSections = new Map(
    baseSerialized.document.sections.map((section) => [section.id, section]),
  );
  const sections = variantSerialized.document.sections.flatMap((section) => {
    const baseSection = baseSections.get(section.id);
    if (!baseSection) return [];
    const content = changedRecord(baseSection.content, section.content);
    const override = {
      id: section.id,
      ...(section.title !== baseSection.title ? { title: section.title } : {}),
      ...(section.visible !== baseSection.visible
        ? { visible: section.visible }
        : {}),
      ...(Object.keys(content).length ? { content } : {}),
    };
    return Object.keys(override).length > 1 ? [override] : [];
  });
  const settings = changedRecord(
    baseSerialized.settings,
    variantSerialized.settings,
  );
  return {
    ...(sections.length ? { document: { sections } } : {}),
    ...(Object.keys(settings).length ? { settings } : {}),
  };
}

export function invitationReadiness(snapshot: InvitationEditorSnapshot) {
  const visible = snapshot.sections.filter((section) => section.visible);
  const hero = visible.find((section) => section.type === "hero");
  const rsvp = visible.find((section) => section.type === "rsvp");
  const schedule = visible.find((section) => section.type === "schedule");
  const locations = visible.find((section) => section.type === "locations");
  const checks = [
    { label: "Numele cuplului", done: Boolean(text(hero?.content.names)) },
    { label: "Data evenimentului", done: Boolean(text(hero?.content.date)) },
    { label: "Programul zilei", done: array(schedule?.content.items).length > 0 },
    { label: "Cel puțin o locație", done: array(locations?.content.items).length > 0 },
    { label: "Confirmare RSVP", done: Boolean(rsvp && text(rsvp.content.deadline)) },
    {
      label: "Exemplele demonstrative au fost înlocuite",
      done: !invitationContainsStarterContent({
        sections: visible.map((section) => section.content),
      }),
    },
  ];
  return {
    checks,
    completed: checks.filter((check) => check.done).length,
    total: checks.length,
  };
}

export function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function array(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isSectionType(value: string): value is InvitationSectionType {
  return sectionCatalog.some((entry) => entry.type === value);
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function invitationExperienceFromSettings(
  value: unknown,
): InvitationExperienceSettings {
  if (!value || typeof value !== "object")
    return { ...defaultInvitationExperience };
  const stored = value as Record<string, unknown>;
  return {
    enabled:
      typeof stored.enabled === "boolean"
        ? stored.enabled
        : defaultInvitationExperience.enabled,
    style: "split_panels",
    replay: "first_visit",
    panelColor: safeColor(
      stored.panelColor,
      defaultInvitationExperience.panelColor,
    ),
    backgroundColor: safeColor(
      stored.backgroundColor,
      defaultInvitationExperience.backgroundColor,
    ),
    accentColor: safeColor(
      stored.accentColor,
      defaultInvitationExperience.accentColor,
    ),
    texture:
      stored.texture === "linen" || stored.texture === "smooth"
        ? stored.texture
        : "paper",
    monogram:
      stored.monogram === null || typeof stored.monogram === "string"
        ? stored.monogram
        : defaultInvitationExperience.monogram,
    frontMessage:
      stored.frontMessage === null || typeof stored.frontMessage === "string"
        ? stored.frontMessage
        : defaultInvitationExperience.frontMessage,
    coverImageUrl:
      stored.coverImageUrl === null || typeof stored.coverImageUrl === "string"
        ? stored.coverImageUrl
        : defaultInvitationExperience.coverImageUrl,
    coverMediaId:
      stored.coverMediaId === null || typeof stored.coverMediaId === "string"
        ? stored.coverMediaId
        : defaultInvitationExperience.coverMediaId,
    durationMs:
      typeof stored.durationMs === "number"
        ? Math.max(400, Math.min(2000, Math.round(stored.durationMs)))
        : defaultInvitationExperience.durationMs,
  };
}

function changedRecord(
  base: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key]),
    ),
  );
}
