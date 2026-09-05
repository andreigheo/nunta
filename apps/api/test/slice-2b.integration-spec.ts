import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { assertDestructiveDatabasePurpose } from "./database-identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";

const origin = process.env.WEB_URL!;
const database = new PrismaClient({
  datasourceUrl: process.env.DATABASE_OWNER_URL!,
});

type Account = {
  email: string;
  userId: string;
  agent: ReturnType<typeof request.agent>;
};

describe.sequential("Slice 2B planning integration", () => {
  let application!: INestApplication;
  let owner!: Account;
  let outsider!: Account;

  beforeAll(async () => {
    if (process.env.WEDDINGOS_INTEGRATION_DATABASE_PREPARED !== "true") {
      await cleanDatabase();
    }
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = module.createNestApplication();
    application.use(cookieParser());
    application.useGlobalFilters(new ProblemFilter());
    await application.init();
    owner = await createAccount("planning-owner");
    outsider = await createAccount("planning-outsider");
  }, 180_000);

  afterAll(async () => {
    await application?.close();
    await database.$disconnect();
  });

  it("generates, edits and atomically applies a structured proposal without duplicates", async () => {
    const { workspaceId, onboardingVersion } = await readyWorkspace(
      owner,
      "Plan principal",
    );
    const generationKey = `generation-${randomUUID()}`;
    const first = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/plan-generations`)
      .set("Origin", origin)
      .set("If-Match", `"${onboardingVersion}"`)
      .set("Idempotency-Key", generationKey)
      .send({ mode: "auto" })
      .expect(201);
    const replay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/plan-generations`)
      .set("Origin", origin)
      .set("If-Match", `"${onboardingVersion}"`)
      .set("Idempotency-Key", generationKey)
      .send({ mode: "auto" })
      .expect(201);
    expect(replay.body.data.job.id).toBe(first.body.data.job.id);
    await expect
      .poll(
        async () =>
          (
            await database.planGenerationRun.findUniqueOrThrow({
              where: { id: first.body.data.generationRunId },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    const run = await database.planGenerationRun.findUniqueOrThrow({
      where: { id: first.body.data.generationRunId },
    });
    const generatedProposal = await database.planProposal.findUniqueOrThrow({
      where: { generationRunId: run.id },
    });
    expect(run.fallbackUsed).toBe(true);
    expect(generatedProposal.status).toBe("READY_FOR_REVIEW");
    const proposalResponse = await owner.agent
      .get(
        `/api/v1/workspaces/${workspaceId}/plan-proposals/${generatedProposal.id}`,
      )
      .expect(200);
    const proposal = proposalResponse.body.data;
    expect(
      proposal.items.some((item: { type: string }) => item.type === "phase"),
    ).toBe(true);
    expect(proposal.coverage.missing).toEqual([]);
    const optional = flatten(proposal.items).find(
      (item) => item.type === "task" && !item.required,
    );
    const updated = await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/plan-proposals/${proposal.id}`)
      .set("Origin", origin)
      .set("If-Match", `"${proposal.version}"`)
      .send({
        itemUpdates: optional
          ? [{ id: optional.id, included: false, priority: "low" }]
          : [],
        addItems: [
          {
            type: "task",
            title: "Task manual verificat",
            category: "planning",
            priority: "high",
            required: false,
            included: true,
            position: 999,
          },
        ],
      })
      .expect(200);
    const applyKey = `apply-${randomUUID()}`;
    const applied = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/plan-proposals/${proposal.id}/apply`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${updated.body.data.version}"`)
      .set("Idempotency-Key", applyKey)
      .send({ confirmWarnings: true })
      .expect(201);
    expect(applied.body.data.phaseCount).toBeGreaterThan(0);
    expect(applied.body.data.taskCount).toBeGreaterThan(20);
    const countsBeforeReplay = await planningCounts(workspaceId);
    const replayApply = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/plan-proposals/${proposal.id}/apply`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${updated.body.data.version}"`)
      .set("Idempotency-Key", applyKey)
      .send({ confirmWarnings: true })
      .expect(201);
    expect(replayApply.body.data).toEqual(applied.body.data);
    expect(await planningCounts(workspaceId)).toEqual(countsBeforeReplay);
    expect(
      await database.taskDependency.count({ where: { workspaceId } }),
    ).toBeGreaterThan(0);
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/plan-proposals/${proposal.id}`)
      .expect(403);
  }, 180_000);

  it("persists task workflows, graph validation, calendar projections, timeline, dashboard, search and export", async () => {
    const workspaceId = (
      await database.workspace.findFirstOrThrow({
        where: { title: "Plan principal" },
      })
    ).id;
    const membership = await database.workspaceMembership.findFirstOrThrow({
      where: { workspaceId, userId: owner.userId },
    });
    const createKey = `task-${randomUUID()}`;
    const created = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set("Origin", origin)
      .set("Idempotency-Key", createKey)
      .send({
        title: "Task integrare",
        category: "planning",
        priority: "urgent",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        assigneeMembershipId: membership.id,
        position: 0,
        isPrivate: false,
      })
      .expect(201);
    const createReplay = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set("Origin", origin)
      .set("Idempotency-Key", createKey)
      .send({
        title: "Task integrare",
        category: "planning",
        priority: "urgent",
        dueAt: created.body.data.dueAt,
        assigneeMembershipId: membership.id,
        position: 0,
        isPrivate: false,
      })
      .expect(201);
    expect(createReplay.body.data.id).toBe(created.body.data.id);
    await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/tasks/${created.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .send({ transition: "START", version: created.body.data.version })
      .expect(428);
    const started = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/tasks/${created.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${created.body.data.version}"`)
      .send({ transition: "START", version: created.body.data.version })
      .expect(201);
    await owner.agent
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${created.body.data.id}`)
      .set("Origin", origin)
      .set("If-Match", `"${created.body.data.version}"`)
      .send({ title: "stale" })
      .expect(412);
    const taskA = await createTask(workspaceId, "Dependency A");
    const taskB = await createTask(workspaceId, "Dependency B");
    const bWithDependency = await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/tasks/${taskB.id}/dependencies`)
      .set("Origin", origin)
      .set("If-Match", `"${taskB.version}"`)
      .send({ dependsOnTaskIds: [taskA.id], version: taskB.version })
      .expect(200);
    await owner.agent
      .put(`/api/v1/workspaces/${workspaceId}/tasks/${taskA.id}/dependencies`)
      .set("Origin", origin)
      .set("If-Match", `"${taskA.version}"`)
      .send({ dependsOnTaskIds: [taskB.id], version: taskA.version })
      .expect(422);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/tasks/${taskB.id}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${bWithDependency.body.data.task.version}"`)
      .send({
        transition: "COMPLETE",
        version: bWithDependency.body.data.task.version,
      })
      .expect(409);
    const comment = await owner.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/tasks/${created.body.data.id}/comments`,
      )
      .set("Origin", origin)
      .send({ body: "<b>Comentariu</b> sigur" })
      .expect(201);
    expect(comment.body.data.body).toBe("Comentariu sigur");
    const event = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/calendar-events`)
      .set("Origin", origin)
      .set("Idempotency-Key", `event-${randomUUID()}`)
      .send({
        title: "Întâlnire integrare",
        eventType: "meeting",
        startAt: new Date(Date.now() + 172_800_000).toISOString(),
        allDay: false,
        timezone: "Europe/Bucharest",
      })
      .expect(201);
    const calendar = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/calendar-events`)
      .expect(200);
    expect(
      calendar.body.data.items.some(
        (item: { sourceType: string; sourceId: string }) =>
          item.sourceType === "task_due" &&
          item.sourceId === created.body.data.id,
      ),
    ).toBe(true);
    expect(
      calendar.body.data.items.some(
        (item: { sourceType: string; sourceId: string }) =>
          item.sourceType === "native_event" &&
          item.sourceId === event.body.data.sourceId,
      ),
    ).toBe(true);
    await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/calendar-events`)
      .set("Origin", origin)
      .set("Idempotency-Key", `all-day-event-${randomUUID()}`)
      .send({
        title: "Eveniment de o zi întreagă",
        eventType: "meeting",
        startAt: "2027-05-10T09:00:00.000Z",
        endAt: "2027-05-11T09:00:00.000Z",
        allDay: true,
        timezone: "Europe/Bucharest",
      })
      .expect(201);
    const calendarExport = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/calendar.ics`)
      .expect(200)
      .expect("Content-Type", /text\/calendar/);
    expect(calendarExport.text).toContain("DTSTART;VALUE=DATE:20270510");
    expect(calendarExport.text).toContain("DTEND;VALUE=DATE:20270512");
    const projected = calendar.body.data.items.find(
      (item: { sourceType: string }) => item.sourceType === "task_due",
    );
    expect(projected.editable).toBe(false);
    await owner.agent
      .patch(
        `/api/v1/workspaces/${workspaceId}/calendar-events/${projected.sourceId}`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${projected.version}"`)
      .send({ title: "Nu este permis" })
      .expect(404);
    const timeline = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/timeline`)
      .expect(200);
    expect(timeline.body.data.phases.length).toBeGreaterThan(0);
    const recalculation = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/timeline-recalculations`)
      .set("Origin", origin)
      .set("Idempotency-Key", `recalc-${randomUUID()}`)
      .send({ applyRelativeDates: false })
      .expect(201);
    expect(recalculation.body.data.preview).toBe(true);
    expect(recalculation.body.data.proposedChanges.length).toBeGreaterThan(0);
    const appliedRecalculation = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/timeline-recalculations`)
      .set("Origin", origin)
      .set("Idempotency-Key", `recalc-apply-${randomUUID()}`)
      .send({ applyRelativeDates: true })
      .expect(201);
    expect(appliedRecalculation.body.data.preview).toBe(false);
    expect(
      appliedRecalculation.body.data.proposedChanges.every(
        (change: { applied: boolean }) => change.applied,
      ),
    ).toBe(true);
    const recalculatedAgain = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/timeline-recalculations`)
      .set("Origin", origin)
      .set("Idempotency-Key", `recalc-after-apply-${randomUUID()}`)
      .send({ applyRelativeDates: false })
      .expect(201);
    expect(recalculatedAgain.body.data.proposedChanges).toHaveLength(0);
    const dashboard = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/dashboard`)
      .expect(200);
    expect(dashboard.body.data.planning.totalTasks).toBeGreaterThan(20);
    expect(dashboard.body.data.unavailableModules).toEqual({
      budget: false,
      vendors: false,
      payments: false,
      risks: false,
    });
    const search = await owner.agent
      .get(`/api/v1/workspaces/${workspaceId}/search?q=integrare`)
      .expect(200);
    expect(
      search.body.data.items.some(
        (item: { type: string }) => item.type === "task",
      ),
    ).toBe(true);
    const exportResponse = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/planning-exports`)
      .set("Origin", origin)
      .set("Idempotency-Key", `export-${randomUUID()}`)
      .send({})
      .expect(201);
    await expect
      .poll(
        async () =>
          (
            await database.backgroundJob.findUniqueOrThrow({
              where: { id: exportResponse.body.data.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    const artifact = await owner.agent
      .get(`/api/v1/jobs/${exportResponse.body.data.id}/artifact`)
      .expect(200);
    expect(artifact.headers["content-type"]).toContain("text/csv");
    expect(artifact.text).toContain(
      "task,deadline,priority,status,assignee_membership,phase",
    );
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/tasks`)
      .expect(403);
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/calendar-events`)
      .expect(403);
    await outsider.agent
      .get(`/api/v1/workspaces/${workspaceId}/timeline`)
      .expect(403);
    expect(started.body.data.status).toBe("in_progress");
  }, 180_000);

  it("delivers a version-safe reminder once and rejects a forged planning workspace", async () => {
    const workspaceA = (
      await database.workspace.findFirstOrThrow({
        where: { title: "Plan principal" },
      })
    ).id;
    const { workspaceId: workspaceB, onboardingVersion } = await readyWorkspace(
      owner,
      "Plan izolat",
    );
    const generated = await owner.agent
      .post(`/api/v1/workspaces/${workspaceB}/plan-generations`)
      .set("Origin", origin)
      .set("If-Match", `"${onboardingVersion}"`)
      .set("Idempotency-Key", `isolated-generation-${randomUUID()}`)
      .send({ mode: "deterministic" })
      .expect(201);
    const runB = await database.planGenerationRun.findUniqueOrThrow({
      where: { id: generated.body.data.generationRunId },
    });
    const marker = randomUUID();
    const forged = await database.$transaction(async (transaction) => {
      const job = await transaction.backgroundJob.create({
        data: {
          workspaceId: workspaceA,
          actorUserId: owner.userId,
          type: "planning.plan_generation_requested.v1",
          userVisible: true,
          correlationId: marker,
          deduplicationKey: `forged-plan-job:${marker}`,
          payload: { occurredAt: new Date().toISOString(), subject: {} },
        },
      });
      const outbox = await transaction.outboxMessage.create({
        data: {
          eventName: "planning.plan_generation_requested.v1",
          aggregateType: "PlanGenerationRun",
          aggregateId: runB.id,
          workspaceId: workspaceA,
          actorUserId: owner.userId,
          backgroundJobId: job.id,
          correlationId: marker,
          deduplicationKey: `forged-plan:${marker}`,
          payload: {
            occurredAt: new Date().toISOString(),
            subject: {},
            planGeneration: {
              generationRunId: runB.id,
              mode: "deterministic",
              workspaceId: workspaceB,
            },
          },
        },
      });
      return transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          backgroundJobId: job.id,
          consumerName: "plan_generation",
          deduplicationKey: `forged-plan-consumer:${marker}`,
        },
      });
    });
    await expect
      .poll(
        async () =>
          (
            await database.outboxConsumerExecution.findUniqueOrThrow({
              where: { id: forged.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("DEAD_LETTER");
    expect(
      (
        await database.outboxConsumerExecution.findUniqueOrThrow({
          where: { id: forged.id },
        })
      ).lastErrorCode,
    ).toBe("PLAN_GENERATION_RUN_INVALID");
    const reminder = await owner.agent
      .post(`/api/v1/workspaces/${workspaceA}/tasks`)
      .set("Origin", origin)
      .set("Idempotency-Key", `reminder-${randomUUID()}`)
      .send({
        title: "Reminder integrare",
        category: "planning",
        priority: "high",
        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
        position: 0,
        isPrivate: false,
        reminder: {
          scheduledAt: new Date(Date.now() + 2_000).toISOString(),
          channel: "in_app",
        },
      })
      .expect(201);
    await expect
      .poll(
        async () =>
          database.notification.count({
            where: {
              workspaceId: workspaceA,
              kind: "task_reminder",
              actionUrl: `/plan?task=${reminder.body.data.id}`,
            },
          }),
        { timeout: 60_000 },
      )
      .toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(
      await database.notification.count({
        where: {
          workspaceId: workspaceA,
          kind: "task_reminder",
          actionUrl: `/plan?task=${reminder.body.data.id}`,
        },
      }),
    ).toBe(1);
  }, 180_000);

  async function createAccount(label: string): Promise<Account> {
    const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registration = await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Test",
        lastName: label,
        email,
        password: "WeddingOS2026!",
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      })
      .expect(201);
    const token = await waitForToken(email);
    await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token })
      .expect(200);
    const agent = request.agent(application.getHttpServer());
    await agent
      .post("/api/v1/auth/sessions")
      .set("Origin", origin)
      .send({ email, password: "WeddingOS2026!", remember: true })
      .expect(200);
    return { email, userId: registration.body.data.userId, agent };
  }

  async function readyWorkspace(account: Account, title: string) {
    const workspace = await account.agent
      .post("/api/v1/workspaces")
      .set("Origin", origin)
      .set("Idempotency-Key", `workspace-${randomUUID()}`)
      .send({
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Brașov",
        timezone: "Europe/Bucharest",
      })
      .expect(201);
    const workspaceId = workspace.body.data.id as string;
    const draft = await account.agent
      .get(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .expect(200);
    const saved = await account.agent
      .patch(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .set("Origin", origin)
      .set("If-Match", `"${draft.body.data.version}"`)
      .send({
        currentStep: 8,
        couple: { confirmed: true, partnerOne: "Ana", partnerTwo: "Mihai" },
        dateEvents: {
          confirmed: true,
          exactDate: "2027-09-12",
          civil: true,
          religious: true,
          reception: true,
        },
        location: { confirmed: true, city: "Brașov", venue: "Conac" },
        guests: {
          confirmed: true,
          guestCount: 120,
          transport: true,
          accommodation: true,
        },
        budget: { confirmed: true, amount: 180000 },
        style: { confirmed: true, priorities: ["foto", "muzică"] },
        existingProgress: { confirmed: true, photoVideo: true },
        planningPreferences: { confirmed: true, assistanceLevel: "guided" },
      })
      .expect(200);
    await account.agent
      .post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`)
      .set("Origin", origin)
      .set("If-Match", `"${saved.body.data.version}"`)
      .set("Idempotency-Key", `complete-${randomUUID()}`)
      .expect(201);
    const ready = await account.agent
      .get(`/api/v1/workspaces/${workspaceId}/onboarding`)
      .expect(200);
    return {
      workspaceId,
      onboardingVersion: ready.body.data.version as number,
    };
  }

  async function createTask(workspaceId: string, title: string) {
    const response = await owner.agent
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set("Origin", origin)
      .set("Idempotency-Key", `task-${randomUUID()}`)
      .send({
        title,
        category: "planning",
        priority: "medium",
        position: 0,
        isPrivate: false,
      })
      .expect(201);
    return response.body.data as { id: string; version: number };
  }
});

function flatten(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return items.flatMap((item) => [
    item,
    ...flatten((item.items as Array<Record<string, unknown>>) ?? []),
  ]);
}

async function planningCounts(workspaceId: string) {
  return Promise.all([
    database.planningPhase.count({ where: { workspaceId } }),
    database.timelineMilestone.count({ where: { workspaceId } }),
    database.task.count({ where: { workspaceId } }),
  ]);
}

async function waitForToken(email: string): Promise<string> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    for (const summary of list.messages.filter(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    )) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Verification email not delivered to ${email}`);
}

async function cleanDatabase() {
  await assertDestructiveDatabasePurpose(database, "integration");
  const tables = await database.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'database_identities', 'role_templates', 'vendor_role_templates', 'subscription_products', 'subscription_plans', 'subscription_prices', 'subscription_plan_entitlements', 'platform_fee_policies', 'platform_roles', 'legal_documents', 'legal_document_versions', 'consent_purposes', 'data_retention_policies', 'data_retention_rules')
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await database.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}
