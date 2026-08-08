import { createHash } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import {
  PUBLIC_AGGREGATE_POLICY_VERSION,
  publicProductProofV1Schema,
  type PublicAggregateConsent,
  type PublicProductProofV1,
  type UpdatePublicAggregateConsent,
} from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import { AsyncService } from "../async/async.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";

const FRESH_SECONDS = 30 * 60;
const REVOCATION_SAFETY_GATE_SECONDS = 15 * 60;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export type PublicProductProofResult = {
  payload: PublicProductProofV1;
  etag: string;
  stale: boolean;
  revocationPending: boolean;
};

@Injectable()
export class MarketingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async publicProductProof(
    now = new Date(),
  ): Promise<PublicProductProofResult> {
    const oldestAllowed = new Date(
      now.getTime() -
        this.environment.MARKETING_SNAPSHOT_MAX_STALE_SECONDS * 1_000,
    );
    const newestAllowed = new Date(
      now.getTime() + MAX_CLOCK_SKEW_SECONDS * 1_000,
    );
    const [snapshotCandidates, latestInvalidation] = await Promise.all([
      this.database.publicMarketingSnapshot.findMany({
        where: {
          generatedAt: { gte: oldestAllowed, lte: newestAllowed },
        },
        orderBy: { generatedAt: "desc" },
        select: { generatedAt: true, payload: true },
      }),
      this.database.publicMarketingSnapshotInvalidation.findFirst({
        orderBy: { invalidatedAt: "desc" },
        select: { invalidatedAt: true },
      }),
    ]);
    let snapshot:
      { generatedAt: Date; payload: PublicProductProofV1 } | undefined;
    for (const candidate of snapshotCandidates) {
      if (
        candidate.generatedAt < oldestAllowed ||
        candidate.generatedAt > newestAllowed
      ) {
        continue;
      }
      const parsed = publicProductProofV1Schema.safeParse(candidate.payload);
      if (
        parsed.success &&
        parsed.data.generatedAt === candidate.generatedAt.toISOString()
      ) {
        snapshot = { generatedAt: candidate.generatedAt, payload: parsed.data };
        break;
      }
    }
    if (!snapshot) this.unavailable();
    const ageSeconds = (now.getTime() - snapshot.generatedAt.getTime()) / 1_000;
    const invalidationAgeSeconds = latestInvalidation
      ? (now.getTime() - latestInvalidation.invalidatedAt.getTime()) / 1_000
      : null;
    const revocationPending = Boolean(
      latestInvalidation &&
      snapshot.generatedAt <= latestInvalidation.invalidatedAt &&
      invalidationAgeSeconds !== null &&
      invalidationAgeSeconds < REVOCATION_SAFETY_GATE_SECONDS,
    );
    if (
      latestInvalidation &&
      snapshot.generatedAt <= latestInvalidation.invalidatedAt &&
      invalidationAgeSeconds !== null &&
      invalidationAgeSeconds >= REVOCATION_SAFETY_GATE_SECONDS
    ) {
      this.unavailable();
    }
    const stale = ageSeconds > FRESH_SECONDS || revocationPending;
    const payload = publicProductProofV1Schema.parse({
      ...snapshot.payload,
      freshness: stale ? "stale" : "fresh",
    });
    const etag = `"${createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex")}"`;
    return { payload, etag, stale, revocationPending };
  }

  async getConsent(
    userId: string,
    workspaceId: string,
  ): Promise<PublicAggregateConsent> {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.assertOwner(tx, userId, workspaceId);
      const consent = await tx.publicAggregateConsent.findUnique({
        where: { workspaceId },
      });
      return this.serializeConsent(workspaceId, consent);
    });
  }

  async updateConsent(
    userId: string,
    workspaceId: string,
    expectedVersion: number,
    input: UpdatePublicAggregateConsent,
    requestId?: string,
    correlationId?: string,
  ): Promise<PublicAggregateConsent> {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.assertOwner(tx, userId, workspaceId);
      const existing = await tx.publicAggregateConsent.findUnique({
        where: { workspaceId },
      });
      const latestVersion = existing?.version ?? 0;
      if (latestVersion !== expectedVersion) {
        this.versionConflict(latestVersion);
      }

      const now = new Date();
      let consent = existing;
      const wasActive =
        existing?.policyVersion === PUBLIC_AGGREGATE_POLICY_VERSION &&
        existing.revokedAt === null;
      if (!input.enabled && !wasActive) {
        return this.serializeConsent(workspaceId, existing);
      }
      if (input.enabled) {
        if (existing) {
          const updated = await tx.publicAggregateConsent.updateMany({
            where: { workspaceId, version: expectedVersion },
            data: {
              policyVersion: PUBLIC_AGGREGATE_POLICY_VERSION,
              consentedAt: now,
              consentedById: userId,
              revokedAt: null,
              revokedById: null,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) this.versionConflict(expectedVersion);
          consent = await tx.publicAggregateConsent.findUniqueOrThrow({
            where: { workspaceId },
          });
        } else {
          const created = await tx.publicAggregateConsent.createMany({
            data: [
              {
                workspaceId,
                policyVersion: PUBLIC_AGGREGATE_POLICY_VERSION,
                consentedAt: now,
                consentedById: userId,
              },
            ],
            skipDuplicates: true,
          });
          if (created.count !== 1) this.versionConflict(1);
          consent = await tx.publicAggregateConsent.findUniqueOrThrow({
            where: { workspaceId },
          });
        }
      } else if (existing) {
        const updated = await tx.publicAggregateConsent.updateMany({
          where: { workspaceId, version: expectedVersion },
          data: {
            revokedAt: now,
            revokedById: userId,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1) this.versionConflict(expectedVersion);
        consent = await tx.publicAggregateConsent.findUniqueOrThrow({
          where: { workspaceId },
        });
        await tx.publicMarketingSnapshotInvalidation.create({
          data: { invalidatedAt: now },
        });
        await this.asyncEvents.record(tx, {
          eventName: "public_aggregate.consent_revoked.v1",
          aggregateType: "PublicAggregateConsent",
          aggregateId: workspaceId,
          aggregateVersion: consent.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          maxAttempts: 8,
          deduplicationKey: `public-aggregate-consent-revoked:${workspaceId}:v${consent.version}`,
          payload: {
            subject: {
              workspaceId,
              consentVersion: consent.version,
            },
          },
        });
      }

      await tx.auditEvent.create({
        data: {
          action: input.enabled
            ? "public_aggregate_consent.enabled"
            : "public_aggregate_consent.revoked",
          actorUserId: userId,
          workspaceId,
          entityType: "PublicAggregateConsent",
          entityId: workspaceId,
          metadata: {
            enabled: input.enabled,
            policyVersion: PUBLIC_AGGREGATE_POLICY_VERSION,
            previousVersion: latestVersion,
            version: consent?.version ?? 0,
          },
          requestId,
          correlationId,
        },
      });
      return this.serializeConsent(workspaceId, consent);
    });
  }

  private serializeConsent(
    workspaceId: string,
    consent: {
      policyVersion: string;
      consentedAt: Date;
      revokedAt: Date | null;
      version: number;
    } | null,
  ): PublicAggregateConsent {
    const enabled =
      consent?.policyVersion === PUBLIC_AGGREGATE_POLICY_VERSION &&
      consent.revokedAt === null;
    return {
      workspaceId,
      enabled,
      policyVersion: PUBLIC_AGGREGATE_POLICY_VERSION,
      consentedAt: consent?.consentedAt.toISOString() ?? null,
      revokedAt: consent?.revokedAt?.toISOString() ?? null,
      version: consent?.version ?? 0,
    };
  }

  private unavailable(): never {
    problem(
      "ASYNC_DEPENDENCY_UNAVAILABLE",
      HttpStatus.SERVICE_UNAVAILABLE,
      "Public product proof unavailable",
      "Datele agregate nu sunt disponibile momentan.",
    );
  }

  private versionConflict(latestVersion: number): never {
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Consent version conflict",
      "Consimțământul a fost modificat între timp.",
      undefined,
      { latestVersion },
    );
  }

  private async assertOwner(
    transaction: Prisma.TransactionClient,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const membership = await transaction.workspaceMembership.findFirst({
      where: { workspaceId, userId, status: "ACTIVE" },
      include: { roleTemplate: true },
    });
    if (membership?.roleTemplate.key !== "couple_owner") {
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Workspace owner required",
        "Consimțământul pentru agregare poate fi administrat doar de proprietarul spațiului.",
        undefined,
        { requiredCapability: "workspace.manage_public_aggregation" },
      );
    }
  }
}
