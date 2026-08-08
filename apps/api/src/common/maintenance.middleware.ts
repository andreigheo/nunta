import {
  HttpStatus,
  Inject,
  Injectable,
  type NestMiddleware,
} from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import type { NextFunction, Response } from "express";
import { DatabaseService } from "./database.service";
import { API_ENVIRONMENT } from "./environment.module";
import type { WeddingOsRequest } from "./http.types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALWAYS_ALLOWED = [
  /^\/health$/,
  /^\/ready$/,
  /^\/api\/v1\/internal\/metrics$/,
  /^\/api\/v1\/status$/,
  /^\/api\/v1\/platform\/maintenance-windows/,
  /\/webhooks(?:\/|$)/,
];

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  private cachedAt = 0;
  private cached: Array<{
    scope: string;
    scopeKey: string | null;
    message: string;
    supportUrl: string | null;
    endsAt: Date | null;
  }> = [];

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  async use(request: WeddingOsRequest, response: Response, next: NextFunction) {
    if (ALWAYS_ALLOWED.some((pattern) => pattern.test(request.path)))
      return next();
    if (Date.now() - this.cachedAt > 2_000) {
      this.cached = await this.database.platformMaintenanceWindow.findMany({
        where: {
          environment: this.environment.NODE_ENV,
          status: "ACTIVE",
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
        select: {
          scope: true,
          scopeKey: true,
          message: true,
          supportUrl: true,
          endsAt: true,
        },
      });
      this.cachedAt = Date.now();
    }
    const window = this.cached.find((item) => this.blocks(item, request));
    if (!window) return next();
    response
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .type("application/problem+json")
      .send({
        type: "https://weddingos.local/problems/maintenance-active",
        title: "Maintenance active",
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: "MAINTENANCE_ACTIVE",
        detail: window.message,
        requestId: request.requestId,
        estimatedEnd: window.endsAt?.toISOString() ?? null,
        supportUrl: window.supportUrl,
      });
  }

  private blocks(
    window: { scope: string; scopeKey: string | null },
    request: WeddingOsRequest,
  ) {
    if (window.scope === "FULL_PLATFORM") return true;
    if (window.scope === "MUTATIONS") return !SAFE_METHODS.has(request.method);
    if (window.scope === "MODULE")
      return Boolean(
        window.scopeKey && request.path.includes(`/${window.scopeKey}`),
      );
    if (window.scope === "PROVIDER")
      return Boolean(window.scopeKey && request.path.includes(window.scopeKey));
    return false;
  }
}
