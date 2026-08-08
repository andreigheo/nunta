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
  Res,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import QRCode from "qrcode";
import {
  checkInManifestRequestSchema,
  checkInOfflineSyncSchema,
  checkInSessionTransitionSchema,
  completeGuestMomentSchema,
  createCheckInCredentialSchema,
  createCheckInDeviceSchema,
  createCheckInSessionSchema,
  createCheckInStationSchema,
  createGalleryCollectionSchema,
  createGuestMomentSchema,
  createRunOfShowItemSchema,
  createWeddingDayAnnouncementSchema,
  createWeddingDayChecklistItemSchema,
  createWeddingDayChecklistSchema,
  createWeddingDayContactSchema,
  createWeddingDayIncidentSchema,
  createWeddingDayPlanSchema,
  galleryItemsSchema,
  guestCheckInCommandSchema,
  guestMomentReportSchema,
  guestMomentTransitionSchema,
  runOfShowDependenciesSchema,
  runOfShowOrderSchema,
  runOfShowTransitionSchema,
  updateCheckInSessionSchema,
  updateCheckInStationSchema,
  updateGalleryCollectionSchema,
  updateRunOfShowItemSchema,
  updateWeddingDayAnnouncementSchema,
  updateWeddingDayChecklistItemSchema,
  updateWeddingDayContactSchema,
  updateWeddingDayPlanSchema,
  validateCheckInCredentialSchema,
  weddingDayChecklistTransitionSchema,
  weddingDayDecisionSchema,
  weddingDayIncidentTransitionSchema,
  weddingDayIncidentUpdateSchema,
  weddingDayExportSchema,
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
import { WeddingDayService } from "./wedding-day.service";

@ApiTags("wedding-day")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("wedding_day.read")
@Controller("api/v1/workspaces/:workspaceId")
export class WeddingDayController {
  constructor(
    @Inject(WeddingDayService) private readonly service: WeddingDayService,
  ) {}

  @Get("wedding-day/plans")
  async plans(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.plans(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("wedding-day/plans")
  @RequireCapability("wedding_day.write")
  async createPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createPlan(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createWeddingDayPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("wedding-day/plans/:planId")
  async plan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.plan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("wedding-day/plans/:planId")
  @RequireCapability("wedding_day.write")
  async updatePlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updatePlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      requiredVersion(ifMatch),
      parseWithSchema(updateWeddingDayPlanSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/plans/:planId/publish")
  @RequireCapability("wedding_day.publish")
  publishPlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.planTransition(
      auth,
      workspaceId,
      planId,
      "publish",
      ifMatch,
      key,
      request,
    );
  }

  @Post("wedding-day/plans/:planId/go-live")
  @RequireCapability("wedding_day.go_live")
  goLive(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.planTransition(
      auth,
      workspaceId,
      planId,
      "go-live",
      ifMatch,
      key,
      request,
    );
  }

  @Post("wedding-day/plans/:planId/pause")
  @RequireCapability("wedding_day.go_live")
  pause(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.planTransition(
      auth,
      workspaceId,
      planId,
      "pause",
      ifMatch,
      key,
      request,
    );
  }

  @Post("wedding-day/plans/:planId/complete")
  @RequireCapability("wedding_day.go_live")
  completePlan(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.planTransition(
      auth,
      workspaceId,
      planId,
      "complete",
      ifMatch,
      key,
      request,
    );
  }

  private async planTransition(
    auth: AuthenticatedSession,
    workspaceId: string,
    planId: string,
    action: "publish" | "go-live" | "pause" | "complete",
    ifMatch: string | undefined,
    key: string | undefined,
    request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionPlan(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      action,
      requiredVersion(ifMatch),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("wedding-day/plans/:planId/run-of-show")
  async runOfShow(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.runOfShow(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
      ),
    );
  }

  @Post("wedding-day/plans/:planId/run-of-show/items")
  @RequireCapability("wedding_day.write")
  async createRunItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createRunItem(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createRunOfShowItemSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("wedding-day/run-of-show/items/:itemId")
  @RequireCapability("wedding_day.write")
  async updateRunItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateRunItem(
      auth.userId,
      uuid(workspaceId),
      uuid(itemId),
      requiredVersion(ifMatch),
      parseWithSchema(updateRunOfShowItemSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/run-of-show/items/:itemId/transitions")
  @RequireCapability("wedding_day.transition")
  async transitionRunItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionRunItem(
      auth.userId,
      uuid(workspaceId),
      uuid(itemId),
      requiredVersion(ifMatch),
      parseWithSchema(runOfShowTransitionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("wedding-day/run-of-show/items/:itemId")
  @RequireCapability("wedding_day.write")
  async deleteRunItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.deleteRunItem(
        auth.userId,
        uuid(workspaceId),
        uuid(itemId),
        requiredVersion(ifMatch),
      ),
    );
  }

  @Put("wedding-day/plans/:planId/run-of-show/order")
  @RequireCapability("wedding_day.write")
  async reorder(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(runOfShowOrderSchema, body);
    const data = await this.service.reorderRun(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      requiredVersion(ifMatch),
      input.itemIds,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Put("wedding-day/run-of-show/items/:itemId/dependencies")
  @RequireCapability("wedding_day.write")
  async dependencies(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(runOfShowDependenciesSchema, body);
    const data = await this.service.replaceDependencies(
      auth.userId,
      uuid(workspaceId),
      uuid(itemId),
      requiredVersion(ifMatch),
      input.dependencies,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("wedding-day/plans/:planId/checklists")
  async checklists(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.checklists(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
      ),
    );
  }

  @Post("wedding-day/plans/:planId/checklists")
  @RequireCapability("wedding_day.write")
  async createChecklist(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createChecklist(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createWeddingDayChecklistSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/checklists/:checklistId/items")
  @RequireCapability("wedding_day.write")
  async createChecklistItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("checklistId") checklistId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createChecklistItem(
      auth.userId,
      uuid(workspaceId),
      uuid(checklistId),
      idempotencyKey(key),
      parseWithSchema(createWeddingDayChecklistItemSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("wedding-day/checklist-items/:itemId")
  @RequireCapability("wedding_day.write")
  async updateChecklistItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateChecklistItem(
      auth.userId,
      uuid(workspaceId),
      uuid(itemId),
      requiredVersion(ifMatch),
      parseWithSchema(updateWeddingDayChecklistItemSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/checklist-items/:itemId/transitions")
  @RequireCapability("wedding_day.transition")
  async transitionChecklistItem(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("itemId") itemId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(weddingDayChecklistTransitionSchema, body);
    const data = await this.service.updateChecklistItem(
      auth.userId,
      uuid(workspaceId),
      uuid(itemId),
      requiredVersion(ifMatch),
      input,
      input.transition,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("wedding-day/plans/:planId/incidents")
  @RequireCapability("incident.read")
  async incidents(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.incidents(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
        hasSensitiveAccess(request),
      ),
    );
  }

  @Get("wedding-day/plans/:planId/contacts")
  @RequireCapability("wedding_day.manage_contacts")
  async contacts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.contacts(auth.userId, uuid(workspaceId), uuid(planId)),
    );
  }

  @Post("wedding-day/plans/:planId/contacts")
  @RequireCapability("wedding_day.manage_contacts")
  async createContact(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createContact(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createWeddingDayContactSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("wedding-day/contacts/:contactId")
  @RequireCapability("wedding_day.manage_contacts")
  async updateContact(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contactId") contactId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateContact(
      auth.userId,
      uuid(workspaceId),
      uuid(contactId),
      requiredVersion(ifMatch),
      parseWithSchema(updateWeddingDayContactSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Delete("wedding-day/contacts/:contactId")
  @RequireCapability("wedding_day.manage_contacts")
  async deleteContact(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("contactId") contactId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.deleteContact(
        auth.userId,
        uuid(workspaceId),
        uuid(contactId),
        requiredVersion(ifMatch),
      ),
    );
  }

  @Post("wedding-day/plans/:planId/incidents")
  @RequireCapability("incident.write")
  async createIncident(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createIncident(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createWeddingDayIncidentSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("wedding-day/incidents/:incidentId")
  @RequireCapability("incident.read")
  async incident(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("incidentId") incidentId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.incident(
      auth.userId,
      uuid(workspaceId),
      uuid(incidentId),
      hasSensitiveAccess(request),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/incidents/:incidentId/updates")
  @RequireCapability("incident.write")
  async incidentUpdate(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("incidentId") incidentId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.addIncidentUpdate(
        auth.userId,
        uuid(workspaceId),
        uuid(incidentId),
        parseWithSchema(weddingDayIncidentUpdateSchema, body),
      ),
    );
  }

  @Post("wedding-day/incidents/:incidentId/transitions")
  @RequireCapability("incident.resolve")
  async transitionIncident(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("incidentId") incidentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.transitionIncident(
      auth.userId,
      uuid(workspaceId),
      uuid(incidentId),
      requiredVersion(ifMatch),
      parseWithSchema(weddingDayIncidentTransitionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/incidents/:incidentId/decisions")
  @RequireCapability("incident.write")
  async decision(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("incidentId") incidentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createDecision(
      auth.userId,
      uuid(workspaceId),
      uuid(incidentId),
      idempotencyKey(key),
      parseWithSchema(weddingDayDecisionSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("wedding-day/plans/:planId/announcements")
  @RequireCapability("announcement.read")
  async announcements(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.announcements(
        auth.userId,
        uuid(workspaceId),
        uuid(planId),
      ),
    );
  }

  @Post("wedding-day/plans/:planId/announcements")
  @RequireCapability("announcement.write")
  async createAnnouncement(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("planId") planId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createAnnouncement(
      auth.userId,
      uuid(workspaceId),
      uuid(planId),
      idempotencyKey(key),
      parseWithSchema(createWeddingDayAnnouncementSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("wedding-day/announcements/:announcementId")
  @RequireCapability("announcement.write")
  async updateAnnouncement(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("announcementId") announcementId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateAnnouncement(
      auth.userId,
      uuid(workspaceId),
      uuid(announcementId),
      requiredVersion(ifMatch),
      parseWithSchema(updateWeddingDayAnnouncementSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/announcements/:announcementId/publish")
  @RequireCapability("announcement.publish")
  async publishAnnouncement(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("announcementId") announcementId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.publishAnnouncement(
      auth.userId,
      uuid(workspaceId),
      uuid(announcementId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("wedding-day/announcements/:announcementId/cancel")
  @RequireCapability("announcement.publish")
  async cancelAnnouncement(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("announcementId") announcementId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.cancelAnnouncement(
      auth.userId,
      uuid(workspaceId),
      uuid(announcementId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("check-in/sessions")
  @RequireCapability("check_in.read")
  async sessions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.sessions(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("check-in/sessions")
  @RequireCapability("check_in.manage_sessions")
  async createSession(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createSession(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createCheckInSessionSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("check-in/sessions/:sessionId")
  @RequireCapability("check_in.read")
  async session(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.session(
      auth.userId,
      uuid(workspaceId),
      uuid(sessionId),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("check-in/sessions/:sessionId")
  @RequireCapability("check_in.manage_sessions")
  async updateSession(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateSession(
      auth.userId,
      uuid(workspaceId),
      uuid(sessionId),
      requiredVersion(ifMatch),
      parseWithSchema(updateCheckInSessionSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("check-in/sessions/:sessionId/transitions")
  @RequireCapability("check_in.manage_sessions")
  async transitionSession(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(checkInSessionTransitionSchema, body);
    const data = await this.service.transitionSession(
      auth.userId,
      uuid(workspaceId),
      uuid(sessionId),
      requiredVersion(ifMatch),
      input.transition,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("check-in/sessions/:sessionId/stations")
  @RequireCapability("check_in.manage_sessions")
  async station(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createStation(
      auth.userId,
      uuid(workspaceId),
      uuid(sessionId),
      idempotencyKey(key),
      parseWithSchema(createCheckInStationSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("check-in/stations/:stationId")
  @RequireCapability("check_in.manage_sessions")
  async updateStation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("stationId") stationId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateStation(
      auth.userId,
      uuid(workspaceId),
      uuid(stationId),
      requiredVersion(ifMatch),
      parseWithSchema(updateCheckInStationSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("check-in/sessions/:sessionId/devices")
  @RequireCapability("check_in.manage_devices")
  async device(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.registerDevice(
        auth.userId,
        uuid(workspaceId),
        uuid(sessionId),
        idempotencyKey(key),
        parseWithSchema(createCheckInDeviceSchema, body),
      ),
    );
  }

  @Post("check-in/devices/:deviceId/revoke")
  @RequireCapability("check_in.manage_devices")
  async revokeDevice(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("deviceId") deviceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.revokeDevice(
        auth.userId,
        uuid(workspaceId),
        uuid(deviceId),
        requiredVersion(ifMatch),
      ),
    );
  }

  @Post("check-in/sessions/:sessionId/credentials")
  @RequireCapability("check_in.write")
  async credential(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.createCredential(
        auth.userId,
        uuid(workspaceId),
        uuid(sessionId),
        idempotencyKey(key),
        parseWithSchema(createCheckInCredentialSchema, body),
      ),
    );
  }

  @Post("check-in/credentials/:credentialId/rotate")
  @RequireCapability("check_in.write")
  async rotateCredential(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.rotateCredential(
        auth.userId,
        uuid(workspaceId),
        uuid(credentialId),
        idempotencyKey(key),
      ),
    );
  }

  @Post("check-in/credentials/:credentialId/revoke")
  @RequireCapability("check_in.write")
  async revokeCredential(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("credentialId") credentialId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.revokeCredential(
        auth.userId,
        uuid(workspaceId),
        uuid(credentialId),
      ),
    );
  }

  @Post("check-in/sessions/:sessionId/validate")
  @RequireCapability("check_in.read")
  async validateCredential(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(validateCheckInCredentialSchema, body);
    return apiResponse(
      request,
      await this.service.validateCredential(
        auth.userId,
        uuid(workspaceId),
        uuid(sessionId),
        input.token,
      ),
    );
  }

  @Post("check-in/sessions/:sessionId/check-ins")
  @RequireCapability("check_in.write")
  checkIn(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.checkInCommand(
      auth,
      workspaceId,
      sessionId,
      key,
      body,
      request,
      false,
    );
  }

  @Post("check-in/sessions/:sessionId/check-outs")
  @RequireCapability("check_in.write")
  checkOut(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.checkInCommand(
      auth,
      workspaceId,
      sessionId,
      key,
      body,
      request,
      true,
    );
  }

  private async checkInCommand(
    auth: AuthenticatedSession,
    workspaceId: string,
    sessionId: string,
    key: string | undefined,
    body: unknown,
    request: WeddingOsRequest,
    checkout: boolean,
  ) {
    const input = parseWithSchema(guestCheckInCommandSchema, body);
    if (
      input.override &&
      !request.membership?.capabilities.includes("check_in.override")
    )
      problem(
        "FORBIDDEN",
        HttpStatus.FORBIDDEN,
        "Capability required",
        "Este necesară capabilitatea check_in.override.",
        undefined,
        { requiredCapability: "check_in.override" },
      );
    const data = await this.service.checkIn(
      auth.userId,
      uuid(workspaceId),
      uuid(sessionId),
      idempotencyKey(key),
      input,
      checkout,
      request.correlationId,
    );
    return apiResponse(request, data);
  }

  @Get("check-in/sessions/:sessionId/attendance")
  @RequireCapability("check_in.read")
  async attendance(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.attendance(
        auth.userId,
        uuid(workspaceId),
        uuid(sessionId),
      ),
    );
  }

  @Post("check-in/sessions/:sessionId/offline-manifests")
  @RequireCapability("check_in.offline_sync")
  async manifest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.manifest(
        auth.userId,
        uuid(workspaceId),
        uuid(sessionId),
        idempotencyKey(key),
        parseWithSchema(checkInManifestRequestSchema, body),
      ),
    );
  }

  @Post("check-in/sessions/:sessionId/offline-sync")
  @RequireCapability("check_in.offline_sync")
  async sync(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("sessionId") sessionId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.syncOffline(
        auth.userId,
        uuid(workspaceId),
        uuid(sessionId),
        idempotencyKey(key),
        parseWithSchema(checkInOfflineSyncSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("wedding-day/command-center")
  async commandCenter(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.commandCenter(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("wedding-day-exports")
  async exportWeddingDay(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.exportWeddingDay(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        parseWithSchema(weddingDayExportSchema, body),
        request.correlationId,
      ),
    );
  }

  @Sse("wedding-day/live")
  stream(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("last-event-id") lastId: string | undefined,
  ) {
    return this.service.organizerStream(auth.userId, uuid(workspaceId), lastId);
  }

  @Get("guest-moments")
  @RequireCapability("guest_moment.read")
  async moments(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.organizerMoments(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("guest-moments/:momentId/transitions")
  @RequireCapability("guest_moment.moderate")
  async moderate(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("momentId") momentId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(guestMomentTransitionSchema, body);
    const data = await this.service.moderateMoment(
      auth.userId,
      uuid(workspaceId),
      uuid(momentId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      input.transition,
      input.reason ?? null,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Get("guest-moments/:momentId/preview")
  @RequireCapability("guest_moment.moderate")
  async organizerMomentPreview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("momentId") momentId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.organizerMomentPreview(
        auth.userId,
        uuid(workspaceId),
        uuid(momentId),
      ),
    );
  }

  @Get("galleries")
  @RequireCapability("gallery.read")
  async galleries(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.galleries(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("galleries")
  @RequireCapability("gallery.write")
  async gallery(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createGallery(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createGalleryCollectionSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Patch("galleries/:galleryId")
  @RequireCapability("gallery.write")
  async updateGallery(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("galleryId") galleryId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateGallery(
      auth.userId,
      uuid(workspaceId),
      uuid(galleryId),
      requiredVersion(ifMatch),
      parseWithSchema(updateGalleryCollectionSchema, body),
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Put("galleries/:galleryId/items")
  @RequireCapability("gallery.write")
  async galleryItems(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("galleryId") galleryId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(galleryItemsSchema, body);
    const data = await this.service.replaceGalleryItems(
      auth.userId,
      uuid(workspaceId),
      uuid(galleryId),
      requiredVersion(ifMatch),
      input.guestMomentIds,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }

  @Post("galleries/:galleryId/publish")
  @RequireCapability("gallery.publish")
  publishGallery(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("galleryId") galleryId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.galleryTransition(
      auth,
      workspaceId,
      galleryId,
      ifMatch,
      key,
      request,
      true,
    );
  }

  @Post("galleries/:galleryId/unpublish")
  @RequireCapability("gallery.publish")
  unpublishGallery(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("galleryId") galleryId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return this.galleryTransition(
      auth,
      workspaceId,
      galleryId,
      ifMatch,
      key,
      request,
      false,
    );
  }

  private async galleryTransition(
    auth: AuthenticatedSession,
    workspaceId: string,
    galleryId: string,
    ifMatch: string | undefined,
    key: string | undefined,
    request: WeddingOsRequest,
    publish: boolean,
  ) {
    const data = await this.service.publishGallery(
      auth.userId,
      uuid(workspaceId),
      uuid(galleryId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      publish,
      request.correlationId,
    );
    return apiResponse(request, data, { version: versionOf(data) });
  }
}

@ApiTags("guest-wedding-day")
@Controller("api/v1/guest")
export class GuestWeddingDayController {
  constructor(
    @Inject(WeddingDayService) private readonly service: WeddingDayService,
  ) {}

  @Get("wedding-day/live")
  live(@Query("token") token: string | undefined) {
    return this.service.guestLive(guestToken(token));
  }

  @Sse("wedding-day/live/stream")
  stream(
    @Query("token") token: string | undefined,
    @Headers("last-event-id") lastId: string | undefined,
  ) {
    return this.service.guestStream(guestToken(token), lastId);
  }

  @Get("check-in/credential")
  credential(@Query("token") token: string | undefined) {
    return this.service.guestCredential(guestToken(token));
  }

  @Get("check-in/credential/qr")
  async credentialQr(
    @Query("token") token: string | undefined,
    @Res() response: Response,
  ) {
    const credential = await this.service.guestCredential(guestToken(token));
    if (!credential) {
      response.status(HttpStatus.NOT_FOUND).send("Credential unavailable");
      return;
    }
    response.type("image/svg+xml").send(
      await QRCode.toString(credential.token, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 2,
        width: 640,
      }),
    );
  }

  @Get("moments")
  moments(@Query("token") token: string | undefined) {
    return this.service.guestMoments(guestToken(token));
  }

  @Post("moments")
  createMoment(
    @Query("token") token: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.service.createGuestMoment(
      guestToken(token),
      idempotencyKey(key),
      parseWithSchema(createGuestMomentSchema, body),
      request.correlationId,
    );
  }

  @Post("moments/:momentId/complete")
  completeMoment(
    @Query("token") token: string | undefined,
    @Param("momentId") momentId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(completeGuestMomentSchema, body);
    return this.service.completeGuestMoment(
      guestToken(token),
      uuid(momentId),
      input.checksumSha256,
      request.correlationId,
    );
  }

  @Get("moments/:momentId/preview")
  async momentPreview(
    @Query("token") token: string | undefined,
    @Param("momentId") momentId: string,
    @Res() response: Response,
  ) {
    response.redirect(
      HttpStatus.TEMPORARY_REDIRECT,
      await this.service.guestMomentPreview(guestToken(token), uuid(momentId)),
    );
  }

  @Post("moments/:momentId/reports")
  reportMoment(
    @Query("token") token: string | undefined,
    @Param("momentId") momentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return this.service.reportMoment(
      guestToken(token),
      uuid(momentId),
      idempotencyKey(key),
      parseWithSchema(guestMomentReportSchema, body),
      request.correlationId,
    );
  }

  @Get("gallery")
  gallery(@Query("token") token: string | undefined) {
    return this.service.guestGallery(guestToken(token));
  }
}

function uuid(value: string) {
  return parseUuid(value);
}

function requiredVersion(value: string | undefined) {
  const normalized = value?.replace(/^W\//, "").replaceAll('"', "").trim();
  const version = Number(normalized);
  if (!normalized || !Number.isInteger(version) || version < 0) {
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
      "Trimite versiunea resursei în headerul If-Match.",
    );
  }
  return version;
}

function idempotencyKey(value: string | undefined) {
  const key = value?.trim();
  if (!key || key.length < 8 || key.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
      "Trimite o cheie de idempotency validă.",
    );
  return key;
}

function guestToken(value: string | undefined) {
  const token = value?.trim();
  if (!token || token.length < 32)
    problem("TOKEN_INVALID", HttpStatus.UNAUTHORIZED, "Guest token invalid");
  return token;
}

function versionOf(value: unknown) {
  if (!value || typeof value !== "object" || !("version" in value))
    return undefined;
  const version = (value as { version?: unknown }).version;
  return typeof version === "number" ? version : undefined;
}

function hasSensitiveAccess(request: WeddingOsRequest) {
  return (
    request.membership?.capabilities.includes("incident.read_sensitive") ??
    false
  );
}
