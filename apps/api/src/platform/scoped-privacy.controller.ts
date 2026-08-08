import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
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
const reasonSchema = z.object({ reason: z.string().trim().min(8).max(2000) });

@ApiTags("privacy")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/workspaces/:workspaceId")
export class WorkspacePrivacyController {
  constructor(
    @Inject(PlatformService) private readonly service: PlatformService,
  ) {}

  @Post("data-exports")
  async export(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") rawId: string,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const workspaceId = parseUuid(rawId, "workspaceId");
    const key = parseWithSchema(keySchema, rawKey);
    await this.service.assertScopedPrivacyOwner(
      auth.userId,
      "WORKSPACE",
      workspaceId,
    );
    return apiResponse(
      request,
      await this.service.createDataSubjectRequest(
        auth.userId,
        { type: "EXPORT", scopeType: "WORKSPACE", scopeId: workspaceId },
        key,
        request.correlationId,
      ),
    );
  }

  @Post("deletion-requests")
  async deletion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") rawId: string,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const workspaceId = parseUuid(rawId, "workspaceId");
    const key = parseWithSchema(keySchema, rawKey);
    const { reason } = parseWithSchema(reasonSchema, body);
    await this.service.assertScopedPrivacyOwner(
      auth.userId,
      "WORKSPACE",
      workspaceId,
    );
    return apiResponse(
      request,
      await this.service.createDeletionRequest(
        auth.userId,
        { targetType: "WEDDING_WORKSPACE", targetId: workspaceId, reason },
        key,
        request.correlationId,
      ),
    );
  }
}

@ApiTags("privacy")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/vendor-organizations/:organizationId")
export class VendorPrivacyController {
  constructor(
    @Inject(PlatformService) private readonly service: PlatformService,
  ) {}

  @Post("data-exports")
  async export(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") rawId: string,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const organizationId = parseUuid(rawId, "organizationId");
    const key = parseWithSchema(keySchema, rawKey);
    await this.service.assertScopedPrivacyOwner(
      auth.userId,
      "VENDOR_ORGANIZATION",
      organizationId,
    );
    return apiResponse(
      request,
      await this.service.createDataSubjectRequest(
        auth.userId,
        {
          type: "EXPORT",
          scopeType: "VENDOR_ORGANIZATION",
          scopeId: organizationId,
        },
        key,
        request.correlationId,
      ),
    );
  }

  @Post("deletion-requests")
  async deletion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") rawId: string,
    @Headers("idempotency-key") rawKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const organizationId = parseUuid(rawId, "organizationId");
    const key = parseWithSchema(keySchema, rawKey);
    const { reason } = parseWithSchema(reasonSchema, body);
    await this.service.assertScopedPrivacyOwner(
      auth.userId,
      "VENDOR_ORGANIZATION",
      organizationId,
    );
    return apiResponse(
      request,
      await this.service.createDeletionRequest(
        auth.userId,
        { targetType: "VENDOR_ORGANIZATION", targetId: organizationId, reason },
        key,
        request.correlationId,
      ),
    );
  }
}
