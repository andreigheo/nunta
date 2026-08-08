import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { Injectable, Logger, type NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { finalize, type Observable } from "rxjs";
import type { WeddingOsRequest } from "./http.types";
import { activeTraceId } from "../telemetry";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HttpRequest");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      finalize(() => {
        this.logger.log(
          JSON.stringify({
            event: "http.request",
            requestId: request.requestId,
            correlationId: request.correlationId,
            method: request.method,
            path: request.path,
            traceId: activeTraceId(),
            status: response.statusCode,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            userId: request.auth?.userId,
            workspaceId: request.membership?.workspaceId,
          }),
        );
      }),
    );
  }
}
