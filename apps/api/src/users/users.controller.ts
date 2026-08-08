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
import {
  mfaChallengeRequestSchema,
  mfaVerificationRequestSchema,
  updateNotificationPreferenceSchema,
  updateProfileRequestSchema,
  updateUserPreferenceSchema,
} from "@weddingos/contracts";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { UsersService } from "./users.service";

@ApiTags("current-user")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/me")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get()
  async me(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.users.currentUser(auth.userId));
  }

  @Patch()
  async updateProfile(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(updateProfileRequestSchema, body);
    const result = await this.users.updateProfile(
      auth.userId,
      input.firstName,
      input.lastName,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Get("sessions")
  async sessions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.users.sessions(auth.userId, auth.sessionId),
    );
  }

  @Delete("sessions/:sessionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("sessionId") sessionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    await this.users.revokeSession(
      auth.userId,
      parseUuid(sessionId, "sessionId"),
      request.requestId,
      request.correlationId,
    );
    return undefined;
  }

  @Get("preferences")
  async preferences(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.users.preference(auth.userId));
  }

  @Patch("preferences")
  async updatePreferences(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(updateUserPreferenceSchema, body);
    return apiResponse(
      request,
      await this.users.updatePreference(auth.userId, input),
    );
  }

  @Get("notification-preferences")
  async notificationPreferences(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.users.notificationPreference(auth.userId),
    );
  }

  @Patch("notification-preferences")
  async updateNotificationPreferences(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(updateNotificationPreferenceSchema, body);
    return apiResponse(
      request,
      await this.users.updateNotificationPreference(auth.userId, input),
    );
  }

  @Post("mfa-challenges")
  mfaChallenge(@Body() body: unknown) {
    parseWithSchema(mfaChallengeRequestSchema, body);
    return this.users.mfaFoundation();
  }

  @Post("mfa-verifications")
  mfaVerification(@Body() body: unknown) {
    parseWithSchema(mfaVerificationRequestSchema, body);
    return this.users.mfaFoundation();
  }
}
