import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@weddingos/database";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
const contexts: APIRequestContext[] = [];

type Account = { email: string; userId: string; api: APIRequestContext };
type Resource = Record<string, unknown> & {
  id: string;
  version: number;
  status?: string;
};

let admin: Account;
let participant: Account;
let outsider: Account;
let program: Resource;
let cohort: Resource;
let invitation: Resource;
let invitationToken: string;
let participantResource: Resource;
let feedback: Resource;
const programKey = `controlled-beta-${Date.now()}`;
const invitationKey = `beta-invite-${randomUUID()}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  admin = await createVerifiedAccount("beta-admin");
  participant = await createVerifiedAccount("beta-participant");
  outsider = await createVerifiedAccount("beta-outsider");
  const role = await ownerDatabase.platformRole.findUniqueOrThrow({
    where: { key: "PLATFORM_SUPER_ADMIN" },
  });
  await ownerDatabase.platformGrant.upsert({
    where: {
      userId_roleId_environment: {
        userId: admin.userId,
        roleId: role.id,
        environment: "test",
      },
    },
    update: { active: true, revokedAt: null, mfaVerifiedAt: new Date() },
    create: {
      userId: admin.userId,
      roleId: role.id,
      environment: "test",
      grantedById: admin.userId,
      reason: "Controlled Beta Operations E2E administration.",
      mfaVerifiedAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("BETA E2E 01 — migration enables RLS and bounded capabilities", async () => {
  const policies = await ownerDatabase.$queryRaw<
    Array<{ tablename: string; policyCount: bigint }>
  >`
    SELECT tablename, count(*) AS "policyCount"
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename LIKE 'beta_%'
    GROUP BY tablename
  `;
  expect(policies.length).toBe(12);
  expect(policies.every((row) => Number(row.policyCount) > 0)).toBe(true);
  const role = await ownerDatabase.platformRole.findUniqueOrThrow({
    where: { key: "PLATFORM_SUPER_ADMIN" },
  });
  expect(role.capabilities).toEqual(
    expect.arrayContaining([
      "platform.beta.read",
      "platform.beta.manage",
      "platform.beta.invite",
      "platform.beta.triage",
    ]),
  );
});

test("BETA E2E 02 — participant cannot read platform beta administration", async () => {
  const response = await participant.api.get("/api/v1/platform/beta/programs");
  expect(response.status()).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe(
    "PLATFORM_CAPABILITY_REQUIRED",
  );
});

test("BETA E2E 03 — program creation is idempotent", async () => {
  const key = `beta-program-${randomUUID()}`;
  const body = {
    key: programKey,
    name: "WeddingOS Controlled Beta",
    status: "DRAFT",
    releaseVersion: "beta.1",
  };
  program = await apiData<Resource>(
    await admin.api.post("/api/v1/platform/beta/programs", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: body,
    }),
  );
  const replay = await apiData<Resource>(
    await admin.api.post("/api/v1/platform/beta/programs", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: body,
    }),
  );
  expect(replay.id).toBe(program.id);
  expect(
    await ownerDatabase.betaProgram.count({ where: { key: programKey } }),
  ).toBe(1);
});

test("BETA E2E 04 — an idempotency key cannot be reused for another payload", async () => {
  const key = `beta-conflict-${randomUUID()}`;
  const base = {
    programId: program.id,
    key: `cohort-${Date.now()}`,
    name: "Initial cohort",
    description: "Initial controlled beta cohort",
    targetCounts: { couples: 1, planners: 1, vendors: 1, testGuests: 1 },
  };
  const first = await admin.api.post("/api/v1/platform/beta/cohorts", {
    headers: mutationHeaders({ "Idempotency-Key": key }),
    data: base,
  });
  expect(first.status()).toBe(201);
  const conflict = await admin.api.post("/api/v1/platform/beta/cohorts", {
    headers: mutationHeaders({ "Idempotency-Key": key }),
    data: { ...base, name: "Changed cohort" },
  });
  expect(conflict.status()).toBe(409);
  expect(((await conflict.json()) as { code: string }).code).toBe(
    "IDEMPOTENCY_KEY_REUSED",
  );
});

test("BETA E2E 05 — admin creates a bounded cohort", async () => {
  cohort = await apiData<Resource>(
    await admin.api.post("/api/v1/platform/beta/cohorts", {
      headers: mutationHeaders({
        "Idempotency-Key": `cohort-${randomUUID()}`,
      }),
      data: {
        programId: program.id,
        key: `participant-pilot-${Date.now()}`,
        name: "Participant pilot",
        description: "Cohort used for controlled participant validation.",
        targetCounts: { couples: 2, planners: 1, vendors: 1, testGuests: 2 },
      },
    }),
  );
  expect(cohort.programId).toBe(program.id);
  expect(cohort.targetCounts).toEqual({
    couples: 2,
    planners: 1,
    vendors: 1,
    testGuests: 2,
  });
});

test("BETA E2E 06 — invitation persists only email and token hashes", async () => {
  const created = await apiData<{
    invitation: Resource;
    acceptanceToken: string;
    tokenDisclosure: string;
  }>(
    await admin.api.post("/api/v1/platform/beta/invitations", {
      headers: mutationHeaders({ "Idempotency-Key": invitationKey }),
      data: {
        programId: program.id,
        cohortId: cohort.id,
        email: participant.email,
        participantType: "COUPLE",
        expiresInHours: 72,
      },
    }),
  );
  invitation = created.invitation;
  invitationToken = created.acceptanceToken;
  expect(created.tokenDisclosure).toBe("RETURNED_ONCE_NOT_STORED");
  expect(created.invitation).not.toHaveProperty("targetEmailHash");
  expect(created.invitation).not.toHaveProperty("tokenHash");
  const stored = await ownerDatabase.betaInvitation.findUniqueOrThrow({
    where: { id: invitation.id },
  });
  expect(stored.targetEmailHash).toBe(hash(participant.email.toLowerCase()));
  expect(stored.tokenHash).toBe(hash(invitationToken));
  expect(JSON.stringify(stored)).not.toContain(invitationToken);
  const replayRecord = await ownerDatabase.idempotencyRecord.findFirstOrThrow({
    where: { operation: "beta.invitation.create", key: invitationKey },
  });
  expect(JSON.stringify(replayRecord.responseBody)).not.toContain(
    invitationToken,
  );
});

test("BETA E2E 07 — invitation token is not reissued on idempotent replay", async () => {
  const replay = await apiData<{
    invitation: Resource;
    acceptanceToken: string | null;
    tokenDisclosure: string;
  }>(
    await admin.api.post("/api/v1/platform/beta/invitations", {
      headers: mutationHeaders({ "Idempotency-Key": invitationKey }),
      data: {
        programId: program.id,
        cohortId: cohort.id,
        email: participant.email,
        participantType: "COUPLE",
        expiresInHours: 72,
      },
    }),
  );
  expect(replay.invitation.id).toBe(invitation.id);
  expect(replay.acceptanceToken).toBeNull();
  expect(replay.tokenDisclosure).toBe("NOT_REISSUED_ON_IDEMPOTENT_REPLAY");
});

test("BETA E2E 08 — invitation cannot be accepted by another email", async () => {
  const response = await outsider.api.post("/api/v1/beta/invitations/accept", {
    headers: mutationHeaders(),
    data: acceptance(invitationToken, false),
  });
  expect(response.status()).toBe(403);
  expect(((await response.json()) as { code: string }).code).toBe("FORBIDDEN");
});

test("BETA E2E 09 — intended participant accepts with explicit consents", async () => {
  const accepted = await apiData<{
    participant: Resource;
    analyticsConsent: boolean;
    releaseVersion: string;
  }>(
    await participant.api.post("/api/v1/beta/invitations/accept", {
      headers: mutationHeaders(),
      data: acceptance(invitationToken, false),
    }),
  );
  participantResource = accepted.participant;
  expect(participantResource.status).toBe("ONBOARDING");
  expect(accepted.analyticsConsent).toBe(false);
  expect(
    await ownerDatabase.betaAccessGrant.count({
      where: { participantId: participantResource.id, status: "ACTIVE" },
    }),
  ).toBe(1);
  expect(
    await ownerDatabase.userConsentRecord.count({
      where: {
        userId: participant.userId,
        purpose: { in: ["BETA_PARTICIPATION", "BETA_PRODUCT_ANALYTICS"] },
      },
    }),
  ).toBe(2);
});

test("BETA E2E 10 — accepted invitation cannot be replayed", async () => {
  const response = await participant.api.post(
    "/api/v1/beta/invitations/accept",
    {
      headers: mutationHeaders(),
      data: acceptance(invitationToken, false),
    },
  );
  expect(response.status()).toBe(409);
  expect(((await response.json()) as { code: string }).code).toBe(
    "VERSION_CONFLICT",
  );
});

test("BETA E2E 11 — participant status is self-scoped and redacted", async () => {
  const status = await apiData<Record<string, unknown>>(
    await participant.api.get("/api/v1/beta/status"),
  );
  expect(status.betaAccess).toBe(true);
  expect(status.participant).toMatchObject({
    id: participantResource.id,
    status: "ONBOARDING",
  });
  expect(JSON.stringify(status)).not.toContain("emailHash");
  expect(JSON.stringify(status)).not.toContain(participant.email);
});

test("BETA E2E 12 — stale onboarding version is rejected", async () => {
  const response = await participant.api.patch("/api/v1/beta/onboarding", {
    headers: mutationHeaders({ "If-Match": '"999"' }),
    data: {
      version: 999,
      checklist: onboardingChecklist(false),
    },
  });
  expect(response.status()).toBe(412);
  expect(((await response.json()) as { code: string }).code).toBe(
    "VERSION_CONFLICT",
  );
});

test("BETA E2E 13 — completed onboarding activates the participant", async () => {
  participantResource = await apiData<Resource>(
    await participant.api.patch("/api/v1/beta/onboarding", {
      headers: mutationHeaders({
        "If-Match": `"${participantResource.version}"`,
      }),
      data: {
        version: participantResource.version,
        checklist: onboardingChecklist(true),
      },
    }),
  );
  expect(participantResource.status).toBe("ACTIVE");
  expect(participantResource.activatedAt).toBeTruthy();
});

test("BETA E2E 14 — unsafe browser metadata is rejected", async () => {
  const response = await participant.api.post("/api/v1/beta/feedback", {
    headers: mutationHeaders({
      "Idempotency-Key": `unsafe-feedback-${randomUUID()}`,
    }),
    data: feedbackInput({ rawUserAgent: "do-not-store" }),
  });
  expect(response.status()).toBe(400);
  expect(((await response.json()) as { code: string }).code).toBe(
    "VALIDATION_FAILED",
  );
});

test("BETA E2E 15 — feedback creation is idempotent", async () => {
  const key = `feedback-${randomUUID()}`;
  const input = feedbackInput({
    browserFamily: "Chromium",
    deviceClass: "desktop",
  });
  feedback = await apiData<Resource>(
    await participant.api.post("/api/v1/beta/feedback", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: input,
    }),
  );
  const replay = await apiData<Resource>(
    await participant.api.post("/api/v1/beta/feedback", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: input,
    }),
  );
  expect(replay.id).toBe(feedback.id);
  expect(
    await ownerDatabase.betaFeedback.count({
      where: { createdById: participant.userId },
    }),
  ).toBe(1);
});

test("BETA E2E 16 — feedback detail is private to its participant", async () => {
  const own = await apiData<Resource>(
    await participant.api.get(`/api/v1/beta/feedback/${feedback.id}`),
  );
  expect(own.id).toBe(feedback.id);
  const denied = await outsider.api.get(`/api/v1/beta/feedback/${feedback.id}`);
  expect(denied.status()).toBe(404);
});

test("BETA E2E 17 — feedback messages use optimistic concurrency", async () => {
  const added = await apiData<Resource>(
    await participant.api.post(
      `/api/v1/beta/feedback/${feedback.id}/messages`,
      {
        headers: mutationHeaders({ "If-Match": `"${feedback.version}"` }),
        data: {
          body: "Additional reproducible information for the operator.",
          version: feedback.version,
        },
      },
    ),
  );
  expect(added.version).toBe(feedback.version + 1);
  feedback.version += 1;
  const stale = await participant.api.post(
    `/api/v1/beta/feedback/${feedback.id}/messages`,
    {
      headers: mutationHeaders({ "If-Match": `"${feedback.version - 1}"` }),
      data: { body: "Stale message", version: feedback.version - 1 },
    },
  );
  expect(stale.status()).toBe(412);
});

test("BETA E2E 18 — high-severity triage creates history and support escalation", async () => {
  feedback = await apiData<Resource>(
    await admin.api.patch(`/api/v1/platform/beta/feedback/${feedback.id}`, {
      headers: mutationHeaders({ "If-Match": `"${feedback.version}"` }),
      data: {
        version: feedback.version,
        status: "TRIAGED",
        severity: "HIGH",
        reason: "Reproduced and escalated by controlled beta operations.",
      },
    }),
  );
  expect(feedback.status).toBe("TRIAGED");
  expect(
    await ownerDatabase.betaFeedbackStatusHistory.count({
      where: { feedbackId: feedback.id, toStatus: "TRIAGED" },
    }),
  ).toBe(1);
  expect(
    await ownerDatabase.platformSupportCase.count({
      where: {
        type: "BETA_URGENT_BLOCKER",
        requesterUserId: participant.userId,
      },
    }),
  ).toBe(1);
});

test("BETA E2E 19 — analytics denial records no product event", async () => {
  const result = await apiData<{ recorded: boolean; reason: string }>(
    await participant.api.post("/api/v1/beta/events", {
      headers: mutationHeaders(),
      data: {
        eventName: "feedback_submitted",
        route: "/beta",
        properties: { count: 1 },
      },
    }),
  );
  expect(result.recorded).toBe(false);
  expect(["ANALYTICS_DISABLED", "CONSENT_NOT_GRANTED"]).toContain(
    result.reason,
  );
  expect(
    await ownerDatabase.betaProductEvent.count({
      where: { userId: participant.userId },
    }),
  ).toBe(0);
});

test("BETA E2E 20 — metrics stay redacted, public launch stays blocked, removal revokes access", async () => {
  const metrics = await apiData<Record<string, unknown>>(
    await admin.api.get("/api/v1/platform/beta/metrics"),
  );
  expect(JSON.stringify(metrics)).not.toContain(participant.email);
  expect(JSON.stringify(metrics)).not.toContain(invitationToken);
  const exit = await apiData<{
    publicLaunchReady: boolean;
    verdict: string;
  }>(await admin.api.get("/api/v1/platform/beta/exit-criteria"));
  expect(exit.publicLaunchReady).toBe(false);
  expect(exit.verdict).toBe("CONTROLLED_BETA_BLOCKED");
  const listed = await apiData<{ items: Resource[] }>(
    await admin.api.get("/api/v1/platform/beta/participants"),
  );
  expect(JSON.stringify(listed)).not.toContain("emailHash");
  const current = listed.items.find(
    (item) => item.id === participantResource.id,
  )!;
  const removed = await apiData<Resource>(
    await admin.api.post(
      `/api/v1/platform/beta/participants/${participantResource.id}/remove`,
      {
        headers: mutationHeaders({ "If-Match": `"${current.version}"` }),
        data: {
          version: current.version,
          reason: "End of bounded controlled beta E2E participation.",
        },
      },
    ),
  );
  expect(removed.status).toBe("REMOVED");
  expect(
    await ownerDatabase.betaAccessGrant.count({
      where: { participantId: participantResource.id, status: "REVOKED" },
    }),
  ).toBe(1);
  expect(
    await apiData<{ betaAccess: boolean }>(
      await participant.api.get("/api/v1/beta/status"),
    ),
  ).toMatchObject({ betaAccess: false });
});

function acceptance(token: string, analyticsConsent: boolean) {
  return {
    token,
    betaTermsAccepted: true,
    privacyNoticeAcknowledged: true,
    knownLimitationsAcknowledged: true,
    analyticsConsent,
  };
}

function onboardingChecklist(value: boolean) {
  return {
    profileReviewed: value,
    sandboxAcknowledged: value,
    supportPathReviewed: value,
    feedbackPathReviewed: value,
  };
}

function feedbackInput(browserMetadata: Record<string, unknown>) {
  return {
    type: "BUG",
    severity: "MEDIUM",
    currentRoute: "/beta",
    browserMetadata,
    description:
      "The controlled beta workflow does not match the expected result.",
    expectedBehavior: "The operation should complete once.",
    actualBehavior: "The result remains pending after completion.",
    correlationId: null,
  };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registration = await apiData<{ userId: string }>(
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
  return { email, userId: registration.userId, api };
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
        message.Subject === "Confirmă adresa de email WeddingOS" &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
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
