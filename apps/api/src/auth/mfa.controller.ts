import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { CurrentAuth } from "./current-auth.decorator";
import { MfaService } from "./mfa.service";
import { SessionAuthGuard } from "./session-auth.guard";

const enrollmentSchema = z.object({
  label: z.string().trim().min(1).max(120).default("Authenticator"),
});
const codeSchema = z.object({ code: z.string().trim().min(6).max(40) });
const disableSchema = codeSchema.extend({
  password: z.string().min(12).max(200),
});
const stepUpChallengeSchema = z.object({
  purpose: z.string().trim().min(3).max(80),
  password: z.string().min(12).max(200),
});
const stepUpVerificationSchema = codeSchema.extend({
  challengeId: z.string().uuid(),
});

@ApiTags("mfa")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/me/mfa")
export class MfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Get()
  async status(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(request, await this.mfa.status(auth.userId));
  }

  @Post("totp/enrollments")
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  async enroll(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(enrollmentSchema, body);
    return apiResponse(
      request,
      await this.mfa.enroll(auth.userId, auth.email, input.label, request),
    );
  }

  @Post("totp/enrollments/:enrollmentId/confirm")
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  async confirm(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("enrollmentId") enrollmentId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(codeSchema, body);
    return apiResponse(
      request,
      await this.mfa.confirm(
        auth.userId,
        parseUuid(enrollmentId),
        input.code,
        request,
      ),
    );
  }

  @Delete("totp")
  async disable(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(disableSchema, body);
    return apiResponse(
      request,
      await this.mfa.disable(auth.userId, input.password, input.code, request),
    );
  }

  @Post("recovery-codes/regenerate")
  async regenerate(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(codeSchema, body);
    return apiResponse(
      request,
      await this.mfa.regenerateRecoveryCodes(auth.userId, input.code, request),
    );
  }
}

@ApiTags("authentication")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/auth")
export class StepUpController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Post("step-up-challenges")
  @Throttle({ default: { limit: 8, ttl: 300_000 } })
  async challenge(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(stepUpChallengeSchema, body);
    return apiResponse(
      request,
      await this.mfa.createStepUpChallenge(
        auth.userId,
        auth.sessionId,
        input.purpose,
        input.password,
        request,
      ),
    );
  }

  @Post("step-up-verifications")
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  async verify(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(stepUpVerificationSchema, body);
    return apiResponse(
      request,
      await this.mfa.verifyStepUp(
        auth.userId,
        auth.sessionId,
        input.challengeId,
        input.code,
        request,
      ),
    );
  }

  @Get("step-up-status")
  async status(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.mfa.stepUpStatus(auth.userId, auth.sessionId),
    );
  }
}
