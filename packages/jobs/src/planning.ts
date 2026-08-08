import { createHash } from "node:crypto";

export type PlanGenerationInput = {
  workspaceId: string;
  onboardingDraftId: string;
  onboardingVersion: number;
  timezone: string;
  couple: Record<string, unknown>;
  dateEvents: Record<string, unknown>;
  location: Record<string, unknown>;
  guests: Record<string, unknown>;
  budget: Record<string, unknown>;
  style: Record<string, unknown>;
  existingProgress: Record<string, unknown>;
  planningPreferences: Record<string, unknown>;
};

export type GeneratedPlanItem = {
  key: string;
  parentKey: string | null;
  type: "phase" | "milestone" | "task";
  title: string;
  description: string;
  category: string;
  priority: "low" | "medium" | "high" | "urgent" | null;
  relativeStartOffsetDays: number | null;
  relativeDueOffsetDays: number | null;
  absoluteStartAt: string | null;
  absoluteDueAt: string | null;
  estimatedEffortMinutes: number | null;
  suggestedOwnerType: string | null;
  required: boolean;
  included: boolean;
  position: number;
  metadata: Record<string, unknown>;
};

export type PlanGenerationOutput = {
  title: string;
  summary: string;
  assumptions: string[];
  warnings: string[];
  coverage: PlanCoverageResult;
  items: GeneratedPlanItem[];
  generatorType: "deterministic" | "ai_enriched" | "fallback";
  provider: string;
  model: string | null;
  rulesVersion: string;
  fallbackUsed: boolean;
};

export interface PlanGenerationProvider {
  generatePlan(input: PlanGenerationInput): Promise<PlanGenerationOutput>;
}

export const PLANNING_RULES_VERSION = "slice-2b.v1";

export const minimumCoverageCategories = [
  "budget",
  "venue",
  "civil_ceremony",
  "religious_ceremony",
  "reception",
  "guest_list",
  "vendors",
  "photo_video",
  "entertainment",
  "food_drinks",
  "decor_flowers",
  "invitations",
  "rsvp",
  "seating",
  "attire",
  "rings",
  "transport",
  "accommodation",
  "logistics",
  "documents",
  "payments",
  "wedding_day",
  "contingency",
  "post_wedding",
] as const;

export type PlanCoverageResult = {
  required: string[];
  covered: string[];
  missing: string[];
};

type TaskTemplate = {
  key: string;
  title: string;
  description: string;
  category: (typeof minimumCoverageCategories)[number];
  dueOffset: number;
  priority: "low" | "medium" | "high" | "urgent";
  required?: boolean;
  effort?: number;
  owner?: string;
  progressKey?: string;
};

const phases = [
  {
    key: "foundation",
    title: "Fundația nunții",
    description:
      "Deciziile care stabilesc dimensiunea, data și cadrul organizării.",
    startOffset: -540,
    endOffset: -300,
  },
  {
    key: "suppliers",
    title: "Echipa și experiența",
    description: "Furnizorii principali și experiența invitaților.",
    startOffset: -420,
    endOffset: -150,
  },
  {
    key: "details",
    title: "Detalii și confirmări",
    description: "Invitații, ținute, logistică și confirmări.",
    startOffset: -240,
    endOffset: -30,
  },
  {
    key: "finale",
    title: "Pregătirea finală",
    description: "Coordonarea ultimelor săptămâni și planul zilei.",
    startOffset: -45,
    endOffset: 0,
  },
  {
    key: "after",
    title: "După nuntă",
    description: "Închiderea organizată a activităților de după eveniment.",
    startOffset: 1,
    endOffset: 30,
  },
] as const;

const taskTemplates: Record<(typeof phases)[number]["key"], TaskTemplate[]> = {
  foundation: [
    task(
      "budget",
      "Definește bugetul orientativ",
      "Stabilește plafonul și prioritățile, fără a crea încă cheltuieli.",
      -480,
      "urgent",
      true,
      90,
    ),
    task(
      "venue",
      "Confirmă locația",
      "Compară opțiunile și confirmă condițiile esențiale ale locației.",
      -420,
      "urgent",
      true,
      240,
      "couple",
      "venue",
    ),
    task(
      "civil_ceremony",
      "Planifică ceremonia civilă",
      "Verifică disponibilitatea, actele și intervalul ceremoniei civile.",
      -240,
      "high",
      true,
      90,
    ),
    task(
      "religious_ceremony",
      "Planifică ceremonia religioasă",
      "Confirmă locul, ora și cerințele ceremoniei religioase.",
      -210,
      "high",
      false,
      90,
    ),
    task(
      "reception",
      "Definește formatul recepției",
      "Clarifică programul, capacitatea și fluxul recepției.",
      -360,
      "high",
      true,
      120,
    ),
    task(
      "guest_list",
      "Construiește lista inițială de invitați",
      "Pregătește categoriile și estimarea listei; Guest CRM va fi conectat într-un slice ulterior.",
      -330,
      "high",
      true,
      180,
    ),
  ],
  suppliers: [
    task(
      "vendors",
      "Planifică furnizorii principali",
      "Stabilește criteriile și ordinea de selecție, fără a inventa furnizori sau contracte.",
      -330,
      "high",
      true,
      180,
    ),
    task(
      "photo_video",
      "Confirmă direcția foto-video",
      "Definește stilul, acoperirea și momentele importante.",
      -300,
      "high",
      true,
      120,
      "couple",
      "photoVideo",
    ),
    task(
      "entertainment",
      "Alege formatul de entertainment",
      "Clarifică muzica, momentele artistice și necesarul tehnic.",
      -270,
      "medium",
      true,
      120,
      "couple",
      "entertainment",
    ),
    task(
      "food_drinks",
      "Definește meniul și băuturile",
      "Pregătește cerințele alimentare și etapele de degustare.",
      -150,
      "high",
      true,
      150,
      "couple",
      "catering",
    ),
    task(
      "decor_flowers",
      "Definește decorul și florile",
      "Transformă stilul ales într-un brief coerent pentru spații și momente.",
      -180,
      "medium",
      true,
      150,
      "couple",
      "decor",
    ),
  ],
  details: [
    task(
      "invitations",
      "Pregătește invitațiile",
      "Validează mesajul, informațiile și calendarul de trimitere.",
      -150,
      "high",
      true,
      120,
    ),
    task(
      "rsvp",
      "Stabilește calendarul RSVP",
      "Definește termenul și regulile de urmărire; colectarea RSVP va fi implementată ulterior.",
      -75,
      "high",
      true,
      60,
    ),
    task(
      "seating",
      "Planifică așezarea invitaților",
      "Pregătește regulile și momentul începerii planului de mese.",
      -30,
      "medium",
      true,
      120,
    ),
    task(
      "attire",
      "Finalizează ținutele",
      "Planifică probele, ajustările și accesoriile.",
      -45,
      "high",
      true,
      180,
    ),
    task(
      "rings",
      "Confirmă verighetele",
      "Alege, comandă și programează verificarea finală a verighetelor.",
      -60,
      "high",
      true,
      90,
    ),
    task(
      "transport",
      "Planifică transportul",
      "Confirmă necesarul pentru cuplu și invitați pe baza estimărilor din onboarding.",
      -45,
      "medium",
      false,
      120,
    ),
    task(
      "accommodation",
      "Planifică cazarea",
      "Centralizează necesarul estimat și comunică opțiunile, fără rezervări fictive.",
      -60,
      "medium",
      false,
      120,
    ),
    task(
      "documents",
      "Verifică documentele necesare",
      "Construiește checklistul documentelor și al termenelor administrative.",
      -60,
      "high",
      true,
      90,
    ),
    task(
      "payments",
      "Pregătește calendarul obligațiilor de plată",
      "Notează termenele de verificat; nu crea plăți sau cheltuieli în acest slice.",
      -45,
      "high",
      true,
      90,
    ),
  ],
  finale: [
    task(
      "logistics",
      "Confirmă logistica finală",
      "Verifică accesul, livrările, contactele și responsabilitățile operaționale.",
      -14,
      "urgent",
      true,
      180,
    ),
    task(
      "wedding_day",
      "Construiește programul zilei",
      "Definește succesiunea momentelor și persoanele responsabile.",
      -21,
      "urgent",
      true,
      180,
    ),
    task(
      "contingency",
      "Validează planurile de rezervă",
      "Documentează alternative pentru vreme, întârzieri și furnizori indisponibili.",
      -14,
      "urgent",
      true,
      120,
    ),
  ],
  after: [
    task(
      "post_wedding",
      "Închide activitățile de după nuntă",
      "Planifică mulțumirile, returnările și verificările finale.",
      14,
      "low",
      true,
      90,
    ),
  ],
};

function task(
  category: TaskTemplate["category"],
  title: string,
  description: string,
  dueOffset: number,
  priority: TaskTemplate["priority"],
  required = true,
  effort = 60,
  owner = "couple",
  progressKey?: string,
): TaskTemplate {
  return {
    key: category,
    title,
    description,
    category,
    dueOffset,
    priority,
    required,
    effort,
    owner,
    ...(progressKey ? { progressKey } : {}),
  };
}

export class DeterministicPlanProvider implements PlanGenerationProvider {
  async generatePlan(
    input: PlanGenerationInput,
  ): Promise<PlanGenerationOutput> {
    const exactDate = weddingDate(input.dateEvents);
    const flexible =
      Boolean(input.dateEvents.flexibleDate) || exactDate === null;
    const progress = input.existingProgress;
    const priorities = stringList(
      input.style.priorities ?? input.planningPreferences.priorities,
    );
    const assumptions = buildAssumptions(input, exactDate);
    const warnings: string[] = [];
    const items: GeneratedPlanItem[] = [];
    let position = 0;

    for (const phase of phases) {
      items.push({
        key: `phase:${phase.key}`,
        parentKey: null,
        type: "phase",
        title: phase.title,
        description: phase.description,
        category: "planning",
        priority: null,
        relativeStartOffsetDays: phase.startOffset,
        relativeDueOffsetDays: phase.endOffset,
        absoluteStartAt: materializeDate(
          exactDate,
          phase.startOffset,
          flexible,
        ),
        absoluteDueAt: materializeDate(exactDate, phase.endOffset, flexible),
        estimatedEffortMinutes: null,
        suggestedOwnerType: null,
        required: true,
        included: true,
        position: position++,
        metadata: { phaseKey: phase.key },
      });

      if (phase.key !== "after") {
        items.push({
          key: `milestone:${phase.key}`,
          parentKey: `phase:${phase.key}`,
          type: "milestone",
          title: milestoneTitle(phase.key),
          description: `Punct de control pentru etapa „${phase.title}”.`,
          category: "planning",
          priority: null,
          relativeStartOffsetDays: null,
          relativeDueOffsetDays: phase.endOffset,
          absoluteStartAt: null,
          absoluteDueAt: materializeDate(exactDate, phase.endOffset, flexible),
          estimatedEffortMinutes: null,
          suggestedOwnerType: null,
          required: true,
          included: true,
          position: position++,
          metadata: { phaseKey: phase.key },
        });
      }

      for (const template of taskTemplates[phase.key]) {
        if (!isRelevant(template.category, input)) continue;
        const done = Boolean(
          progress[template.progressKey ?? template.category] ??
          progress[camelCase(template.category)],
        );
        const boosted = priorities.some((priority) =>
          `${template.category} ${template.title}`
            .toLowerCase()
            .includes(priority.toLowerCase()),
        );
        const title = done ? followUpTitle(template) : template.title;
        items.push({
          key: `task:${template.key}`,
          parentKey: `phase:${phase.key}`,
          type: "task",
          title,
          description: done
            ? `${template.description} Selecția a fost declarată ca realizată; verifică acum confirmările și pașii rămași.`
            : template.description,
          category: template.category,
          priority: boosted
            ? boostPriority(template.priority)
            : template.priority,
          relativeStartOffsetDays: template.dueOffset - 30,
          relativeDueOffsetDays: template.dueOffset,
          absoluteStartAt: materializeDate(
            exactDate,
            template.dueOffset - 30,
            flexible,
          ),
          absoluteDueAt: materializeDate(
            exactDate,
            template.dueOffset,
            flexible,
          ),
          estimatedEffortMinutes: template.effort ?? null,
          suggestedOwnerType: template.owner ?? "couple",
          required: template.required ?? true,
          included: true,
          position: position++,
          metadata: {
            alreadySelected: done,
            futureModuleLink: null,
            relativeLabel: flexible ? relativeLabel(template.dueOffset) : null,
            dependsOnKeys: taskDependencies(template.category).map(
              (category) => `task:${category}`,
            ),
          },
        });
      }
    }

    const coverage = validatePlanCoverage(items, input);
    if (coverage.missing.length > 0)
      warnings.push(
        `Acoperirea minimă lipsește: ${coverage.missing.join(", ")}.`,
      );
    if (flexible)
      warnings.push(
        "Data este flexibilă; termenele rămân relative până la confirmarea unei date exacte.",
      );

    return {
      title: "Planul inițial al nunții",
      summary: `Propunere deterministă cu ${items.filter((item) => item.type === "task").length} taskuri, adaptată onboardingului salvat.`,
      assumptions,
      warnings,
      coverage,
      items,
      generatorType: "deterministic",
      provider: "deterministic",
      model: null,
      rulesVersion: PLANNING_RULES_VERSION,
      fallbackUsed: false,
    };
  }
}

export class ConfiguredAiPlanProvider implements PlanGenerationProvider {
  constructor(
    private readonly enrich: (
      input: PlanGenerationInput,
      baseline: PlanGenerationOutput,
    ) => Promise<Partial<PlanGenerationOutput>>,
    private readonly fallback = new DeterministicPlanProvider(),
  ) {}

  async generatePlan(
    input: PlanGenerationInput,
  ): Promise<PlanGenerationOutput> {
    const baseline = await this.fallback.generatePlan(input);
    try {
      const enrichment = await this.enrich(input, baseline);
      const candidate: PlanGenerationOutput = {
        ...baseline,
        ...enrichment,
        items: enrichment.items ?? baseline.items,
        generatorType: "ai_enriched",
        fallbackUsed: false,
      };
      const coverage = validatePlanCoverage(candidate.items, input);
      if (coverage.missing.length > 0)
        throw new Error(
          `AI enrichment removed required coverage: ${coverage.missing.join(", ")}`,
        );
      return { ...candidate, coverage };
    } catch {
      return {
        ...baseline,
        generatorType: "fallback",
        fallbackUsed: true,
        warnings: [
          ...baseline.warnings,
          "Providerul AI nu a fost disponibil. Propunerea a fost generată cu motorul determinist.",
        ],
      };
    }
  }
}

export function validatePlanCoverage(
  items: GeneratedPlanItem[],
  input?: PlanGenerationInput,
): PlanCoverageResult {
  const required = minimumCoverageCategories.filter(
    (category) => !input || isRelevant(category, input),
  );
  const covered = [
    ...new Set(
      items.filter((item) => item.included).map((item) => item.category),
    ),
  ].filter((category) =>
    required.includes(category as (typeof minimumCoverageCategories)[number]),
  );
  return {
    required: [...required],
    covered,
    missing: required.filter((category) => !covered.includes(category)),
  };
}

export function planGenerationInputHash(input: PlanGenerationInput): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function weddingDate(dateEvents: Record<string, unknown>): string | null {
  for (const key of ["date", "exactDate", "weddingDate"]) {
    const value = dateEvents[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
      return value;
  }
  return null;
}

function materializeDate(
  exactDate: string | null,
  offsetDays: number,
  flexible: boolean,
): string | null {
  if (!exactDate || flexible) return null;
  const date = new Date(`${exactDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString();
}

function buildAssumptions(
  input: PlanGenerationInput,
  exactDate: string | null,
): string[] {
  const assumptions: string[] = [];
  if (!exactDate) assumptions.push("Data exactă a nunții nu este confirmată.");
  if (!text(input.location.city) && !text(input.location.venue))
    assumptions.push("Locația exactă nu este confirmată.");
  if (!numberValue(input.guests.guestCount))
    assumptions.push(
      "Numărul de invitați este estimativ sau nu a fost furnizat.",
    );
  if (!Object.values(input.existingProgress).some(Boolean))
    assumptions.push(
      "Nu au fost declarați furnizori sau servicii deja confirmate.",
    );
  return assumptions;
}

function isRelevant(category: string, input: PlanGenerationInput): boolean {
  if (category === "religious_ceremony")
    return input.dateEvents.religious !== false;
  if (category === "civil_ceremony") return input.dateEvents.civil !== false;
  if (category === "reception") return input.dateEvents.reception !== false;
  if (category === "transport") return input.guests.transport !== false;
  if (category === "accommodation") return input.guests.accommodation !== false;
  return true;
}

function milestoneTitle(phaseKey: string): string {
  const titles: Record<string, string> = {
    foundation: "Deciziile de bază sunt confirmate",
    suppliers: "Furnizorii principali sunt planificați",
    details: "Detaliile invitaților sunt pregătite",
    finale: "Planul zilei este gata",
  };
  return titles[phaseKey] ?? "Etapă finalizată";
}

function followUpTitle(template: TaskTemplate): string {
  return `Verifică și reconfirmă: ${template.title.toLocaleLowerCase("ro-RO")}`;
}

function boostPriority(
  priority: TaskTemplate["priority"],
): TaskTemplate["priority"] {
  if (priority === "low") return "medium";
  if (priority === "medium") return "high";
  return "urgent";
}

function relativeLabel(offset: number): string {
  const months = Math.max(1, Math.round(Math.abs(offset) / 30));
  return offset < 0
    ? `cu aproximativ ${months} luni înainte`
    : `la aproximativ ${months} luni după`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function camelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function taskDependencies(category: string): string[] {
  const dependencies: Record<string, string[]> = {
    rsvp: ["invitations"],
    seating: ["rsvp"],
    payments: ["venue"],
    wedding_day: ["logistics"],
    post_wedding: ["wedding_day"],
  };
  return dependencies[category] ?? [];
}
