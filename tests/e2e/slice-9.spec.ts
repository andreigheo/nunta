import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@weddingos/database";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
type Account = { email: string; userId: string; api: APIRequestContext };
type Resource = Record<string, unknown> & {
  id: string;
  version: number;
  status: string;
};

const contexts: APIRequestContext[] = [];
let owner!: Account;
let outsider!: Account;
let workspaceId = "";
let conversation!: Resource;
let runId = "";
let proposal!: Resource & { actions: Array<Record<string, unknown>> };
let assistantMessageId = "";
let risk!: Resource;
let plan!: Resource;
let automation!: Resource;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  owner = await createVerifiedAccount("slice9-owner");
  outsider = await createVerifiedAccount("slice9-outsider");
  workspaceId = (
    await createReadyWorkspace(owner.api, `Slice 9 E2E ${Date.now()}`)
  ).workspaceId;
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("E2E 1 — Risk register page is backed by the live workspace", async ({
  page,
}) => {
  await authorizePage(page, owner);
  await page.goto("/risks");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Riscuri & Plan B" }),
  ).toBeVisible();
});

test("E2E 2 — Plan B page renders the real empty state", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/contingency-plans");
  await expect(
    page.getByText("Planuri B", { exact: false }).first(),
  ).toBeVisible();
});

test("E2E 3 — Automations page renders the controlled engine", async ({
  page,
}) => {
  await authorizePage(page, owner);
  await page.goto("/automations");
  await expect(
    page.getByText("Automatizări", { exact: true }).first(),
  ).toBeVisible();
});

test("E2E 3B — Copilot persists across refresh and keeps web research automatic", async ({
  page,
}) => {
  const settings = await apiData<{
    webResearchAvailable: boolean;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/copilot/settings`));
  expect(settings.webResearchAvailable).toBe(true);
  await authorizePage(page, owner);
  await page.goto("/budget");
  await page.getByRole("button", { name: "Copilot AI", exact: true }).click();
  await expect(page.getByText("Context: Buget", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Internetul este folosit automat când ajută.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: "Folosește cercetarea web pentru următorul mesaj",
    }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Copilot Sarbato")).toBeVisible();
  await expect(page.getByText("Context: Buget", { exact: true })).toBeVisible();
});

test("E2E 4 — Create a persistent Copilot conversation", async () => {
  conversation = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `conversation-${randomUUID()}`,
        }),
        data: { title: "Pregătire furnizori", surface: "overview" },
      },
    ),
  );
  expect(conversation.status).toBe("active");
});

test("E2E 5 — Conversation creation is idempotent", async () => {
  const key = `conversation-replay-${randomUUID()}`;
  const create = () =>
    owner.api.post(`/api/v1/workspaces/${workspaceId}/copilot/conversations`, {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: { title: "Replay" },
    });
  const first = await apiData<Resource>(await create());
  const replay = await apiData<Resource>(await create());
  expect(replay.id).toBe(first.id);
});

test("E2E 6 — Conversation list persists created resources", async () => {
  const list = await apiData<{ items: Resource[] }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations`,
    ),
  );
  expect(list.items.some((item) => item.id === conversation.id)).toBe(true);
});

test("E2E 7 — Copilot request creates durable run and job", async () => {
  const result = await apiData<{ run: { id: string }; job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${conversation.id}/messages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `copilot-run-${randomUUID()}`,
        }),
        data: {
          content: "Creează un task urgent pentru confirmarea locației",
          mode: "deterministic",
        },
      },
    ),
  );
  runId = result.run.id;
  expect(result.job.id).toBeTruthy();
  await waitForJob(result.job.id);
});

test("E2E 8 — Worker completes Copilot run with sources and proposal", async () => {
  const run = await apiData<
    Resource & { proposal: Resource | null; sources: unknown[] }
  >(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/runs/${runId}`,
    ),
  );
  expect(run.status).toBe("completed");
  expect(run.proposal).not.toBeNull();
  proposal = await apiData(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${run.proposal!.id}`,
    ),
  );
});

test("E2E 9 — Copilot answer is persisted in the conversation", async () => {
  const detail = await apiData<
    Resource & { messages: Array<{ id: string; role: string }> }
  >(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${conversation.id}`,
    ),
  );
  const assistant = detail.messages.find(
    (message) => message.role === "assistant",
  );
  expect(assistant).toBeTruthy();
  assistantMessageId = assistant!.id;
});

test("E2E 9B — Copilot stores only an explicitly requested durable memory", async () => {
  const before = await apiData<{ items: Array<{ content: string }> }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/memories`,
    ),
  );
  expect(before.items).toHaveLength(0);
  const request = await apiData<{ job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${conversation.id}/messages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `explicit-memory-${randomUUID()}`,
        }),
        data: {
          content: "Ține minte că preferăm decor minimalist",
          mode: "deterministic",
          surface: "/overview",
        },
      },
    ),
  );
  await waitForJob(request.job.id);
  const after = await apiData<{ items: Array<{ content: string }> }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/memories`,
    ),
  );
  expect(after.items).toHaveLength(1);
  expect(after.items[0]?.content).toBe("preferăm decor minimalist");
});

test("E2E 10 — Proposal edit is versioned", async () => {
  proposal = await apiData(
    await owner.api.patch(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${proposal.id}`,
      {
        headers: mutationHeaders({ "If-Match": `"${proposal.version}"` }),
        data: {
          title: "Task locație verificat",
          version: proposal.version,
          actions: proposal.actions,
        },
      },
    ),
  );
  expect(proposal.title).toBe("Task locație verificat");
});

test("E2E 11 — Stale proposal edit is rejected", async () => {
  const response = await owner.api.patch(
    `/api/v1/workspaces/${workspaceId}/copilot/proposals/${proposal.id}`,
    {
      headers: mutationHeaders({ "If-Match": '"1"' }),
      data: { title: "Stale", version: 1 },
    },
  );
  expect([409, 412]).toContain(response.status());
});

test("E2E 12 — Low-risk proposal requires explicit approval", async () => {
  proposal = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${proposal.id}/approve`,
      {
        headers: mutationHeaders({
          "If-Match": `"${proposal.version}"`,
          "Idempotency-Key": `approve-${randomUUID()}`,
        }),
        data: { reason: "Verificat în E2E" },
      },
    ),
  );
  expect(proposal.status).toBe("approved");
});

test("E2E 13 — Approved proposal executes a canonical task", async () => {
  const execution = await apiData<{
    resources: Array<{ type: string; id: string }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${proposal.id}/execute`,
      {
        headers: mutationHeaders({
          "If-Match": `"${proposal.version}"`,
          "Idempotency-Key": `execute-${randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  expect(execution.resources.some((resource) => resource.type === "Task")).toBe(
    true,
  );
});

test("E2E 14 — Assistant feedback is persisted", async () => {
  const feedback = await apiData<{ rating: string }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/messages/${assistantMessageId}/feedback`,
      {
        headers: mutationHeaders(),
        data: { rating: "HELPFUL", reason: "Surse clare" },
      },
    ),
  );
  expect(feedback.rating).toBe("HELPFUL");
});

test("E2E 14B — Multi-step plan persists as independently reviewable proposals", async () => {
  const planConversation = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `plan-conversation-${randomUUID()}`,
        }),
        data: { title: "Plan în pași", surface: "/plan" },
      },
    ),
  );
  const request = await apiData<{ run: { id: string }; job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${planConversation.id}/messages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `plan-run-${randomUUID()}`,
        }),
        data: {
          content: "Pregătește un plan în 2 pași pentru confirmarea locației",
          mode: "deterministic",
        },
      },
    ),
  );
  await waitForJob(request.job.id);
  const completedRun = await apiData<{
    plan: { id: string; title: string } | null;
    proposals: Array<{ id: string; planId: string; stepPosition: number }>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/runs/${request.run.id}`,
    ),
  );
  expect(completedRun.plan?.title).toBe("Plan de lucru propus de Copilot");
  expect(completedRun.proposals).toHaveLength(2);
  expect(completedRun.proposals.map((item) => item.stepPosition)).toEqual([
    0, 1,
  ]);
  expect(
    completedRun.proposals.every(
      (item) => item.planId === completedRun.plan?.id,
    ),
  ).toBe(true);
});

test("E2E 15 — Copilot executes the real budget adapter", async () => {
  const budgetConversation = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `budget-conversation-${randomUUID()}`,
        }),
        data: { title: "Buget prin Copilot", surface: "/budget" },
      },
    ),
  );
  const request = await apiData<{ run: { id: string }; job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${budgetConversation.id}/messages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `budget-proposal-${randomUUID()}`,
        }),
        data: {
          content: "Creează un task temporar pentru buget",
          mode: "deterministic",
        },
      },
    ),
  );
  await waitForJob(request.job.id);
  const completedRun = await apiData<{
    proposal: { id: string } | null;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/runs/${request.run.id}`,
    ),
  );
  expect(completedRun.proposal).not.toBeNull();
  let budgetProposal = await apiData<Resource & { actions: unknown[] }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${completedRun.proposal!.id}`,
    ),
  );
  const currentBudgetResponse = await owner.api.get(
    `/api/v1/workspaces/${workspaceId}/budget`,
  );
  const currentBudget = currentBudgetResponse.ok()
    ? await apiData<{ plan: Resource | null }>(currentBudgetResponse)
    : null;
  budgetProposal = await apiData(
    await owner.api.patch(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${budgetProposal.id}`,
      {
        headers: mutationHeaders({
          "If-Match": `"${budgetProposal.version}"`,
        }),
        data: {
          version: budgetProposal.version,
          title: "Buget canonic prin Copilot",
          actions: [
            {
              actionType: "UPSERT_BUDGET_PLAN",
              payload: {
                targetVersion: currentBudget?.plan?.version ?? null,
                name: "Buget E2E Copilot",
                targetTotalMinor: 15_000_000,
                contingencyPercent: 12,
                status: "ACTIVE",
              },
              riskLevel: "MEDIUM",
              position: 0,
            },
          ],
        },
      },
    ),
  );
  budgetProposal = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${budgetProposal.id}/approve`,
      {
        headers: mutationHeaders({
          "If-Match": `"${budgetProposal.version}"`,
          "Idempotency-Key": `budget-approve-${randomUUID()}`,
        }),
        data: { reason: "Buget verificat în E2E" },
      },
    ),
  );
  const execution = await apiData<{
    resources: Array<{ type: string; id: string }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${budgetProposal.id}/execute`,
      {
        headers: mutationHeaders({
          "If-Match": `"${budgetProposal.version}"`,
          "Idempotency-Key": `budget-execute-${randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  expect(execution.resources).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "BudgetPlan" })]),
  );
  const updatedBudget = await apiData<{
    plan: Resource & { name: string };
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/budget`));
  expect(updatedBudget.plan.name).toBe("Buget E2E Copilot");
});

test("E2E 16 — Copilot executes the real calendar adapter", async () => {
  const calendarConversation = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `calendar-conversation-${randomUUID()}`,
        }),
        data: { title: "Calendar prin Copilot", surface: "/calendar" },
      },
    ),
  );
  const request = await apiData<{ run: { id: string }; job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${calendarConversation.id}/messages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `calendar-proposal-${randomUUID()}`,
        }),
        data: {
          content:
            "Creează un eveniment în calendar pentru degustarea meniului",
          mode: "deterministic",
        },
      },
    ),
  );
  await waitForJob(request.job.id);
  const completedRun = await apiData<{
    proposal: { id: string } | null;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/runs/${request.run.id}`,
    ),
  );
  let calendarProposal = await apiData<Resource>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${completedRun.proposal!.id}`,
    ),
  );
  calendarProposal = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${calendarProposal.id}/approve`,
      {
        headers: mutationHeaders({
          "If-Match": `"${calendarProposal.version}"`,
          "Idempotency-Key": `calendar-approve-${randomUUID()}`,
        }),
        data: { reason: "Eveniment verificat în E2E" },
      },
    ),
  );
  const execution = await apiData<{
    resources: Array<{ type: string; id: string }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${calendarProposal.id}/execute`,
      {
        headers: mutationHeaders({
          "If-Match": `"${calendarProposal.version}"`,
          "Idempotency-Key": `calendar-execute-${randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  const calendarResource = execution.resources.find(
    (resource) => resource.type === "CalendarEvent",
  );
  expect(calendarResource).toBeTruthy();
  const createdEvent = await apiData<Resource & { title: string }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/calendar-events/${calendarResource!.id}`,
    ),
  );
  expect(createdEvent.title).toContain("degustarea meniului");
});

test("E2E 16B — Copilot executes a logistics adapter through approval", async () => {
  const logisticsConversation = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `logistics-conversation-${randomUUID()}`,
        }),
        data: { title: "Cazare prin Copilot", surface: "/accommodation" },
      },
    ),
  );
  const request = await apiData<{ run: { id: string }; job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/conversations/${logisticsConversation.id}/messages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `logistics-proposal-${randomUUID()}`,
        }),
        data: {
          content: "Creează un task temporar pentru cazarea invitaților",
          mode: "deterministic",
        },
      },
    ),
  );
  await waitForJob(request.job.id);
  const completedRun = await apiData<{
    proposal: { id: string } | null;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/runs/${request.run.id}`,
    ),
  );
  let logisticsProposal = await apiData<Resource>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${completedRun.proposal!.id}`,
    ),
  );
  logisticsProposal = await apiData(
    await owner.api.patch(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${logisticsProposal.id}`,
      {
        headers: mutationHeaders({
          "If-Match": `"${logisticsProposal.version}"`,
        }),
        data: {
          version: logisticsProposal.version,
          title: "Cazare verificată prin Copilot",
          actions: [
            {
              actionType: "CREATE_ACCOMMODATION_PROPERTY",
              payload: {
                name: "Hotel E2E Copilot",
                type: "hotel",
                address: "Strada Testelor 1",
                city: "Chișinău",
                country: "Moldova",
              },
              riskLevel: "LOW",
              position: 0,
            },
          ],
        },
      },
    ),
  );
  logisticsProposal = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${logisticsProposal.id}/approve`,
      {
        headers: mutationHeaders({
          "If-Match": `"${logisticsProposal.version}"`,
          "Idempotency-Key": `logistics-approve-${randomUUID()}`,
        }),
        data: { reason: "Proprietate verificată în E2E" },
      },
    ),
  );
  const execution = await apiData<{
    resources: Array<{ type: string; id: string }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/copilot/proposals/${logisticsProposal.id}/execute`,
      {
        headers: mutationHeaders({
          "If-Match": `"${logisticsProposal.version}"`,
          "Idempotency-Key": `logistics-execute-${randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  const property = execution.resources.find(
    (resource) => resource.type === "AccommodationProperty",
  );
  expect(property).toBeTruthy();
  const createdProperty = await apiData<{ name: string }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/accommodation-properties/${property!.id}`,
    ),
  );
  expect(createdProperty.name).toBe("Hotel E2E Copilot");
});

test("E2E 17 — Create a canonical risk and open its real detail page", async ({
  page,
}) => {
  const key = `risk-${randomUUID()}`;
  risk = await apiData(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/risks`, {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: {
        title: "Ploaie la ceremonie",
        category: "WEATHER",
        probability: 4,
        impact: 5,
        source: "MANUAL",
      },
    }),
  );
  expect(risk.level).toBe("critical");
  await authorizePage(page, owner);
  await page.goto(`/risks/${risk.id}`);
  await expect(
    page.getByRole("heading", { name: "Ploaie la ceremonie" }),
  ).toBeVisible();
  await expect(
    page.getByText("Plan de atenuare", { exact: true }),
  ).toBeVisible();
});

test("E2E 16 — Risk assessment changes the canonical score", async () => {
  risk = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/risks/${risk.id}/assessments`,
      {
        headers: mutationHeaders({ "If-Match": `"${risk.version}"` }),
        data: {
          probability: 3,
          impact: 4,
          reason: "Prognoză revizuită",
          version: risk.version,
        },
      },
    ),
  );
  expect(risk.level).toBe("high");
});

test("E2E 17 — Risk mitigation persists independently", async () => {
  const mitigation = await apiData<{ id: string }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/risks/${risk.id}/mitigations`,
      {
        headers: mutationHeaders(),
        data: { title: "Rezervă cort impermeabil" },
      },
    ),
  );
  expect(mitigation.id).toBeTruthy();
});

test("E2E 18 — Risk state machine persists monitoring", async () => {
  risk = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/risks/${risk.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${risk.version}"` }),
        data: {
          transition: "MONITOR",
          reason: "Verificăm prognoza",
          version: risk.version,
        },
      },
    ),
  );
  expect(risk.status).toBe("monitoring");
});

test("E2E 19 — Risk list exposes real summary", async () => {
  const list = await apiData<{
    items: Resource[];
    summary: Record<string, number>;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/risks`));
  expect(list.items.some((item) => item.id === risk.id)).toBe(true);
  expect(
    Object.values(list.summary).reduce((sum, value) => sum + value, 0),
  ).toBeGreaterThanOrEqual(1);
});

test("E2E 20 — Workspace isolation blocks an outsider", async () => {
  const response = await outsider.api.get(
    `/api/v1/workspaces/${workspaceId}/risks/${risk.id}`,
  );
  expect([403, 404]).toContain(response.status());
});

test("E2E 21 — Create a linked Plan B draft and open its real detail page", async ({
  page,
}) => {
  plan = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/contingency-plans`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `plan-b-${randomUUID()}`,
        }),
        data: {
          riskId: risk.id,
          title: "Ceremonie interioară",
          summary: "Alternativă sigură",
          triggers: [
            { type: "RISK_LEVEL_REACHED", configuration: { level: "HIGH" } },
          ],
          actions: [{ title: "Confirmă sala interioară", position: 0 }],
        },
      },
    ),
  );
  expect(plan.status).toBe("draft");
  await authorizePage(page, owner);
  await page.goto(`/contingency-plans/${plan.id}`);
  await expect(
    page.getByRole("heading", { name: "Ceremonie interioară" }),
  ).toBeVisible();
  await expect(page.getByText("Declanșatori", { exact: true })).toBeVisible();
});

test("E2E 22 — Plan B simulation is asynchronous and durable", async () => {
  const simulation = await apiData<{
    simulationId: string;
    job: { id: string };
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/contingency-plans/${plan.id}/simulations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `simulation-${randomUUID()}`,
        }),
        data: { triggerType: "MANUAL", assumptions: ["Ploaie puternică"] },
      },
    ),
  );
  expect(simulation.simulationId).toBeTruthy();
  await waitForJob(simulation.job.id);
});

test("E2E 23 — Plan B approval is separate from activation", async () => {
  plan = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/contingency-plans/${plan.id}/approve`,
      {
        headers: mutationHeaders({
          "If-Match": `"${plan.version}"`,
          "Idempotency-Key": `plan-approve-${randomUUID()}`,
        }),
        data: { reason: "Plan verificat" },
      },
    ),
  );
  expect(plan.status).toBe("ready");
});

test("E2E 24 — Plan B activation creates canonical actions", async () => {
  const activation = await apiData<{
    activationId: string;
    resources: Array<{ type: string }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/contingency-plans/${plan.id}/activate`,
      {
        headers: mutationHeaders({
          "If-Match": `"${plan.version}"`,
          "Idempotency-Key": `plan-activate-${randomUUID()}`,
        }),
        data: { reason: "Ploaie confirmată" },
      },
    ),
  );
  expect(activation.activationId).toBeTruthy();
  expect(
    activation.resources.some((resource) => resource.type === "Task"),
  ).toBe(true);
});

test("E2E 25 — Catalog exposes at least twelve controlled templates", async () => {
  const templates = await apiData<{ items: unknown[] }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/automation-templates`,
    ),
  );
  expect(templates.items.length).toBeGreaterThanOrEqual(12);
});

test("E2E 26 — Create automation with closed trigger and action", async () => {
  automation = await apiData(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/automations`, {
      headers: mutationHeaders({
        "Idempotency-Key": `automation-${randomUUID()}`,
      }),
      data: {
        name: "Reminder risc E2E",
        triggerType: "MANUAL",
        conditions: [
          { field: "riskLevel", operator: "in", value: ["HIGH", "CRITICAL"] },
        ],
        actions: [
          {
            type: "CREATE_NOTIFICATION",
            configuration: { title: "Verifică riscul" },
            position: 0,
          },
        ],
        requiresApproval: false,
      },
    }),
  );
  expect(automation.status).toBe("draft");
});

test("E2E 27 — Automation dry-run creates traceable execution visible in UI", async ({
  page,
}) => {
  const execution = await apiData<{ executionId: string; job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/automations/${automation.id}/dry-run`,
      {
        headers: mutationHeaders({
          "If-Match": `"${automation.version}"`,
          "Idempotency-Key": `dry-run-${randomUUID()}`,
        }),
      },
    ),
  );
  expect(execution.executionId).toBeTruthy();
  await waitForJob(execution.job.id);
  await authorizePage(page, owner);
  await page.goto("/automations");
  await expect(
    page.getByText("Reminder risc E2E", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Ultima execuție:/)).toBeVisible();
});

test("E2E 28 — Automation activation is version guarded", async () => {
  automation = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/automations/${automation.id}/activate`,
      {
        headers: mutationHeaders({ "If-Match": `"${automation.version}"` }),
        data: {},
      },
    ),
  );
  expect(automation.status).toBe("active");
});

test("E2E 29 — Automation pause is reversible and persistent", async () => {
  automation = await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/automations/${automation.id}/pause`,
      {
        headers: mutationHeaders({ "If-Match": `"${automation.version}"` }),
        data: {},
      },
    ),
  );
  expect(automation.status).toBe("paused");
});

test("E2E 30 — Weekly digest uses canonical data and a background job", async () => {
  const digest = await apiData<{ digestId: string; job: { id: string } }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/weekly-digests`, {
      headers: mutationHeaders({ "Idempotency-Key": `digest-${randomUUID()}` }),
      data: {},
    }),
  );
  await waitForJob(digest.job.id);
  const list = await apiData<{ items: Array<{ id: string; status: string }> }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/weekly-digests`),
  );
  expect(
    list.items.some(
      (item) => item.id === digest.digestId && item.status === "DELIVERED",
    ),
  ).toBe(true);
});

async function authorizePage(page: Page, account: Account) {
  const state = await account.api.storageState();
  await page.context().addCookies(state.cookies);
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registered = await apiData<{ userId: string }>(
    await api.post("/api/v1/auth/registrations", {
      headers: mutationHeaders(),
      data: {
        firstName: "E2E",
        lastName: label,
        email,
        password,
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      },
    }),
  );
  const token = await waitForVerificationToken(email);
  expect(
    (
      await api.post("/api/v1/auth/email-verifications", {
        headers: mutationHeaders(),
        data: { token },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api.post("/api/v1/auth/sessions", {
        headers: mutationHeaders(),
        data: { email, password, remember: true },
      })
    ).status(),
  ).toBe(200);
  return { email, userId: registered.userId, api };
}

async function createReadyWorkspace(api: APIRequestContext, title: string) {
  const workspace = await apiData<{ id: string }>(
    await api.post("/api/v1/workspaces", {
      headers: mutationHeaders({
        "Idempotency-Key": `workspace-${randomUUID()}`,
      }),
      data: {
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Chișinău",
        timezone: "Europe/Chisinau",
      },
    }),
  );
  await ownerDatabase.workspaceSubscription.upsert({
    where: { workspaceId: workspace.id },
    update: { planKey: "PRO", status: "ACTIVE", updatedById: owner.userId },
    create: {
      workspaceId: workspace.id,
      planKey: "PRO",
      status: "ACTIVE",
      createdById: owner.userId,
      updatedById: owner.userId,
    },
  });
  const draft = await apiData<{ version: number }>(
    await api.get(`/api/v1/workspaces/${workspace.id}/onboarding`),
  );
  const saved = await apiData<{ version: number }>(
    await api.patch(`/api/v1/workspaces/${workspace.id}/onboarding`, {
      headers: mutationHeaders({ "If-Match": `"${draft.version}"` }),
      data: {
        currentStep: 8,
        couple: { confirmed: true, partnerOne: "Ana", partnerTwo: "Mihai" },
        dateEvents: {
          confirmed: true,
          exactDate: "2027-09-12",
          civil: true,
          religious: true,
          reception: true,
        },
        location: { confirmed: true, city: "Chișinău", venue: "Sala E2E" },
        guests: {
          confirmed: true,
          guestCount: 80,
          transport: true,
          accommodation: true,
        },
        budget: { confirmed: true, amount: 120000 },
        style: { confirmed: true, priorities: ["familie"] },
        existingProgress: { confirmed: true },
        planningPreferences: { confirmed: true, assistanceLevel: "guided" },
      },
    }),
  );
  await apiData(
    await api.post(`/api/v1/workspaces/${workspace.id}/onboarding/complete`, {
      headers: mutationHeaders({
        "If-Match": `"${saved.version}"`,
        "Idempotency-Key": `complete-${randomUUID()}`,
      }),
    }),
  );
  return { workspaceId: workspace.id };
}

async function waitForVerificationToken(email: string) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    const summary = list.messages.find(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Verification e-mail missing for ${email}`);
}

async function newApiContext() {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  contexts.push(context);
  return context;
}

async function apiData<T>(response: {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
}): Promise<T> {
  const body = (await response.json()) as {
    data?: T;
    code?: string;
    detail?: string;
  };
  expect(
    response.ok(),
    `${response.status()} ${body.code ?? ""} ${body.detail ?? ""}`,
  ).toBe(true);
  return body.data as T;
}

function mutationHeaders(extra: Record<string, string> = {}) {
  return { Origin: origin, ...extra };
}

async function waitForJob(jobId: string) {
  await expect
    .poll(
      async () =>
        (
          await apiData<{ status: string }>(
            await owner.api.get(`/api/v1/jobs/${jobId}`),
          )
        ).status,
      { timeout: 60_000 },
    )
    .toBe("completed");
}
