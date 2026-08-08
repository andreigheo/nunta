import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  cookiePreferenceSchema,
  createDataSubjectRequestSchema,
  createDeletionRequestSchema,
  recordConsentSchema,
  withdrawConsentSchema,
} from "@weddingos/contracts";
import { z } from "zod";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { PlatformService } from "./platform.service";

const keySchema = z.string().trim().min(8).max(200);

@ApiTags("privacy")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/me")
export class PrivacyController {
  constructor(
    @Inject(PlatformService) private readonly service: PlatformService,
  ) {}

  @Get("privacy")
  overview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(request, this.service.privacyOverview(auth.userId));
  }

  @Get("consents")
  consents(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(request, this.service.privacyOverview(auth.userId));
  }

  @Post("consents")
  recordConsent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.recordConsent(
        auth.userId,
        parseWithSchema(recordConsentSchema, body),
        request.correlationId,
      ),
    );
  }

  @Post("consents/:consentId/withdraw")
  withdrawConsent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("consentId") consentId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(withdrawConsentSchema, body);
    return this.respond(
      request,
      this.service.withdrawConsent(
        auth.userId,
        parseUuid(consentId),
        input.reason,
        request.correlationId,
      ),
    );
  }

  @Post("cookie-preferences")
  cookies(
    @CurrentAuth() auth: AuthenticatedSession,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.saveCookiePreference(
        auth.userId,
        parseWithSchema(cookiePreferenceSchema, body),
      ),
    );
  }

  @Post("data-subject-requests")
  createRequest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.createDataSubjectRequest(
        auth.userId,
        parseWithSchema(createDataSubjectRequestSchema, body),
        parseWithSchema(keySchema, key),
        request.correlationId,
      ),
    );
  }

  @Get("data-subject-requests")
  requests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.myDataSubjectRequests(auth.userId),
    );
  }

  @Get("data-subject-requests/:requestId")
  request(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("requestId") requestId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.myDataSubjectRequest(auth.userId, parseUuid(requestId)),
    );
  }

  @Post("data-exports")
  export(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.createDataSubjectRequest(
        auth.userId,
        { type: "EXPORT", scopeType: "USER", scopeId: auth.userId },
        parseWithSchema(keySchema, key),
        request.correlationId,
      ),
    );
  }

  @Post("deletion-requests")
  deletion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.respond(
      request,
      this.service.createDeletionRequest(
        auth.userId,
        parseWithSchema(createDeletionRequestSchema, body),
        parseWithSchema(keySchema, key),
        request.correlationId,
      ),
    );
  }

  private async respond<T>(request: WeddingOsRequest, promise: Promise<T>) {
    return apiResponse(request, await promise);
  }
}
