import { createHash } from "node:crypto";
import type { ApiEnvironment } from "@weddingos/config";
import {
  marketingCapabilityManifest,
  PUBLIC_PRODUCT_PROOF_SCHEMA_VERSION,
  publicProductProofV1Schema,
  type PublicProductProofV1,
} from "@weddingos/contracts";
import { Prisma, type PrismaClient } from "@weddingos/database";
import { RetryableJobError } from "@weddingos/jobs";

type AggregateRow = {
  eligible_workspace_count: number;
  metrics: Prisma.JsonValue;
};

type LockRow = { acquired: boolean };

export type MarketingSnapshotDependencies = {
  database: PrismaClient;
  environment: Pick<
    ApiEnvironment,
    "MARKETING_SNAPSHOT_WINDOW_DAYS" | "MARKETING_SNAPSHOT_MIN_COHORT"
  >;
  workerId: string;
  now?: () => Date;
};

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function capabilityStatuses(): PublicProductProofV1["capabilities"] {
  return {
    planning: marketingCapabilityManifest.planning.status,
    rsvpAndLogistics: marketingCapabilityManifest.rsvpAndLogistics.status,
    procurementAndBudget:
      marketingCapabilityManifest.procurementAndBudget.status,
    weddingDay: marketingCapabilityManifest.weddingDay.status,
  };
}

async function setWorkerContext(
  transaction: Prisma.TransactionClient,
  workerId: string,
): Promise<void> {
  await transaction.$executeRaw`
    SELECT set_config('app.current_worker_id', ${workerId}, true)
  `;
}

function boundedError(error: unknown): { code: string; message: string } {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      code: error.code.slice(0, 120),
      message: "Database refresh failed",
    };
  }
  return {
    code: "SNAPSHOT_REFRESH_FAILED",
    message: "Snapshot refresh failed",
  };
}

const forbiddenAggregateFieldFragments = [
  "email",
  "phone",
  "telephone",
  "address",
  "location",
  "venue",
  "postalcode",
  "contact",
  "firstname",
  "lastname",
  "fullname",
  "displayname",
  "message",
  "freetext",
  "description",
  "comment",
  "currency",
  "amount",
  "price",
  "cost",
  "timestamp",
  "weddingdate",
  "birthdate",
  "occurredat",
] as const;

function normalizedFieldName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isForbiddenAggregateField(field: string): boolean {
  const normalized = normalizedFieldName(field);
  return (
    normalized === "id" ||
    normalized.endsWith("id") ||
    normalized === "name" ||
    normalized === "date" ||
    normalized.endsWith("date") ||
    normalized === "notes" ||
    normalized === "text" ||
    normalized === "sum" ||
    normalized === "total" ||
    forbiddenAggregateFieldFragments.some((fragment) =>
      normalized.includes(fragment),
    )
  );
}

/**
 * Defense in depth for the SECURITY DEFINER result. The versioned schema already
 * rejects unknown fields; this recursive guard fails earlier and explicitly if
 * a future SQL change tries to publish tenant identifiers, contact data, exact
 * dates, free text, or monetary values.
 */
export function assertNoForbiddenPublicAggregateFields(
  value: unknown,
  path = "flow",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoForbiddenPublicAggregateFields(entry, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [field, nestedValue] of Object.entries(value)) {
    const fieldPath = `${path}.${field}`;
    if (isForbiddenAggregateField(field)) {
      throw new Error(`Forbidden public aggregate field: ${fieldPath}`);
    }
    assertNoForbiddenPublicAggregateFields(nestedValue, fieldPath);
  }
}

export async function refreshPublicProductProofSnapshot(
  dependencies: MarketingSnapshotDependencies,
): Promise<"published" | "skipped_locked"> {
  const now = dependencies.now?.() ?? new Date();
  const windowEndedAt = now;
  const windowStartedAt = new Date(
    now.getTime() -
      dependencies.environment.MARKETING_SNAPSHOT_WINDOW_DAYS * 86_400_000,
  );
  const minimumCohort = dependencies.environment.MARKETING_SNAPSHOT_MIN_COHORT;

  const run = await dependencies.database.$transaction(async (transaction) => {
    await setWorkerContext(transaction, dependencies.workerId);
    return transaction.marketingSnapshotRun.create({
      data: {
        workerId: dependencies.workerId,
        windowStartedAt,
        windowEndedAt,
        minimumCohort,
      },
      select: { id: true },
    });
  });

  try {
    return await dependencies.database.$transaction(async (transaction) => {
      await setWorkerContext(transaction, dependencies.workerId);
      const [lock] = await transaction.$queryRaw<LockRow[]>`
        SELECT pg_try_advisory_xact_lock(
          hashtext('weddingos:public-marketing-snapshot')
        ) AS acquired
      `;
      if (!lock?.acquired) {
        await transaction.marketingSnapshotRun.update({
          where: { id: run.id },
          data: { status: "SKIPPED_LOCKED", finishedAt: new Date() },
        });
        return "skipped_locked";
      }

      const [aggregate] = await transaction.$queryRaw<AggregateRow[]>`
        SELECT * FROM public.weddingos_compute_public_marketing_metrics(
          ${windowStartedAt}, ${windowEndedAt}, ${minimumCohort}::integer
        )
      `;
      if (!aggregate) throw new Error("Marketing aggregation returned no row");
      assertNoForbiddenPublicAggregateFields(aggregate.metrics);

      const capabilities = capabilityStatuses();
      const payload = publicProductProofV1Schema.parse({
        schemaVersion: PUBLIC_PRODUCT_PROOF_SCHEMA_VERSION,
        generatedAt: now.toISOString(),
        window: {
          startedAt: windowStartedAt.toISOString(),
          endedAt: windowEndedAt.toISOString(),
          days: dependencies.environment.MARKETING_SNAPSHOT_WINDOW_DAYS,
        },
        freshness: "fresh",
        privacy: {
          minimumCohort,
          percentageRoundingIncrement: 5,
          cohortBucketSize: 10,
        },
        capabilities,
        flow: aggregate.metrics,
      });
      const payloadHash = sha256(payload);
      const capabilityManifestHash = sha256(marketingCapabilityManifest);
      const snapshot = await transaction.publicMarketingSnapshot.create({
        data: {
          schemaVersion: PUBLIC_PRODUCT_PROOF_SCHEMA_VERSION,
          capabilityManifestHash,
          windowStartedAt,
          windowEndedAt,
          generatedAt: now,
          minimumCohort,
          eligibleWorkspaceCount: aggregate.eligible_workspace_count,
          payload: payload as Prisma.InputJsonValue,
          payloadHash,
          workerId: dependencies.workerId,
        },
        select: { id: true },
      });
      await transaction.marketingSnapshotRun.update({
        where: { id: run.id },
        data: {
          status: "PUBLISHED",
          finishedAt: new Date(),
          eligibleWorkspaceCount: aggregate.eligible_workspace_count,
          snapshotId: snapshot.id,
        },
      });
      await transaction.publicMarketingSnapshot.deleteMany({
        where: {
          generatedAt: { lt: new Date(now.getTime() - 7 * 86_400_000) },
        },
      });
      await transaction.marketingSnapshotRun.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - 7 * 86_400_000) } },
      });
      return "published";
    });
  } catch (error) {
    const failure = boundedError(error);
    await dependencies.database.$transaction(async (transaction) => {
      await setWorkerContext(transaction, dependencies.workerId);
      await transaction.marketingSnapshotRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorCode: failure.code,
          errorMessage: failure.message,
        },
      });
    });
    throw error;
  }
}

export async function refreshPublicProductProofAfterConsentRevoked(
  dependencies: MarketingSnapshotDependencies,
): Promise<"published"> {
  const outcome = await refreshPublicProductProofSnapshot(dependencies);
  if (outcome === "skipped_locked") {
    throw new RetryableJobError(
      "Public product proof refresh is already running",
      "MARKETING_SNAPSHOT_LOCKED",
    );
  }
  return "published";
}
