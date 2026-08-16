import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import {
  adminRsvpOverrideSchema,
  createMenuSchema,
  guestInvitationOpenSchema,
  guestLinkAccessSchema,
  guestRsvpRequestSchema,
  organizerMenuSelectionSchema,
  resolveAllergyIssueSchema,
  rsvpDashboardQuerySchema,
  saveRsvpFormSchema,
  updateMenuSchema,
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
import { RsvpMenuService } from "./rsvp-menu.service";

@ApiTags("guest-companion")
@Controller("api/v1/guest")
export class GuestCompanionController {
  constructor(
    @Inject(RsvpMenuService) private readonly service: RsvpMenuService,
  ) {}

  @Get("bootstrap")
  async bootstrap(@Query("token") token: string | undefined) {
    return this.service.bootstrap(guestToken(token));
  }

  @Get("rsvp")
  async rsvp(@Query("token") token: string | undefined) {
    return this.service.guestRsvp(guestToken(token));
  }

  @Post("invitation-open")
  async invitationOpen(@Body() body: unknown) {
    return this.service.recordInvitationOpen(
      parseWithSchema(guestInvitationOpenSchema, body),
    );
  }

  @Post("link-access")
  async linkAccess(@Body() body: unknown) {
    return this.service.recordLinkAccess(
      parseWithSchema(guestLinkAccessSchema, body),
    );
  }

  @Put("rsvp")
  async submit(@Body() body: unknown, @Req() request: WeddingOsRequest) {
    return this.service.submitGuestRsvp(
      parseWithSchema(guestRsvpRequestSchema, body),
      request.correlationId,
    );
  }
}

@ApiTags("rsvp-menus")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@Controller("api/v1/workspaces/:workspaceId")
export class RsvpMenuController {
  constructor(
    @Inject(RsvpMenuService) private readonly service: RsvpMenuService,
  ) {}

  @Get("rsvp-form")
  @RequireCapability("rsvp.read")
  async form(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.form(auth.userId, uuid(workspaceId));
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("rsvp-dashboard")
  @RequireCapability("rsvp.read")
  async dashboard(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.dashboard(
        auth.userId,
        uuid(workspaceId),
        parseWithSchema(rsvpDashboardQuerySchema, query),
      ),
    );
  }

  @Put("rsvp-form")
  @RequireCapability("rsvp.configure")
  async saveForm(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(saveRsvpFormSchema, body);
    const result = await this.service.saveForm(
      auth.userId,
      uuid(workspaceId),
      optionalVersion(ifMatch),
      data.config,
      request.correlationId,
    );
    return apiResponse(request, result, { version: result?.version });
  }

  @Post("rsvp-form/publish")
  @RequireCapability("rsvp.configure")
  async publishForm(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.publishForm(
      auth.userId,
      uuid(workspaceId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("rsvp-submissions/:submissionId")
  @RequireCapability("rsvp.override")
  async override(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("submissionId") submissionId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(adminRsvpOverrideSchema, body);
    const result = await this.service.overrideSubmission(
      auth.userId,
      uuid(workspaceId),
      uuid(submissionId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      data,
      request.correlationId,
    );
    return apiResponse(request, result, { version: resourceVersion(result) });
  }

  @Get("menus")
  @RequireCapability("menu.read")
  async menus(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.menus(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("menus")
  @RequireCapability("menu.write")
  async createMenu(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createMenu(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createMenuSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("menus/:menuId")
  @RequireCapability("menu.read")
  async menu(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("menuId") menuId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.menu(
      auth.userId,
      uuid(workspaceId),
      uuid(menuId),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Patch("menus/:menuId")
  @RequireCapability("menu.write")
  async updateMenu(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("menuId") menuId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateMenu(
      auth.userId,
      uuid(workspaceId),
      uuid(menuId),
      requiredVersion(ifMatch),
      parseWithSchema(updateMenuSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Delete("menus/:menuId")
  @RequireCapability("menu.write")
  async deleteMenu(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("menuId") menuId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.deleteMenu(
        auth.userId,
        uuid(workspaceId),
        uuid(menuId),
        requiredVersion(ifMatch),
      ),
    );
  }

  @Get("guest-menu-selections")
  @RequireCapability("menu.read")
  async selections(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.selections(
      auth.userId,
      uuid(workspaceId),
      cursor,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Put("guest-menu-selections/:guestId")
  @RequireCapability("menu.write")
  async setSelection(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("guestId") guestId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.setOrganizerMenuSelection(
        auth.userId,
        uuid(workspaceId),
        uuid(guestId),
        parseWithSchema(organizerMenuSelectionSchema, body),
        request.correlationId,
      ),
    );
  }

  @Get("allergy-issues")
  @RequireCapability("menu.read_allergies")
  async allergyIssues(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const includeDetails =
      request.membership?.capabilities.includes("guest.read_sensitive") ??
      false;
    const data = await this.service.allergyIssues(
      auth.userId,
      uuid(workspaceId),
      includeDetails,
      cursor,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Patch("allergy-issues/:issueId")
  @RequireCapability("menu.resolve_allergies")
  async resolveAllergy(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("issueId") issueId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.service.resolveAllergyIssue(
      auth.userId,
      uuid(workspaceId),
      uuid(issueId),
      requiredVersion(ifMatch),
      parseWithSchema(resolveAllergyIssueSchema, body),
      request.correlationId,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Post("catering-exports")
  @RequireCapability("menu.export")
  async cateringExport(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(
      z.object({
        format: z.enum(["csv", "xlsx"]).default("csv"),
        includeAllergies: z.boolean().default(false),
      }),
      body,
    );
    if (
      data.includeAllergies &&
      !request.membership?.capabilities.includes("menu.read_allergies")
    )
      problem("FORBIDDEN", 403, "Allergy export is not authorized");
    return apiResponse(
      request,
      await this.service.cateringExport(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        data.includeAllergies,
        data.format,
        request.correlationId,
      ),
    );
  }
}

function uuid(value: string) {
  return parseUuid(value);
}
function guestToken(value: string | undefined) {
  return parseWithSchema(z.string().min(32).max(1000), value);
}
function idempotencyKey(value: string | undefined) {
  return parseWithSchema(z.string().trim().min(8).max(200), value);
}
function optionalVersion(value: string | undefined) {
  return value ? requiredVersion(value) : null;
}
function requiredVersion(value: string | undefined) {
  return parseWithSchema(
    z.coerce.number().int().positive(),
    value?.replace(/^W\//, "").replaceAll('"', ""),
  );
}
function resourceVersion(value: unknown) {
  return typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "number"
    ? value.version
    : undefined;
}
