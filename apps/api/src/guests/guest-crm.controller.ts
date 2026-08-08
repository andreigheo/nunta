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
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  createGuestSchema,
  createGuestTagSchema,
  createHouseholdSchema,
  exportRequestSchema,
  guestBulkCommandSchema,
  importMappingSchema,
  importRowDecisionSchema,
  updateGuestSchema,
  updateGuestTagSchema,
  updateHouseholdSchema,
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
import { GuestCrmService } from "./guest-crm.service";
import { InvitationCampaignService } from "./invitation-campaign.service";

@ApiTags("guests")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("guest.read")
@Controller("api/v1/workspaces/:workspaceId")
export class GuestCrmController {
  constructor(
    @Inject(GuestCrmService) private readonly guests: GuestCrmService,
    @Inject(InvitationCampaignService)
    private readonly invitations: InvitationCampaignService,
  ) {}

  @Get("households")
  async households(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.households(
      auth.userId,
      uuid(workspaceId),
      query,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Post("households")
  @RequireCapability("guest.write")
  async createHousehold(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.createHousehold(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createHouseholdSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("households/:householdId")
  async household(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("householdId") householdId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.household(
      auth.userId,
      uuid(workspaceId),
      uuid(householdId),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("households/:householdId")
  @RequireCapability("guest.write")
  async updateHousehold(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("householdId") householdId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.updateHousehold(
      auth.userId,
      uuid(workspaceId),
      uuid(householdId),
      match(ifMatch),
      parseWithSchema(updateHouseholdSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Delete("households/:householdId")
  @RequireCapability("guest.archive")
  async archiveHousehold(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("householdId") householdId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.guests.archiveHousehold(
        auth.userId,
        uuid(workspaceId),
        uuid(householdId),
        match(ifMatch),
        request.correlationId,
      ),
    );
  }

  @Get("guests")
  async listGuests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.guests(
      auth.userId,
      uuid(workspaceId),
      query,
      capabilities(request),
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Get("guest-tags")
  async tags(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.guests.tags(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("guest-tags")
  @RequireCapability("guest.write")
  async createTag(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.createTag(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createGuestTagSchema, body),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Patch("guest-tags/:tagId")
  @RequireCapability("guest.write")
  async updateTag(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("tagId") tagId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.updateTag(
      auth.userId,
      uuid(workspaceId),
      uuid(tagId),
      match(ifMatch),
      parseWithSchema(updateGuestTagSchema, body),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Delete("guest-tags/:tagId")
  @RequireCapability("guest.write")
  async deleteTag(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("tagId") tagId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.guests.deleteTag(
        auth.userId,
        uuid(workspaceId),
        uuid(tagId),
        match(ifMatch),
      ),
    );
  }

  @Post("guests")
  @RequireCapability("guest.write")
  async createGuest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.createGuest(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createGuestSchema, body),
      request.correlationId,
      capabilities(request),
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("guests/:guestId")
  async guest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("guestId") guestId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.guest(
      auth.userId,
      uuid(workspaceId),
      uuid(guestId),
      capabilities(request),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Patch("guests/:guestId")
  @RequireCapability("guest.write")
  async updateGuest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("guestId") guestId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.updateGuest(
      auth.userId,
      uuid(workspaceId),
      uuid(guestId),
      match(ifMatch),
      parseWithSchema(updateGuestSchema, body),
      request.correlationId,
      capabilities(request),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Delete("guests/:guestId")
  @RequireCapability("guest.archive")
  async archiveGuest(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("guestId") guestId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.archiveGuest(
      auth.userId,
      uuid(workspaceId),
      uuid(guestId),
      match(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Post("guest-bulk-commands")
  @RequireCapability("guest.write")
  async bulk(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(guestBulkCommandSchema, body);
    const scopedWorkspaceId = uuid(workspaceId);
    const replayKey = idempotencyKey(key);
    if (data.command === "CREATE_INVITATION_RECIPIENTS") {
      requireAnyCapability(request, ["invitation.manage_recipients"]);
      return apiResponse(
        request,
        await this.invitations.createRecipients(
          auth.userId,
          scopedWorkspaceId,
          replayKey,
          [],
          data.guestIds,
          undefined,
          request.correlationId,
        ),
      );
    }
    if (data.command === "ADD_TO_CAMPAIGN") {
      requireAnyCapability(request, ["campaign.write"]);
      return apiResponse(
        request,
        await this.invitations.addGuestsToCampaign(
          auth.userId,
          scopedWorkspaceId,
          data.campaignId,
          data.guestIds,
          replayKey,
          request.correlationId,
        ),
      );
    }
    if (data.command === "SEND_RSVP_REMINDER") {
      requireAllCapabilities(request, ["campaign.write", "campaign.send"]);
      return apiResponse(
        request,
        await this.invitations.sendRsvpReminder(
          auth.userId,
          scopedWorkspaceId,
          data.guestIds,
          replayKey,
          request.correlationId,
        ),
      );
    }
    return apiResponse(
      request,
      await this.guests.bulk(
        auth.userId,
        scopedWorkspaceId,
        replayKey,
        data,
        request.correlationId,
      ),
    );
  }

  @Post("guest-imports")
  @RequireCapability("guest.import")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 5_242_880, files: 1 } }),
  )
  async createImport(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.guests.createImport(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        file,
        request.correlationId,
      ),
    );
  }

  @Get("guest-imports/:importId")
  @RequireCapability("guest.import")
  async importStatus(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("importId") importId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.importStatus(
      auth.userId,
      uuid(workspaceId),
      uuid(importId),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Get("guest-imports/:importId/rows")
  @RequireCapability("guest.import")
  async importRows(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("importId") importId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.guests.importRows(
      auth.userId,
      uuid(workspaceId),
      uuid(importId),
      cursor,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Patch("guest-imports/:importId/mapping")
  @RequireCapability("guest.import")
  async mapping(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("importId") importId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(importMappingSchema, body);
    const result = await this.guests.updateImportMapping(
      auth.userId,
      uuid(workspaceId),
      uuid(importId),
      match(ifMatch),
      data.mapping,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Patch("guest-imports/:importId/rows/:rowId")
  @RequireCapability("guest.import")
  async rowDecision(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("importId") importId: string,
    @Param("rowId") rowId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(importRowDecisionSchema, body);
    const result = await this.guests.decideImportRow(
      auth.userId,
      uuid(workspaceId),
      uuid(importId),
      uuid(rowId),
      match(ifMatch),
      data.decision,
      data.mergeGuestId,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Post("guest-imports/:importId/commit")
  @RequireCapability("guest.import")
  async commitImport(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("importId") importId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.guests.commitImport(
        auth.userId,
        uuid(workspaceId),
        uuid(importId),
        match(ifMatch),
        idempotencyKey(key),
        request.correlationId,
      ),
    );
  }

  @Post("guest-exports")
  @RequireCapability("guest.export")
  async exportGuests(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(exportRequestSchema, body);
    if (
      data.includeContactData &&
      !capabilities(request).includes("guest.read_pii")
    )
      problem("FORBIDDEN", 403, "Contact data export is not authorized");
    if (
      data.includeAllergies &&
      !capabilities(request).includes("guest.read_sensitive")
    )
      problem("FORBIDDEN", 403, "Sensitive export is not authorized");
    return apiResponse(
      request,
      await this.guests.exportGuests(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        data,
        request.correlationId,
      ),
    );
  }
}

function uuid(value: string) {
  return parseUuid(value);
}
function capabilities(request: WeddingOsRequest) {
  return request.membership?.capabilities ?? [];
}
function idempotencyKey(value: string | undefined) {
  return parseWithSchema(z.string().trim().min(8).max(200), value);
}
function match(value: string | undefined) {
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
function requireAnyCapability(request: WeddingOsRequest, required: string[]) {
  const available = new Set<string>(capabilities(request));
  if (!required.some((capability) => available.has(capability)))
    problem(
      "FORBIDDEN",
      403,
      "Forbidden",
      `Requires one of: ${required.join(", ")}`,
    );
}
function requireAllCapabilities(request: WeddingOsRequest, required: string[]) {
  const available = new Set<string>(capabilities(request));
  if (!required.every((capability) => available.has(capability)))
    problem("FORBIDDEN", 403, "Forbidden", `Requires: ${required.join(", ")}`);
}
