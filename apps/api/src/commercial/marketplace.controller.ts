import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { CommercialService } from "./commercial.service";

@ApiTags("marketplace")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/marketplace/vendors")
export class MarketplaceController {
  constructor(
    @Inject(CommercialService) private readonly commercial: CommercialService,
  ) {}

  @Get()
  async vendors(
    @CurrentAuth() auth: AuthenticatedSession,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    const result = await this.commercial.marketplaceVendors(auth.userId, query);
    return apiResponse(request, result, {
      nextCursor: result.nextCursor ?? undefined,
    });
  }

  @Get(":slug")
  async vendor(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("slug") slug: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.commercial.marketplaceVendor(auth.userId, slug),
    );
  }
}
