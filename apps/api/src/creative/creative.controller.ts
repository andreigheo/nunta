import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { updateWorkspaceCreativeStateSchema } from "@weddingos/contracts";
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
import { CreativeService } from "./creative.service";

@ApiTags("creative")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@Controller("api/v1/workspaces/:workspaceId/creative-state")
export class CreativeController {
  constructor(
    @Inject(CreativeService) private readonly creative: CreativeService,
  ) {}

  @Get()
  @RequireCapability("invitation.read")
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.creative.get(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Put()
  @RequireCapability("invitation.write")
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.creative.update(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseOptionalVersion(ifMatch),
      parseWithSchema(updateWorkspaceCreativeStateSchema, body),
      request.correlationId,
    );
    return apiResponse(request, result, { version: result.version });
  }
}

function parseOptionalVersion(value: string | undefined): number | null {
  if (!value) return null;
  const version = Number(value.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(version) || version < 0)
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  return version;
}
