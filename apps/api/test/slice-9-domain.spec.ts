import { describe, expect, it, vi } from "vitest";
import {
  automationExecutionDecisionSchema,
  automationTransitionSchema,
  capabilityKeySchema,
  contingencySimulationSchema,
  copilotProposalActionTypes,
  createAutomationRuleSchema,
  createContingencyPlanSchema,
  createCopilotMessageSchema,
  createCopilotMemorySchema,
  createRiskSchema,
  executeCopilotProposalSchema,
  riskScore,
  riskTransitionSchema,
  updateCopilotProposalSchema,
  validateCopilotActionPayload,
} from "@weddingos/contracts";
import {
  ConfiguredAiCopilotProvider,
  copilotEnumLabel,
  copilotApiOperations,
  copilotDomainCatalog,
  copilotImplementedActionDefinitions,
  copilotMemoryContentCanPersist,
  copilotPageSurfaces,
  DeterministicCopilotProvider,
  detectDeterministicRisks,
  generatedCopilotContentIsAcceptable,
  explicitWebResearchRequested,
  extractExplicitCopilotMemory,
  formatCopilotMoneyMinor,
  intelligenceDedupeKey,
  OpenRouterCopilotProvider,
  parseOpenRouterCitations,
  requiredCapabilityForCopilotAction,
  requestCopilotEmbedding,
  routeCopilotProvider,
  selectRelevantCopilotActions,
  sarbatoCopilotPolicy,
  sarbatoCopilotSystemInstructions,
  type CopilotContext,
} from "@weddingos/jobs";

const id = "00000000-0000-4000-8000-000000000001";
const context: CopilotContext = {
  workspaceId: id,
  locale: "ro",
  allowedActions: copilotImplementedActionDefinitions.map(
    (definition) => definition.actionType,
  ),
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
  it("maps every current UI and API surface without pretending it is implemented", () => {
    expect(copilotPageSurfaces.length).toBeGreaterThanOrEqual(80);
    expect(copilotApiOperations.length).toBeGreaterThanOrEqual(670);
    expect(copilotPageSurfaces.every((surface) => surface.source)).toBe(true);
    expect(
      copilotApiOperations.every((operation) => operation.controller),
    ).toBe(true);
    expect(
      copilotApiOperations.filter(
        (operation) => operation.adapterStatus === "ACTIVE",
      ),
    ).toHaveLength(44);
    expect(
      copilotApiOperations.every((operation) =>
        [
          "ACTIVE",
          "READ_ONLY",
          "GUIDE_ONLY",
          "INTENTIONALLY_UNSUPPORTED",
        ].includes(operation.adapterStatus),
      ),
    ).toBe(true);
    expect(
      copilotApiOperations.map(
        (operation) => operation.adapterStatus as string,
      ),
    ).not.toContain("UNMAPPED");
  });

  it("keeps domain, policy and action-capability mappings explicit", () => {
    const domainKeys = copilotDomainCatalog.map((domain) => domain.key);
    expect(new Set(domainKeys).size).toBe(domainKeys.length);
    expect(domainKeys).toEqual(
      expect.arrayContaining([
        "calendar",
        "budget",
        "guests",
        "invitations",
        "vendor-profile",
        "wedding-day",
      ]),
    );
    expect(sarbatoCopilotPolicy.security.authorization).toContain("tenantul");
    expect(sarbatoCopilotPolicy.approvals.prohibited).toContain("Plățile");
    expect(sarbatoCopilotSystemInstructions()).toContain(
      "platformă în care oamenii creează",
    );
    expect(requiredCapabilityForCopilotAction("CREATE_CALENDAR_EVENT")).toBe(
      "calendar.write",
    );
    expect(
      requiredCapabilityForCopilotAction("TRANSFER_MONEY"),
    ).toBeUndefined();
    expect(
      copilotImplementedActionDefinitions.every(
        (definition) => definition.adapterStatus === "ACTIVE",
      ),
    ).toBe(true);
    expect(
      copilotImplementedActionDefinitions.map(
        (definition) => definition.actionType,
      ),
    ).toEqual(copilotProposalActionTypes);
  });

  it("validates real adapter payloads before they reach domain services", () => {
    expect(
      validateCopilotActionPayload("UPSERT_BUDGET_PLAN", {
        targetVersion: null,
        name: "Buget nuntă",
        targetTotalMinor: 12_500_000,
        contingencyPercent: 10,
        status: "ACTIVE",
      }).success,
    ).toBe(true);
    expect(
      validateCopilotActionPayload("UPDATE_CALENDAR_EVENT", {
        targetId: id,
        targetVersion: 3,
        title: "Degustare meniu",
      }).success,
    ).toBe(true);
    expect(
      validateCopilotActionPayload("UPDATE_CALENDAR_EVENT", {
        targetId: id,
        title: "Fără versiune",
      }).success,
    ).toBe(false);
    expect(
      validateCopilotActionPayload("SYNC_INVITATION_DATA", {
        targetVersion: 2,
        paths: ["hero.date", "schedule.items"],
      }).success,
    ).toBe(true);
    expect(
      validateCopilotActionPayload("SYNC_INVITATION_DATA", {
        targetVersion: 2,
        paths: ["unknown.path"],
      }).success,
    ).toBe(false);

    const extendedAdapters: Array<
      [Parameters<typeof validateCopilotActionPayload>[0], unknown]
    > = [
      ["CREATE_TRANSPORT_PLAN", { weddingEventId: id, name: "Transport" }],
      [
        "UPDATE_TRANSPORT_PLAN",
        { targetId: id, targetVersion: 1, status: "ready" },
      ],
      [
        "CREATE_TRANSPORT_STOP",
        { name: "Hotel", address: "Strada Centrală 1" },
      ],
      [
        "UPDATE_TRANSPORT_STOP",
        { targetId: id, targetVersion: 1, accessible: true },
      ],
      [
        "CREATE_ACCOMMODATION_PROPERTY",
        {
          name: "Hotel Central",
          type: "hotel",
          address: "Strada Centrală 1",
          city: "Chișinău",
          country: "Moldova",
        },
      ],
      [
        "UPDATE_ACCOMMODATION_PROPERTY",
        { targetId: id, targetVersion: 1, status: "active" },
      ],
      [
        "CREATE_ACCOMMODATION_STAY",
        {
          propertyId: id,
          name: "Sejur invitați",
          checkInDate: "2027-09-11",
          checkOutDate: "2027-09-13",
        },
      ],
      [
        "UPDATE_ACCOMMODATION_STAY",
        { targetId: id, targetVersion: 1, status: "ready" },
      ],
      [
        "CREATE_RFQ",
        {
          title: "Fotografie nuntă",
          category: "PHOTOGRAPHY",
          description: "Cerere pentru ziua nunții.",
          currency: "MDL",
          responseDeadline: "2027-07-19T10:00:00.000Z",
        },
      ],
      [
        "UPDATE_RFQ",
        { targetId: id, targetVersion: 1, title: "Foto și video" },
      ],
      [
        "CREATE_CAMPAIGN_DRAFT",
        {
          name: "Invitația principală",
          purpose: "INVITATION",
          channel: "EMAIL",
          template: { subject: "Invitație", body: "Te așteptăm." },
        },
      ],
      [
        "UPDATE_CAMPAIGN_DRAFT",
        { targetId: id, targetVersion: 1, name: "Invitația finală" },
      ],
      [
        "CREATE_WEDDING_DAY_INCIDENT",
        {
          planId: id,
          type: "WEATHER",
          severity: "HIGH",
          title: "Ploaie puternică",
          descriptionPrivate: "Echipa mută ceremonia în interior.",
        },
      ],
      [
        "CREATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT",
        {
          planId: id,
          title: "Schimbare acces",
          body: "Folosiți intrarea de nord.",
          channels: ["GUEST_COMPANION"],
          audiences: [{ type: "ALL_CONFIRMED_GUESTS", selector: {} }],
        },
      ],
      [
        "UPDATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT",
        { targetId: id, targetVersion: 1, priority: "IMPORTANT" },
      ],
    ];
    for (const [actionType, payload] of extendedAdapters)
      expect(
        validateCopilotActionPayload(actionType, payload).success,
        actionType,
      ).toBe(true);
  });

  it("limits external tool contracts to the request domain and current surface", () => {
    expect(
      selectRelevantCopilotActions(
        "Adaugă 5.000 lei pentru flori",
        "/budget",
        context.allowedActions,
      ),
    ).toEqual(
      expect.arrayContaining([
        "UPSERT_BUDGET_PLAN",
        "CREATE_BUDGET_ITEM",
        "UPDATE_BUDGET_ITEM",
      ]),
    );
    expect(
      selectRelevantCopilotActions(
        "Schimbă ora degustării",
        "/calendar",
        context.allowedActions,
      ),
    ).toEqual(["CREATE_CALENDAR_EVENT", "UPDATE_CALENDAR_EVENT"]);
  });

  it("accepts normal user language but blocks obscene generated communication", () => {
    expect(
      generatedCopilotContentIsAcceptable(
        "Utilizatorul este nervos; răspunde calm și ajută-l.",
      ),
    ).toBe(true);
    expect(generatedCopilotContentIsAcceptable("Mesaj cu muie")).toBe(false);
  });

  it("only persists explicit and privacy-bounded memory", () => {
    expect(
      createCopilotMemorySchema.safeParse({
        scope: "USER",
        kind: "PREFERENCE",
        title: "Stil preferat",
        content: "Preferă un stil minimalist.",
        sourceType: "USER_CONFIRMED",
        confirmedByUser: true,
      }).success,
    ).toBe(true);
    expect(
      createCopilotMemorySchema.safeParse({
        kind: "PREFERENCE",
        title: "Presupunere",
        content: "Poate preferă verde.",
        sourceType: "USER_CONFIRMED",
        confirmedByUser: false,
      }).success,
    ).toBe(false);
    expect(
      createCopilotMemorySchema.safeParse({
        kind: "FACT",
        title: "Secret",
        content: "Nu trebuie stocat.",
        sensitivity: "RESTRICTED",
      }).success,
    ).toBe(false);
    expect(copilotMemoryContentCanPersist("Preferă decor minimalist")).toBe(
      true,
    );
    expect(copilotMemoryContentCanPersist("Are alergie la arahide")).toBe(
      false,
    );
    expect(copilotMemoryContentCanPersist("Parola este secret123")).toBe(false);
  });

  it("bounds Copilot message content", () => {
    expect(
      createCopilotMessageSchema.parse({ content: "Ajută-mă" }),
    ).toMatchObject({ research: true, mode: "auto" });
    expect(
      createCopilotMessageSchema.safeParse({
        content: "Ajută-mă",
        surface: "/budget",
      }).success,
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
            payload: { title: "Confirmă locația", priority: "medium" },
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

  it("accepts only a finite embedding with the configured dimensions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    await expect(
      requestCopilotEmbedding({
        endpoint: "https://embeddings.example.test",
        apiKey: "secret",
        model: "test-embedding",
        text: "decor minimalist",
        dimensions: 3,
      }),
    ).resolves.toEqual([0.1, 0.2, 0.3]);
    vi.unstubAllGlobals();
  });

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

  it("creates a reviewable budget target when the external provider falls back", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Setează bugetul nunții la 190.000 RON",
      context: { ...context, surface: "/budget" },
    });
    expect(result.proposal).toMatchObject({
      actionType: "UPSERT_BUDGET_PLAN",
      riskLevel: "MEDIUM",
      preview: {
        name: "Bugetul nunții",
        targetTotalMinor: 19_000_000,
        contingencyPercent: 0,
        status: "ACTIVE",
        targetVersion: null,
      },
    });
    expect(result.answer).toContain("actualizarea țintei de buget");
  });

  it("preserves the budget version and contingency in deterministic updates", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Bugetul meu este 200000 de lei",
      context: {
        ...context,
        surface: "/budget",
        resources: [
          {
            type: "BudgetSummary",
            id,
            title: "Buget nuntă",
            summary: "versiune 3; țintă 18000000 RON; rezervă 12%",
            sensitivity: "normal",
          },
        ],
      },
    });
    expect(result.proposal?.preview).toMatchObject({
      name: "Buget nuntă",
      targetTotalMinor: 20_000_000,
      contingencyPercent: 12,
      targetVersion: 3,
    });
  });

  it("uses recent conversation context for a short budget correction", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "De fapt fă-l 183000 RON",
      context: {
        ...context,
        surface: "/budget",
        history: [
          { role: "user", content: "Setează bugetul la 181000 RON" },
          { role: "assistant", content: "Am pregătit actualizarea bugetului." },
        ],
        resources: [
          {
            type: "BudgetSummary",
            id,
            title: "Buget nuntă",
            summary: "versiune 4; țintă 181.000 RON; rezervă 12%",
            sensitivity: "normal",
          },
        ],
      },
    });
    expect(result.proposal?.preview).toMatchObject({
      targetTotalMinor: 18_300_000,
      targetVersion: 4,
      contingencyPercent: 12,
    });
  });

  it("formats canonical context for people instead of leaking storage units or enums", () => {
    expect(formatCopilotMoneyMinor(18_100_000n, "RON")).toBe("181.000 RON");
    expect(formatCopilotMoneyMinor(12_345n, "RON")).toBe("123,45 RON");
    expect(copilotEnumLabel("NOT_STARTED")).toBe("neînceput");
  });

  it("creates durable memory only for an explicit user request", () => {
    expect(extractExplicitCopilotMemory("Preferăm flori albe")).toBeNull();
    expect(
      extractExplicitCopilotMemory("Ține minte că preferăm flori albe"),
    ).toMatchObject({
      kind: "PREFERENCE",
      content: "preferăm flori albe",
    });
    expect(
      extractExplicitCopilotMemory("Ține minte că preferăm flori albe")
        ?.fingerprint,
    ).toBe(
      extractExplicitCopilotMemory("ține minte: preferăm  flori albe")
        ?.fingerprint,
    );
  });

  it("distinguishes explicit web research from automatic web availability", () => {
    expect(explicitWebResearchRequested("Schimbă bugetul la 180000 RON")).toBe(
      false,
    );
    expect(explicitWebResearchRequested("Caută online prețuri actuale")).toBe(
      true,
    );
  });

  it("creates a deterministic multi-step plan with separately reviewable actions", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Pregătește un plan în 2 pași pentru confirmarea locației",
      context,
    });
    expect(result.proposal).toBeUndefined();
    expect(result.plan?.steps).toHaveLength(2);
    expect(result.plan?.steps.map((step) => step.actionType)).toEqual([
      "CREATE_TASK",
      "CREATE_TASK",
    ]);
    expect(result.answer).toContain("fără aprobarea ta");
  });

  it("summarizes planning data without raw status codes", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Rezumă starea planificării",
      context: {
        ...context,
        resources: [
          {
            type: "PlanningPhase",
            id,
            title: "Decizii de bază",
            summary: "neînceput, poziția 1",
            sensitivity: "normal",
          },
          {
            type: "Task",
            id: "2e772f08-2412-4128-94ba-61f0ac92b65c",
            title: "Confirmă bugetul",
            summary: "versiune 1; în desfășurare, prioritate medie",
            sensitivity: "normal",
          },
          {
            type: "BudgetSummary",
            id: "0786ea39-b120-4d99-ae43-68a65c8bcceb",
            title: "Buget nuntă",
            summary: "versiune 3; țintă 183.000 RON; rezervă 0%",
            sensitivity: "normal",
          },
        ],
      },
    });
    expect(result.answer).toContain("Fazele: 1 în total");
    expect(result.answer).toContain("Sarcinile: 1 în total");
    expect(result.answer).toContain("183.000 RON");
    expect(result.answer).not.toContain("NOT_STARTED");
  });

  it("prioritizes the requested calendar domain over the generic create verb", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Creează un eveniment în calendar pentru degustarea meniului",
      context: { ...context, surface: "/calendar" },
    });
    expect(result.proposal).toMatchObject({
      actionType: "CREATE_CALENDAR_EVENT",
      riskLevel: "LOW",
    });
  });

  it("does not persist an obscene title copied from the request", async () => {
    const result = await new DeterministicCopilotProvider().run({
      message: "Creează un task cu titlul muie",
      context,
    });
    expect(result.proposal).toBeUndefined();
    expect(result.warnings[0]).toContain("politica de comunicare");
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

  it("accepts only a typed, policy-bounded proposal from the configured AI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answer: "Am pregătit taskul pentru verificare.",
            model: "test-model",
            proposal: {
              actionType: "CREATE_TASK",
              riskLevel: "LOW",
              title: "Confirmă floristul",
              preview: { title: "Confirmă floristul", priority: "high" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const result = await new ConfiguredAiCopilotProvider(
      "https://provider.example.test",
      "secret",
    ).run({ message: "Creează taskul", context });
    expect(result.fallbackUsed).toBe(false);
    expect(result.proposal).toMatchObject({ actionType: "CREATE_TASK" });
    vi.unstubAllGlobals();
  });

  it("uses the OpenRouter chat envelope and validates its JSON proposal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "generation-test",
          model: "openai/gpt-5.6-luna",
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({
                  answer: "Am pregătit taskul pentru aprobare.",
                  assumptions: [],
                  warnings: [],
                  followUpSuggestions: ["Verifică termenul"],
                  proposal: {
                    actionType: "CREATE_TASK",
                    riskLevel: "LOW",
                    title: "Confirmă fotograful",
                    preview: {
                      title: "Confirmă fotograful",
                      priority: "medium",
                    },
                    additionalActions: [],
                  },
                }),
              },
            },
          ],
          usage: { prompt_tokens: 123, completion_tokens: 45 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenRouterCopilotProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "test-only-key",
      "openai/gpt-5.6-luna",
    ).run({
      message: "Creează taskul pentru fotograf",
      context: {
        ...context,
        history: [
          { role: "user", content: "Fotograful este următoarea prioritate" },
        ],
      },
      research: true,
    });

    expect(result).toMatchObject({
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      fallbackUsed: false,
      usage: { inputUnits: 123, outputUnits: 45 },
      proposal: { actionType: "CREATE_TASK", riskLevel: "LOW" },
    });
    const [endpoint, request] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.headers).toMatchObject({
      authorization: "Bearer test-only-key",
      "http-referer": "https://sarbato.space",
      "x-openrouter-title": "Sarbato Copilot",
    });
    const body = JSON.parse(String(request.body)) as {
      model: string;
      response_format?: { type: string };
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ type: string }>;
      user: string;
    };
    expect(body.model).toBe("openai/gpt-5.6-luna");
    expect(body.response_format).toBeUndefined();
    expect(body.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
    ]);
    expect(body.messages[0]?.content).toContain('"CREATE_TASK"');
    expect(body.messages[0]?.content).not.toContain('"UPSERT_BUDGET_PLAN"');
    expect(body.messages[0]?.content).toContain('"priority"');
    expect(body.messages[1]?.content).toContain(
      "Fotograful este următoarea prioritate",
    );
    expect(body.tools[0]?.type).toBe("openrouter:web_search");
    expect(body.user).toMatch(/^[a-f0-9]{64}$/);
    expect(body.user).not.toContain(id);
    vi.unstubAllGlobals();
  });

  it("uses JSON response mode when web tools are not requested", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [
            {
              message: {
                content: JSON.stringify({ answer: "Răspuns verificat." }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await new OpenRouterCopilotProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "test-only-key",
    ).run({ message: "Ce urmează?", context, research: false });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      response_format?: { type: string };
      tools?: unknown;
    };
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.tools).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("falls back when OpenRouter returns malformed or unsafe content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.6-luna",
            choices: [{ message: { content: "not-json" } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const result = await new OpenRouterCopilotProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "test-only-key",
    ).run({ message: "Ce urmează?", context });
    expect(result.provider).toBe("openrouter");
    expect(result.fallbackUsed).toBe(true);
    vi.unstubAllGlobals();
  });

  it("accepts a bounded multi-step plan with independent typed steps", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.6-luna",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answer: "Am pregătit doi pași separați.",
                    plan: {
                      title: "Plan de lucru",
                      summary: "Fiecare pas se aprobă separat.",
                      steps: [
                        {
                          actionType: "CREATE_TASK",
                          riskLevel: "LOW",
                          title: "Confirmă locația",
                          preview: {
                            title: "Confirmă locația",
                            priority: "medium",
                          },
                          additionalActions: [],
                        },
                        {
                          actionType: "CREATE_CALENDAR_EVENT",
                          riskLevel: "LOW",
                          title: "Adaugă vizionarea",
                          preview: {
                            title: "Vizionare locație",
                            startAt: "2026-09-01T10:00:00.000Z",
                            timezone: "Europe/Chisinau",
                          },
                          additionalActions: [],
                        },
                      ],
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await new OpenRouterCopilotProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "test-only-key",
    ).run({
      message: "Fă-mi un plan cu un task și un eveniment în calendar",
      context,
    });
    expect(result.plan?.steps).toHaveLength(2);
    expect(result.proposal).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("uses explicit web research without returning executable actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "openai/gpt-5.6-luna",
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Am găsit două surse relevante.",
                  proposal: null,
                  plan: null,
                }),
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: {
                      url: "https://example.org/ghid#fragment",
                      title: "Ghid verificat",
                      content: "Rezumatul sursei.",
                    },
                  },
                  {
                    type: "url_citation",
                    url_citation: {
                      url: "http://127.0.0.1/private",
                      title: "Adresă privată",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenRouterCopilotProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "test-only-key",
    ).run({
      message: "Caută tendințe pentru locații",
      context,
      research: true,
    });
    expect(result.webCitations).toEqual([
      {
        url: "https://example.org/ghid",
        title: "Ghid verificat",
        excerpt: "Rezumatul sursei.",
      },
    ]);
    expect(result.proposal).toBeUndefined();
    expect(result.plan).toBeUndefined();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      tools: Array<{ type: string }>;
    };
    expect(body.tools).toEqual([
      {
        type: "openrouter:web_search",
        parameters: { engine: "auto", max_results: 5 },
      },
    ]);
    expect(parseOpenRouterCitations(undefined)).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("fails web research honestly when the provider returns no citations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "openai/gpt-5.6-luna",
            choices: [
              {
                message: {
                  content: JSON.stringify({ answer: "Răspuns fără dovezi" }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await new OpenRouterCopilotProvider(
      "https://openrouter.ai/api/v1/chat/completions",
      "test-only-key",
    ).run({
      message: "Caută tendințe pentru locații",
      context,
      research: true,
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.answer).toContain(
      "Nu am putut accesa surse web verificabile",
    );
    expect(result.webCitations).toBeUndefined();
    expect(result.proposal).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("rejects an AI proposal that understates the enforced risk", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answer: "Am pregătit planul.",
            proposal: {
              actionType: "CREATE_CONTINGENCY_PLAN",
              riskLevel: "LOW",
              title: "Plan B",
              preview: { title: "Plan B" },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const result = await new ConfiguredAiCopilotProvider(
      "https://provider.example.test",
      "secret",
    ).run({ message: "Ajută-mă cu vremea", context });
    expect(result.fallbackUsed).toBe(true);
    expect(result.proposal).toBeUndefined();
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
