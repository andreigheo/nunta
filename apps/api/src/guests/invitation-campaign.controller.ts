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
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  applyInvitationSyncSchema,
  assignInvitationVariantSchema,
  campaignTransitionSchema,
  createInvitationVariantSchema,
  createRecipientAccessLinksSchema,
  createCampaignSchema,
  createInvitationRecipientsSchema,
  saveInvitationDraftSchema,
  saveInvitationVariantDraftSchema,
  updateCampaignSchema,
} from "@weddingos/contracts";
import type { Response } from "express";
import { z } from "zod";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { InvitationCampaignService } from "./invitation-campaign.service";

@ApiTags("invitations")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("invitation.read")
@Controller("api/v1/workspaces/:workspaceId")
export class InvitationCampaignController {
  constructor(
    @Inject(InvitationCampaignService)
    private readonly service: InvitationCampaignService,
  ) {}

  @Get("invitation-site")
  async site(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.site(auth.userId, uuid(workspaceId));
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Put("invitation-site/draft")
  @RequireCapability("invitation.write")
  async saveDraft(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.saveDraft(
      auth.userId,
      uuid(workspaceId),
      optionalVersion(ifMatch),
      parseWithSchema(saveInvitationDraftSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data?.version });
  }

  @Post("invitation-site/publish")
  @RequireCapability("invitation.publish")
  async publish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.publish(
      auth.userId,
      uuid(workspaceId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("invitation-site/unpublish")
  @RequireCapability("invitation.publish")
  async unpublish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.unpublish(
      auth.userId,
      uuid(workspaceId),
      requiredVersion(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data?.version });
  }

  @Get("invitation-site/preview")
  async preview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.preview(auth.userId, uuid(workspaceId)),
    );
  }

  @Get("invitation-site/versions")
  async versions(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.versions(
      auth.userId,
      uuid(workspaceId),
      cursor ? uuid(cursor) : undefined,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Post("invitation-site/versions/:versionId/restore")
  @RequireCapability("invitation.write")
  async restoreVersion(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("versionId") versionId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.restoreVersion(
      auth.userId,
      uuid(workspaceId),
      uuid(versionId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Post("invitation-site/preflight")
  @RequireCapability("invitation.publish")
  async preflight(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.preflight(auth.userId, uuid(workspaceId)),
    );
  }

  @Get("invitation-site/sync-preview")
  @RequireCapability("invitation.write")
  async syncPreview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.syncPreview(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("invitation-site/sync-apply")
  @RequireCapability("invitation.write")
  async syncApply(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.syncApply(
      auth.userId,
      uuid(workspaceId),
      requiredVersion(ifMatch),
      idempotencyKey(key),
      parseWithSchema(applyInvitationSyncSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("invitation-site/variants")
  async variants(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.variants(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("invitation-site/variants")
  @RequireCapability("invitation.write")
  async createVariant(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createVariant(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createInvitationVariantSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Put("invitation-site/variants/:variantId/draft")
  @RequireCapability("invitation.write")
  async saveVariantDraft(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("variantId") variantId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.saveVariantDraft(
      auth.userId,
      uuid(workspaceId),
      uuid(variantId),
      requiredVersion(ifMatch),
      parseWithSchema(saveInvitationVariantDraftSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Delete("invitation-site/variants/:variantId")
  @RequireCapability("invitation.write")
  async archiveVariant(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("variantId") variantId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.archiveVariant(
      auth.userId,
      uuid(workspaceId),
      uuid(variantId),
      requiredVersion(ifMatch),
      request.correlationId,
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Get("invitation-recipients")
  @RequireCapability("invitation.manage_recipients")
  async recipients(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.recipients(
      auth.userId,
      uuid(workspaceId),
      cursor,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Post("invitation-recipients")
  @RequireCapability("invitation.manage_recipients")
  async createRecipients(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(createInvitationRecipientsSchema, body);
    return apiResponse(
      request,
      await this.service.createRecipients(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        data.householdIds,
        data.guestIds,
        data.invitationVersionId,
        data.invitationVariantId,
        request.correlationId,
      ),
    );
  }

  @Put("invitation-recipients/:recipientId/variant")
  @RequireCapability("invitation.manage_recipients")
  async assignVariant(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recipientId") recipientId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(assignInvitationVariantSchema, body);
    const result = await this.service.assignVariant(
      auth.userId,
      uuid(workspaceId),
      uuid(recipientId),
      requiredVersion(ifMatch),
      data.variantId,
      request.correlationId,
    );
    return apiResponse(request, result, { version: result.version });
  }

  @Post("invitation-recipients/:recipientId/access-links")
  @RequireCapability("invitation.manage_recipients")
  async accessLinks(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recipientId") recipientId: string,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const input = parseWithSchema(createRecipientAccessLinksSchema, body);
    return apiResponse(
      request,
      await this.service.accessLinks(
        auth.userId,
        uuid(workspaceId),
        uuid(recipientId),
        input.channels,
      ),
    );
  }

  @Get("invitation-recipients/:recipientId/qr")
  @RequireCapability("invitation.manage_recipients")
  async qr(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("recipientId") recipientId: string,
    @Query("format") format: string | undefined,
    @Res() response: Response,
  ) {
    const qr = await this.service.qr(
      auth.userId,
      uuid(workspaceId),
      uuid(recipientId),
      format === "png" ? "png" : "svg",
    );
    response.setHeader("Content-Type", qr.contentType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${qr.fileName}"`,
    );
    response.setHeader("Cache-Control", "no-store");
    response.send(qr.body);
  }

  @Get("campaigns")
  @RequireCapability("campaign.read")
  async campaigns(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.campaigns(
      auth.userId,
      uuid(workspaceId),
      cursor,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Post("campaigns")
  @RequireCapability("campaign.write")
  async createCampaign(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.createCampaign(
      auth.userId,
      uuid(workspaceId),
      idempotencyKey(key),
      parseWithSchema(createCampaignSchema, body),
      request.correlationId,
    );
    return apiResponse(request, data, { version: resourceVersion(data) });
  }

  @Get("campaigns/:campaignId")
  @RequireCapability("campaign.read")
  async campaign(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("campaignId") campaignId: string,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.campaign(
      auth.userId,
      uuid(workspaceId),
      uuid(campaignId),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Patch("campaigns/:campaignId")
  @RequireCapability("campaign.write")
  async updateCampaign(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("campaignId") campaignId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.updateCampaign(
      auth.userId,
      uuid(workspaceId),
      uuid(campaignId),
      requiredVersion(ifMatch),
      parseWithSchema(updateCampaignSchema, body),
    );
    return apiResponse(request, data, { version: data.version });
  }

  @Get("campaigns/:campaignId/audience-preview")
  @RequireCapability("campaign.read")
  async audience(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("campaignId") campaignId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.audiencePreview(
        auth.userId,
        uuid(workspaceId),
        uuid(campaignId),
      ),
    );
  }

  @Post("campaigns/:campaignId/transitions")
  @RequireCapability("campaign.send")
  async transition(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("campaignId") campaignId: string,
    @Headers("if-match") ifMatch: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    const data = parseWithSchema(campaignTransitionSchema, body);
    return apiResponse(
      request,
      await this.service.transition(
        auth.userId,
        uuid(workspaceId),
        uuid(campaignId),
        requiredVersion(ifMatch),
        idempotencyKey(key),
        data.transition,
        data.scheduledAt,
        data.audienceRevision,
        request.correlationId,
      ),
    );
  }

  @Get("campaigns/:campaignId/recipients")
  @RequireCapability("campaign.view_delivery")
  async campaignRecipients(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("campaignId") campaignId: string,
    @Query("cursor") cursor: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    const data = await this.service.campaignRecipients(
      auth.userId,
      uuid(workspaceId),
      uuid(campaignId),
      cursor,
    );
    return apiResponse(request, data, {
      nextCursor: data.nextCursor ?? undefined,
    });
  }

  @Get("campaigns/:campaignId/statistics")
  @RequireCapability("campaign.view_delivery")
  async statistics(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("campaignId") campaignId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.service.statistics(
        auth.userId,
        uuid(workspaceId),
        uuid(campaignId),
      ),
    );
  }
}

@ApiTags("email-webhooks")
@Controller("api/v1/webhooks/email")
export class EmailWebhookController {
  constructor(
    @Inject(InvitationCampaignService)
    private readonly service: InvitationCampaignService,
  ) {}

  @Post(":provider")
  async webhook(
    @Param("provider") provider: string,
    @Headers("x-weddingos-signature") signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.webhook(provider, signature, body);
  }
}

function uuid(value: string) {
  return parseUuid(value);
}
function idempotencyKey(value: string | undefined) {
  return parseWithSchema(z.string().trim().min(8).max(200), value);
}
function optionalVersion(value: string | undefined) {
  if (!value) return null;
  return requiredVersion(value);
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
