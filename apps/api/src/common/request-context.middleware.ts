import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { WeddingOsRequest } from "./http.types";

function safeHeader(value: string | string[] | undefined): string | undefined {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (
    !normalized ||
    normalized.length > 128 ||
    !/^[a-zA-Z0-9._:-]+$/.test(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: WeddingOsRequest, response: Response, next: NextFunction) {
    request.requestId =
      safeHeader(request.headers["x-request-id"]) ?? randomUUID();
    request.correlationId =
      safeHeader(request.headers["x-correlation-id"]) ?? request.requestId;
    response.setHeader("X-Request-Id", request.requestId);
    response.setHeader("X-Correlation-Id", request.correlationId);
    next();
  }
}
