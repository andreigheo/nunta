import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  createTeamInvitationRequestSchema,
  updateMemberRequestSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { TeamService } from "./team.service";

@ApiTags("team")
@Controller("api/v1")
export class TeamController {
  constructor(@Inject(TeamService) private readonly team: TeamService) {}

  @Get("workspaces/:workspaceId/members")
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("team.read")
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.team.list(auth.userId, parseUuid(workspaceId, "workspaceId")),
    );
  }

  @Post("workspaces/:workspaceId/team-invitations")
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("team.invite")
  async invite(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.team.invite(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        parseWithSchema(createTeamInvitationRequestSchema, body),
        request.requestId,
        request.correlationId,
      ),
    );
  }

  @Get("team-invitations/:token")
  async invitation(
    @Param("token") token: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.team.publicInvitation(token));
  }

  @Post("team-invitations/:token/accept")
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard)
  async accept(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("token") token: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.team.accept(
        auth.userId,
        auth.email,
        token,
        request.requestId,
        request.correlationId,
      ),
    );
  }

  @Post("team-invitations/:token/decline")
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard)
  async decline(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("token") token: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.team.decline(
        auth.userId,
        auth.email,
        token,
        request.requestId,
        request.correlationId,
      ),
    );
  }

  @Post("workspaces/:workspaceId/team-invitations/:invitationId/resend")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("team.invite")
  async resend(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.team.resend(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        parseUuid(invitationId, "invitationId"),
        request.requestId,
        request.correlationId,
      ),
    );
  }

  @Delete("workspaces/:workspaceId/team-invitations/:invitationId")
  @ApiCookieAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("team.invite")
  async revokeInvitation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("invitationId") invitationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    await this.team.revokeInvitation(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseUuid(invitationId, "invitationId"),
      request.requestId,
      request.correlationId,
    );
    return undefined;
  }

  @Patch("workspaces/:workspaceId/members/:memberId")
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("team.update_role")
  async updateMember(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.team.updateMember(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseUuid(memberId, "memberId"),
      parseWithSchema(updateMemberRequestSchema, body),
      request.requestId,
      request.correlationId,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Delete("workspaces/:workspaceId/members/:memberId")
  @ApiCookieAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("team.remove")
  async removeMember(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("memberId") memberId: string,
    @Req() request: WeddingOsRequest,
  ) {
    await this.team.removeMember(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseUuid(memberId, "memberId"),
      request.requestId,
      request.correlationId,
    );
    return undefined;
  }
}
