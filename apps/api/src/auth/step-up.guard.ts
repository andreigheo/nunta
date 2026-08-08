import { SetMetadata } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ApiEnvironment } from "@weddingos/config";
import { DatabaseService } from "../common/database.service";
import { API_ENVIRONMENT } from "../common/environment.module";
import type { WeddingOsRequest } from "../common/http.types";
import { problem } from "../common/problem";
import { hashMfaValue } from "./mfa.crypto";

const STEP_UP_PURPOSE = "weddingos:step-up-purpose";
export const RequireAdminStepUp = (purpose: string) =>
  SetMetadata(STEP_UP_PURPOSE, purpose);

@Injectable()
export class AdminStepUpGuard implements CanActivate {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const purpose = this.reflector.getAllAndOverride<string>(STEP_UP_PURPOSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!purpose) return true;
    if (!this.environment.FEATURE_MFA_ENABLED) return true;
    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    if (!request.auth)
      problem(
        "UNAUTHENTICATED",
        HttpStatus.UNAUTHORIZED,
        "Authentication required",
      );
    const rawToken = request.headers["x-admin-step-up"];
    if (typeof rawToken !== "string") {
      problem(
        "STEP_UP_REQUIRED",
        HttpStatus.FORBIDDEN,
        "Step-up authentication required",
        undefined,
        undefined,
        { purpose },
      );
    }
    const stepUp = await this.database.adminStepUpSession.findFirst({
      where: {
        userId: request.auth.userId,
        sessionId: request.auth.sessionId,
        purpose,
        nonceHash: hashMfaValue(rawToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!stepUp)
      problem(
        "STEP_UP_REQUIRED",
        HttpStatus.FORBIDDEN,
        "Valid purpose-bound step-up required",
        undefined,
        undefined,
        { purpose },
      );
    return true;
  }
}
