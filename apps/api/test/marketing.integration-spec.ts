import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@weddingos/database";

describe("public marketing database boundary", () => {
  let application: PrismaClient;
  let worker: PrismaClient;
  let databaseOwner: PrismaClient;

  beforeAll(async () => {
    const applicationUrl = process.env.DATABASE_URL ?? "";
    application = new PrismaClient({ datasourceUrl: applicationUrl });
    const workerUrl = applicationUrl.replace(
      /weddingos_app:weddingos_app/,
      "weddingos_worker:weddingos_worker",
    );
    worker = new PrismaClient({ datasourceUrl: workerUrl });
    const ownerUrl = workerUrl.replace(
      /weddingos_worker:weddingos_worker/,
      "weddingos:weddingos",
    );
    databaseOwner = new PrismaClient({ datasourceUrl: ownerUrl });
    await application.$connect();
    await worker.$connect();
    await databaseOwner.$connect();
  });

  afterAll(async () => {
    await application.$disconnect();
    await worker.$disconnect();
    await databaseOwner.$disconnect();
  });

  it("denies raw consent reads but permits only the bounded aggregate function", async () => {
    await expect(
      worker.$queryRaw`SELECT * FROM public.public_aggregate_consents LIMIT 1`,
    ).rejects.toThrow();

    const rawTenantRows = await worker.$queryRaw<unknown[]>`
      SELECT * FROM public.planning_tasks LIMIT 1
    `;
    expect(rawTenantRows).toEqual([]);

    const applicationTenantRows = await application.$queryRaw<unknown[]>`
      SELECT * FROM public.planning_tasks LIMIT 1
    `;
    expect(applicationTenantRows).toEqual([]);

    const applicationConsentRows = await application.$queryRaw<unknown[]>`
      SELECT * FROM public.public_aggregate_consents LIMIT 1
    `;
    expect(applicationConsentRows).toEqual([]);

    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - 365 * 86_400_000);
    const result = await worker.$queryRaw<
      Array<{ eligible_workspace_count: number; metrics: unknown }>
    >`
      SELECT * FROM public.weddingos_compute_public_marketing_metrics(
        ${startedAt}, ${endedAt}, 20::integer
      )
    `;
    expect(result).toHaveLength(1);
    expect(result[0]?.eligible_workspace_count).toBeGreaterThanOrEqual(0);
    expect(result[0]?.metrics).toBeTypeOf("object");
  });

  it("suppresses 19 contributors and publishes the rounded 20-workspace boundary", async () => {
    const [row] = await databaseOwner.$queryRaw<
      Array<{ below_threshold: unknown; at_threshold: unknown }>
    >`
      SELECT
        public.weddingos_public_proof_metric(73, 19, 20) AS below_threshold,
        public.weddingos_public_proof_metric(73, 20, 20) AS at_threshold
    `;

    expect(row?.below_threshold).toEqual({
      state: "suppressed",
      value: null,
      unit: "percent",
      contributingWorkspaceBucket: null,
      suppressionReason: "minimum_cohort",
    });
    expect(row?.at_threshold).toEqual({
      state: "published",
      value: 75,
      unit: "percent",
      contributingWorkspaceBucket: 20,
      suppressionReason: null,
    });
  });

  it("excludes non-consenting and revoked workspaces from the aggregate", async () => {
    const userId = randomUUID();
    const activeWorkspaceIds = Array.from({ length: 20 }, () => randomUUID());
    const revokedWorkspaceId = randomUUID();
    const excludedWorkspaceId = randomUUID();
    const workspaceIds = [
      ...activeWorkspaceIds,
      revokedWorkspaceId,
      excludedWorkspaceId,
    ];
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - 365 * 86_400_000);
    const aggregate = () =>
      worker.$queryRaw<
        Array<{ eligible_workspace_count: number; metrics: unknown }>
      >`
        SELECT * FROM public.weddingos_compute_public_marketing_metrics(
          ${startedAt}, ${endedAt}, 20::integer
        )
      `;

    const [baseline] = await aggregate();
    expect(baseline).toBeDefined();

    try {
      await databaseOwner.user.create({
        data: {
          id: userId,
          email: `public-proof-${userId}@example.test`,
          acceptedTermsVersion: "integration-test",
          acceptedTermsAt: endedAt,
        },
      });
      await databaseOwner.workspace.createMany({
        data: workspaceIds.map((id) => ({
          id,
          title: `Public proof fixture ${id}`,
          createdById: userId,
          updatedById: userId,
        })),
      });
      await databaseOwner.task.createMany({
        data: workspaceIds.flatMap((workspaceId) => [
          {
            workspaceId,
            title: "Completed fixture task",
            status: "COMPLETED" as const,
            createdById: userId,
          },
          {
            workspaceId,
            title: "Open fixture task",
            status: "NOT_STARTED" as const,
            createdById: userId,
          },
        ]),
      });
      await databaseOwner.publicAggregateConsent.create({
        data: {
          workspaceId: revokedWorkspaceId,
          policyVersion: "public-aggregate-v1",
          consentedAt: endedAt,
          consentedById: userId,
          revokedAt: endedAt,
          revokedById: userId,
        },
      });

      const [withOnlyIneligibleFixtures] = await aggregate();
      expect(withOnlyIneligibleFixtures).toEqual(baseline);

      await databaseOwner.publicAggregateConsent.createMany({
        data: activeWorkspaceIds.map((workspaceId) => ({
          workspaceId,
          policyVersion: "public-aggregate-v1",
          consentedAt: endedAt,
          consentedById: userId,
        })),
      });
      const [withActiveFixtures] = await aggregate();
      expect(withActiveFixtures?.eligible_workspace_count).toBe(
        (baseline?.eligible_workspace_count ?? 0) + 20,
      );

      await databaseOwner.publicAggregateConsent.update({
        where: { workspaceId: activeWorkspaceIds[0] },
        data: { revokedAt: endedAt, revokedById: userId },
      });
      const [afterRevocation] = await aggregate();
      expect(afterRevocation?.eligible_workspace_count).toBe(
        (baseline?.eligible_workspace_count ?? 0) + 19,
      );
    } finally {
      await databaseOwner.workspace.deleteMany({
        where: { id: { in: workspaceIds } },
      });
      await databaseOwner.user.deleteMany({ where: { id: userId } });
    }
  });
});
