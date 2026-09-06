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
  Header,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import {
  mediaPortalSettingsSchema,
  mediaPortalUploadSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { RequireCapability } from "../workspaces/capability.decorator";
import { parseUuid, parseWithSchema } from "../common/validation";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { MediaPortalService } from "./media-portal.service";

@Controller("api/v1/workspaces/:workspaceId/media-portals")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("guest_moment.moderate")
export class MediaPortalController {
  constructor(
    @Inject(MediaPortalService) private service: MediaPortalService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  async list(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspace: string,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.list(auth.userId, parseUuid(workspace)),
    );
  }
  @Post()
  async save(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspace: string,
    @Body() body: unknown,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.save(
        auth.userId,
        parseUuid(workspace),
        parseWithSchema(mediaPortalSettingsSchema, body),
      ),
    );
  }
  @Get("moments/:momentId/download")
  @Header("Cache-Control", "no-store")
  async download(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspace: string,
    @Param("momentId") moment: string,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.download(
        auth.userId,
        parseUuid(workspace),
        parseUuid(moment),
      ),
    );
  }
  @Get("moments/:momentId/content")
  @Header("Cache-Control", "no-store")
  async content(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspace: string,
    @Param("momentId") moment: string,
    @Req() req: WeddingOsRequest,
  ) {
    return apiResponse(
      req,
      await this.service.download(
        auth.userId,
        parseUuid(workspace),
        parseUuid(moment),
        false,
      ),
    );
  }
}
const bearer = z
  .string()
  .regex(/^Bearer [A-Za-z0-9_-]{43}$/)
  .transform((value) => value.slice(7));
const completion = z.object({
  uploadToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
@Controller("api/v1/event-media")
export class PublicMediaPortalController {
  constructor(
    @Inject(MediaPortalService) private service: MediaPortalService,
  ) {}
  @Get()
  @Header("Cache-Control", "no-store")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  bootstrap(@Headers("authorization") authorization: string | undefined) {
    return this.service.bootstrap(parseWithSchema(bearer, authorization));
  }
  @Post("uploads")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  create(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.service.create(
      parseWithSchema(bearer, authorization),
      parseWithSchema(mediaPortalUploadSchema, body),
    );
  }
  @Post("uploads/:momentId/complete")
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  complete(
    @Headers("authorization") authorization: string | undefined,
    @Param("momentId") moment: string,
    @Body() body: unknown,
    @Req() req: WeddingOsRequest,
  ) {
    return this.service.complete(
      parseWithSchema(bearer, authorization),
      parseWithSchema(completion, body).uploadToken,
      parseUuid(moment),
      req.correlationId,
    );
  }
}
