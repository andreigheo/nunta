import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { ApiEnvironment } from "@weddingos/config";
import type { PublicProductProofV1 } from "@weddingos/contracts";
import type { DatabaseService } from "../src/common/database.service";
import type { AsyncService } from "../src/async/async.service";
import type { WeddingOsRequest } from "../src/common/http.types";
import { ProblemException } from "../src/common/problem";
import {
  PublicAggregateConsentController,
  PublicMarketingController,
} from "../src/marketing/marketing.controller";
import { MarketingService } from "../src/marketing/marketing.service";
import { REQUIRED_CAPABILITY } from "../src/workspaces/capability.decorator";

const generatedAt = new Date("2026-07-20T12:00:00.000Z");

function metric(value = 75) {
  return {
    state: "published" as const,
    value,
    unit: "percent" as const,
    contributingWorkspaceBucket: 20,
    suppressionReason: null,
  };
}

function proof(): PublicProductProofV1 {
  return {
    schemaVersion: "1.0",
    generatedAt: generatedAt.toISOString(),
    window: {
      startedAt: "2025-07-20T12:00:00.000Z",
      endedAt: generatedAt.toISOString(),
      days: 365,
    },
    freshness: "fresh",
    privacy: {
      minimumCohort: 20,
      percentageRoundingIncrement: 5,
      cohortBucketSize: 10,
    },
    capabilities: {
      planning: "implemented",
      rsvpAndLogistics: "implemented",
      procurementAndBudget: "implemented",
      weddingDay: "implemented",
    },
    flow: {
      planning: {
        medianPlanProgressPercent: metric(),
        nextActionCoveragePercent: metric(),
      },
      rsvpAndLogistics: {
        rsvpResponseRatePercent: metric(),
        logisticsAssignmentRatePercent: metric(),
      },
      procurementAndBudget: {
        rfqToBookingWorkspaceRatePercent: metric(),
        medianBudgetCommittedPercent: metric(),
      },
      weddingDay: {
        runOfShowCompletionRatePercent: metric(),
        checkInRatePercent: metric(),
        incidentResolutionRatePercent: metric(),
      },
    },
  };
}

function environment(): ApiEnvironment {
  return {
    MARKETING_SNAPSHOT_MAX_STALE_SECONDS: 86_400,
  } as ApiEnvironment;
}

function asyncEvents(record = vi.fn().mockResolvedValue(null)): AsyncService {
  return { record } as unknown as AsyncService;
}

function responseDouble() {
  const headers = new Map<string, string>();
  let status = 200;
  return {
    headers,
    get statusCode() {
      return status;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    status(value: number) {
      status = value;
      return this;
    },
  };
}

describe("public marketing service and controller", () => {
  it.each([
    ["fresh", 10 * 60, "fresh"],
    ["stale", 31 * 60, "stale"],
  ])("serves a %s last-good snapshot", async (_label, age, freshness) => {
    const database = {
      publicMarketingSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            generatedAt,
            payload: proof(),
          },
        ]),
      },
      publicMarketingSnapshotInvalidation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    const result = await service.publicProductProof(
      new Date(generatedAt.getTime() + Number(age) * 1_000),
    );
    expect(result.payload.freshness).toBe(freshness);
    expect(result.etag).toMatch(/^"[a-f0-9]{64}"$/);
  });

  it("returns 503 when no last-good snapshot is newer than 24 hours", async () => {
    const database = {
      publicMarketingSnapshot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      publicMarketingSnapshotInvalidation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    await expect(
      service.publicProductProof(
        new Date(generatedAt.getTime() + 86_401 * 1_000),
      ),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
  });

  it("marks the old snapshot stale during the 15-minute revocation grace period", async () => {
    const invalidatedAt = new Date(generatedAt.getTime() + 60_000);
    const database = {
      publicMarketingSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            generatedAt,
            payload: proof(),
          },
        ]),
      },
      publicMarketingSnapshotInvalidation: {
        findFirst: vi.fn().mockResolvedValue({ invalidatedAt }),
      },
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );

    await expect(
      service.publicProductProof(new Date(invalidatedAt.getTime() + 899_000)),
    ).resolves.toMatchObject({
      stale: true,
      revocationPending: true,
      payload: { freshness: "stale" },
    });
  });

  it("returns 503 at the revocation deadline unless a newer snapshot exists", async () => {
    const invalidatedAt = new Date(generatedAt.getTime() + 60_000);
    const database = {
      publicMarketingSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            generatedAt,
            payload: proof(),
          },
        ]),
      },
      publicMarketingSnapshotInvalidation: {
        findFirst: vi.fn().mockResolvedValue({ invalidatedAt }),
      },
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );

    await expect(
      service.publicProductProof(new Date(invalidatedAt.getTime() + 900_000)),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });

    const refreshedAt = new Date(invalidatedAt.getTime() + 1);
    database.publicMarketingSnapshot.findMany.mockResolvedValue([
      {
        generatedAt: refreshedAt,
        payload: { ...proof(), generatedAt: refreshedAt.toISOString() },
      },
    ]);
    await expect(
      service.publicProductProof(new Date(invalidatedAt.getTime() + 900_000)),
    ).resolves.toMatchObject({
      stale: false,
      revocationPending: false,
      payload: { freshness: "fresh" },
    });
  });

  it("skips future and invalid snapshots and serves the latest valid candidate", async () => {
    const now = new Date(generatedAt.getTime() + 10 * 60_000);
    const futureGeneratedAt = new Date(now.getTime() + 5 * 60_000 + 1);
    const database = {
      publicMarketingSnapshot: {
        findMany: vi.fn().mockResolvedValue([
          {
            generatedAt: futureGeneratedAt,
            payload: {
              ...proof(),
              generatedAt: futureGeneratedAt.toISOString(),
            },
          },
          {
            generatedAt: new Date(generatedAt.getTime() + 60_000),
            payload: { invalid: true },
          },
          { generatedAt, payload: proof() },
        ]),
      },
      publicMarketingSnapshotInvalidation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );

    await expect(service.publicProductProof(now)).resolves.toMatchObject({
      payload: { generatedAt: generatedAt.toISOString() },
      stale: false,
    });
    expect(database.publicMarketingSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          generatedAt: {
            gte: new Date(now.getTime() - 86_400_000),
            lte: new Date(now.getTime() + 300_000),
          },
        },
      }),
    );
  });

  it("returns 503 instead of 500 when every in-window payload is invalid", async () => {
    const database = {
      publicMarketingSnapshot: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ generatedAt, payload: { invalid: true } }]),
      },
      publicMarketingSnapshotInvalidation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );

    await expect(service.publicProductProof(generatedAt)).rejects.toMatchObject(
      {
        status: HttpStatus.SERVICE_UNAVAILABLE,
      },
    );
  });

  it("sets public cache headers and returns 304 for a matching ETag", async () => {
    const service = {
      publicProductProof: vi.fn().mockResolvedValue({
        payload: proof(),
        etag: '"etag"',
        stale: false,
        revocationPending: false,
      }),
    };
    const controller = new PublicMarketingController(
      service as unknown as MarketingService,
    );
    const response = responseDouble();
    const request = { query: {}, cookies: { weddingos_session: "ignored" } };
    await controller.productProof(
      '"etag"',
      request as unknown as WeddingOsRequest,
      response as never,
    );
    expect(response.statusCode).toBe(304);
    expect(response.headers.get("cache-control")).toContain("s-maxage=840");
    expect(response.headers.get("cache-control")).toContain("must-revalidate");
    expect(response.headers.get("cache-control")).not.toContain(
      "stale-if-error",
    );
    expect(response.headers.get("etag")).toBe('"etag"');
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(service.publicProductProof).toHaveBeenCalledWith();
  });

  it("prevents recaching while a revocation invalidation is pending", async () => {
    const service = {
      publicProductProof: vi.fn().mockResolvedValue({
        payload: { ...proof(), freshness: "stale" },
        etag: '"revocation-pending"',
        stale: true,
        revocationPending: true,
      }),
    };
    const controller = new PublicMarketingController(
      service as unknown as MarketingService,
    );
    const response = responseDouble();

    await controller.productProof(
      undefined,
      { query: {} } as unknown as WeddingOsRequest,
      response as never,
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("warning")).toBe('110 - "Response is stale"');
  });

  it("rejects every query parameter and adds 503 retry headers", async () => {
    const service = {
      publicProductProof: vi
        .fn()
        .mockRejectedValue(
          new ProblemException(
            "ASYNC_DEPENDENCY_UNAVAILABLE",
            HttpStatus.SERVICE_UNAVAILABLE,
            "Unavailable",
          ),
        ),
    };
    const controller = new PublicMarketingController(
      service as unknown as MarketingService,
    );
    await expect(
      controller.productProof(
        undefined,
        { query: { workspaceId: "forbidden" } } as unknown as WeddingOsRequest,
        responseDouble() as never,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

    const response = responseDouble();
    await expect(
      controller.productProof(
        undefined,
        { query: {} } as unknown as WeddingOsRequest,
        response as never,
      ),
    ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("60");
  });
});

describe("public aggregate consent", () => {
  it("returns disabled version 0 when the workspace never opted in", async () => {
    const transaction = {
      workspaceMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roleTemplate: { key: "couple_owner" } }),
      },
      publicAggregateConsent: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    await expect(
      service.getConsent("user", crypto.randomUUID()),
    ).resolves.toMatchObject({
      enabled: false,
      version: 0,
      policyVersion: "public-aggregate-v1",
    });
  });

  it("accepts first PUT with If-Match 0 and writes an audit event", async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const auditCreate = vi.fn().mockResolvedValue(undefined);
    const eventRecord = vi.fn().mockResolvedValue(null);
    const transaction = {
      workspaceMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roleTemplate: { key: "couple_owner" } }),
      },
      publicAggregateConsent: {
        findUnique: vi.fn().mockResolvedValue(null),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          workspaceId,
          policyVersion: "public-aggregate-v1",
          consentedAt: generatedAt,
          revokedAt: null,
          version: 1,
        }),
      },
      auditEvent: { create: auditCreate },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(eventRecord),
    );
    const controller = new PublicAggregateConsentController(service);
    const response = await controller.update(
      { userId } as never,
      workspaceId,
      '"0"',
      { enabled: true, policyVersion: "public-aggregate-v1" },
      {
        requestId: "request",
        correlationId: "correlation",
      } as WeddingOsRequest,
    );
    expect(response.data).toMatchObject({ enabled: true, version: 1 });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "public_aggregate_consent.enabled",
          workspaceId,
          actorUserId: userId,
        }),
      }),
    );
    expect(eventRecord).not.toHaveBeenCalled();
  });

  it("rejects stale If-Match and protects GET and PUT with owner-only capability", async () => {
    const transaction = {
      workspaceMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roleTemplate: { key: "couple_owner" } }),
      },
      publicAggregateConsent: {
        findUnique: vi.fn().mockResolvedValue({ version: 2 }),
      },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    await expect(
      service.updateConsent("user", crypto.randomUUID(), 1, {
        enabled: false,
        policyVersion: "public-aggregate-v1",
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.PRECONDITION_FAILED,
      metadata: { latestVersion: 2 },
    });
    expect(
      Reflect.getMetadata(
        REQUIRED_CAPABILITY,
        PublicAggregateConsentController.prototype.get,
      ),
    ).toBe("workspace.manage_public_aggregation");
    expect(
      Reflect.getMetadata(
        REQUIRED_CAPABILITY,
        PublicAggregateConsentController.prototype.update,
      ),
    ).toBe("workspace.manage_public_aggregation");
  });

  it("rejects a non-owner even if a persisted override tries to allow the capability", async () => {
    const transaction = {
      workspaceMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleTemplate: { key: "couple_partner" },
          overrides: [
            {
              capability: "workspace.manage_public_aggregation",
              effect: "ALLOW",
            },
          ],
        }),
      },
      publicAggregateConsent: { findUnique: vi.fn() },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    await expect(
      service.getConsent(crypto.randomUUID(), crypto.randomUUID()),
    ).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN });
    expect(
      transaction.publicAggregateConsent.findUnique,
    ).not.toHaveBeenCalled();
  });

  it("maps a concurrent first-consent insert to a 412 version conflict", async () => {
    const auditCreate = vi.fn();
    const transaction = {
      workspaceMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roleTemplate: { key: "couple_owner" } }),
      },
      publicAggregateConsent: {
        findUnique: vi.fn().mockResolvedValue(null),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      auditEvent: { create: auditCreate },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    await expect(
      service.updateConsent(crypto.randomUUID(), crypto.randomUUID(), 0, {
        enabled: true,
        policyVersion: "public-aggregate-v1",
      }),
    ).rejects.toMatchObject({ status: HttpStatus.PRECONDITION_FAILED });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("durably requests an immediate snapshot refresh when consent is revoked", async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const eventRecord = vi.fn().mockResolvedValue(null);
    const invalidationCreate = vi.fn().mockResolvedValue({
      id: crypto.randomUUID(),
      invalidatedAt: generatedAt,
    });
    const transaction = {
      workspaceMembership: {
        findFirst: vi.fn().mockResolvedValue({
          roleTemplate: { key: "couple_owner" },
        }),
      },
      publicAggregateConsent: {
        findUnique: vi.fn().mockResolvedValue({
          policyVersion: "public-aggregate-v1",
          revokedAt: null,
          version: 1,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          workspaceId,
          policyVersion: "public-aggregate-v1",
          consentedAt: generatedAt,
          revokedAt: generatedAt,
          version: 2,
        }),
      },
      publicMarketingSnapshotInvalidation: { create: invalidationCreate },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(eventRecord),
    );
    await expect(
      service.updateConsent(userId, workspaceId, 1, {
        enabled: false,
        policyVersion: "public-aggregate-v1",
      }),
    ).resolves.toMatchObject({ enabled: false, version: 2 });
    expect(invalidationCreate).toHaveBeenCalledWith({
      data: { invalidatedAt: expect.any(Date) },
    });
    expect(eventRecord).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        eventName: "public_aggregate.consent_revoked.v1",
        aggregateType: "PublicAggregateConsent",
        aggregateId: workspaceId,
        aggregateVersion: 2,
        workspaceId,
        actorUserId: userId,
        maxAttempts: 8,
        deduplicationKey: `public-aggregate-consent-revoked:${workspaceId}:v2`,
      }),
    );
  });

  it("treats disabling absent consent as an unaudited no-op", async () => {
    const auditCreate = vi.fn();
    const transaction = {
      workspaceMembership: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ roleTemplate: { key: "couple_owner" } }),
      },
      publicAggregateConsent: { findUnique: vi.fn().mockResolvedValue(null) },
      auditEvent: { create: auditCreate },
    };
    const database = {
      withContext: vi.fn(
        async (
          _context: unknown,
          operation: (tx: typeof transaction) => unknown,
        ) => operation(transaction),
      ),
    };
    const service = new MarketingService(
      database as unknown as DatabaseService,
      environment(),
      asyncEvents(),
    );
    await expect(
      service.updateConsent(crypto.randomUUID(), crypto.randomUUID(), 0, {
        enabled: false,
        policyVersion: "public-aggregate-v1",
      }),
    ).resolves.toMatchObject({ enabled: false, version: 0 });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
