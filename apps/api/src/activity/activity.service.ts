import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ActivityExportRequest } from "@weddingos/contracts";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { mapJob } from "../jobs/jobs.service";

@Injectable()
export class ActivityService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async list(
    userId: string,
    workspaceId: string,
    options: {
      cursor?: string;
      limit: number;
      category?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    const take = Math.min(Math.max(options.limit, 1), 100);
    const items = await this.database.withContext(
      { userId, workspaceId },
      (transaction) =>
        transaction.activityItem.findMany({
          where: {
            workspaceId,
            ...(options.category ? { category: options.category } : {}),
            ...(options.from || options.to
              ? {
                  occurredAt: {
                    ...(options.from ? { gte: options.from } : {}),
                    ...(options.to ? { lte: options.to } : {}),
                  },
                }
              : {}),
          },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          ...(options.cursor
            ? { cursor: { id: options.cursor }, skip: 1 }
            : {}),
          take: take + 1,
        }),
    );
    const hasMore = items.length > take;
    const page = items.slice(0, take);
    return {
      items: page.map((item) => ({
        id: item.id,
        actorName: item.actorName,
        category: item.category,
        action: item.action,
        summary: item.summary,
        entityType: item.entityType,
        entityId: item.entityId,
        metadata:
          item.metadata &&
          typeof item.metadata === "object" &&
          !Array.isArray(item.metadata)
            ? item.metadata
            : null,
        occurredAt: item.occurredAt.toISOString(),
      })),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async requestExport(
    userId: string,
    workspaceId: string,
    input: ActivityExportRequest,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const dedupe = `activity-export:${workspaceId}:${userId}:${idempotencyKey}`;
        const existing = await transaction.backgroundJob.findUnique({
          where: { deduplicationKey: dedupe },
        });
        if (existing) return mapJob(existing);
        const eventId = randomUUID();
        const jobId = await this.asyncEvents.record(transaction, {
          eventName: "activity.export_requested.v1",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: dedupe,
          userVisibleJob: true,
          payload: {
            subject: { eventId },
            export: { requestedByUserId: userId, filters: input },
          },
        });
        if (!jobId) throw new Error("Activity export job was not created");
        const job = await transaction.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        return mapJob(job);
      },
    );
  }
}
