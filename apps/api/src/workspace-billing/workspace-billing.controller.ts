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
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import {
  createWorkspaceSubscriptionCheckoutSchema,
  createWorkspaceSupportCaseSchema,
} from "@weddingos/contracts";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SessionAuthGuard } from "../auth/session-auth.guard";
import { apiResponse } from "../common/api-response";
import type {
  AuthenticatedSession,
  WeddingOsRequest,
} from "../common/http.types";
import { problem } from "../common/problem";
import { parseUuid, parseWithSchema } from "../common/validation";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { WorkspaceBillingService } from "./workspace-billing.service";
import { PaddleService } from "./paddle.service";

@ApiTags("workspace-billing")
@ApiCookieAuth()
@Controller("api/v1/workspaces/:workspaceId/billing")
export class WorkspaceBillingController {
  constructor(
    @Inject(WorkspaceBillingService)
    private readonly billing: WorkspaceBillingService,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.billing.read")
  async overview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.billing.overview(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Post("checkout")
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.billing.manage")
  async checkout(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Idempotency-Key required",
      );
    const input = parseWithSchema(
      createWorkspaceSubscriptionCheckoutSchema,
      body,
    );
    return apiResponse(
      request,
      await this.billing.startCheckout(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        input.plan,
        idempotencyKey,
      ),
    );
  }

  @Post("portal")
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.billing.manage")
  async portal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return apiResponse(
      request,
      await this.billing.portal(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
      ),
    );
  }

  @Post("support-cases")
  @UseGuards(SessionAuthGuard, CapabilityGuard)
  @RequireCapability("workspace.read")
  async createSupportCase(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: WeddingOsRequest,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Idempotency-Key required",
      );
    return apiResponse(
      request,
      await this.billing.createSupportCase(
        auth.userId,
        parseUuid(workspaceId, "workspaceId"),
        parseWithSchema(createWorkspaceSupportCaseSchema, body),
        idempotencyKey,
      ),
    );
  }
}

@ApiTags("public-billing")
@Controller("api/v1/public/billing/paddle")
export class PublicPaddleController {
  constructor(@Inject(PaddleService) private readonly paddle: PaddleService) {}

  @Get()
  configuration(@Req() request: WeddingOsRequest) {
    return apiResponse(request, this.paddle.publicConfiguration());
  }
}

@ApiTags("provider-webhooks")
@Controller("api/v1/webhooks/paddle")
export class PaddleWebhookController {
  constructor(
    @Inject(WorkspaceBillingService)
    private readonly billing: WorkspaceBillingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Headers("paddle-signature") signature: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    if (!request.rawBody)
      problem(
        "VALIDATION_FAILED",
        HttpStatus.BAD_REQUEST,
        "Raw webhook body required",
      );
    return this.billing.webhook(request.rawBody, signature);
  }
}
