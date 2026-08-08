import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { activityExportRequestSchema } from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { RequireCapability } from "../workspaces/capability.decorator";
import { ActivityService } from "./activity.service";

@ApiTags("activity")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("workspace.read")
@Controller("api/v1/workspaces/:workspaceId")
export class ActivityController {
  constructor(
    @Inject(ActivityService) private readonly activity: ActivityService,
  ) {}

  @Get("activity")
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") rawLimit: string | undefined,
    @Query("category") category: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.activity.list(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        {
          ...(cursor ? { cursor } : {}),
          limit: Number(rawLimit ?? 30),
          ...(category ? { category } : {}),
          ...(from ? { from: new Date(from) } : {}),
          ...(to ? { to: new Date(to) } : {}),
        },
      ),
    );
  }

  @Post("activity-exports")
  async export(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Idempotency-Key required",
      );
    }
    return apiResponse(
      request,
      await this.activity.requestExport(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        parseWithSchema(activityExportRequestSchema, body),
        idempotencyKey,
        request.correlationId,
      ),
    );
  }
}
