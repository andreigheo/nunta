import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  acceptBetaInvitationSchema,
  betaFeedbackMessageSchema,
  betaProductEventSchema,
  createBetaCohortSchema,
  createBetaFeedbackSchema,
  createBetaInvitationSchema,
  createBetaProgramSchema,
  removeBetaParticipantSchema,
  triageBetaFeedbackSchema,
  updateBetaOnboardingSchema,
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
import { BetaService } from "./beta.service";

@ApiTags("controlled-beta-admin")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/platform/beta")
export class PlatformBetaController {
  constructor(@Inject(BetaService) private readonly service: BetaService) {}

  @Get("programs")
  async programs(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.programs(auth.userId));
  }

  @Post("programs")
  async createProgram(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createProgram(
        auth.userId,
        parseWithSchema(createBetaProgramSchema, body),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("cohorts")
  async cohorts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.cohorts(auth.userId));
  }

  @Post("cohorts")
  async createCohort(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createCohort(
        auth.userId,
        parseWithSchema(createBetaCohortSchema, body),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("participants")
  async participants(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.participants(auth.userId));
  }

  @Post("participants/:participantId/remove")
  async removeParticipant(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("participantId") participantId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(removeBetaParticipantSchema, body);
    const expectedVersion = version(ifMatch);
    if (input.version !== expectedVersion) versionConflict();
    return apiResponse(
      request,
      await this.service.removeParticipant(
        auth.userId,
        parseUuid(participantId),
        input,
        request.correlationId,
      ),
    );
  }

  @Get("invitations")
  async invitations(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.invitations(auth.userId));
  }

  @Post("invitations")
  async createInvitation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createInvitation(
        auth.userId,
        parseWithSchema(createBetaInvitationSchema, body),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Get("feedback")
  async feedback(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.adminFeedback(auth.userId));
  }

  @Patch("feedback/:feedbackId")
  async triageFeedback(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("feedbackId") feedbackId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(triageBetaFeedbackSchema, body);
    const expectedVersion = version(ifMatch);
    if (input.version !== expectedVersion) versionConflict();
    return apiResponse(
      request,
      await this.service.triageFeedback(
        auth.userId,
        parseUuid(feedbackId),
        input,
        expectedVersion,
        request.correlationId,
      ),
    );
  }

  @Get("metrics")
  async metrics(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.metrics(auth.userId));
  }

  @Get("exit-criteria")
  async exitCriteria(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.exitCriteria(auth.userId));
  }
}

@ApiTags("controlled-beta")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/beta")
export class BetaController {
  constructor(@Inject(BetaService) private readonly service: BetaService) {}

  @Post("invitations/accept")
  async acceptInvitation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.acceptInvitation(
        auth.userId,
        auth.email,
        parseWithSchema(acceptBetaInvitationSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("status")
  async status(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.status(auth.userId));
  }

  @Patch("onboarding")
  async updateOnboarding(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(updateBetaOnboardingSchema, body);
    const expectedVersion = version(ifMatch);
    if (input.version !== expectedVersion) versionConflict();
    return apiResponse(
      request,
      await this.service.updateOnboarding(auth.userId, input),
    );
  }

  @Get("feedback")
  async feedback(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.service.feedback(auth.userId));
  }

  @Post("feedback")
  async createFeedback(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createFeedback(
        auth.userId,
        parseWithSchema(createBetaFeedbackSchema, body),
        idempotencyKey(key),
      ),
    );
  }

  @Get("feedback/:feedbackId")
  async feedbackDetail(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("feedbackId") feedbackId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.feedbackDetail(auth.userId, parseUuid(feedbackId)),
    );
  }

  @Post("feedback/:feedbackId/messages")
  async addFeedbackMessage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("feedbackId") feedbackId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(betaFeedbackMessageSchema, body);
    const expectedVersion = version(ifMatch);
    if (input.version !== expectedVersion) versionConflict();
    return apiResponse(
      request,
      await this.service.addFeedbackMessage(
        auth.userId,
        parseUuid(feedbackId),
        input,
        expectedVersion,
      ),
    );
  }

  @Post("events")
  async recordEvent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.recordProductEvent(
        auth.userId,
        auth.sessionId,
        parseWithSchema(betaProductEventSchema, body),
        request.correlationId,
      ),
    );
  }
}

function idempotencyKey(value: string | undefined) {
  if (!value || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
    );
  return value;
}

function version(value: string | undefined) {
  if (!value)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  const result = Number(value.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(result) || result < 1)
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  return result;
}

function versionConflict(): never {
  problem(
    "VERSION_CONFLICT",
    HttpStatus.PRECONDITION_FAILED,
    "Version conflict",
    "Body version must match If-Match.",
  );
}
