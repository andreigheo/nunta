import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  updatePublicAggregateConsentSchema,
  type UpdatePublicAggregateConsent,
} from "@weddingos/contracts";
import type { Response } from "express";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { apiResponse } from "../common/api-response";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { RequireCapability } from "../workspaces/capability.decorator";
import { MarketingService } from "./marketing.service";

@ApiTags("public-marketing")
@Controller("api/v1/public")
export class PublicMarketingController {
  constructor(
    @Inject(MarketingService) private readonly marketing: MarketingService,
  ) {}

  @Get("product-proof")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async productProof(
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Req() request: WeddingOsRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (Object.keys(request.query).length > 0) {
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Query parameters are not supported",
      );
    }
    let result;
    try {
      result = await this.marketing.publicProductProof();
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
      ) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Retry-After", "60");
      }
      throw error;
    }
    response.setHeader("ETag", result.etag);
    response.setHeader("Vary", "Accept-Encoding");
    if (result.revocationPending) {
      response.setHeader("Cache-Control", "no-store");
    } else {
      response.setHeader(
        "Cache-Control",
        result.stale
          ? "public, max-age=60, s-maxage=60, must-revalidate, proxy-revalidate"
          : "public, max-age=60, s-maxage=840, must-revalidate, proxy-revalidate",
      );
    }
    if (result.stale)
      response.setHeader("Warning", '110 - "Response is stale"');
    if (ifNoneMatch === result.etag) {
      response.status(HttpStatus.NOT_MODIFIED);
      return;
    }
    return result.payload;
  }
}

@ApiTags("workspace-settings")
@ApiCookieAuth()
@Controller("api/v1/workspaces/:workspaceId/public-aggregate-consent")
export class PublicAggregateConsentController {
  constructor(
    @Inject(MarketingService) private readonly marketing: MarketingService,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.manage_public_aggregation")
  async get(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const consent = await this.marketing.getConsent(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
    );
    return apiResponse(request, consent, { version: consent.version });
  }

  @Put()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.manage_public_aggregation")
  async update(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const consent = await this.marketing.updateConsent(
      auth.userId,
      parseUuid(workspaceId, "workspaceId"),
      parseConsentVersion(ifMatch),
      parseWithSchema(
        updatePublicAggregateConsentSchema,
        body,
      ) as UpdatePublicAggregateConsent,
      request.requestId,
      request.correlationId,
    );
    return apiResponse(request, consent, { version: consent.version });
  }
}

function parseConsentVersion(value: string | undefined): number {
  if (!value) {
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  }
  const normalized = value.replace(/^W\//, "").replaceAll('"', "");
  const version = Number(normalized);
  if (!Number.isInteger(version) || version < 0) {
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  }
  return version;
}
