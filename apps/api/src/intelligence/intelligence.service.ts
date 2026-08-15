import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  CapabilityKey,
  CreateCalendarEvent,
  CreateCampaign,
  CreateGuest,
  CreateHousehold,
  CreateMenu,
  CreateTask,
  CreateAutomationRule,
  CreateContingencyPlan,
  CreateCopilotConversation,
  CreateCopilotMessage,
  CreateRisk,
  CopilotProposalActionType,
  UpdateContingencyPlan,
  UpdateGuest,
  UpdateHousehold,
  UpdateRisk,
  UpdateTask,
} from "@weddingos/contracts";
import { parseCopilotActionPayload, riskScore } from "@weddingos/contracts";
import type { Prisma } from "@weddingos/database";
import {
  AUTOMATION_DSL_VERSION,
  copilotDefinitionForAction,
  COPILOT_POLICY_VERSION,
  RISK_RULES_VERSION,
  requiredCapabilityForCopilotAction,
} from "@weddingos/jobs";
import { AsyncService } from "../async/async.service";
import { DatabaseService } from "../common/database.service";
import { problem } from "../common/problem";
import { mapJob } from "../jobs/jobs.service";
import { WorkspaceEntitlementService } from "../workspace-billing/workspace-entitlement.service";
import { CommercialService } from "../commercial/commercial.service";
import { GuestCrmService } from "../guests/guest-crm.service";
import { InvitationCampaignService } from "../guests/invitation-campaign.service";
import { RsvpMenuService } from "../guests/rsvp-menu.service";
import { OperationsService } from "../operations/operations.service";
import { PlanningService } from "../planning/planning.service";
import { WeddingDayService } from "../wedding-day/wedding-day.service";

type Transaction = Prisma.TransactionClient;

@Injectable()
export class IntelligenceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsyncService) private readonly asyncEvents: AsyncService,
    @Inject(WorkspaceEntitlementService)
    private readonly entitlements: WorkspaceEntitlementService,
    @Inject(PlanningService) private readonly planning: PlanningService,
    @Inject(CommercialService) private readonly commercial: CommercialService,
    @Inject(GuestCrmService) private readonly guests: GuestCrmService,
    @Inject(RsvpMenuService) private readonly menus: RsvpMenuService,
    @Inject(OperationsService) private readonly operations: OperationsService,
    @Inject(InvitationCampaignService)
    private readonly invitations: InvitationCampaignService,
    @Inject(WeddingDayService)
    private readonly weddingDay: WeddingDayService,
  ) {}

  conversations(
    userId: string,
    workspaceId: string,
    cursor?: string,
    surface?: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.copilotConversation.findMany({
        where: {
          workspaceId,
          createdById: userId,
          status: "ACTIVE",
          ...(surface ? { surface } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 21,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 20).map(mapConversation),
        nextCursor: rows.length > 20 ? rows[19]!.id : null,
      };
    });
  }

  createConversation(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateCopilotConversation,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "copilot.conversation.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const conversation = mapConversation(
          await tx.copilotConversation.create({
            data: {
              workspaceId,
              createdById: userId,
              title: input.title || "Conversație nouă",
              surface: input.surface ?? "general",
            },
          }),
        );
        await this.asyncEvents.record(tx, {
          eventName: "copilot.conversation_created.v1",
          aggregateType: "CopilotConversation",
          aggregateId: conversation.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `copilot-conversation-created:${conversation.id}`,
          payload: { subject: { conversationId: conversation.id } },
        });
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "copilot.conversation.create",
          idempotencyKey,
          input,
          conversation,
        );
        return conversation;
      },
    );
  }

  updateConversation(
    userId: string,
    workspaceId: string,
    conversationId: string,
    expectedVersion: number,
    input: { title?: string; status?: "ACTIVE" | "ARCHIVED" },
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const current = await tx.copilotConversation.findFirst({
        where: { id: conversationId, workspaceId, createdById: userId },
      });
      if (!current) notFound("Conversația nu a fost găsită.");
      versionMatch(current.version, expectedVersion);
      return mapConversation(
        await tx.copilotConversation.update({
          where: { id: conversationId },
          data: {
            ...input,
            version: { increment: 1 },
          },
        }),
      );
    });
  }

  archiveConversation(
    userId: string,
    workspaceId: string,
    conversationId: string,
    expectedVersion: number,
  ) {
    return this.updateConversation(
      userId,
      workspaceId,
      conversationId,
      expectedVersion,
      { status: "ARCHIVED" },
    );
  }

  conversation(userId: string, workspaceId: string, conversationId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const conversation = await tx.copilotConversation.findFirst({
        where: { id: conversationId, workspaceId, createdById: userId },
      });
      if (!conversation) notFound("Conversația nu a fost găsită.");
      const [messages, proposals] = await Promise.all([
        tx.copilotMessage.findMany({
          where: { conversationId, workspaceId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: 200,
        }),
        tx.copilotProposal.findMany({
          where: {
            workspaceId,
            runId: { in: await runIds(tx, conversationId) },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      return {
        ...mapConversation(conversation),
        messages: messages.map(mapMessage),
        proposals: proposals.map(mapProposal),
      };
    });
  }

  sendMessage(
    userId: string,
    workspaceId: string,
    conversationId: string,
    idempotencyKey: string,
    input: CreateCopilotMessage,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "copilot.message",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        await this.entitlements.assertCapacity(
          tx,
          workspaceId,
          "AI_ACTIONS_MONTHLY",
          await tx.copilotRun.count({
            where: { workspaceId, createdAt: { gte: monthStart } },
          }),
        );
        const dailyLimit = Math.max(
          1,
          Number(process.env.COPILOT_DAILY_RUN_LIMIT ?? 100),
        );
        const dailyCostLimit = Math.max(
          1,
          Number(process.env.COPILOT_DAILY_COST_LIMIT_MINOR ?? 500),
        );
        const maximumRunCost = Math.max(
          1,
          Number(process.env.COPILOT_MAX_RUN_COST_MINOR ?? 25),
        );
        const dailyStart = new Date(Date.now() - 86_400_000);
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${`copilot.daily-budget:${workspaceId}`}, 0))
        `;
        const [userRuns, workspaceRuns, dailyUsage, inFlightRuns] =
          await Promise.all([
            tx.copilotRun.count({
              where: {
                workspaceId,
                requestedById: userId,
                createdAt: { gte: dailyStart },
              },
            }),
            tx.copilotRun.count({
              where: {
                workspaceId,
                createdAt: { gte: dailyStart },
              },
            }),
            tx.copilotUsageRecord.aggregate({
              where: {
                workspaceId,
                createdAt: { gte: dailyStart },
              },
              _sum: { estimatedCostMinor: true },
            }),
            tx.copilotRun.count({
              where: {
                workspaceId,
                status: { in: ["QUEUED", "RUNNING"] },
                createdAt: { gte: dailyStart },
              },
            }),
          ]);
        if (userRuns >= dailyLimit || workspaceRuns >= dailyLimit * 10)
          problem(
            "RATE_LIMITED",
            HttpStatus.TOO_MANY_REQUESTS,
            "Limita zilnică pentru Copilot a fost atinsă. Datele produsului rămân disponibile.",
          );
        if (
          (dailyUsage._sum.estimatedCostMinor ?? 0) +
            (inFlightRuns + 1) * maximumRunCost >
          dailyCostLimit
        )
          problem(
            "RATE_LIMITED",
            HttpStatus.TOO_MANY_REQUESTS,
            "Bugetul zilnic configurat pentru Copilot nu mai permite o rulare nouă.",
          );
        if (input.research) {
          const settings = await tx.copilotWorkspaceSettings.findUnique({
            where: { workspaceId },
            select: { webResearchEnabled: true },
          });
          if (!settings?.webResearchEnabled)
            problem(
              "FORBIDDEN",
              HttpStatus.FORBIDDEN,
              "Cercetarea web trebuie activată explicit din setările Copilot.",
            );
          if (input.mode === "deterministic")
            problem(
              "VALIDATION_FAILED",
              HttpStatus.UNPROCESSABLE_ENTITY,
              "Cercetarea web necesită modul AI sau automat.",
            );
        }
        const conversation = await tx.copilotConversation.findFirst({
          where: {
            id: conversationId,
            workspaceId,
            createdById: userId,
            status: "ACTIVE",
          },
        });
        if (!conversation) notFound("Conversația nu este activă.");
        const userMessage = await tx.copilotMessage.create({
          data: {
            workspaceId,
            conversationId,
            authorUserId: userId,
            role: "USER",
            content: input.content,
            metadata: {
              ...(input.context ?? {}),
              research: input.research ?? false,
            } as Prisma.InputJsonValue,
          },
        });
        const runId = randomUUID();
        const backgroundJobId = await this.asyncEvents.record(tx, {
          eventName: "copilot.run_requested.v1",
          aggregateType: "CopilotRun",
          aggregateId: runId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `copilot-run:${userMessage.id}`,
          userVisibleJob: true,
          payload: {
            subject: { runId, conversationId, userMessageId: userMessage.id },
            copilotRun: { runId },
            activity: {
              category: "copilot",
              action: "run_requested",
              summary:
                "Copilot analizează cererea în contextul workspace-ului.",
              entityType: "CopilotRun",
              entityId: runId,
            },
          },
        });
        if (!backgroundJobId) throw new Error("Copilot job missing");
        const run = await tx.copilotRun.create({
          data: {
            id: runId,
            workspaceId,
            conversationId,
            userMessageId: userMessage.id,
            requestedById: userId,
            backgroundJobId,
            requestedMode: input.mode ?? "auto",
            policyVersion: COPILOT_POLICY_VERSION,
          },
        });
        await tx.copilotConversation.update({
          where: { id: conversationId },
          data: {
            ...(conversation.title === "Conversație nouă"
              ? { title: input.content.slice(0, 80) }
              : {}),
            version: { increment: 1 },
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: backgroundJobId },
        });
        const response = {
          message: mapMessage(userMessage),
          run: mapRun(run),
          job: mapJob(job),
        };
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "copilot.message",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  run(userId: string, workspaceId: string, runId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const run = await tx.copilotRun.findFirst({
        where: { id: runId, workspaceId, requestedById: userId },
      });
      if (!run) notFound("Rularea Copilot nu a fost găsită.");
      const [sources, proposals, plan, research] = await Promise.all([
        tx.copilotSourceReference.findMany({
          where: { runId, workspaceId },
          orderBy: { position: "asc" },
        }),
        tx.copilotProposal.findMany({
          where: { runId, workspaceId },
          orderBy: [{ stepPosition: "asc" }, { createdAt: "asc" }],
        }),
        tx.copilotPlan.findFirst({ where: { runId, workspaceId } }),
        tx.copilotWebResearch.findUnique({ where: { runId } }),
      ]);
      const webCitations = research
        ? await tx.copilotWebCitation.findMany({
            where: { workspaceId, researchId: research.id },
            orderBy: { position: "asc" },
          })
        : [];
      return {
        ...mapRun(run),
        sources: sources.map((source) => ({
          id: source.id,
          resourceType: source.resourceType,
          resourceId: source.resourceId,
          excerpt: source.excerpt,
        })),
        proposal: proposals[0] ? mapProposal(proposals[0]) : null,
        proposals: proposals.map(mapProposal),
        plan: plan
          ? {
              id: plan.id,
              title: plan.title,
              summary: plan.summary,
              status: plan.status.toLowerCase(),
            }
          : null,
        webResearch: research
          ? {
              id: research.id,
              query: research.query,
              expiresAt: research.expiresAt.toISOString(),
              citations: webCitations.map((citation) => ({
                url: citation.url,
                title: citation.title,
                excerpt: citation.excerpt,
              })),
            }
          : null,
      };
    });
  }

  feedback(
    userId: string,
    workspaceId: string,
    messageId: string,
    input: { rating: "HELPFUL" | "NOT_HELPFUL"; reason?: string },
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const message = await tx.copilotMessage.findFirst({
        where: { id: messageId, workspaceId, role: "ASSISTANT" },
      });
      if (!message) notFound("Mesajul Copilot nu a fost găsit.");
      const conversation = await tx.copilotConversation.findFirst({
        where: {
          id: message.conversationId,
          workspaceId,
          createdById: userId,
        },
        select: { id: true },
      });
      if (!conversation) notFound("Mesajul Copilot nu a fost găsit.");
      const feedback = await tx.copilotFeedback.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { workspaceId, messageId, userId, ...input },
        update: input,
      });
      return {
        id: feedback.id,
        rating: feedback.rating,
        reason: feedback.reason,
      };
    });
  }

  proposals(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.copilotProposal.findMany({
          where: { workspaceId },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      ).map(mapProposal),
    }));
  }

  proposal(userId: string, workspaceId: string, proposalId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) =>
      this.getProposal(tx, workspaceId, proposalId),
    );
  }

  updateProposal(
    userId: string,
    workspaceId: string,
    proposalId: string,
    expectedVersion: number,
    input: {
      title?: string;
      summary?: string;
      version: number;
      actions?: Array<{
        actionType: string;
        payload: Record<string, unknown>;
        riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        position: number;
      }>;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.copilotProposal.findFirst({
          where: { id: proposalId, workspaceId },
        });
        if (!current) notFound("Propunerea nu a fost găsită.");
        versionMatch(current.version, expectedVersion);
        if (current.status !== "READY_FOR_REVIEW")
          conflict("Numai o propunere aflată în review poate fi editată.");
        const updated = await tx.copilotProposal.update({
          where: { id: proposalId },
          data: {
            title: input.title,
            summary: input.summary,
            version: { increment: 1 },
          },
        });
        if (input.actions) {
          await tx.copilotProposalAction.deleteMany({
            where: { proposalId, workspaceId },
          });
          for (const action of input.actions) {
            await tx.copilotProposalAction.create({
              data: {
                workspaceId,
                proposalId,
                actionType: action.actionType,
                payload: action.payload as Prisma.InputJsonValue,
                riskLevel: action.riskLevel,
                position: action.position,
              },
            });
          }
        }
        const snapshot = await this.getProposal(tx, workspaceId, proposalId);
        await tx.copilotProposalVersion.create({
          data: {
            workspaceId,
            proposalId,
            version: updated.version,
            snapshot: jsonSnapshot(snapshot),
            createdById: userId,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "copilot.proposal_updated.v1",
          aggregateType: "CopilotProposal",
          aggregateId: proposalId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `copilot-proposal-updated:${proposalId}:v${updated.version}`,
          payload: {
            subject: { proposalId },
            proposalVersion: updated.version,
          },
        });
        return snapshot;
      },
    );
  }

  reviewProposal(
    userId: string,
    workspaceId: string,
    proposalId: string,
    input: { decision: "APPROVE" | "REJECT"; reason?: string; version: number },
    correlationId: string,
    _idempotencyKey?: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const proposal = await tx.copilotProposal.findFirst({
          where: { id: proposalId, workspaceId },
        });
        if (!proposal) notFound("Propunerea nu a fost găsită.");
        const existingApproval = await tx.copilotApproval.findUnique({
          where: {
            proposalId_proposalVersion: {
              proposalId,
              proposalVersion: input.version,
            },
          },
        });
        if (existingApproval?.decision === input.decision)
          return this.getProposal(tx, workspaceId, proposalId);
        versionMatch(proposal.version, input.version);
        if (proposal.status !== "READY_FOR_REVIEW")
          conflict("Propunerea a fost deja revizuită.");
        const approved = input.decision === "APPROVE";
        const updated = await tx.copilotProposal.update({
          where: { id: proposalId },
          data: {
            status: approved ? "APPROVED" : "REJECTED",
            ...(approved
              ? { approvedAt: new Date() }
              : { rejectedAt: new Date() }),
            version: { increment: 1 },
          },
        });
        await tx.copilotApproval.create({
          data: {
            workspaceId,
            proposalId,
            reviewerId: userId,
            decision: input.decision,
            reason: input.reason,
            proposalVersion: proposal.version,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: approved
            ? "copilot.proposal_approved.v1"
            : "copilot.proposal_rejected.v1",
          aggregateType: "CopilotProposal",
          aggregateId: proposalId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `copilot-proposal-${approved ? "approved" : "rejected"}:${proposalId}:v${proposal.version}`,
          payload: { subject: { proposalId } },
        });
        return this.getProposal(tx, workspaceId, proposalId);
      },
    );
  }

  executeProposal(
    userId: string,
    workspaceId: string,
    proposalId: string,
    idempotencyKey: string,
    input: { version: number; confirmHighRisk?: boolean },
    actorCapabilities: CapabilityKey[],
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const existing = await tx.copilotExecution.findUnique({
          where: {
            workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
          },
        });
        if (existing) return existing.result as Prisma.JsonObject;
        const proposal = await tx.copilotProposal.findFirst({
          where: { id: proposalId, workspaceId },
        });
        if (!proposal) notFound("Propunerea nu a fost găsită.");
        versionMatch(proposal.version, input.version);
        if (proposal.status !== "APPROVED")
          conflict("Propunerea trebuie aprobată înainte de execuție.");
        if (
          ["HIGH", "CRITICAL"].includes(proposal.riskLevel) &&
          !input.confirmHighRisk
        )
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Confirmarea explicită este necesară pentru o acțiune cu risc ridicat.",
          );
        const execution = await tx.copilotExecution.create({
          data: {
            workspaceId,
            proposalId,
            requestedById: userId,
            idempotencyKey,
          },
        });
        const actions = await tx.copilotProposalAction.findMany({
          where: { proposalId, workspaceId },
          orderBy: { position: "asc" },
        });
        assertCopilotActionCapabilities(actions, actorCapabilities);
        for (const action of actions) {
          const payload = record(action.payload);
          if (action.actionType === "UPDATE_TASK") {
            const targetId = optionalString(payload.targetId);
            const targetVersion = Number(payload.targetVersion);
            const target = targetId
              ? await tx.task.findFirst({
                  where: { id: targetId, workspaceId, deletedAt: null },
                  select: { version: true },
                })
              : null;
            if (
              !target ||
              !Number.isInteger(targetVersion) ||
              target.version !== targetVersion
            )
              conflict(
                "Resursa vizată de propunere s-a schimbat. Revizuiește sau regenerează propunerea.",
              );
          }
          if (action.actionType === "UPDATE_RISK") {
            const targetId = optionalString(payload.targetId);
            const targetVersion = Number(payload.targetVersion);
            const target = targetId
              ? await tx.risk.findFirst({
                  where: { id: targetId, workspaceId, deletedAt: null },
                  select: { version: true },
                })
              : null;
            if (
              !target ||
              !Number.isInteger(targetVersion) ||
              target.version !== targetVersion
            )
              conflict(
                "Riscul vizat de propunere s-a schimbat. Revizuiește sau regenerează propunerea.",
              );
          }
        }
        const resources: Array<{ type: string; id: string }> = [];
        for (const action of actions) {
          const actionType = action.actionType as CopilotProposalActionType;
          const payload = parseCopilotActionPayload(
            actionType,
            record(action.payload),
          );
          const requiredCapability =
            requiredCapabilityForCopilotAction(actionType)!;
          const invocation = await tx.copilotToolInvocation.create({
            data: {
              workspaceId,
              userId,
              runId: proposal.runId,
              toolKey: `proposal.${actionType.toLowerCase()}`,
              operation: "EXECUTE",
              requiredCapability,
              riskLevel: action.riskLevel,
              input: redactCopilotAuditValue(payload),
              idempotencyKey: `copilot-action:${proposalId}:${action.id}`,
            },
          });
          const resource = await this.executeCopilotAction({
            actionType,
            payload,
            userId,
            workspaceId,
            proposalId,
            actionId: action.id,
            correlationId,
            actorCapabilities,
          });
          resources.push(resource);
          await tx.copilotToolInvocation.update({
            where: { id: invocation.id },
            data: {
              status: "COMPLETED",
              output: resource,
              resourceType: resource.type,
              resourceId: resource.id,
              completedAt: new Date(),
            },
          });
        }
        const result = { executionId: execution.id, resources };
        await tx.copilotExecution.update({
          where: { id: execution.id },
          data: { status: "COMPLETED", result, completedAt: new Date() },
        });
        const updated = await tx.copilotProposal.update({
          where: { id: proposalId },
          data: {
            status: "EXECUTED",
            executedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "copilot.proposal_executed.v1",
          aggregateType: "CopilotProposal",
          aggregateId: proposalId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `copilot-proposal-executed:${proposalId}`,
          payload: {
            subject: { proposalId, executionId: execution.id, resources },
            activity: {
              category: "copilot",
              action: "proposal_executed",
              summary: `Propunerea aprobată a creat ${resources.length} resurse.`,
              entityType: "CopilotProposal",
              entityId: proposalId,
            },
          },
        });
        return result;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  private async executeCopilotAction(input: {
    actionType: CopilotProposalActionType;
    payload: Record<string, unknown>;
    userId: string;
    workspaceId: string;
    proposalId: string;
    actionId: string;
    correlationId: string;
    actorCapabilities: CapabilityKey[];
  }): Promise<{ type: string; id: string }> {
    const {
      actionType,
      payload,
      userId,
      workspaceId,
      proposalId,
      actionId,
      correlationId,
      actorCapabilities,
    } = input;
    const replayKey = `copilot:${proposalId}:${actionId}`;
    const targetId = optionalString(payload.targetId);
    const targetVersion = Number(payload.targetVersion);

    if (actionType === "CREATE_TASK") {
      const row = await this.planning.createTask(
        userId,
        workspaceId,
        replayKey,
        payload as CreateTask,
        correlationId,
      );
      return resourceReference("Task", row);
    }
    if (actionType === "UPDATE_TASK") {
      const row = await this.planning.updateTask(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as UpdateTask,
        correlationId,
      );
      return resourceReference("Task", row);
    }
    if (actionType === "CREATE_CALENDAR_EVENT") {
      const row = await this.planning.createEvent(
        userId,
        workspaceId,
        replayKey,
        payload as CreateCalendarEvent,
        correlationId,
      );
      return resourceReference("CalendarEvent", row);
    }
    if (actionType === "UPDATE_CALENDAR_EVENT") {
      const row = await this.planning.updateEvent(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as Partial<CreateCalendarEvent>,
        correlationId,
      );
      return resourceReference("CalendarEvent", row);
    }
    if (actionType === "CREATE_RISK") {
      const row = await this.createRisk(
        userId,
        workspaceId,
        replayKey,
        { ...(payload as CreateRisk), source: "COPILOT" },
        correlationId,
      );
      return resourceReference("Risk", row);
    }
    if (actionType === "UPDATE_RISK") {
      const row = await this.updateRisk(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as UpdateRisk,
        correlationId,
      );
      return resourceReference("Risk", row);
    }
    if (actionType === "CREATE_CONTINGENCY_PLAN") {
      const row = await this.createContingencyPlan(
        userId,
        workspaceId,
        replayKey,
        payload as CreateContingencyPlan,
        correlationId,
      );
      return resourceReference("ContingencyPlan", row);
    }
    if (actionType === "UPSERT_BUDGET_PLAN") {
      const row = await this.commercial.upsertBudget(
        userId,
        workspaceId,
        Number.isInteger(targetVersion) ? targetVersion : null,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("BudgetPlan", row);
    }
    if (actionType === "CREATE_BUDGET_CATEGORY") {
      const row = await this.commercial.createBudgetCategory(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("BudgetCategory", row);
    }
    if (actionType === "UPDATE_BUDGET_CATEGORY") {
      const row = await this.commercial.updateBudgetCategory(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
        correlationId,
      );
      return resourceReference("BudgetCategory", row);
    }
    if (actionType === "CREATE_BUDGET_ITEM") {
      const row = await this.commercial.createBudgetItem(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("BudgetItem", row);
    }
    if (actionType === "UPDATE_BUDGET_ITEM") {
      const row = await this.commercial.updateBudgetItem(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
        correlationId,
      );
      return resourceReference("BudgetItem", row);
    }
    if (actionType === "CREATE_EXPENSE") {
      const row = await this.commercial.createExpense(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("ExpenseRecord", row);
    }
    if (actionType === "UPDATE_EXPENSE") {
      const row = await this.commercial.updateExpense(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
        correlationId,
      );
      return resourceReference("ExpenseRecord", row);
    }
    if (actionType === "CREATE_HOUSEHOLD") {
      const row = await this.guests.createHousehold(
        userId,
        workspaceId,
        replayKey,
        payload as CreateHousehold,
        correlationId,
      );
      return resourceReference("Household", row);
    }
    if (actionType === "UPDATE_HOUSEHOLD") {
      const row = await this.guests.updateHousehold(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as UpdateHousehold,
        correlationId,
      );
      return resourceReference("Household", row);
    }
    if (actionType === "CREATE_GUEST") {
      const row = await this.guests.createGuest(
        userId,
        workspaceId,
        replayKey,
        payload as CreateGuest,
        correlationId,
        actorCapabilities,
      );
      return resourceReference("Guest", row);
    }
    if (actionType === "UPDATE_GUEST") {
      const row = await this.guests.updateGuest(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as UpdateGuest,
        correlationId,
        actorCapabilities,
      );
      return resourceReference("Guest", row);
    }
    if (actionType === "CREATE_MENU") {
      const row = await this.menus.createMenu(
        userId,
        workspaceId,
        replayKey,
        payload as CreateMenu,
        correlationId,
      );
      return resourceReference("Menu", row);
    }
    if (actionType === "UPDATE_MENU") {
      const row = await this.menus.updateMenu(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as Partial<CreateMenu>,
        correlationId,
      );
      return resourceReference("Menu", row);
    }
    if (actionType === "CREATE_SEATING_PLAN") {
      const row = await this.operations.createSeatingPlan(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("SeatingPlan", row);
    }
    if (actionType === "UPDATE_SEATING_PLAN") {
      const row = await this.operations.updateSeatingPlan(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
        correlationId,
      );
      return resourceReference("SeatingPlan", row);
    }
    if (actionType === "CREATE_SEATING_TABLE") {
      const row = await this.operations.createTable(
        userId,
        workspaceId,
        stringValue(payload.planId, ""),
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("SeatingTable", row);
    }
    if (actionType === "UPDATE_SEATING_TABLE") {
      const row = await this.operations.updateTable(
        userId,
        workspaceId,
        stringValue(payload.planId, ""),
        targetId!,
        targetVersion,
        payload,
      );
      return resourceReference("SeatingTable", row);
    }
    if (actionType === "REPLACE_SEATING_ASSIGNMENTS") {
      const planId = stringValue(payload.planId, "");
      await this.operations.replaceSeatingAssignments(
        userId,
        workspaceId,
        planId,
        targetVersion,
        replayKey,
        payload,
        correlationId,
      );
      return { type: "SeatingPlan", id: planId };
    }
    if (actionType === "CREATE_VENDOR_SHORTLIST") {
      const row = await this.commercial.createShortlist(
        userId,
        workspaceId,
        replayKey,
        payload,
      );
      return resourceReference("VendorShortlist", row);
    }
    if (actionType === "ADD_VENDOR_TO_SHORTLIST") {
      const shortlistId = stringValue(payload.shortlistId, "");
      await this.commercial.setShortlistVendor(
        userId,
        workspaceId,
        shortlistId,
        stringValue(payload.vendorOrganizationId, ""),
        true,
      );
      return { type: "VendorShortlist", id: shortlistId };
    }
    if (actionType === "FAVORITE_VENDOR") {
      const vendorOrganizationId = stringValue(
        payload.vendorOrganizationId,
        "",
      );
      await this.commercial.setFavorite(
        userId,
        workspaceId,
        vendorOrganizationId,
        true,
      );
      return { type: "VendorOrganization", id: vendorOrganizationId };
    }
    if (actionType === "SYNC_INVITATION_DATA") {
      const preview = await this.invitations.syncPreview(userId, workspaceId);
      const availablePaths = new Set(
        preview.differences.map((difference) => difference.path),
      );
      const paths = (
        payload.paths as Array<(typeof preview.differences)[number]["path"]>
      ).filter((path) => availablePaths.has(path));
      if (!paths.length) {
        const current = await this.invitations.site(userId, workspaceId);
        return resourceReference("InvitationSite", current);
      }
      const row = await this.invitations.syncApply(
        userId,
        workspaceId,
        targetVersion,
        replayKey,
        { sourceRevision: preview.sourceRevision, paths },
        correlationId,
      );
      return resourceReference("InvitationSite", row);
    }
    if (actionType === "CREATE_TRANSPORT_PLAN") {
      const row = await this.operations.createTransportPlan(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("TransportPlan", row);
    }
    if (actionType === "UPDATE_TRANSPORT_PLAN") {
      const row = await this.operations.updateTransportPlan(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
      );
      return resourceReference("TransportPlan", row);
    }
    if (actionType === "CREATE_TRANSPORT_STOP") {
      const row = await this.operations.createTransportStop(
        userId,
        workspaceId,
        replayKey,
        payload,
      );
      return resourceReference("TransportStop", row);
    }
    if (actionType === "UPDATE_TRANSPORT_STOP") {
      const row = await this.operations.updateTransportStop(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
      );
      return resourceReference("TransportStop", row);
    }
    if (actionType === "CREATE_ACCOMMODATION_PROPERTY") {
      const row = await this.operations.createAccommodationProperty(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("AccommodationProperty", row);
    }
    if (actionType === "UPDATE_ACCOMMODATION_PROPERTY") {
      const row = await this.operations.updateAccommodationProperty(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
      );
      return resourceReference("AccommodationProperty", row);
    }
    if (actionType === "CREATE_ACCOMMODATION_STAY") {
      const row = await this.operations.createAccommodationStay(
        userId,
        workspaceId,
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("AccommodationStay", row);
    }
    if (actionType === "UPDATE_ACCOMMODATION_STAY") {
      const row = await this.operations.updateAccommodationStay(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload,
      );
      return resourceReference("AccommodationStay", row);
    }
    if (actionType === "CREATE_RFQ") {
      const row = await this.commercial.createRfq(
        userId,
        workspaceId,
        replayKey,
        payload as Prisma.JsonObject,
        correlationId,
      );
      return resourceReference("RequestForQuote", row);
    }
    if (actionType === "UPDATE_RFQ") {
      const row = await this.commercial.updateRfq(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as Prisma.JsonObject,
        correlationId,
      );
      return resourceReference("RequestForQuote", row);
    }
    if (actionType === "CREATE_CAMPAIGN_DRAFT") {
      const row = await this.invitations.createCampaign(
        userId,
        workspaceId,
        replayKey,
        payload as CreateCampaign,
        correlationId,
      );
      return resourceReference("Campaign", row);
    }
    if (actionType === "UPDATE_CAMPAIGN_DRAFT") {
      const row = await this.invitations.updateCampaign(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        payload as Partial<CreateCampaign>,
      );
      return resourceReference("Campaign", row);
    }
    if (actionType === "CREATE_WEDDING_DAY_INCIDENT") {
      const row = await this.weddingDay.createIncident(
        userId,
        workspaceId,
        stringValue(payload.planId, ""),
        replayKey,
        payload,
        correlationId,
      );
      return resourceReference("WeddingDayIncident", row);
    }
    if (actionType === "CREATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT") {
      const row = await this.weddingDay.createAnnouncement(
        userId,
        workspaceId,
        stringValue(payload.planId, ""),
        replayKey,
        { ...payload, publishAt: null },
      );
      return resourceReference("WeddingDayAnnouncement", row);
    }
    if (actionType === "UPDATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT") {
      const row = await this.weddingDay.updateAnnouncement(
        userId,
        workspaceId,
        targetId!,
        targetVersion,
        { ...payload, publishAt: null },
      );
      return resourceReference("WeddingDayAnnouncement", row);
    }

    const exhaustive: never = actionType;
    throw new Error(`Unsupported Copilot action: ${String(exhaustive)}`);
  }

  risks(
    userId: string,
    workspaceId: string,
    query: Record<string, string | undefined>,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const rows = await tx.risk.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          ...(query.status ? { status: query.status as never } : {}),
          ...(query.category ? { category: query.category as never } : {}),
          ...(query.level ? { level: query.level as never } : {}),
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
        },
        orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
        take: 51,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 50).map(mapRisk),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
        summary: await riskSummary(tx, workspaceId),
      };
    });
  }

  createRisk(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateRisk,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "risk.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        await validateMembership(tx, workspaceId, input.ownerMembershipId);
        const score = riskScore(input.probability, input.impact);
        const created = await tx.risk.create({
          data: {
            workspaceId,
            title: input.title,
            description: input.description,
            category: input.category,
            probability: input.probability,
            impact: input.impact,
            score: score.score,
            level: score.level,
            ownerMembershipId: input.ownerMembershipId,
            dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
            source: input.source ?? "MANUAL",
            createdById: userId,
          },
        });
        await tx.riskAssessment.create({
          data: {
            workspaceId,
            riskId: created.id,
            probability: created.probability,
            impact: created.impact,
            score: created.score,
            level: created.level,
            assessedById: userId,
            rulesVersion: RISK_RULES_VERSION,
          },
        });
        await this.riskEvent(
          tx,
          created,
          userId,
          correlationId,
          "risk.created.v1",
        );
        const response = mapRisk(created);
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "risk.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  risk(userId: string, workspaceId: string, riskId: string) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      this.getRisk(tx, workspaceId, riskId),
    );
  }

  updateRisk(
    userId: string,
    workspaceId: string,
    riskId: string,
    expectedVersion: number,
    input: UpdateRisk,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.risk.findFirst({
          where: { id: riskId, workspaceId, deletedAt: null },
        });
        if (!current) notFound("Riscul nu a fost găsit.");
        versionMatch(current.version, expectedVersion);
        await validateMembership(tx, workspaceId, input.ownerMembershipId);
        const probability = input.probability ?? current.probability;
        const impact = input.impact ?? current.impact;
        const score = riskScore(probability, impact);
        const updated = await tx.risk.update({
          where: { id: riskId },
          data: {
            ...input,
            ...(input.dueAt !== undefined
              ? { dueAt: new Date(input.dueAt) }
              : {}),
            probability,
            impact,
            score: score.score,
            level: score.level,
            ...(input.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
            version: { increment: 1 },
          },
        });
        await Promise.all([
          tx.riskAssessment.create({
            data: {
              workspaceId,
              riskId,
              probability,
              impact,
              score: score.score,
              level: score.level,
              assessedById: userId,
              rulesVersion: RISK_RULES_VERSION,
            },
          }),
          tx.riskUpdate.create({
            data: {
              workspaceId,
              riskId,
              actorUserId: userId,
              action: input.status === "RESOLVED" ? "resolved" : "updated",
              before: mapRisk(current) as Prisma.InputJsonValue,
              after: mapRisk(updated) as Prisma.InputJsonValue,
            },
          }),
        ]);
        await this.riskEvent(
          tx,
          updated,
          userId,
          correlationId,
          input.status === "RESOLVED" ? "risk.resolved.v1" : "risk.updated.v1",
        );
        return mapRisk(updated);
      },
    );
  }

  deleteRisk(
    userId: string,
    workspaceId: string,
    riskId: string,
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await this.ensureRisk(tx, workspaceId, riskId);
        versionMatch(current.version, expectedVersion);
        const updated = await tx.risk.update({
          where: { id: riskId },
          data: {
            status: "ARCHIVED",
            deletedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.riskEvent(
          tx,
          updated,
          userId,
          correlationId,
          "risk.updated.v1",
        );
        return mapRisk(updated);
      },
    );
  }

  transitionRisk(
    userId: string,
    workspaceId: string,
    riskId: string,
    input: {
      transition:
        | "MONITOR"
        | "START_MITIGATION"
        | "RESOLVE"
        | "ACCEPT"
        | "ARCHIVE"
        | "REOPEN";
      reason: string;
      version: number;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await this.ensureRisk(tx, workspaceId, riskId);
        versionMatch(current.version, input.version);
        const nextStatus = {
          MONITOR: "MONITORING",
          START_MITIGATION: "MITIGATING",
          RESOLVE: "RESOLVED",
          ACCEPT: "ACCEPTED",
          ARCHIVE: "ARCHIVED",
          REOPEN: "OPEN",
        }[input.transition] as
          | "MONITORING"
          | "MITIGATING"
          | "RESOLVED"
          | "ACCEPTED"
          | "ARCHIVED"
          | "OPEN";
        if (input.transition === "REOPEN" && current.status === "OPEN")
          conflict("Riscul este deja deschis.");
        const updated = await tx.risk.update({
          where: { id: riskId },
          data: {
            status: nextStatus,
            resolutionNote: input.reason,
            resolvedAt: nextStatus === "RESOLVED" ? new Date() : null,
            version: { increment: 1 },
          },
        });
        await tx.riskUpdate.create({
          data: {
            workspaceId,
            riskId,
            actorUserId: userId,
            action: input.transition.toLowerCase(),
            before: mapRisk(current) as Prisma.InputJsonValue,
            after: mapRisk(updated) as Prisma.InputJsonValue,
          },
        });
        const eventName =
          input.transition === "RESOLVE"
            ? "risk.resolved.v1"
            : input.transition === "START_MITIGATION"
              ? "risk.mitigation_started.v1"
              : "risk.updated.v1";
        await this.riskEvent(tx, updated, userId, correlationId, eventName);
        return mapRisk(updated);
      },
    );
  }

  assessRisk(
    userId: string,
    workspaceId: string,
    riskId: string,
    input: {
      probability: number;
      impact: number;
      reason?: string;
      version: number;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await this.ensureRisk(tx, workspaceId, riskId);
        versionMatch(current.version, input.version);
        const score = riskScore(input.probability, input.impact);
        const assessment = await tx.riskAssessment.create({
          data: {
            workspaceId,
            riskId,
            probability: input.probability,
            impact: input.impact,
            score: score.score,
            level: score.level,
            reason: input.reason,
            assessedById: userId,
            rulesVersion: RISK_RULES_VERSION,
          },
        });
        const updated = await tx.risk.update({
          where: { id: riskId },
          data: {
            probability: input.probability,
            impact: input.impact,
            score: score.score,
            level: score.level,
            version: { increment: 1 },
          },
        });
        await Promise.all([
          this.asyncEvents.record(tx, {
            eventName: "risk.assessment_created.v1",
            aggregateType: "Risk",
            aggregateId: riskId,
            aggregateVersion: updated.version,
            workspaceId,
            actorUserId: userId,
            correlationId,
            deduplicationKey: `risk-assessment-created:${assessment.id}`,
            payload: { subject: { riskId, assessmentId: assessment.id } },
          }),
          ...(current.score !== updated.score
            ? [
                this.asyncEvents.record(tx, {
                  eventName: "risk.score_changed.v1",
                  aggregateType: "Risk",
                  aggregateId: riskId,
                  aggregateVersion: updated.version,
                  workspaceId,
                  actorUserId: userId,
                  correlationId,
                  deduplicationKey: `risk-score-changed:${riskId}:v${updated.version}`,
                  payload: {
                    subject: {
                      riskId,
                      before: current.score,
                      after: updated.score,
                      level: updated.level,
                    },
                  },
                }),
              ]
            : []),
        ]);
        return this.getRisk(tx, workspaceId, riskId);
      },
    );
  }

  addMitigation(
    userId: string,
    workspaceId: string,
    riskId: string,
    input: {
      title: string;
      description?: string;
      ownerMembershipId?: string;
      dueAt?: string;
    },
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      await this.ensureRisk(tx, workspaceId, riskId);
      await validateMembership(tx, workspaceId, input.ownerMembershipId);
      const action = await tx.riskMitigationAction.create({
        data: {
          workspaceId,
          riskId,
          title: input.title,
          description: input.description,
          ownerMembershipId: input.ownerMembershipId,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        },
      });
      return {
        ...action,
        dueAt: iso(action.dueAt),
        createdAt: action.createdAt.toISOString(),
      };
    });
  }

  detectRisks(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await tx.idempotencyRecord.findUnique({
          where: {
            actorUserId_operation_key: {
              actorUserId: userId,
              operation: "risk.detect",
              key: idempotencyKey,
            },
          },
        });
        if (replay) return replay.responseBody as Prisma.JsonObject;
        const detectionRunId = randomUUID();
        const backgroundJobId = await this.asyncEvents.record(tx, {
          eventName: "risk.detect_requested.v1",
          aggregateType: "RiskDetectionRun",
          aggregateId: detectionRunId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `risk-detection:${workspaceId}:${idempotencyKey}`,
          userVisibleJob: true,
          payload: {
            subject: { detectionRunId },
            riskDetection: { detectionRunId },
          },
        });
        if (!backgroundJobId) throw new Error("Risk detection job missing");
        const run = await tx.riskDetectionRun.create({
          data: {
            id: detectionRunId,
            workspaceId,
            requestedById: userId,
            backgroundJobId,
            rulesVersion: RISK_RULES_VERSION,
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: backgroundJobId },
        });
        const response = { detectionRunId: run.id, job: mapJob(job) };
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "risk.detect",
          idempotencyKey,
          {},
          response,
        );
        return response;
      },
    );
  }

  contingencyPlans(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.contingencyPlan.findMany({
          where: { workspaceId },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      ).map(mapContingencyPlan),
    }));
  }

  createContingencyPlan(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateContingencyPlan,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "contingency.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        if (input.riskId) await this.ensureRisk(tx, workspaceId, input.riskId);
        const plan = await tx.contingencyPlan.create({
          data: {
            workspaceId,
            riskId: input.riskId,
            title: input.title,
            summary: input.summary,
            status: "DRAFT",
            createdById: userId,
          },
        });
        await Promise.all([
          ...(input.triggers ?? []).map((trigger) =>
            tx.contingencyTrigger.create({
              data: {
                workspaceId,
                planId: plan.id,
                triggerType: trigger.type,
                configuration: trigger.configuration as Prisma.InputJsonValue,
              },
            }),
          ),
          ...input.actions.map((action) =>
            tx.contingencyAction.create({
              data: { workspaceId, planId: plan.id, ...action },
            }),
          ),
          tx.contingencyPlanVersion.create({
            data: {
              workspaceId,
              planId: plan.id,
              version: 1,
              snapshot: input as Prisma.InputJsonValue,
              createdById: userId,
            },
          }),
        ]);
        await this.asyncEvents.record(tx, {
          eventName: "contingency.plan_created.v1",
          aggregateType: "ContingencyPlan",
          aggregateId: plan.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `contingency-plan-created:${plan.id}`,
          payload: { subject: { planId: plan.id, riskId: plan.riskId } },
        });
        const response = await this.getContingencyPlan(
          tx,
          workspaceId,
          plan.id,
        );
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "contingency.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  contingencyPlan(userId: string, workspaceId: string, planId: string) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      this.getContingencyPlan(tx, workspaceId, planId),
    );
  }

  updateContingencyPlan(
    userId: string,
    workspaceId: string,
    planId: string,
    expectedVersion: number,
    input: UpdateContingencyPlan,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.contingencyPlan.findFirst({
          where: { id: planId, workspaceId },
        });
        if (!current) notFound("Planul B nu a fost găsit.");
        versionMatch(current.version, expectedVersion);
        if (input.riskId) await this.ensureRisk(tx, workspaceId, input.riskId);

        const updated = await tx.contingencyPlan.update({
          where: { id: planId },
          data: {
            riskId: input.riskId,
            title: input.title,
            summary: input.summary,
            status: input.status,
            version: { increment: 1 },
          },
        });
        if (input.triggers) {
          await tx.contingencyTrigger.deleteMany({
            where: { workspaceId, planId },
          });
          await Promise.all(
            input.triggers.map((trigger) =>
              tx.contingencyTrigger.create({
                data: {
                  workspaceId,
                  planId,
                  triggerType: trigger.type,
                  configuration: trigger.configuration as Prisma.InputJsonValue,
                },
              }),
            ),
          );
        }
        if (input.actions) {
          await tx.contingencyAction.deleteMany({
            where: { workspaceId, planId },
          });
          await Promise.all(
            input.actions.map((action) =>
              tx.contingencyAction.create({
                data: { workspaceId, planId, ...action },
              }),
            ),
          );
        }
        const snapshot = await this.getContingencyPlan(tx, workspaceId, planId);
        await tx.contingencyPlanVersion.create({
          data: {
            workspaceId,
            planId,
            version: updated.version,
            snapshot: jsonSnapshot(snapshot),
            createdById: userId,
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "contingency.plan_updated.v1",
          aggregateType: "ContingencyPlan",
          aggregateId: planId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `contingency-plan-updated:${planId}:v${updated.version}`,
          payload: { subject: { planId, riskId: updated.riskId } },
        });
        return snapshot;
      },
    );
  }

  transitionContingency(
    userId: string,
    workspaceId: string,
    planId: string,
    transition: "APPROVE" | "COMPLETE" | "CANCEL",
    idempotencyKey: string,
    input: { version: number; reason: string },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          `contingency.${transition.toLowerCase()}`,
          idempotencyKey,
          { planId, input },
        );
        if (replay) return replay;
        const current = await tx.contingencyPlan.findFirst({
          where: { id: planId, workspaceId },
        });
        if (!current) notFound("Planul B nu a fost găsit.");
        versionMatch(current.version, input.version);
        const allowed =
          (transition === "APPROVE" && current.status === "DRAFT") ||
          (transition === "COMPLETE" && current.status === "ACTIVE") ||
          (transition === "CANCEL" &&
            ["DRAFT", "READY", "ACTIVE"].includes(current.status));
        if (!allowed) conflict("Tranziția Planului B nu este permisă.");
        const status =
          transition === "APPROVE"
            ? "READY"
            : transition === "COMPLETE"
              ? "COMPLETED"
              : "ARCHIVED";
        const updated = await tx.contingencyPlan.update({
          where: { id: planId },
          data: { status, version: { increment: 1 } },
        });
        await this.asyncEvents.record(tx, {
          eventName:
            transition === "APPROVE"
              ? "contingency.plan_approved.v1"
              : transition === "COMPLETE"
                ? "contingency.plan_completed.v1"
                : "contingency.plan_cancelled.v1",
          aggregateType: "ContingencyPlan",
          aggregateId: planId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `contingency-${transition.toLowerCase()}:${planId}:v${updated.version}`,
          payload: {
            subject: { planId, reason: input.reason, status: updated.status },
            activity: {
              category: "risks",
              action: `contingency_${transition.toLowerCase()}`,
              summary: `Plan B ${transition.toLowerCase()}: ${current.title}.`,
              entityType: "ContingencyPlan",
              entityId: planId,
            },
          },
        });
        const response = await this.getContingencyPlan(tx, workspaceId, planId);
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          `contingency.${transition.toLowerCase()}`,
          idempotencyKey,
          { planId, input },
          response,
        );
        return response;
      },
    );
  }

  simulateContingency(
    userId: string,
    workspaceId: string,
    planId: string,
    idempotencyKey: string,
    input: Record<string, unknown>,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        await this.getContingencyPlan(tx, workspaceId, planId);
        const replay = await this.replay(
          tx,
          userId,
          "contingency.simulate",
          idempotencyKey,
          { planId, input },
        );
        if (replay) return replay;
        const simulationId = randomUUID();
        const backgroundJobId = await this.asyncEvents.record(tx, {
          eventName: "contingency.plan_simulation_requested.v1",
          aggregateType: "ContingencySimulation",
          aggregateId: simulationId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `contingency-simulation:${workspaceId}:${idempotencyKey}`,
          userVisibleJob: true,
          payload: {
            subject: { simulationId, planId },
            contingencySimulation: { simulationId },
          },
        });
        if (!backgroundJobId) throw new Error("Simulation job missing");
        await tx.contingencySimulation.create({
          data: {
            id: simulationId,
            workspaceId,
            planId,
            requestedById: userId,
            backgroundJobId,
            input: input as Prisma.InputJsonValue,
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: backgroundJobId },
        });
        const response = { simulationId, job: mapJob(job) };
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "contingency.simulate",
          idempotencyKey,
          { planId, input },
          response,
        );
        return response;
      },
    );
  }

  activateContingency(
    userId: string,
    workspaceId: string,
    planId: string,
    idempotencyKey: string,
    input: { version: number; reason: string },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await tx.contingencyActivation.findUnique({
          where: {
            workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
          },
        });
        if (replay)
          return {
            activationId: replay.id,
            activatedAt: replay.createdAt.toISOString(),
          };
        const current = await tx.contingencyPlan.findFirst({
          where: { id: planId, workspaceId },
        });
        if (!current) notFound("Planul B nu a fost găsit.");
        versionMatch(current.version, input.version);
        if (current.status !== "READY")
          conflict("Planul B trebuie aprobat înainte de activare.");
        const snapshot = await this.getContingencyPlan(tx, workspaceId, planId);
        const activation = await tx.contingencyActivation.create({
          data: {
            workspaceId,
            planId,
            activatedById: userId,
            idempotencyKey,
            reason: input.reason,
            snapshot: jsonSnapshot(snapshot),
          },
        });
        const activeVersion = await tx.contingencyPlanVersion.findFirst({
          where: { planId, workspaceId },
          orderBy: { version: "desc" },
        });
        const actionResources: Array<{ type: string; id: string }> = [];
        for (const action of snapshot.actions) {
          const task = await tx.task.create({
            data: {
              workspaceId,
              title: action.title,
              description:
                action.description ??
                `Acțiune creată la activarea Planului B „${current.title}”.`,
              category: "contingency",
              priority: current.riskId ? "HIGH" : "MEDIUM",
              createdById: userId,
              source: "contingency_plan",
            },
          });
          actionResources.push({ type: "Task", id: task.id });
        }
        const updated = await tx.contingencyPlan.update({
          where: { id: planId },
          data: {
            status: "ACTIVE",
            activeVersionId: activeVersion?.id,
            activatedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await this.asyncEvents.record(tx, {
          eventName: "contingency.plan_activated.v1",
          aggregateType: "ContingencyPlan",
          aggregateId: planId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `contingency-plan-activated:${planId}`,
          payload: {
            subject: {
              planId,
              activationId: activation.id,
              resources: actionResources,
            },
            notification: {
              recipientUserId: userId,
              module: "risks",
              kind: "contingency_activated",
              priority: "high",
              title: "Plan B activat",
              body: current.title,
              actionUrl: `/contingency-plans/${planId}`,
            },
            activity: {
              category: "risks",
              action: "contingency_activated",
              summary: `Plan B activat: ${current.title}.`,
              entityType: "ContingencyPlan",
              entityId: planId,
            },
          },
        });
        return {
          activationId: activation.id,
          activatedAt: activation.createdAt.toISOString(),
          resources: actionResources,
          version: updated.version,
        };
      },
    );
  }

  automationTemplates(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await tx.automationTemplate.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
    }));
  }

  automationRules(userId: string, workspaceId: string, status?: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: (
        await tx.automationRule.findMany({
          where: {
            workspaceId,
            ...(status ? { status: status as never } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      ).map(mapAutomationRule),
    }));
  }

  createAutomationRule(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: CreateAutomationRule,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const replay = await this.replay(
          tx,
          userId,
          "automation.create",
          idempotencyKey,
          input,
        );
        if (replay) return replay;
        await this.entitlements.assertCapacity(
          tx,
          workspaceId,
          "MAX_ACTIVE_AUTOMATIONS",
          await tx.automationRule.count({
            where: { workspaceId, status: { not: "ARCHIVED" } },
          }),
        );
        const rule = await tx.automationRule.create({
          data: {
            workspaceId,
            name: input.name,
            description: input.description,
            triggerType: input.triggerType,
            triggerConfiguration:
              input.triggerConfiguration as Prisma.InputJsonValue,
            requiresApproval: input.requiresApproval,
            dslVersion: AUTOMATION_DSL_VERSION,
            createdById: userId,
          },
        });
        await Promise.all([
          ...(input.conditions ?? []).map((condition, position) =>
            tx.automationCondition.create({
              data: {
                workspaceId,
                ruleId: rule.id,
                field: condition.field,
                operator: condition.operator,
                value: condition.value as Prisma.InputJsonValue,
                position,
              },
            }),
          ),
          ...input.actions.map((action) =>
            tx.automationAction.create({
              data: {
                workspaceId,
                ruleId: rule.id,
                actionType: action.type,
                configuration: action.configuration as Prisma.InputJsonValue,
                position: action.position,
              },
            }),
          ),
        ]);
        await this.asyncEvents.record(tx, {
          eventName: "automation.rule_created.v1",
          aggregateType: "AutomationRule",
          aggregateId: rule.id,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `automation-rule-created:${rule.id}`,
          payload: { subject: { ruleId: rule.id } },
        });
        const response = await this.getAutomationRule(tx, workspaceId, rule.id);
        await this.saveReplay(
          tx,
          workspaceId,
          userId,
          "automation.create",
          idempotencyKey,
          input,
          response,
        );
        return response;
      },
    );
  }

  updateAutomationRule(
    userId: string,
    workspaceId: string,
    ruleId: string,
    expectedVersion: number,
    input: {
      name?: string;
      description?: string;
      status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";
      triggerType?: string;
      triggerConfiguration?: Record<string, unknown>;
      requiresApproval?: boolean;
      conditions?: Array<{
        field: string;
        operator: string;
        value: string | number | string[];
      }>;
      actions?: Array<{
        type: string;
        configuration: Record<string, unknown>;
        position: number;
      }>;
    },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.automationRule.findFirst({
          where: { id: ruleId, workspaceId },
        });
        if (!current) notFound("Automatizarea nu a fost găsită.");
        versionMatch(current.version, expectedVersion);
        const { conditions, actions, ...ruleInput } = input;
        const updated = await tx.automationRule.update({
          where: { id: ruleId },
          data: {
            ...ruleInput,
            triggerConfiguration: input.triggerConfiguration
              ? (input.triggerConfiguration as Prisma.InputJsonValue)
              : undefined,
            version: { increment: 1 },
          },
        });
        if (conditions) {
          await tx.automationCondition.deleteMany({
            where: { workspaceId, ruleId },
          });
          for (const [position, condition] of conditions.entries()) {
            await tx.automationCondition.create({
              data: {
                workspaceId,
                ruleId,
                field: condition.field,
                operator: condition.operator,
                value: condition.value as Prisma.InputJsonValue,
                position,
              },
            });
          }
        }
        if (actions) {
          await tx.automationAction.deleteMany({
            where: { workspaceId, ruleId },
          });
          for (const action of actions) {
            await tx.automationAction.create({
              data: {
                workspaceId,
                ruleId,
                actionType: action.type,
                configuration: action.configuration as Prisma.InputJsonValue,
                position: action.position,
              },
            });
          }
        }
        await this.asyncEvents.record(tx, {
          eventName: "automation.rule_updated.v1",
          aggregateType: "AutomationRule",
          aggregateId: ruleId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `automation-rule-updated:${ruleId}:v${updated.version}`,
          payload: { subject: { ruleId, status: updated.status } },
        });
        return this.getAutomationRule(tx, workspaceId, ruleId);
      },
    );
  }

  transitionAutomationRule(
    userId: string,
    workspaceId: string,
    ruleId: string,
    transition: "ACTIVATE" | "PAUSE" | "ARCHIVE",
    expectedVersion: number,
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const current = await tx.automationRule.findFirst({
          where: { id: ruleId, workspaceId },
        });
        if (!current) notFound("Automatizarea nu a fost găsită.");
        versionMatch(current.version, expectedVersion);
        if (transition === "ACTIVATE" && current.status === "ARCHIVED")
          conflict("O automatizare arhivată nu poate fi activată.");
        const status =
          transition === "ACTIVATE"
            ? "ACTIVE"
            : transition === "PAUSE"
              ? "PAUSED"
              : "ARCHIVED";
        const updated = await tx.automationRule.update({
          where: { id: ruleId },
          data: { status, version: { increment: 1 } },
        });
        await this.asyncEvents.record(tx, {
          eventName:
            transition === "ACTIVATE"
              ? "automation.activated.v1"
              : transition === "PAUSE"
                ? "automation.paused.v1"
                : "automation.disabled.v1",
          aggregateType: "AutomationRule",
          aggregateId: ruleId,
          aggregateVersion: updated.version,
          workspaceId,
          actorUserId: userId,
          correlationId,
          deduplicationKey: `automation-${transition.toLowerCase()}:${ruleId}:v${updated.version}`,
          payload: { subject: { ruleId, status } },
        });
        return this.getAutomationRule(tx, workspaceId, ruleId);
      },
    );
  }

  automationRule(userId: string, workspaceId: string, ruleId: string) {
    return this.database.withContext({ userId, workspaceId }, (tx) =>
      this.getAutomationRule(tx, workspaceId, ruleId),
    );
  }

  executeAutomation(
    userId: string,
    workspaceId: string,
    ruleId: string,
    idempotencyKey: string,
    input: { mode: "DRY_RUN" | "EXECUTE"; version: number },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const existing = await tx.automationExecution.findUnique({
          where: {
            workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
          },
        });
        if (existing) {
          if (!existing.backgroundJobId)
            conflict("Execuția așteaptă aprobare și nu are încă un job.");
          const job = await tx.backgroundJob.findUniqueOrThrow({
            where: { id: existing.backgroundJobId },
          });
          return { executionId: existing.id, job: mapJob(job) };
        }
        const rule = await tx.automationRule.findFirst({
          where: { id: ruleId, workspaceId },
        });
        if (!rule) notFound("Automatizarea nu a fost găsită.");
        versionMatch(rule.version, input.version);
        if (input.mode === "EXECUTE" && rule.status !== "ACTIVE")
          conflict("Activează regula înainte de execuția reală.");
        const executionId = randomUUID();
        const backgroundJobId = await this.asyncEvents.record(tx, {
          eventName: "automation.execution_requested.v1",
          aggregateType: "AutomationExecution",
          aggregateId: executionId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `automation-execution:${workspaceId}:${idempotencyKey}`,
          userVisibleJob: true,
          payload: {
            subject: { executionId, ruleId },
            automationExecution: { executionId },
          },
        });
        if (!backgroundJobId) throw new Error("Automation job missing");
        await tx.automationExecution.create({
          data: {
            id: executionId,
            workspaceId,
            ruleId,
            requestedById: userId,
            backgroundJobId,
            idempotencyKey,
            mode: input.mode,
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: backgroundJobId },
        });
        return { executionId, job: mapJob(job) };
      },
    );
  }

  automationExecutions(userId: string, workspaceId: string, ruleId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await tx.automationExecution.findMany({
        where: { workspaceId, ruleId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    }));
  }

  allAutomationExecutions(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await tx.automationExecution.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    }));
  }

  automationExecution(
    userId: string,
    workspaceId: string,
    executionId: string,
  ) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => {
      const execution = await tx.automationExecution.findFirst({
        where: { id: executionId, workspaceId },
      });
      if (!execution) notFound("Execuția automatizării nu a fost găsită.");
      const [steps, approval] = await Promise.all([
        tx.automationExecutionStep.findMany({
          where: { workspaceId, executionId },
          orderBy: { createdAt: "asc" },
        }),
        tx.automationExecutionApproval.findUnique({
          where: { executionId },
        }),
      ]);
      return { ...execution, steps, approval };
    });
  }

  decideAutomationExecution(
    userId: string,
    workspaceId: string,
    executionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    input: { decision: "APPROVE" | "REJECT"; reason?: string },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const execution = await tx.automationExecution.findFirst({
          where: { id: executionId, workspaceId },
        });
        if (!execution) notFound("Execuția automatizării nu a fost găsită.");
        versionMatch(execution.version, expectedVersion);
        const existing = await tx.automationExecutionApproval.findUnique({
          where: { executionId },
        });
        if (existing) {
          if (existing.decision !== input.decision)
            conflict("Execuția a primit deja o altă decizie.");
          return this.automationExecution(userId, workspaceId, executionId);
        }
        if (execution.status !== "WAITING_APPROVAL")
          conflict("Execuția nu așteaptă aprobare.");
        await tx.automationExecutionApproval.create({
          data: {
            workspaceId,
            executionId,
            reviewerId: userId,
            decision: input.decision,
            reason: input.reason,
          },
        });
        if (input.decision === "REJECT") {
          await tx.automationExecution.update({
            where: { id: executionId },
            data: {
              status: "CANCELLED",
              completedAt: new Date(),
              version: { increment: 1 },
            },
          });
          return { executionId, status: "CANCELLED" };
        }
        const backgroundJobId = await this.asyncEvents.record(tx, {
          eventName: "automation.execution_requested.v1",
          aggregateType: "AutomationExecution",
          aggregateId: executionId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `automation-execution-approved:${executionId}`,
          userVisibleJob: true,
          payload: {
            subject: { executionId, ruleId: execution.ruleId },
            automationExecution: { executionId },
          },
        });
        if (!backgroundJobId) throw new Error("Automation job missing");
        await tx.automationExecution.update({
          where: { id: executionId },
          data: {
            status: "QUEUED",
            backgroundJobId,
            version: { increment: 1 },
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: backgroundJobId },
        });
        return { executionId, status: "QUEUED", job: mapJob(job) };
      },
    );
  }

  weeklyDigests(userId: string, workspaceId: string) {
    return this.database.withContext({ userId, workspaceId }, async (tx) => ({
      items: await tx.weeklyIntelligenceDigest.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    }));
  }

  createWeeklyDigest(
    userId: string,
    workspaceId: string,
    idempotencyKey: string,
    input: { periodStart?: string; periodEnd?: string },
    correlationId: string,
  ) {
    return this.database.withContext(
      { userId, workspaceId, correlationId },
      async (tx) => {
        const existingByKey = await tx.weeklyIntelligenceDigest.findUnique({
          where: {
            workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
          },
        });
        if (existingByKey) {
          const job = await tx.backgroundJob.findUniqueOrThrow({
            where: { id: existingByKey.backgroundJobId },
          });
          return { digestId: existingByKey.id, job: mapJob(job) };
        }
        const periodEnd = input.periodEnd
          ? new Date(input.periodEnd)
          : new Date();
        const periodStart = input.periodStart
          ? new Date(input.periodStart)
          : new Date(periodEnd.getTime() - 7 * 86_400_000);
        if (periodStart >= periodEnd)
          problem(
            "VALIDATION_FAILED",
            HttpStatus.UNPROCESSABLE_ENTITY,
            "Perioada digestului este invalidă.",
          );
        const existingPeriod = await tx.weeklyIntelligenceDigest.findUnique({
          where: {
            workspaceId_periodStart_periodEnd: {
              workspaceId,
              periodStart,
              periodEnd,
            },
          },
        });
        if (existingPeriod) {
          const job = await tx.backgroundJob.findUniqueOrThrow({
            where: { id: existingPeriod.backgroundJobId },
          });
          return { digestId: existingPeriod.id, job: mapJob(job) };
        }
        const digestId = randomUUID();
        const backgroundJobId = await this.asyncEvents.record(tx, {
          eventName: "digest.weekly_requested.v1",
          aggregateType: "WeeklyIntelligenceDigest",
          aggregateId: digestId,
          workspaceId,
          actorUserId: userId,
          correlationId,
          idempotencyKey,
          deduplicationKey: `weekly-digest:${workspaceId}:${periodStart.toISOString()}:${periodEnd.toISOString()}`,
          userVisibleJob: true,
          payload: {
            subject: {
              digestId,
              periodStart: periodStart.toISOString(),
              periodEnd: periodEnd.toISOString(),
            },
            weeklyDigest: { digestId },
          },
        });
        if (!backgroundJobId) throw new Error("Weekly digest job missing");
        await tx.weeklyIntelligenceDigest.create({
          data: {
            id: digestId,
            workspaceId,
            requestedById: userId,
            backgroundJobId,
            idempotencyKey,
            periodStart,
            periodEnd,
          },
        });
        const job = await tx.backgroundJob.findUniqueOrThrow({
          where: { id: backgroundJobId },
        });
        return { digestId, job: mapJob(job) };
      },
    );
  }

  private async getProposal(
    tx: Transaction,
    workspaceId: string,
    proposalId: string,
  ) {
    const proposal = await tx.copilotProposal.findFirst({
      where: { id: proposalId, workspaceId },
    });
    if (!proposal) notFound("Propunerea nu a fost găsită.");
    const [actions, approvals, executions] = await Promise.all([
      tx.copilotProposalAction.findMany({
        where: { proposalId, workspaceId },
        orderBy: { position: "asc" },
      }),
      tx.copilotApproval.findMany({
        where: { proposalId, workspaceId },
        orderBy: { createdAt: "desc" },
      }),
      tx.copilotExecution.findMany({
        where: { proposalId, workspaceId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { ...mapProposal(proposal), actions, approvals, executions };
  }

  private async getRisk(tx: Transaction, workspaceId: string, riskId: string) {
    const risk = await tx.risk.findFirst({
      where: { id: riskId, workspaceId, deletedAt: null },
    });
    if (!risk) notFound("Riscul nu a fost găsit.");
    const [signals, assessments, mitigations, updates, plans] =
      await Promise.all([
        tx.riskSignal.findMany({
          where: { riskId, workspaceId },
          orderBy: { detectedAt: "desc" },
        }),
        tx.riskAssessment.findMany({
          where: { riskId, workspaceId },
          orderBy: { createdAt: "desc" },
        }),
        tx.riskMitigationAction.findMany({
          where: { riskId, workspaceId },
          orderBy: { createdAt: "asc" },
        }),
        tx.riskUpdate.findMany({
          where: { riskId, workspaceId },
          orderBy: { createdAt: "desc" },
        }),
        tx.contingencyPlan.findMany({
          where: { riskId, workspaceId },
          orderBy: { createdAt: "desc" },
        }),
      ]);
    return {
      ...mapRisk(risk),
      signals,
      assessments,
      mitigations,
      updates,
      contingencyPlans: plans.map(mapContingencyPlan),
    };
  }

  private async ensureRisk(
    tx: Transaction,
    workspaceId: string,
    riskId: string,
  ) {
    const risk = await tx.risk.findFirst({
      where: { id: riskId, workspaceId, deletedAt: null },
    });
    if (!risk) notFound("Riscul nu a fost găsit.");
    return risk;
  }

  private async getContingencyPlan(
    tx: Transaction,
    workspaceId: string,
    planId: string,
  ) {
    const plan = await tx.contingencyPlan.findFirst({
      where: { id: planId, workspaceId },
    });
    if (!plan) notFound("Planul B nu a fost găsit.");
    const [triggers, actions, simulations, activations] = await Promise.all([
      tx.contingencyTrigger.findMany({
        where: { planId, workspaceId },
        orderBy: { createdAt: "asc" },
      }),
      tx.contingencyAction.findMany({
        where: { planId, workspaceId },
        orderBy: { position: "asc" },
      }),
      tx.contingencySimulation.findMany({
        where: { planId, workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      tx.contingencyActivation.findMany({
        where: { planId, workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return {
      ...mapContingencyPlan(plan),
      triggers,
      actions,
      simulations,
      activations,
    };
  }

  private async getAutomationRule(
    tx: Transaction,
    workspaceId: string,
    ruleId: string,
  ) {
    const rule = await tx.automationRule.findFirst({
      where: { id: ruleId, workspaceId },
    });
    if (!rule) notFound("Automatizarea nu a fost găsită.");
    const [conditions, actions] = await Promise.all([
      tx.automationCondition.findMany({
        where: { ruleId, workspaceId },
        orderBy: { position: "asc" },
      }),
      tx.automationAction.findMany({
        where: { ruleId, workspaceId },
        orderBy: { position: "asc" },
      }),
    ]);
    return { ...mapAutomationRule(rule), conditions, actions };
  }

  private riskEvent(
    tx: Transaction,
    risk: Prisma.RiskGetPayload<object>,
    userId: string,
    correlationId: string,
    eventName:
      | "risk.created.v1"
      | "risk.updated.v1"
      | "risk.mitigation_started.v1"
      | "risk.resolved.v1",
  ) {
    return this.asyncEvents.record(tx, {
      eventName,
      aggregateType: "Risk",
      aggregateId: risk.id,
      aggregateVersion: risk.version,
      workspaceId: risk.workspaceId,
      actorUserId: userId,
      correlationId,
      deduplicationKey: `${eventName}:${risk.id}:v${risk.version}`,
      payload: {
        subject: { riskId: risk.id, score: risk.score, level: risk.level },
        activity: {
          category: "risks",
          action: eventName.split(".")[1],
          summary: `Risc ${eventName.includes("created") ? "creat" : eventName.includes("resolved") ? "rezolvat" : "actualizat"}: ${risk.title}.`,
          entityType: "Risk",
          entityId: risk.id,
        },
      },
    });
  }

  private async replay(
    tx: Transaction,
    userId: string,
    operation: string,
    key: string,
    request: unknown,
  ) {
    const existing = await tx.idempotencyRecord.findUnique({
      where: {
        actorUserId_operation_key: { actorUserId: userId, operation, key },
      },
    });
    if (!existing) return null;
    if (existing.requestHash !== hashJson(request))
      problem(
        "IDEMPOTENCY_CONFLICT",
        HttpStatus.CONFLICT,
        "Cheia idempotentă a fost folosită pentru altă cerere.",
      );
    return existing.responseBody as Prisma.JsonObject;
  }

  private saveReplay(
    tx: Transaction,
    workspaceId: string,
    userId: string,
    operation: string,
    key: string,
    request: unknown,
    response: unknown,
  ) {
    return tx.idempotencyRecord.create({
      data: {
        workspaceId,
        actorUserId: userId,
        operation,
        key,
        requestHash: hashJson(request),
        responseStatus: 200,
        responseBody: response as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  }
}

function assertCopilotActionCapabilities(
  actions: Array<{
    actionType: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  }>,
  actorCapabilities: CapabilityKey[],
) {
  const granted = new Set(actorCapabilities);
  for (const action of actions) {
    const definition = copilotDefinitionForAction(action.actionType);
    if (!definition)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Acțiunea Copilot nu are un adaptor autorizat.",
      );
    const required = definition.requiredCapability;
    if (!granted.has(required as CapabilityKey))
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Nu ai permisiunea necesară pentru această acțiune Copilot.",
        `Este necesară capabilitatea ${required}.`,
      );
    if (
      copilotRiskRank(action.riskLevel) <
      copilotRiskRank(definition.minimumRisk)
    )
      problem(
        "VALIDATION_FAILED",
        HttpStatus.UNPROCESSABLE_ENTITY,
        "Nivelul de risc al acțiunii este sub minimul impus de platformă.",
      );
  }
}

function copilotRiskRank(value: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL") {
  return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].indexOf(value);
}

async function runIds(tx: Transaction, conversationId: string) {
  return (
    await tx.copilotRun.findMany({
      where: { conversationId },
      select: { id: true },
    })
  ).map((run) => run.id);
}

async function riskSummary(tx: Transaction, workspaceId: string) {
  const rows = await tx.risk.groupBy({
    by: ["level"],
    where: {
      workspaceId,
      deletedAt: null,
      status: { notIn: ["RESOLVED", "ARCHIVED"] },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(
    rows.map((row) => [row.level.toLowerCase(), row._count._all]),
  );
}

async function validateMembership(
  tx: Transaction,
  workspaceId: string,
  membershipId?: string,
) {
  if (!membershipId) return;
  const membership = await tx.workspaceMembership.findFirst({
    where: { id: membershipId, workspaceId, status: "ACTIVE" },
  });
  if (!membership)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.UNPROCESSABLE_ENTITY,
      "Responsabilul nu este un membru activ al workspace-ului.",
    );
}

function mapConversation(value: Prisma.CopilotConversationGetPayload<object>) {
  return {
    id: value.id,
    title: value.title,
    surface: value.surface,
    status: value.status.toLowerCase(),
    version: value.version,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function mapMessage(value: Prisma.CopilotMessageGetPayload<object>) {
  return {
    id: value.id,
    conversationId: value.conversationId,
    role: value.role.toLowerCase(),
    content: value.content,
    status: value.status.toLowerCase(),
    metadata: value.metadata,
    createdAt: value.createdAt.toISOString(),
  };
}

function mapRun(value: Prisma.CopilotRunGetPayload<object>) {
  return {
    id: value.id,
    conversationId: value.conversationId,
    status: value.status.toLowerCase(),
    provider: value.provider,
    model: value.model,
    fallbackUsed: value.fallbackUsed,
    errorCode: value.errorCode,
    createdAt: value.createdAt.toISOString(),
    completedAt: iso(value.completedAt),
  };
}

function mapProposal(value: Prisma.CopilotProposalGetPayload<object>) {
  return {
    id: value.id,
    runId: value.runId,
    planId: value.planId,
    stepPosition: value.stepPosition,
    title: value.title,
    summary: value.summary,
    status: value.status.toLowerCase(),
    riskLevel: value.riskLevel.toLowerCase(),
    version: value.version,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function mapRisk(value: Prisma.RiskGetPayload<object>) {
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    category: value.category.toLowerCase(),
    status: value.status.toLowerCase(),
    probability: value.probability,
    impact: value.impact,
    score: value.score,
    level: value.level.toLowerCase(),
    ownerMembershipId: value.ownerMembershipId,
    dueAt: iso(value.dueAt),
    source: value.source.toLowerCase(),
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    resolutionNote: value.resolutionNote,
    version: value.version,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function mapContingencyPlan(value: Prisma.ContingencyPlanGetPayload<object>) {
  return {
    id: value.id,
    riskId: value.riskId,
    title: value.title,
    summary: value.summary,
    status: value.status.toLowerCase(),
    version: value.version,
    activatedAt: iso(value.activatedAt),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function mapAutomationRule(value: Prisma.AutomationRuleGetPayload<object>) {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    status: value.status.toLowerCase(),
    triggerType: value.triggerType,
    triggerConfiguration: value.triggerConfiguration,
    requiresApproval: value.requiresApproval,
    dslVersion: value.dslVersion,
    version: value.version,
    lastExecutedAt: iso(value.lastExecutedAt),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}

function resourceReference(type: string, value: unknown) {
  const id =
    value && typeof value === "object" && "id" in value
      ? (value as { id?: unknown }).id
      : undefined;
  if (typeof id !== "string" || !id)
    throw new Error(`Copilot adapter ${type} returned no resource id`);
  return { type, id };
}

function record(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 180)
    : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jsonSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function redactCopilotAuditValue(value: unknown): Prisma.InputJsonValue {
  if (Array.isArray(value)) return value.map(redactCopilotAuditValue);
  if (!value || typeof value !== "object")
    return value as Prisma.InputJsonValue;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /password|secret|token|api.?key|mfa|card/i.test(key)
        ? "[REDACTED]"
        : redactCopilotAuditValue(item),
    ]),
  ) as Prisma.InputJsonValue;
}

function versionMatch(current: number, expected: number) {
  if (current !== expected)
    problem(
      "VERSION_CONFLICT",
      HttpStatus.PRECONDITION_FAILED,
      "Versiunea resursei s-a schimbat.",
      undefined,
      undefined,
      { latestVersion: current },
    );
}

function conflict(message: string): never {
  problem("VERSION_CONFLICT", HttpStatus.CONFLICT, message);
}

function notFound(message: string): never {
  problem("NOT_FOUND", HttpStatus.NOT_FOUND, message);
}
