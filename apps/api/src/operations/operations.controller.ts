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
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  accommodationAllocationBatchSchema,
  createAccommodationPropertySchema,
  createAccommodationRoomSchema,
  createAccommodationStaySchema,
  createSeatingPlanSchema,
  createSeatingFloorObjectSchema,
  createSeatingTableSchema,
  createTransportPlanSchema,
  createTransportRouteSchema,
  createTransportStopSchema,
  createTransportVehicleSchema,
  createVenueSpaceSchema,
  issueResolutionSchema,
  roomingListSchema,
  seatingAssignmentBatchSchema,
  seatingConstraintSchema,
  seatingExportSchema,
  seatingSuggestionApplySchema,
  seatingSuggestionRequestSchema,
  transportAssignmentBatchSchema,
  transportManifestSchema,
  updateAccommodationPropertySchema,
  updateAccommodationRequestSchema,
  updateAccommodationRoomSchema,
  updateAccommodationStaySchema,
  updateSeatingPlanSchema,
  updateSeatingFloorObjectSchema,
  updateSeatingSeatSchema,
  updateSeatingTableSchema,
  updateTransportPlanSchema,
  updateTransportRequestSchema,
  updateTransportRouteSchema,
  updateTransportStopSchema,
  updateTransportVehicleSchema,
  updateVenueSpaceSchema,
} from "@weddingos/contracts";
import { z } from "zod";
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
import { OperationsService } from "./operations.service";

const publishSchema = z.object({
  reason: z.string().trim().min(3).max(1000).nullable().optional(),
});

@ApiTags("seating")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("seating.read")
@Controller("api/v1/workspaces/:workspaceId")
export class SeatingController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}

  @Get("venue-spaces")
  async venueSpaces(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.venueSpaces(auth.userId, uuid(workspaceId)),
    );
  }
  @Post("venue-spaces")
  @RequireCapability("seating.write")
  async createVenue(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.createVenueSpace(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(createVenueSpaceSchema, body),
      ),
    );
  }
  @Get("venue-spaces/:spaceId")
  async venue(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("spaceId") spaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.venueSpace(
      auth.userId,
      uuid(workspaceId),
      uuid(spaceId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("venue-spaces/:spaceId")
  @RequireCapability("seating.write")
  async updateVenue(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("spaceId") spaceId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateVenueSpace(
      auth.userId,
      uuid(workspaceId),
      uuid(spaceId),
      version(match),
      parseWithSchema(updateVenueSpaceSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("venue-spaces/:spaceId")
  @RequireCapability("seating.write")
  async deleteVenue(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("spaceId") spaceId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteVenueSpace(
        auth.userId,
        uuid(workspaceId),
        uuid(spaceId),
        version(match),
      ),
    );
  }

  @Get("seating-plans")
  async plans(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.seatingPlans(auth.userId, uuid(workspaceId)),
    );
  }
  @Post("seating-plans")
  @RequireCapability("seating.write")
  async createPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createSeatingPlan(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createSeatingPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Get("seating-plans/:planId")
  async plan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.seatingPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      has(request, "seating.read_sensitive_summary"),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("seating-plans/:planId")
  @RequireCapability("seating.write")
  async updatePlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateSeatingPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      version(match),
      parseWithSchema(updateSeatingPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("seating-plans/:planId")
  @RequireCapability("seating.write")
  async deletePlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteSeatingPlan(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
      ),
    );
  }

  @Post("seating-plans/:planId/publish")
  @RequireCapability("seating.publish")
  async publish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(publishSchema, body);
    return apiResponse(
      request,
      await this.operations.publishSeating(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
        idempotencyKey(key),
        input.reason ?? null,
        request.correlationId,
      ),
    );
  }
  @Post("seating-plans/:planId/unpublish")
  @RequireCapability("seating.publish")
  async unpublish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.unpublishSeating(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      version(match),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("seating-plans/:planId/tables")
  @RequireCapability("seating.write")
  async addTable(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createTable(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createSeatingTableSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("seating-plans/:planId/tables/:tableId")
  @RequireCapability("seating.write")
  async updateTable(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("tableId") tableId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateTable(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(tableId),
      version(match),
      parseWithSchema(updateSeatingTableSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("seating-plans/:planId/tables/:tableId")
  @RequireCapability("seating.write")
  async deleteTable(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("tableId") tableId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteTable(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(tableId),
        version(match),
      ),
    );
  }
  @Post("seating-plans/:planId/floor-objects")
  @RequireCapability("seating.write")
  async addFloorObject(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createFloorObject(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createSeatingFloorObjectSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("seating-plans/:planId/floor-objects/:objectId")
  @RequireCapability("seating.write")
  async updateFloorObject(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("objectId") objectId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateFloorObject(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(objectId),
      version(match),
      parseWithSchema(updateSeatingFloorObjectSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("seating-plans/:planId/floor-objects/:objectId")
  @RequireCapability("seating.write")
  async deleteFloorObject(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("objectId") objectId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteFloorObject(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(objectId),
        version(match),
        request.correlationId,
      ),
    );
  }
  @Patch("seating-plans/:planId/tables/:tableId/seats/:seatId")
  @RequireCapability("seating.write")
  async updateSeat(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("tableId") tableId: string,
    @Param("seatId") seatId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateSeat(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(tableId),
      uuid(seatId),
      version(match),
      parseWithSchema(updateSeatingSeatSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Put("seating-plans/:planId/assignments")
  @RequireCapability("seating.assign")
  async assignments(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.replaceSeatingAssignments(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(seatingAssignmentBatchSchema, body),
        request.correlationId,
      ),
    );
  }
  @Delete("seating-plans/:planId/assignments/:assignmentId")
  @RequireCapability("seating.assign")
  async removeAssignment(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("assignmentId") assignmentId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.removeSeatingAssignment(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(assignmentId),
        version(match),
      ),
    );
  }

  @Get("seating-plans/:planId/constraints")
  async constraints(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.seatingConstraints(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
      ),
    );
  }
  @Post("seating-plans/:planId/constraints")
  @RequireCapability("seating.write")
  async createConstraint(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createConstraint(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      parseWithSchema(seatingConstraintSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("seating-plans/:planId/constraints/:constraintId")
  @RequireCapability("seating.write")
  async updateConstraint(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("constraintId") constraintId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateConstraint(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(constraintId),
      version(match),
      parseWithSchema(seatingConstraintSchema.partial(), body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("seating-plans/:planId/constraints/:constraintId")
  @RequireCapability("seating.write")
  async deleteConstraint(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("constraintId") constraintId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteConstraint(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(constraintId),
        version(match),
      ),
    );
  }

  @Get("seating-plans/:planId/issues")
  async issues(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.seatingIssues(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
      ),
    );
  }
  @Patch("seating-plans/:planId/issues/:issueId")
  @RequireCapability("seating.write")
  async resolveIssue(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("issueId") issueId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.resolveSeatingIssue(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(issueId),
      version(match),
      parseWithSchema(issueResolutionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("seating-plans/:planId/suggestions")
  @RequireCapability("seating.generate_suggestion")
  async suggest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.requestSeatingSuggestion(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(seatingSuggestionRequestSchema, body),
        request.correlationId,
      ),
    );
  }
  @Get("seating-plans/:planId/suggestions/:suggestionId")
  async suggestion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("suggestionId") suggestionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.seatingSuggestion(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(suggestionId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Post("seating-plans/:planId/suggestions/:suggestionId/apply")
  @RequireCapability("seating.assign")
  async applySuggestion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("suggestionId") suggestionId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.applySeatingSuggestion(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(suggestionId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(seatingSuggestionApplySchema, body),
        request.correlationId,
      ),
    );
  }
  @Post("seating-plans/:planId/exports")
  @RequireCapability("seating.export")
  async exportPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.exportSeating(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        idempotencyKey(key),
        parseWithSchema(seatingExportSchema, body),
        request.correlationId,
        has(request, "seating.read_sensitive_summary"),
      ),
    );
  }
}

@ApiTags("transport")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("transport.read")
@Controller("api/v1/workspaces/:workspaceId")
export class TransportController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}
  @Get("transport-requests") async requests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.transportRequests(auth.userId, uuid(workspaceId)),
    );
  }
  @Patch("transport-requests/:requestId")
  @RequireCapability("transport.write")
  async updateRequest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("requestId") requestId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateTransportRequest(
      auth.userId,
      uuid(workspaceId),
      uuid(requestId),
      version(match),
      parseWithSchema(updateTransportRequestSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Get("transport-plans") async plans(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.transportPlans(auth.userId, uuid(workspaceId)),
    );
  }
  @Post("transport-plans")
  @RequireCapability("transport.write")
  async createPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createTransportPlan(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createTransportPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Get("transport-plans/:planId") async plan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.transportPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("transport-plans/:planId")
  @RequireCapability("transport.write")
  async updatePlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateTransportPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      version(match),
      parseWithSchema(updateTransportPlanSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("transport-plans/:planId")
  @RequireCapability("transport.write")
  async deletePlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteTransportPlan(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
      ),
    );
  }
  @Post("transport-plans/:planId/publish")
  @RequireCapability("transport.publish")
  async publish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.publishTransport(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }
  @Post("transport-plans/:planId/vehicles")
  @RequireCapability("transport.write")
  async createVehicle(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createVehicle(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      parseWithSchema(createTransportVehicleSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("transport-plans/:planId/vehicles/:vehicleId")
  @RequireCapability("transport.write")
  async updateVehicle(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("vehicleId") vehicleId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateVehicle(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(vehicleId),
      version(match),
      parseWithSchema(updateTransportVehicleSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("transport-plans/:planId/vehicles/:vehicleId")
  @RequireCapability("transport.write")
  async deleteVehicle(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("vehicleId") vehicleId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteVehicle(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(vehicleId),
        version(match),
      ),
    );
  }
  @Get("transport-stops") async stops(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.transportStops(auth.userId, uuid(workspaceId)),
    );
  }
  @Post("transport-stops")
  @RequireCapability("transport.write")
  async createStop(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createTransportStop(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createTransportStopSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("transport-stops/:stopId")
  @RequireCapability("transport.write")
  async updateStop(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stopId") stopId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateTransportStop(
      auth.userId,
      uuid(workspaceId),
      uuid(stopId),
      version(match),
      parseWithSchema(updateTransportStopSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("transport-stops/:stopId")
  @RequireCapability("transport.write")
  async deleteStop(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stopId") stopId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteTransportStop(
        auth.userId,
        uuid(workspaceId),
        uuid(stopId),
        version(match),
      ),
    );
  }
  @Post("transport-plans/:planId/routes")
  @RequireCapability("transport.write")
  async createRoute(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createRoute(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createTransportRouteSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("transport-plans/:planId/routes/:routeId")
  @RequireCapability("transport.write")
  async updateRoute(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("routeId") routeId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateRoute(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      uuid(routeId),
      version(match),
      parseWithSchema(updateTransportRouteSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("transport-plans/:planId/routes/:routeId")
  @RequireCapability("transport.write")
  async deleteRoute(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Param("routeId") routeId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteRoute(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        uuid(routeId),
        version(match),
      ),
    );
  }
  @Put("transport-plans/:planId/assignments")
  @RequireCapability("transport.assign")
  async assignments(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.replaceTransportAssignments(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(transportAssignmentBatchSchema, body),
        request.correlationId,
      ),
    );
  }
  @Post("transport-plans/:planId/manifests")
  @RequireCapability("transport.export")
  async manifest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.transportManifest(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        idempotencyKey(key),
        parseWithSchema(transportManifestSchema, body),
        request.correlationId,
        has(request, "transport.read_sensitive"),
      ),
    );
  }
}

@ApiTags("accommodation")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("accommodation.read")
@Controller("api/v1/workspaces/:workspaceId")
export class AccommodationController {
  constructor(
    @Inject(OperationsService) private readonly operations: OperationsService,
  ) {}
  @Get("accommodation-requests") async requests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.accommodationRequests(
        auth.userId,
        uuid(workspaceId),
      ),
    );
  }
  @Patch("accommodation-requests/:requestId")
  @RequireCapability("accommodation.write")
  async updateRequest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("requestId") requestId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateAccommodationRequest(
      auth.userId,
      uuid(workspaceId),
      uuid(requestId),
      version(match),
      parseWithSchema(updateAccommodationRequestSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Get("accommodation-properties") async properties(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.accommodationProperties(
        auth.userId,
        uuid(workspaceId),
      ),
    );
  }
  @Post("accommodation-properties")
  @RequireCapability("accommodation.write")
  async createProperty(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createAccommodationProperty(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createAccommodationPropertySchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Get("accommodation-properties/:propertyId") async property(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("propertyId") propertyId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.accommodationProperty(
      auth.userId,
      uuid(workspaceId),
      uuid(propertyId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("accommodation-properties/:propertyId")
  @RequireCapability("accommodation.write")
  async updateProperty(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("propertyId") propertyId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateAccommodationProperty(
      auth.userId,
      uuid(workspaceId),
      uuid(propertyId),
      version(match),
      parseWithSchema(updateAccommodationPropertySchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("accommodation-properties/:propertyId")
  @RequireCapability("accommodation.write")
  async deleteProperty(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("propertyId") propertyId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteAccommodationProperty(
        auth.userId,
        uuid(workspaceId),
        uuid(propertyId),
        version(match),
      ),
    );
  }
  @Post("accommodation-properties/:propertyId/rooms")
  @RequireCapability("accommodation.write")
  async createRoom(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("propertyId") propertyId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createRoom(
      auth.userId,
      uuid(workspaceId),
      uuid(propertyId),
      parseWithSchema(createAccommodationRoomSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("accommodation-properties/:propertyId/rooms/:roomId")
  @RequireCapability("accommodation.write")
  async updateRoom(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateRoom(
      auth.userId,
      uuid(workspaceId),
      uuid(propertyId),
      uuid(roomId),
      version(match),
      parseWithSchema(updateAccommodationRoomSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("accommodation-properties/:propertyId/rooms/:roomId")
  @RequireCapability("accommodation.write")
  async deleteRoom(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("propertyId") propertyId: string,
    @Param("roomId") roomId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteRoom(
        auth.userId,
        uuid(workspaceId),
        uuid(propertyId),
        uuid(roomId),
        version(match),
      ),
    );
  }
  @Get("accommodation-stays") async stays(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.accommodationStays(auth.userId, uuid(workspaceId)),
    );
  }
  @Post("accommodation-stays")
  @RequireCapability("accommodation.write")
  async createStay(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.createAccommodationStay(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createAccommodationStaySchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Get("accommodation-stays/:stayId") async stay(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stayId") stayId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.accommodationStay(
      auth.userId,
      uuid(workspaceId),
      uuid(stayId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Patch("accommodation-stays/:stayId")
  @RequireCapability("accommodation.write")
  async updateStay(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stayId") stayId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.operations.updateAccommodationStay(
      auth.userId,
      uuid(workspaceId),
      uuid(stayId),
      version(match),
      parseWithSchema(updateAccommodationStaySchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
  @Delete("accommodation-stays/:stayId")
  @RequireCapability("accommodation.write")
  async deleteStay(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stayId") stayId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.deleteAccommodationStay(
        auth.userId,
        uuid(workspaceId),
        uuid(stayId),
        version(match),
      ),
    );
  }
  @Put("accommodation-stays/:stayId/allocations")
  @RequireCapability("accommodation.assign")
  async allocations(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stayId") stayId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.replaceAccommodationAllocations(
        auth.userId,
        uuid(workspaceId),
        uuid(stayId),
        version(match),
        idempotencyKey(key),
        parseWithSchema(accommodationAllocationBatchSchema, body),
        request.correlationId,
      ),
    );
  }
  @Post("accommodation-stays/:stayId/publish")
  @RequireCapability("accommodation.publish")
  async publish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stayId") stayId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.publishAccommodation(
        auth.userId,
        uuid(workspaceId),
        uuid(stayId),
        version(match),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }
  @Post("accommodation-stays/:stayId/rooming-lists")
  @RequireCapability("accommodation.export")
  async roomingList(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stayId") stayId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.operations.roomingList(
        auth.userId,
        uuid(workspaceId),
        uuid(stayId),
        idempotencyKey(key),
        parseWithSchema(roomingListSchema, body),
        request.correlationId,
        has(request, "accommodation.read_sensitive"),
      ),
    );
  }
}

function uuid(value: string) {
  return parseUuid(value, "id");
}
function idempotencyKey(value: string | undefined) {
  if (!value || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
    );
  return value;
}
function version(value: string | undefined) {
  if (!value)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  const result = Number(value?.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(result) || result < 1)
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  return result;
}
function versionOf(value: unknown) {
  if (!value || typeof value !== "object" || !("version" in value))
    return undefined;
  const result = (value as { version?: unknown }).version;
  return typeof result === "number" ? result : undefined;
}
function has(request: WeddingOsRequest, capability: string) {
  return (
    request.membership?.capabilities.includes(capability as never) ?? false
  );
}
