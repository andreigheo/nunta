import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  ApplyPlanProposalResponse,
  CreateCalendarEvent,
  CreateTask,
  TaskTransitionRequest,
  UpdatePlanProposal,
  UpdateTask,
} from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import {
  planGenerationInputHash,
  PLANNING_RULES_VERSION,
  type PlanGenerationInput,
} from "@weddingos/jobs";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";

type Transaction = Prisma.TransactionClient;

@Injectable()
export class PlanningService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
  ) {}

  async generate(
    userId: string,
    workspaceId: string,
    onboardingVersion: number,
    idempotencyKey: string,
    input: { mode?: "deterministic" | "ai_enriched" | "auto" },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "planning.generate",
          idempotencyKey,
          { onboardingVersion, ...input },
        );
        if (replay) return replay;
        const draft = await transaction.onboardingDraft.findFirst({
          where: { workspaceId, status: "READY" },
        });
        if (!draft)
          problem(
            "ONBOARDING_INCOMPLETE",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Onboarding is not ready",
          );
        if (draft.version !== onboardingVersion)
          versionConflict("Onboarding version conflict", draft.version);

        const planInput = await this.planInput(transaction, workspaceId, draft);
        const inputHash = planGenerationInputHash(planInput);
        const existing = await transaction.planGenerationRun.findFirst({
          where: { workspaceId, onboardingVersion, inputHash },
        });
        if (existing) {
          const job = await transaction.backgroundJob.findUniqueOrThrow({
            where: { id: existing.backgroundJobId },
          });
          const response = {
            job: mapJob(job),
            generationRunId: existing.id,
            ...(existing.proposalId
              ? { existingProposalId: existing.proposalId }
              : {}),
          };
          await this.saveIdempotency(
            transaction,
            workspaceId,
            userId,
            "planning.generate",
            idempotencyKey,
            { onboardingVersion, ...input },
            response,
          );
          return response;
        }

        const generationRunId = randomUUID();
        const jobId = await this.asyncEvents.record(transaction, {
          eventName: "planning.plan_generation_requested.v1",
          aggregateType: "PlanGenerationRun",
          aggregateId: generationRunId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `plan-generation:${workspaceId}:v${onboardingVersion}:${inputHash}`,
          userVisibleJob: true,
          payload: {
            subject: {
              generationRunId,
              onboardingDraftId: draft.id,
              onboardingVersion,
              inputHash,
            },
            planGeneration: {
              generationRunId,
              mode: input.mode ?? "auto",
            },
            activity: {
              category: "planning",
              action: "plan_generation_requested",
              summary: "A fost solicitată generarea unei propuneri de plan.",
              entityType: "PlanGenerationRun",
              entityId: generationRunId,
            },
          },
        });
        if (!jobId) throw new Error("Plan generation job was not created");
        const run = await transaction.planGenerationRun.create({
          data: {
            id: generationRunId,
            workspaceId,
            onboardingDraftId: draft.id,
            onboardingVersion,
            backgroundJobId: jobId,
            requestedByUserId: userId,
            mode: input.mode ?? "auto",
            provider:
              input.mode === "deterministic" ? "deterministic" : "configured",
            rulesVersion: PLANNING_RULES_VERSION,
            inputHash,
          },
        });
        const job = await transaction.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        const response = { job: mapJob(job), generationRunId: run.id };
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "planning.generate",
          idempotencyKey,
          { onboardingVersion, ...input },
          response,
        );
        return response;
      },
    );
  }

  async proposals(userId: string, workspaceId: string, cursor?: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const rows = await transaction.planProposal.findMany({
          where: { workspaceId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 21,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const nextCursor = rows.length > 20 ? rows[19]!.id : null;
        return {
          items: rows.slice(0, 20).map((proposal) => mapProposal(proposal, [])),
          nextCursor,
        };
      },
    );
  }

  async proposal(userId: string, workspaceId: string, proposalId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) =>
        this.getProposal(transaction, workspaceId, proposalId),
    );
  }

  async updateProposal(
    userId: string,
    workspaceId: string,
    proposalId: string,
    version: number,
    input: UpdatePlanProposal,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const proposal = await transaction.planProposal.findFirst({
          where: { id: proposalId, workspaceId },
        });
        if (!proposal) notFound("Plan proposal not found");
        if (proposal.version !== version)
          versionConflict("Proposal version conflict", proposal.version);
        if (proposal.status !== "READY_FOR_REVIEW")
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Proposal is not reviewable",
          );

        for (const update of input.itemUpdates ?? []) {
          const item = await transaction.planProposalItem.findFirst({
            where: { id: update.id, proposalId, workspaceId },
          });
          if (!item) notFound("Proposal item not found");
          if (item.required && update.included === false) {
            if (!update.confirmRequiredExclusion || !update.exclusionReason)
              problem(
                "VALIDATION_FAILED",
                HttpStatus.UNPROCESSABLE_ENTITY,
                "Required item exclusion needs confirmation and reason",
              );
          }
          await transaction.planProposalItem.update({
            where: { id: item.id },
            data: {
              ...(update.title === undefined ? {} : { title: update.title }),
              ...(update.description === undefined
                ? {}
                : { description: update.description }),
              ...(update.included === undefined
                ? {}
                : { included: update.included }),
              ...(update.priority === undefined
                ? {}
                : {
                    priority: update.priority
                      ? priorityEnum(update.priority)
                      : null,
                  }),
              ...(update.relativeDueOffsetDays === undefined
                ? {}
                : { relativeDueOffsetDays: update.relativeDueOffsetDays }),
              ...(update.absoluteDueAt === undefined
                ? {}
                : { absoluteDueAt: dateValue(update.absoluteDueAt) }),
              ...(update.suggestedOwnerType === undefined
                ? {}
                : { suggestedOwnerType: update.suggestedOwnerType }),
              ...(update.position === undefined
                ? {}
                : { position: update.position }),
              ...(update.exclusionReason
                ? { exclusionReason: update.exclusionReason }
                : {}),
              version: { increment: 1 },
            },
          });
        }
        for (const item of input.addItems ?? []) {
          if (item.parentItemId) {
            const parent = await transaction.planProposalItem.findFirst({
              where: { id: item.parentItemId, proposalId, workspaceId },
            });
            if (!parent) notFound("Proposal parent item not found");
          }
          await transaction.planProposalItem.create({
            data: {
              workspaceId,
              proposalId,
              type: proposalItemTypeEnum(item.type),
              parentItemId: item.parentItemId ?? null,
              sourceKey: `manual:${randomUUID()}`,
              title: item.title,
              description: item.description,
              category: item.category,
              priority: item.priority ? priorityEnum(item.priority) : null,
              relativeDueOffsetDays: item.relativeDueOffsetDays,
              absoluteDueAt: dateValue(item.absoluteDueAt),
              suggestedOwnerType: item.suggestedOwnerType,
              required: false,
              included: item.included,
              position: item.position,
              metadata: { manual: true },
            },
          });
        }
        await transaction.planProposal.update({
          where: { id: proposalId },
          data: {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.summary === undefined ? {} : { summary: input.summary }),
            warnings: jsonStrings(proposal.warnings),
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(transaction, {
          eventName: "planning.plan_proposal_updated.v1",
          aggregateType: "PlanProposal",
          aggregateId: proposalId,
          aggregateVersion: version + 1,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `plan-proposal-updated:${proposalId}:v${version + 1}`,
          payload: {
            subject: { proposalId },
            activity: {
              category: "planning",
              action: "plan_proposal_updated",
              summary: "Propunerea de plan a fost actualizată.",
              entityType: "PlanProposal",
              entityId: proposalId,
            },
          },
        });
        return this.getProposal(transaction, workspaceId, proposalId);
      },
    );
  }

  async rejectProposal(
    userId: string,
    workspaceId: string,
    proposalId: string,
    version: number,
    input: { reason?: string },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const result = await transaction.planProposal.updateMany({
          where: {
            id: proposalId,
            workspaceId,
            version,
            status: "READY_FOR_REVIEW",
          },
          data: {
            status: "REJECTED",
            rejectionReason: input.reason,
            version: { increment: 1 },
          },
        });
        if (!result.count)
          await this.proposalConflict(transaction, workspaceId, proposalId);
        await this.asyncEvents.record(transaction, {
          eventName: "planning.plan_proposal_rejected.v1",
          aggregateType: "PlanProposal",
          aggregateId: proposalId,
          aggregateVersion: version + 1,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `plan-proposal-rejected:${proposalId}`,
          payload: {
            subject: { proposalId, reason: input.reason ?? null },
            activity: {
              category: "planning",
              action: "plan_proposal_rejected",
              summary: "Propunerea de plan a fost respinsă.",
              entityType: "PlanProposal",
              entityId: proposalId,
            },
          },
        });
        return this.getProposal(transaction, workspaceId, proposalId);
      },
    );
  }

  async applyProposal(
    userId: string,
    workspaceId: string,
    proposalId: string,
    version: number,
    idempotencyKey: string,
    input: { confirmWarnings?: boolean },
    correlationId: string,
  ): Promise<ApplyPlanProposalResponse> {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const request = { proposalId, version, ...input };
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "planning.apply",
          idempotencyKey,
          request,
        );
        if (replay) return replay as ApplyPlanProposalResponse;
        const proposal = await transaction.planProposal.findFirst({
          where: { id: proposalId, workspaceId },
        });
        if (!proposal) notFound("Plan proposal not found");
        if (proposal.status === "APPLIED" && proposal.appliedAt) {
          const response = await this.appliedCounts(
            transaction,
            proposalId,
            proposal.appliedAt,
          );
          await this.saveIdempotency(
            transaction,
            workspaceId,
            userId,
            "planning.apply",
            idempotencyKey,
            request,
            response,
          );
          return response;
        }
        if (proposal.version !== version)
          versionConflict("Proposal version conflict", proposal.version);
        if (proposal.status !== "READY_FOR_REVIEW")
          problem(
            "VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Proposal cannot be applied",
          );
        const warnings = jsonStrings(proposal.warnings);
        if (warnings.length && !input.confirmWarnings)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Proposal warnings require confirmation",
          );
        const items = await transaction.planProposalItem.findMany({
          where: { proposalId, workspaceId, included: true },
          orderBy: { position: "asc" },
        });
        const phaseIds = new Map<string, string>();
        const milestoneIds = new Map<string, string>();
        const taskIds = new Map<string, string>();
        for (const item of items.filter((entry) => entry.type === "PHASE")) {
          const phase = await transaction.planningPhase.create({
            data: {
              workspaceId,
              title: item.title,
              description: item.description,
              position: item.position,
              startAt: item.absoluteStartAt,
              endAt: item.absoluteDueAt,
              relativeStartOffsetDays: item.relativeStartOffsetDays,
              relativeEndOffsetDays: item.relativeDueOffsetDays,
              source: "proposal",
              sourceProposalId: proposalId,
              sourceProposalItemId: item.id,
            },
          });
          phaseIds.set(item.id, phase.id);
        }
        for (const item of items.filter(
          (entry) => entry.type === "MILESTONE",
        )) {
          const milestone = await transaction.timelineMilestone.create({
            data: {
              workspaceId,
              phaseId: item.parentItemId
                ? phaseIds.get(item.parentItemId)
                : null,
              title: item.title,
              description: item.description,
              targetAt: item.absoluteDueAt,
              relativeOffsetDays: item.relativeDueOffsetDays,
              position: item.position,
              source: "proposal",
              sourceProposalItemId: item.id,
            },
          });
          milestoneIds.set(item.id, milestone.id);
        }
        for (const item of items.filter((entry) => entry.type === "TASK")) {
          const parentTaskId = item.parentItemId
            ? taskIds.get(item.parentItemId)
            : undefined;
          const task = await transaction.task.create({
            data: {
              workspaceId,
              phaseId: item.parentItemId
                ? phaseIds.get(item.parentItemId)
                : null,
              milestoneId: item.parentItemId
                ? milestoneIds.get(item.parentItemId)
                : null,
              parentTaskId,
              title: item.title,
              description: item.description,
              category: item.category ?? "planning",
              priority: item.priority ?? "MEDIUM",
              startAt: item.absoluteStartAt,
              dueAt: item.absoluteDueAt,
              relativeStartOffsetDays: item.relativeStartOffsetDays,
              relativeDueOffsetDays: item.relativeDueOffsetDays,
              createdById: userId,
              estimatedEffortMinutes: item.estimatedEffortMinutes,
              position: item.position,
              source: "proposal",
              sourceProposalItemId: item.id,
            },
          });
          taskIds.set(item.id, task.id);
        }
        const proposalItemsBySourceKey = new Map(
          items.map((item) => [item.sourceKey, item]),
        );
        for (const item of items.filter((entry) => entry.type === "TASK")) {
          const metadata = record(item.metadata);
          const dependencyKeys = Array.isArray(metadata.dependsOnKeys)
            ? metadata.dependsOnKeys.filter(
                (key): key is string => typeof key === "string",
              )
            : [];
          for (const dependencyKey of dependencyKeys) {
            const dependencyItem = proposalItemsBySourceKey.get(dependencyKey);
            const taskId = taskIds.get(item.id);
            const dependsOnTaskId = dependencyItem
              ? taskIds.get(dependencyItem.id)
              : undefined;
            if (taskId && dependsOnTaskId)
              await transaction.taskDependency.create({
                data: {
                  workspaceId,
                  taskId,
                  dependsOnTaskId,
                  dependencyType: "FINISH_TO_START",
                },
              });
          }
        }
        const appliedAt = new Date();
        await transaction.planProposal.update({
          where: { id: proposalId },
          data: { status: "APPLIED", appliedAt, version: { increment: 1 } },
        });
        await this.asyncEvents.record(transaction, {
          eventName: "planning.plan_applied.v1",
          aggregateType: "PlanProposal",
          aggregateId: proposalId,
          aggregateVersion: version + 1,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `plan-applied:${proposalId}`,
          payload: {
            subject: {
              proposalId,
              phaseCount: phaseIds.size,
              milestoneCount: milestoneIds.size,
              taskCount: taskIds.size,
            },
            notification: {
              recipientUserId: userId,
              module: "planning",
              kind: "plan_applied",
              title: "Planul a fost aplicat",
              body: `${taskIds.size} taskuri sunt pregătite pentru organizare.`,
              actionUrl: "/plan",
            },
            activity: {
              category: "planning",
              action: "plan_applied",
              summary: `Planul a fost aplicat cu ${taskIds.size} taskuri.`,
              entityType: "PlanProposal",
              entityId: proposalId,
            },
          },
        });
        const response = {
          proposalId,
          phaseCount: phaseIds.size,
          milestoneCount: milestoneIds.size,
          taskCount: taskIds.size,
          appliedAt: appliedAt.toISOString(),
        };
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "planning.apply",
          idempotencyKey,
          request,
          response,
        );
        return response;
      },
    );
  }

  async tasks(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const take = 50;
        const where: Prisma.TaskWhereInput = {
          workspaceId,
          deletedAt: null,
          ...(query.search
            ? {
                OR: [
                  { title: { contains: query.search, mode: "insensitive" } },
                  {
                    description: {
                      contains: query.search,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {}),
          ...(query.phase ? { phaseId: query.phase } : {}),
          ...(query.category ? { category: query.category } : {}),
          ...(query.status ? { status: taskStatusEnum(query.status) } : {}),
          ...(query.priority ? { priority: priorityEnum(query.priority) } : {}),
          ...(query.assignee ? { assigneeMembershipId: query.assignee } : {}),
          ...(query.overdue === "true"
            ? {
                dueAt: { lt: new Date() },
                status: { notIn: ["COMPLETED", "ARCHIVED"] },
              }
            : {}),
          ...(query.dueBefore || query.dueAfter
            ? {
                dueAt: {
                  ...(query.dueBefore
                    ? { lte: new Date(query.dueBefore) }
                    : {}),
                  ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
                },
              }
            : {}),
          ...(query.rootTasksOnly === "true" ? { parentTaskId: null } : {}),
        };
        const orderBy = taskSort(query.sort);
        const rows = await transaction.task.findMany({
          where,
          orderBy,
          take: take + 1,
          ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        });
        const visible = rows.slice(0, take);
        const mapped = await this.mapTasks(transaction, visible, workspaceId);
        return {
          items: mapped,
          nextCursor: rows.length > take ? visible.at(-1)!.id : null,
        };
      },
    );
  }

  async task(userId: string, workspaceId: string, taskId: string) {
    return this.database.withContext({ userId, workspaceId }, (transaction) =>
      this.getTask(transaction, workspaceId, taskId),
    );
  }

  async createTask(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateTask,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "task.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        await this.validateTaskReferences(transaction, workspaceId, input);
        const created = await transaction.task.create({
          data: {
            workspaceId,
            title: input.title,
            description: input.description,
            category: input.category,
            priority: priorityEnum(input.priority),
            phaseId: input.phaseId,
            milestoneId: input.milestoneId,
            parentTaskId: input.parentTaskId,
            startAt: dateValue(input.startAt),
            dueAt: dateValue(input.dueAt),
            assigneeMembershipId: input.assigneeMembershipId,
            createdById: userId,
            estimatedEffortMinutes: input.estimatedEffortMinutes,
            isPrivate: input.isPrivate,
            position: input.position,
          },
        });
        if (input.reminder)
          await this.scheduleReminder(
            transaction,
            created,
            input.reminder,
            userId,
            correlationId,
          );
        await this.taskEvent(transaction, {
          eventName: "task.created.v1",
          task: created,
          userId,
          correlationId,
          action: "task_created",
          summary: `Task creat: ${created.title}.`,
        });
        if (created.assigneeMembershipId)
          await this.assignmentEvent(
            transaction,
            created,
            userId,
            correlationId,
          );
        const response = await this.getTask(
          transaction,
          workspaceId,
          created.id,
        );
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "task.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateTask(
    userId: string,
    workspaceId: string,
    taskId: string,
    version: number,
    input: UpdateTask,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const current = await transaction.task.findFirst({
          where: { id: taskId, workspaceId, deletedAt: null },
        });
        if (!current) notFound("Task not found");
        if (current.version !== version)
          versionConflict("Task version conflict", current.version);
        await this.validateTaskReferences(transaction, workspaceId, input);
        const dueChanged =
          input.dueAt !== undefined &&
          dateValue(input.dueAt)?.getTime() !== current.dueAt?.getTime();
        const assigneeChanged =
          input.assigneeMembershipId !== undefined &&
          input.assigneeMembershipId !== current.assigneeMembershipId;
        const result = await transaction.task.updateMany({
          where: { id: taskId, workspaceId, version, deletedAt: null },
          data: {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
            ...(input.category === undefined
              ? {}
              : { category: input.category }),
            ...(input.priority === undefined
              ? {}
              : { priority: priorityEnum(input.priority) }),
            ...(input.phaseId === undefined ? {} : { phaseId: input.phaseId }),
            ...(input.milestoneId === undefined
              ? {}
              : { milestoneId: input.milestoneId }),
            ...(input.startAt === undefined
              ? {}
              : { startAt: dateValue(input.startAt) }),
            ...(input.dueAt === undefined
              ? {}
              : { dueAt: dateValue(input.dueAt) }),
            ...(input.assigneeMembershipId === undefined
              ? {}
              : { assigneeMembershipId: input.assigneeMembershipId }),
            ...(input.estimatedEffortMinutes === undefined
              ? {}
              : { estimatedEffortMinutes: input.estimatedEffortMinutes }),
            ...(input.isPrivate === undefined
              ? {}
              : { isPrivate: input.isPrivate }),
            ...(input.position === undefined
              ? {}
              : { position: input.position }),
            version: { increment: 1 },
          },
        });
        if (!result.count)
          await this.taskConflict(transaction, workspaceId, taskId);
        const updated = await transaction.task.findUniqueOrThrow({
          where: { id: taskId },
        });
        if (input.reminder !== undefined) {
          await transaction.taskReminder.updateMany({
            where: { taskId, status: "SCHEDULED" },
            data: { status: "CANCELLED", cancelledAt: new Date() },
          });
          if (input.reminder)
            await this.scheduleReminder(
              transaction,
              updated,
              input.reminder,
              userId,
              correlationId,
            );
        } else if (dueChanged) {
          await transaction.taskReminder.updateMany({
            where: { taskId, status: "SCHEDULED" },
            data: { status: "STALE" },
          });
        }
        await this.taskEvent(transaction, {
          eventName: dueChanged
            ? "task.due_date_changed.v1"
            : "task.updated.v1",
          task: updated,
          userId,
          correlationId,
          action: dueChanged ? "task_due_date_changed" : "task_updated",
          summary: dueChanged
            ? `Termen actualizat: ${updated.title}.`
            : `Task actualizat: ${updated.title}.`,
        });
        if (assigneeChanged && updated.assigneeMembershipId)
          await this.assignmentEvent(
            transaction,
            updated,
            userId,
            correlationId,
          );
        return this.getTask(transaction, workspaceId, taskId);
      },
    );
  }

  async deleteTask(
    userId: string,
    workspaceId: string,
    taskId: string,
    version: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const dependents = await transaction.taskDependency.count({
          where: { dependsOnTaskId: taskId },
        });
        const result = await transaction.task.updateMany({
          where: { id: taskId, workspaceId, version, deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (!result.count)
          await this.taskConflict(transaction, workspaceId, taskId);
        await transaction.taskReminder.updateMany({
          where: { taskId, status: "SCHEDULED" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        const task = await transaction.task.findUniqueOrThrow({
          where: { id: taskId },
        });
        await this.taskEvent(transaction, {
          eventName: "task.deleted.v1",
          task,
          userId,
          correlationId,
          action: "task_deleted",
          summary: `Task șters: ${task.title}.`,
        });
        return { deleted: true, dependentTaskCount: dependents };
      },
    );
  }

  async transitionTask(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: TaskTransitionRequest,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const task = await transaction.task.findFirst({
          where: { id: taskId, workspaceId, deletedAt: null },
        });
        if (!task) notFound("Task not found");
        if (task.version !== input.version)
          versionConflict("Task version conflict", task.version);
        const transition = resolveTransition(task.status, input);
        if (input.transition === "COMPLETE") {
          const blockers = await transaction.taskDependency.findMany({
            where: { taskId },
            select: { dependsOnTaskId: true },
          });
          if (blockers.length) {
            const incomplete = await transaction.task.count({
              where: {
                id: { in: blockers.map((entry) => entry.dependsOnTaskId) },
                status: { not: "COMPLETED" },
                deletedAt: null,
              },
            });
            if (incomplete)
              problem(
                "VALIDATION_FAILED",
                HttpStatus.CONFLICT,
                "Task dependencies are incomplete",
              );
          }
          const incompleteSubtasks = await transaction.task.count({
            where: {
              parentTaskId: taskId,
              status: { notIn: ["COMPLETED", "ARCHIVED"] },
              deletedAt: null,
            },
          });
          if (incompleteSubtasks && !input.confirmIncompleteSubtasks)
            problem(
              "VALIDATION_FAILED",
              HttpStatus.CONFLICT,
              "Incomplete subtasks require confirmation",
            );
        }
        await transaction.task.update({
          where: { id: taskId },
          data: {
            status: transition.status,
            blockedReason: transition.blockedReason,
            dueAt: transition.dueAt,
            completedAt: transition.completed ? new Date() : null,
            completedById: transition.completed ? userId : null,
            version: { increment: 1 },
          },
        });
        const updated = await transaction.task.findUniqueOrThrow({
          where: { id: taskId },
        });
        const action = input.transition.toLowerCase();
        await this.taskEvent(transaction, {
          eventName: "task.status_changed.v1",
          task: updated,
          userId,
          correlationId,
          action: `task_${action}`,
          summary: `Task ${transitionLabel(input.transition)}: ${updated.title}.`,
          notify: ["BLOCK", "UNBLOCK"].includes(input.transition),
        });
        return this.getTask(transaction, workspaceId, taskId);
      },
    );
  }

  async createSubtask(
    userId: string,
    workspaceId: string,
    taskId: string,
    key: string,
    input: CreateTask,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const parent = await transaction.task.findFirst({
          where: { id: taskId, workspaceId, deletedAt: null },
        });
        if (!parent) notFound("Parent task not found");
        if (parent.parentTaskId)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Slice 2B supports at most two task levels",
          );
        return this.createTask(
          userId,
          workspaceId,
          key,
          { ...input, parentTaskId: taskId },
          correlationId,
        );
      },
    );
  }

  async updateSubtask(
    userId: string,
    workspaceId: string,
    taskId: string,
    subtaskId: string,
    version: number,
    input: UpdateTask,
    correlationId: string,
  ) {
    await this.assertSubtask(userId, workspaceId, taskId, subtaskId);
    return this.updateTask(
      userId,
      workspaceId,
      subtaskId,
      version,
      input,
      correlationId,
    );
  }

  async deleteSubtask(
    userId: string,
    workspaceId: string,
    taskId: string,
    subtaskId: string,
    version: number,
    correlationId: string,
  ) {
    await this.assertSubtask(userId, workspaceId, taskId, subtaskId);
    return this.deleteTask(
      userId,
      workspaceId,
      subtaskId,
      version,
      correlationId,
    );
  }

  async dependencies(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: { dependsOnTaskIds: string[]; version: number },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const task = await transaction.task.findFirst({
          where: { id: taskId, workspaceId, deletedAt: null },
        });
        if (!task) notFound("Task not found");
        if (task.version !== input.version)
          versionConflict("Task version conflict", task.version);
        if (input.dependsOnTaskIds.includes(taskId))
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "A task cannot depend on itself",
          );
        const uniqueIds = [...new Set(input.dependsOnTaskIds)];
        const candidates = await transaction.task.findMany({
          where: {
            id: { in: uniqueIds },
            workspaceId,
            deletedAt: null,
            status: { not: "ARCHIVED" },
          },
          select: { id: true },
        });
        if (candidates.length !== uniqueIds.length)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Dependencies must be active tasks in the same workspace",
          );
        const graphRows = await transaction.taskDependency.findMany({
          where: { workspaceId, taskId: { not: taskId } },
        });
        if (
          hasDependencyCycle([
            ...graphRows.map(
              (row) => [row.taskId, row.dependsOnTaskId] as const,
            ),
            ...uniqueIds.map((id) => [taskId, id] as const),
          ])
        )
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Dependency cycle detected",
          );
        const current = await transaction.taskDependency.findMany({
          where: { taskId },
        });
        const currentIds = current.map((row) => row.dependsOnTaskId);
        const added = uniqueIds.filter((id) => !currentIds.includes(id));
        const removed = currentIds.filter((id) => !uniqueIds.includes(id));
        await transaction.taskDependency.deleteMany({ where: { taskId } });
        if (uniqueIds.length)
          await transaction.taskDependency.createMany({
            data: uniqueIds.map((dependsOnTaskId) => ({
              workspaceId,
              taskId,
              dependsOnTaskId,
            })),
          });
        await transaction.task.update({
          where: { id: taskId },
          data: { version: { increment: 1 } },
        });
        const incomplete = await transaction.task.findMany({
          where: { id: { in: uniqueIds }, status: { not: "COMPLETED" } },
          select: { id: true },
        });
        const resource = await this.getTask(transaction, workspaceId, taskId);
        return {
          task: resource,
          added,
          removed,
          blockedByIncomplete: incomplete.map((row) => row.id),
        };
      },
    );
  }

  async copyTask(
    userId: string,
    workspaceId: string,
    taskId: string,
    idempotencyKey: string,
    input: {
      includeSubtasks?: boolean;
      includeDependencies?: boolean;
      dueDateShiftDays?: number;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "task.copy",
          idempotencyKey,
          { taskId, ...input },
        );
        if (replay) return replay;
        const source = await transaction.task.findFirst({
          where: { id: taskId, workspaceId, deletedAt: null },
        });
        if (!source) notFound("Task not found");
        const shift = input.dueDateShiftDays ?? 0;
        const copied = await transaction.task.create({
          data: {
            workspaceId,
            phaseId: source.phaseId,
            milestoneId: source.milestoneId,
            title: `${source.title} (copie)`,
            description: source.description,
            category: source.category,
            priority: source.priority,
            startAt: shiftDate(source.startAt, shift),
            dueAt: shiftDate(source.dueAt, shift),
            assigneeMembershipId: source.assigneeMembershipId,
            createdById: userId,
            estimatedEffortMinutes: source.estimatedEffortMinutes,
            isPrivate: source.isPrivate,
            position: source.position + 1,
            source: "copy",
          },
        });
        if (input.includeSubtasks) {
          const subtasks = await transaction.task.findMany({
            where: { parentTaskId: taskId, deletedAt: null },
          });
          if (subtasks.length)
            await transaction.task.createMany({
              data: subtasks.map((subtask) => ({
                workspaceId,
                parentTaskId: copied.id,
                phaseId: subtask.phaseId,
                milestoneId: subtask.milestoneId,
                title: subtask.title,
                description: subtask.description,
                category: subtask.category,
                priority: subtask.priority,
                startAt: shiftDate(subtask.startAt, shift),
                dueAt: shiftDate(subtask.dueAt, shift),
                assigneeMembershipId: subtask.assigneeMembershipId,
                createdById: userId,
                estimatedEffortMinutes: subtask.estimatedEffortMinutes,
                isPrivate: subtask.isPrivate,
                position: subtask.position,
                source: "copy",
              })),
            });
        }
        if (input.includeDependencies) {
          const dependencies = await transaction.taskDependency.findMany({
            where: { taskId },
          });
          if (dependencies.length)
            await transaction.taskDependency.createMany({
              data: dependencies.map((dependency) => ({
                workspaceId,
                taskId: copied.id,
                dependsOnTaskId: dependency.dependsOnTaskId,
              })),
            });
        }
        await this.taskEvent(transaction, {
          eventName: "task.created.v1",
          task: copied,
          userId,
          correlationId,
          action: "task_copied",
          summary: `Task duplicat: ${source.title}.`,
        });
        const response = await this.getTask(
          transaction,
          workspaceId,
          copied.id,
        );
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "task.copy",
          idempotencyKey,
          { taskId, ...input },
          response,
        );
        return response;
      },
    );
  }

  async comments(userId: string, workspaceId: string, taskId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        await this.ensureTask(transaction, workspaceId, taskId);
        const rows = await transaction.taskComment.findMany({
          where: { workspaceId, taskId, deletedAt: null },
          orderBy: { createdAt: "asc" },
        });
        return { items: await this.mapComments(transaction, rows) };
      },
    );
  }

  async createComment(
    userId: string,
    workspaceId: string,
    taskId: string,
    input: { body: string },
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        await this.ensureTask(transaction, workspaceId, taskId);
        const comment = await transaction.taskComment.create({
          data: {
            workspaceId,
            taskId,
            authorUserId: userId,
            body: stripHtml(input.body),
          },
        });
        return (await this.mapComments(transaction, [comment]))[0]!;
      },
    );
  }

  async updateComment(
    userId: string,
    workspaceId: string,
    taskId: string,
    commentId: string,
    input: { body: string; version: number },
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        await this.ensureTask(transaction, workspaceId, taskId);
        const comment = await transaction.taskComment.findFirst({
          where: { id: commentId, workspaceId, taskId, deletedAt: null },
        });
        if (!comment) notFound("Comment not found");
        if (
          comment.authorUserId !== userId &&
          !(await this.canModerateComments(transaction, workspaceId, userId))
        )
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Only the comment author or an authorized owner/planner can edit it",
          );
        if (comment.version !== input.version)
          versionConflict("Comment version conflict", comment.version);
        const updated = await transaction.taskComment.update({
          where: { id: commentId },
          data: { body: stripHtml(input.body), version: { increment: 1 } },
        });
        return (await this.mapComments(transaction, [updated]))[0]!;
      },
    );
  }

  async deleteComment(
    userId: string,
    workspaceId: string,
    taskId: string,
    commentId: string,
    version: number,
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        await this.ensureTask(transaction, workspaceId, taskId);
        const existing = await transaction.taskComment.findFirst({
          where: { id: commentId, workspaceId, taskId, deletedAt: null },
        });
        if (!existing) notFound("Comment not found");
        const canModerate = await this.canModerateComments(
          transaction,
          workspaceId,
          userId,
        );
        if (existing.authorUserId !== userId && !canModerate)
          problem(
            "FORBIDDEN",
            HttpStatus.FORBIDDEN,
            "Only the comment author or an authorized owner/planner can delete it",
          );
        if (existing.version !== version)
          versionConflict("Comment version conflict", existing.version);
        const result = await transaction.taskComment.updateMany({
          where: {
            id: commentId,
            workspaceId,
            taskId,
            version,
            deletedAt: null,
          },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (!result.count) {
          const latest = await transaction.taskComment.findFirst({
            where: { id: commentId, workspaceId, taskId },
          });
          if (!latest) notFound("Comment not found");
          versionConflict("Comment version conflict", latest.version);
        }
        return { deleted: true };
      },
    );
  }

  async calendar(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const range = calendarRange(query);
        const workspace = await transaction.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
        });
        const [
          events,
          tasks,
          milestones,
          draft,
          weddingEvents,
          paymentSchedules,
          bookings,
          contracts,
          signatureEnvelopes,
          paymentCheckouts,
        ] = await Promise.all([
          transaction.calendarEvent.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              startAt: { gte: range.from, lte: range.to },
            },
            orderBy: { startAt: "asc" },
            take: 1000,
          }),
          transaction.task.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              OR: [
                { dueAt: { gte: range.from, lte: range.to } },
                { startAt: { gte: range.from, lte: range.to } },
              ],
            },
            orderBy: { dueAt: "asc" },
            take: 1000,
          }),
          transaction.timelineMilestone.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              targetAt: { gte: range.from, lte: range.to },
            },
            orderBy: { targetAt: "asc" },
            take: 500,
          }),
          transaction.onboardingDraft.findUnique({ where: { workspaceId } }),
          transaction.weddingEvent.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              startAt: { gte: range.from, lte: range.to },
              status: { not: "CANCELLED" },
            },
            orderBy: [{ startAt: "asc" }, { position: "asc" }],
            take: 200,
          }),
          transaction.paymentScheduleEntry.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              status: { notIn: ["PAID", "CANCELLED"] },
              dueAt: { gte: range.from, lte: range.to },
            },
            orderBy: { dueAt: "asc" },
            take: 500,
          }),
          transaction.vendorBooking.findMany({
            where: {
              workspaceId,
              status: { notIn: ["CANCELLED", "ARCHIVED"] },
              serviceStartAt: { gte: range.from, lte: range.to },
            },
            orderBy: { serviceStartAt: "asc" },
            take: 500,
          }),
          transaction.vendorContract.findMany({
            where: {
              workspaceId,
              readyAt: { gte: range.from, lte: range.to },
              status: { notIn: ["CANCELLED", "ARCHIVED"] },
            },
            orderBy: { readyAt: "asc" },
            take: 500,
          }),
          transaction.electronicSignatureEnvelope.findMany({
            where: {
              workspaceId,
              status: { in: ["READY", "SENT", "VIEWED", "PARTIALLY_SIGNED"] },
              expiresAt: { gte: range.from, lte: range.to },
            },
            orderBy: { expiresAt: "asc" },
            take: 500,
          }),
          transaction.onlinePaymentCheckout.findMany({
            where: {
              workspaceId,
              status: "OPEN",
              expiresAt: { gte: range.from, lte: range.to },
            },
            orderBy: { expiresAt: "asc" },
            take: 500,
          }),
        ]);
        const items = [
          ...events.map((event) => mapCalendarEvent(event)),
          ...tasks.flatMap((task) => {
            const projected = [];
            if (
              task.startAt &&
              task.startAt >= range.from &&
              task.startAt <= range.to
            )
              projected.push(
                mapTaskCalendar(
                  task,
                  "task_start",
                  task.startAt,
                  workspace.timezone,
                ),
              );
            if (
              task.dueAt &&
              task.dueAt >= range.from &&
              task.dueAt <= range.to
            )
              projected.push(
                mapTaskCalendar(
                  task,
                  "task_due",
                  task.dueAt,
                  workspace.timezone,
                ),
              );
            return projected;
          }),
          ...milestones.map((milestone) =>
            mapMilestoneCalendar(milestone, workspace.timezone),
          ),
          ...(weddingEvents.length
            ? weddingEvents.map(mapWeddingEventCalendar)
            : onboardingCalendar(draft?.dateEvents, workspace.timezone, range)),
          ...paymentSchedules.map((entry) =>
            mapCommercialCalendar(
              "payment_schedule",
              entry.id,
              `Plată: ${entry.name}`,
              entry.dueAt,
              workspace.timezone,
              "/payments",
              entry.version,
            ),
          ),
          ...bookings.map((booking) =>
            mapCommercialCalendar(
              "booking",
              booking.id,
              booking.title,
              booking.serviceStartAt!,
              workspace.timezone,
              `/bookings?booking=${booking.id}`,
              booking.version,
            ),
          ),
          ...contracts.map((contract) =>
            mapCommercialCalendar(
              "contract",
              contract.id,
              "Contract pregătit pentru confirmare",
              contract.readyAt!,
              workspace.timezone,
              `/contracts?contract=${contract.id}`,
              contract.version,
            ),
          ),
          ...signatureEnvelopes.map((envelope) =>
            mapCommercialCalendar(
              "signature_envelope",
              envelope.id,
              "Expirare semnătură contract",
              envelope.expiresAt!,
              workspace.timezone,
              `/contracts?signature=${envelope.id}`,
              envelope.version,
            ),
          ),
          ...paymentCheckouts.map((checkout) =>
            mapCommercialCalendar(
              "payment_checkout",
              checkout.id,
              "Expirare plată online",
              checkout.expiresAt,
              workspace.timezone,
              `/payments?checkout=${checkout.id}`,
              checkout.version,
            ),
          ),
        ].sort((a, b) => a.startAt.localeCompare(b.startAt));
        return { items: items.slice(0, 2000) };
      },
    );
  }

  async event(userId: string, workspaceId: string, eventId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const event = await transaction.calendarEvent.findFirst({
          where: { id: eventId, workspaceId, deletedAt: null },
        });
        if (!event) notFound("Calendar event not found");
        return mapCalendarEvent(event);
      },
    );
  }

  async createEvent(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateCalendarEvent,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "calendar.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        await this.validateMembership(
          transaction,
          workspaceId,
          input.ownerMembershipId,
        );
        const event = await transaction.calendarEvent.create({
          data: {
            workspaceId,
            title: input.title,
            description: input.description,
            eventType: input.eventType,
            startAt: new Date(input.startAt),
            endAt: dateValue(input.endAt),
            allDay: input.allDay,
            timezone: input.timezone,
            location: input.location,
            meetingUrl: input.meetingUrl,
            ownerMembershipId: input.ownerMembershipId,
            reminderMinutes: input.reminderMinutes,
            createdById: userId,
          },
        });
        await this.calendarEvent(
          transaction,
          event,
          userId,
          correlationId,
          "calendar.event_created.v1",
          "calendar_event_created",
          `Eveniment creat: ${event.title}.`,
        );
        const response = mapCalendarEvent(event);
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "calendar.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateEvent(
    userId: string,
    workspaceId: string,
    eventId: string,
    version: number,
    input: Partial<CreateCalendarEvent>,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        await this.validateMembership(
          transaction,
          workspaceId,
          input.ownerMembershipId,
        );
        const result = await transaction.calendarEvent.updateMany({
          where: {
            id: eventId,
            workspaceId,
            version,
            deletedAt: null,
            source: "manual",
          },
          data: {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
            ...(input.eventType === undefined
              ? {}
              : { eventType: input.eventType }),
            ...(input.startAt === undefined
              ? {}
              : { startAt: new Date(input.startAt) }),
            ...(input.endAt === undefined
              ? {}
              : { endAt: dateValue(input.endAt) }),
            ...(input.allDay === undefined ? {} : { allDay: input.allDay }),
            ...(input.timezone === undefined
              ? {}
              : { timezone: input.timezone }),
            ...(input.location === undefined
              ? {}
              : { location: input.location }),
            ...(input.meetingUrl === undefined
              ? {}
              : { meetingUrl: input.meetingUrl }),
            ...(input.ownerMembershipId === undefined
              ? {}
              : { ownerMembershipId: input.ownerMembershipId }),
            ...(input.reminderMinutes === undefined
              ? {}
              : { reminderMinutes: input.reminderMinutes }),
            version: { increment: 1 },
          },
        });
        if (!result.count)
          await this.calendarConflict(transaction, workspaceId, eventId);
        const event = await transaction.calendarEvent.findUniqueOrThrow({
          where: { id: eventId },
        });
        await this.calendarEvent(
          transaction,
          event,
          userId,
          correlationId,
          "calendar.event_updated.v1",
          "calendar_event_updated",
          `Eveniment actualizat: ${event.title}.`,
        );
        return mapCalendarEvent(event);
      },
    );
  }

  async deleteEvent(
    userId: string,
    workspaceId: string,
    eventId: string,
    version: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const result = await transaction.calendarEvent.updateMany({
          where: {
            id: eventId,
            workspaceId,
            version,
            deletedAt: null,
            source: "manual",
          },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (!result.count)
          await this.calendarConflict(transaction, workspaceId, eventId);
        const event = await transaction.calendarEvent.findUniqueOrThrow({
          where: { id: eventId },
        });
        await this.calendarEvent(
          transaction,
          event,
          userId,
          correlationId,
          "calendar.event_deleted.v1",
          "calendar_event_deleted",
          `Eveniment șters: ${event.title}.`,
        );
        return { deleted: true };
      },
    );
  }

  async calendarIcs(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    const calendar = await this.calendar(userId, workspaceId, query);
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Sarbato//Planning Calendar//RO",
      "CALSCALE:GREGORIAN",
    ];
    for (const item of calendar.items.slice(0, 2000)) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${ics(item.id)}@weddingos.local`,
        `DTSTAMP:${icsDate(new Date())}`,
        ...(item.allDay
          ? [
              `DTSTART;VALUE=DATE:${icsDay(new Date(item.startAt), item.timezone)}`,
              ...(item.endAt
                ? [
                    `DTEND;VALUE=DATE:${icsDayAfter(new Date(item.endAt), item.timezone)}`,
                  ]
                : []),
            ]
          : [
              `DTSTART:${icsDate(new Date(item.startAt))}`,
              ...(item.endAt ? [`DTEND:${icsDate(new Date(item.endAt))}`] : []),
            ]),
        `SUMMARY:${ics(item.title)}`,
        ...(item.description ? [`DESCRIPTION:${ics(item.description)}`] : []),
        ...(item.location ? [`LOCATION:${ics(item.location)}`] : []),
        `URL:${ics(item.href)}`,
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    const output = `${lines.join("\r\n")}\r\n`;
    if (Buffer.byteLength(output) > 5_000_000)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.PAYLOAD_TOO_LARGE,
        "Calendar export too large",
      );
    return output;
  }

  async timeline(userId: string, workspaceId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => this.buildTimeline(transaction, workspaceId),
    );
  }

  async createMilestone(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: {
      phaseId?: string | null;
      title: string;
      description?: string;
      targetAt?: string | null;
      relativeOffsetDays?: number | null;
      position?: number;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "milestone.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        if (input.phaseId) {
          const phase = await transaction.planningPhase.findFirst({
            where: { id: input.phaseId, workspaceId },
          });
          if (!phase) notFound("Planning phase not found");
        }
        const milestone = await transaction.timelineMilestone.create({
          data: {
            workspaceId,
            phaseId: input.phaseId,
            title: input.title,
            description: input.description,
            targetAt: dateValue(input.targetAt),
            relativeOffsetDays: input.relativeOffsetDays,
            position: input.position ?? 0,
          },
        });
        await this.milestoneEvent(
          transaction,
          milestone,
          userId,
          correlationId,
          "timeline.milestone_created.v1",
          "milestone_created",
        );
        const response = mapMilestone(milestone);
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "milestone.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async updateMilestone(
    userId: string,
    workspaceId: string,
    milestoneId: string,
    version: number,
    input: {
      phaseId?: string | null;
      title?: string;
      description?: string;
      targetAt?: string | null;
      relativeOffsetDays?: number | null;
      position?: number;
      status?: "upcoming" | "in_progress" | "completed";
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        if (input.phaseId) {
          const phase = await transaction.planningPhase.findFirst({
            where: { id: input.phaseId, workspaceId },
          });
          if (!phase) notFound("Planning phase not found");
        }
        const result = await transaction.timelineMilestone.updateMany({
          where: { id: milestoneId, workspaceId, version, deletedAt: null },
          data: {
            ...(input.phaseId === undefined ? {} : { phaseId: input.phaseId }),
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.description === undefined
              ? {}
              : { description: input.description }),
            ...(input.targetAt === undefined
              ? {}
              : { targetAt: dateValue(input.targetAt) }),
            ...(input.relativeOffsetDays === undefined
              ? {}
              : { relativeOffsetDays: input.relativeOffsetDays }),
            ...(input.position === undefined
              ? {}
              : { position: input.position }),
            ...(input.status === undefined
              ? {}
              : {
                  status: milestoneStatusEnum(input.status),
                  completedAt: input.status === "completed" ? new Date() : null,
                }),
            version: { increment: 1 },
          },
        });
        if (!result.count)
          await this.milestoneConflict(transaction, workspaceId, milestoneId);
        const milestone = await transaction.timelineMilestone.findUniqueOrThrow(
          { where: { id: milestoneId } },
        );
        await this.milestoneEvent(
          transaction,
          milestone,
          userId,
          correlationId,
          "timeline.milestone_updated.v1",
          milestone.status === "COMPLETED"
            ? "milestone_completed"
            : "milestone_updated",
        );
        return mapMilestone(milestone);
      },
    );
  }

  async deleteMilestone(
    userId: string,
    workspaceId: string,
    milestoneId: string,
    version: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const result = await transaction.timelineMilestone.updateMany({
          where: { id: milestoneId, workspaceId, version, deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        if (!result.count)
          await this.milestoneConflict(transaction, workspaceId, milestoneId);
        await transaction.task.updateMany({
          where: { milestoneId },
          data: { milestoneId: null, version: { increment: 1 } },
        });
        const milestone = await transaction.timelineMilestone.findUniqueOrThrow(
          { where: { id: milestoneId } },
        );
        await this.milestoneEvent(
          transaction,
          milestone,
          userId,
          correlationId,
          "timeline.milestone_deleted.v1",
          "milestone_deleted",
        );
        return { deleted: true };
      },
    );
  }

  async recalculate(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: { applyRelativeDates?: boolean },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "timeline.recalculate",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const workspace = await transaction.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          include: { eventProfile: true },
        });
        const eventDate = workspace.eventProfile?.eventDate ?? null;
        const tasks = await transaction.task.findMany({
          where: { workspaceId, deletedAt: null },
        });
        const milestones = await transaction.timelineMilestone.findMany({
          where: { workspaceId, deletedAt: null },
        });
        const changes: Array<{
          resourceType: "task" | "milestone" | "phase";
          resourceId: string;
          currentAt: string | null;
          proposedAt: string;
          applied: boolean;
        }> = [];
        if (eventDate) {
          for (const task of tasks.filter(
            (entry) => entry.relativeDueOffsetDays !== null,
          )) {
            const proposed = shiftDate(eventDate, task.relativeDueOffsetDays!)!;
            if (task.dueAt?.getTime() !== proposed.getTime())
              changes.push({
                resourceType: "task",
                resourceId: task.id,
                currentAt: task.dueAt?.toISOString() ?? null,
                proposedAt: proposed.toISOString(),
                applied: false,
              });
          }
          for (const milestone of milestones.filter(
            (entry) => entry.relativeOffsetDays !== null,
          )) {
            const proposed = shiftDate(
              eventDate,
              milestone.relativeOffsetDays!,
            )!;
            if (milestone.targetAt?.getTime() !== proposed.getTime())
              changes.push({
                resourceType: "milestone",
                resourceId: milestone.id,
                currentAt: milestone.targetAt?.toISOString() ?? null,
                proposedAt: proposed.toISOString(),
                applied: false,
              });
          }
        }
        const applyRelativeDates = input.applyRelativeDates === true;
        if (applyRelativeDates) {
          for (const change of changes) {
            const targetAt = new Date(change.proposedAt);
            if (change.resourceType === "task") {
              await transaction.task.update({
                where: { id: change.resourceId },
                data: {
                  dueAt: targetAt,
                  version: { increment: 1 },
                },
              });
            } else if (change.resourceType === "milestone") {
              await transaction.timelineMilestone.update({
                where: { id: change.resourceId },
                data: {
                  targetAt,
                  version: { increment: 1 },
                },
              });
            }
            change.applied = true;
          }
        }
        const response = {
          preview: !applyRelativeDates,
          proposedChanges: changes,
          overdueTaskIds: tasks.filter(isOverdue).map((task) => task.id),
          blockedTaskIds: tasks
            .filter((task) => task.status === "BLOCKED")
            .map((task) => task.id),
        };
        await this.asyncEvents.record(transaction, {
          eventName: "timeline.recalculated.v1",
          aggregateType: "Workspace",
          aggregateId: workspaceId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `timeline-recalculated:${workspaceId}:${hashJson(input)}:${idempotencyKey}`,
          payload: {
            subject: { workspaceId, proposedChangeCount: changes.length },
            activity: {
              category: "timeline",
              action: "timeline_recalculated",
              summary: applyRelativeDates
                ? `Timeline recalculat: ${changes.length} termene actualizate.`
                : `Timeline recalculat: ${changes.length} schimbări propuse.`,
              entityType: "Workspace",
              entityId: workspaceId,
            },
          },
        });
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "timeline.recalculate",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  async dashboard(userId: string, workspaceId: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const [workspace, tasks, phases, milestones, activity] =
          await Promise.all([
            transaction.workspace.findUniqueOrThrow({
              where: { id: workspaceId },
              include: { eventProfile: true },
            }),
            transaction.task.findMany({
              where: {
                workspaceId,
                deletedAt: null,
                status: { not: "ARCHIVED" },
              },
              orderBy: [{ dueAt: "asc" }, { priority: "desc" }],
            }),
            transaction.planningPhase.findMany({
              where: { workspaceId },
              orderBy: { position: "asc" },
            }),
            transaction.timelineMilestone.findMany({
              where: {
                workspaceId,
                deletedAt: null,
                status: { not: "COMPLETED" },
              },
              orderBy: { targetAt: "asc" },
            }),
            transaction.activityItem.findMany({
              where: { workspaceId },
              orderBy: { occurredAt: "desc" },
              take: 10,
            }),
          ]);
        const now = new Date();
        const week = new Date(now.getTime() + 7 * 86_400_000);
        const completed = tasks.filter(
          (task) => task.status === "COMPLETED",
        ).length;
        const summaries = await this.mapTasks(transaction, tasks, workspaceId);
        const urgent = summaries
          .filter(
            (task) =>
              task.status !== "completed" &&
              (task.priority === "urgent" ||
                (task.dueAt && new Date(task.dueAt) < week)),
          )
          .slice(0, 8);
        const upcoming = await this.calendarFromTransaction(
          transaction,
          workspaceId,
          now,
          new Date(now.getTime() + 30 * 86_400_000),
        );
        const [
          guestRows,
          recipients,
          responses,
          selections,
          allergyIssues,
          onboarding,
          rsvpDefinition,
          invitationSite,
          campaigns,
        ] = await Promise.all([
          transaction.guest.findMany({
            where: { workspaceId, status: "ACTIVE" },
            select: {
              id: true,
              emailNormalized: true,
              phoneE164: true,
              needsTransport: true,
              needsAccommodation: true,
            },
          }),
          transaction.invitationRecipient.findMany({
            where: { workspaceId, revokedAt: null },
            select: { status: true },
          }),
          transaction.guestEventResponse.findMany({
            where: { workspaceId },
            select: { guestId: true, weddingEventId: true, attendance: true },
          }),
          transaction.guestMenuSelection.findMany({
            where: { workspaceId, active: true },
            select: { guestId: true },
          }),
          transaction.allergyIssue.count({
            where: { workspaceId, status: { not: "RESOLVED" } },
          }),
          transaction.onboardingDraft.findUnique({
            where: { workspaceId },
            select: { guests: true, budget: true },
          }),
          transaction.rsvpFormDefinition.findUnique({ where: { workspaceId } }),
          transaction.invitationSite.findUnique({ where: { workspaceId } }),
          transaction.campaign.findMany({
            where: { workspaceId },
            select: { status: true },
          }),
        ]);
        const formVersionId =
          rsvpDefinition?.publishedVersionId ?? rsvpDefinition?.currentDraftId;
        const formVersion = formVersionId
          ? await transaction.rsvpFormVersion.findUnique({
              where: { id: formVersionId },
            })
          : null;
        const formConfig = record(formVersion?.config);
        const respondedIds = new Set(
          responses
            .filter((response) => response.attendance !== "NO_RESPONSE")
            .map((response) => response.guestId),
        );
        const confirmedIds = new Set(
          responses
            .filter((response) => response.attendance === "CONFIRMED")
            .map((response) => response.guestId),
        );
        const declinedIds = new Set(
          responses
            .filter((response) => response.attendance === "DECLINED")
            .map((response) => response.guestId),
        );
        const selectedIds = new Set(
          selections.map((selection) => selection.guestId),
        );
        const onboardingGuests = record(onboarding?.guests);
        const estimatedValue = Number(onboardingGuests.guestCount);
        const onboardingBudget = record(onboarding?.budget);
        const onboardingProjection =
          onboardingBudgetProjection(onboardingBudget);
        const onboardingTargetMinor = onboardingProjection.targetTotalMinor;
        const guestCrm = {
          estimatedGuests:
            Number.isFinite(estimatedValue) && estimatedValue >= 0
              ? Math.round(estimatedValue)
              : null,
          activeGuests: guestRows.length,
          invited: recipients.filter((recipient) =>
            [
              "QUEUED",
              "SENT",
              "OPENED",
              "PARTIALLY_RESPONDED",
              "RESPONDED",
            ].includes(recipient.status),
          ).length,
          opened: recipients.filter((recipient) =>
            ["OPENED", "PARTIALLY_RESPONDED", "RESPONDED"].includes(
              recipient.status,
            ),
          ).length,
          confirmed: confirmedIds.size,
          declined: declinedIds.size,
          noResponse: Math.max(0, guestRows.length - respondedIds.size),
          rsvpDeadline:
            typeof formConfig.deadline === "string"
              ? new Date(formConfig.deadline).toISOString()
              : null,
          menuIncomplete: Math.max(
            0,
            confirmedIds.size -
              [...confirmedIds].filter((id) => selectedIds.has(id)).length,
          ),
          allergyIssues,
          transportRequests: guestRows.filter((guest) => guest.needsTransport)
            .length,
          accommodationRequests: guestRows.filter(
            (guest) => guest.needsAccommodation,
          ).length,
        };
        const [
          seatingPlans,
          seatingAssignments,
          seatingIssues,
          transportRequests,
          transportRoutes,
          transportVehicles,
          transportAssignments,
          transportIssues,
          accommodationRequests,
          accommodationRooms,
          accommodationAllocations,
          accommodationIssues,
        ] = await Promise.all([
          transaction.seatingPlan.findMany({
            where: { workspaceId, deletedAt: null },
            select: { id: true, weddingEventId: true },
          }),
          transaction.guestSeatingAssignment.findMany({
            where: { workspaceId, status: { in: ["ACTIVE", "CONFLICT"] } },
            select: { guestId: true },
          }),
          transaction.seatingIssue.count({
            where: { workspaceId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          }),
          transaction.transportRequest.count({
            where: {
              workspaceId,
              requested: true,
              status: { notIn: ["DECLINED", "CANCELLED"] },
            },
          }),
          transaction.transportRoute.findMany({
            where: { workspaceId, deletedAt: null },
            select: { id: true, vehicleId: true, capacityOverride: true },
          }),
          transaction.transportVehicle.findMany({
            where: { workspaceId, deletedAt: null, status: "ACTIVE" },
            select: { id: true, capacity: true },
          }),
          transaction.guestTransportAssignment.findMany({
            where: { workspaceId, status: { in: ["ASSIGNED", "CONFIRMED"] } },
            select: { guestId: true, routeId: true, seatCount: true },
          }),
          transaction.transportIssue.count({
            where: { workspaceId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          }),
          transaction.accommodationRequest.count({
            where: {
              workspaceId,
              requested: true,
              status: { notIn: ["DECLINED", "CANCELLED"] },
            },
          }),
          transaction.accommodationRoom.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              status: { not: "UNAVAILABLE" },
            },
            select: { id: true, capacityAdults: true, capacityChildren: true },
          }),
          transaction.accommodationAllocation.findMany({
            where: {
              workspaceId,
              status: { in: ["ASSIGNED", "CONFIRMED", "CHECKED_IN"] },
            },
            select: { guestId: true },
          }),
          transaction.accommodationIssue.count({
            where: { workspaceId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
          }),
        ]);
        const eligibleIds = new Set(
          responses
            .filter((response) =>
              seatingPlans.some(
                (plan) =>
                  plan.weddingEventId === response.weddingEventId &&
                  response.attendance === "CONFIRMED",
              ),
            )
            .map((response) => response.guestId),
        );
        const seatedIds = new Set(
          seatingAssignments
            .map((assignment) => assignment.guestId)
            .filter((guestId) => eligibleIds.has(guestId)),
        );
        const vehicleCapacity = new Map(
          transportVehicles.map((vehicle) => [vehicle.id, vehicle.capacity]),
        );
        const transportCapacity = transportRoutes.reduce(
          (sum, route) =>
            sum +
            (route.capacityOverride ??
              (route.vehicleId
                ? (vehicleCapacity.get(route.vehicleId) ?? 0)
                : 0)),
          0,
        );
        const transportSeatsUsed = transportAssignments.reduce(
          (sum, assignment) => sum + assignment.seatCount,
          0,
        );
        const accommodationCapacity = accommodationRooms.reduce(
          (sum, room) => sum + room.capacityAdults + room.capacityChildren,
          0,
        );
        const operations = {
          seating: {
            plans: seatingPlans.length,
            eligibleGuests: eligibleIds.size,
            assignedGuests: seatedIds.size,
            unassignedGuests: Math.max(0, eligibleIds.size - seatedIds.size),
            openIssues: seatingIssues,
          },
          transport: {
            requests: transportRequests,
            assignedGuests: new Set(
              transportAssignments.map((assignment) => assignment.guestId),
            ).size,
            routes: transportRoutes.length,
            seatsAvailable: Math.max(0, transportCapacity - transportSeatsUsed),
            openIssues: transportIssues,
          },
          accommodation: {
            requests: accommodationRequests,
            assignedGuests: new Set(
              accommodationAllocations.map((allocation) => allocation.guestId),
            ).size,
            rooms: accommodationRooms.length,
            bedsAvailable: Math.max(
              0,
              accommodationCapacity - accommodationAllocations.length,
            ),
            openIssues: accommodationIssues,
          },
        };
        const [
          budgetPlan,
          budgetItems,
          paymentSchedules,
          payments,
          rfqCounts,
          offerCounts,
          bookingCounts,
          contractCounts,
        ] = await Promise.all([
          transaction.budgetPlan.findUnique({ where: { workspaceId } }),
          transaction.budgetItem.findMany({
            where: { workspaceId, deletedAt: null },
            select: {
              estimatedMinor: true,
              committedMinor: true,
              paidMinor: true,
            },
          }),
          transaction.paymentScheduleEntry.findMany({
            where: { workspaceId, deletedAt: null },
            select: { id: true, name: true, status: true, dueAt: true },
          }),
          transaction.paymentRecord.findMany({
            where: { workspaceId, status: { in: ["RECORDED", "CONFIRMED"] } },
            select: { amountMinor: true, status: true },
          }),
          transaction.requestForQuote.groupBy({
            by: ["status"],
            where: { workspaceId, deletedAt: null },
            _count: { _all: true },
          }),
          transaction.vendorOffer.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.vendorBooking.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.vendorContract.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
        ]);
        const safeMinor = (value: bigint) => {
          const number = Number(value);
          if (!Number.isSafeInteger(number))
            throw new RangeError("MONEY_OVERFLOW");
          return number;
        };
        const total = (values: bigint[]) =>
          safeMinor(values.reduce((sum, value) => sum + value, 0n));
        const overduePayments = paymentSchedules.filter(
          (entry) =>
            entry.dueAt < now && !["PAID", "CANCELLED"].includes(entry.status),
        );
        const commercial = {
          currency: budgetPlan?.currency ?? onboardingProjection.currency,
          budget: {
            configured: Boolean(budgetPlan),
            targetTotalMinor: budgetPlan
              ? safeMinor(budgetPlan.targetTotalMinor)
              : onboardingTargetMinor,
            estimatedMinor: total(
              budgetItems.map((item) => item.estimatedMinor),
            ),
            committedMinor: total(
              budgetItems.map((item) => item.committedMinor ?? 0n),
            ),
            paidMinor: total(budgetItems.map((item) => item.paidMinor)),
          },
          payments: {
            scheduled: paymentSchedules.length,
            overdue: overduePayments.length,
            recordedMinor: total(
              payments.map((payment) => payment.amountMinor),
            ),
          },
          procurement: {
            rfqs: Object.fromEntries(
              rfqCounts.map((row) => [lower(row.status), row._count._all]),
            ),
            offers: Object.fromEntries(
              offerCounts.map((row) => [lower(row.status), row._count._all]),
            ),
            bookings: Object.fromEntries(
              bookingCounts.map((row) => [lower(row.status), row._count._all]),
            ),
            contracts: Object.fromEntries(
              contractCounts.map((row) => [lower(row.status), row._count._all]),
            ),
          },
        };
        const monthStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        );
        const [
          documentStatuses,
          signatureStatuses,
          openCheckouts,
          onlineTransactions,
          onlineRefunds,
          criticalDocument,
          criticalSignature,
        ] = await Promise.all([
          transaction.vaultDocument.groupBy({
            by: ["status"],
            where: { workspaceId, deletedAt: null },
            _count: { _all: true },
          }),
          transaction.electronicSignatureEnvelope.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.onlinePaymentCheckout.findMany({
            where: { workspaceId, status: "OPEN" },
            orderBy: { expiresAt: "asc" },
          }),
          transaction.onlinePaymentTransaction.findMany({
            where: { workspaceId },
            orderBy: { createdAt: "desc" },
          }),
          transaction.onlinePaymentRefund.findMany({
            where: {
              workspaceId,
              status: { in: ["REQUESTED", "PROCESSING", "FAILED"] },
            },
          }),
          transaction.vaultDocument.findFirst({
            where: { workspaceId, status: "QUARANTINED", deletedAt: null },
            orderBy: { updatedAt: "desc" },
          }),
          transaction.electronicSignatureEnvelope.findFirst({
            where: {
              workspaceId,
              status: {
                in: ["DECLINED", "SENT", "VIEWED", "PARTIALLY_SIGNED"],
              },
            },
            orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
          }),
        ]);
        const documentCount = (status: string) =>
          documentStatuses.find((row) => row.status === status)?._count._all ??
          0;
        const signatureCount = (statuses: string[]) =>
          signatureStatuses
            .filter((row) => statuses.includes(row.status))
            .reduce((sum, row) => sum + row._count._all, 0);
        const documentsAndPayments = {
          documents: {
            processing: documentCount("PROCESSING"),
            quarantined: documentCount("QUARANTINED"),
            contractsAwaitingSignature: signatureCount(["READY"]),
            signatureEnvelopesInProgress: signatureCount([
              "SENT",
              "VIEWED",
              "PARTIALLY_SIGNED",
            ]),
            signatureEnvelopesFailed: signatureCount([
              "DECLINED",
              "EXPIRED",
              "FAILED",
            ]),
          },
          onlinePayments: {
            openCheckouts: openCheckouts.length,
            capturedThisMonthMinor: total(
              onlineTransactions
                .filter(
                  (item) =>
                    item.status === "CAPTURED" &&
                    item.capturedAt &&
                    item.capturedAt >= monthStart,
                )
                .map((item) => item.amountCapturedMinor),
            ),
            failedPayments: onlineTransactions.filter(
              (item) => item.status === "FAILED",
            ).length,
            refundsProcessingMinor: total(
              onlineRefunds
                .filter((item) =>
                  ["REQUESTED", "PROCESSING"].includes(item.status),
                )
                .map((item) => item.amountMinor),
            ),
            disputedPayments: onlineTransactions.filter(
              (item) => item.status === "DISPUTED",
            ).length,
            currency:
              budgetPlan?.currency ?? onlineTransactions[0]?.currency ?? "RON",
          },
        };
        const [
          weddingDayPlan,
          runOfShowCounts,
          openIncidents,
          checkInSession,
          checkInRows,
          announcementCounts,
          guestMomentCounts,
          criticalIncident,
          criticalBlockedItem,
          delayedItem,
        ] = await Promise.all([
          transaction.weddingDayPlan.findFirst({
            where: { workspaceId, status: { not: "ARCHIVED" } },
            orderBy: { updatedAt: "desc" },
          }),
          transaction.runOfShowItem.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.weddingDayIncident.groupBy({
            by: ["status", "severity"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.guestCheckInSession.findFirst({
            where: { workspaceId, status: { in: ["READY", "OPEN", "PAUSED"] } },
            orderBy: { updatedAt: "desc" },
          }),
          transaction.guestCheckIn.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.weddingDayAnnouncement.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.guestMoment.groupBy({
            by: ["status"],
            where: { workspaceId },
            _count: { _all: true },
          }),
          transaction.weddingDayIncident.findFirst({
            where: {
              workspaceId,
              severity: "CRITICAL",
              status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED"] },
            },
            orderBy: { startedAt: "asc" },
          }),
          transaction.runOfShowItem.findFirst({
            where: { workspaceId, isCritical: true, status: "BLOCKED" },
            orderBy: { plannedStartAt: "asc" },
          }),
          transaction.runOfShowItem.findFirst({
            where: {
              workspaceId,
              status: "DELAYED",
              type: { in: ["CEREMONY", "MEAL_SERVICE", "ENTERTAINMENT"] },
            },
            orderBy: { plannedStartAt: "asc" },
          }),
        ]);
        const countRun = (status: string) =>
          runOfShowCounts.find((row) => row.status === status)?._count._all ??
          0;
        const countCheckIn = (status: string) =>
          checkInRows.find((row) => row.status === status)?._count._all ?? 0;
        const countAnnouncement = (status: string) =>
          announcementCounts.find((row) => row.status === status)?._count
            ._all ?? 0;
        const countMoment = (statuses: string[]) =>
          guestMomentCounts
            .filter((row) => statuses.includes(row.status))
            .reduce((sum, row) => sum + row._count._all, 0);
        const expectedCheckIn = checkInSession
          ? await transaction.guest.count({
              where: { workspaceId, status: "ACTIVE", deletedAt: null },
            })
          : 0;
        const weddingDay = {
          planId: weddingDayPlan?.id ?? null,
          status: weddingDayPlan?.status ?? null,
          momentsCompleted: countRun("COMPLETED"),
          momentsDelayed: countRun("DELAYED"),
          criticalBlockedMoments: runOfShowCounts.length
            ? await transaction.runOfShowItem.count({
                where: { workspaceId, status: "BLOCKED", isCritical: true },
              })
            : 0,
          openIncidents: openIncidents
            .filter(
              (row) =>
                !["RESOLVED", "CLOSED", "CANCELLED"].includes(row.status),
            )
            .reduce((sum, row) => sum + row._count._all, 0),
          criticalIncidents: openIncidents
            .filter(
              (row) =>
                row.severity === "CRITICAL" &&
                !["RESOLVED", "CLOSED", "CANCELLED"].includes(row.status),
            )
            .reduce((sum, row) => sum + row._count._all, 0),
          checkedInGuests: countCheckIn("CHECKED_IN"),
          expectedGuests: expectedCheckIn,
          notArrivedGuests: Math.max(
            0,
            expectedCheckIn -
              countCheckIn("CHECKED_IN") -
              countCheckIn("CHECKED_OUT"),
          ),
          deniedGuests: countCheckIn("DENIED"),
          activeAnnouncements: countAnnouncement("PUBLISHED"),
          pendingMediaModeration: countMoment(["PROCESSING", "PENDING_REVIEW"]),
        };
        const weddingDayAction = criticalIncident
          ? {
              type: "wedding_day_critical_incident",
              title: `Gestionează incidentul critic: ${criticalIncident.title}`,
              reason: "Un incident critic este încă deschis în Command Center.",
              impact:
                "Rezolvarea incidentului are prioritate peste restul operațiunilor.",
              href: `/event-day?incident=${criticalIncident.id}`,
              priority: "urgent" as const,
            }
          : criticalBlockedItem
            ? {
                type: "wedding_day_blocked_item",
                title: `Deblochează momentul critic: ${criticalBlockedItem.title}`,
                reason: "Un moment critic din Run of Show este blocat.",
                impact: "Poate întârzia momentele dependente ale zilei.",
                href: `/event-day?item=${criticalBlockedItem.id}`,
                priority: "urgent" as const,
              }
            : delayedItem
              ? {
                  type: "wedding_day_delay",
                  title: `Recuperează întârzierea: ${delayedItem.title}`,
                  reason: "Un moment principal este marcat cu întârziere.",
                  impact: "Actualizează echipa și invitații eligibili.",
                  href: `/event-day?item=${delayedItem.id}`,
                  priority: "urgent" as const,
                }
              : null;
        const secureAction = criticalDocument
          ? {
              type: "document_quarantined",
              title: `Verifică documentul blocat: ${criticalDocument.title}`,
              reason:
                "Verificarea de securitate a mutat documentul în carantină.",
              impact:
                "Documentul nu poate fi descărcat sau distribuit până la rezolvare.",
              href: "/documents",
              priority: "urgent" as const,
            }
          : criticalSignature?.status === "DECLINED"
            ? {
                type: "signature_declined",
                title: "Revizuiește semnătura refuzată",
                reason: "Un semnatar a refuzat envelope-ul electronic.",
                impact: "Contractul nu este semnat electronic.",
                href: "/contracts",
                priority: "urgent" as const,
              }
            : criticalSignature
              ? {
                  type: "signature_waiting",
                  title: "Urmărește semnăturile contractului",
                  reason: `Envelope-ul este ${criticalSignature.status.toLowerCase()}.`,
                  impact: "Contractul rămâne în așteptarea ambelor părți.",
                  href: "/contracts",
                  priority: "high" as const,
                }
              : onlineTransactions.find((item) => item.status === "DISPUTED")
                ? {
                    type: "payment_disputed",
                    title: "Verifică plata contestată",
                    reason: "Providerul a raportat un litigiu pentru plată.",
                    impact:
                      "Verifică dashboard-ul providerului; ledgerul nu este rescris automat.",
                    href: "/payments",
                    priority: "urgent" as const,
                  }
                : onlineTransactions.find((item) => item.status === "FAILED")
                  ? {
                      type: "payment_failed",
                      title: "Reîncearcă plata eșuată",
                      reason: "Providerul nu a confirmat plata.",
                      impact: "Bugetul și ledgerul au rămas nemodificate.",
                      href: "/payments",
                      priority: "high" as const,
                    }
                  : openCheckouts.find(
                        (item) =>
                          item.expiresAt <=
                          new Date(now.getTime() + 60 * 60_000),
                      )
                    ? {
                        type: "checkout_expiring",
                        title: "Finalizează sau reînnoiește checkout-ul",
                        reason: "Checkout-ul expiră în mai puțin de o oră.",
                        impact: "După expirare este necesar un checkout nou.",
                        href: "/payments",
                        priority: "high" as const,
                      }
                    : null;
        const planningAction = nextBestAction(
          tasks,
          await transaction.taskDependency.findMany({ where: { workspaceId } }),
          milestones,
        );
        const commercialAction = planningAction
          ? null
          : overduePayments[0]
            ? {
                type: "payment_overdue",
                title: `Verifică plata: ${overduePayments[0].name}`,
                reason: "O plată programată a depășit termenul.",
                impact:
                  "Actualizează evidența financiară și relația cu furnizorul.",
                href: "/payments",
                priority: "urgent" as const,
              }
            : null;
        const operationsAction =
          planningAction || commercialAction
            ? null
            : operations.seating.openIssues > 0
              ? {
                  type: "seating_issue",
                  title: "Revizuiește problemele planului de mese",
                  reason: `${operations.seating.openIssues} probleme de seating necesită verificare.`,
                  impact:
                    "Planul trebuie să rămână valid înainte de publicare.",
                  href: "/seating",
                  priority: "urgent" as const,
                }
              : operations.seating.unassignedGuests > 0
                ? {
                    type: "seating_unassigned",
                    title: "Alocă invitații confirmați la mese",
                    reason: `${operations.seating.unassignedGuests} invitați confirmați nu au încă loc.`,
                    impact: "Finalizează planul de sală înainte de publicare.",
                    href: "/seating",
                    priority: "high" as const,
                  }
                : operations.transport.requests >
                    operations.transport.assignedGuests
                  ? {
                      type: "transport_unassigned",
                      title: "Alocă cererile de transport",
                      reason: "Există cereri RSVP fără rută confirmată.",
                      impact: "Clarifică logistica și capacitatea vehiculelor.",
                      href: "/transport",
                      priority: "high" as const,
                    }
                  : operations.accommodation.requests >
                      operations.accommodation.assignedGuests
                    ? {
                        type: "accommodation_unassigned",
                        title: "Alocă cererile de cazare",
                        reason: "Există cereri RSVP fără cameră confirmată.",
                        impact: "Finalizează rooming list-ul proprietăților.",
                        href: "/accommodation",
                        priority: "high" as const,
                      }
                    : null;
        const guestAction =
          planningAction || commercialAction || operationsAction
            ? null
            : nextGuestAction({
                invitationPublished: invitationSite?.status === "PUBLISHED",
                missingContacts: guestRows.filter(
                  (guest) => !guest.emailNormalized && !guest.phoneE164,
                ).length,
                hasCampaign: campaigns.some((campaign) =>
                  ["QUEUED", "SENDING", "COMPLETED", "PARTIAL"].includes(
                    campaign.status,
                  ),
                ),
                hasDeadline: Boolean(guestCrm.rsvpDeadline),
                noResponse: guestCrm.noResponse,
                menuIncomplete: guestCrm.menuIncomplete,
                allergyIssues,
              });
        const activeRisks = await transaction.risk.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            status: { notIn: ["RESOLVED", "ARCHIVED"] },
          },
          orderBy: [{ score: "desc" }, { dueAt: "asc" }],
          take: 100,
        });
        const [
          openProposals,
          proposalsNeedingApproval,
          failedRuns,
          readyPlans,
          activePlans,
          activeAutomations,
          awaitingAutomationApproval,
          failedAutomationExecutions,
        ] = await Promise.all([
          transaction.copilotProposal.count({
            where: {
              workspaceId,
              status: { in: ["READY_FOR_REVIEW", "APPROVED"] },
            },
          }),
          transaction.copilotProposal.count({
            where: { workspaceId, status: "READY_FOR_REVIEW" },
          }),
          transaction.copilotRun.count({
            where: { workspaceId, status: "FAILED" },
          }),
          transaction.contingencyPlan.count({
            where: { workspaceId, status: "READY" },
          }),
          transaction.contingencyPlan.count({
            where: { workspaceId, status: "ACTIVE" },
          }),
          transaction.automationRule.count({
            where: { workspaceId, status: "ACTIVE" },
          }),
          transaction.automationExecution.count({
            where: { workspaceId, status: "WAITING_APPROVAL" },
          }),
          transaction.automationExecution.count({
            where: { workspaceId, status: { in: ["FAILED", "DEAD_LETTER"] } },
          }),
        ]);
        const criticalRisk = activeRisks.find(
          (risk) => risk.level === "CRITICAL",
        );
        const criticalRiskWithoutOwner = activeRisks.find(
          (risk) => risk.level === "CRITICAL" && !risk.ownerMembershipId,
        );
        const riskAction = criticalRisk
          ? {
              type: "critical_risk",
              title: `Gestionează riscul critic: ${criticalRisk.title}`,
              reason: criticalRiskWithoutOwner
                ? "Riscul critic nu are încă responsabil."
                : `Scorul de risc este ${criticalRisk.score}/25.`,
              impact:
                "Verifică evaluarea, responsabilul și Planul B înaintea acțiunilor cu prioritate mai mică.",
              href: `/risks/${criticalRisk.id}`,
              priority: "urgent" as const,
            }
          : null;
        return {
          wedding: {
            title: workspace.title,
            date: dateOnly(workspace.eventProfile?.eventDate),
            location: workspace.eventProfile?.location ?? null,
            countdownDays: workspace.eventProfile?.eventDate
              ? Math.ceil(
                  (workspace.eventProfile.eventDate.getTime() -
                    startOfDay(now).getTime()) /
                    86_400_000,
                )
              : null,
          },
          planning: {
            totalTasks: tasks.length,
            completedTasks: completed,
            progressPercent: tasks.length
              ? Math.round((completed / tasks.length) * 100)
              : 0,
            overdueTasks: tasks.filter(isOverdue).length,
            blockedTasks: tasks.filter((task) => task.status === "BLOCKED")
              .length,
            dueThisWeek: tasks.filter(
              (task) =>
                task.dueAt &&
                task.dueAt >= now &&
                task.dueAt <= week &&
                task.status !== "COMPLETED",
            ).length,
          },
          nextBestAction:
            riskAction ??
            weddingDayAction ??
            secureAction ??
            planningAction ??
            commercialAction ??
            operationsAction ??
            guestAction,
          urgentTasks: urgent,
          upcomingDates: upcoming.items.slice(0, 8),
          phases: phases.map(mapPhase),
          recentActivity: activity.map((item) => ({
            id: item.id,
            action: item.action,
            summary: item.summary,
            occurredAt: item.occurredAt.toISOString(),
          })),
          guestCrm,
          operations,
          commercial,
          ...documentsAndPayments,
          weddingDay,
          risks: {
            active: activeRisks.length,
            critical: activeRisks.filter((risk) => risk.level === "CRITICAL")
              .length,
            high: activeRisks.filter((risk) => risk.level === "HIGH").length,
            top: activeRisks.slice(0, 3).map((risk) => ({
              id: risk.id,
              title: risk.title,
              score: risk.score,
              level: lower(risk.level),
            })),
            triggered: activeRisks.filter((risk) => risk.source === "DETECTED")
              .length,
            withoutOwner: activeRisks.filter((risk) => !risk.ownerMembershipId)
              .length,
          },
          intelligence: {
            copilot: {
              openProposals,
              proposalsNeedingApproval,
              failedRuns,
            },
            risks: {
              totalOpen: activeRisks.length,
              high: activeRisks.filter((risk) => risk.level === "HIGH").length,
              critical: activeRisks.filter((risk) => risk.level === "CRITICAL")
                .length,
              triggered: activeRisks.filter(
                (risk) => risk.source === "DETECTED",
              ).length,
              withoutOwner: activeRisks.filter(
                (risk) => !risk.ownerMembershipId,
              ).length,
            },
            contingency: {
              readyPlans,
              activePlans,
              recommendedActivations: readyPlans,
            },
            automations: {
              active: activeAutomations,
              awaitingApproval: awaitingAutomationApproval,
              failedExecutions: failedAutomationExecutions,
            },
          },
          unavailableModules: {
            budget: false as const,
            vendors: false as const,
            payments: false as const,
            risks: false as const,
          },
        };
      },
    );
  }

  async search(userId: string, workspaceId: string, query: string) {
    return this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const q = query.trim().slice(0, 120);
        if (q.length < 2) return { items: shortcuts(q) };
        const [
          tasks,
          milestones,
          phases,
          events,
          memberships,
          guests,
          households,
          campaigns,
          invitationSites,
          menus,
          allergyIssues,
          seatingPlans,
          seatingTables,
          transportRoutes,
          transportStops,
          accommodationProperties,
          accommodationRooms,
        ] = await Promise.all([
          transaction.task.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 15,
          }),
          transaction.timelineMilestone.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              title: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.planningPhase.findMany({
            where: {
              workspaceId,
              title: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.calendarEvent.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              title: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.workspaceMembership.findMany({
            where: {
              workspaceId,
              status: "ACTIVE",
              user: {
                profile: {
                  is: {
                    OR: [
                      { firstName: { contains: q, mode: "insensitive" } },
                      { lastName: { contains: q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            },
            include: { user: { include: { profile: true } } },
            take: 10,
          }),
          transaction.guest.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              status: "ACTIVE",
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { displayName: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 15,
          }),
          transaction.household.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.campaign.findMany({
            where: {
              workspaceId,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.invitationSite.findMany({
            where: {
              workspaceId,
              slug: { contains: q, mode: "insensitive" },
            },
            take: 5,
          }),
          transaction.menu.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.allergyIssue.findMany({
            where: {
              workspaceId,
              status: { not: "RESOLVED" },
            },
            take: 50,
          }),
          transaction.seatingPlan.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.seatingTable.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { label: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.transportRoute.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.transportStop.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.accommodationProperty.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.accommodationRoom.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
        ]);
        const [vendors, rfqs, bookings, budgetItems, schedules] =
          await Promise.all([
            transaction.vendorProfile.findMany({
              where: {
                publicationStatus: "PUBLISHED",
                OR: [
                  { headline: { contains: q, mode: "insensitive" } },
                  { shortDescription: { contains: q, mode: "insensitive" } },
                  { slug: { contains: q, mode: "insensitive" } },
                ],
              },
              take: 10,
            }),
            transaction.requestForQuote.findMany({
              where: {
                workspaceId,
                deletedAt: null,
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                ],
              },
              take: 10,
            }),
            transaction.vendorBooking.findMany({
              where: {
                workspaceId,
                title: { contains: q, mode: "insensitive" },
              },
              take: 10,
            }),
            transaction.budgetItem.findMany({
              where: {
                workspaceId,
                deletedAt: null,
                name: { contains: q, mode: "insensitive" },
              },
              take: 10,
            }),
            transaction.paymentScheduleEntry.findMany({
              where: {
                workspaceId,
                deletedAt: null,
                name: { contains: q, mode: "insensitive" },
              },
              take: 10,
            }),
          ]);
        const workspaceReviews = await transaction.vendorReview.findMany({
          where: { workspaceId },
          select: { id: true, status: true },
        });
        const reviews = workspaceReviews.length
          ? await transaction.vendorReviewVersion.findMany({
              where: {
                reviewId: { in: workspaceReviews.map((review) => review.id) },
                OR: [
                  { title: { contains: q, mode: "insensitive" } },
                  { body: { contains: q, mode: "insensitive" } },
                ],
              },
              orderBy: [{ reviewId: "asc" }, { versionNumber: "desc" }],
              distinct: ["reviewId"],
              take: 10,
            })
          : [];
        const reviewStatuses = new Map(
          workspaceReviews.map((review) => [review.id, review.status]),
        );
        const [offers, contracts] = await Promise.all([
          transaction.vendorOffer.findMany({
            where: { workspaceId, rfqId: { in: rfqs.map((rfq) => rfq.id) } },
            take: 10,
          }),
          transaction.vendorContract.findMany({
            where: {
              workspaceId,
              bookingId: { in: bookings.map((booking) => booking.id) },
            },
            take: 10,
          }),
        ]);
        const bookingTitles = new Map(
          bookings.map((booking) => [booking.id, booking.title]),
        );
        const [
          weddingDayPlans,
          runOfShowItems,
          checklistItems,
          incidents,
          decisions,
          announcements,
          checkInSessions,
          guestMoments,
          galleries,
        ] = await Promise.all([
          transaction.weddingDayPlan.findMany({
            where: {
              workspaceId,
              name: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.runOfShowItem.findMany({
            where: {
              workspaceId,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { locationName: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.weddingDayChecklistItem.findMany({
            where: { workspaceId, title: { contains: q, mode: "insensitive" } },
            take: 10,
          }),
          transaction.weddingDayIncident.findMany({
            where: { workspaceId, title: { contains: q, mode: "insensitive" } },
            take: 10,
          }),
          transaction.weddingDayDecision.findMany({
            where: { workspaceId, title: { contains: q, mode: "insensitive" } },
            take: 10,
          }),
          transaction.weddingDayAnnouncement.findMany({
            where: { workspaceId, title: { contains: q, mode: "insensitive" } },
            take: 10,
          }),
          transaction.guestCheckInSession.findMany({
            where: { workspaceId, name: { contains: q, mode: "insensitive" } },
            take: 10,
          }),
          transaction.guestMoment.findMany({
            where: {
              workspaceId,
              caption: { contains: q, mode: "insensitive" },
              status: { not: "DELETED" },
            },
            take: 10,
          }),
          transaction.galleryCollection.findMany({
            where: { workspaceId, name: { contains: q, mode: "insensitive" } },
            take: 10,
          }),
        ]);
        const [
          risks,
          contingencyPlans,
          automationRules,
          copilotConversations,
          copilotProposals,
          mitigations,
        ] = await Promise.all([
          transaction.risk.findMany({
            where: {
              workspaceId,
              deletedAt: null,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.contingencyPlan.findMany({
            where: {
              workspaceId,
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { summary: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.automationRule.findMany({
            where: {
              workspaceId,
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            },
            take: 10,
          }),
          transaction.copilotConversation.findMany({
            where: {
              workspaceId,
              status: "ACTIVE",
              title: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.copilotProposal.findMany({
            where: {
              workspaceId,
              title: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
          transaction.riskMitigationAction.findMany({
            where: {
              workspaceId,
              title: { contains: q, mode: "insensitive" },
            },
            take: 10,
          }),
        ]);
        return {
          items: [
            ...copilotConversations.map((item) => ({
              id: item.id,
              type: "copilot_conversation" as const,
              title: item.title,
              subtitle: "Conversație Copilot",
              href: `/overview?copilotConversation=${item.id}`,
            })),
            ...copilotProposals.map((item) => ({
              id: item.id,
              type: "copilot_proposal" as const,
              title: item.title,
              subtitle: `Propunere Copilot · ${lower(item.status)}`,
              href: `/overview?copilotProposal=${item.id}`,
            })),
            ...mitigations.map((item) => ({
              id: item.id,
              type: "risk_mitigation" as const,
              title: item.title,
              subtitle: `Atenuare risc · ${lower(item.status)}`,
              href: `/risks/${item.riskId}`,
            })),
            ...risks.map((item) => ({
              id: item.id,
              type: "risk" as const,
              title: item.title,
              subtitle: `Risc · ${lower(item.level)} · scor ${item.score}`,
              href: `/risks/${item.id}`,
            })),
            ...contingencyPlans.map((item) => ({
              id: item.id,
              type: "contingency_plan" as const,
              title: item.title,
              subtitle: `Plan B · ${lower(item.status)}`,
              href: `/contingency-plans/${item.id}`,
            })),
            ...automationRules.map((item) => ({
              id: item.id,
              type: "automation_rule" as const,
              title: item.name,
              subtitle: `Automatizare · ${lower(item.status)}`,
              href: `/automations?rule=${item.id}`,
            })),
            ...weddingDayPlans.map((item) => ({
              id: item.id,
              type: "wedding_day_plan" as const,
              title: item.name,
              subtitle: `Wedding Day · ${lower(item.status)}`,
              href: `/event-day?plan=${item.id}`,
            })),
            ...runOfShowItems.map((item) => ({
              id: item.id,
              type: "run_of_show_item" as const,
              title: item.title,
              subtitle: `Run of Show · ${lower(item.status)}`,
              href: `/event-day?item=${item.id}`,
            })),
            ...checklistItems.map((item) => ({
              id: item.id,
              type: "wedding_day_checklist_item" as const,
              title: item.title,
              subtitle: `Checklist · ${lower(item.status)}`,
              href: `/event-day?checklistItem=${item.id}`,
            })),
            ...incidents.map((item) => ({
              id: item.id,
              type: "wedding_day_incident" as const,
              title: item.title,
              subtitle: `Incident · ${lower(item.status)}`,
              href: `/event-day?incident=${item.id}`,
            })),
            ...decisions.map((item) => ({
              id: item.id,
              type: "wedding_day_decision" as const,
              title: item.title,
              subtitle: "Decizie operațională",
              href: `/event-day?decision=${item.id}`,
            })),
            ...announcements.map((item) => ({
              id: item.id,
              type: "wedding_day_announcement" as const,
              title: item.title,
              subtitle: `Anunț · ${lower(item.status)}`,
              href: `/event-day?announcement=${item.id}`,
            })),
            ...checkInSessions.map((item) => ({
              id: item.id,
              type: "check_in_session" as const,
              title: item.name,
              subtitle: `Check-in · ${lower(item.status)}`,
              href: `/event-day?checkInSession=${item.id}`,
            })),
            ...guestMoments.map((item) => ({
              id: item.id,
              type: "guest_moment" as const,
              title: item.caption || "Guest Moment",
              subtitle: `Media · ${lower(item.status)}`,
              href: `/moments?moment=${item.id}`,
            })),
            ...galleries.map((item) => ({
              id: item.id,
              type: "gallery" as const,
              title: item.name,
              subtitle: `Galerie · ${lower(item.status)}`,
              href: `/moments?gallery=${item.id}`,
            })),
            ...tasks.map((task) => ({
              id: task.id,
              type: "task" as const,
              title: task.title,
              subtitle: task.status.toLowerCase(),
              href: `/plan?task=${task.id}`,
            })),
            ...milestones.map((item) => ({
              id: item.id,
              type: "milestone" as const,
              title: item.title,
              subtitle: "Milestone",
              href: `/timeline?milestone=${item.id}`,
            })),
            ...phases.map((item) => ({
              id: item.id,
              type: "phase" as const,
              title: item.title,
              subtitle: "Fază",
              href: `/timeline?phase=${item.id}`,
            })),
            ...events.map((item) => ({
              id: item.id,
              type: "calendar_event" as const,
              title: item.title,
              subtitle: item.eventType,
              href: `/calendar?event=${item.id}`,
            })),
            ...memberships.map((item) => ({
              id: item.id,
              type: "member" as const,
              title:
                `${item.user.profile?.firstName ?? ""} ${item.user.profile?.lastName ?? ""}`.trim() ||
                item.user.email,
              subtitle: "Membru",
              href: "/team",
            })),
            ...vendors.map((vendor) => ({
              id: vendor.vendorOrganizationId,
              type: "vendor" as const,
              title: vendor.headline,
              subtitle: vendor.categories.map(lower).join(", "),
              href: `/marketplace/${vendor.slug}`,
            })),
            ...rfqs.map((rfq) => ({
              id: rfq.id,
              type: "rfq" as const,
              title: rfq.title,
              subtitle: `Cerere · ${lower(rfq.status)}`,
              href: `/requests?rfq=${rfq.id}`,
            })),
            ...offers.map((offer) => ({
              id: offer.id,
              type: "offer" as const,
              title: `Ofertă ${offer.currency} ${Number(offer.totalMinor) / 100}`,
              subtitle: lower(offer.status),
              href: `/offers?offer=${offer.id}`,
            })),
            ...bookings.map((booking) => ({
              id: booking.id,
              type: "booking" as const,
              title: booking.title,
              subtitle: lower(booking.status),
              href: `/bookings?booking=${booking.id}`,
            })),
            ...contracts.map((contract) => ({
              id: contract.id,
              type: "contract" as const,
              title:
                bookingTitles.get(contract.bookingId) ?? "Contract furnizor",
              subtitle: `Contract · ${lower(contract.status)}`,
              href: `/contracts?contract=${contract.id}`,
            })),
            ...budgetItems.map((item) => ({
              id: item.id,
              type: "budget_item" as const,
              title: item.name,
              subtitle: `Buget · ${lower(item.status)}`,
              href: `/budget?item=${item.id}`,
            })),
            ...schedules.map((entry) => ({
              id: entry.id,
              type: "payment_schedule" as const,
              title: entry.name,
              subtitle: `Plată · ${lower(entry.status)}`,
              href: `/payments?schedule=${entry.id}`,
            })),
            ...reviews.map((version) => ({
              id: version.reviewId,
              type: "review" as const,
              title: version.title,
              subtitle: `Recenzie · ${lower(reviewStatuses.get(version.reviewId) ?? "draft")}`,
              href: `/reviews?review=${version.reviewId}`,
            })),
            ...guests.map((guest) => ({
              id: guest.id,
              type: "guest" as const,
              title:
                guest.displayName ??
                `${guest.firstName} ${guest.lastName}`.trim(),
              subtitle: "Invitat",
              href: `/guests?guest=${guest.id}`,
            })),
            ...households.map((household) => ({
              id: household.id,
              type: "household" as const,
              title: household.name,
              subtitle: "Gospodărie",
              href: `/guests?household=${household.id}`,
            })),
            ...campaigns.map((campaign) => ({
              id: campaign.id,
              type: "campaign" as const,
              title: campaign.name,
              subtitle: `Campanie · ${lower(campaign.status)}`,
              href: `/invitations?campaign=${campaign.id}`,
            })),
            ...invitationSites.map((site) => ({
              id: site.id,
              type: "invitation" as const,
              title: site.slug,
              subtitle: `Invitație · ${lower(site.status)}`,
              href: "/invitations/editor",
            })),
            ...menus.map((menu) => ({
              id: menu.id,
              type: "menu" as const,
              title: menu.name,
              subtitle: `Meniu · ${lower(menu.status)}`,
              href: `/menus?menu=${menu.id}`,
            })),
            ...allergyIssues
              .filter((issue) =>
                guests.some((guest) => guest.id === issue.guestId),
              )
              .slice(0, 10)
              .map((issue) => {
                const guest = guests.find(
                  (candidate) => candidate.id === issue.guestId,
                );
                return {
                  id: issue.id,
                  type: "allergy_issue" as const,
                  title: guest
                    ? `${guest.firstName} ${guest.lastName}`.trim()
                    : "Alertă de alergie",
                  subtitle: "Alergie de verificat",
                  href: `/menus?allergyIssue=${issue.id}`,
                };
              }),
            ...seatingPlans.map((item) => ({
              id: item.id,
              type: "seating_plan" as const,
              title: item.name,
              subtitle: `Plan de mese · ${lower(item.status)}`,
              href: `/seating?plan=${item.id}`,
            })),
            ...seatingTables.map((item) => ({
              id: item.id,
              type: "seating_table" as const,
              title: item.name,
              subtitle: `Masă ${item.label} · ${item.capacity} locuri`,
              href: `/seating?plan=${item.seatingPlanId}&table=${item.id}`,
            })),
            ...transportRoutes.map((item) => ({
              id: item.id,
              type: "transport_route" as const,
              title: item.name,
              subtitle: `${item.originName} → ${item.destinationName}`,
              href: `/transport?plan=${item.transportPlanId}&route=${item.id}`,
            })),
            ...transportStops.map((item) => ({
              id: item.id,
              type: "transport_stop" as const,
              title: item.name,
              subtitle: item.address,
              href: `/transport?stop=${item.id}`,
            })),
            ...accommodationProperties.map((item) => ({
              id: item.id,
              type: "accommodation_property" as const,
              title: item.name,
              subtitle: `${item.city} · ${lower(item.status)}`,
              href: `/accommodation?property=${item.id}`,
            })),
            ...accommodationRooms.map((item) => ({
              id: item.id,
              type: "accommodation_room" as const,
              title: item.name,
              subtitle: `${item.capacityAdults} adulți · ${item.capacityChildren} copii`,
              href: `/accommodation?property=${item.propertyId}&room=${item.id}`,
            })),
            ...shortcuts(q),
          ].slice(0, 50),
        };
      },
    );
  }

  async exportPlanning(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    filters: Record<string, unknown>,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (transaction) => {
        const replay = await this.idempotencyReplay(
          transaction,
          userId,
          "planning.export",
          idempotencyKey,
          filters,
        );
        if (replay) return replay;
        const exportId = randomUUID();
        const jobId = await this.asyncEvents.record(transaction, {
          eventName: "planning.export_requested.v1",
          aggregateType: "PlanningExport",
          aggregateId: exportId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `planning-export:${workspaceId}:${idempotencyKey}`,
          userVisibleJob: true,
          payload: {
            subject: { exportId },
            planningExport: { requestedByUserId: userId, filters },
            activity: {
              category: "planning",
              action: "planning_export_requested",
              summary: "Exportul CSV al planificării a fost solicitat.",
              entityType: "PlanningExport",
              entityId: exportId,
            },
          },
        });
        if (!jobId) throw new Error("Planning export job was not created");
        const job = await transaction.backgroundJob.findUniqueOrThrow({
          where: { id: jobId },
        });
        const response = mapJob(job);
        await this.saveIdempotency(
          transaction,
          workspaceId,
          userId,
          "planning.export",
          idempotencyKey,
          filters,
          response,
        );
        return response;
      },
    );
  }

  private async planInput(
    transaction: Transaction,
    workspaceId: string,
    draft: {
      id: string;
      version: number;
      couple: Prisma.JsonValue;
      dateEvents: Prisma.JsonValue;
      location: Prisma.JsonValue;
      guests: Prisma.JsonValue;
      budget: Prisma.JsonValue;
      style: Prisma.JsonValue;
      existingProgress: Prisma.JsonValue;
      planningPreferences: Prisma.JsonValue;
    },
  ): Promise<PlanGenerationInput> {
    const workspace = await transaction.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    return {
      workspaceId,
      onboardingDraftId: draft.id,
      onboardingVersion: draft.version,
      timezone: workspace.timezone,
      couple: record(draft.couple),
      dateEvents: record(draft.dateEvents),
      location: record(draft.location),
      guests: record(draft.guests),
      budget: record(draft.budget),
      style: record(draft.style),
      existingProgress: record(draft.existingProgress),
      planningPreferences: record(draft.planningPreferences),
    };
  }

  private async getProposal(
    transaction: Transaction,
    workspaceId: string,
    proposalId: string,
  ) {
    const proposal = await transaction.planProposal.findFirst({
      where: { id: proposalId, workspaceId },
    });
    if (!proposal) notFound("Plan proposal not found");
    const items = await transaction.planProposalItem.findMany({
      where: { proposalId, workspaceId },
      orderBy: { position: "asc" },
    });
    return mapProposal(proposal, items);
  }

  private async proposalConflict(
    transaction: Transaction,
    workspaceId: string,
    proposalId: string,
  ): Promise<never> {
    const current = await transaction.planProposal.findFirst({
      where: { id: proposalId, workspaceId },
    });
    if (!current) notFound("Plan proposal not found");
    versionConflict("Proposal version conflict", current.version);
  }

  private async taskConflict(
    transaction: Transaction,
    workspaceId: string,
    taskId: string,
  ): Promise<never> {
    const current = await transaction.task.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!current) notFound("Task not found");
    versionConflict("Task version conflict", current.version);
  }

  private async milestoneConflict(
    transaction: Transaction,
    workspaceId: string,
    milestoneId: string,
  ): Promise<never> {
    const current = await transaction.timelineMilestone.findFirst({
      where: { id: milestoneId, workspaceId },
    });
    if (!current) notFound("Milestone not found");
    versionConflict("Milestone version conflict", current.version);
  }

  private async calendarConflict(
    transaction: Transaction,
    workspaceId: string,
    eventId: string,
  ): Promise<never> {
    const current = await transaction.calendarEvent.findFirst({
      where: { id: eventId, workspaceId },
    });
    if (!current) notFound("Calendar event not found");
    versionConflict("Calendar event version conflict", current.version);
  }

  private async getTask(
    transaction: Transaction,
    workspaceId: string,
    taskId: string,
  ) {
    const task = await transaction.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });
    if (!task) notFound("Task not found");
    const [resource] = await this.mapTasks(
      transaction,
      [task],
      workspaceId,
      true,
    );
    return resource!;
  }

  private async ensureTask(
    transaction: Transaction,
    workspaceId: string,
    taskId: string,
  ) {
    const task = await transaction.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });
    if (!task) notFound("Task not found");
    return task;
  }

  private async mapTasks(
    transaction: Transaction,
    tasks: Array<Prisma.TaskGetPayload<object>>,
    workspaceId: string,
    detailed = false,
  ) {
    if (!tasks.length) return [];
    const ids = tasks.map((task) => task.id);
    const assigneeIds = tasks
      .map((task) => task.assigneeMembershipId)
      .filter((id): id is string => Boolean(id));
    const [subtasks, dependencies, comments, memberships] = await Promise.all([
      transaction.task.findMany({
        where: { workspaceId, parentTaskId: { in: ids }, deletedAt: null },
      }),
      transaction.taskDependency.findMany({
        where: { workspaceId, taskId: { in: ids } },
      }),
      transaction.taskComment.groupBy({
        by: ["taskId"],
        where: { workspaceId, taskId: { in: ids }, deletedAt: null },
        _count: { _all: true },
      }),
      assigneeIds.length
        ? transaction.workspaceMembership.findMany({
            where: { id: { in: assigneeIds }, workspaceId },
            include: { user: { include: { profile: true } } },
          })
        : Promise.resolve([]),
    ]);
    const dependencyMap = group(dependencies, (entry) => entry.taskId);
    const subtaskMap = group(subtasks, (entry) => entry.parentTaskId ?? "");
    const commentMap = new Map(
      comments.map((entry) => [entry.taskId, entry._count._all]),
    );
    const memberMap = new Map(
      memberships.map((membership) => [
        membership.id,
        `${membership.user.profile?.firstName ?? ""} ${membership.user.profile?.lastName ?? ""}`.trim() ||
          membership.user.email,
      ]),
    );
    const base = (task: Prisma.TaskGetPayload<object>) => ({
      id: task.id,
      parentTaskId: task.parentTaskId,
      phaseId: task.phaseId,
      milestoneId: task.milestoneId,
      title: task.title,
      description: task.description,
      category: task.category,
      status: lower(task.status),
      priority: lower(task.priority),
      startAt: iso(task.startAt),
      dueAt: iso(task.dueAt),
      relativeStartOffsetDays: task.relativeStartOffsetDays,
      relativeDueOffsetDays: task.relativeDueOffsetDays,
      assigneeMembershipId: task.assigneeMembershipId,
      assigneeName: task.assigneeMembershipId
        ? (memberMap.get(task.assigneeMembershipId) ?? null)
        : null,
      blockedReason: task.blockedReason,
      completedAt: iso(task.completedAt),
      estimatedEffortMinutes: task.estimatedEffortMinutes,
      isPrivate: task.isPrivate,
      position: task.position,
      subtaskTotal: subtaskMap.get(task.id)?.length ?? 0,
      subtaskCompleted:
        subtaskMap.get(task.id)?.filter((entry) => entry.status === "COMPLETED")
          .length ?? 0,
      dependencyCount: dependencyMap.get(task.id)?.length ?? 0,
      commentCount: commentMap.get(task.id) ?? 0,
      version: task.version,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    });
    return tasks.map((task) =>
      detailed
        ? {
            ...base(task),
            subtasks: (subtaskMap.get(task.id) ?? []).map(base),
            dependencies: (dependencyMap.get(task.id) ?? []).map(
              (entry) => entry.dependsOnTaskId,
            ),
          }
        : base(task),
    );
  }

  private async validateTaskReferences(
    transaction: Transaction,
    workspaceId: string,
    input: Partial<CreateTask | UpdateTask>,
  ) {
    if (input.phaseId) {
      const phase = await transaction.planningPhase.findFirst({
        where: { id: input.phaseId, workspaceId },
      });
      if (!phase) notFound("Planning phase not found");
    }
    if (input.milestoneId) {
      const milestone = await transaction.timelineMilestone.findFirst({
        where: { id: input.milestoneId, workspaceId, deletedAt: null },
      });
      if (!milestone) notFound("Milestone not found");
    }
    await this.validateMembership(
      transaction,
      workspaceId,
      input.assigneeMembershipId,
    );
  }

  private async validateMembership(
    transaction: Transaction,
    workspaceId: string,
    membershipId: string | null | undefined,
  ) {
    if (!membershipId) return;
    const membership = await transaction.workspaceMembership.findFirst({
      where: { id: membershipId, workspaceId, status: "ACTIVE" },
    });
    if (!membership)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Assignee must be an active workspace membership",
      );
  }

  private async assertSubtask(
    userId: string,
    workspaceId: string,
    taskId: string,
    subtaskId: string,
  ) {
    await this.database.withContext(
      { userId, workspaceId },
      async (transaction) => {
        const subtask = await transaction.task.findFirst({
          where: {
            id: subtaskId,
            workspaceId,
            parentTaskId: taskId,
            deletedAt: null,
          },
        });
        if (!subtask) notFound("Subtask not found");
      },
    );
  }

  private async scheduleReminder(
    transaction: Transaction,
    task: Prisma.TaskGetPayload<object>,
    reminder: {
      scheduledAt: string;
      channel: "in_app" | "email";
      recipientUserId?: string;
    },
    userId: string,
    correlationId: string,
  ) {
    const recipientUserId = reminder.recipientUserId ?? userId;
    const scheduledAt = new Date(reminder.scheduledAt);
    if (scheduledAt <= new Date())
      problem(
        "VALIDATION_FAILED",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Reminder must be scheduled in the future",
      );
    const reminderId = randomUUID();
    const dedupeKey = `task-reminder:${task.id}:v${task.version}:${recipientUserId}:${scheduledAt.toISOString()}:${reminder.channel}`;
    await transaction.taskReminder.create({
      data: {
        id: reminderId,
        workspaceId: task.workspaceId,
        taskId: task.id,
        recipientUserId,
        scheduledAt,
        channel: reminderChannelEnum(reminder.channel),
        taskVersion: task.version,
        dedupeKey,
      },
    });
    await this.asyncEvents.record(transaction, {
      eventName: "task.reminder_scheduled.v1",
      aggregateType: "TaskReminder",
      aggregateId: reminderId,
      workspaceId: task.workspaceId,
      actorUserId: recipientUserId,
      correlationId,
      deduplicationKey: dedupeKey,
      availableAt: scheduledAt,
      payload: {
        subject: { taskId: task.id, taskVersion: task.version },
        reminder: { reminderId },
      },
    });
  }

  private async taskEvent(
    transaction: Transaction,
    input: {
      eventName:
        | "task.created.v1"
        | "task.updated.v1"
        | "task.assigned.v1"
        | "task.status_changed.v1"
        | "task.due_date_changed.v1"
        | "task.deleted.v1";
      task: Prisma.TaskGetPayload<object>;
      userId: string;
      correlationId: string;
      action: string;
      summary: string;
      notify?: boolean;
    },
  ) {
    await this.asyncEvents.record(transaction, {
      eventName: input.eventName,
      aggregateType: "Task",
      aggregateId: input.task.id,
      aggregateVersion: input.task.version,
      workspaceId: input.task.workspaceId,
      actorUserId: input.userId,
      correlationId: input.correlationId,
      deduplicationKey: `${input.eventName}:${input.task.id}:v${input.task.version}`,
      payload: {
        subject: {
          taskId: input.task.id,
          status: lower(input.task.status),
          priority: lower(input.task.priority),
        },
        ...(input.notify
          ? {
              notification: {
                recipientUserId: input.userId,
                module: "planning",
                kind: input.action,
                priority:
                  input.task.priority === "URGENT" ? "urgent" : "normal",
                title: input.summary,
                body: input.task.blockedReason ?? input.task.title,
                actionUrl: `/plan?task=${input.task.id}`,
              },
            }
          : {}),
        activity: {
          category: "planning",
          action: input.action,
          summary: input.summary,
          entityType: "Task",
          entityId: input.task.id,
        },
      },
    });
  }

  private async assignmentEvent(
    transaction: Transaction,
    task: Prisma.TaskGetPayload<object>,
    userId: string,
    correlationId: string,
  ) {
    const membership = await transaction.workspaceMembership.findFirst({
      where: {
        id: task.assigneeMembershipId!,
        workspaceId: task.workspaceId,
        status: "ACTIVE",
      },
    });
    if (!membership) return;
    await this.asyncEvents.record(transaction, {
      eventName: "task.assigned.v1",
      aggregateType: "Task",
      aggregateId: task.id,
      aggregateVersion: task.version,
      workspaceId: task.workspaceId,
      actorUserId: userId,
      correlationId,
      deduplicationKey: `task-assigned:${task.id}:v${task.version}:${membership.id}`,
      payload: {
        subject: { taskId: task.id, membershipId: membership.id },
        notification: {
          recipientUserId: membership.userId,
          module: "planning",
          kind: "task_assigned",
          priority: task.priority === "URGENT" ? "urgent" : "normal",
          title: "Ai primit un task",
          body: task.title,
          actionUrl: `/plan?task=${task.id}`,
        },
        activity: {
          category: "planning",
          action: "task_assigned",
          summary: `Task atribuit: ${task.title}.`,
          entityType: "Task",
          entityId: task.id,
        },
      },
    });
  }

  private async calendarEvent(
    transaction: Transaction,
    event: Prisma.CalendarEventGetPayload<object>,
    userId: string,
    correlationId: string,
    eventName:
      | "calendar.event_created.v1"
      | "calendar.event_updated.v1"
      | "calendar.event_deleted.v1",
    action: string,
    summary: string,
  ) {
    await this.asyncEvents.record(transaction, {
      eventName,
      aggregateType: "CalendarEvent",
      aggregateId: event.id,
      aggregateVersion: event.version,
      workspaceId: event.workspaceId,
      actorUserId: userId,
      correlationId,
      deduplicationKey: `${eventName}:${event.id}:v${event.version}`,
      payload: {
        subject: { eventId: event.id },
        activity: {
          category: "calendar",
          action,
          summary,
          entityType: "CalendarEvent",
          entityId: event.id,
        },
      },
    });
  }

  private async milestoneEvent(
    transaction: Transaction,
    milestone: Prisma.TimelineMilestoneGetPayload<object>,
    userId: string,
    correlationId: string,
    eventName:
      | "timeline.milestone_created.v1"
      | "timeline.milestone_updated.v1"
      | "timeline.milestone_deleted.v1",
    action: string,
  ) {
    await this.asyncEvents.record(transaction, {
      eventName,
      aggregateType: "TimelineMilestone",
      aggregateId: milestone.id,
      aggregateVersion: milestone.version,
      workspaceId: milestone.workspaceId,
      actorUserId: userId,
      correlationId,
      deduplicationKey: `${eventName}:${milestone.id}:v${milestone.version}`,
      payload: {
        subject: { milestoneId: milestone.id, status: lower(milestone.status) },
        activity: {
          category: "timeline",
          action,
          summary: `Milestone: ${milestone.title}.`,
          entityType: "TimelineMilestone",
          entityId: milestone.id,
        },
      },
    });
  }

  private async buildTimeline(transaction: Transaction, workspaceId: string) {
    const [phases, milestones, tasks, dependencies] = await Promise.all([
      transaction.planningPhase.findMany({
        where: { workspaceId },
        orderBy: { position: "asc" },
      }),
      transaction.timelineMilestone.findMany({
        where: { workspaceId, deletedAt: null },
        orderBy: { position: "asc" },
      }),
      transaction.task.findMany({
        where: { workspaceId, deletedAt: null, status: { not: "ARCHIVED" } },
      }),
      transaction.taskDependency.findMany({ where: { workspaceId } }),
    ]);
    const blockingIds = new Set(
      dependencies.map((dependency) => dependency.dependsOnTaskId),
    );
    return {
      phases: phases.map((phase) => {
        const phaseTasks = tasks.filter((task) => task.phaseId === phase.id);
        const completed = phaseTasks.filter(
          (task) => task.status === "COMPLETED",
        ).length;
        return {
          ...mapPhase(phase),
          milestones: milestones
            .filter((milestone) => milestone.phaseId === phase.id)
            .map(mapMilestone),
          taskTotal: phaseTasks.length,
          taskCompleted: completed,
          progressPercent: phaseTasks.length
            ? Math.round((completed / phaseTasks.length) * 100)
            : 0,
          delayedItems:
            phaseTasks.filter(isOverdue).length +
            milestones.filter(
              (milestone) =>
                milestone.phaseId === phase.id && isMilestoneMissed(milestone),
            ).length,
        };
      }),
      unphasedMilestones: milestones
        .filter((milestone) => !milestone.phaseId)
        .map(mapMilestone),
      criticalTaskIds: tasks
        .filter(
          (task) =>
            task.status !== "COMPLETED" &&
            (task.priority === "URGENT" || blockingIds.has(task.id)),
        )
        .map((task) => task.id),
    };
  }

  private async calendarFromTransaction(
    transaction: Transaction,
    workspaceId: string,
    from: Date,
    to: Date,
  ) {
    const workspace = await transaction.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
    });
    const [
      events,
      tasks,
      milestones,
      paymentSchedules,
      bookings,
      signatureEnvelopes,
      paymentCheckouts,
    ] = await Promise.all([
      transaction.calendarEvent.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          startAt: { gte: from, lte: to },
        },
      }),
      transaction.task.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          dueAt: { gte: from, lte: to },
        },
      }),
      transaction.timelineMilestone.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          targetAt: { gte: from, lte: to },
        },
      }),
      transaction.paymentScheduleEntry.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          status: { notIn: ["PAID", "CANCELLED"] },
          dueAt: { gte: from, lte: to },
        },
      }),
      transaction.vendorBooking.findMany({
        where: {
          workspaceId,
          status: { notIn: ["CANCELLED", "ARCHIVED"] },
          serviceStartAt: { gte: from, lte: to },
        },
      }),
      transaction.electronicSignatureEnvelope.findMany({
        where: {
          workspaceId,
          status: { in: ["READY", "SENT", "VIEWED", "PARTIALLY_SIGNED"] },
          expiresAt: { gte: from, lte: to },
        },
      }),
      transaction.onlinePaymentCheckout.findMany({
        where: {
          workspaceId,
          status: "OPEN",
          expiresAt: { gte: from, lte: to },
        },
      }),
    ]);
    return {
      items: [
        ...events.map(mapCalendarEvent),
        ...tasks.map((task) =>
          mapTaskCalendar(task, "task_due", task.dueAt!, workspace.timezone),
        ),
        ...milestones.map((milestone) =>
          mapMilestoneCalendar(milestone, workspace.timezone),
        ),
        ...paymentSchedules.map((entry) =>
          mapCommercialCalendar(
            "payment_schedule",
            entry.id,
            `Plată: ${entry.name}`,
            entry.dueAt,
            workspace.timezone,
            "/payments",
            entry.version,
          ),
        ),
        ...bookings.map((booking) =>
          mapCommercialCalendar(
            "booking",
            booking.id,
            booking.title,
            booking.serviceStartAt!,
            workspace.timezone,
            `/bookings?booking=${booking.id}`,
            booking.version,
          ),
        ),
        ...signatureEnvelopes.map((envelope) =>
          mapCommercialCalendar(
            "signature_envelope",
            envelope.id,
            "Expirare semnătură contract",
            envelope.expiresAt!,
            workspace.timezone,
            `/contracts?signature=${envelope.id}`,
            envelope.version,
          ),
        ),
        ...paymentCheckouts.map((checkout) =>
          mapCommercialCalendar(
            "payment_checkout",
            checkout.id,
            "Expirare checkout plată",
            checkout.expiresAt,
            workspace.timezone,
            `/payments?checkout=${checkout.id}`,
            checkout.version,
          ),
        ),
      ].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    };
  }

  private async mapComments(
    transaction: Transaction,
    comments: Array<Prisma.TaskCommentGetPayload<object>>,
  ) {
    const users = await transaction.user.findMany({
      where: {
        id: {
          in: [...new Set(comments.map((comment) => comment.authorUserId))],
        },
      },
      include: { profile: true },
    });
    const names = new Map(
      users.map((user) => [
        user.id,
        `${user.profile?.firstName ?? ""} ${user.profile?.lastName ?? ""}`.trim() ||
          user.email,
      ]),
    );
    return comments.map((comment) => ({
      id: comment.id,
      taskId: comment.taskId,
      authorUserId: comment.authorUserId,
      authorName: names.get(comment.authorUserId) ?? "Utilizator",
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      version: comment.version,
    }));
  }

  private async appliedCounts(
    transaction: Transaction,
    proposalId: string,
    appliedAt: Date,
  ): Promise<ApplyPlanProposalResponse> {
    const itemIds = (
      await transaction.planProposalItem.findMany({
        where: { proposalId },
        select: { id: true },
      })
    ).map((item) => item.id);
    const [phaseCount, milestoneCount, taskCount] = await Promise.all([
      transaction.planningPhase.count({
        where: { sourceProposalId: proposalId },
      }),
      transaction.timelineMilestone.count({
        where: {
          sourceProposalItemId: { in: itemIds },
          source: "proposal",
        },
      }),
      transaction.task.count({
        where: {
          source: "proposal",
          sourceProposalItemId: { in: itemIds },
        },
      }),
    ]);
    return {
      proposalId,
      phaseCount,
      milestoneCount,
      taskCount,
      appliedAt: appliedAt.toISOString(),
    };
  }

  private async canModerateComments(
    transaction: Transaction,
    workspaceId: string,
    userId: string,
  ) {
    const membership = await transaction.workspaceMembership.findFirst({
      where: { workspaceId, userId, status: "ACTIVE" },
      include: { roleTemplate: true },
    });
    return ["couple_owner", "wedding_planner"].includes(
      membership?.roleTemplate.key ?? "",
    );
  }

  private async idempotencyReplay(
    transaction: Transaction,
    userId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const existing = await transaction.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: { actorUserId: userId, operation, key },
      },
    });
    if (!existing) return null;
    if (existing.requestHash !== hashJson(request))
      problem(
        "IDEMPOTENCY_CONFLICT",
        HttpStatus.CONFLICT,
        "Idempotency key conflict",
        "Cheia a fost deja folosită pentru o altă cerere.",
      );
    return existing.responseBody as Prisma.JsonObject;
  }

  private async saveIdempotency(
    transaction: Transaction,
    workspaceId: string,
    userId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    await transaction.idempotencyRecord.create({
      data: {
        workspaceId,
        actorUserId: userId,
        operation,
        key,
        requestHash: hashJson(request),
        responseStatus: 200,
        responseBody: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }
}

function mapProposal(
  proposal: Prisma.PlanProposalGetPayload<object>,
  rows: Array<Prisma.PlanProposalItemGetPayload<object>>,
) {
  const byParent = new Map<
    string | null,
    Array<Prisma.PlanProposalItemGetPayload<object>>
  >();
  for (const item of rows) {
    const entries = byParent.get(item.parentItemId) ?? [];
    entries.push(item);
    byParent.set(item.parentItemId, entries);
  }
  const mapItem = (
    item: Prisma.PlanProposalItemGetPayload<object>,
  ): Record<string, unknown> => ({
    id: item.id,
    type: lower(item.type),
    parentItemId: item.parentItemId,
    title: item.title,
    description: item.description,
    category: item.category,
    priority: item.priority ? lower(item.priority) : null,
    relativeStartOffsetDays: item.relativeStartOffsetDays,
    relativeDueOffsetDays: item.relativeDueOffsetDays,
    absoluteStartAt: iso(item.absoluteStartAt),
    absoluteDueAt: iso(item.absoluteDueAt),
    estimatedEffortMinutes: item.estimatedEffortMinutes,
    suggestedOwnerType: item.suggestedOwnerType,
    required: item.required,
    included: item.included,
    position: item.position,
    metadata: record(item.metadata),
    version: item.version,
    items: (byParent.get(item.id) ?? []).map(mapItem),
  });
  return {
    id: proposal.id,
    workspaceId: proposal.workspaceId,
    onboardingDraftId: proposal.onboardingDraftId,
    onboardingVersion: proposal.onboardingVersion,
    generationRunId: proposal.generationRunId,
    status: lower(proposal.status),
    title: proposal.title,
    summary: proposal.summary,
    assumptions: jsonStrings(proposal.assumptions),
    warnings: jsonStrings(proposal.warnings),
    coverage: record(proposal.coverageResult),
    generatorType: proposal.generatorType,
    provider: proposal.provider,
    model: proposal.model,
    rulesVersion: proposal.rulesVersion,
    fallbackUsed: proposal.fallbackUsed,
    items: (byParent.get(null) ?? []).map(mapItem),
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
    version: proposal.version,
    appliedAt: iso(proposal.appliedAt),
    supersededAt: iso(proposal.supersededAt),
  };
}

function mapPhase(phase: Prisma.PlanningPhaseGetPayload<object>) {
  return {
    id: phase.id,
    title: phase.title,
    description: phase.description,
    position: phase.position,
    startAt: iso(phase.startAt),
    endAt: iso(phase.endAt),
    relativeStartOffsetDays: phase.relativeStartOffsetDays,
    relativeEndOffsetDays: phase.relativeEndOffsetDays,
    status: lower(phase.status),
    version: phase.version,
  };
}

function mapMilestone(milestone: Prisma.TimelineMilestoneGetPayload<object>) {
  return {
    id: milestone.id,
    phaseId: milestone.phaseId,
    title: milestone.title,
    description: milestone.description,
    targetAt: iso(milestone.targetAt),
    relativeOffsetDays: milestone.relativeOffsetDays,
    status: isMilestoneMissed(milestone) ? "missed" : lower(milestone.status),
    position: milestone.position,
    version: milestone.version,
  };
}

function mapCalendarEvent(event: Prisma.CalendarEventGetPayload<object>) {
  return {
    id: event.id,
    sourceType: "native_event" as const,
    sourceId: event.id,
    title: event.title,
    description: event.description,
    startAt: event.startAt.toISOString(),
    endAt: iso(event.endAt),
    allDay: event.allDay,
    timezone: event.timezone,
    location: event.location,
    editable: true as const,
    href: `/calendar?event=${event.id}`,
    version: event.version,
    meetingUrl: event.meetingUrl,
    ownerMembershipId: event.ownerMembershipId,
    reminderMinutes: event.reminderMinutes,
  };
}

function mapTaskCalendar(
  task: Prisma.TaskGetPayload<object>,
  sourceType: "task_due" | "task_start",
  at: Date,
  timezone: string,
) {
  return {
    id: `${sourceType}:${task.id}`,
    sourceType,
    sourceId: task.id,
    title:
      sourceType === "task_due"
        ? `Termen: ${task.title}`
        : `Începe: ${task.title}`,
    description: task.description,
    startAt: at.toISOString(),
    endAt: null,
    allDay: false,
    timezone,
    location: null,
    editable: false,
    href: `/plan?task=${task.id}`,
    version: task.version,
  };
}

function mapMilestoneCalendar(
  milestone: Prisma.TimelineMilestoneGetPayload<object>,
  timezone: string,
) {
  return {
    id: `milestone:${milestone.id}`,
    sourceType: "milestone" as const,
    sourceId: milestone.id,
    title: milestone.title,
    description: milestone.description,
    startAt: milestone.targetAt!.toISOString(),
    endAt: null,
    allDay: false,
    timezone,
    location: null,
    editable: false,
    href: `/timeline?milestone=${milestone.id}`,
    version: milestone.version,
  };
}

function mapWeddingEventCalendar(event: Prisma.WeddingEventGetPayload<object>) {
  return {
    id: `wedding-event:${event.id}`,
    sourceType: "wedding_event" as const,
    sourceId: event.id,
    title: event.title,
    description: event.description,
    startAt: event.startAt!.toISOString(),
    endAt: iso(event.endAt),
    allDay: false,
    timezone: event.timezone,
    location: event.locationAddress ?? event.locationName,
    editable: false,
    href: "/invitations/editor",
    version: event.version,
  };
}

function mapCommercialCalendar(
  sourceType:
    | "payment_schedule"
    | "booking"
    | "contract"
    | "signature_envelope"
    | "payment_checkout",
  sourceId: string,
  title: string,
  at: Date,
  timezone: string,
  href: string,
  version: number,
) {
  return {
    id: `${sourceType}:${sourceId}`,
    sourceType,
    sourceId,
    title,
    description: null,
    startAt: at.toISOString(),
    endAt: null,
    allDay: false,
    timezone,
    location: null,
    editable: false,
    href,
    version,
  };
}

function onboardingCalendar(
  value: Prisma.JsonValue | undefined,
  timezone: string,
  range: { from: Date; to: Date },
) {
  const source = record(value);
  const date =
    typeof source.date === "string"
      ? source.date
      : typeof source.exactDate === "string"
        ? source.exactDate
        : null;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const at = new Date(`${date}T12:00:00.000Z`);
  if (at < range.from || at > range.to) return [];
  return [
    {
      id: "wedding:event",
      sourceType: "wedding_event" as const,
      sourceId: "00000000-0000-0000-0000-000000000000",
      title: "Ziua nunții",
      description: "Evenimentul principal definit în onboarding.",
      startAt: at.toISOString(),
      endAt: null,
      allDay: true,
      timezone,
      location: null,
      editable: false,
      href: "/onboarding",
      version: null,
    },
  ];
}

export function resolveTransition(
  status: string,
  input: TaskTransitionRequest,
) {
  const allowed: Record<string, string[]> = {
    NOT_STARTED: ["START", "BLOCK", "COMPLETE", "ARCHIVE", "POSTPONE"],
    IN_PROGRESS: ["WAIT", "BLOCK", "COMPLETE", "ARCHIVE", "POSTPONE"],
    WAITING: ["START", "BLOCK", "COMPLETE", "ARCHIVE", "POSTPONE"],
    BLOCKED: ["UNBLOCK", "ARCHIVE", "POSTPONE"],
    COMPLETED: ["REOPEN", "ARCHIVE"],
    ARCHIVED: ["REOPEN"],
  };
  if (!allowed[status]?.includes(input.transition))
    problem(
      "VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      "Invalid task transition",
    );
  if (input.transition === "BLOCK" && !input.reason)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Blocking a task requires a reason",
    );
  if (input.transition === "POSTPONE" && !input.postponeUntil)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Postponing a task requires a date",
    );
  const target: Record<TaskTransitionRequest["transition"], string> = {
    START: "IN_PROGRESS",
    WAIT: "WAITING",
    BLOCK: "BLOCKED",
    UNBLOCK: "IN_PROGRESS",
    COMPLETE: "COMPLETED",
    REOPEN: "NOT_STARTED",
    ARCHIVE: "ARCHIVED",
    POSTPONE: status === "BLOCKED" ? "BLOCKED" : "WAITING",
  };
  return {
    status: target[
      input.transition
    ] as Prisma.EnumPlanningTaskStatusFieldUpdateOperationsInput["set"],
    blockedReason:
      input.transition === "BLOCK"
        ? input.reason
        : input.transition === "UNBLOCK" || input.transition === "REOPEN"
          ? null
          : undefined,
    dueAt:
      input.transition === "POSTPONE"
        ? new Date(input.postponeUntil!)
        : undefined,
    completed: input.transition === "COMPLETE",
  };
}

export function nextBestAction(
  tasks: Array<Prisma.TaskGetPayload<object>>,
  dependencies: Array<Prisma.TaskDependencyGetPayload<object>>,
  milestones: Array<Prisma.TimelineMilestoneGetPayload<object>> = [],
) {
  const active = tasks.filter(
    (task) => !["COMPLETED", "ARCHIVED"].includes(task.status),
  );
  if (!active.length) return null;
  const now = new Date();
  const soon = new Date(now.getTime() + 14 * 86_400_000);
  const blocking = new Set(
    dependencies.map((dependency) => dependency.dependsOnTaskId),
  );
  const rules: Array<{
    test: (task: Prisma.TaskGetPayload<object>) => boolean;
    reason: string;
    impact: string;
  }> = [
    {
      test: (task) => task.priority === "URGENT" && isOverdue(task),
      reason: "Task urgent întârziat",
      impact: "Întârzierea afectează direct planul curent.",
    },
    {
      test: (task) => task.priority === "HIGH" && isOverdue(task),
      reason: "Task important întârziat",
      impact: "Rezolvarea reduce riscul de întârziere.",
    },
    {
      test: (task) => task.status === "BLOCKED" && blocking.has(task.id),
      reason: "Task blocat care oprește alte activități",
      impact: "Deblochează taskurile dependente.",
    },
    {
      test: (task) =>
        task.priority === "URGENT" && Boolean(task.dueAt && task.dueAt <= soon),
      reason: "Task urgent cu termen apropiat",
      impact: "Previne o întârziere iminentă.",
    },
    {
      test: (task) =>
        task.priority === "HIGH" && Boolean(task.dueAt && task.dueAt <= soon),
      reason: "Task important cu termen apropiat",
      impact: "Menține faza curentă în grafic.",
    },
    {
      test: (task) => task.status === "NOT_STARTED",
      reason: "Primul task disponibil din faza curentă",
      impact: "Continuă progresul planului.",
    },
  ];
  for (const rule of rules.slice(0, 5)) {
    const task = active
      .filter(rule.test)
      .sort(
        (a, b) =>
          priorityWeight(b.priority) - priorityWeight(a.priority) ||
          (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
      )[0];
    if (task)
      return {
        type: "task",
        title: task.title,
        reason: rule.reason,
        impact: rule.impact,
        taskId: task.id,
        ...(task.dueAt ? { dueAt: task.dueAt.toISOString() } : {}),
        priority: lower(task.priority),
      };
  }
  const milestoneSoon = new Date(now.getTime() + 30 * 86_400_000);
  const milestone = milestones.find(
    (candidate) =>
      candidate.targetAt &&
      candidate.targetAt >= now &&
      candidate.targetAt <= milestoneSoon &&
      tasks.some(
        (task) =>
          task.milestoneId === candidate.id &&
          !["COMPLETED", "ARCHIVED"].includes(task.status),
      ),
  );
  if (milestone)
    return {
      type: "milestone",
      title: milestone.title,
      reason: "Milestone apropiat cu sarcini incomplete",
      impact: "Finalizarea sarcinilor protejează data milestone-ului.",
      dueAt: milestone.targetAt!.toISOString(),
      priority: "high" as const,
    };
  const available = active
    .filter((task) => task.status === "NOT_STARTED")
    .sort(
      (a, b) =>
        priorityWeight(b.priority) - priorityWeight(a.priority) ||
        (a.position ?? 0) - (b.position ?? 0),
    )[0];
  if (available)
    return {
      type: "task",
      title: available.title,
      reason: "Primul task disponibil din faza curentă",
      impact: "Continuă progresul planului.",
      taskId: available.id,
      ...(available.dueAt ? { dueAt: available.dueAt.toISOString() } : {}),
      priority: lower(available.priority),
    };
  return null;
}

export function nextGuestAction(input: {
  invitationPublished: boolean;
  missingContacts: number;
  hasCampaign: boolean;
  hasDeadline: boolean;
  noResponse: number;
  menuIncomplete: number;
  allergyIssues: number;
}) {
  if (!input.invitationPublished)
    return {
      type: "invitation.publish",
      title: "Publică invitația digitală",
      reason: "Invitația nu are încă o versiune publicată.",
      impact: "Publicarea fixează conținutul care va fi trimis invitaților.",
      href: "/invitations/editor",
      priority: "high" as const,
    };
  if (input.missingContacts > 0)
    return {
      type: "guest.contacts",
      title: "Completează datele de contact",
      reason: `${input.missingContacts} invitați nu au e-mail sau telefon.`,
      impact: "Destinatarii fără contact nu pot primi invitația.",
      href: "/guests",
      priority: "high" as const,
    };
  if (!input.hasCampaign)
    return {
      type: "campaign.send",
      title: "Trimite prima campanie de invitații",
      reason: "Invitația este publicată, dar nu există o campanie trimisă.",
      impact: "Pornește fluxul real de deschidere și RSVP.",
      href: "/invitations",
      priority: "high" as const,
    };
  if (!input.hasDeadline)
    return {
      type: "rsvp.deadline",
      title: "Stabilește termenul RSVP",
      reason: "Formularul nu are un termen de răspuns configurat.",
      impact: "Un termen clar permite urmărirea răspunsurilor restante.",
      href: "/rsvp",
      priority: "medium" as const,
    };
  if (input.noResponse > 0)
    return {
      type: "rsvp.reminder",
      title: "Urmărește invitații fără răspuns",
      reason: `${input.noResponse} invitați nu au răspuns încă.`,
      impact: "Un reminder țintit îmbunătățește acuratețea listei finale.",
      href: "/rsvp",
      priority: "high" as const,
    };
  if (input.allergyIssues > 0)
    return {
      type: "menu.allergy",
      title: "Rezolvă alertele de alergii",
      reason: `${input.allergyIssues} alergii necesită verificare.`,
      impact: "Clarificarea lor reduce riscul operațional pentru meniu.",
      href: "/menus",
      priority: "urgent" as const,
    };
  if (input.menuIncomplete > 0)
    return {
      type: "menu.selection",
      title: "Completează selecțiile de meniu",
      reason: `${input.menuIncomplete} invitați confirmați nu au meniu selectat.`,
      impact: "Selecțiile complete pregătesc centralizarea pentru catering.",
      href: "/menus",
      priority: "medium" as const,
    };
  return null;
}

export function hasDependencyCycle(
  edges: ReadonlyArray<readonly [string, string]>,
) {
  const graph = new Map<string, string[]>();
  for (const [task, dependency] of edges)
    graph.set(task, [...(graph.get(task) ?? []), dependency]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const neighbor of graph.get(node) ?? [])
      if (walk(neighbor)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(walk);
}

function taskSort(
  value: string | undefined,
): Prisma.TaskOrderByWithRelationInput[] {
  const [field, direction] = (value ?? "due_at:asc").split(":");
  const order = direction === "desc" ? "desc" : "asc";
  if (field === "priority") return [{ priority: order }, { id: "asc" }];
  if (field === "title") return [{ title: order }, { id: "asc" }];
  if (field === "created_at") return [{ createdAt: order }, { id: "asc" }];
  if (field === "position") return [{ position: order }, { id: "asc" }];
  return [{ dueAt: { sort: order, nulls: "last" } }, { id: "asc" }];
}

function calendarRange(query: Record<string, string | undefined>) {
  const from = query.from
    ? new Date(query.from)
    : new Date(Date.now() - 365 * 86_400_000);
  const to = query.to
    ? new Date(query.to)
    : new Date(Date.now() + 730 * 86_400_000);
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    to < from ||
    to.getTime() - from.getTime() > 5 * 365 * 86_400_000
  )
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Calendar range is invalid or too large",
    );
  return { from, to };
}

function shortcuts(query: string) {
  const items = [
    {
      id: "shortcut:new-task",
      type: "shortcut" as const,
      title: "Adaugă task",
      subtitle: "Quick Create",
      href: "/plan?create=task",
    },
    {
      id: "shortcut:new-event",
      type: "shortcut" as const,
      title: "Adaugă eveniment",
      subtitle: "Quick Create",
      href: "/calendar?create=event",
    },
    {
      id: "shortcut:plan",
      type: "shortcut" as const,
      title: "Deschide planul",
      subtitle: "Navigare",
      href: "/plan",
    },
    {
      id: "shortcut:timeline",
      type: "shortcut" as const,
      title: "Deschide timeline",
      subtitle: "Navigare",
      href: "/timeline",
    },
  ];
  return query
    ? items.filter((item) =>
        `${item.title} ${item.subtitle}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      )
    : items;
}

function isOverdue(task: { dueAt: Date | null; status: string }) {
  return Boolean(
    task.dueAt &&
    task.dueAt < new Date() &&
    !["COMPLETED", "ARCHIVED"].includes(task.status),
  );
}
function isMilestoneMissed(milestone: {
  targetAt: Date | null;
  status: string;
}) {
  return Boolean(
    milestone.targetAt &&
    milestone.targetAt < new Date() &&
    milestone.status !== "COMPLETED",
  );
}
function priorityWeight(priority: string) {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 }[priority] ?? 0;
}
function shiftDate(date: Date | null, days: number) {
  if (!date) return null;
  return new Date(date.getTime() + days * 86_400_000);
}
function startOfDay(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
function dateOnly(date: Date | null | undefined) {
  return date?.toISOString().slice(0, 10) ?? null;
}
function dateValue(value: string | null | undefined) {
  return value ? new Date(value) : value === null ? null : undefined;
}
function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}
function lower<T extends string>(value: T): Lowercase<T> {
  return value.toLowerCase() as Lowercase<T>;
}
function priorityEnum(value: string): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  const normalized = value.toUpperCase();
  if (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(normalized))
    return normalized as "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  problem(
    "VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "Task priority is invalid",
  );
}
function taskStatusEnum(
  value: string,
):
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "ARCHIVED" {
  const normalized = value.toUpperCase();
  if (
    [
      "NOT_STARTED",
      "IN_PROGRESS",
      "WAITING",
      "BLOCKED",
      "COMPLETED",
      "ARCHIVED",
    ].includes(normalized)
  )
    return normalized as
      | "NOT_STARTED"
      | "IN_PROGRESS"
      | "WAITING"
      | "BLOCKED"
      | "COMPLETED"
      | "ARCHIVED";
  problem(
    "VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "Task status is invalid",
  );
}
function proposalItemTypeEnum(value: string): "PHASE" | "MILESTONE" | "TASK" {
  const normalized = value.toUpperCase();
  if (["PHASE", "MILESTONE", "TASK"].includes(normalized))
    return normalized as "PHASE" | "MILESTONE" | "TASK";
  problem(
    "VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "Proposal item type is invalid",
  );
}
function milestoneStatusEnum(
  value: string,
): "UPCOMING" | "IN_PROGRESS" | "COMPLETED" {
  const normalized = value.toUpperCase();
  if (["UPCOMING", "IN_PROGRESS", "COMPLETED"].includes(normalized))
    return normalized as "UPCOMING" | "IN_PROGRESS" | "COMPLETED";
  problem(
    "VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "Milestone status is invalid",
  );
}
function reminderChannelEnum(value: string): "IN_APP" | "EMAIL" {
  const normalized = value.toUpperCase();
  if (normalized === "IN_APP" || normalized === "EMAIL") return normalized;
  problem(
    "VALIDATION_FAILED",
    HttpStatus.BAD_REQUEST,
    "Reminder channel is invalid",
  );
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function onboardingBudgetProjection(value: unknown): {
  targetTotalMinor: number;
  currency: string;
} {
  const budget = record(value);
  const amount = Number(budget.budget ?? budget.amount);
  const currency =
    typeof budget.currency === "string" && /^[A-Z]{3}$/.test(budget.currency)
      ? budget.currency
      : "RON";
  return {
    targetTotalMinor:
      budget.confirmed === true && Number.isFinite(amount) && amount >= 0
        ? Math.round(amount * 100)
        : 0,
    currency,
  };
}
function jsonStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function group<T>(values: T[], key: (value: T) => string) {
  const result = new Map<string, T[]>();
  for (const value of values)
    result.set(key(value), [...(result.get(key(value)) ?? []), value]);
  return result;
}
function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}
function hashJson(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function ics(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "");
}
function icsDate(date: Date) {
  return date
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}
function icsDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}${values.month}${values.day}`;
}
function icsDayAfter(date: Date, timeZone: string) {
  const day = icsDay(date, timeZone);
  const next = new Date(
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(4, 6)) - 1,
      Number(day.slice(6, 8)) + 1,
    ),
  );
  return next.toISOString().slice(0, 10).replaceAll("-", "");
}
function transitionLabel(value: string) {
  return (
    (
      {
        START: "început",
        WAIT: "pus în așteptare",
        BLOCK: "blocat",
        UNBLOCK: "deblocat",
        COMPLETE: "finalizat",
        REOPEN: "redeschis",
        ARCHIVE: "arhivat",
        POSTPONE: "amânat",
      } as Record<string, string>
    )[value] ?? "actualizat"
  );
}
function notFound(title: string): never {
  problem("NOT_FOUND", HttpStatus.NOT_FOUND, title);
}
function versionConflict(title: string, latestVersion: number): never {
  problem(
    "VERSION_CONFLICT",
    HttpStatus.PRECONDITION_FAILED,
    title,
    "Resursa a fost modificată. Reîncarcă datele curente.",
    undefined,
    { latestVersion },
  );
}
