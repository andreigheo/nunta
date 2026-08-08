import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@weddingos/database";
import { classifyJobError, selectOutboxConsumers } from "@weddingos/jobs";
import {
  assertNoForbiddenPublicAggregateFields,
  refreshPublicProductProofAfterConsentRevoked,
  refreshPublicProductProofSnapshot,
} from "../src/marketing-snapshot";

function suppressedMetric() {
  return {
    state: "suppressed",
    value: null,
    unit: "percent",
    contributingWorkspaceBucket: null,
    suppressionReason: "minimum_cohort",
  };
}

function aggregateFlow() {
  return {
    planning: {
      medianPlanProgressPercent: suppressedMetric(),
      nextActionCoveragePercent: suppressedMetric(),
    },
    rsvpAndLogistics: {
      rsvpResponseRatePercent: suppressedMetric(),
      logisticsAssignmentRatePercent: suppressedMetric(),
    },
    procurementAndBudget: {
      rfqToBookingWorkspaceRatePercent: suppressedMetric(),
      medianBudgetCommittedPercent: suppressedMetric(),
    },
    weddingDay: {
      runOfShowCompletionRatePercent: suppressedMetric(),
      checkInRatePercent: suppressedMetric(),
      incidentResolutionRatePercent: suppressedMetric(),
    },
  };
}

function dependencies(database: PrismaClient) {
  return {
    database,
    workerId: "worker:test",
    environment: {
      MARKETING_SNAPSHOT_WINDOW_DAYS: 365,
      MARKETING_SNAPSHOT_MIN_COHORT: 20,
    },
    now: () => new Date("2026-07-20T12:00:00.000Z"),
  };
}

describe("marketing snapshot worker", () => {
  it("routes a consent-revoked outbox event to the refresh consumer", () => {
    expect(
      selectOutboxConsumers({
        eventName: "public_aggregate.consent_revoked.v1",
        hasEmail: false,
        payload: {
          occurredAt: "2026-07-20T12:00:00.000Z",
          subject: { workspaceId: crypto.randomUUID(), consentVersion: 2 },
        },
      }),
    ).toEqual(["event_ack", "marketing_snapshot_refresh"]);
  });

  it("turns a locked revocation refresh into a retryable job error", async () => {
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: false }]),
      marketingSnapshotRun: {
        create: vi.fn().mockResolvedValue({ id: "run" }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const database = {
      $transaction: vi.fn(
        async (operation: (tx: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    } as unknown as PrismaClient;
    const caught = await refreshPublicProductProofAfterConsentRevoked(
      dependencies(database),
    ).catch((error: unknown) => error);
    expect(classifyJobError(caught)).toMatchObject({
      retryable: true,
      code: "MARKETING_SNAPSHOT_LOCKED",
    });
  });

  it("rejects forbidden tenant fields recursively before publishing", () => {
    expect(() =>
      assertNoForbiddenPublicAggregateFields({
        planning: {
          safeMetric: { value: 75 },
          nested: [{ contact: { emailAddress: "private@example.test" } }],
        },
      }),
    ).toThrow("flow.planning.nested[0].contact");
  });

  it("uses the advisory lock and records a skipped concurrent refresh", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: false }]),
      marketingSnapshotRun: {
        create: vi.fn().mockResolvedValue({ id: "run" }),
        update,
      },
    };
    const database = {
      $transaction: vi.fn(
        async (operation: (tx: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    } as unknown as PrismaClient;
    await expect(
      refreshPublicProductProofSnapshot(dependencies(database)),
    ).resolves.toBe("skipped_locked");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SKIPPED_LOCKED" }),
      }),
    );
  });

  it("publishes only a schema-valid sanitized snapshot", async () => {
    const snapshotCreate = vi.fn().mockResolvedValue({ id: "snapshot" });
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ acquired: true }])
        .mockResolvedValueOnce([
          { eligible_workspace_count: 19, metrics: aggregateFlow() },
        ]),
      marketingSnapshotRun: {
        create: vi.fn().mockResolvedValue({ id: "run" }),
        update: vi.fn().mockResolvedValue(undefined),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      publicMarketingSnapshot: {
        create: snapshotCreate,
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const database = {
      $transaction: vi.fn(
        async (operation: (tx: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    } as unknown as PrismaClient;
    await expect(
      refreshPublicProductProofSnapshot(dependencies(database)),
    ).resolves.toBe("published");
    expect(snapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          minimumCohort: 20,
          eligibleWorkspaceCount: 19,
          schemaVersion: "1.0",
        }),
      }),
    );
  });

  it("keeps the last-good snapshot when refresh fails", async () => {
    const runUpdate = vi.fn().mockResolvedValue(undefined);
    const snapshotCreate = vi.fn();
    const snapshotDelete = vi.fn();
    const transaction = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ acquired: true }])
        .mockRejectedValueOnce(new Error("aggregate failed")),
      marketingSnapshotRun: {
        create: vi.fn().mockResolvedValue({ id: "run" }),
        update: runUpdate,
      },
      publicMarketingSnapshot: {
        create: snapshotCreate,
        deleteMany: snapshotDelete,
      },
    };
    const database = {
      $transaction: vi.fn(
        async (operation: (tx: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    } as unknown as PrismaClient;
    await expect(
      refreshPublicProductProofSnapshot(dependencies(database)),
    ).rejects.toThrow("aggregate failed");
    expect(snapshotCreate).not.toHaveBeenCalled();
    expect(snapshotDelete).not.toHaveBeenCalled();
    expect(runUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });
});
