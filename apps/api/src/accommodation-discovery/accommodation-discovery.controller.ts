import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  accommodationDiscoveryQuerySchema,
  accommodationRecommendationTransitionSchema,
  accommodationRecommendationsQuerySchema,
  createAccommodationRecommendationSchema,
  orderAccommodationRecommendationsSchema,
  updateAccommodationRecommendationSchema,
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
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { AccommodationDiscoveryService } from "./accommodation-discovery.service";

@ApiTags("accommodation-discovery")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("accommodation.read")
@Controller("api/v1/workspaces/:workspaceId")
export class AccommodationDiscoveryController {
  constructor(
    @Inject(AccommodationDiscoveryService)
    private readonly service: AccommodationDiscoveryService,
  ) {}

  @Get("accommodation-discovery")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  async discover(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.discover(
        auth.userId,
        uuid(workspaceId),
        parseWithSchema(accommodationDiscoveryQuerySchema, query),
      ),
    );
  }

  @Get("accommodation-recommendations")
  async recommendations(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.recommendations(
        auth.userId,
        uuid(workspaceId),
        parseWithSchema(accommodationRecommendationsQuerySchema, query),
      ),
    );
  }

  @Post("accommodation-recommendations")
  @RequireCapability("accommodation.write")
  async createRecommendation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createRecommendation(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createAccommodationRecommendationSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Put("accommodation-recommendations/order")
  @RequireCapability("accommodation.write")
  async orderRecommendations(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.orderRecommendations(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(orderAccommodationRecommendationsSchema, body),
        request.correlationId,
      ),
    );
  }

  @Patch("accommodation-recommendations/:recommendationId")
  @RequireCapability("accommodation.write")
  async updateRecommendation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recommendationId") recommendationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateRecommendation(
      auth.userId,
      uuid(workspaceId),
      uuid(recommendationId),
      version(ifMatch),
      parseWithSchema(updateAccommodationRecommendationSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Delete("accommodation-recommendations/:recommendationId")
  @RequireCapability("accommodation.write")
  async deleteRecommendation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recommendationId") recommendationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.deleteRecommendation(
        auth.userId,
        uuid(workspaceId),
        uuid(recommendationId),
        version(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Post("accommodation-recommendations/:recommendationId/publish")
  @RequireCapability("accommodation.publish")
  async publishRecommendation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recommendationId") recommendationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionRecommendation(
      auth.userId,
      uuid(workspaceId),
      uuid(recommendationId),
      "PUBLISHED",
      version(ifMatch),
      idempotencyKey(key),
      parseWithSchema(accommodationRecommendationTransitionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Post("accommodation-recommendations/:recommendationId/archive")
  @RequireCapability("accommodation.publish")
  async archiveRecommendation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recommendationId") recommendationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionRecommendation(
      auth.userId,
      uuid(workspaceId),
      uuid(recommendationId),
      "ARCHIVED",
      version(ifMatch),
      idempotencyKey(key),
      parseWithSchema(accommodationRecommendationTransitionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }
}

function uuid(value: string) {
  return parseUuid(value, "id");
}

function idempotencyKey(value: string | undefined) {
  if (!value || value.length > 200) {
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
    );
  }
  return value;
}

function version(value: string | undefined) {
  if (!value) {
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  }
  const parsed = Number(value.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(parsed) || parsed < 1) {
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  }
  return parsed;
}
