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
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  applyPlanProposalRequestSchema,
  copyTaskSchema,
  createCalendarEventSchema,
  createMilestoneSchema,
  createPlanGenerationRequestSchema,
  createTaskCommentSchema,
  createTaskSchema,
  planningExportRequestSchema,
  rejectPlanProposalSchema,
  replaceTaskDependenciesSchema,
  taskTransitionSchema,
  timelineRecalculationRequestSchema,
  updateCalendarEventSchema,
  updateMilestoneSchema,
  updatePlanProposalSchema,
  updateTaskCommentSchema,
  updateTaskSchema,
} from "@weddingos/contracts";
import type { Response } from "express";
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
import { PlanningService } from "./planning.service";

@ApiTags("planning")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("planning.read")
@Controller("api/v1/workspaces/:workspaceId")
export class PlanningController {
  constructor(
    @Inject(PlanningService) private readonly planning: PlanningService,
  ) {}

  @Post("plan-generations")
  @RequireCapability("planning.generate")
  async generate(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.generate(
      auth.userId,
      uuid(workspaceId),
      parseVersion(ifMatch),
      idempotencyKey(key),
      parseWithSchema(createPlanGenerationRequestSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data);
  }

  @Get("plan-proposals")
  async proposals(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.planning.proposals(
      auth.userId,
      uuid(workspaceId),
      cursor,
    );
    return apiResponse(request, result, {
      nextCursor: result.nextCursor ?? undefined,
    });
  }

  @Get("plan-proposals/:proposalId")
  async proposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.proposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("plan-proposals/:proposalId")
  @RequireCapability("planning.write")
  async updateProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.updateProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      parseVersion(ifMatch),
      parseWithSchema(updatePlanProposalSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("plan-proposals/:proposalId/reject")
  @RequireCapability("planning.write")
  async rejectProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.rejectProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      parseVersion(ifMatch),
      parseWithSchema(rejectPlanProposalSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("plan-proposals/:proposalId/apply")
  @RequireCapability("planning.apply")
  async applyProposal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("proposalId") proposalId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.applyProposal(
      auth.userId,
      uuid(workspaceId),
      uuid(proposalId),
      parseVersion(ifMatch),
      idempotencyKey(key),
      parseWithSchema(applyPlanProposalRequestSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data);
  }

  @Get("tasks")
  @RequireCapability("task.read")
  async tasks(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.planning.tasks(
      auth.userId,
      uuid(workspaceId),
      query,
    );
    return apiResponse(request, result, {
      nextCursor: result.nextCursor ?? undefined,
    });
  }

  @Post("tasks")
  @RequireCapability("task.write")
  async createTask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.createTask(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createTaskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("tasks/:taskId")
  @RequireCapability("task.read")
  async task(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.task(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("tasks/:taskId")
  @RequireCapability("task.write")
  async updateTask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.updateTask(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      parseVersion(ifMatch),
      parseWithSchema(updateTaskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("tasks/:taskId")
  @RequireCapability("task.delete")
  async deleteTask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.deleteTask(
        auth.userId,
        uuid(workspaceId),
        uuid(taskId),
        parseVersion(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Post("tasks/:taskId/transitions")
  @RequireCapability("task.write")
  async transitionTask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(taskTransitionSchema, body);
    if (input.version !== parseVersion(ifMatch))
      problem(
        "VERSION_CONFLICT",
        HttpStatus.PRECONDITION_FAILED,
        "Task transition version conflict",
      );
    const data = await this.planning.transitionTask(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("tasks/:taskId/subtasks")
  @RequireCapability("task.write")
  async createSubtask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.createSubtask(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      idempotencyKey(key),
      parseWithSchema(createTaskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("tasks/:taskId/subtasks/:subtaskId")
  @RequireCapability("task.write")
  async updateSubtask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("subtaskId") subtaskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.updateSubtask(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      uuid(subtaskId),
      parseVersion(ifMatch),
      parseWithSchema(updateTaskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("tasks/:taskId/subtasks/:subtaskId")
  @RequireCapability("task.delete")
  async deleteSubtask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("subtaskId") subtaskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.deleteSubtask(
        auth.userId,
        uuid(workspaceId),
        uuid(taskId),
        uuid(subtaskId),
        parseVersion(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Put("tasks/:taskId/dependencies")
  @RequireCapability("task.write")
  async dependencies(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(replaceTaskDependenciesSchema, body);
    if (input.version !== parseVersion(ifMatch))
      problem(
        "VERSION_CONFLICT",
        HttpStatus.PRECONDITION_FAILED,
        "Dependency version conflict",
      );
    const data = await this.planning.dependencies(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      input,
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.task.version });
  }

  @Post("tasks/:taskId/copies")
  @RequireCapability("task.write")
  async copyTask(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.copyTask(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      idempotencyKey(key),
      parseWithSchema(copyTaskSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("tasks/:taskId/comments")
  @RequireCapability("task.read")
  async comments(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.comments(
        auth.userId,
        uuid(workspaceId),
        uuid(taskId),
      ),
    );
  }

  @Post("tasks/:taskId/comments")
  @RequireCapability("task.write")
  async createComment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.createComment(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      parseWithSchema(createTaskCommentSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("tasks/:taskId/comments/:commentId")
  @RequireCapability("task.write")
  async updateComment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("commentId") commentId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.updateComment(
      auth.userId,
      uuid(workspaceId),
      uuid(taskId),
      uuid(commentId),
      parseWithSchema(updateTaskCommentSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("tasks/:taskId/comments/:commentId")
  @RequireCapability("task.write")
  async deleteComment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("taskId") taskId: string,
    @Param("commentId") commentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.deleteComment(
        auth.userId,
        uuid(workspaceId),
        uuid(taskId),
        uuid(commentId),
        parseVersion(ifMatch),
      ),
    );
  }

  @Get("calendar-events")
  @RequireCapability("calendar.read")
  async calendar(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.calendar(auth.userId, uuid(workspaceId), query),
    );
  }

  @Post("calendar-events")
  @RequireCapability("calendar.write")
  async createEvent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.createEvent(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createCalendarEventSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("calendar-events/:eventId")
  @RequireCapability("calendar.read")
  async event(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("eventId") eventId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.event(
      auth.userId,
      uuid(workspaceId),
      uuid(eventId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("calendar-events/:eventId")
  @RequireCapability("calendar.write")
  async updateEvent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("eventId") eventId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.updateEvent(
      auth.userId,
      uuid(workspaceId),
      uuid(eventId),
      parseVersion(ifMatch),
      parseWithSchema(updateCalendarEventSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("calendar-events/:eventId")
  @RequireCapability("calendar.write")
  async deleteEvent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("eventId") eventId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.deleteEvent(
        auth.userId,
        uuid(workspaceId),
        uuid(eventId),
        parseVersion(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Get("calendar.ics")
  @RequireCapability("calendar.read")
  async calendarIcs(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ) {
    const result = await this.planning.calendarIcs(
      auth.userId,
      uuid(workspaceId),
      query,
    );
    response.setHeader("Content-Type", "text/calendar; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="weddingos-calendar.ics"',
    );
    response.send(result);
  }

  @Get("timeline")
  @RequireCapability("timeline.read")
  async timeline(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.timeline(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("milestones")
  @RequireCapability("timeline.write")
  async createMilestone(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.createMilestone(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createMilestoneSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("milestones/:milestoneId")
  @RequireCapability("timeline.write")
  async updateMilestone(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("milestoneId") milestoneId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.planning.updateMilestone(
      auth.userId,
      uuid(workspaceId),
      uuid(milestoneId),
      parseVersion(ifMatch),
      parseWithSchema(updateMilestoneSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("milestones/:milestoneId")
  @RequireCapability("timeline.write")
  async deleteMilestone(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("milestoneId") milestoneId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.deleteMilestone(
        auth.userId,
        uuid(workspaceId),
        uuid(milestoneId),
        parseVersion(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Post("timeline-recalculations")
  @RequireCapability("timeline.recalculate")
  async recalculate(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.recalculate(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(timelineRecalculationRequestSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("dashboard")
  @RequireCapability("planning.read")
  async dashboard(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.dashboard(auth.userId, uuid(workspaceId)),
    );
  }

  @Get("search")
  @RequireCapability("planning.read")
  async search(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("q") query: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.search(auth.userId, uuid(workspaceId), query ?? ""),
    );
  }

  @Post("planning-exports")
  @RequireCapability("planning.read")
  async exportPlanning(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.planning.exportPlanning(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(planningExportRequestSchema, body),
        request.correlationId,
      ),
    );
  }
}

function uuid(value: string): string {
  return parseUuid(value, "id");
}
function idempotencyKey(value: string | undefined): string {
  if (!value || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
    );
  return value;
}
function parseVersion(value: string | undefined): number {
  if (!value)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  const version = Number(value?.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(version) || version < 1)
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  return version;
}
function versionOf(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("version" in value))
    return undefined;
  const version = (value as { version?: unknown }).version;
  return typeof version === "number" ? version : undefined;
}
