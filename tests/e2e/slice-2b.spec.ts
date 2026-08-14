import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";

type Account = {
  email: string;
  userId: string;
  api: APIRequestContext;
};

type TaskResource = {
  id: string;
  title: string;
  status: string;
  version: number;
  dueAt: string | null;
  phaseId: string | null;
  dependencyCount: number;
};

const retainedContexts: APIRequestContext[] = [];
let main!: Account;
let workspaceId!: string;
let generatedJobId!: string;
let generatedProposalId!: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  main = await createVerifiedAccount("slice-2b-main");
  const ready = await createReadyWorkspace(main.api, "Slice 2B E2E principal");
  workspaceId = ready.workspaceId;
  const generated = await apiData<{
    job: { id: string };
    generationRunId: string;
  }>(
    await main.api.post(`/api/v1/workspaces/${workspaceId}/plan-generations`, {
      headers: mutationHeaders({
        "If-Match": `"${ready.onboardingVersion}"`,
        "Idempotency-Key": `generate-${crypto.randomUUID()}`,
      }),
      data: { mode: "auto" },
    }),
  );
  generatedJobId = generated.job.id;
  await expect
    .poll(
      async () => {
        const job = await apiData<{ status: string }>(
          await main.api.get(`/api/v1/jobs/${generatedJobId}`),
        );
        return job.status;
      },
      { timeout: 60_000 },
    )
    .toBe("completed");
  const proposals = await apiData<{
    items: Array<{ id: string; status: string }>;
  }>(await main.api.get(`/api/v1/workspaces/${workspaceId}/plan-proposals`));
  generatedProposalId = proposals.items.find(
    (proposal) => proposal.status === "ready_for_review",
  )!.id;
});

test.afterAll(async () => {
  await Promise.all(retainedContexts.map((context) => context.dispose()));
});

test("E2E 1 — Generate and apply plan", async ({ page }) => {
  await authorizePage(page, main);
  await page.goto("/plan");
  await expect(
    page.getByRole("button", { name: "Verifică propunerea" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verifică propunerea" }).click();
  await expect(page.getByText("Acoperire minimă")).toBeVisible();
  await expect(
    page.getByText(/Fallback determinist|Determinist/).first(),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Aplică planul" }).click();
  await expect(page.getByText("Plan aplicat")).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(async () => {
      const proposal = await apiData<{ status: string }>(
        await main.api.get(
          `/api/v1/workspaces/${workspaceId}/plan-proposals/${generatedProposalId}`,
        ),
      );
      return proposal.status;
    })
    .toBe("applied");
  const tasks = await taskList(main.api, workspaceId);
  expect(tasks.length).toBeGreaterThan(20);
  const timeline = await apiData<{ phases: unknown[] }>(
    await main.api.get(`/api/v1/workspaces/${workspaceId}/timeline`),
  );
  expect(timeline.phases.length).toBeGreaterThan(0);
});

test("E2E 2 — Edit proposal", async ({ page }) => {
  const editor = await createVerifiedAccount("slice-2b-edit");
  const ready = await createReadyWorkspace(
    editor.api,
    "Propunere editabilă E2E",
  );
  const generated = await apiData<{ job: { id: string } }>(
    await editor.api.post(
      `/api/v1/workspaces/${ready.workspaceId}/plan-generations`,
      {
        headers: mutationHeaders({
          "If-Match": `"${ready.onboardingVersion}"`,
          "Idempotency-Key": `generate-edit-${crypto.randomUUID()}`,
        }),
        data: { mode: "deterministic" },
      },
    ),
  );
  await waitForJob(editor.api, generated.job.id);
  await authorizePage(page, editor);
  await page.goto("/plan");
  await page.getByRole("button", { name: "Verifică propunerea" }).click();
  const manualTitle = `Task manual E2E ${Date.now()}`;
  await page.getByPlaceholder("Titlul sarcinii").fill(manualTitle);
  await page.getByRole("button", { name: "Adaugă", exact: true }).click();
  await expect(page.getByText(manualTitle)).toBeVisible();

  const list = await apiData<{ items: Array<{ id: string }> }>(
    await editor.api.get(
      `/api/v1/workspaces/${ready.workspaceId}/plan-proposals`,
    ),
  );
  let proposal = await apiData<{
    id: string;
    version: number;
    items: Array<Record<string, unknown>>;
  }>(
    await editor.api.get(
      `/api/v1/workspaces/${ready.workspaceId}/plan-proposals/${list.items[0]!.id}`,
    ),
  );
  const optional = flatten(proposal.items).find(
    (item) => item.type === "task" && item.required === false,
  );
  proposal = await apiData<typeof proposal>(
    await editor.api.patch(
      `/api/v1/workspaces/${ready.workspaceId}/plan-proposals/${proposal.id}`,
      {
        headers: mutationHeaders({ "If-Match": `"${proposal.version}"` }),
        data: {
          itemUpdates: optional
            ? [
                {
                  id: optional.id,
                  included: false,
                  priority: "urgent",
                  absoluteDueAt: "2027-08-01T12:00:00.000Z",
                },
              ]
            : [],
        },
      },
    ),
  );
  const applied = await apiData<{ taskCount: number }>(
    await editor.api.post(
      `/api/v1/workspaces/${ready.workspaceId}/plan-proposals/${proposal.id}/apply`,
      {
        headers: mutationHeaders({
          "If-Match": `"${proposal.version}"`,
          "Idempotency-Key": `apply-edit-${crypto.randomUUID()}`,
        }),
        data: { confirmWarnings: true },
      },
    ),
  );
  expect(applied.taskCount).toBeGreaterThan(20);
  const tasks = await taskList(editor.api, ready.workspaceId);
  expect(tasks.some((task) => task.title === manualTitle)).toBe(true);
  if (optional) {
    expect(tasks.some((task) => task.title === optional.title)).toBe(false);
  }
});

test("E2E 3 — Planning persistence", async ({ page }) => {
  await authorizePage(page, main);
  await page.goto("/plan");
  const title = `Sarcină persistentă ${Date.now()}`;
  await page.getByRole("button", { name: "Sarcină nouă", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Sarcină nouă" });
  await dialog
    .getByPlaceholder("ex. Rezervă autocarele pentru oaspeți")
    .fill(title);
  await dialog.locator("select").nth(2).selectOption({ index: 1 });
  await dialog.getByRole("button", { name: "Creează sarcina" }).click();
  await expect(page.getByText(title, { exact: true }).last()).toBeVisible();
  await page.reload();
  await expect(page.getByText(title, { exact: true }).last()).toBeVisible();

  await page.evaluate(async () => {
    await fetch("/api/v1/auth/session", {
      method: "DELETE",
      credentials: "include",
    });
  });
  await page.goto("/sign-in");
  await signInThroughUi(page, main.email);
  await page.goto("/plan");
  await expect(page.getByText(title, { exact: true }).last()).toBeVisible();
  await signInApi(main.api, main.email);
});

test("E2E 4 — Board transition", async ({ page }) => {
  const task = await createTask(main.api, workspaceId, {
    title: `Board E2E ${Date.now()}`,
    dueAt: futureIso(6),
  });
  await authorizePage(page, main);
  await page.goto("/plan");
  await page.getByPlaceholder("Caută sarcini…").fill(task.title);
  await page.getByRole("radio", { name: "Panou" }).click();
  const card = page.getByText(task.title, { exact: true });
  const targetColumn = page
    .getByText("În lucru", { exact: true })
    .locator("..")
    .locator("..")
    .locator("div.border-dashed");
  const sourceBox = await card.locator("..").boundingBox();
  const targetBox = await targetColumn.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2 + 12,
    sourceBox!.y + sourceBox!.height / 2 + 12,
    { steps: 4 },
  );
  await page.mouse.move(
    targetBox!.x + targetBox!.width / 2,
    targetBox!.y + targetBox!.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await getTask(main.api, workspaceId, task.id)).status)
    .toBe("in_progress");
  await page.reload();
  await page.getByPlaceholder("Caută sarcini…").fill(task.title);
  await page.getByRole("radio", { name: "Panou" }).click();
  await expect(page.getByText(task.title, { exact: true })).toBeVisible();
});

test("E2E 5 — Dependency", async () => {
  let taskA = await createTask(main.api, workspaceId, {
    title: `Dependență A ${Date.now()}`,
  });
  let taskB = await createTask(main.api, workspaceId, {
    title: `Dependență B ${Date.now()}`,
  });
  const dependency = await apiData<{ task: TaskResource }>(
    await main.api.put(
      `/api/v1/workspaces/${workspaceId}/tasks/${taskB.id}/dependencies`,
      {
        headers: mutationHeaders({ "If-Match": `"${taskB.version}"` }),
        data: { dependsOnTaskIds: [taskA.id], version: taskB.version },
      },
    ),
  );
  taskB = dependency.task;
  expect(
    (
      await main.api.post(
        `/api/v1/workspaces/${workspaceId}/tasks/${taskB.id}/transitions`,
        {
          headers: mutationHeaders({ "If-Match": `"${taskB.version}"` }),
          data: { transition: "COMPLETE", version: taskB.version },
        },
      )
    ).status(),
  ).toBe(409);
  taskA = await transitionTask(main.api, workspaceId, taskA, "COMPLETE");
  taskB = await transitionTask(main.api, workspaceId, taskB, "COMPLETE");
  expect(taskA.status).toBe("completed");
  expect(taskB.status).toBe("completed");
});

test("E2E 6 — Calendar projection", async ({ page }) => {
  const task = await createTask(main.api, workspaceId, {
    title: `Proiecție calendar ${Date.now()}`,
    dueAt: futureIso(3),
  });
  await authorizePage(page, main);
  await page.goto("/calendar");
  await page.getByRole("radio", { name: "Agendă" }).click();
  await page.getByText(new RegExp(task.title)).click();
  await expect(page).toHaveURL(new RegExp(`/plan\\?task=${task.id}`));
  await expect(
    page.getByRole("heading", { name: task.title, exact: true }),
  ).toBeVisible();
  const calendar = await apiData<{
    items: Array<{ sourceType: string; sourceId: string }>;
  }>(await main.api.get(`/api/v1/workspaces/${workspaceId}/calendar-events`));
  expect(
    calendar.items.filter(
      (item) => item.sourceType === "task_due" && item.sourceId === task.id,
    ),
  ).toHaveLength(1);
  expect(
    calendar.items.some(
      (item) => item.sourceType === "native_event" && item.sourceId === task.id,
    ),
  ).toBe(false);
});

test("E2E 7 — Timeline", async ({ page }) => {
  const tasks = await taskList(main.api, workspaceId);
  const phaseTask = tasks.find(
    (task) => task.phaseId && task.status !== "completed",
  )!;
  const overdue = await apiData<TaskResource>(
    await main.api.patch(
      `/api/v1/workspaces/${workspaceId}/tasks/${phaseTask.id}`,
      {
        headers: mutationHeaders({ "If-Match": `"${phaseTask.version}"` }),
        data: { dueAt: "2025-01-01T12:00:00.000Z" },
      },
    ),
  );
  const completable = tasks.find(
    (task) =>
      task.phaseId &&
      task.id !== overdue.id &&
      task.status !== "completed" &&
      task.dependencyCount === 0,
  )!;
  await transitionTask(main.api, workspaceId, completable, "COMPLETE");
  await authorizePage(page, main);
  await page.goto("/timeline");
  await expect(page.getByText("Master Timeline")).toBeVisible();
  await expect(page.getByText(/întârziate/).first()).toBeVisible();
  await expect(page.getByText(/sarcini/).first()).toBeVisible();
});

test("E2E 8 — Dashboard", async ({ page }) => {
  let task = await createTask(main.api, workspaceId, {
    title: `Acțiune urgentă E2E ${Date.now()}`,
    dueAt: "2020-01-02T12:00:00.000Z",
    priority: "urgent",
  });
  await authorizePage(page, main);
  await page.goto("/overview");
  await expect(page.getByText(task.title).first()).toBeVisible();
  const before = await apiData<{
    planning: { completedTasks: number; overdueTasks: number };
    nextBestAction?: { taskId?: string };
  }>(await main.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`));
  expect(before.nextBestAction?.taskId).toBe(task.id);
  task = await transitionTask(main.api, workspaceId, task, "COMPLETE");
  await page.reload();
  const after = await apiData<typeof before>(
    await main.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`),
  );
  expect(after.planning.completedTasks).toBe(
    before.planning.completedTasks + 1,
  );
  expect(after.planning.overdueTasks).toBe(before.planning.overdueTasks - 1);
  expect(after.nextBestAction?.taskId).not.toBe(task.id);

  await page.goto("/tools");
  await expect(page.getByLabel("Număr de invitați")).toHaveValue("120");
  await expect(page.getByLabel("Buget total")).toHaveValue("180000");
  await expect(page.getByText(/zile până la/).first()).toContainText(
    "Slice 2B E2E principal",
  );
});

test("E2E 9 — Conflict", async ({ page }) => {
  const task = await createTask(main.api, workspaceId, {
    title: `Conflict E2E ${Date.now()}`,
  });
  await authorizePage(page, main);
  await page.goto(`/plan?task=${task.id}`);
  await expect(
    page.getByRole("heading", { name: task.title, exact: true }),
  ).toBeVisible();
  const serverTitle = `${task.title} — sesiunea A`;
  await apiData<TaskResource>(
    await main.api.patch(`/api/v1/workspaces/${workspaceId}/tasks/${task.id}`, {
      headers: mutationHeaders({ "If-Match": `"${task.version}"` }),
      data: { title: serverTitle },
    }),
  );
  await page.getByRole("button", { name: "Editează" }).click();
  const editTitle = page.getByRole("dialog").locator("input").first();
  await editTitle.fill(`${task.title} — sesiunea B`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvează" })
    .first()
    .click();
  await expect(
    page.getByText(/versiun|modificat|conflict/i).first(),
  ).toBeVisible();
  expect((await getTask(main.api, workspaceId, task.id)).title).toBe(
    serverTitle,
  );
});

test("E2E 10 — Tenant isolation", async () => {
  const other = await createVerifiedAccount("slice-2b-tenant");
  const otherWorkspace = await createWorkspace(
    other.api,
    "Workspace izolat Slice 2B",
  );
  const otherTask = await createTask(other.api, otherWorkspace, {
    title: `Secret tenant ${Date.now()}`,
  });
  expect(
    (
      await main.api.get(
        `/api/v1/workspaces/${otherWorkspace}/tasks/${otherTask.id}`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await main.api.get(`/api/v1/workspaces/${otherWorkspace}/plan-proposals`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await main.api.get(`/api/v1/workspaces/${otherWorkspace}/calendar-events`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await main.api.get(`/api/v1/workspaces/${otherWorkspace}/timeline`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await main.api.get(`/api/v1/workspaces/${otherWorkspace}/search?q=Secret`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await main.api.get(`/api/v1/workspaces/${otherWorkspace}/creative-state`)
    ).status(),
  ).toBe(403);
  const ownSearch = await apiData<{ items: Array<{ id: string }> }>(
    await main.api.get(`/api/v1/workspaces/${workspaceId}/search?q=Secret`),
  );
  expect(ownSearch.items.some((item) => item.id === otherTask.id)).toBe(false);
});

test("E2E 11 — Reminder", async () => {
  const task = await createTask(main.api, workspaceId, {
    title: `Reminder E2E ${Date.now()}`,
    dueAt: futureIso(1),
    reminder: {
      scheduledAt: new Date(Date.now() + 2_000).toISOString(),
      channel: "in_app",
    },
  });
  await expect
    .poll(
      async () => {
        const notifications = await apiData<{
          items: Array<{ actionUrl: string; kind: string }>;
        }>(
          await main.api.get(`/api/v1/workspaces/${workspaceId}/notifications`),
        );
        return notifications.items.filter(
          (item) =>
            item.kind === "task_reminder" &&
            item.actionUrl === `/plan?task=${task.id}`,
        ).length;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const notifications = await apiData<{
    items: Array<{ actionUrl: string; kind: string }>;
  }>(await main.api.get(`/api/v1/workspaces/${workspaceId}/notifications`));
  expect(
    notifications.items.filter(
      (item) =>
        item.kind === "task_reminder" &&
        item.actionUrl === `/plan?task=${task.id}`,
    ),
  ).toHaveLength(1);
});

test("E2E 12 — creative workspace, moodboard upload/download and post-event workflow", async ({
  page,
}) => {
  await authorizePage(page, main);
  const concept = `Grădină editorială ${Date.now()}`;
  await page.goto("/design-studio");
  await expect(
    page.getByRole("heading", { name: "Studio de design" }),
  ).toBeVisible();
  await page.getByLabel("Numele conceptului").fill(concept);
  await page
    .getByLabel("Descrierea direcției")
    .fill("Lumină caldă, texturi naturale și accente prună.");
  await page.getByRole("button", { name: "Adaugă o culoare" }).click();
  await page.getByLabel("Numele culorii 1").fill("Prună editorială");
  await page.getByRole("button", { name: "Salvează conceptul" }).click();
  await expect(page.getByText("Concept salvat")).toBeVisible();

  const firstState = await apiData<{
    version: number;
    conceptTitle: string;
    palette: Array<{ id: string; name: string; hex: string }>;
  }>(await main.api.get(`/api/v1/workspaces/${workspaceId}/creative-state`));
  expect(firstState.conceptTitle).toBe(concept);
  expect(firstState.palette.map((color) => color.name)).toContain(
    "Prună editorială",
  );

  await page.goto("/moodboards");
  await page.getByRole("button", { name: "Moodboard nou" }).click();
  const boardDialog = page.getByRole("dialog", { name: "Moodboard nou" });
  await boardDialog.getByLabel("Nume").fill("Ceremonie E2E");
  await boardDialog
    .getByRole("button", { name: "Creează moodboardul" })
    .click();
  await page.getByRole("button", { name: "Adaugă reper" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Adaugă un reper" });
  await itemDialog.getByLabel("Titlu").fill("Textură florală");
  const uploadResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/uploads" &&
      response.request().method() === "POST",
  );
  await itemDialog.locator('input[type="file"]').setInputFiles({
    name: "moodboard-e2e.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGOoCDjxH4QZYAwAWBQKPQUDd/MAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  expect((await uploadResponse).ok()).toBe(true);
  await expect(itemDialog.getByText("moodboard-e2e.png")).toBeVisible();
  await itemDialog.getByRole("button", { name: "Adaugă în moodboard" }).click();
  await page.getByRole("button", { name: "Salvează", exact: true }).click();
  await expect(page.getByText("Moodboarduri salvate")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Descarcă" }).click();
  expect((await download).suggestedFilename()).toMatch(/ceremonie-e2e\.json$/);
  await page.reload();
  await expect(
    page.getByText("Textură florală", { exact: true }),
  ).toBeVisible();
  const persistedState = await apiData<{
    version: number;
    boards: Array<{
      name: string;
      items: Array<{ label: string; mediaId: string | null }>;
    }>;
  }>(await main.api.get(`/api/v1/workspaces/${workspaceId}/creative-state`));
  expect(persistedState.version).toBeGreaterThan(firstState.version);
  expect(persistedState.boards[0]?.items[0]?.label).toBe("Textură florală");
  expect(persistedState.boards[0]?.items[0]?.mediaId).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  const persistedPayload = {
    conceptTitle: concept,
    conceptDescription: "Lumină caldă, texturi naturale și accente prună.",
    palette: firstState.palette,
    boards: persistedState.boards,
  };
  expect(
    (
      await main.api.put(`/api/v1/workspaces/${workspaceId}/creative-state`, {
        headers: mutationHeaders({
          "If-Match": `"${persistedState.version}"`,
        }),
        data: persistedPayload,
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await main.api.put(`/api/v1/workspaces/${workspaceId}/creative-state`, {
        headers: mutationHeaders({
          "If-Match": `"${persistedState.version}"`,
        }),
        data: persistedPayload,
      })
    ).status(),
  ).toBe(412);

  const closeTask = `Mulțumiri E2E ${Date.now()}`;
  await page.goto("/post-wedding");
  await page.getByRole("button", { name: "Adaugă un pas" }).click();
  const taskDialog = page.getByRole("dialog", { name: "Pas post-eveniment" });
  await taskDialog.getByLabel("Titlu").fill(closeTask);
  await taskDialog
    .getByLabel("Descriere")
    .fill("Confirmă închiderea reală a fluxului.");
  await taskDialog.getByRole("button", { name: "Creează pasul" }).click();
  await expect(page.getByText(closeTask, { exact: true })).toBeVisible();
  const row = page
    .getByText(closeTask, { exact: true })
    .locator("..")
    .locator("..");
  await row.getByRole("button", { name: "Finalizează" }).click();
  await expect(row.getByRole("button", { name: "Redeschide" })).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByText(closeTask, { exact: true })
      .locator("..")
      .locator("..")
      .getByRole("button", { name: "Redeschide" }),
  ).toBeVisible();
});

test("E2E 13 — all organizer surfaces render without runtime or backend failures", async ({
  page,
}) => {
  await authorizePage(page, main);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/api/v1/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${pathname}`);
    }
  });

  const routes = [
    "/overview",
    "/plan",
    "/calendar",
    "/timeline",
    "/guests",
    "/invitations",
    "/invitations/editor",
    "/rsvp",
    "/menus",
    "/seating",
    "/transport",
    "/accommodation",
    "/marketplace",
    "/favorites",
    "/shortlists",
    "/requests",
    "/offers",
    "/bookings",
    "/contracts",
    "/documents",
    "/payments",
    "/budget",
    "/team",
    "/settings",
    "/activity",
    "/risks",
    "/contingency-plans",
    "/automations",
    "/tools",
    "/wedding-day",
    "/moments",
    "/reviews",
    "/archive",
    "/design-studio",
    "/moodboards",
    "/post-wedding",
  ];

  for (const route of routes) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/(sign-in|session-expired)$/);
    await expect(page.getByText("Application error")).toHaveCount(0);
    await page.waitForTimeout(150);
  }

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("E2E 14 — Demo", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/"))
      apiRequests.push(request.url());
  });
  await page.context().addCookies([
    {
      name: "weddingos_demo",
      value: "1",
      url: origin,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/plan?demo=1");
  const taskTitle = `Task demo ${Date.now()}`;
  await page.getByRole("button", { name: "Sarcină nouă", exact: true }).click();
  const taskDialog = page.getByRole("dialog", { name: "Sarcină nouă" });
  await taskDialog
    .getByPlaceholder("ex. Rezervă autocarele pentru oaspeți")
    .fill(taskTitle);
  await taskDialog.getByRole("button", { name: "Creează sarcina" }).click();
  await expect(page.getByText(taskTitle, { exact: true })).toHaveCount(2);
  await page.goto("/calendar?demo=1");
  await page.getByRole("button", { name: "Eveniment", exact: true }).click();
  const eventDialog = page.getByRole("dialog", { name: "Eveniment nou" });
  await eventDialog
    .locator("input")
    .first()
    .fill(`Eveniment demo ${Date.now()}`);
  await eventDialog.getByRole("button", { name: "Adaugă evenimentul" }).click();
  expect(apiRequests).toEqual([]);
});

async function authorizePage(page: Page, account: Account): Promise<void> {
  const state = await account.api.storageState();
  await page.context().addCookies(state.cookies);
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = uniqueEmail(label);
  const registration = await api.post("/api/v1/auth/registrations", {
    headers: mutationHeaders(),
    data: {
      firstName: "E2E",
      lastName: label,
      email,
      password,
      acceptedTermsVersion: "2026-07-18",
      marketingConsent: false,
    },
  });
  const registered = await apiData<{ userId: string }>(registration);
  const token = await waitForEmailToken(email);
  expect(
    (
      await api.post("/api/v1/auth/email-verifications", {
        headers: mutationHeaders(),
        data: { token },
      })
    ).status(),
  ).toBe(200);
  await signInApi(api, email);
  return { email, userId: registered.userId, api };
}

async function signInApi(api: APIRequestContext, email: string) {
  expect(
    (
      await api.post("/api/v1/auth/sessions", {
        headers: mutationHeaders(),
        data: { email, password, remember: true },
      })
    ).status(),
  ).toBe(200);
}

async function signInThroughUi(page: Page, email: string): Promise<void> {
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  const sessionResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/auth/sessions",
  );
  await page.getByRole("button", { name: "Conectează-te" }).click();
  expect((await sessionResponse).status()).toBe(200);
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toMatch(/^\/(overview|onboarding)$/);
}

async function createReadyWorkspace(api: APIRequestContext, title: string) {
  const workspaceId = await createWorkspace(api, title);
  const draft = await apiData<{ version: number }>(
    await api.get(`/api/v1/workspaces/${workspaceId}/onboarding`),
  );
  const saved = await apiData<{ version: number }>(
    await api.patch(`/api/v1/workspaces/${workspaceId}/onboarding`, {
      headers: mutationHeaders({ "If-Match": `"${draft.version}"` }),
      data: {
        currentStep: 8,
        couple: {
          confirmed: true,
          partnerOne: "Ana",
          partnerTwo: "Mihai",
        },
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
        style: {
          confirmed: true,
          priorities: ["foto", "muzică"],
        },
        existingProgress: { confirmed: true, photoVideo: true },
        planningPreferences: {
          confirmed: true,
          assistanceLevel: "guided",
        },
      },
    }),
  );
  await apiData(
    await api.post(`/api/v1/workspaces/${workspaceId}/onboarding/complete`, {
      headers: mutationHeaders({
        "If-Match": `"${saved.version}"`,
        "Idempotency-Key": `complete-${crypto.randomUUID()}`,
      }),
    }),
  );
  const ready = await apiData<{ version: number; status: string }>(
    await api.get(`/api/v1/workspaces/${workspaceId}/onboarding`),
  );
  expect(ready.status).toBe("ready");
  return { workspaceId, onboardingVersion: ready.version };
}

async function createWorkspace(
  api: APIRequestContext,
  title: string,
): Promise<string> {
  const workspace = await apiData<{ id: string }>(
    await api.post("/api/v1/workspaces", {
      headers: mutationHeaders({
        "Idempotency-Key": `workspace-${crypto.randomUUID()}`,
      }),
      data: {
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Brașov",
        timezone: "Europe/Bucharest",
      },
    }),
  );
  return workspace.id;
}

async function createTask(
  api: APIRequestContext,
  targetWorkspaceId: string,
  input: {
    title: string;
    dueAt?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    reminder?: { scheduledAt: string; channel: "in_app" | "email" };
  },
): Promise<TaskResource> {
  return apiData<TaskResource>(
    await api.post(`/api/v1/workspaces/${targetWorkspaceId}/tasks`, {
      headers: mutationHeaders({
        "Idempotency-Key": `task-${crypto.randomUUID()}`,
      }),
      data: {
        title: input.title,
        category: "planning",
        priority: input.priority ?? "medium",
        dueAt: input.dueAt ?? null,
        position: 0,
        isPrivate: false,
        reminder: input.reminder,
      },
    }),
  );
}

async function transitionTask(
  api: APIRequestContext,
  targetWorkspaceId: string,
  task: TaskResource,
  transition: string,
) {
  return apiData<TaskResource>(
    await api.post(
      `/api/v1/workspaces/${targetWorkspaceId}/tasks/${task.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${task.version}"` }),
        data: {
          transition,
          version: task.version,
          confirmIncompleteSubtasks: true,
        },
      },
    ),
  );
}

async function getTask(
  api: APIRequestContext,
  targetWorkspaceId: string,
  taskId: string,
) {
  return apiData<TaskResource>(
    await api.get(`/api/v1/workspaces/${targetWorkspaceId}/tasks/${taskId}`),
  );
}

async function taskList(
  api: APIRequestContext,
  targetWorkspaceId: string,
): Promise<TaskResource[]> {
  const result = await apiData<{ items: TaskResource[] }>(
    await api.get(
      `/api/v1/workspaces/${targetWorkspaceId}/tasks?includeSubtasks=true&sort=position&limit=100`,
    ),
  );
  return result.items;
}

async function waitForJob(api: APIRequestContext, jobId: string) {
  await expect
    .poll(
      async () => {
        const job = await apiData<{ status: string }>(
          await api.get(`/api/v1/jobs/${jobId}`),
        );
        return job.status;
      },
      { timeout: 60_000 },
    )
    .toBe("completed");
}

async function newApiContext(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  retainedContexts.push(context);
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

function flatten(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return items.flatMap((item) => [
    item,
    ...flatten((item.items as Array<Record<string, unknown>>) ?? []),
  ]);
}

async function waitForEmailToken(email: string): Promise<string> {
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

function futureIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
}
