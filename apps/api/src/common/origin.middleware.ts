import { Inject, Injectable, type NestMiddleware } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { NextFunction, Response } from "express";
import { API_ENVIRONMENT } from "./environment.module";
import type { WeddingOsRequest } from "./http.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginMiddleware implements NestMiddleware {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  use(request: WeddingOsRequest, response: Response, next: NextFunction) {
    const origin = request.headers.origin;
    if (
      !SAFE_METHODS.has(request.method) &&
      origin &&
      origin !== this.environment.WEB_URL
    ) {
      response.status(403).type("application/problem+json").send({
        type: "https://weddingos.local/problems/origin-not-allowed",
        title: "Origin not allowed",
        status: 403,
        code: "ORIGIN_NOT_ALLOWED",
        detail: "Originea cererii nu este permisă.",
        requestId: request.requestId,
      });
      return;
    }
    next();
  }
}
