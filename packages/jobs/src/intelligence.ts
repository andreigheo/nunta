import { createHash } from "node:crypto";

export const COPILOT_POLICY_VERSION = "slice-9.v1";
export const RISK_RULES_VERSION = "slice-9-risk.v1";
export const AUTOMATION_DSL_VERSION = "slice-9-automation.v1";

export type CopilotContextResource = {
  type: string;
  id: string;
  title: string;
  summary: string;
  updatedAt?: string;
  sensitivity: "normal" | "sensitive";
};

export type CopilotContext = {
  workspaceId: string;
  locale: string;
  resources: CopilotContextResource[];
  unavailableModules: string[];
  redactions: string[];
};

export type CopilotProposedAction = {
  actionType:
    | "CREATE_TASK"
    | "CREATE_CALENDAR_EVENT"
    | "CREATE_RISK"
    | "CREATE_CONTINGENCY_PLAN";
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  preview: Record<string, unknown>;
};

export type CopilotActionProposal = CopilotProposedAction & {
  title: string;
  additionalActions?: CopilotProposedAction[];
};

export type CopilotProviderOutput = {
  answer: string;
  provider: string;
  model: string | null;
  fallbackUsed: boolean;
  assumptions: string[];
  warnings: string[];
  followUpSuggestions: string[];
  confidence?: { level: "LOW" | "MEDIUM" | "HIGH"; basis: string };
  sources: Array<{ resourceType: string; resourceId: string; excerpt: string }>;
  proposal?: CopilotActionProposal;
  usage: { inputUnits: number; outputUnits: number };
};

export interface CopilotProvider {
  readonly name: string;
  run(input: {
    message: string;
    context: CopilotContext;
  }): Promise<CopilotProviderOutput>;
}

export class DeterministicCopilotProvider implements CopilotProvider {
  readonly name = "deterministic";

  async run(input: {
    message: string;
    context: CopilotContext;
  }): Promise<CopilotProviderOutput> {
    const message = input.message.toLocaleLowerCase("ro");
    const urgent = input.context.resources.filter((item) =>
      /urgent|întârzi|blocat|critic/i.test(`${item.title} ${item.summary}`),
    );
    const focus = urgent[0] ?? input.context.resources[0];
    const sourceText = focus
      ? `Am verificat „${focus.title}”. ${focus.summary}`
      : "Nu există încă suficiente date active în workspace pentru o recomandare punctuală.";
    let answer = `${sourceText} Recomand să confirmi întâi datele și responsabilul, apoi să continui cu următoarea acțiune verificabilă.`;
    let proposal: CopilotActionProposal | undefined;
    const warnings: string[] = [];

    if (
      /refund|ramburs|plăt|plata|semn(eaz|are)|accept.*ofert|payout|decont/i.test(
        message,
      )
    ) {
      answer =
        "Nu pot executa plăți, rambursări, acceptări de ofertă, semnări sau payout-uri. Pot explica datele autorizate și te pot direcționa către fluxul manual care păstrează aprobările obligatorii.";
      warnings.push(
        "Acțiunea cerută este interzisă pentru Copilot în Slice 9.",
      );
    } else if (/plan b|contingen/i.test(message)) {
      proposal = {
        actionType: "CREATE_CONTINGENCY_PLAN",
        riskLevel: "HIGH",
        title: "Propunere de Plan B",
        preview: {
          title: extractTitle(input.message, "Plan B propus de Copilot"),
          summary:
            "Plan de contingență propus pentru verificare, simulare și aprobare explicită.",
        },
      };
      answer += " Am pregătit un Plan B; activarea rămâne un pas separat.";
    } else if (/creeaz|adaug.*task|sarcin/i.test(message)) {
      proposal = {
        actionType: "CREATE_TASK",
        riskLevel: "LOW",
        title: "Propunere de task",
        preview: {
          title: extractTitle(input.message, "Task propus de Copilot"),
          description: "Propunere generată pentru verificare umană.",
          priority: /urgent/i.test(message) ? "URGENT" : "MEDIUM",
        },
      };
      answer +=
        " Am pregătit o propunere de task; nimic nu a fost modificat încă.";
      if (/milestone|etap.*întârzi|rezolv.*întârzi/i.test(message)) {
        proposal.additionalActions = [
          {
            actionType: "CREATE_CALENDAR_EVENT",
            riskLevel: "MEDIUM",
            preview: {
              title: "Revizuire milestone întârziat",
              startAt: new Date(Date.now() + 86_400_000).toISOString(),
              description:
                "Eveniment propus împreună cu taskul; necesită aprobare.",
            },
          },
        ];
      }
    } else if (/calendar|eveniment|întâlnire/i.test(message)) {
      proposal = {
        actionType: "CREATE_CALENDAR_EVENT",
        riskLevel: "LOW",
        title: "Propunere de eveniment",
        preview: {
          title: extractTitle(input.message, "Eveniment propus de Copilot"),
          startAt: new Date(Date.now() + 86_400_000).toISOString(),
          description: "Data și ora trebuie confirmate înainte de aprobare.",
        },
      };
      answer +=
        " Am pregătit un eveniment în calendar; data trebuie verificată înainte de aprobare.";
    } else if (/risc/i.test(message)) {
      proposal = {
        actionType: "CREATE_RISK",
        riskLevel: "MEDIUM",
        title: "Propunere de risc",
        preview: {
          title: extractTitle(input.message, "Risc de verificat"),
          category: "OTHER",
          probability: 3,
          impact: 3,
          description:
            "Semnal propus de Copilot; necesită verificare și aprobare.",
        },
      };
      answer +=
        " Am pregătit un risc propus, separat de registrul canonic până la aprobare.";
    }

    return {
      answer,
      provider: this.name,
      model: null,
      fallbackUsed: false,
      assumptions: focus
        ? []
        : ["Workspace-ul nu conține încă suficiente resurse active."],
      warnings,
      followUpSuggestions: [
        "Arată-mi sursele folosite",
        "Pregătește următoarea acțiune ca propunere",
      ],
      confidence: {
        level: focus ? "MEDIUM" : "LOW",
        basis: focus
          ? "Recomandarea folosește resurse canonice autorizate."
          : "Nu au fost găsite suficiente date canonice.",
      },
      sources: input.context.resources.slice(0, 6).map((item) => ({
        resourceType: item.type,
        resourceId: item.id,
        excerpt: item.summary.slice(0, 300),
      })),
      ...(proposal ? { proposal } : {}),
      usage: {
        inputUnits: input.message.length + JSON.stringify(input.context).length,
        outputUnits: answer.length,
      },
    };
  }
}

export class ConfiguredAiCopilotProvider implements CopilotProvider {
  readonly name = "configured-ai";
  constructor(
    private readonly endpoint: string | undefined,
    private readonly apiKey: string | undefined,
    private readonly fallback = new DeterministicCopilotProvider(),
  ) {}

  async run(input: {
    message: string;
    context: CopilotContext;
  }): Promise<CopilotProviderOutput> {
    if (!this.endpoint || !this.apiKey) {
      const output = await this.fallback.run(input);
      return { ...output, provider: this.name, fallbackUsed: true };
    }
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          policyVersion: COPILOT_POLICY_VERSION,
          message: input.message,
          context: input.context,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`provider_http_${response.status}`);
      const payload = (await response.json()) as {
        answer?: unknown;
        model?: unknown;
        assumptions?: unknown;
        warnings?: unknown;
        followUpSuggestions?: unknown;
      };
      if (typeof payload.answer !== "string" || !payload.answer.trim())
        throw new Error("provider_invalid_response");
      return {
        answer: payload.answer.slice(0, 12_000),
        provider: this.name,
        model:
          typeof payload.model === "string"
            ? payload.model.slice(0, 120)
            : null,
        fallbackUsed: false,
        assumptions: stringArray(payload.assumptions, 20, 500),
        warnings: stringArray(payload.warnings, 20, 500),
        followUpSuggestions: stringArray(payload.followUpSuggestions, 10, 300),
        sources: input.context.resources.slice(0, 6).map((item) => ({
          resourceType: item.type,
          resourceId: item.id,
          excerpt: item.summary.slice(0, 300),
        })),
        usage: {
          inputUnits:
            input.message.length + JSON.stringify(input.context).length,
          outputUnits: payload.answer.length,
        },
      };
    } catch {
      const output = await this.fallback.run(input);
      return { ...output, provider: this.name, fallbackUsed: true };
    }
  }
}

export function routeCopilotProvider(input: {
  mode: "deterministic" | "ai_enriched" | "auto";
  containsSensitiveContext: boolean;
  externalEnabled: boolean;
}) {
  if (
    input.mode === "deterministic" ||
    input.containsSensitiveContext ||
    !input.externalEnabled
  )
    return "deterministic" as const;
  return "configured-ai" as const;
}

export type RiskCandidate = {
  dedupeKey: string;
  title: string;
  description: string;
  category: "SCHEDULE" | "VENDOR" | "BUDGET" | "GUEST" | "LOGISTICS";
  probability: number;
  impact: number;
  sourceType: string;
  sourceId: string;
};

export function detectDeterministicRisks(input: {
  now: Date;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueAt: Date | null;
    blockedReason?: string | null;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    targetAt: Date | null;
    status: string;
  }>;
}): RiskCandidate[] {
  const candidates: RiskCandidate[] = [];
  for (const task of input.tasks) {
    if (task.status === "COMPLETED" || task.status === "ARCHIVED") continue;
    const overdue = task.dueAt && task.dueAt.getTime() < input.now.getTime();
    if (overdue || task.status === "BLOCKED") {
      candidates.push({
        dedupeKey: `task:${task.id}:${overdue ? "overdue" : "blocked"}`,
        title: `${overdue ? "Task întârziat" : "Task blocat"}: ${task.title}`,
        description:
          task.blockedReason ??
          "Acțiunea necesită atenție pentru a proteja calendarul.",
        category: "SCHEDULE",
        probability: overdue ? 4 : 3,
        impact:
          task.priority === "URGENT" ? 5 : task.priority === "HIGH" ? 4 : 3,
        sourceType: "Task",
        sourceId: task.id,
      });
    }
  }
  for (const milestone of input.milestones) {
    if (
      milestone.status !== "COMPLETED" &&
      milestone.targetAt &&
      milestone.targetAt.getTime() < input.now.getTime()
    ) {
      candidates.push({
        dedupeKey: `milestone:${milestone.id}:missed`,
        title: `Milestone întârziat: ${milestone.title}`,
        description: "Data țintă a trecut, iar milestone-ul nu este completat.",
        category: "SCHEDULE",
        probability: 5,
        impact: 4,
        sourceType: "TimelineMilestone",
        sourceId: milestone.id,
      });
    }
  }
  return candidates;
}

export function intelligenceDedupeKey(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function extractTitle(message: string, fallback: string) {
  const cleaned = message
    .replace(
      /^(te rog\s+)?(creează|creeaza|adaugă|adauga)\s+(un\s+)?(task|risc)?\s*/i,
      "",
    )
    .trim();
  return (cleaned || fallback).slice(0, 180);
}

function stringArray(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, maximumLength))
        .filter(Boolean)
        .slice(0, maximumItems)
    : [];
}
