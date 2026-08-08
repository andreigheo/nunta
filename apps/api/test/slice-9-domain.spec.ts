import { describe, expect, it, vi } from "vitest";
import {
  automationExecutionDecisionSchema,
  automationTransitionSchema,
  capabilityKeySchema,
  contingencySimulationSchema,
  createAutomationRuleSchema,
  createContingencyPlanSchema,
  createCopilotMessageSchema,
  createRiskSchema,
  executeCopilotProposalSchema,
  riskScore,
  riskTransitionSchema,
  updateCopilotProposalSchema,
} from "@weddingos/contracts";
import {
  ConfiguredAiCopilotProvider,
  DeterministicCopilotProvider,
  detectDeterministicRisks,
  intelligenceDedupeKey,
  routeCopilotProvider,
} from "@weddingos/jobs";

const id = "00000000-0000-4000-8000-000000000001";
const context = {
  workspaceId: id,
  locale: "ro",
  unavailableModules: [],
  redactions: [],
  resources: [
    {
      type: "Task",
      id,
      title: "Confirmă locația urgent",
      summary: "Task urgent și întârziat.",
      sensitivity: "normal" as const,
    },
  ],
};

describe("Slice 9 intelligence contracts", () => {
  it("bounds Copilot message content", () => {
    expect(
      createCopilotMessageSchema.safeParse({ content: "Ajută-mă" }).success,
    ).toBe(true);
    expect(
      createCopilotMessageSchema.safeParse({ content: "x".repeat(8_001) })
        .success,
    ).toBe(false);
  });

  it("requires an approved proposal version for execution", () => {
    expect(executeCopilotProposalSchema.safeParse({ version: 1 }).success).toBe(
      true,
    );
    expect(executeCopilotProposalSchema.safeParse({ version: 0 }).success).toBe(
      false,
    );
  });

  it("limits proposal actions to the closed allowlist", () => {
    expect(
      updateCopilotProposalSchema.safeParse({
        version: 1,
        actions: [
          {
            actionType: "CREATE_TASK",
            payload: {},
            riskLevel: "LOW",
            position: 0,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      updateCopilotProposalSchema.safeParse({
        version: 1,
        actions: [
          {
            actionType: "SEND_PAYMENT",
            payload: {},
            riskLevel: "LOW",
            position: 0,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates risk bounds", () => {
    expect(
      createRiskSchema.safeParse({
        title: "Ploaie",
        category: "WEATHER",
        probability: 5,
        impact: 4,
      }).success,
    ).toBe(true);
    expect(
      createRiskSchema.safeParse({
        title: "Ploaie",
        category: "WEATHER",
        probability: 6,
        impact: 4,
      }).success,
    ).toBe(false);
  });

  it("requires a reason for risk transitions", () => {
    expect(
      riskTransitionSchema.safeParse({
        transition: "ACCEPT",
        reason: "Asumat de cuplu",
        version: 1,
      }).success,
    ).toBe(true);
    expect(
      riskTransitionSchema.safeParse({ transition: "ACCEPT", version: 1 })
        .success,
    ).toBe(false);
  });

  it("requires at least one contingency action", () => {
    expect(
      createContingencyPlanSchema.safeParse({
        title: "Plan ploaie",
        actions: [{ title: "Mută ceremonia", position: 0 }],
      }).success,
    ).toBe(true);
    expect(
      createContingencyPlanSchema.safeParse({ title: "Plan gol", actions: [] })
        .success,
    ).toBe(false);
  });

  it("keeps simulation triggers explicit", () => {
    expect(
      contingencySimulationSchema.safeParse({ triggerType: "MANUAL" }).success,
    ).toBe(true);
    expect(
      contingencySimulationSchema.safeParse({ triggerType: "WEBHOOK_ARBITRAR" })
        .success,
    ).toBe(false);
  });

  it("keeps automation actions on a closed DSL", () => {
    expect(
      createAutomationRuleSchema.safeParse({
        name: "Reminder",
        triggerType: "SCHEDULED",
        actions: [{ type: "CREATE_NOTIFICATION", position: 0 }],
      }).success,
    ).toBe(true);
    expect(
      createAutomationRuleSchema.safeParse({
        name: "Transfer",
        triggerType: "MANUAL",
        actions: [{ type: "TRANSFER_MONEY", position: 0 }],
      }).success,
    ).toBe(false);
  });

  it("requires automation transition version", () => {
    expect(automationTransitionSchema.safeParse({ version: 2 }).success).toBe(
      true,
    );
    expect(automationTransitionSchema.safeParse({}).success).toBe(false);
  });

  it("validates automation approval decisions", () => {
    expect(
      automationExecutionDecisionSchema.safeParse({ decision: "APPROVE" })
        .success,
    ).toBe(true);
    expect(
      automationExecutionDecisionSchema.safeParse({ decision: "BYPASS" })
        .success,
    ).toBe(false);
  });

  it("maps low risk score", () =>
    expect(riskScore(1, 2)).toEqual({ score: 2, level: "LOW" }));
  it("maps medium risk score", () =>
    expect(riskScore(2, 3)).toEqual({ score: 6, level: "MEDIUM" }));
  it("maps high risk score", () =>
    expect(riskScore(3, 4)).toEqual({ score: 12, level: "HIGH" }));
  it("maps critical risk score", () =>
    expect(riskScore(4, 5)).toEqual({ score: 20, level: "CRITICAL" }));

  it("routes deterministic mode deterministically", () =>
    expect(
      routeCopilotProvider({
        mode: "deterministic",
        containsSensitiveContext: false,
        externalEnabled: true,
      }),
    ).toBe("deterministic"));
  it("routes sensitive context away from external providers", () =>
    expect(
      routeCopilotProvider({
        mode: "auto",
        containsSensitiveContext: true,
        externalEnabled: true,
      }),
    ).toBe("deterministic"));
  it("routes to configured AI only when enabled and safe", () =>
    expect(
      routeCopilotProvider({
        mode: "ai_enriched",
        containsSensitiveContext: false,
        externalEnabled: true,
      }),
    ).toBe("configured-ai"));

  it("creates stable intelligence dedupe keys", () => {
    expect(intelligenceDedupeKey([id, "risk", 1])).toBe(
      intelligenceDedupeKey([id, "risk", 1]),
    );
    expect(intelligenceDedupeKey([id, "risk", 1])).not.toBe(
      intelligenceDedupeKey([id, "risk", 2]),
    );
  });

  it("detects overdue tasks without duplicating completed tasks", () => {
    const results = detectDeterministicRisks({
      now: new Date("2027-01-02T00:00:00Z"),
      tasks: [
        {
          id,
          title: "Rezervare",
          status: "NOT_STARTED",
          priority: "URGENT",
          dueAt: new Date("2027-01-01T00:00:00Z"),
        },
        {
          id: `${id}-done`,
          title: "Gata",
          status: "COMPLETED",
          priority: "URGENT",
          dueAt: new Date("2027-01-01T00:00:00Z"),
        },
      ],
      milestones: [],
    });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ sourceId: id, impact: 5 });
  });

  it("detects blocked tasks with persisted reason", () => {
    const [risk] = detectDeterministicRisks({
      now: new Date(),
      tasks: [
        {
          id,
          title: "DJ",
          status: "BLOCKED",
          priority: "HIGH",
          dueAt: null,
          blockedReason: "Lipsește oferta",
        },
      ],
      milestones: [],
    });
    expect(risk?.description).toBe("Lipsește oferta");
  });

  it("detects missed milestones", () => {
    const results = detectDeterministicRisks({
      now: new Date("2027-01-02T00:00:00Z"),
      tasks: [],
      milestones: [
        {
          id,
          title: "Locație",
          status: "UPCOMING",
          targetAt: new Date("2027-01-01T00:00:00Z"),
        },
      ],
    });
    expect(results[0]?.dedupeKey).toContain("milestone");
  });

  it("returns a sourced deterministic answer", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Ce este urgent?",
      context,
    });
    expect(result.sources).toHaveLength(1);
    expect(result.confidence?.basis).toContain("autorizate");
  });

  it("creates a reviewable task proposal without mutation", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Creează un task urgent pentru locație",
      context,
    });
    expect(result.proposal).toMatchObject({
      actionType: "CREATE_TASK",
      riskLevel: "LOW",
    });
    expect(result.answer).toContain("nimic nu a fost modificat");
  });

  it("requires separate high-risk Plan B activation", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Creează Plan B pentru ploaie",
      context,
    });
    expect(result.proposal).toMatchObject({
      actionType: "CREATE_CONTINGENCY_PLAN",
      riskLevel: "HIGH",
    });
    expect(result.answer).toContain("pas separat");
  });

  it("refuses prohibited financial and signature actions", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Plătește și semnează contractul",
      context,
    });
    expect(result.proposal).toBeUndefined();
    expect(result.warnings[0]).toContain("interzisă");
  });

  it("falls back honestly when external provider is not configured", async () => {
    const result = await new ConfiguredAiCopilotProvider(
      undefined,
      undefined,
    ).run({ message: "Ce urmează?", context });
    expect(result.provider).toBe("configured-ai");
    expect(result.fallbackUsed).toBe(true);
  });

  it("falls back on external provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await new ConfiguredAiCopilotProvider(
      "https://provider.invalid",
      "secret",
    ).run({ message: "Ce urmează?", context });
    expect(result.fallbackUsed).toBe(true);
    vi.unstubAllGlobals();
  });

  it("registers every Slice 9 atomic capability", () => {
    for (const capability of [
      "copilot.read",
      "copilot.use",
      "copilot.create_proposal",
      "copilot.approve_low_risk",
      "copilot.approve_high_risk",
      "risk.read",
      "risk.write",
      "risk.assess",
      "contingency.activate",
      "automation.activate",
      "automation.approve",
      "automation.view_executions",
    ]) {
      expect(
        capabilityKeySchema.safeParse(capability).success,
        capability,
      ).toBe(true);
    }
  });
});
