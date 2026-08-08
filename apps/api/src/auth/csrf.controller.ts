import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { apiResponse } from "../common/api-response";
import type { WeddingOsRequest } from "../common/http.types";
import { CsrfService } from "./csrf.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";

@ApiTags("authentication")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/auth/csrf")
export class CsrfController {
  constructor(
    @Inject(CsrfService) private readonly csrf: CsrfService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Get()
  get(@Req() request: WeddingOsRequest) {
    const rawSession = (request.cookies as Record<string, string | undefined>)[
      this.sessions.cookieName
    ];
    return apiResponse(request, this.csrf.issue(rawSession!));
  }
}
