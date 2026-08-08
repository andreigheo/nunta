import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
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
import { updateNotificationRequestSchema } from "@weddingos/contracts";
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
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  @Get("workspaces/:workspaceId/notifications")
  @UseGuards(CapabilityGuard)
  @RequireCapability("workspace.read")
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") rawLimit: string | undefined,
    @Query("module") module: string | undefined,
    @Query("read") rawRead: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.notifications.list(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        cursor,
        Number(rawLimit ?? 20),
        module,
        rawRead === undefined ? undefined : rawRead === "true",
      ),
    );
  }

  @Get("workspaces/:workspaceId/notifications/unread-count")
  @UseGuards(CapabilityGuard)
  @RequireCapability("workspace.read")
  async unreadCount(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.notifications.unreadCount(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Patch("workspaces/:workspaceId/notifications/:notificationId")
  @UseGuards(CapabilityGuard)
  @RequireCapability("workspace.read")
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const version = parseVersion(ifMatch);
    const input = parseWithSchema(updateNotificationRequestSchema, body);
    const result = await this.notifications.update(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseUuid(notificationId, "notificationId"),
      input.read,
      version,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Post("workspaces/:workspaceId/notifications/mark-all-read")
  @UseGuards(CapabilityGuard)
  @RequireCapability("workspace.read")
  async markAllRead(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.notifications.markAllRead(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Delete("workspaces/:workspaceId/notifications/:notificationId")
  @UseGuards(CapabilityGuard)
  @RequireCapability("workspace.read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("notificationId") notificationId: string,
  ) {
    await this.notifications.remove(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseUuid(notificationId, "notificationId"),
    );
  }
}

function parseVersion(value: string | undefined): number {
  const normalized = value?.replace(/^W\//, "").replaceAll('"', "");
  const version = Number(normalized);
  if (!normalized || !Number.isInteger(version) || version < 1) {
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "If-Match required",
      "Trimite versiunea resursei în headerul If-Match.",
    );
  }
  return version;
}
