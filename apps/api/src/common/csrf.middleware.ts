import {
  HttpStatus,
  Inject,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { NextFunction, Response } from "express";
import { CsrfService } from "../auth/csrf.service";
import { SessionService } from "../auth/session.service";
import { API_ENVIRONMENT } from "./environment.module";
import type { WeddingOsRequest } from "./http.types";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT = [/\/webhooks(?:\/|$)/, /^\/api\/v1\/guest-companion\//];

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(CsrfService) private readonly csrf: CsrfService,
  ) {}

  use(request: WeddingOsRequest, response: Response, next: NextFunction) {
    if (
      !this.environment.CSRF_ENFORCEMENT ||
      SAFE.has(request.method) ||
      EXEMPT.some((pattern) => pattern.test(request.path))
    )
      return next();
    const rawSession = (
      request.cookies as Record<string, string | undefined> | undefined
    )?.[this.sessions.cookieName];
    if (!rawSession) return next();
    const token = request.headers["x-csrf-token"];
    if (typeof token === "string" && this.csrf.verify(rawSession, token))
      return next();
    response
      .status(HttpStatus.FORBIDDEN)
      .type("application/problem+json")
      .send({
        type: "https://weddingos.local/problems/csrf-token-invalid",
        title: "CSRF token required",
        status: HttpStatus.FORBIDDEN,
        code: "CSRF_TOKEN_INVALID",
        detail: "Obține un token CSRF nou și reîncearcă operația.",
        requestId: request.requestId,
      });
  }
}
