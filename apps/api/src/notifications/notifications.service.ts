import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async list(
    userId: string,
    workspaceId: string,
    cursor?: string,
    limit = 20,
    module?: string,
    read?: boolean,
  ) {
    const take = Math.min(Math.max(limit, 1), 50);
    const items = await this.database.withContext({ userId }, (transaction) =>
      transaction.notification.findMany({
        where: {
          userId,
          workspaceId,
          dismissedAt: null,
          ...(module ? { module } : {}),
          ...(read === undefined
            ? {}
            : { readAt: read ? { not: null } : null }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: take + 1,
      }),
    );
    const hasMore = items.length > take;
    const page = items.slice(0, take);
    return {
      items: page.map(mapNotification),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async unreadCount(userId: string, workspaceId: string) {
    const count = await this.database.withContext({ userId }, (transaction) =>
      transaction.notification.count({
        where: { userId, workspaceId, readAt: null, dismissedAt: null },
      }),
    );
    return { count };
  }

  async update(
    userId: string,
    workspaceId: string,
    notificationId: string,
    read: boolean,
    version: number,
  ) {
    return this.database.withContext({ userId }, async (transaction) => {
      const result = await transaction.notification.updateMany({
        where: {
          id: notificationId,
          userId,
          workspaceId,
          version,
          dismissedAt: null,
        },
        data: { readAt: read ? new Date() : null, version: { increment: 1 } },
      });
      if (result.count === 0) {
        const exists = await transaction.notification.findFirst({
          where: {
            id: notificationId,
            userId,
            workspaceId,
            dismissedAt: null,
          },
        });
        problem(
          exists ? "VERSION_CONFLICT" : "NOT_FOUND",
          exists ? HttpStatus.CONFLICT : HttpStatus.NOT_FOUND,
          exists ? "Notification version conflict" : "Notification not found",
        );
      }
      const notification = await transaction.notification.findUniqueOrThrow({
        where: { id: notificationId },
      });
      await this.asyncEvents.record(transaction, {
        eventName: "notification.read.v1",
        aggregateType: "Notification",
        aggregateId: notification.id,
        aggregateVersion: notification.version,
        workspaceId,
        actorUserId: userId,
        deduplicationKey: `notification:${notification.id}:read:${notification.version}`,
        payload: { subject: { notificationId: notification.id, read } },
      });
      return mapNotification(notification);
    });
  }

  async markAllRead(userId: string, workspaceId: string) {
    const result = await this.database.withContext(
      { userId },
      async (transaction) => {
        const updated = await transaction.notification.updateMany({
          where: { userId, workspaceId, readAt: null, dismissedAt: null },
          data: { readAt: new Date(), version: { increment: 1 } },
        });
        if (updated.count > 0) {
          await this.asyncEvents.record(transaction, {
            eventName: "notification.read.v1",
            aggregateType: "WorkspaceNotificationSet",
            aggregateId: workspaceId,
            workspaceId,
            actorUserId: userId,
            deduplicationKey: `notifications:${workspaceId}:read-all:${randomUUID()}`,
            payload: { subject: { updated: updated.count } },
          });
        }
        return updated;
      },
    );
    return { updated: result.count };
  }

  async remove(
    userId: string,
    workspaceId: string,
    notificationId: string,
  ): Promise<void> {
    await this.database.withContext({ userId }, async (transaction) => {
      const notification = await transaction.notification.findFirst({
        where: { id: notificationId, userId, workspaceId },
      });
      if (!notification) {
        problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Notification not found");
      }
      await transaction.notification.delete({ where: { id: notificationId } });
      await this.asyncEvents.record(transaction, {
        eventName: "notification.dismissed.v1",
        aggregateType: "Notification",
        aggregateId: notificationId,
        aggregateVersion: notification.version,
        workspaceId,
        actorUserId: userId,
        deduplicationKey: `notification:${notificationId}:dismissed:${notification.version}`,
        payload: { subject: { notificationId } },
      });
    });
  }
}

function mapNotification(notification: {
  id: string;
  workspaceId: string | null;
  module: string;
  kind: string;
  priority: string;
  title: string;
  body: string;
  actionUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
  version: number;
}) {
  return {
    id: notification.id,
    workspaceId: notification.workspaceId,
    module: notification.module,
    kind: notification.kind,
    priority: notification.priority,
    title: notification.title,
    body: notification.body,
    actionUrl: notification.actionUrl,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
    version: notification.version,
  };
}
