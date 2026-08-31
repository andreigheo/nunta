import { createHmac, randomUUID } from "node:crypto";
import {
  HttpStatus,
  Inject,
  Injectable,
  type MessageEvent,
} from "@nestjs/common";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ApiEnvironment } from "@weddingos/config";
import type { Prisma } from "@weddingos/database";
import IORedis from "ioredis";
import { Observable } from "rxjs";
import { AsyncService } from "../async/async.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import {
  createOpaqueToken,
  decryptSensitive,
  encryptSensitive,
  hashToken,
  stableHash,
} from "../guests/sensitive.crypto";

type Transaction = Prisma.TransactionClient;
type Input = Record<string, unknown>;
type GuestContext = {
  grantId: string;
  workspaceId: string;
  householdId: string;
  tokenHash: string;
};

@Injectable()
export class EventDayService {
  private readonly storage: S3Client;
  private readonly publicStorage: S3Client;
  private readonly sensitiveKey: { keyId: string; secret: string };

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {
    this.sensitiveKey = {
      keyId: environment.OUTBOX_ENCRYPTION_KEY_ID,
      secret: environment.OUTBOX_ENCRYPTION_KEY,
    };
    this.storage = new S3Client({
      region: environment.OBJECT_STORAGE_REGION,
      endpoint: environment.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
      },
    });
    this.publicStorage = new S3Client({
      region: environment.OBJECT_STORAGE_REGION,
      endpoint: environment.OBJECT_STORAGE_PUBLIC_ENDPOINT,
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
      },
    });
  }

  async plans(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.weddingDayPlan.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: "desc" },
        })
      ).map(resource),
    }));
  }

  async plan(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      this.planResource(tx, workspaceId, planId),
    );
  }

  async contacts(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requirePlan(tx, workspaceId, planId);
      const rows = await tx.weddingDayContact.findMany({
        where: { workspaceId, planId },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
      });
      return { items: rows.map((row) => this.contactResource(row)) };
    });
  }

  async createContact(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "wedding-day.contact.create",
        key,
        { planId, ...input },
      );
      if (replay) return replay;
      await this.requirePlan(tx, workspaceId, planId);
      const row = await tx.weddingDayContact.create({
        data: {
          workspaceId,
          planId,
          type: enumValue(input.type) as never,
          name: text(input.name),
          role: text(input.role),
          organizationName: nullableText(input.organizationName),
          phoneEncrypted: encryptSensitive(
            nullableText(input.phone),
            this.sensitiveKey,
          ),
          emailNormalized: nullableText(input.email)?.toLowerCase() ?? null,
          notesPrivateEncrypted: encryptSensitive(
            nullableText(input.notesPrivate),
            this.sensitiveKey,
          ),
          priority: enumValue(input.priority, "MEDIUM") as never,
          guestVisible: booleanValue(input.guestVisible),
        },
      });
      const response = this.contactResource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "wedding-day.contact.create",
        key,
        { planId, ...input },
        response,
      );
      return response;
    });
  }

  async updateContact(
    userId: string,
    workspaceId: string,
    contactId: string,
    expectedVersion: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.weddingDayContact.findFirst({
        where: { id: contactId, workspaceId },
      });
      if (!row) notFound("Contactul nu există.");
      assertVersion(row.version, expectedVersion);
      return this.contactResource(
        await tx.weddingDayContact.update({
          where: { id: contactId },
          data: {
            ...(input.type !== undefined
              ? { type: enumValue(input.type) as never }
              : {}),
            ...(input.name !== undefined ? { name: text(input.name) } : {}),
            ...(input.role !== undefined ? { role: text(input.role) } : {}),
            ...(input.organizationName !== undefined
              ? { organizationName: nullableText(input.organizationName) }
              : {}),
            ...(input.phone !== undefined
              ? {
                  phoneEncrypted: encryptSensitive(
                    nullableText(input.phone),
                    this.sensitiveKey,
                  ),
                }
              : {}),
            ...(input.email !== undefined
              ? {
                  emailNormalized:
                    nullableText(input.email)?.toLowerCase() ?? null,
                }
              : {}),
            ...(input.notesPrivate !== undefined
              ? {
                  notesPrivateEncrypted: encryptSensitive(
                    nullableText(input.notesPrivate),
                    this.sensitiveKey,
                  ),
                }
              : {}),
            ...(input.priority !== undefined
              ? { priority: enumValue(input.priority) as never }
              : {}),
            ...(input.guestVisible !== undefined
              ? { guestVisible: booleanValue(input.guestVisible) }
              : {}),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async deleteContact(
    userId: string,
    workspaceId: string,
    contactId: string,
    expectedVersion: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.weddingDayContact.findFirst({
        where: { id: contactId, workspaceId },
      });
      if (!row) notFound("Contactul nu există.");
      assertVersion(row.version, expectedVersion);
      await tx.weddingDayContact.delete({ where: { id: contactId } });
      return { deleted: true, id: contactId };
    });
  }

  async createPlan(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.plan.create",
          key,
          input,
        );
        if (replay) return replay;
        const event = await tx.weddingEvent.findFirst({
          where: {
            id: text(input.weddingEventId),
            workspaceId,
            deletedAt: null,
          },
        });
        if (!event) notFound("Evenimentul nu există.");
        const duplicate = await tx.weddingDayPlan.findFirst({
          where: {
            workspaceId,
            weddingEventId: event.id,
            name: text(input.name),
          },
        });
        if (duplicate)
          conflict("Există deja un plan cu acest nume pentru eveniment.");
        const planId = randomUUID();
        const versionId = randomUUID();
        await tx.weddingDayPlan.create({
          data: {
            id: planId,
            workspaceId,
            weddingEventId: event.id,
            name: text(input.name),
            createdById: userId,
          },
        });
        const version = await tx.weddingDayPlanVersion.create({
          data: {
            id: versionId,
            workspaceId,
            planId,
            versionNumber: 1,
            title: text(input.title ?? input.name),
            summary: nullableText(input.summary),
            timezone: text(input.timezone),
            operationalDate: date(input.operationalDate),
            settings: json(input.settings ?? {}),
            contactDirectorySnapshot: [],
            contentHash: stableHash(input),
            createdById: userId,
          },
        });
        const plan = await tx.weddingDayPlan.update({
          where: { id: planId },
          data: { currentDraftVersionId: version.id },
        });
        await this.emit(tx, {
          eventName: "wedding_day.plan_created.v1",
          aggregateType: "WeddingDayPlan",
          aggregateId: plan.id,
          aggregateVersion: plan.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Planul operațional ${plan.name} a fost creat.`,
          guestVisible: false,
          organizerPayload: { planId: plan.id, status: plan.status },
        });
        const response = await this.planResource(tx, workspaceId, plan.id);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.plan.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updatePlan(
    userId: string,
    workspaceId: string,
    planId: string,
    expectedVersion: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const plan = await this.requirePlan(tx, workspaceId, planId);
        assertVersion(plan.version, expectedVersion);
        if (["LIVE", "PAUSED", "COMPLETED", "ARCHIVED"].includes(plan.status))
          conflict("Planul live sau finalizat nu poate fi editat direct.");
        const current = plan.currentDraftVersionId
          ? await tx.weddingDayPlanVersion.findUnique({
              where: { id: plan.currentDraftVersionId },
            })
          : null;
        const latest = await tx.weddingDayPlanVersion.aggregate({
          where: { planId },
          _max: { versionNumber: true },
        });
        const document = {
          title: input.title ?? current?.title ?? plan.name,
          summary:
            input.summary !== undefined ? input.summary : current?.summary,
          timezone: input.timezone ?? current?.timezone ?? "Europe/Bucharest",
          operationalDate:
            input.operationalDate ??
            current?.operationalDate.toISOString().slice(0, 10),
          settings: input.settings ?? current?.settings ?? {},
        };
        const version = await tx.weddingDayPlanVersion.create({
          data: {
            workspaceId,
            planId,
            versionNumber: (latest._max.versionNumber ?? 0) + 1,
            title: text(document.title),
            summary: nullableText(document.summary),
            timezone: text(document.timezone),
            operationalDate: date(document.operationalDate),
            settings: json(document.settings),
            contactDirectorySnapshot: current?.contactDirectorySnapshot ?? [],
            contentHash: stableHash(document),
            createdById: userId,
          },
        });
        await tx.weddingDayPlan.update({
          where: { id: planId },
          data: {
            name: input.name ? text(input.name) : undefined,
            currentDraftVersionId: version.id,
            status: "READY",
            version: { increment: 1 },
          },
        });
        return this.planResource(tx, workspaceId, planId);
      },
    );
  }

  async transitionPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    action: "publish" | "go-live" | "pause" | "complete",
    expectedVersion: number,
    key: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          `wedding-day.plan.${action}`,
          key,
          { planId, expectedVersion },
        );
        if (replay) return replay;
        const plan = await this.requirePlan(tx, workspaceId, planId);
        assertVersion(plan.version, expectedVersion);
        const now = new Date();
        let status: "PUBLISHED" | "LIVE" | "PAUSED" | "COMPLETED";
        let eventName:
          | "wedding_day.plan_published.v1"
          | "wedding_day.plan_live.v1"
          | "wedding_day.plan_paused.v1"
          | "wedding_day.plan_completed.v1";
        if (action === "publish") {
          if (
            !plan.currentDraftVersionId ||
            !["DRAFT", "READY", "PUBLISHED"].includes(plan.status)
          )
            conflict("Planul nu poate fi publicat în starea curentă.");
          await tx.weddingDayPlanVersion.update({
            where: { id: plan.currentDraftVersionId },
            data: { immutable: true, publishedAt: now },
          });
          status = "PUBLISHED";
          eventName = "wedding_day.plan_published.v1";
        } else if (action === "go-live") {
          if (!plan.publishedVersionId && plan.status !== "PUBLISHED")
            conflict("Publică planul înainte de go-live.");
          if (!["PUBLISHED", "PAUSED"].includes(plan.status))
            conflict("Planul nu poate intra live în starea curentă.");
          status = "LIVE";
          eventName = "wedding_day.plan_live.v1";
        } else if (action === "pause") {
          if (plan.status !== "LIVE")
            conflict("Doar un plan live poate fi pus pe pauză.");
          status = "PAUSED";
          eventName = "wedding_day.plan_paused.v1";
        } else {
          if (!["LIVE", "PAUSED"].includes(plan.status))
            conflict("Doar un plan live sau în pauză poate fi finalizat.");
          status = "COMPLETED";
          eventName = "wedding_day.plan_completed.v1";
        }
        const versionId =
          action === "publish"
            ? plan.currentDraftVersionId
            : (plan.liveVersionId ?? plan.publishedVersionId);
        const updated = await tx.weddingDayPlan.update({
          where: { id: planId },
          data: {
            status,
            ...(action === "publish" ? { publishedVersionId: versionId } : {}),
            ...(action === "go-live"
              ? { liveVersionId: versionId, startedAt: plan.startedAt ?? now }
              : {}),
            ...(action === "complete" ? { endedAt: now } : {}),
            version: { increment: 1 },
          },
        });
        await this.emit(tx, {
          eventName,
          aggregateType: "WeddingDayPlan",
          aggregateId: planId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Planul ${updated.name} are acum statusul ${status}.`,
          guestVisible: action === "go-live" || action === "pause",
          weddingEventId: updated.weddingEventId,
          organizerPayload: { planId, status },
          guestPayload: { planId, status },
        });
        const response = await this.planResource(tx, workspaceId, planId);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          `wedding-day.plan.${action}`,
          key,
          { planId, expectedVersion },
          response,
        );
        return response;
      },
    );
  }

  async runOfShow(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requirePlan(tx, workspaceId, planId);
      const items = await tx.runOfShowItem.findMany({
        where: { workspaceId, planId },
        orderBy: [{ position: "asc" }, { plannedStartAt: "asc" }],
      });
      const dependencies = await tx.runOfShowDependency.findMany({
        where: { workspaceId, planId },
      });
      const assignments = await tx.runOfShowItemAssignment.findMany({
        where: { workspaceId, itemId: { in: items.map((item) => item.id) } },
      });
      return {
        items: items.map(resource),
        dependencies: dependencies.map(resource),
        assignments: assignments.map(resource),
        serverTime: new Date().toISOString(),
      };
    });
  }

  async createRunItem(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.item.create",
          key,
          input,
        );
        if (replay) return replay;
        const plan = await this.requirePlan(tx, workspaceId, planId);
        if (input.parentItemId) {
          const parent = await tx.runOfShowItem.findFirst({
            where: { id: text(input.parentItemId), workspaceId, planId },
          });
          if (!parent) validation("Elementul părinte nu aparține planului.");
        }
        const item = await tx.runOfShowItem.create({
          data: {
            workspaceId,
            planId,
            planVersionId: plan.currentDraftVersionId,
            weddingEventId: plan.weddingEventId,
            parentItemId: nullableText(input.parentItemId),
            sourceType: text(input.sourceType ?? "manual"),
            sourceId: nullableText(input.sourceId),
            type: enumValue(input.type, "CUSTOM") as never,
            title: text(input.title),
            description: nullableText(input.description),
            plannedStartAt: date(input.plannedStartAt),
            plannedEndAt: optionalDate(input.plannedEndAt),
            locationName: nullableText(input.locationName),
            locationAddress: nullableText(input.locationAddress),
            priority: enumValue(input.priority, "MEDIUM") as never,
            position: numberValue(input.position, 0),
            isGuestVisible: booleanValue(input.isGuestVisible),
            isCritical: booleanValue(input.isCritical),
            requiresConfirmation: booleanValue(input.requiresConfirmation),
          },
        });
        await this.emit(tx, {
          eventName: "wedding_day.item_created.v1",
          aggregateType: "RunOfShowItem",
          aggregateId: item.id,
          aggregateVersion: item.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Momentul ${item.title} a fost adăugat în Run of Show.`,
          weddingEventId: plan.weddingEventId,
          guestVisible: item.isGuestVisible,
          organizerPayload: { itemId: item.id, status: item.status },
          guestPayload: item.isGuestVisible ? safeRunItem(item) : undefined,
        });
        const response = resource(item);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.item.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateRunItem(
    userId: string,
    workspaceId: string,
    itemId: string,
    expectedVersion: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const item = await this.requireRunItem(tx, workspaceId, itemId);
        assertVersion(item.version, expectedVersion);
        if (Object.prototype.hasOwnProperty.call(input, "status"))
          validation("Statusul se schimbă numai prin transitions.");
        const updated = await tx.runOfShowItem.update({
          where: { id: itemId },
          data: {
            ...(input.title !== undefined ? { title: text(input.title) } : {}),
            ...(input.description !== undefined
              ? { description: nullableText(input.description) }
              : {}),
            ...(input.type !== undefined
              ? { type: enumValue(input.type) as never }
              : {}),
            ...(input.plannedStartAt !== undefined
              ? { plannedStartAt: date(input.plannedStartAt) }
              : {}),
            ...(input.plannedEndAt !== undefined
              ? { plannedEndAt: optionalDate(input.plannedEndAt) }
              : {}),
            ...(input.locationName !== undefined
              ? { locationName: nullableText(input.locationName) }
              : {}),
            ...(input.locationAddress !== undefined
              ? { locationAddress: nullableText(input.locationAddress) }
              : {}),
            ...(input.priority !== undefined
              ? { priority: enumValue(input.priority) as never }
              : {}),
            ...(input.position !== undefined
              ? { position: numberValue(input.position) }
              : {}),
            ...(input.isGuestVisible !== undefined
              ? { isGuestVisible: booleanValue(input.isGuestVisible) }
              : {}),
            ...(input.isCritical !== undefined
              ? { isCritical: booleanValue(input.isCritical) }
              : {}),
            ...(input.requiresConfirmation !== undefined
              ? {
                  requiresConfirmation: booleanValue(
                    input.requiresConfirmation,
                  ),
                }
              : {}),
            version: { increment: 1 },
          },
        });
        return resource(updated);
      },
    );
  }

  async transitionRunItem(
    userId: string,
    workspaceId: string,
    itemId: string,
    expectedVersion: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const item = await this.requireRunItem(tx, workspaceId, itemId);
        assertVersion(item.version, expectedVersion);
        const transition = text(input.transition);
        const reason = nullableText(input.reason);
        const now = new Date();
        const target = runTransition(
          item.status,
          transition,
          reason,
          input.delayEstimateMinutes,
        );
        if (transition === "START") {
          const blockers = await tx.runOfShowDependency.findMany({
            where: { itemId },
          });
          if (blockers.length) {
            const dependencies = await tx.runOfShowItem.findMany({
              where: {
                id: { in: blockers.map((edge) => edge.dependsOnItemId) },
              },
            });
            if (
              dependencies.some(
                (dependency) => dependency.status !== "COMPLETED",
              )
            )
              conflict("Elementul este blocat de o dependență nefinalizată.");
          }
        }
        const updated = await tx.runOfShowItem.update({
          where: { id: itemId },
          data: {
            status: target.status,
            statusReason: reason,
            delayEstimateMinutes:
              target.status === "DELAYED"
                ? numberValue(input.delayEstimateMinutes, 0)
                : null,
            actualStartAt:
              transition === "START"
                ? now
                : transition === "REOPEN"
                  ? null
                  : item.actualStartAt,
            actualEndAt:
              transition === "COMPLETE"
                ? now
                : transition === "REOPEN"
                  ? null
                  : item.actualEndAt,
            version: { increment: 1 },
          },
        });
        await tx.runOfShowItemUpdate.create({
          data: {
            workspaceId,
            itemId,
            authorUserId: userId,
            type: transition,
            body: reason,
            metadata: json({ from: item.status, to: updated.status }),
          },
        });
        const eventName =
          transition === "START"
            ? "wedding_day.item_started.v1"
            : transition === "MARK_DELAYED"
              ? "wedding_day.item_delayed.v1"
              : transition === "BLOCK"
                ? "wedding_day.item_blocked.v1"
                : transition === "COMPLETE"
                  ? "wedding_day.item_completed.v1"
                  : "wedding_day.item_cancelled.v1";
        await this.emit(tx, {
          eventName,
          aggregateType: "RunOfShowItem",
          aggregateId: itemId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Momentul ${updated.title} are statusul ${updated.status}.`,
          weddingEventId: updated.weddingEventId,
          guestVisible: updated.isGuestVisible,
          organizerPayload: { itemId, status: updated.status },
          guestPayload: updated.isGuestVisible
            ? safeRunItem(updated)
            : undefined,
        });
        return resource(updated);
      },
    );
  }

  async deleteRunItem(
    userId: string,
    workspaceId: string,
    itemId: string,
    expectedVersion: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const item = await this.requireRunItem(tx, workspaceId, itemId);
      assertVersion(item.version, expectedVersion);
      if (["IN_PROGRESS", "COMPLETED"].includes(item.status))
        conflict("Un moment început sau finalizat nu poate fi șters.");
      await tx.runOfShowItem.delete({ where: { id: itemId } });
      return { deleted: true, id: itemId };
    });
  }

  async reorderRun(
    userId: string,
    workspaceId: string,
    planId: string,
    expectedVersion: number,
    itemIds: string[],
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const plan = await this.requirePlan(tx, workspaceId, planId);
      assertVersion(plan.version, expectedVersion);
      const count = await tx.runOfShowItem.count({
        where: { workspaceId, planId, id: { in: itemIds } },
      });
      if (count !== itemIds.length || new Set(itemIds).size !== itemIds.length)
        validation("Ordinea conține elemente invalide sau duplicate.");
      await Promise.all(
        itemIds.map((id, position) =>
          tx.runOfShowItem.update({
            where: { id },
            data: { position, version: { increment: 1 } },
          }),
        ),
      );
      const updated = await tx.weddingDayPlan.update({
        where: { id: planId },
        data: { version: { increment: 1 } },
      });
      return { itemIds, version: updated.version };
    });
  }

  async replaceDependencies(
    userId: string,
    workspaceId: string,
    itemId: string,
    expectedVersion: number,
    dependencies: Array<{
      itemId: string;
      dependencyType: "FINISH_TO_START" | "START_TO_START";
    }>,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const item = await this.requireRunItem(tx, workspaceId, itemId);
      assertVersion(item.version, expectedVersion);
      const all = await tx.runOfShowItem.findMany({
        where: { workspaceId, planId: item.planId },
        select: { id: true },
      });
      const ids = new Set(all.map((row) => row.id));
      if (
        dependencies.some(
          (edge) => edge.itemId === itemId || !ids.has(edge.itemId),
        )
      )
        validation("Dependență invalidă sau cross-plan.");
      const existing = await tx.runOfShowDependency.findMany({
        where: { workspaceId, planId: item.planId },
      });
      const edges = existing
        .filter((edge) => edge.itemId !== itemId)
        .map((edge) => [edge.itemId, edge.dependsOnItemId] as const)
        .concat(dependencies.map((edge) => [itemId, edge.itemId] as const));
      if (hasCycle([...ids], edges))
        validation("Dependențele ar crea un ciclu.");
      await tx.runOfShowDependency.deleteMany({ where: { itemId } });
      if (dependencies.length)
        await tx.runOfShowDependency.createMany({
          data: dependencies.map((edge) => ({
            workspaceId,
            planId: item.planId,
            itemId,
            dependsOnItemId: edge.itemId,
            dependencyType: edge.dependencyType,
          })),
        });
      const updated = await tx.runOfShowItem.update({
        where: { id: itemId },
        data: { version: { increment: 1 } },
      });
      return { itemId, dependencies, version: updated.version };
    });
  }

  async checklists(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requirePlan(tx, workspaceId, planId);
      const lists = await tx.weddingDayChecklist.findMany({
        where: { workspaceId, planId },
        orderBy: { position: "asc" },
      });
      const items = await tx.weddingDayChecklistItem.findMany({
        where: {
          workspaceId,
          checklistId: { in: lists.map((list) => list.id) },
        },
        orderBy: { position: "asc" },
      });
      return {
        items: lists.map((list) => ({
          ...resource(list),
          items: items
            .filter((item) => item.checklistId === list.id)
            .map(resource),
        })),
      };
    });
  }

  async createChecklist(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "wedding-day.checklist.create",
        key,
        input,
      );
      if (replay) return replay;
      const plan = await this.requirePlan(tx, workspaceId, planId);
      const row = await tx.weddingDayChecklist.create({
        data: {
          workspaceId,
          planId,
          weddingEventId: plan.weddingEventId,
          type: enumValue(input.type, "CUSTOM") as never,
          title: text(input.title),
          description: nullableText(input.description),
          position: numberValue(input.position, 0),
          createdById: userId,
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "wedding-day.checklist.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async createChecklistItem(
    userId: string,
    workspaceId: string,
    checklistId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "wedding-day.checklist-item.create",
        key,
        input,
      );
      if (replay) return replay;
      const list = await tx.weddingDayChecklist.findFirst({
        where: { id: checklistId, workspaceId },
      });
      if (!list) notFound("Checklist-ul nu există.");
      const row = await tx.weddingDayChecklistItem.create({
        data: {
          workspaceId,
          checklistId,
          sourceTaskId: nullableText(input.sourceTaskId),
          title: text(input.title),
          description: nullableText(input.description),
          priority: enumValue(input.priority, "MEDIUM") as never,
          assignedMembershipId: nullableText(input.assignedMembershipId),
          dueAt: optionalDate(input.dueAt),
          position: numberValue(input.position, 0),
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "wedding-day.checklist-item.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateChecklistItem(
    userId: string,
    workspaceId: string,
    itemId: string,
    expectedVersion: number,
    input: Input,
    transition?: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const item = await tx.weddingDayChecklistItem.findFirst({
        where: { id: itemId, workspaceId },
      });
      if (!item) notFound("Elementul checklist nu există.");
      assertVersion(item.version, expectedVersion);
      let status = item.status;
      if (transition)
        status = checklistTransition(
          item.status,
          transition,
          nullableText(input.reason),
        );
      const row = await tx.weddingDayChecklistItem.update({
        where: { id: itemId },
        data: {
          ...(input.title !== undefined ? { title: text(input.title) } : {}),
          ...(input.description !== undefined
            ? { description: nullableText(input.description) }
            : {}),
          ...(input.priority !== undefined
            ? { priority: enumValue(input.priority) as never }
            : {}),
          ...(input.assignedMembershipId !== undefined
            ? { assignedMembershipId: nullableText(input.assignedMembershipId) }
            : {}),
          ...(input.dueAt !== undefined
            ? { dueAt: optionalDate(input.dueAt) }
            : {}),
          status,
          completedById:
            status === "COMPLETED"
              ? userId
              : transition === "REOPEN"
                ? null
                : item.completedById,
          completedAt:
            status === "COMPLETED"
              ? new Date()
              : transition === "REOPEN"
                ? null
                : item.completedAt,
          version: { increment: 1 },
        },
      });
      return resource(row);
    });
  }

  async incidents(
    userId: string,
    workspaceId: string,
    planId: string,
    canReadSensitive: boolean,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.weddingDayIncident.findMany({
        where: { workspaceId, planId },
        orderBy: [{ severity: "desc" }, { startedAt: "desc" }],
      });
      return {
        items: rows.map((row) => incidentResource(row, canReadSensitive)),
      };
    });
  }

  async incident(
    userId: string,
    workspaceId: string,
    incidentId: string,
    canReadSensitive: boolean,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const incident = await this.requireIncident(tx, workspaceId, incidentId);
      const [updates, decisions, assignments] = await Promise.all([
        tx.weddingDayIncidentUpdate.findMany({
          where: { incidentId },
          orderBy: { occurredAt: "asc" },
        }),
        tx.weddingDayDecision.findMany({
          where: { incidentId },
          orderBy: { decidedAt: "asc" },
        }),
        tx.weddingDayIncidentAssignment.findMany({
          where: { incidentId },
          orderBy: { assignedAt: "asc" },
        }),
      ]);
      return {
        ...incidentResource(incident, canReadSensitive),
        updates: updates.map((row) =>
          canReadSensitive
            ? resource(row)
            : {
                id: row.id,
                updateType: row.updateType,
                occurredAt: row.occurredAt.toISOString(),
              },
        ),
        decisions: decisions.map(resource),
        assignments: assignments.map(resource),
      };
    });
  }

  async createIncident(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.incident.create",
          key,
          input,
        );
        if (replay) return replay;
        const plan = await this.requirePlan(tx, workspaceId, planId);
        const row = await tx.weddingDayIncident.create({
          data: {
            workspaceId,
            planId,
            weddingEventId: plan.weddingEventId,
            type: enumValue(input.type) as never,
            severity: enumValue(input.severity) as never,
            title: text(input.title),
            descriptionPrivate: text(input.descriptionPrivate),
            reportedById: userId,
            assignedToMembershipId: nullableText(input.assignedToMembershipId),
            relatedRunOfShowItemId: nullableText(input.relatedRunOfShowItemId),
            relatedVendorBookingId: nullableText(input.relatedVendorBookingId),
          },
        });
        const critical = row.severity === "CRITICAL";
        await this.emit(tx, {
          eventName: "wedding_day.incident_created.v1",
          aggregateType: "WeddingDayIncident",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: critical
            ? "A fost raportat un incident critic. Detaliile sunt restricționate."
            : `Incident raportat: ${row.title}.`,
          weddingEventId: plan.weddingEventId,
          guestVisible: false,
          organizerPayload: {
            incidentId: row.id,
            severity: row.severity,
            status: row.status,
          },
          extraPayload: critical
            ? { incidentEscalation: { incidentId: row.id } }
            : undefined,
        });
        if (critical)
          await this.notifyIncidentAudience(
            tx,
            workspaceId,
            row.id,
            correlationId,
          );
        const response = incidentResource(row, true);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.incident.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async addIncidentUpdate(
    userId: string,
    workspaceId: string,
    incidentId: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.requireIncident(tx, workspaceId, incidentId);
      return resource(
        await tx.weddingDayIncidentUpdate.create({
          data: {
            workspaceId,
            incidentId,
            authorUserId: userId,
            updateType: enumValue(input.updateType, "NOTE") as never,
            body: text(input.body),
          },
        }),
      );
    });
  }

  async transitionIncident(
    userId: string,
    workspaceId: string,
    incidentId: string,
    expectedVersion: number,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const row = await this.requireIncident(tx, workspaceId, incidentId);
        assertVersion(row.version, expectedVersion);
        const status = incidentTransition(
          row.status,
          text(input.transition),
          nullableText(input.reason),
        );
        const now = new Date();
        const updated = await tx.weddingDayIncident.update({
          where: { id: incidentId },
          data: {
            status,
            acknowledgedAt:
              status === "ACKNOWLEDGED" ? now : row.acknowledgedAt,
            resolvedAt:
              status === "RESOLVED" || status === "CLOSED"
                ? now
                : status === "OPEN"
                  ? null
                  : row.resolvedAt,
            version: { increment: 1 },
          },
        });
        await tx.weddingDayIncidentUpdate.create({
          data: {
            workspaceId,
            incidentId,
            authorUserId: userId,
            updateType: status === "RESOLVED" ? "RESOLUTION" : "STATUS_CHANGE",
            body: nullableText(input.reason) ?? `Status: ${status}`,
          },
        });
        if (status === "RESOLVED")
          await this.emit(tx, {
            eventName: "wedding_day.incident_resolved.v1",
            aggregateType: "WeddingDayIncident",
            aggregateId: incidentId,
            aggregateVersion: updated.version,
            workspaceId,
            actorUserId: userId,
            correlationId,
            summary: `Incidentul ${updated.title} a fost rezolvat.`,
            weddingEventId: updated.weddingEventId,
            guestVisible: false,
            organizerPayload: { incidentId, status },
          });
        return incidentResource(updated, true);
      },
    );
  }

  async createDecision(
    userId: string,
    workspaceId: string,
    incidentId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.decision.create",
          key,
          input,
        );
        if (replay) return replay;
        const incident = await this.requireIncident(
          tx,
          workspaceId,
          incidentId,
        );
        const row = await tx.weddingDayDecision.create({
          data: {
            workspaceId,
            incidentId,
            planId: incident.planId,
            title: text(input.title),
            decision: text(input.decision),
            reason: nullableText(input.reason),
            decidedById: userId,
            impactSummary: nullableText(input.impactSummary),
          },
        });
        await this.emit(tx, {
          eventName: "wedding_day.decision_recorded.v1",
          aggregateType: "WeddingDayDecision",
          aggregateId: row.id,
          aggregateVersion: row.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `O decizie operațională a fost înregistrată pentru incidentul ${incident.title}.`,
          weddingEventId: incident.weddingEventId,
          guestVisible: false,
          organizerPayload: { incidentId, decisionId: row.id },
        });
        const response = resource(row);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.decision.create",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async announcements(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.weddingDayAnnouncement.findMany({
        where: { workspaceId, planId },
        orderBy: { createdAt: "desc" },
      });
      return {
        items: await Promise.all(
          rows.map((row) => this.announcementResource(tx, row)),
        ),
      };
    });
  }

  async createAnnouncement(
    userId: string,
    workspaceId: string,
    planId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "wedding-day.announcement.create",
        key,
        input,
      );
      if (replay) return replay;
      const plan = await this.requirePlan(tx, workspaceId, planId);
      const row = await tx.weddingDayAnnouncement.create({
        data: {
          workspaceId,
          planId,
          weddingEventId: plan.weddingEventId,
          title: text(input.title),
          body: text(input.body),
          priority: enumValue(input.priority, "INFO") as never,
          channels: stringArray(input.channels),
          publishAt: optionalDate(input.publishAt),
          expiresAt: optionalDate(input.expiresAt),
          status: input.publishAt ? "SCHEDULED" : "DRAFT",
          createdById: userId,
        },
      });
      const audiences = array(input.audiences);
      await tx.weddingDayAnnouncementAudience.createMany({
        data: audiences.map((entry) => {
          const audience = object(entry);
          return {
            workspaceId,
            announcementId: row.id,
            audienceType: enumValue(audience.type) as never,
            selector: json(audience.selector ?? {}),
          };
        }),
      });
      const response = await this.announcementResource(tx, row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "wedding-day.announcement.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateAnnouncement(
    userId: string,
    workspaceId: string,
    announcementId: string,
    expectedVersion: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await this.requireAnnouncement(
        tx,
        workspaceId,
        announcementId,
      );
      assertVersion(row.version, expectedVersion);
      if (!["DRAFT", "SCHEDULED"].includes(row.status))
        conflict("Anunțul publicat nu mai poate fi editat.");
      const updated = await tx.weddingDayAnnouncement.update({
        where: { id: announcementId },
        data: {
          ...(input.title !== undefined ? { title: text(input.title) } : {}),
          ...(input.body !== undefined ? { body: text(input.body) } : {}),
          ...(input.priority !== undefined
            ? { priority: enumValue(input.priority) as never }
            : {}),
          ...(input.channels !== undefined
            ? { channels: stringArray(input.channels) }
            : {}),
          ...(input.publishAt !== undefined
            ? {
                publishAt: optionalDate(input.publishAt),
                status: input.publishAt ? "SCHEDULED" : "DRAFT",
              }
            : {}),
          ...(input.expiresAt !== undefined
            ? { expiresAt: optionalDate(input.expiresAt) }
            : {}),
          version: { increment: 1 },
        },
      });
      if (input.audiences) {
        await tx.weddingDayAnnouncementAudience.deleteMany({
          where: { announcementId },
        });
        await tx.weddingDayAnnouncementAudience.createMany({
          data: array(input.audiences).map((entry) => {
            const audience = object(entry);
            return {
              workspaceId,
              announcementId,
              audienceType: enumValue(audience.type) as never,
              selector: json(audience.selector ?? {}),
            };
          }),
        });
      }
      return this.announcementResource(tx, updated);
    });
  }

  async publishAnnouncement(
    userId: string,
    workspaceId: string,
    announcementId: string,
    expectedVersion: number,
    key: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.announcement.publish",
          key,
          { announcementId, expectedVersion },
        );
        if (replay) return replay;
        const row = await this.requireAnnouncement(
          tx,
          workspaceId,
          announcementId,
        );
        assertVersion(row.version, expectedVersion);
        if (!["DRAFT", "SCHEDULED"].includes(row.status))
          conflict("Anunțul nu poate fi publicat în starea curentă.");
        const audiences = await tx.weddingDayAnnouncementAudience.findMany({
          where: { announcementId },
        });
        const grants = await this.resolveAnnouncementGrants(
          tx,
          row.weddingEventId,
          audiences,
        );
        for (const audience of audiences)
          await tx.weddingDayAnnouncementAudience.update({
            where: { id: audience.id },
            data: {
              snapshot: json({
                grantIds: grants.map((grant) => grant.id),
                householdIds: grants.map((grant) => grant.householdId),
              }),
              snapshotHash: stableHash(grants.map((grant) => grant.id).sort()),
            },
          });
        const channels = row.channels.filter((channel) =>
          ["GUEST_COMPANION", "IN_APP", "EMAIL"].includes(channel),
        );
        const deliveries = grants.flatMap((grant) =>
          channels.map((channel) => ({
            workspaceId,
            announcementId,
            guestAccessGrantId: grant.id,
            householdId: grant.householdId,
            channel,
            status: channel === "GUEST_COMPANION" ? "PUBLISHED" : "QUEUED",
            deliveredAt: channel === "GUEST_COMPANION" ? new Date() : null,
            dedupeKey: `announcement:${announcementId}:${grant.id}:${channel}`,
          })),
        );
        if (deliveries.length)
          await tx.weddingDayAnnouncementDelivery.createMany({
            data: deliveries,
            skipDuplicates: true,
          });
        const updated = await tx.weddingDayAnnouncement.update({
          where: { id: announcementId },
          data: {
            status: "PUBLISHED",
            publishedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.emit(tx, {
          eventName: "wedding_day.announcement_published.v1",
          aggregateType: "WeddingDayAnnouncement",
          aggregateId: announcementId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Anunț publicat: ${updated.title}.`,
          weddingEventId: updated.weddingEventId,
          guestVisible: true,
          householdIds: grants.map((grant) => grant.householdId),
          organizerPayload: {
            announcementId,
            status: updated.status,
            audienceCount: grants.length,
          },
          guestPayload: {
            announcementId,
            title: updated.title,
            body: updated.body,
            priority: updated.priority,
            expiresAt: updated.expiresAt?.toISOString() ?? null,
          },
          extraPayload: {
            announcementDelivery: { announcementId },
            announcementSummary: { announcementId },
          },
        });
        const response = await this.announcementResource(tx, updated);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.announcement.publish",
          key,
          { announcementId, expectedVersion },
          response,
        );
        return response;
      },
    );
  }

  async cancelAnnouncement(
    userId: string,
    workspaceId: string,
    announcementId: string,
    expectedVersion: number,
    key: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.announcement.cancel",
          key,
          { announcementId, expectedVersion },
        );
        if (replay) return replay;
        const row = await this.requireAnnouncement(
          tx,
          workspaceId,
          announcementId,
        );
        assertVersion(row.version, expectedVersion);
        if (["CANCELLED", "EXPIRED"].includes(row.status))
          return this.announcementResource(tx, row);
        const updated = await tx.weddingDayAnnouncement.update({
          where: { id: announcementId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.emit(tx, {
          eventName: "wedding_day.announcement_cancelled.v1",
          aggregateType: "WeddingDayAnnouncement",
          aggregateId: announcementId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Anunț retras: ${updated.title}.`,
          weddingEventId: updated.weddingEventId,
          guestVisible: true,
          organizerPayload: { announcementId, status: updated.status },
          guestPayload: { announcementId, status: updated.status },
        });
        const response = await this.announcementResource(tx, updated);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.announcement.cancel",
          key,
          { announcementId, expectedVersion },
          response,
        );
        return response;
      },
    );
  }

  // Check-in lifecycle -----------------------------------------------------
  async sessions(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.guestCheckInSession.findMany({
          where: { workspaceId },
          orderBy: { opensAt: "desc" },
        })
      ).map(resource),
    }));
  }

  async session(userId: string, workspaceId: string, sessionId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const session = await this.requireSession(tx, workspaceId, sessionId);
      const [stations, devices] = await Promise.all([
        tx.guestCheckInStation.findMany({ where: { workspaceId, sessionId } }),
        tx.guestCheckInDevice.findMany({
          where: { workspaceId, sessionId },
          select: {
            id: true,
            sessionId: true,
            stationId: true,
            name: true,
            devicePublicId: true,
            status: true,
            lastSeenAt: true,
            credentialExpiresAt: true,
            version: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]);
      return {
        ...resource(session),
        stations: stations.map(resource),
        devices: devices.map(resource),
      };
    });
  }

  async createSession(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "check-in.session.create",
        key,
        input,
      );
      if (replay) return replay;
      const event = await tx.weddingEvent.findFirst({
        where: { id: text(input.weddingEventId), workspaceId, deletedAt: null },
      });
      if (!event) notFound("Evenimentul nu există.");
      if (date(input.closesAt) <= date(input.opensAt))
        validation("Închiderea trebuie să fie după deschidere.");
      const row = await tx.guestCheckInSession.create({
        data: {
          workspaceId,
          weddingEventId: event.id,
          planId: nullableText(input.planId),
          name: text(input.name),
          opensAt: date(input.opensAt),
          closesAt: date(input.closesAt),
          allowHouseholdCheckIn: booleanValue(
            input.allowHouseholdCheckIn,
            true,
          ),
          allowManualLookup: booleanValue(input.allowManualLookup, true),
          allowOffline: booleanValue(input.allowOffline),
          createdById: userId,
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "check-in.session.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateSession(
    userId: string,
    workspaceId: string,
    sessionId: string,
    expectedVersion: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await this.requireSession(tx, workspaceId, sessionId);
      assertVersion(row.version, expectedVersion);
      if (["CLOSED", "ARCHIVED"].includes(row.status))
        conflict("Sesiunea închisă nu mai poate fi editată.");
      const updated = await tx.guestCheckInSession.update({
        where: { id: sessionId },
        data: {
          ...(input.name !== undefined ? { name: text(input.name) } : {}),
          ...(input.opensAt !== undefined
            ? { opensAt: date(input.opensAt) }
            : {}),
          ...(input.closesAt !== undefined
            ? { closesAt: date(input.closesAt) }
            : {}),
          ...(input.allowHouseholdCheckIn !== undefined
            ? {
                allowHouseholdCheckIn: booleanValue(
                  input.allowHouseholdCheckIn,
                ),
              }
            : {}),
          ...(input.allowManualLookup !== undefined
            ? { allowManualLookup: booleanValue(input.allowManualLookup) }
            : {}),
          ...(input.allowOffline !== undefined
            ? { allowOffline: booleanValue(input.allowOffline) }
            : {}),
          version: { increment: 1 },
        },
      });
      return resource(updated);
    });
  }

  async transitionSession(
    userId: string,
    workspaceId: string,
    sessionId: string,
    expectedVersion: number,
    transition: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const row = await this.requireSession(tx, workspaceId, sessionId);
        assertVersion(row.version, expectedVersion);
        const status = sessionTransition(row.status, transition);
        const updated = await tx.guestCheckInSession.update({
          where: { id: sessionId },
          data: { status, version: { increment: 1 } },
        });
        if (status === "OPEN" || status === "CLOSED")
          await this.emit(tx, {
            eventName:
              status === "OPEN"
                ? "check_in.session_opened.v1"
                : "check_in.session_closed.v1",
            aggregateType: "GuestCheckInSession",
            aggregateId: sessionId,
            aggregateVersion: updated.version,
            workspaceId,
            actorUserId: userId,
            correlationId,
            summary: `Sesiunea de check-in ${updated.name} este ${status}.`,
            weddingEventId: updated.weddingEventId,
            guestVisible: false,
            organizerPayload: { sessionId, status },
            extraPayload: {
              checkInProjection: { sessionId },
              attendanceProjection: { sessionId },
            },
          });
        return resource(updated);
      },
    );
  }

  async createStation(
    userId: string,
    workspaceId: string,
    sessionId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "check-in.station.create",
        key,
        input,
      );
      if (replay) return replay;
      await this.requireSession(tx, workspaceId, sessionId);
      const row = await tx.guestCheckInStation.create({
        data: {
          workspaceId,
          sessionId,
          name: text(input.name),
          location: nullableText(input.location),
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "check-in.station.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async updateStation(
    userId: string,
    workspaceId: string,
    stationId: string,
    expectedVersion: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guestCheckInStation.findFirst({
        where: { id: stationId, workspaceId },
      });
      if (!row) notFound("Stația nu există.");
      assertVersion(row.version, expectedVersion);
      return resource(
        await tx.guestCheckInStation.update({
          where: { id: stationId },
          data: {
            ...(input.name !== undefined ? { name: text(input.name) } : {}),
            ...(input.location !== undefined
              ? { location: nullableText(input.location) }
              : {}),
            ...(input.status !== undefined
              ? { status: enumValue(input.status) as never }
              : {}),
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  async registerDevice(
    userId: string,
    workspaceId: string,
    sessionId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "check-in.device.register",
        key,
        input,
      );
      if (replay) return replay;
      const session = await this.requireSession(tx, workspaceId, sessionId);
      if (["CLOSED", "ARCHIVED"].includes(session.status))
        conflict("Sesiunea nu acceptă dispozitive noi.");
      if (input.stationId) {
        const station = await tx.guestCheckInStation.findFirst({
          where: { id: text(input.stationId), workspaceId, sessionId },
        });
        if (!station) validation("Stația nu aparține sesiunii.");
      }
      const secret = createOpaqueToken();
      const row = await tx.guestCheckInDevice.create({
        data: {
          workspaceId,
          sessionId,
          stationId: nullableText(input.stationId),
          name: text(input.name),
          devicePublicId: `wd_${createOpaqueToken().slice(0, 24)}`,
          secretHash: hashToken(secret),
          credentialExpiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          registeredById: userId,
        },
      });
      const response = { ...resource(row), deviceSecret: secret };
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "check-in.device.register",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async revokeDevice(
    userId: string,
    workspaceId: string,
    deviceId: string,
    expectedVersion: number,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guestCheckInDevice.findFirst({
        where: { id: deviceId, workspaceId },
      });
      if (!row) notFound("Dispozitivul nu există.");
      assertVersion(row.version, expectedVersion);
      await tx.checkInManifestSnapshot.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return resource(
        await tx.guestCheckInDevice.update({
          where: { id: deviceId },
          data: { status: "REVOKED", version: { increment: 1 } },
        }),
      );
    });
  }

  async createCredential(
    userId: string,
    workspaceId: string,
    sessionId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "check-in.credential.create",
        key,
        input,
      );
      if (replay) return replay;
      const session = await this.requireSession(tx, workspaceId, sessionId);
      if (!input.householdId && !input.guestId)
        validation("Credentialul trebuie legat de household sau guest.");
      if (input.householdId) {
        const household = await tx.household.findFirst({
          where: { id: text(input.householdId), workspaceId, deletedAt: null },
        });
        if (!household) validation("Household invalid.");
      }
      if (input.guestId) {
        const guest = await tx.guest.findFirst({
          where: { id: text(input.guestId), workspaceId, deletedAt: null },
        });
        if (!guest) validation("Invitat invalid.");
      }
      const id = randomUUID();
      const token = this.checkInToken(id);
      const row = await tx.guestCheckInCredential.create({
        data: {
          id,
          workspaceId,
          weddingEventId: session.weddingEventId,
          householdId: nullableText(input.householdId),
          guestId: nullableText(input.guestId),
          tokenHash: hashToken(token),
          credentialType: enumValue(input.credentialType) as never,
          expiresAt: date(input.expiresAt),
        },
      });
      const response = { ...credentialResource(row), token };
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "check-in.credential.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async rotateCredential(
    userId: string,
    workspaceId: string,
    credentialId: string,
    key: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "check-in.credential.rotate",
        key,
        { credentialId },
      );
      if (replay) return replay;
      const old = await tx.guestCheckInCredential.findFirst({
        where: { id: credentialId, workspaceId },
      });
      if (!old) notFound("Credentialul nu există.");
      await tx.guestCheckInCredential.update({
        where: { id: credentialId },
        data: { status: "ROTATED", rotatedAt: new Date() },
      });
      const id = randomUUID();
      const token = this.checkInToken(id);
      const row = await tx.guestCheckInCredential.create({
        data: {
          id,
          workspaceId,
          weddingEventId: old.weddingEventId,
          householdId: old.householdId,
          guestId: old.guestId,
          tokenHash: hashToken(token),
          credentialType: old.credentialType,
          expiresAt: old.expiresAt,
        },
      });
      const response = { ...credentialResource(row), token };
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "check-in.credential.rotate",
        key,
        { credentialId },
        response,
      );
      return response;
    });
  }

  async revokeCredential(
    userId: string,
    workspaceId: string,
    credentialId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.guestCheckInCredential.findFirst({
        where: { id: credentialId, workspaceId },
      });
      if (!row) notFound("Credentialul nu există.");
      return credentialResource(
        await tx.guestCheckInCredential.update({
          where: { id: credentialId },
          data: { status: "REVOKED", revokedAt: new Date() },
        }),
      );
    });
  }

  async validateCredential(
    userId: string,
    workspaceId: string,
    sessionId: string,
    token: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) =>
      this.validateCredentialInTx(tx, workspaceId, sessionId, token),
    );
  }

  async checkIn(
    userId: string,
    workspaceId: string,
    sessionId: string,
    key: string,
    input: Input,
    checkout: boolean,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const operation = checkout ? "check-in.checkout" : "check-in.checkin";
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          operation,
          key,
          input,
        );
        if (replay) return replay;
        const session = await this.requireSession(tx, workspaceId, sessionId);
        if (session.status !== "OPEN")
          conflict("Sesiunea de check-in nu este deschisă.");
        const guestIds = stringArray(input.guestIds);
        let credential: Awaited<
          ReturnType<typeof tx.guestCheckInCredential.findFirst>
        > = null;
        if (input.credentialToken)
          credential = await tx.guestCheckInCredential.findFirst({
            where: {
              tokenHash: hashToken(text(input.credentialToken)),
              workspaceId,
              weddingEventId: session.weddingEventId,
              status: { in: ["ACTIVE", "USED"] },
              expiresAt: { gt: new Date() },
            },
          });
        const override = booleanValue(input.override);
        if (!credential && !override)
          validation("Credential invalid sau expirat.");
        if (override && !nullableText(input.overrideReason))
          validation("Override necesită motiv.");
        const guests = await tx.guest.findMany({
          where: {
            id: { in: guestIds },
            workspaceId,
            deletedAt: null,
            status: "ACTIVE",
          },
        });
        if (guests.length !== guestIds.length)
          validation("Un invitat nu există.");
        if (
          credential &&
          guests.some((guest) =>
            credential!.guestId
              ? guest.id !== credential!.guestId
              : guest.householdId !== credential!.householdId,
          )
        )
          forbidden("Credentialul nu acoperă invitatul selectat.");
        const responses = await tx.guestEventResponse.findMany({
          where: {
            workspaceId,
            weddingEventId: session.weddingEventId,
            guestId: { in: guestIds },
          },
        });
        const attendance = new Map(
          responses.map((row) => [row.guestId, row.attendance]),
        );
        const results: Array<Record<string, unknown>> = [];
        for (const [guestIndex, guest] of guests.entries()) {
          const eventCommandId =
            guestIndex === 0 ? text(input.commandId) : randomUUID();
          const current = await tx.guestCheckIn.findUnique({
            where: {
              weddingEventId_guestId: {
                weddingEventId: session.weddingEventId,
                guestId: guest.id,
              },
            },
          });
          const declined = attendance.get(guest.id) === "DECLINED";
          if (declined && !override) {
            const denied = current
              ? await tx.guestCheckIn.update({
                  where: { id: current.id },
                  data: {
                    status: "DENIED",
                    source: "QR_ONLINE",
                    stationId: nullableText(input.stationId),
                    checkedInById: userId,
                    lastCommandId: eventCommandId,
                    version: { increment: 1 },
                  },
                })
              : await tx.guestCheckIn.create({
                  data: {
                    workspaceId,
                    sessionId,
                    weddingEventId: session.weddingEventId,
                    guestId: guest.id,
                    householdId: guest.householdId,
                    stationId: nullableText(input.stationId),
                    status: "DENIED",
                    source: "QR_ONLINE",
                    checkedInById: userId,
                    lastCommandId: eventCommandId,
                  },
                });
            await tx.guestCheckInEvent.create({
              data: {
                workspaceId,
                checkInId: denied.id,
                sessionId,
                commandId: eventCommandId,
                action: "CHECK_IN",
                source: "QR_ONLINE",
                actorUserId: userId,
                outcome: "DENIED",
                reasonCode: "RSVP_DECLINED",
                occurredAt: new Date(),
              },
            });
            results.push({
              guestId: guest.id,
              checkInId: denied.id,
              outcome: "DENIED",
              reasonCode: "RSVP_DECLINED",
            });
            continue;
          }
          const target = checkout ? "CHECKED_OUT" : "CHECKED_IN";
          const duplicate = current?.status === target;
          const checkIn = current
            ? await tx.guestCheckIn.update({
                where: { id: current.id },
                data: {
                  status: target,
                  source: override
                    ? "MANUAL"
                    : guestIds.length > 1
                      ? "HOUSEHOLD_BATCH"
                      : "QR_ONLINE",
                  stationId: nullableText(input.stationId),
                  checkedInById: userId,
                  overrideReason: nullableText(input.overrideReason),
                  checkedInAt: checkout ? current.checkedInAt : new Date(),
                  checkedOutAt: checkout ? new Date() : null,
                  lastCommandId: eventCommandId,
                  version: duplicate ? undefined : { increment: 1 },
                },
              })
            : await tx.guestCheckIn.create({
                data: {
                  workspaceId,
                  sessionId,
                  weddingEventId: session.weddingEventId,
                  guestId: guest.id,
                  householdId: guest.householdId,
                  stationId: nullableText(input.stationId),
                  status: target,
                  source: override
                    ? "MANUAL"
                    : guestIds.length > 1
                      ? "HOUSEHOLD_BATCH"
                      : "QR_ONLINE",
                  checkedInById: userId,
                  overrideReason: nullableText(input.overrideReason),
                  checkedInAt: checkout ? null : new Date(),
                  checkedOutAt: checkout ? new Date() : null,
                  lastCommandId: eventCommandId,
                },
              });
          await tx.guestCheckInEvent.upsert({
            where: { commandId: eventCommandId },
            create: {
              workspaceId,
              checkInId: checkIn.id,
              sessionId,
              commandId: eventCommandId,
              action: checkout ? "CHECK_OUT" : "CHECK_IN",
              source: checkIn.source,
              actorUserId: userId,
              outcome: duplicate ? "DUPLICATE" : "ACCEPTED",
              occurredAt: new Date(),
            },
            update: {},
          });
          results.push({
            guestId: guest.id,
            checkInId: checkIn.id,
            status: checkIn.status,
            outcome: duplicate ? "DUPLICATE" : "ACCEPTED",
            version: checkIn.version,
          });
        }
        if (credential && !checkout)
          await tx.guestCheckInCredential.update({
            where: { id: credential.id },
            data: { status: "USED" },
          });
        await this.emit(tx, {
          eventName: checkout
            ? "check_in.guest_checked_out.v1"
            : "check_in.guest_checked_in.v1",
          aggregateType: "GuestCheckInSession",
          aggregateId: sessionId,
          aggregateVersion: session.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `${results.filter((row) => row.outcome === "ACCEPTED").length} invitați au fost ${checkout ? "marcați plecați" : "înregistrați"}.`,
          weddingEventId: session.weddingEventId,
          guestVisible: false,
          organizerPayload: {
            sessionId,
            changed: results.filter((row) => row.outcome === "ACCEPTED").length,
          },
          extraPayload: {
            checkInProjection: { sessionId },
            attendanceProjection: { sessionId },
          },
        });
        const deniedCount = results.filter(
          (row) => row.outcome === "DENIED",
        ).length;
        if (deniedCount > 0)
          await this.emit(tx, {
            eventName: "check_in.denied.v1",
            aggregateType: "GuestCheckInSession",
            aggregateId: sessionId,
            aggregateVersion: session.version,
            workspaceId,
            actorUserId: userId,
            correlationId,
            summary: `${deniedCount} scanări au fost refuzate de regulile de acces.`,
            weddingEventId: session.weddingEventId,
            guestVisible: false,
            organizerPayload: { sessionId, denied: deniedCount },
            extraPayload: {
              checkInProjection: { sessionId },
              attendanceProjection: { sessionId },
            },
          });
        const response = {
          results,
          attendance: await this.attendanceInTx(tx, workspaceId, session),
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          operation,
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async attendance(userId: string, workspaceId: string, sessionId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) =>
      this.attendanceInTx(
        tx,
        workspaceId,
        await this.requireSession(tx, workspaceId, sessionId),
      ),
    );
  }

  async manifest(
    userId: string,
    workspaceId: string,
    sessionId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "check-in.manifest.create",
        key,
        input,
      );
      if (replay) return replay;
      const session = await this.requireSession(tx, workspaceId, sessionId);
      if (!session.allowOffline)
        conflict("Modul offline nu este activ pentru sesiune.");
      const device = await this.authenticateDevice(
        tx,
        workspaceId,
        sessionId,
        text(input.devicePublicId),
        text(input.deviceSecret),
      );
      const latest = await tx.checkInManifestSnapshot.aggregate({
        where: { deviceId: device.id },
        _max: { versionNumber: true },
      });
      const responses = await tx.guestEventResponse.findMany({
        where: {
          workspaceId,
          weddingEventId: session.weddingEventId,
          attendance: { in: ["CONFIRMED", "UNSURE"] },
        },
        select: { guestId: true, attendance: true },
      });
      const guests = await tx.guest.findMany({
        where: {
          id: { in: responses.map((row) => row.guestId) },
          workspaceId,
          deletedAt: null,
        },
        select: {
          id: true,
          householdId: true,
          firstName: true,
          lastName: true,
          isChild: true,
          isPlusOne: true,
        },
      });
      const states = await tx.guestCheckIn.findMany({
        where: { workspaceId, weddingEventId: session.weddingEventId },
      });
      const credentials = await tx.guestCheckInCredential.findMany({
        where: {
          workspaceId,
          weddingEventId: session.weddingEventId,
          status: { in: ["ACTIVE", "USED"] },
          expiresAt: { gt: new Date() },
        },
        select: { tokenHash: true, householdId: true, guestId: true },
      });
      const versionNumber = (latest._max.versionNumber ?? 0) + 1;
      const expiresAt = new Date(
        Math.min(session.closesAt.getTime(), Date.now() + 4 * 60 * 60 * 1000),
      );
      const manifest = {
        sessionId,
        weddingEventId: session.weddingEventId,
        version: versionNumber,
        expiresAt: expiresAt.toISOString(),
        guests: guests.map((guest) => ({
          id: guest.id,
          householdId: guest.householdId,
          displayName: `${guest.firstName} ${guest.lastName}`.trim(),
          eligible: true,
          attendanceStatus: responses.find((row) => row.guestId === guest.id)
            ?.attendance,
          checkInStatus:
            states.find((row) => row.guestId === guest.id)?.status ??
            "NOT_CHECKED_IN",
          warningCodes: [],
          credentialProofs: credentials
            .filter(
              (credential) =>
                credential.guestId === guest.id ||
                credential.householdId === guest.householdId,
            )
            .map((credential) => credential.tokenHash),
        })),
      };
      const manifestHash = stableHash(manifest);
      const signature = createHmac(
        "sha256",
        this.environment.OUTBOX_ENCRYPTION_KEY,
      )
        .update(`${device.id}:${manifestHash}`)
        .digest("hex");
      const row = await tx.checkInManifestSnapshot.create({
        data: {
          workspaceId,
          sessionId,
          deviceId: device.id,
          versionNumber,
          manifest: json(manifest),
          manifestHash,
          signature,
          expiresAt,
        },
      });
      const response = { id: row.id, ...manifest, signature };
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "check-in.manifest.create",
        key,
        input,
        response,
      );
      return response;
    });
  }

  async syncOffline(
    userId: string,
    workspaceId: string,
    sessionId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "check-in.offline.sync",
          key,
          input,
        );
        if (replay) return replay;
        const session = await this.requireSession(tx, workspaceId, sessionId);
        const device = await this.authenticateDevice(
          tx,
          workspaceId,
          sessionId,
          text(input.devicePublicId),
          text(input.deviceSecret),
        );
        const snapshot = await tx.checkInManifestSnapshot.findFirst({
          where: {
            id: text(input.snapshotId),
            workspaceId,
            sessionId,
            deviceId: device.id,
          },
        });
        if (
          !snapshot ||
          snapshot.revokedAt ||
          snapshot.expiresAt <= new Date() ||
          snapshot.versionNumber !== numberValue(input.snapshotVersion)
        )
          conflict("Manifest offline expirat, revocat sau stale.");
        const commands = array(input.commands);
        const results: Array<Record<string, unknown>> = [];
        let lastSequence = device.lastSequence;
        for (const raw of commands) {
          const command = object(raw);
          const commandId = text(command.commandId);
          const existing = await tx.checkInOfflineCommand.findUnique({
            where: { commandId },
          });
          if (existing) {
            results.push({
              commandId,
              outcome: "DUPLICATE",
              result: existing.result,
            });
            continue;
          }
          const sequence = numberValue(command.localSequence);
          if (sequence <= lastSequence) {
            results.push({
              commandId,
              outcome: "CONFLICT",
              code: "SEQUENCE_STALE",
            });
            continue;
          }
          const manifestGuest = array(object(snapshot.manifest).guests)
            .map(object)
            .find((guest) => guest.id === command.guestId);
          if (
            !manifestGuest ||
            !array(manifestGuest.credentialProofs).includes(
              command.credentialProof,
            )
          ) {
            results.push({
              commandId,
              outcome: "REJECTED",
              code: "CREDENTIAL_SCOPE_INVALID",
            });
            continue;
          }
          const guest = await tx.guest.findFirst({
            where: { id: text(command.guestId), workspaceId, deletedAt: null },
          });
          if (!guest) {
            results.push({
              commandId,
              outcome: "REJECTED",
              code: "GUEST_MISSING",
            });
            continue;
          }
          const current = await tx.guestCheckIn.findUnique({
            where: {
              weddingEventId_guestId: {
                weddingEventId: session.weddingEventId,
                guestId: guest.id,
              },
            },
          });
          const status =
            command.action === "CHECK_OUT" ? "CHECKED_OUT" : "CHECKED_IN";
          const duplicate = current?.status === status;
          const checkIn = current
            ? await tx.guestCheckIn.update({
                where: { id: current.id },
                data: {
                  status,
                  source: "QR_OFFLINE",
                  deviceId: device.id,
                  checkedInById: userId,
                  checkedInAt:
                    status === "CHECKED_IN" ? new Date() : current.checkedInAt,
                  checkedOutAt: status === "CHECKED_OUT" ? new Date() : null,
                  lastCommandId: commandId,
                  version: duplicate ? undefined : { increment: 1 },
                },
              })
            : await tx.guestCheckIn.create({
                data: {
                  workspaceId,
                  sessionId,
                  weddingEventId: session.weddingEventId,
                  guestId: guest.id,
                  householdId: guest.householdId,
                  deviceId: device.id,
                  status,
                  source: "QR_OFFLINE",
                  checkedInById: userId,
                  checkedInAt: status === "CHECKED_IN" ? new Date() : null,
                  checkedOutAt: status === "CHECKED_OUT" ? new Date() : null,
                  lastCommandId: commandId,
                },
              });
          const result = {
            checkInId: checkIn.id,
            status,
            outcome: duplicate ? "DUPLICATE" : "ACCEPTED",
          };
          await tx.checkInOfflineCommand.create({
            data: {
              workspaceId,
              commandId,
              deviceId: device.id,
              sessionId,
              guestId: guest.id,
              credentialProof: text(command.credentialProof),
              action: text(command.action),
              occurredAtDevice: date(command.occurredAtDevice),
              localSequence: sequence,
              snapshotVersion: snapshot.versionNumber,
              status: text(result.outcome),
              result: json(result),
            },
          });
          results.push({ commandId, ...result });
          lastSequence = sequence;
        }
        await tx.guestCheckInDevice.update({
          where: { id: device.id },
          data: {
            lastSequence,
            lastSeenAt: new Date(),
            version: { increment: 1 },
          },
        });
        const accepted = results.filter(
          (row) => row.outcome === "ACCEPTED",
        ).length;
        const conflicts = results.filter(
          (row) => row.outcome === "CONFLICT",
        ).length;
        const rejected = results.filter(
          (row) => row.outcome === "REJECTED",
        ).length;
        const batch = await tx.checkInSyncBatch.create({
          data: {
            workspaceId,
            sessionId,
            deviceId: device.id,
            idempotencyKey: key,
            commandCount: commands.length,
            acceptedCount: accepted,
            conflictCount: conflicts,
            rejectedCount: rejected,
            status: "COMPLETED",
            result: json({ results }),
            completedAt: new Date(),
          },
        });
        await this.emit(tx, {
          eventName: "check_in.offline_sync_completed.v1",
          aggregateType: "CheckInSyncBatch",
          aggregateId: batch.id,
          aggregateVersion: 1,
          workspaceId,
          actorUserId: userId,
          correlationId,
          summary: `Sincronizare offline: ${accepted} acceptate, ${conflicts} conflicte, ${rejected} respinse.`,
          weddingEventId: session.weddingEventId,
          guestVisible: false,
          organizerPayload: {
            batchId: batch.id,
            accepted,
            conflicts,
            rejected,
          },
          extraPayload: {
            checkInOfflineSync: { batchId: batch.id },
            attendanceProjection: { sessionId },
          },
        });
        const response = {
          batchId: batch.id,
          results,
          attendance: await this.attendanceInTx(tx, workspaceId, session),
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "check-in.offline.sync",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  // Guest Moments / gallery ------------------------------------------------
  async createGuestMoment(
    token: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.withGuest(
      token,
      async (tx, guest) => {
        const existing = await tx.guestMomentUploadSession.findUnique({
          where: {
            guestAccessGrantId_idempotencyKey: {
              guestAccessGrantId: guest.grantId,
              idempotencyKey: key,
            },
          },
        });
        if (existing)
          return this.guestMomentResponse(
            tx,
            guest.grantId,
            existing.guestMomentId,
          );
        const event = await tx.weddingEvent.findFirst({
          where: {
            id: text(input.weddingEventId),
            workspaceId: guest.workspaceId,
            guestVisible: true,
            deletedAt: null,
          },
        });
        if (!event) notFound("Evenimentul nu este disponibil.");
        if (input.guestId) {
          const member = await tx.guest.findFirst({
            where: {
              id: text(input.guestId),
              workspaceId: guest.workspaceId,
              householdId: guest.householdId,
              deletedAt: null,
            },
          });
          if (!member) forbidden("Invitatul nu aparține household-ului.");
        }
        const mediaType = text(input.mediaType);
        const allowed =
          mediaType === "IMAGE"
            ? ["image/jpeg", "image/png", "image/webp"]
            : ["video/mp4", "video/webm", "video/quicktime"];
        const maximum =
          mediaType === "IMAGE" ? 20 * 1024 * 1024 : 100 * 1024 * 1024;
        const checksum = text(input.checksumSha256);
        const contentType = text(input.contentType);
        const sizeBytes = numberValue(input.sizeBytes);
        if (
          !allowed.includes(contentType) ||
          sizeBytes <= 0 ||
          sizeBytes > maximum
        )
          validation("Tipul sau dimensiunea fișierului nu este permisă.");
        if (!/^[a-f0-9]{64}$/.test(checksum))
          validation("Checksum SHA-256 invalid.");
        const moment = await tx.guestMoment.create({
          data: {
            workspaceId: guest.workspaceId,
            weddingEventId: event.id,
            householdId: guest.householdId,
            guestId: nullableText(input.guestId),
            guestAccessGrantId: guest.grantId,
            caption: nullableText(input.caption),
            status: "UPLOADING",
          },
        });
        const objectKey = `private/guest-moments/${guest.workspaceId}/${moment.id}/${randomUUID()}`;
        // The guest SELECT policy for a stored object becomes valid only after
        // its upload session exists. Prisma create() uses INSERT ... RETURNING,
        // which would require that SELECT policy before the FK-dependent
        // session can be inserted. Insert the preassigned object without
        // RETURNING and keep the stricter read policy intact.
        const stored = {
          id: randomUUID(),
          bucket: this.environment.OBJECT_STORAGE_BUCKET,
          objectKey,
        };
        await tx.$executeRaw`
          INSERT INTO "stored_objects" (
            "id", "workspace_id", "storage_provider", "bucket", "object_key",
            "original_file_name", "content_type_claimed", "size_bytes",
            "checksum_sha256", "status", "scan_status", "updated_at"
          ) VALUES (
            ${stored.id}::uuid,
            ${guest.workspaceId}::uuid,
            ${this.environment.OBJECT_STORAGE_PROVIDER},
            ${stored.bucket},
            ${stored.objectKey},
            ${text(input.originalFileName)},
            ${contentType},
            ${BigInt(sizeBytes)},
            ${checksum},
            'UPLOADING'::"StoredObjectStatus",
            'PENDING'::"StoredObjectScanStatus",
            NOW()
          )
        `;
        const media = await tx.guestMomentMedia.create({
          data: {
            workspaceId: guest.workspaceId,
            guestMomentId: moment.id,
            storedObjectId: stored.id,
            mediaType: mediaType as never,
          },
        });
        await tx.guestMomentUploadSession.create({
          data: {
            workspaceId: guest.workspaceId,
            guestAccessGrantId: guest.grantId,
            guestMomentId: moment.id,
            guestMomentMediaId: media.id,
            expectedContentTypes: allowed,
            maximumSizeBytes: BigInt(maximum),
            expectedChecksum: checksum,
            storedObjectId: stored.id,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            idempotencyKey: key,
          },
        });
        const uploadUrl = await getSignedUrl(
          this.publicStorage,
          new PutObjectCommand({
            Bucket: this.environment.OBJECT_STORAGE_BUCKET,
            Key: objectKey,
            ContentType: contentType,
          }),
          { expiresIn: 900 },
        );
        return {
          moment: resource(moment),
          media: resource(media),
          upload: {
            url: uploadUrl,
            method: "PUT",
            headers: {
              "content-type": contentType,
            },
            expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
        };
      },
      correlationId,
    );
  }

  async completeGuestMoment(
    token: string,
    momentId: string,
    checksum: string,
    correlationId: string,
  ) {
    return this.withGuest(
      token,
      async (tx, guest) => {
        const moment = await tx.guestMoment.findFirst({
          where: { id: momentId, guestAccessGrantId: guest.grantId },
        });
        if (!moment) notFound("Momentul nu există.");
        const session = await tx.guestMomentUploadSession.findFirst({
          where: { guestMomentId: momentId, guestAccessGrantId: guest.grantId },
          orderBy: { createdAt: "desc" },
        });
        if (!session || session.expiresAt <= new Date())
          conflict("Sesiunea de upload a expirat.");
        if (session.expectedChecksum !== checksum)
          validation("Checksum diferit de upload intent.");
        const stored = await tx.storedObject.findUnique({
          where: { id: session.storedObjectId },
        });
        if (!stored) notFound("Obiectul media nu există.");
        const head = await this.storage.send(
          new HeadObjectCommand({
            Bucket: stored.bucket,
            Key: stored.objectKey,
          }),
        );
        const uploadedSize = Number(head.ContentLength ?? 0);
        if (uploadedSize > Number(session.maximumSizeBytes))
          validation("Fișierul depășește limita permisă.");
        if (uploadedSize !== Number(stored.sizeBytes))
          validation("Dimensiunea încărcată diferă de upload intent.");
        await tx.storedObject.update({
          where: { id: stored.id },
          data: {
            status: "UPLOADED",
            sizeBytes: BigInt(uploadedSize),
            etag: head.ETag ?? null,
          },
        });
        await tx.guestMomentUploadSession.update({
          where: { id: session.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            version: { increment: 1 },
          },
        });
        const updated = await tx.guestMoment.update({
          where: { id: momentId },
          data: { status: "PROCESSING", version: { increment: 1 } },
        });
        const media = await tx.guestMomentMedia.findUnique({
          where: { guestMomentId: momentId },
        });
        if (!media) notFound("Media nu există.");
        await this.asyncEvents.record(tx, {
          eventName: "guest_moment.uploaded.v1",
          aggregateType: "GuestMoment",
          aggregateId: momentId,
          aggregateVersion: updated.version,
          workspaceId: guest.workspaceId,
          correlationId,
          deduplicationKey: `guest-moment-uploaded:${momentId}:${updated.version}`,
          payload: {
            subject: { momentId },
            guestMomentScan: {
              momentId,
              mediaId: media.id,
              storedObjectId: stored.id,
            },
            activity: {
              category: "guest_moments",
              action: "guest_moment_uploaded",
              summary:
                "Un Guest Moment a fost încărcat și a intrat în verificare.",
              entityType: "GuestMoment",
              entityId: momentId,
            },
          },
        });
        return this.guestMomentResponse(tx, guest.grantId, momentId);
      },
      correlationId,
    );
  }

  async guestMoments(token: string) {
    return this.withGuest(token, async (tx, guest) => ({
      items: await Promise.all(
        (
          await tx.guestMoment.findMany({
            where: { guestAccessGrantId: guest.grantId },
            orderBy: { submittedAt: "desc" },
          })
        ).map((moment) =>
          this.guestMomentResponse(tx, guest.grantId, moment.id),
        ),
      ),
    }));
  }

  async guestMomentPreview(token: string, momentId: string) {
    return this.withGuest(token, async (tx, guest) => {
      const moment = await tx.guestMoment.findFirst({
        where: {
          id: momentId,
          workspaceId: guest.workspaceId,
          OR: [{ guestAccessGrantId: guest.grantId }, { status: "PUBLISHED" }],
        },
      });
      if (!moment) notFound("Momentul nu este disponibil.");
      const media = await tx.guestMomentMedia.findUnique({
        where: { guestMomentId: momentId },
      });
      if (
        !media?.derivativeObjectId ||
        !["AUTOMATED_SAFE", "APPROVED"].includes(media.moderationStatus)
      )
        notFound("Preview-ul nu este disponibil încă.");
      const stored = await tx.storedObject.findFirst({
        where: {
          id: media.derivativeObjectId,
          workspaceId: guest.workspaceId,
          status: "AVAILABLE",
        },
      });
      if (!stored) notFound("Preview-ul nu este disponibil.");
      return getSignedUrl(
        this.publicStorage,
        new GetObjectCommand({
          Bucket: stored.bucket,
          Key: stored.objectKey,
          ResponseContentType: stored.contentTypeDetected ?? "image/webp",
        }),
        { expiresIn: 60 },
      );
    });
  }

  async organizerMoments(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await Promise.all(
        (
          await tx.guestMoment.findMany({
            where: { workspaceId, status: { not: "DELETED" } },
            orderBy: { submittedAt: "desc" },
          })
        ).map((moment) => this.organizerMomentResponse(tx, moment.id)),
      ),
    }));
  }

  async organizerMomentPreview(
    userId: string,
    workspaceId: string,
    momentId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const moment = await tx.guestMoment.findFirst({
        where: { id: momentId, workspaceId, status: { not: "DELETED" } },
      });
      if (!moment) notFound("Guest Moment nu există.");
      const media = await tx.guestMomentMedia.findUnique({
        where: { guestMomentId: momentId },
      });
      if (!media?.derivativeObjectId)
        notFound("Preview-ul nu este disponibil încă.");
      const stored = await tx.storedObject.findFirst({
        where: {
          id: media.derivativeObjectId,
          workspaceId,
          status: "AVAILABLE",
        },
      });
      if (!stored) notFound("Preview-ul nu este disponibil.");
      return {
        url: await getSignedUrl(
          this.publicStorage,
          new GetObjectCommand({
            Bucket: stored.bucket,
            Key: stored.objectKey,
            ResponseContentType: stored.contentTypeDetected ?? "image/webp",
          }),
          { expiresIn: 60 },
        ),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
    });
  }

  async moderateMoment(
    userId: string,
    workspaceId: string,
    momentId: string,
    expectedVersion: number,
    key: string,
    transition: string,
    reason: string | null,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "guest-moment.moderate",
          key,
          { momentId, expectedVersion, transition, reason },
        );
        if (replay) return replay;
        const moment = await tx.guestMoment.findFirst({
          where: { id: momentId, workspaceId },
        });
        if (!moment) notFound("Guest Moment nu există.");
        assertVersion(moment.version, expectedVersion);
        const media = await tx.guestMomentMedia.findUnique({
          where: { guestMomentId: momentId },
        });
        if (!media) notFound("Media nu există.");
        if (
          transition === "APPROVE" &&
          !["AUTOMATED_SAFE", "APPROVED"].includes(media.moderationStatus)
        )
          conflict("Numai media scanată și sigură poate fi aprobată.");
        const status =
          transition === "APPROVE"
            ? "APPROVED"
            : transition === "REJECT"
              ? "REJECTED"
              : transition === "HIDE"
                ? "HIDDEN"
                : transition === "RESTORE"
                  ? "APPROVED"
                  : "DELETED";
        const moderation =
          transition === "APPROVE"
            ? "APPROVED"
            : transition === "REJECT"
              ? "REJECTED"
              : transition === "HIDE"
                ? "HIDDEN"
                : media.moderationStatus;
        const updated = await tx.guestMoment.update({
          where: { id: momentId },
          data: {
            status,
            hiddenAt: status === "HIDDEN" ? new Date() : null,
            version: { increment: 1 },
          },
        });
        await tx.guestMomentMedia.update({
          where: { id: media.id },
          data: {
            moderationStatus: moderation as never,
            version: { increment: 1 },
          },
        });
        await tx.guestMomentModerationCase.upsert({
          where: {
            id:
              (
                await tx.guestMomentModerationCase.findFirst({
                  where: { guestMomentId: momentId, status: "OPEN" },
                })
              )?.id ?? randomUUID(),
          },
          create: {
            workspaceId,
            guestMomentId: momentId,
            status: "DECIDED",
            reasonCode: reason,
            moderatorUserId: userId,
            decision: transition,
            decidedAt: new Date(),
          },
          update: {
            status: "DECIDED",
            reasonCode: reason,
            moderatorUserId: userId,
            decision: transition,
            decidedAt: new Date(),
            version: { increment: 1 },
          },
        });
        const eventName =
          transition === "APPROVE"
            ? "guest_moment.approved.v1"
            : "guest_moment.rejected.v1";
        await this.asyncEvents.record(tx, {
          eventName,
          aggregateType: "GuestMoment",
          aggregateId: momentId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `${eventName}:${momentId}:${updated.version}`,
          payload: {
            subject: { momentId },
            guestMomentModerationProjection: { momentId },
            activity: {
              category: "guest_moments",
              action: transition.toLowerCase(),
              summary: `Guest Moment ${transition === "APPROVE" ? "aprobat" : "respins"}.`,
              entityType: "GuestMoment",
              entityId: momentId,
            },
          },
        });
        const response = await this.organizerMomentResponse(tx, momentId);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "guest-moment.moderate",
          key,
          { momentId, expectedVersion, transition, reason },
          response,
        );
        return response;
      },
    );
  }

  async createGallery(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const replay = await this.replay(
        tx,
        userId,
        workspaceId,
        "gallery.create",
        key,
        input,
      );
      if (replay) return replay;
      const event = await tx.weddingEvent.findFirst({
        where: { id: text(input.weddingEventId), workspaceId, deletedAt: null },
      });
      if (!event) notFound("Evenimentul nu există.");
      const row = await tx.galleryCollection.create({
        data: {
          workspaceId,
          weddingEventId: event.id,
          name: text(input.name),
          description: nullableText(input.description),
          visibility: enumValue(
            input.visibility,
            "GUESTS_WITH_ACCESS",
          ) as never,
          householdIds: stringArray(input.householdIds),
          createdById: userId,
        },
      });
      const response = resource(row);
      await this.saveReplay(
        tx,
        userId,
        workspaceId,
        "gallery.create",
        key,
        input,
        response,
      );
      return response;
    });
  }
  async galleries(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await Promise.all(
        (
          await tx.galleryCollection.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
          })
        ).map((row) => this.galleryResource(tx, row)),
      ),
    }));
  }
  async updateGallery(
    userId: string,
    workspaceId: string,
    id: string,
    expectedVersion: number,
    input: Input,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.galleryCollection.findFirst({
        where: { id, workspaceId },
      });
      if (!row) notFound("Galeria nu există.");
      assertVersion(row.version, expectedVersion);
      if (row.status === "ARCHIVED")
        conflict("Galeria arhivată nu poate fi editată.");
      return resource(
        await tx.galleryCollection.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: text(input.name) } : {}),
            ...(input.description !== undefined
              ? { description: nullableText(input.description) }
              : {}),
            ...(input.visibility !== undefined
              ? { visibility: enumValue(input.visibility) as never }
              : {}),
            ...(input.householdIds !== undefined
              ? { householdIds: stringArray(input.householdIds) }
              : {}),
            version: { increment: 1 },
          },
        }),
      );
    });
  }
  async replaceGalleryItems(
    userId: string,
    workspaceId: string,
    id: string,
    expectedVersion: number,
    momentIds: string[],
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const row = await tx.galleryCollection.findFirst({
        where: { id, workspaceId },
      });
      if (!row) notFound("Galeria nu există.");
      assertVersion(row.version, expectedVersion);
      const moments = await tx.guestMoment.findMany({
        where: {
          id: { in: momentIds },
          workspaceId,
          status: { in: ["APPROVED", "PUBLISHED"] },
        },
      });
      if (moments.length !== new Set(momentIds).size)
        validation("Galeria poate conține numai Guest Moments aprobate.");
      await tx.galleryCollectionItem.deleteMany({
        where: { collectionId: id },
      });
      if (momentIds.length)
        await tx.galleryCollectionItem.createMany({
          data: momentIds.map((guestMomentId, position) => ({
            workspaceId,
            collectionId: id,
            guestMomentId,
            position,
          })),
        });
      const updated = await tx.galleryCollection.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
      return this.galleryResource(tx, updated);
    });
  }
  async publishGallery(
    userId: string,
    workspaceId: string,
    id: string,
    expectedVersion: number,
    key: string,
    publish: boolean,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const operation = publish ? "gallery.publish" : "gallery.unpublish";
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          operation,
          key,
          { id, expectedVersion },
        );
        if (replay) return replay;
        const row = await tx.galleryCollection.findFirst({
          where: { id, workspaceId },
        });
        if (!row) notFound("Galeria nu există.");
        assertVersion(row.version, expectedVersion);
        const items = await tx.galleryCollectionItem.count({
          where: { collectionId: id },
        });
        if (publish && !items)
          validation(
            "Adaugă cel puțin un moment aprobat înainte de publicare.",
          );
        const updated = await tx.galleryCollection.update({
          where: { id },
          data: {
            status: publish ? "PUBLISHED" : "DRAFT",
            publishedAt: publish ? new Date() : null,
            version: { increment: 1 },
          },
        });
        if (publish)
          await tx.guestMoment.updateMany({
            where: {
              id: {
                in: (
                  await tx.galleryCollectionItem.findMany({
                    where: { collectionId: id },
                    select: { guestMomentId: true },
                  })
                ).map((item) => item.guestMomentId),
              },
            },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(),
              version: { increment: 1 },
            },
          });
        await this.asyncEvents.record(tx, {
          eventName: publish
            ? "gallery.published.v1"
            : "gallery.unpublished.v1",
          aggregateType: "GalleryCollection",
          aggregateId: id,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `${operation}:${id}:${updated.version}`,
          payload: {
            subject: { collectionId: id },
            galleryProjection: { collectionId: id },
            activity: {
              category: "gallery",
              action: operation,
              summary: `Galeria ${updated.name} a fost ${publish ? "publicată" : "retrasă"}.`,
              entityType: "GalleryCollection",
              entityId: id,
            },
          },
        });
        const response = await this.galleryResource(tx, updated);
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          operation,
          key,
          { id, expectedVersion },
          response,
        );
        return response;
      },
    );
  }
  async guestGallery(token: string) {
    return this.withGuest(token, async (tx) => ({
      items: await Promise.all(
        (
          await tx.galleryCollection.findMany({
            where: { status: "PUBLISHED" },
            orderBy: { publishedAt: "desc" },
          })
        ).map((row) => this.galleryResource(tx, row, true)),
      ),
    }));
  }
  async reportMoment(
    token: string,
    momentId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.withGuest(
      token,
      async (tx, guest) => {
        const moment = await tx.guestMoment.findFirst({
          where: {
            id: momentId,
            workspaceId: guest.workspaceId,
            status: { in: ["PUBLISHED", "APPROVED"] },
          },
        });
        if (!moment) notFound("Momentul nu este disponibil.");
        const report = await tx.guestMomentReport.upsert({
          where: {
            dedupeKey: `guest-moment-report:${guest.grantId}:${momentId}:${text(input.reason)}`,
          },
          create: {
            workspaceId: guest.workspaceId,
            guestMomentId: momentId,
            guestAccessGrantId: guest.grantId,
            reason: text(input.reason),
            details: nullableText(input.details),
            dedupeKey: `guest-moment-report:${guest.grantId}:${momentId}:${text(input.reason)}`,
          },
          update: {},
        });
        await tx.$executeRaw`
          INSERT INTO "guest_moment_moderation_cases" (
            "id", "workspace_id", "guest_moment_id", "status",
            "reason_code", "updated_at"
          ) VALUES (
            ${randomUUID()}::uuid,
            ${guest.workspaceId}::uuid,
            ${momentId}::uuid,
            'OPEN',
            ${text(input.reason)},
            NOW()
          )
        `;
        await this.asyncEvents.record(tx, {
          eventName: "guest_moment.reported.v1",
          aggregateType: "GuestMoment",
          aggregateId: momentId,
          aggregateVersion: moment.version,
          workspaceId: guest.workspaceId,
          correlationId,
          deduplicationKey: `guest-moment-reported:${report.id}`,
          payload: {
            subject: { momentId },
            guestMomentModerationProjection: { momentId },
          },
        });
        return { reported: true, id: report.id };
      },
      correlationId,
    );
  }

  async commandCenter(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const availableEvents = (
        await tx.weddingEvent.findMany({
          where: { workspaceId, deletedAt: null },
          orderBy: { startAt: "asc" },
          take: 50,
        })
      ).map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt?.toISOString() ?? null,
        endAt: event.endAt?.toISOString() ?? null,
        locationName: event.locationName,
      }));
      const plan = await tx.weddingDayPlan.findFirst({
        where: {
          workspaceId,
          status: { in: ["LIVE", "PAUSED", "PUBLISHED", "READY", "DRAFT"] },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      });
      if (!plan)
        return {
          plan: null,
          availableEvents,
          now: {
            serverTime: new Date().toISOString(),
            currentItems: [],
            nextItems: [],
            delayedItems: [],
            blockedItems: [],
          },
          attendance: emptyAttendance(),
          operations: {
            openChecklistItems: 0,
            blockedChecklistItems: 0,
            openIncidents: 0,
            criticalIncidents: 0,
            unresolvedDecisions: 0,
          },
          vendors: [],
          announcements: { active: 0, scheduled: 0, failedDeliveries: 0 },
          media: { pendingReview: 0, approved: 0, published: 0, rejected: 0 },
        };
      const now = new Date();
      const items = await tx.runOfShowItem.findMany({
        where: { workspaceId, planId: plan.id },
        orderBy: [{ position: "asc" }, { plannedStartAt: "asc" }],
      });
      const session = await tx.guestCheckInSession.findFirst({
        where: { workspaceId, weddingEventId: plan.weddingEventId },
        orderBy: { createdAt: "desc" },
      });
      const attendance = session
        ? await this.attendanceInTx(tx, workspaceId, session)
        : emptyAttendance();
      const [
        openChecklistItems,
        blockedChecklistItems,
        openIncidents,
        criticalIncidents,
        unresolvedDecisions,
        activeAnnouncements,
        scheduledAnnouncements,
        failedDeliveries,
        pendingReview,
        approved,
        published,
        rejected,
      ] = await Promise.all([
        tx.weddingDayChecklistItem.count({
          where: { workspaceId, status: { in: ["OPEN", "IN_PROGRESS"] } },
        }),
        tx.weddingDayChecklistItem.count({
          where: { workspaceId, status: "BLOCKED" },
        }),
        tx.weddingDayIncident.count({
          where: {
            workspaceId,
            planId: plan.id,
            status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
          },
        }),
        tx.weddingDayIncident.count({
          where: {
            workspaceId,
            planId: plan.id,
            severity: "CRITICAL",
            status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
          },
        }),
        tx.weddingDayDecision.count({
          where: { workspaceId, planId: plan.id, incidentId: null },
        }),
        tx.weddingDayAnnouncement.count({
          where: {
            workspaceId,
            planId: plan.id,
            status: "PUBLISHED",
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        tx.weddingDayAnnouncement.count({
          where: { workspaceId, planId: plan.id, status: "SCHEDULED" },
        }),
        tx.weddingDayAnnouncementDelivery.count({
          where: { workspaceId, status: "FAILED" },
        }),
        tx.guestMoment.count({
          where: {
            workspaceId,
            status: { in: ["PROCESSING", "PENDING_REVIEW"] },
          },
        }),
        tx.guestMoment.count({ where: { workspaceId, status: "APPROVED" } }),
        tx.guestMoment.count({ where: { workspaceId, status: "PUBLISHED" } }),
        tx.guestMoment.count({ where: { workspaceId, status: "REJECTED" } }),
      ]);
      const currentItems = items
        .filter((item) => item.status === "IN_PROGRESS")
        .map(safeRunItem);
      const nextItems = items
        .filter(
          (item) =>
            ["NOT_STARTED", "READY"].includes(item.status) &&
            item.plannedStartAt >= now,
        )
        .slice(0, 5)
        .map(safeRunItem);
      return {
        plan: {
          id: plan.id,
          version: plan.version,
          status: plan.status,
          eventId: plan.weddingEventId,
          title: plan.name,
          timezone:
            (
              await tx.weddingDayPlanVersion.findUnique({
                where: {
                  id:
                    plan.liveVersionId ??
                    plan.publishedVersionId ??
                    plan.currentDraftVersionId!,
                },
              })
            )?.timezone ?? "Europe/Bucharest",
        },
        now: {
          serverTime: now.toISOString(),
          currentItems,
          nextItems,
          delayedItems: items
            .filter((item) => item.status === "DELAYED")
            .map(safeRunItem),
          blockedItems: items
            .filter((item) => item.status === "BLOCKED")
            .map(safeRunItem),
        },
        attendance,
        availableEvents,
        checkInSession: session
          ? { id: session.id, status: session.status, version: session.version }
          : null,
        operations: {
          openChecklistItems,
          blockedChecklistItems,
          openIncidents,
          criticalIncidents,
          unresolvedDecisions,
        },
        vendors: [],
        announcements: {
          active: activeAnnouncements,
          scheduled: scheduledAnnouncements,
          failedDeliveries,
        },
        media: { pendingReview, approved, published, rejected },
      };
    });
  }

  async exportEventDay(
    userId: string,
    workspaceId: string,
    key: string,
    input: Input,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          workspaceId,
          "wedding-day.export",
          key,
          input,
        );
        if (replay) return replay;
        const planId = nullableText(input.planId);
        const sessionId = nullableText(input.sessionId);
        if (planId) await this.requirePlan(tx, workspaceId, planId);
        if (sessionId) await this.requireSession(tx, workspaceId, sessionId);
        const artifactId = randomUUID();
        const jobId = await this.asyncEvents.record(tx, {
          eventName: "wedding_day.export_requested.v1",
          aggregateType: "WeddingDayExport",
          aggregateId: artifactId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey: key,
          deduplicationKey: `wedding-day-export:${workspaceId}:${key}`,
          userVisibleJob: true,
          payload: {
            subject: { artifactId },
            weddingDayExport: {
              artifactId,
              requestedByUserId: userId,
              type: text(input.type),
              format: text(input.format),
              planId,
              sessionId,
            },
            activity: {
              category: "wedding_day",
              action: "wedding_day_export_requested",
              summary: "Exportul operațional a fost solicitat.",
              entityType: "WeddingDayExport",
              entityId: artifactId,
            },
          },
        });
        if (!jobId) throw new Error("Wedding Day export job was not created");
        const response = {
          artifactId,
          job: mapJob(
            await tx.backgroundJob.findUniqueOrThrow({ where: { id: jobId } }),
          ),
        };
        await this.saveReplay(
          tx,
          userId,
          workspaceId,
          "wedding-day.export",
          key,
          input,
          response,
        );
        return response;
      },
    );
  }

  async guestLive(token: string) {
    return this.withGuest(token, async (tx, guest) => {
      const events = await tx.weddingDayLiveEvent.findMany({
        where: { workspaceId: guest.workspaceId, guestVisible: true },
        orderBy: { sequence: "desc" },
        take: 50,
      });
      const announcements = await tx.weddingDayAnnouncement.findMany({
        where: {
          status: "PUBLISHED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { publishedAt: "desc" },
      });
      const checkIns = await tx.guestCheckIn.findMany({
        where: {
          workspaceId: guest.workspaceId,
          householdId: guest.householdId,
        },
      });
      return {
        serverTime: new Date().toISOString(),
        events: events.reverse().map((event) => liveResource(event, true)),
        announcements: announcements.map(resource),
        checkIns: checkIns.map(resource),
      };
    });
  }

  async guestCredential(token: string) {
    return this.withGuest(token, async (tx, guest) => {
      const event = await tx.weddingEvent.findFirst({
        where: {
          workspaceId: guest.workspaceId,
          guestVisible: true,
          deletedAt: null,
        },
        orderBy: { startAt: "asc" },
      });
      if (!event) return null;
      let credential = await tx.guestCheckInCredential.findFirst({
        where: {
          workspaceId: guest.workspaceId,
          weddingEventId: event.id,
          householdId: guest.householdId,
          status: { in: ["ACTIVE", "USED"] },
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
      if (!credential) {
        const id = randomUUID();
        const qrToken = this.checkInToken(id);
        credential = await tx.guestCheckInCredential.create({
          data: {
            id,
            workspaceId: guest.workspaceId,
            weddingEventId: event.id,
            householdId: guest.householdId,
            tokenHash: hashToken(qrToken),
            credentialType: "HOUSEHOLD",
            expiresAt: new Date(
              Math.max(
                Date.now() + 24 * 60 * 60 * 1000,
                (event.endAt ?? event.startAt ?? new Date()).getTime() +
                  12 * 60 * 60 * 1000,
              ),
            ),
          },
        });
      }
      return {
        ...credentialResource(credential),
        token: this.checkInToken(credential.id),
      };
    });
  }

  organizerStream(
    userId: string,
    workspaceId: string,
    lastId?: string,
  ): Observable<MessageEvent> {
    return this.liveStream({ userId, workspaceId }, workspaceId, false, lastId);
  }
  async guestStream(
    token: string,
    lastId?: string,
  ): Promise<Observable<MessageEvent>> {
    const context = await this.resolveGuest(token);
    return this.liveStream(
      {
        guestTokenHash: context.tokenHash,
        workspaceId: context.workspaceId,
        guestAccessGrantId: context.grantId,
      },
      context.workspaceId,
      true,
      lastId,
      context.householdId,
    );
  }

  private liveStream(
    context: {
      userId?: string;
      workspaceId: string;
      guestTokenHash?: string;
      guestAccessGrantId?: string;
    },
    workspaceId: string,
    guest: boolean,
    lastId?: string,
    householdId?: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const redis = new IORedis(this.environment.REDIS_URL, {
        maxRetriesPerRequest: 1,
      });
      let cursor = BigInt(lastId && /^\d+$/.test(lastId) ? lastId : "0");
      let busy = false;
      const fetch = async () => {
        if (busy) return;
        busy = true;
        try {
          const rows = await this.database.withContext(context, (tx) =>
            tx.weddingDayLiveEvent.findMany({
              where: {
                workspaceId,
                sequence: { gt: cursor },
                ...(guest
                  ? {
                      guestVisible: true,
                      OR: [
                        { householdIds: { isEmpty: true } },
                        { householdIds: { has: householdId! } },
                      ],
                    }
                  : {}),
              },
              orderBy: { sequence: "asc" },
              take: 100,
            }),
          );
          for (const row of rows) {
            cursor = row.sequence;
            subscriber.next({
              id: row.sequence.toString(),
              type: row.eventType,
              data: JSON.stringify(
                (guest ? row.guestPayload : row.organizerPayload) ?? {},
              ),
            });
          }
        } catch (error) {
          subscriber.error(error);
        } finally {
          busy = false;
        }
      };
      void fetch();
      const channel = `weddingos:wedding-day:workspace:${workspaceId}`;
      void redis.subscribe(channel);
      redis.on("message", () => void fetch());
      const heartbeat = setInterval(
        () =>
          subscriber.next({
            type: "heartbeat",
            data: { serverTime: new Date().toISOString() },
          }),
        15_000,
      );
      return () => {
        clearInterval(heartbeat);
        void redis.unsubscribe(channel).finally(() => redis.quit());
      };
    });
  }

  private async planResource(
    tx: Transaction,
    workspaceId: string,
    planId: string,
  ) {
    const plan = await this.requirePlan(tx, workspaceId, planId);
    const [versions, items, checklists, incidents, announcements, contacts] =
      await Promise.all([
        tx.weddingDayPlanVersion.findMany({
          where: { workspaceId, planId },
          orderBy: { versionNumber: "desc" },
        }),
        tx.runOfShowItem.findMany({
          where: { workspaceId, planId },
          orderBy: [{ position: "asc" }, { plannedStartAt: "asc" }],
        }),
        tx.weddingDayChecklist.findMany({
          where: { workspaceId, planId },
          orderBy: { position: "asc" },
        }),
        tx.weddingDayIncident.findMany({
          where: { workspaceId, planId },
          orderBy: { startedAt: "desc" },
        }),
        tx.weddingDayAnnouncement.findMany({
          where: { workspaceId, planId },
          orderBy: { createdAt: "desc" },
        }),
        tx.weddingDayContact.findMany({
          where: { workspaceId, planId },
          orderBy: { priority: "desc" },
        }),
      ]);
    return {
      ...resource(plan),
      versions: versions.map(resource),
      runOfShow: items.map(resource),
      checklists: checklists.map(resource),
      incidents: incidents.map((row) => incidentResource(row, false)),
      announcements: announcements.map(resource),
      contacts: contacts.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        role: row.role,
        organizationName: row.organizationName,
        priority: row.priority,
        guestVisible: row.guestVisible,
        version: row.version,
      })),
    };
  }
  private contactResource(row: {
    id: string;
    planId: string;
    type: string;
    name: string;
    role: string;
    organizationName: string | null;
    phoneEncrypted: string | null;
    emailNormalized: string | null;
    notesPrivateEncrypted: string | null;
    priority: string;
    guestVisible: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      planId: row.planId,
      type: row.type,
      name: row.name,
      role: row.role,
      organizationName: row.organizationName,
      phone: decryptSensitive(row.phoneEncrypted, this.sensitiveKey),
      email: row.emailNormalized,
      notesPrivate: decryptSensitive(
        row.notesPrivateEncrypted,
        this.sensitiveKey,
      ),
      priority: row.priority,
      guestVisible: row.guestVisible,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private async requirePlan(tx: Transaction, workspaceId: string, id: string) {
    const row = await tx.weddingDayPlan.findFirst({
      where: { id, workspaceId },
    });
    if (!row) notFound("Planul Wedding Day nu există.");
    return row;
  }
  private async requireRunItem(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.runOfShowItem.findFirst({
      where: { id, workspaceId },
    });
    if (!row) notFound("Momentul Run of Show nu există.");
    return row;
  }
  private async requireIncident(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.weddingDayIncident.findFirst({
      where: { id, workspaceId },
    });
    if (!row) notFound("Incidentul nu există.");
    return row;
  }
  private async requireAnnouncement(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.weddingDayAnnouncement.findFirst({
      where: { id, workspaceId },
    });
    if (!row) notFound("Anunțul nu există.");
    return row;
  }
  private async requireSession(
    tx: Transaction,
    workspaceId: string,
    id: string,
  ) {
    const row = await tx.guestCheckInSession.findFirst({
      where: { id, workspaceId },
    });
    if (!row) notFound("Sesiunea de check-in nu există.");
    return row;
  }

  private async announcementResource(
    tx: Transaction,
    row: Awaited<
      ReturnType<Transaction["weddingDayAnnouncement"]["findFirstOrThrow"]>
    >,
  ) {
    const [audiences, deliveries] = await Promise.all([
      tx.weddingDayAnnouncementAudience.findMany({
        where: { announcementId: row.id },
      }),
      tx.weddingDayAnnouncementDelivery.groupBy({
        by: ["status"],
        where: { announcementId: row.id },
        _count: true,
      }),
    ]);
    return {
      ...resource(row),
      audiences: audiences.map((audience) => ({
        id: audience.id,
        type: audience.audienceType,
        selector: audience.selector,
      })),
      delivery: {
        total: deliveries.reduce((sum, item) => sum + item._count, 0),
        ...Object.fromEntries(
          deliveries.map((item) => [item.status.toLowerCase(), item._count]),
        ),
      },
    };
  }
  private async resolveAnnouncementGrants(
    tx: Transaction,
    eventId: string,
    audiences: Array<{ audienceType: string; selector: Prisma.JsonValue }>,
  ) {
    const responses = await tx.guestEventResponse.findMany({
      where: { weddingEventId: eventId, attendance: "CONFIRMED" },
      select: { guestId: true },
    });
    const guests = await tx.guest.findMany({
      where: {
        id: { in: responses.map((row) => row.guestId) },
        deletedAt: null,
      },
      select: { id: true, householdId: true },
    });
    let householdIds = new Set(guests.map((guest) => guest.householdId));
    for (const audience of audiences) {
      const selector = object(audience.selector);
      if (
        audience.audienceType === "HOUSEHOLDS" ||
        audience.audienceType === "CUSTOM_GUEST_SET"
      ) {
        const selected = new Set(stringArray(selector.householdIds));
        householdIds = new Set(
          [...householdIds].filter((id) => selected.has(id)),
        );
      }
      if (audience.audienceType === "CHECKED_IN_GUESTS") {
        const checked = await tx.guestCheckIn.findMany({
          where: { weddingEventId: eventId, status: "CHECKED_IN" },
          select: { householdId: true },
        });
        const ids = new Set(checked.map((row) => row.householdId));
        householdIds = new Set([...householdIds].filter((id) => ids.has(id)));
      }
      if (audience.audienceType === "NOT_CHECKED_IN_GUESTS") {
        const checked = await tx.guestCheckIn.findMany({
          where: { weddingEventId: eventId, status: "CHECKED_IN" },
          select: { householdId: true },
        });
        const ids = new Set(checked.map((row) => row.householdId));
        householdIds = new Set([...householdIds].filter((id) => !ids.has(id)));
      }
    }
    return tx.guestAccessGrant.findMany({
      where: {
        householdId: { in: [...householdIds] },
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, householdId: true },
    });
  }
  private async validateCredentialInTx(
    tx: Transaction,
    workspaceId: string,
    sessionId: string,
    token: string,
  ) {
    const session = await this.requireSession(tx, workspaceId, sessionId);
    const credential = await tx.guestCheckInCredential.findFirst({
      where: {
        tokenHash: hashToken(token),
        workspaceId,
        weddingEventId: session.weddingEventId,
      },
    });
    if (!credential) return { credentialStatus: "INVALID", guests: [] };
    if (credential.revokedAt || credential.status === "REVOKED")
      return { credentialStatus: "REVOKED", guests: [] };
    if (credential.expiresAt <= new Date())
      return { credentialStatus: "EXPIRED", guests: [] };
    const guests = await tx.guest.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(credential.guestId
          ? { id: credential.guestId }
          : { householdId: credential.householdId! }),
      },
      orderBy: [{ isChild: "asc" }, { firstName: "asc" }],
    });
    const responses = await tx.guestEventResponse.findMany({
      where: {
        workspaceId,
        weddingEventId: session.weddingEventId,
        guestId: { in: guests.map((guest) => guest.id) },
      },
    });
    const states = await tx.guestCheckIn.findMany({
      where: {
        workspaceId,
        weddingEventId: session.weddingEventId,
        guestId: { in: guests.map((guest) => guest.id) },
      },
    });
    const seating = await tx.guestSeatingAssignment.findMany({
      where: {
        workspaceId,
        weddingEventId: session.weddingEventId,
        guestId: { in: guests.map((guest) => guest.id) },
        status: "ACTIVE",
      },
    });
    const tables = await tx.seatingTable.findMany({
      where: { id: { in: seating.map((row) => row.seatingTableId) } },
      select: { id: true, label: true },
    });
    const tableMap = new Map(tables.map((row) => [row.id, row.label]));
    return {
      credentialStatus: credential.status,
      household: credential.householdId
        ? {
            id: credential.householdId,
            displayName:
              (
                await tx.household.findUnique({
                  where: { id: credential.householdId },
                })
              )?.name ?? "Familie",
          }
        : undefined,
      guests: guests.map((guest) => {
        const attendance =
          responses.find((row) => row.guestId === guest.id)?.attendance ??
          "NO_RESPONSE";
        return {
          id: guest.id,
          displayName: `${guest.firstName} ${guest.lastName}`.trim(),
          eligible: attendance !== "DECLINED",
          attendanceStatus: attendance,
          checkInStatus:
            states.find((row) => row.guestId === guest.id)?.status ??
            "NOT_CHECKED_IN",
          tableLabel: tableMap.get(
            seating.find((row) => row.guestId === guest.id)?.seatingTableId ??
              "",
          ),
          warningCodes: [],
        };
      }),
    };
  }
  private async attendanceInTx(
    tx: Transaction,
    workspaceId: string,
    session: { id: string; weddingEventId: string },
  ) {
    const responses = await tx.guestEventResponse.findMany({
      where: {
        workspaceId,
        weddingEventId: session.weddingEventId,
        attendance: { in: ["CONFIRMED", "UNSURE"] },
      },
      select: { guestId: true },
    });
    const guests = await tx.guest.findMany({
      where: {
        workspaceId,
        id: { in: responses.map((row) => row.guestId) },
        deletedAt: null,
      },
      select: { id: true, householdId: true, isChild: true, isPlusOne: true },
    });
    const states = await tx.guestCheckIn.findMany({
      where: { workspaceId, weddingEventId: session.weddingEventId },
    });
    const checked = states.filter((row) => row.status === "CHECKED_IN");
    const checkedIds = new Set(checked.map((row) => row.guestId));
    const checkedOut = states.filter((row) => row.status === "CHECKED_OUT");
    const denied = states.filter((row) => row.status === "DENIED");
    return {
      expectedGuests: guests.length,
      checkedInGuests: checked.length,
      checkedOutGuests: checkedOut.length,
      notArrivedGuests: Math.max(
        0,
        guests.length - checked.length - checkedOut.length,
      ),
      deniedGuests: denied.length,
      householdsArrived: new Set(checked.map((row) => row.householdId)).size,
      childrenCheckedIn: guests.filter(
        (guest) => guest.isChild && checkedIds.has(guest.id),
      ).length,
      plusOnesCheckedIn: guests.filter(
        (guest) => guest.isPlusOne && checkedIds.has(guest.id),
      ).length,
      byEvent: [
        {
          eventId: session.weddingEventId,
          title:
            (
              await tx.weddingEvent.findUnique({
                where: { id: session.weddingEventId },
              })
            )?.title ?? "Eveniment",
          expected: guests.length,
          checkedIn: checked.length,
        },
      ],
      byTable: [],
      byTransportRoute: [],
    };
  }
  private async authenticateDevice(
    tx: Transaction,
    workspaceId: string,
    sessionId: string,
    publicId: string,
    secret: string,
  ) {
    const device = await tx.guestCheckInDevice.findFirst({
      where: { workspaceId, sessionId, devicePublicId: publicId },
    });
    if (
      !device ||
      device.status === "REVOKED" ||
      device.credentialExpiresAt <= new Date() ||
      device.secretHash !== hashToken(secret)
    )
      forbidden("Dispozitiv neînregistrat, revocat sau expirat.");
    return device;
  }
  private checkInToken(id: string) {
    return `wdc_${id.replace(/-/g, "")}_${createHmac("sha256", this.environment.OUTBOX_ENCRYPTION_KEY).update(id).digest("base64url")}`;
  }
  private async notifyIncidentAudience(
    tx: Transaction,
    workspaceId: string,
    incidentId: string,
    correlationId: string,
  ) {
    const members = await tx.workspaceMembership.findMany({
      where: { workspaceId, status: "ACTIVE" },
      include: { roleTemplate: true },
    });
    for (const member of members.filter((row) =>
      ["couple_owner", "couple_partner", "wedding_planner"].includes(
        row.roleTemplate.key,
      ),
    ))
      await this.asyncEvents.record(tx, {
        eventName: "wedding_day.incident_escalated.v1",
        aggregateType: "WeddingDayIncident",
        aggregateId: incidentId,
        workspaceId,
        actorUserId: member.userId,
        correlationId,
        deduplicationKey: `incident-escalation:${incidentId}:${member.userId}`,
        payload: {
          subject: { incidentId },
          notification: {
            recipientUserId: member.userId,
            module: "wedding_day",
            kind: "critical_incident",
            priority: "urgent",
            title: "Incident critic în ziua nunții",
            body: "Un incident critic necesită atenție. Detaliile sensibile sunt disponibile numai în Command Center.",
            actionUrl: `/event-day?incident=${incidentId}`,
          },
        },
      });
  }
  private async emit(
    tx: Transaction,
    input: {
      eventName: string;
      aggregateType: string;
      aggregateId: string;
      aggregateVersion: number;
      workspaceId: string;
      actorUserId: string;
      correlationId: string;
      summary: string;
      weddingEventId?: string;
      guestVisible: boolean;
      householdIds?: string[];
      organizerPayload: Input;
      guestPayload?: Input;
      extraPayload?: Input;
    },
  ) {
    const plan =
      input.aggregateType === "WeddingDayPlan" ? input.aggregateId : undefined;
    const event = await tx.weddingDayLiveEvent.create({
      data: {
        workspaceId: input.workspaceId,
        weddingEventId:
          input.weddingEventId ??
          (
            await tx.weddingDayPlan.findFirst({
              where: { workspaceId: input.workspaceId },
              orderBy: { updatedAt: "desc" },
            })
          )?.weddingEventId ??
          (await tx.weddingEvent.findFirst({
            where: { workspaceId: input.workspaceId },
            orderBy: { startAt: "asc" },
          }))!.id,
        planId: plan,
        eventType: input.eventName,
        organizerPayload: json(input.organizerPayload),
        guestPayload: input.guestPayload ? json(input.guestPayload) : undefined,
        guestVisible: input.guestVisible,
        householdIds: input.householdIds ?? [],
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await this.asyncEvents.record(tx, {
      eventName: input.eventName,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      correlationId: input.correlationId,
      deduplicationKey: `${input.eventName}:${input.aggregateId}:${input.aggregateVersion}`,
      payload: {
        subject: { id: input.aggregateId },
        activity: {
          category: "wedding_day",
          action: input.eventName.replace(/\.v1$/, ""),
          summary: input.summary,
          entityType: input.aggregateType,
          entityId: input.aggregateId,
        },
        weddingDayLive: { liveEventId: event.id },
        ...(input.extraPayload ?? {}),
      },
    });
  }
  private async replay(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const row = await tx.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: { actorUserId: userId, operation, key },
      },
    });
    if (!row) return null;
    if (
      row.workspaceId !== workspaceId ||
      row.requestHash !== stableHash(request)
    )
      problem(
        "IDEMPOTENCY_CONFLICT",
        HttpStatus.CONFLICT,
        "Idempotency conflict",
        "Cheia a fost folosită cu altă cerere.",
      );
    return row.responseBody as Prisma.JsonObject;
  }
  private async saveReplay(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        workspaceId,
        actorUserId: userId,
        operation,
        key,
        requestHash: stableHash(request),
        responseStatus: 200,
        responseBody: json(response),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
  private async resolveGuest(token: string): Promise<GuestContext> {
    const tokenHash = hashToken(token);
    return this.database.withContext(
      { guestTokenHash: tokenHash },
      async (tx) => {
        const grant = await tx.guestAccessGrant.findUnique({
          where: { tokenHash },
        });
        if (
          !grant ||
          grant.revokedAt ||
          (grant.expiresAt && grant.expiresAt <= new Date())
        )
          problem(
            "TOKEN_INVALID",
            HttpStatus.UNAUTHORIZED,
            "Guest token invalid",
          );
        return {
          grantId: grant.id,
          workspaceId: grant.workspaceId,
          householdId: grant.householdId,
          tokenHash,
        };
      },
    );
  }
  private async withGuest<T>(
    token: string,
    operation: (tx: Transaction, guest: GuestContext) => Promise<T>,
    correlationId?: string,
  ): Promise<T> {
    const guest = await this.resolveGuest(token);
    return this.database.withContext(
      {
        workspaceId: guest.workspaceId,
        guestTokenHash: guest.tokenHash,
        guestAccessGrantId: guest.grantId,
        correlationId,
      },
      (tx) => operation(tx, guest),
    );
  }
  private async guestMomentResponse(
    tx: Transaction,
    grantId: string,
    momentId: string,
  ) {
    const moment = await tx.guestMoment.findFirst({
      where: { id: momentId, guestAccessGrantId: grantId },
    });
    if (!moment) notFound("Guest Moment nu există.");
    const media = await tx.guestMomentMedia.findUnique({
      where: { guestMomentId: momentId },
    });
    return { ...resource(moment), media: media ? publicMedia(media) : null };
  }
  private async organizerMomentResponse(tx: Transaction, momentId: string) {
    const moment = await tx.guestMoment.findUnique({ where: { id: momentId } });
    if (!moment) notFound("Guest Moment nu există.");
    const [media, reports, moderation] = await Promise.all([
      tx.guestMomentMedia.findUnique({ where: { guestMomentId: momentId } }),
      tx.guestMomentReport.count({ where: { guestMomentId: momentId } }),
      tx.guestMomentModerationCase.findMany({
        where: { guestMomentId: momentId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      ...resource(moment),
      media: media ? publicMedia(media) : null,
      reportCount: reports,
      moderation: moderation.map((row) => ({
        id: row.id,
        status: row.status,
        reasonCode: row.reasonCode,
        decision: row.decision,
        version: row.version,
      })),
    };
  }
  private async galleryResource(
    tx: Transaction,
    row: Awaited<
      ReturnType<Transaction["galleryCollection"]["findFirstOrThrow"]>
    >,
    guest = false,
  ) {
    const items = await tx.galleryCollectionItem.findMany({
      where: { collectionId: row.id },
      orderBy: { position: "asc" },
    });
    const moments = await tx.guestMoment.findMany({
      where: {
        id: { in: items.map((item) => item.guestMomentId) },
        ...(guest ? { status: "PUBLISHED" } : {}),
      },
    });
    const media = await tx.guestMomentMedia.findMany({
      where: {
        guestMomentId: { in: moments.map((moment) => moment.id) },
        moderationStatus: "APPROVED",
      },
    });
    return {
      ...resource(row),
      items: items.flatMap((item) => {
        const moment = moments.find(
          (candidate) => candidate.id === item.guestMomentId,
        );
        const medium = media.find(
          (candidate) => candidate.guestMomentId === item.guestMomentId,
        );
        return moment && medium
          ? [
              {
                id: item.id,
                position: item.position,
                moment: {
                  id: moment.id,
                  caption: moment.caption,
                  publishedAt: moment.publishedAt?.toISOString() ?? null,
                },
                media: publicMedia(medium),
              },
            ]
          : [];
      }),
    };
  }
}

function resource(value: unknown): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(value, (_key, child) =>
      typeof child === "bigint" ? child.toString() : child,
    ),
  ) as Record<string, unknown>;
}
function publicMedia(value: {
  id: string;
  guestMomentId: string;
  mediaType: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  moderationStatus: string;
  derivativeObjectId: string | null;
  version: number;
}) {
  return {
    id: value.id,
    guestMomentId: value.guestMomentId,
    mediaType: value.mediaType,
    durationMs: value.durationMs,
    width: value.width,
    height: value.height,
    moderationStatus: value.moderationStatus,
    derivativeAvailable: Boolean(value.derivativeObjectId),
    previewUrl: value.derivativeObjectId
      ? `/api/v1/guest/moments/${value.guestMomentId}/preview`
      : null,
    version: value.version,
  };
}
function credentialResource(value: {
  id: string;
  weddingEventId: string;
  householdId: string | null;
  guestId: string | null;
  credentialType: string;
  status: string;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: value.id,
    weddingEventId: value.weddingEventId,
    householdId: value.householdId,
    guestId: value.guestId,
    credentialType: value.credentialType,
    status: value.status,
    expiresAt: value.expiresAt.toISOString(),
    rotatedAt: value.rotatedAt?.toISOString() ?? null,
    revokedAt: value.revokedAt?.toISOString() ?? null,
  };
}
function liveResource(
  value: {
    id: string;
    sequence: bigint;
    eventType: string;
    organizerPayload: Prisma.JsonValue;
    guestPayload: Prisma.JsonValue | null;
    createdAt: Date;
  },
  guest: boolean,
) {
  return {
    id: value.id,
    sequence: value.sequence.toString(),
    eventType: value.eventType,
    payload: guest ? value.guestPayload : value.organizerPayload,
    createdAt: value.createdAt.toISOString(),
  };
}
function safeRunItem(value: {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  plannedStartAt: Date;
  plannedEndAt: Date | null;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  locationName: string | null;
  locationAddress: string | null;
  isCritical: boolean;
  isGuestVisible: boolean;
  version: number;
}) {
  return {
    id: value.id,
    title: value.title,
    type: value.type,
    status: value.status,
    priority: value.priority,
    plannedStartAt: value.plannedStartAt.toISOString(),
    plannedEndAt: value.plannedEndAt?.toISOString() ?? null,
    actualStartAt: value.actualStartAt?.toISOString() ?? null,
    actualEndAt: value.actualEndAt?.toISOString() ?? null,
    locationName: value.locationName,
    locationAddress: value.locationAddress,
    isCritical: value.isCritical,
    isGuestVisible: value.isGuestVisible,
    version: value.version,
  };
}
function incidentResource(
  value: {
    id: string;
    workspaceId: string;
    planId: string;
    weddingEventId: string;
    type: string;
    severity: string;
    title: string;
    descriptionPrivate: string;
    status: string;
    assignedToMembershipId: string | null;
    relatedRunOfShowItemId: string | null;
    startedAt: Date;
    acknowledgedAt: Date | null;
    resolvedAt: Date | null;
    version: number;
  },
  sensitive: boolean,
) {
  return {
    id: value.id,
    workspaceId: value.workspaceId,
    planId: value.planId,
    weddingEventId: value.weddingEventId,
    type: value.type,
    severity: value.severity,
    title: value.title,
    descriptionPrivate: sensitive ? value.descriptionPrivate : undefined,
    restricted: !sensitive,
    status: value.status,
    assignedToMembershipId: value.assignedToMembershipId,
    relatedRunOfShowItemId: value.relatedRunOfShowItemId,
    startedAt: value.startedAt.toISOString(),
    acknowledgedAt: value.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: value.resolvedAt?.toISOString() ?? null,
    version: value.version,
  };
}
function runTransition(
  status: string,
  transition: string,
  reason: string | null,
  delay: unknown,
) {
  const allowed: Record<string, string[]> = {
    MARK_READY: ["NOT_STARTED"],
    START: ["NOT_STARTED", "READY", "DELAYED"],
    MARK_DELAYED: ["READY", "IN_PROGRESS"],
    BLOCK: ["NOT_STARTED", "READY", "IN_PROGRESS", "DELAYED"],
    UNBLOCK: ["BLOCKED"],
    COMPLETE: ["IN_PROGRESS", "DELAYED", "BLOCKED"],
    SKIP: ["NOT_STARTED", "READY", "DELAYED", "BLOCKED"],
    CANCEL: ["NOT_STARTED", "READY", "IN_PROGRESS", "DELAYED", "BLOCKED"],
    REOPEN: ["COMPLETED", "SKIPPED", "CANCELLED"],
  };
  if (!allowed[transition]?.includes(status))
    conflict(`Tranziție invalidă din ${status}.`);
  if (["BLOCK", "SKIP", "CANCEL"].includes(transition) && !reason)
    validation("Tranziția necesită motiv.");
  if (transition === "MARK_DELAYED" && !reason && delay === undefined)
    validation("Întârzierea necesită motiv sau estimare.");
  const target: Record<string, string> = {
    MARK_READY: "READY",
    START: "IN_PROGRESS",
    MARK_DELAYED: "DELAYED",
    BLOCK: "BLOCKED",
    UNBLOCK: "READY",
    COMPLETE: "COMPLETED",
    SKIP: "SKIPPED",
    CANCEL: "CANCELLED",
    REOPEN: "READY",
  };
  return {
    status: target[transition]! as
      | "NOT_STARTED"
      | "READY"
      | "IN_PROGRESS"
      | "DELAYED"
      | "BLOCKED"
      | "COMPLETED"
      | "SKIPPED"
      | "CANCELLED",
  };
}
function checklistTransition(
  status: string,
  transition: string,
  reason: string | null,
) {
  const allowed: Record<string, string[]> = {
    START: ["OPEN"],
    BLOCK: ["OPEN", "IN_PROGRESS"],
    UNBLOCK: ["BLOCKED"],
    COMPLETE: ["OPEN", "IN_PROGRESS", "BLOCKED"],
    SKIP: ["OPEN", "IN_PROGRESS", "BLOCKED"],
    REOPEN: ["COMPLETED", "SKIPPED"],
  };
  if (!allowed[transition]?.includes(status))
    conflict("Tranziție checklist invalidă.");
  if (["BLOCK", "SKIP"].includes(transition) && !reason)
    validation("Tranziția necesită motiv.");
  return (
    (
      {
        START: "IN_PROGRESS",
        BLOCK: "BLOCKED",
        UNBLOCK: "OPEN",
        COMPLETE: "COMPLETED",
        SKIP: "SKIPPED",
        REOPEN: "OPEN",
      } as const
    )[transition as "START"] ?? "OPEN"
  );
}
function incidentTransition(
  status: string,
  transition: string,
  reason: string | null,
) {
  const allowed: Record<string, string[]> = {
    ACKNOWLEDGE: ["OPEN"],
    INVESTIGATE: ["OPEN", "ACKNOWLEDGED"],
    MITIGATE: ["ACKNOWLEDGED", "INVESTIGATING"],
    RESOLVE: ["ACKNOWLEDGED", "INVESTIGATING", "MITIGATING"],
    CLOSE: ["RESOLVED"],
    CANCEL: ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"],
    REOPEN: ["RESOLVED", "CLOSED"],
  };
  if (!allowed[transition]?.includes(status))
    conflict("Tranziție incident invalidă.");
  if (["RESOLVE", "CLOSE", "CANCEL", "REOPEN"].includes(transition) && !reason)
    validation("Tranziția necesită motiv.");
  return (
    {
      ACKNOWLEDGE: "ACKNOWLEDGED",
      INVESTIGATE: "INVESTIGATING",
      MITIGATE: "MITIGATING",
      RESOLVE: "RESOLVED",
      CLOSE: "CLOSED",
      CANCEL: "CANCELLED",
      REOPEN: "OPEN",
    } as Record<
      string,
      | "OPEN"
      | "ACKNOWLEDGED"
      | "INVESTIGATING"
      | "MITIGATING"
      | "RESOLVED"
      | "CLOSED"
      | "CANCELLED"
    >
  )[transition]!;
}
function sessionTransition(status: string, transition: string) {
  const allowed: Record<string, string[]> = {
    MARK_READY: ["DRAFT"],
    OPEN: ["READY"],
    PAUSE: ["OPEN"],
    RESUME: ["PAUSED"],
    CLOSE: ["OPEN", "PAUSED"],
    ARCHIVE: ["CLOSED"],
  };
  if (!allowed[transition]?.includes(status))
    conflict("Tranziție sesiune invalidă.");
  return (
    {
      MARK_READY: "READY",
      OPEN: "OPEN",
      PAUSE: "PAUSED",
      RESUME: "OPEN",
      CLOSE: "CLOSED",
      ARCHIVE: "ARCHIVED",
    } as Record<
      string,
      "DRAFT" | "READY" | "OPEN" | "PAUSED" | "CLOSED" | "ARCHIVED"
    >
  )[transition]!;
}
function hasCycle(
  nodes: string[],
  edges: ReadonlyArray<readonly [string, string]>,
) {
  const graph = new Map(nodes.map((node) => [node, [] as string[]]));
  for (const [from, to] of edges) graph.get(from)?.push(to);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if (graph.get(node)?.some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return nodes.some(visit);
}
function emptyAttendance() {
  return {
    expectedGuests: 0,
    checkedInGuests: 0,
    checkedOutGuests: 0,
    notArrivedGuests: 0,
    deniedGuests: 0,
    householdsArrived: 0,
    childrenCheckedIn: 0,
    plusOnesCheckedIn: 0,
    byEvent: [],
    byTable: [],
    byTransportRoute: [],
  };
}
function text(value: unknown) {
  return String(value ?? "").trim();
}
function nullableText(value: unknown): string | null {
  const result = text(value);
  return result || null;
}
function numberValue(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}
function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function date(value: unknown) {
  const result = value instanceof Date ? value : new Date(text(value));
  if (Number.isNaN(result.getTime())) validation("Dată invalidă.");
  return result;
}
function optionalDate(value: unknown) {
  return value === null || value === undefined || value === ""
    ? null
    : date(value);
}
function enumValue(value: unknown, fallback = "") {
  return text(value || fallback).toUpperCase();
}
function object(value: unknown): Input {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Input)
    : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function stringArray(value: unknown): string[] {
  return array(value).map(text).filter(Boolean);
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, child) =>
      typeof child === "bigint" ? child.toString() : child,
    ),
  ) as Prisma.InputJsonValue;
}
function assertVersion(actual: number, expected: number) {
  if (actual !== expected)
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Version conflict",
      "Resursa a fost modificată. Reîncarcă datele.",
      undefined,
      { latestVersion: actual },
    );
}
function notFound(message: string): never {
  problem("NOT_FOUND", HttpStatus.NOT_FOUND, "Not found", message);
}
function validation(message: string): never {
  problem(
    "VALIDATION_FAILED",
    HttpStatus.UNPROCESSABLE_ENTITY,
    "Validation failed",
    message,
  );
}
function conflict(message: string): never {
  problem("VERSION_CONFLICT", HttpStatus.CONFLICT, "Conflict", message);
}
function forbidden(message: string): never {
  problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Forbidden", message);
}
