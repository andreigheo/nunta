import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Prisma, PrismaClient } from "@weddingos/database";

const apiPort = Number(process.env.WEDDINGOS_LANDING_PROOF_API_PORT ?? 4017);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const workerId = `landing-proof-e2e:${randomUUID()}`;
const workerDatabaseUrl =
  process.env.WEDDINGOS_LANDING_PROOF_DATABASE_URL ??
  "postgresql://weddingos_worker:weddingos_worker@127.0.0.1:54339/weddingos?schema=public";

const database = new PrismaClient({ datasourceUrl: workerDatabaseUrl });
let snapshotId: string | undefined;

const forbiddenPublicKeys = new Set([
  "workspaceId",
  "userId",
  "guestId",
  "vendorId",
  "eventId",
  "name",
  "email",
  "phone",
  "address",
  "location",
  "freeText",
  "amount",
  "amountMinor",
  "currency",
  "weddingDate",
]);

function collectForbiddenPaths(
  value: unknown,
  path = "$",
  matches: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectForbiddenPaths(item, `${path}[${index}]`, matches),
    );
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbiddenPublicKeys.has(key)) matches.push(childPath);
    collectForbiddenPaths(child, childPath, matches);
  }
  return matches;
}

function metric(value: number) {
  return {
    state: "published" as const,
    value,
    unit: "percent" as const,
    contributingWorkspaceBucket: 30,
    suppressionReason: null,
  };
}

function suppressedMetric() {
  return {
    state: "suppressed" as const,
    value: null,
    unit: "percent" as const,
    contributingWorkspaceBucket: null,
    suppressionReason: "minimum_cohort" as const,
  };
}

function deterministicProof(generatedAt: Date) {
  const endedAt = generatedAt;
  const startedAt = new Date(endedAt.getTime() - 365 * 86_400_000);
  return {
    schemaVersion: "1.0" as const,
    generatedAt: generatedAt.toISOString(),
    window: {
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      days: 365 as const,
    },
    freshness: "fresh" as const,
    privacy: {
      minimumCohort: 20 as const,
      percentageRoundingIncrement: 5 as const,
      cohortBucketSize: 10 as const,
    },
    capabilities: {
      planning: "implemented" as const,
      rsvpAndLogistics: "implemented" as const,
      procurementAndBudget: "implemented" as const,
      weddingDay: "implemented" as const,
    },
    flow: {
      planning: {
        medianPlanProgressPercent: metric(70),
        nextActionCoveragePercent: metric(75),
      },
      rsvpAndLogistics: {
        rsvpResponseRatePercent: suppressedMetric(),
        logisticsAssignmentRatePercent: metric(60),
      },
      procurementAndBudget: {
        rfqToBookingWorkspaceRatePercent: metric(55),
        medianBudgetCommittedPercent: metric(65),
      },
      weddingDay: {
        runOfShowCompletionRatePercent: metric(80),
        checkInRatePercent: metric(85),
        incidentResolutionRatePercent: metric(90),
      },
    },
  };
}

test.beforeAll(async () => {
  const generatedAt = new Date();
  const payload = deterministicProof(generatedAt);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  snapshotId = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      SELECT set_config('app.current_worker_id', ${workerId}, true)
    `;
    await transaction.publicMarketingSnapshot.deleteMany({
      where: { workerId },
    });
    const snapshot = await transaction.publicMarketingSnapshot.create({
      data: {
        schemaVersion: "1.0",
        capabilityManifestHash: "a".repeat(64),
        windowStartedAt: new Date(generatedAt.getTime() - 365 * 86_400_000),
        windowEndedAt: generatedAt,
        generatedAt,
        minimumCohort: 20,
        eligibleWorkspaceCount: 30,
        payload: payload as Prisma.InputJsonValue,
        payloadHash,
        workerId,
      },
      select: { id: true },
    });
    return snapshot.id;
  });
});

test.afterAll(async () => {
  try {
    await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`
        SELECT set_config('app.current_worker_id', ${workerId}, true)
      `;
      if (snapshotId) {
        await transaction.publicMarketingSnapshot.deleteMany({
          where: { id: snapshotId, workerId },
        });
      }
    });
  } finally {
    await database.$disconnect();
  }
});

test("landing full-stack — snapshot determinist, ETag și suprimare independentă", async ({
  page,
  request,
}, testInfo) => {
  const apiResponse = await request.get(
    `${apiUrl}/api/v1/public/product-proof`,
  );
  expect(apiResponse.status()).toBe(200);
  const etag = apiResponse.headers().etag;
  expect(etag).toMatch(/^"[a-f0-9]{64}"$/);
  const proof = await apiResponse.json();
  expect(collectForbiddenPaths(proof)).toEqual([]);
  expect(proof.flow.rsvpAndLogistics.rsvpResponseRatePercent).toMatchObject({
    state: "suppressed",
    value: null,
    contributingWorkspaceBucket: null,
  });

  const notModified = await request.get(
    `${apiUrl}/api/v1/public/product-proof`,
    {
      headers: { "If-None-Match": etag },
    },
  );
  expect(notModified.status()).toBe(304);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await expect(page.getByTestId("public-proof-metrics")).toBeVisible();
  await expect(page.getByTestId("product-proof-fallback")).toHaveCount(0);
  await expect(
    page.getByText("Date agregate · actualizare verificată"),
  ).toBeVisible();
  const aggregateMetrics = page.getByRole("list", {
    name: "Indicatori agregați",
  });
  await expect(
    aggregateMetrics.getByText("75%", { exact: true }),
  ).toBeVisible();
  await expect(
    aggregateMetrics.getByText("55%", { exact: true }),
  ).toBeVisible();
  await expect(
    aggregateMetrics.getByText("80%", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Cohortă insuficientă", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Disponibil", { exact: true })).toHaveCount(4);

  const screenshotPath = testInfo.outputPath(
    "landing-desktop-product-proof.png",
  );
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    animations: "disabled",
  });
  await testInfo.attach("landing-desktop-product-proof", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
