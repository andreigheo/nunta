import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  activateContingencyPlanSchema,
  automationExecutionDecisionSchema,
  automationRuleQuerySchema,
  automationTransitionSchema,
  contingencyTransitionSchema,
  contingencySimulationSchema,
  copilotConversationQuerySchema,
  createAutomationRuleSchema,
  createContingencyPlanSchema,
  createCopilotConversationSchema,
  createCopilotFeedbackSchema,
  createCopilotMessageSchema,
  createRiskMitigationSchema,
  createRiskAssessmentSchema,
  createRiskSchema,
  createWeeklyDigestSchema,
  executeAutomationRuleSchema,
  executeCopilotProposalSchema,
  reviewCopilotProposalSchema,
  riskTransitionSchema,
  riskQuerySchema,
  updateAutomationRuleSchema,
  updateContingencyPlanSchema,
  updateCopilotConversationSchema,
  updateCopilotProposalSchema,
  updateRiskSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { IntelligenceService } from "./intelligence.service";

@ApiTags("intelligence")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@Controller("api/v1/workspaces/:workspaceId")
export class IntelligenceController {
  constructor(
    @Inject(IntelligenceService) private readonly service: IntelligenceService,
  ) {}

  @Get("copilot/conversations")
  @RequireCapability("copilot.read")
  async conversations(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(copilotConversationQuerySchema, query);
    return apiResponse(
      request,
      await this.service.conversations(
        auth.userId,
        uuid(workspaceId),
        parsed.cursor,
      ),
    );
  }

  @Post("copilot/conversations")
  @RequireCapability("copilot.use")
  async createConversation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createConversation(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createCopilotConversationSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("copilot/conversations/:conversationId")
  @RequireCapability("copilot.use")
  async updateConversation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateConversation(
      auth.userId,
      uuid(workspaceId),
      uuid(conversationId),
      parseVersion(ifMatch),
      parseWithSchema(updateCopilotConversationSchema, body),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Delete("copilot/conversations/:conversationId")
  @RequireCapability("copilot.use")
  async archiveConversation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.archiveConversation(
      auth.userId,
      uuid(workspaceId),
      uuid(conversationId),
      parseVersion(ifMatch),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("copilot/conversations/:conversationId")
  @RequireCapability("copilot.read")
  async conversation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.conversation(
      auth.userId,
      uuid(workspaceId),
      uuid(conversationId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("copilot/conversations/:conversationId/messages")
  @RequireCapability("copilot.use")
  async message(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("conversationId") conversationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.sendMessage(
        auth.userId,
        uuid(workspaceId),
        uuid(conversationId),
        idempotencyKey(key),
        parseWithSchema(createCopilotMessageSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("copilot/runs/:runId")
  @RequireCapability("copilot.read")
  async run(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("runId") runId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.run(auth.userId, uuid(workspaceId), uuid(runId)),
    );
  }

  @Post("copilot/messages/:messageId/feedback")
  @RequireCapability("copilot.use")
  async feedback(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("messageId") messageId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.feedback(
        auth.userId,
        uuid(workspaceId),
        uuid(messageId),
        parseWithSchema(createCopilotFeedbackSchema, body),
      ),
    );
  }

  @Get("copilot/proposals")
  @RequireCapability("copilot.read")
  async proposals(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.proposals(auth.userId, uuid(workspaceId)),
    );
  }

  @Get("copilot/proposals/:proposalId")
  @RequireCapability("copilot.read")
  async proposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.proposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("copilot/proposals/:proposalId")
  @RequireCapability("copilot.create_proposal")
  async updateProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(updateCopilotProposalSchema, body);
    const expectedVersion = parseVersion(ifMatch);
    if (input.version !== expectedVersion)
      problem(
        "VERSION_CONFLICT",
        HttpStatus.PRECONDITION_FAILED,
        "Versiunea din body nu corespunde cu If-Match.",
      );
    const data = await this.service.updateProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      expectedVersion,
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("copilot/proposals/:proposalId/reviews")
  @RequireCapability("copilot.review_proposals")
  async reviewProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(reviewCopilotProposalSchema, body);
    if (input.decision === "APPROVE") {
      const proposal = await this.service.proposal(
        auth.userId,
        uuid(workspaceId),
        uuid(proposalId),
      );
      requireProposalApprovalCapability(request, proposal.riskLevel);
    }
    const data = await this.service.reviewProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("copilot/proposals/:proposalId/approve")
  @RequireCapability("copilot.review_proposals")
  async approveProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(reviewCopilotProposalSchema, {
      ...(body as Record<string, unknown>),
      decision: "APPROVE",
      version: parseVersion(ifMatch),
    });
    const proposal = await this.service.proposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
    );
    requireProposalApprovalCapability(request, proposal.riskLevel);
    const data = await this.service.reviewProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      parsed,
      request.correlationId,
      idempotencyKey(key),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("copilot/proposals/:proposalId/reject")
  @RequireCapability("copilot.review_proposals")
  async rejectProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(reviewCopilotProposalSchema, {
      ...(body as Record<string, unknown>),
      decision: "REJECT",
      version: parseVersion(ifMatch),
    });
    const data = await this.service.reviewProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      parsed,
      request.correlationId,
      idempotencyKey(key),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("copilot/proposals/:proposalId/executions")
  @RequireCapability("copilot.execute_proposals")
  async executeProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.executeProposal(
        auth.userId,
        uuid(workspaceId),
        uuid(proposalId),
        idempotencyKey(key),
        parseWithSchema(executeCopilotProposalSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("copilot/proposals/:proposalId/execute")
  @RequireCapability("copilot.execute_proposals")
  async executeProposalAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(executeCopilotProposalSchema, {
      ...(body as Record<string, unknown>),
      version: parseVersion(ifMatch),
    });
    return apiResponse(
      request,
      await this.service.executeProposal(
        auth.userId,
        uuid(workspaceId),
        uuid(proposalId),
        idempotencyKey(key),
        input,
        request.correlationId,
      ),
    );
  }

  @Get("risks")
  @RequireCapability("risk.read")
  async risks(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.risks(
        auth.userId,
        uuid(workspaceId),
        parseWithSchema(riskQuerySchema, query) as Record<
          string,
          string | undefined
        >,
      ),
    );
  }

  @Post("risks")
  @RequireCapability("risk.write")
  async createRisk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createRisk(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createRiskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("risks/:riskId")
  @RequireCapability("risk.read")
  async risk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("riskId") riskId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.risk(
      auth.userId,
      uuid(workspaceId),
      uuid(riskId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("risks/:riskId")
  @RequireCapability("risk.write")
  async updateRisk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("riskId") riskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateRisk(
      auth.userId,
      uuid(workspaceId),
      uuid(riskId),
      parseVersion(ifMatch),
      parseWithSchema(updateRiskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Delete("risks/:riskId")
  @RequireCapability("risk.write")
  async deleteRisk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("riskId") riskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.deleteRisk(
      auth.userId,
      uuid(workspaceId),
      uuid(riskId),
      parseVersion(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("risks/:riskId/transitions")
  @RequireCapability("risk.write")
  async transitionRisk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("riskId") riskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(riskTransitionSchema, body);
    if (input.version !== parseVersion(ifMatch))
      problem(
        "VERSION_CONFLICT",
        HttpStatus.PRECONDITION_FAILED,
        "Versiunea din body nu corespunde cu If-Match.",
      );
    const data = await this.service.transitionRisk(
      auth.userId,
      uuid(workspaceId),
      uuid(riskId),
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("risks/:riskId/assessments")
  @RequireCapability("risk.assess")
  async assessRisk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("riskId") riskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(createRiskAssessmentSchema, body);
    if (input.version !== parseVersion(ifMatch))
      problem(
        "VERSION_CONFLICT",
        HttpStatus.PRECONDITION_FAILED,
        "Versiunea din body nu corespunde cu If-Match.",
      );
    const data = await this.service.assessRisk(
      auth.userId,
      uuid(workspaceId),
      uuid(riskId),
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("risks/:riskId/mitigations")
  @RequireCapability("risk.write")
  async mitigation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("riskId") riskId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.addMitigation(
        auth.userId,
        uuid(workspaceId),
        uuid(riskId),
        parseWithSchema(createRiskMitigationSchema, body),
      ),
    );
  }

  @Post("risk-detections")
  @RequireCapability("risk.detect")
  async detectRisks(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.detectRisks(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("contingency-plans")
  @RequireCapability("contingency.read")
  async contingencyPlans(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.contingencyPlans(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("contingency-plans")
  @RequireCapability("contingency.write")
  async createContingencyPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createContingencyPlan(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createContingencyPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("contingency-plans/:planId")
  @RequireCapability("contingency.read")
  async contingencyPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.contingencyPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("contingency-plans/:planId")
  @RequireCapability("contingency.write")
  async updateContingencyPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateContingencyPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      parseVersion(ifMatch),
      parseWithSchema(updateContingencyPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("contingency-plans/:planId/simulations")
  @RequireCapability("contingency.write")
  async simulateContingency(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.simulateContingency(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        idempotencyKey(key),
        parseWithSchema(contingencySimulationSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("contingency-plans/:planId/activations")
  @RequireCapability("contingency.activate")
  async activateContingency(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.activateContingency(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        idempotencyKey(key),
        parseWithSchema(activateContingencyPlanSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("contingency-plans/:planId/approve")
  @RequireCapability("contingency.approve")
  async approveContingency(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(contingencyTransitionSchema, {
      ...(body as Record<string, unknown>),
      version: parseVersion(ifMatch),
    });
    const data = await this.service.transitionContingency(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      "APPROVE",
      idempotencyKey(key),
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("contingency-plans/:planId/activate")
  @RequireCapability("contingency.activate")
  async activateContingencyAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(activateContingencyPlanSchema, {
      ...(body as Record<string, unknown>),
      version: parseVersion(ifMatch),
    });
    return apiResponse(
      request,
      await this.service.activateContingency(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        idempotencyKey(key),
        input,
        request.correlationId,
      ),
    );
  }

  @Post("contingency-plans/:planId/complete")
  @RequireCapability("contingency.complete")
  async completeContingency(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionContingency(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      "COMPLETE",
      idempotencyKey(key),
      parseWithSchema(contingencyTransitionSchema, {
        ...(body as Record<string, unknown>),
        version: parseVersion(ifMatch),
      }),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("contingency-plans/:planId/cancel")
  @RequireCapability("contingency.write")
  async cancelContingency(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionContingency(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      "CANCEL",
      idempotencyKey(key),
      parseWithSchema(contingencyTransitionSchema, {
        ...(body as Record<string, unknown>),
        version: parseVersion(ifMatch),
      }),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("automation-templates")
  @RequireCapability("automation.read")
  async automationTemplates(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.automationTemplates(auth.userId, uuid(workspaceId)),
    );
  }

  @Get("automation-rules")
  @RequireCapability("automation.read")
  async automationRules(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(automationRuleQuerySchema, query);
    return apiResponse(
      request,
      await this.service.automationRules(
        auth.userId,
        uuid(workspaceId),
        parsed.status,
      ),
    );
  }

  @Post("automation-rules")
  @RequireCapability("automation.write")
  async createAutomationRule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createAutomationRule(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createAutomationRuleSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("automation-rules/:ruleId")
  @RequireCapability("automation.read")
  async automationRule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("ruleId") ruleId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.automationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(ruleId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("automation-rules/:ruleId")
  @RequireCapability("automation.write")
  async updateAutomationRule(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("ruleId") ruleId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateAutomationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(ruleId),
      parseVersion(ifMatch),
      parseWithSchema(updateAutomationRuleSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("automation-rules/:ruleId/executions")
  @RequireCapability("automation.execute")
  async executeAutomation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("ruleId") ruleId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.executeAutomation(
        auth.userId,
        uuid(workspaceId),
        uuid(ruleId),
        idempotencyKey(key),
        parseWithSchema(executeAutomationRuleSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("automation-rules/:ruleId/executions")
  @RequireCapability("automation.read")
  async automationExecutions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("ruleId") ruleId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.automationExecutions(
        auth.userId,
        uuid(workspaceId),
        uuid(ruleId),
      ),
    );
  }

  @Get("automations")
  @RequireCapability("automation.read")
  async automationsAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(automationRuleQuerySchema, query);
    return apiResponse(
      request,
      await this.service.automationRules(
        auth.userId,
        uuid(workspaceId),
        parsed.status,
      ),
    );
  }

  @Post("automations")
  @RequireCapability("automation.write")
  async createAutomationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createAutomationRule(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createAutomationRuleSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("automations/:automationId")
  @RequireCapability("automation.read")
  async automationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("automationId") automationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.automationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(automationId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("automations/:automationId")
  @RequireCapability("automation.write")
  async updateAutomationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("automationId") automationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateAutomationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(automationId),
      parseVersion(ifMatch),
      parseWithSchema(updateAutomationRuleSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Delete("automations/:automationId")
  @RequireCapability("automation.write")
  async deleteAutomationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("automationId") automationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionAutomationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(automationId),
      "ARCHIVE",
      parseVersion(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("automations/:automationId/activate")
  @RequireCapability("automation.activate")
  async activateAutomationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("automationId") automationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(automationTransitionSchema, {
      ...(body as Record<string, unknown>),
      version: parseVersion(ifMatch),
    });
    const data = await this.service.transitionAutomationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(automationId),
      "ACTIVATE",
      parsed.version,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("automations/:automationId/pause")
  @RequireCapability("automation.pause")
  async pauseAutomationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("automationId") automationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const parsed = parseWithSchema(automationTransitionSchema, {
      ...(body as Record<string, unknown>),
      version: parseVersion(ifMatch),
    });
    const data = await this.service.transitionAutomationRule(
      auth.userId,
      uuid(workspaceId),
      uuid(automationId),
      "PAUSE",
      parsed.version,
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post(["automations/:automationId/test", "automations/:automationId/dry-run"])
  @RequireCapability("automation.execute")
  async dryRunAutomationAlias(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("automationId") automationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.executeAutomation(
        auth.userId,
        uuid(workspaceId),
        uuid(automationId),
        idempotencyKey(key),
        { mode: "DRY_RUN", version: parseVersion(ifMatch) },
        request.correlationId,
      ),
    );
  }

  @Get("automation-executions")
  @RequireCapability("automation.view_executions")
  async allAutomationExecutions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.allAutomationExecutions(
        auth.userId,
        uuid(workspaceId),
      ),
    );
  }

  @Get("automation-executions/:executionId")
  @RequireCapability("automation.view_executions")
  async automationExecution(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("executionId") executionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.automationExecution(
        auth.userId,
        uuid(workspaceId),
        uuid(executionId),
      ),
    );
  }

  @Get("weekly-digests")
  @RequireCapability("copilot.read")
  async weeklyDigests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.weeklyDigests(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("weekly-digests")
  @RequireCapability("copilot.use")
  async createWeeklyDigest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createWeeklyDigest(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createWeeklyDigestSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post([
    "automation-executions/:executionId/approve",
    "automation-executions/:executionId/reject",
  ])
  @RequireCapability("automation.approve")
  async decideAutomationExecution(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("executionId") executionId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.decideAutomationExecution(
        auth.userId,
        uuid(workspaceId),
        uuid(executionId),
        parseVersion(ifMatch),
        idempotencyKey(key),
        parseWithSchema(automationExecutionDecisionSchema, {
          ...(body as Record<string, unknown>),
          decision: request.path.endsWith("/approve") ? "APPROVE" : "REJECT",
        }),
        request.correlationId,
      ),
    );
  }
}

function uuid(value: string) {
  return parseUuid(value, "id");
}

function resourceVersion(value: { version?: unknown }) {
  return typeof value.version === "number" ? value.version : undefined;
}

function idempotencyKey(value: string | undefined) {
  if (!value || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key este obligatoriu.",
    );
  return value;
}

function parseVersion(value: string | undefined) {
  if (!value)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match este obligatoriu.",
    );
  const parsed = Number(value.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(parsed) || parsed < 1)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "If-Match este invalid.",
    );
  return parsed;
}

function requireProposalApprovalCapability(
  request: WeddingOsRequest,
  riskLevel: string,
) {
  const required =
    riskLevel === "HIGH" || riskLevel === "CRITICAL"
      ? "copilot.approve_high_risk"
      : riskLevel === "MEDIUM"
        ? "copilot.approve_medium_risk"
        : "copilot.approve_low_risk";
  if (!request.membership?.capabilities.includes(required as never))
    problem(
      "FORBIDDEN",
      HttpStatus.FORBIDDEN,
      `Lipsește capabilitatea ${required}.`,
    );
}
