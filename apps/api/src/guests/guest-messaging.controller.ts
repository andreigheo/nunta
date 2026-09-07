import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import type { ApiEnvironment } from "@weddingos/config";
import {
  guestMessageConsentSchema,
  guestMessageInputSchema,
} from "@weddingos/contracts";
import {
  callbackStatus,
  normalizedPhone,
  phoneHash,
  validTwilioForm,
} from "@weddingos/jobs";
import { z } from "zod";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { parseUuid, parseWithSchema } from "../common/validation";
import { problem } from "../common/problem";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { GuestMessagingService } from "./guest-messaging.service";

@Controller("api/v1/workspaces/:workspaceId/guest-messaging")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("campaign.send")
export class GuestMessagingController {
  constructor(
    @Inject(GuestMessagingService)
    private readonly service: GuestMessagingService,
  ) {}
  @Get()
  async overview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.overview(auth.userId, parseUuid(workspaceId)),
    );
  }
  @Put("consents/:guestId")
  async consent(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") wid: string,
    @Param("guestId") gid: string,
    @Body() body: unknown,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.consent(
        auth.userId,
        parseUuid(wid),
        parseUuid(gid),
        parseWithSchema(guestMessageConsentSchema, body),
      ),
    );
  }
  @Post("messages")
  async send(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") wid: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.send(
        auth.userId,
        parseUuid(wid),
        parseWithSchema(z.string().min(8).max(100), key),
        parseWithSchema(guestMessageInputSchema, body),
        req.correlationId,
      ),
    );
  }
}

@Controller("api/v1/webhooks/twilio")
export class TwilioWebhookController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly env: ApiEnvironment,
  ) {}
  private verify(body: unknown, signature: string | undefined, url: string) {
    const form = parseWithSchema(z.record(z.string().max(10000)), body);
    if (!url || !signature || !validTwilioForm(this.env, url, signature, form))
      problem("FORBIDDEN", HttpStatus.FORBIDDEN, "Semnătură Twilio invalidă.");
    return form;
  }
  @Post("status")
  @HttpCode(204)
  async status(
    @Body() body: unknown,
    @Headers("x-twilio-signature") signature: string | undefined,
    @Query("messageId") rawId: string,
  ) {
    const id = parseUuid(rawId);
    if (!this.env.TWILIO_STATUS_CALLBACK_URL)
      problem("FEATURE_DISABLED", 503, "Twilio indisponibil.");
    const url = new URL(this.env.TWILIO_STATUS_CALLBACK_URL);
    url.searchParams.set("messageId", id);
    const form = this.verify(body, signature, url.toString());
    const channel = form.To?.startsWith("whatsapp:") ? "WHATSAPP" : "SMS";
    const from =
      channel === "WHATSAPP"
        ? `whatsapp:${this.env.TWILIO_WHATSAPP_FROM}`
        : this.env.TWILIO_SMS_FROM;
    const phone = normalizedPhone((form.To ?? "").replace(/^whatsapp:/, ""));
    const status = callbackStatus(form.MessageStatus ?? "");
    if (
      !phone ||
      form.From !== from ||
      !/^SM[a-f0-9]{32}$/i.test(form.MessageSid ?? "")
    )
      problem("VALIDATION_FAILED", 400, "Mesaj Twilio invalid.");
    if (status)
      await this.db
        .$executeRaw`SELECT public.sarbato_message_status(${id}::uuid,${form.MessageSid!},${phoneHash(phone)},${channel},${status},${form.ErrorCode?.slice(0, 80) || null})`;
  }
  @Post("inbound")
  async inbound(
    @Body() body: unknown,
    @Headers("x-twilio-signature") signature: string | undefined,
    @Res() response: Response,
  ) {
    const form = this.verify(body, signature, this.env.TWILIO_INBOUND_URL);
    const channel = form.From?.startsWith("whatsapp:") ? "WHATSAPP" : "SMS";
    const to =
      channel === "WHATSAPP"
        ? `whatsapp:${this.env.TWILIO_WHATSAPP_FROM}`
        : this.env.TWILIO_SMS_FROM;
    const phone = normalizedPhone((form.From ?? "").replace(/^whatsapp:/, ""));
    if (!phone || form.To !== to)
      problem("VALIDATION_FAILED", 400, "Destinație Twilio invalidă.");
    const action = (form.OptOutType || form.Body || "").trim().toUpperCase();
    if (
      [
        "STOP",
        "STOPALL",
        "UNSUBSCRIBE",
        "CANCEL",
        "END",
        "QUIT",
        "START",
        "UNSTOP",
      ].includes(action)
    )
      await this.db
        .$executeRaw`SELECT public.sarbato_message_optout(${phoneHash(phone)},${channel},${!["START", "UNSTOP"].includes(action)})`;
    response
      .type("text/xml")
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
}
