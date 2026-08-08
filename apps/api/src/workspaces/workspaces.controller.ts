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
  createWorkspaceRequestSchema,
  updateWorkspaceRequestSchema,
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
import { RequireCapability } from "./capability.decorator";
import { CapabilityGuard } from "./capability.guard";
import { WorkspacesService } from "./workspaces.service";

@ApiTags("workspaces")
@ApiCookieAuth()
@Controller("api/v1/workspaces")
export class WorkspacesController {
  constructor(
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.workspaces.list(auth.userId));
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  async create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Idempotency-Key required",
        "Trimite un header Idempotency-Key valid.",
      );
    }
    const created = await this.workspaces.create(
      auth.userId,
      parseWithSchema(createWorkspaceRequestSchema, body),
      idempotencyKey,
    );
    return apiResponse(request, created, {
      version:
        typeof created.version === "number" ? created.version : undefined,
    });
  }

  @Get(":workspaceId/bootstrap")
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.read")
  async bootstrap(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.workspaces.bootstrap(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Patch(":workspaceId")
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.update")
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.workspaces.update(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseWithSchema(updateWorkspaceRequestSchema, body),
    );
    return apiResponse(request, result, { version: result.version });
  }
}
