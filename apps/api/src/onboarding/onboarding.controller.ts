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
import { updateOnboardingDraftSchema } from "@weddingos/contracts";
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
import { OnboardingService } from "./onboarding.service";

@ApiTags("onboarding")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("workspace.update")
@Controller("api/v1/workspaces/:workspaceId/onboarding")
export class OnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly onboarding: OnboardingService,
  ) {}

  @Get()
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.onboarding.get(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Patch()
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.onboarding.update(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseWithSchema(updateOnboardingDraftSchema, body),
      parseVersion(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Post("complete")
  async complete(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Idempotency-Key required",
      );
    return apiResponse(
      request,
      await this.onboarding.complete(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        parseVersion(ifMatch),
        idempotencyKey,
        request.correlationId,
      ),
    );
  }
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
