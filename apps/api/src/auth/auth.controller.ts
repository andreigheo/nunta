import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import {
  createSessionRequestSchema,
  emailVerificationRequestSchema,
  emailVerificationSchema,
  magicLinkExchangeSchema,
  magicLinkRequestSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  registerRequestSchema,
} from "@weddingos/contracts";
import { apiResponse } from "../common/api-response";
import type { WeddingOsRequest } from "../common/http.types";
import { parseWithSchema } from "../common/validation";
import { CurrentAuth } from "./current-auth.decorator";
import { SessionAuthGuard } from "./session-auth.guard";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";

@ApiTags("authentication")
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Post("registrations")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Register an account" })
  async register(@Body() body: unknown, @Req() request: WeddingOsRequest) {
    return apiResponse(
      request,
      await this.auth.register(
        parseWithSchema(registerRequestSchema, body),
        request,
      ),
    );
  }

  @Post("email-verification-requests")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestVerification(
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(emailVerificationRequestSchema, body);
    return apiResponse(
      request,
      await this.auth.requestEmailVerification(input.email, request),
    );
  }

  @Post("email-verifications")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async verifyEmail(@Body() body: unknown, @Req() request: WeddingOsRequest) {
    return apiResponse(
      request,
      await this.auth.verifyEmail(
        parseWithSchema(emailVerificationSchema, body),
        request,
      ),
    );
  }

  @Post("sessions")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createSession(
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.createSession(
      parseWithSchema(createSessionRequestSchema, body),
      request,
    );
    response.cookie(
      this.sessions.cookieName,
      session.rawToken,
      this.sessions.cookieOptions(session.expiresAt),
    );
    return apiResponse(request, {
      authenticated: true as const,
      sessionId: session.id,
    });
  }

  @Delete("session")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  async logout(
    @CurrentAuth()
    current: {
      sessionId: string;
      userId: string;
      email: string;
      emailVerified: boolean;
    },
    @Req() request: WeddingOsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const cookies = request.cookies as Record<string, string | undefined>;
    await this.auth.logout(
      current,
      cookies?.[this.sessions.cookieName],
      request,
    );
    response.clearCookie(
      this.sessions.cookieName,
      this.sessions.clearCookieOptions(),
    );
    return undefined;
  }

  @Post("password-reset-requests")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestPasswordReset(
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(passwordResetRequestSchema, body);
    return apiResponse(
      request,
      await this.auth.requestPasswordReset(input.email, request),
    );
  }

  @Post("password-resets")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() body: unknown, @Req() request: WeddingOsRequest) {
    const input = parseWithSchema(passwordResetSchema, body);
    return apiResponse(
      request,
      await this.auth.resetPassword(input.token, input.password, request),
    );
  }

  @Post("magic-link-requests")
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async requestMagicLink(
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(magicLinkRequestSchema, body);
    return apiResponse(
      request,
      await this.auth.requestMagicLink(input.email, request),
    );
  }

  @Post("magic-link-exchanges")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  async exchangeMagicLink(
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseWithSchema(magicLinkExchangeSchema, body);
    const session = await this.auth.exchangeMagicLink(input.token, request);
    response.cookie(
      this.sessions.cookieName,
      session.rawToken,
      this.sessions.cookieOptions(session.expiresAt),
    );
    return apiResponse(request, {
      authenticated: true as const,
      sessionId: session.id,
    });
  }
}
