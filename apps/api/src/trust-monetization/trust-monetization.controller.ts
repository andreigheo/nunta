import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
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
import { problem } from "../common/problem";
import { parseUuid } from "../common/validation";
import { RequireVendorCapability } from "../commercial/vendor-capability.decorator";
import { VendorCapabilityGuard } from "../commercial/vendor-capability.guard";
import { RequireCapability } from "../workspaces/capability.decorator";
import { CapabilityGuard } from "../workspaces/capability.guard";
import { TrustMonetizationService } from "./trust-monetization.service";

type Input = Record<string, unknown>;

@ApiTags("verified-reviews")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("review.read")
@Controller("api/v1/workspaces/:workspaceId")
export class WeddingReviewController {
  constructor(
    @Inject(TrustMonetizationService)
    private readonly service: TrustMonetizationService,
  ) {}

  @Get("review-eligibilities")
  eligibilities(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.reviewEligibilities(auth.userId, uuid(workspaceId)),
    );
  }

  @Post("reviews")
  @RequireCapability("review.write")
  create(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createReview(
        auth.userId,
        uuid(workspaceId),
        idempotencyKey(key),
        body,
      ),
    );
  }

  @Get("reviews/:reviewId")
  detail(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("reviewId") reviewId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.review(auth.userId, uuid(workspaceId), uuid(reviewId)),
    );
  }

  @Patch("reviews/:reviewId/draft")
  @RequireCapability("review.write")
  draft(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.updateReviewDraft(
        auth.userId,
        uuid(workspaceId),
        uuid(reviewId),
        version(match),
        body,
      ),
      true,
    );
  }

  @Post("reviews/:reviewId/submit")
  @RequireCapability("review.write")
  submit(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.submitReview(
        auth.userId,
        uuid(workspaceId),
        uuid(reviewId),
        version(match),
      ),
      true,
    );
  }

  @Post("reviews/:reviewId/publish")
  @RequireCapability("review.publish")
  publish(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.publishReview(
        auth.userId,
        uuid(workspaceId),
        uuid(reviewId),
        version(match),
        idempotencyKey(key),
        body.authenticityConfirmed === true,
      ),
      true,
    );
  }

  @Post("reviews/:reviewId/withdraw")
  @RequireCapability("review.withdraw")
  withdraw(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.withdrawReview(
        auth.userId,
        uuid(workspaceId),
        uuid(reviewId),
        version(match),
        idempotencyKey(key),
      ),
      true,
    );
  }

  @Post("reviews/:reviewId/reports")
  @RequireCapability("review.report")
  report(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("workspaceId") workspaceId: string,
    @Param("reviewId") reviewId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.reportReview(
        auth.userId,
        uuid(workspaceId),
        uuid(reviewId),
        idempotencyKey(key),
        body,
      ),
    );
  }
}

@ApiTags("vendor-trust-monetization")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, VendorCapabilityGuard)
@Controller("api/v1/vendor-organizations/:organizationId")
export class VendorTrustMonetizationController {
  constructor(
    @Inject(TrustMonetizationService)
    private readonly service: TrustMonetizationService,
  ) {}

  @Get("trust-monetization-overview")
  @RequireVendorCapability("vendor.subscription.read")
  overview(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.vendorOverview(auth.userId, uuid(organizationId)),
    );
  }

  @Get("search")
  @RequireVendorCapability("vendor.organization.read")
  search(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Query("q") query: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.vendorSearch(auth.userId, uuid(organizationId), query ?? ""),
    );
  }

  @Get("reviews")
  @RequireVendorCapability("vendor.review.read")
  reviews(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.vendorReviews(auth.userId, uuid(organizationId)),
    );
  }
  @Get("reviews/:reviewId")
  @RequireVendorCapability("vendor.review.read")
  review(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("reviewId") reviewId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.vendorReview(
        auth.userId,
        uuid(organizationId),
        uuid(reviewId),
      ),
    );
  }
  @Put("reviews/:reviewId/reply")
  @RequireVendorCapability("vendor.review.reply")
  reply(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.putReply(
        auth.userId,
        uuid(organizationId),
        uuid(reviewId),
        optionalVersion(match),
        body,
      ),
      true,
    );
  }
  @Post("reviews/:reviewId/reply/publish")
  @RequireVendorCapability("vendor.review.reply")
  publishReply(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.publishReply(
        auth.userId,
        uuid(organizationId),
        uuid(reviewId),
        version(match),
        idempotencyKey(key),
      ),
      true,
    );
  }
  @Post("reviews/:reviewId/disputes")
  @RequireVendorCapability("vendor.review.dispute")
  dispute(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("reviewId") reviewId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createReviewDispute(
        auth.userId,
        uuid(organizationId),
        uuid(reviewId),
        version(match),
        idempotencyKey(key),
        body,
      ),
    );
  }
  @Get("review-disputes")
  @RequireVendorCapability("vendor.review.read")
  disputes(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.reviewDisputes(auth.userId, uuid(organizationId)),
    );
  }

  @Get("subscription")
  @RequireVendorCapability("vendor.subscription.read")
  subscription(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.subscription(auth.userId, uuid(organizationId)),
    );
  }
  @Get("entitlements")
  @RequireVendorCapability("vendor.subscription.read")
  entitlements(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.entitlements(auth.userId, uuid(organizationId)),
    );
  }
  @Get("usage")
  @RequireVendorCapability("vendor.subscription.view_usage")
  usage(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.usage(auth.userId, uuid(organizationId)),
    );
  }
  @Post("subscription-checkouts")
  @RequireVendorCapability("vendor.subscription.checkout")
  checkout(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createSubscriptionCheckout(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
        body,
      ),
    );
  }
  @Post("subscription-portal-sessions")
  @RequireVendorCapability("vendor.subscription.portal")
  portal(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createPortalSession(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
      ),
    );
  }
  @Post("subscription/cancel")
  @RequireVendorCapability("vendor.subscription.manage")
  cancel(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.cancelSubscription(
        auth.userId,
        uuid(organizationId),
        version(match),
        idempotencyKey(key),
      ),
      true,
    );
  }
  @Post("subscription/resume")
  @RequireVendorCapability("vendor.subscription.manage")
  resume(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.resumeSubscription(
        auth.userId,
        uuid(organizationId),
        version(match),
        idempotencyKey(key),
      ),
      true,
    );
  }

  @Get("payout-account")
  @RequireVendorCapability("vendor.payout.read")
  payoutAccount(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.payoutAccount(auth.userId, uuid(organizationId)),
    );
  }
  @Post("payout-account")
  @RequireVendorCapability("vendor.payout.onboard")
  createPayoutAccount(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createPayoutAccount(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
        body,
      ),
    );
  }
  @Post("payout-onboarding-links")
  @RequireVendorCapability("vendor.payout.onboard")
  onboarding(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createPayoutOnboarding(
        auth.userId,
        uuid(organizationId),
        idempotencyKey(key),
      ),
    );
  }
  @Get("balance")
  @RequireVendorCapability("vendor.payout.read")
  balance(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.balance(auth.userId, uuid(organizationId)),
    );
  }
  @Get("settlements")
  @RequireVendorCapability("vendor.payout.read")
  settlements(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.settlements(auth.userId, uuid(organizationId)),
    );
  }
  @Get("settlements/:settlementId")
  @RequireVendorCapability("vendor.payout.read")
  settlement(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("settlementId") settlementId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.settlement(
        auth.userId,
        uuid(organizationId),
        uuid(settlementId),
      ),
    );
  }
  @Get("payouts")
  @RequireVendorCapability("vendor.payout.read")
  payouts(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.payouts(auth.userId, uuid(organizationId)),
    );
  }
  @Get("payouts/:payoutId")
  @RequireVendorCapability("vendor.payout.read")
  payout(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("payoutId") payoutId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.payout(auth.userId, uuid(organizationId), uuid(payoutId)),
    );
  }
  @Post("settlements/:settlementId/payouts")
  @RequireVendorCapability("vendor.payout.request")
  createPayout(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("organizationId") organizationId: string,
    @Param("settlementId") settlementId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createPayout(
        auth.userId,
        uuid(organizationId),
        uuid(settlementId),
        idempotencyKey(key),
      ),
    );
  }
}

@ApiTags("marketplace-trust")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/marketplace/vendors/:slug")
export class MarketplaceTrustController {
  constructor(
    @Inject(TrustMonetizationService)
    private readonly service: TrustMonetizationService,
  ) {}
  @Get("reviews")
  reviews(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("slug") slug: string,
    @Query() query: Record<string, string | undefined>,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.publicReviews(auth.userId, slug, query),
    );
  }
  @Get("rating-summary")
  rating(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("slug") slug: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.publicRatingSummary(auth.userId, slug),
    );
  }
}

@ApiTags("platform-trust-monetization")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1/platform")
export class PlatformTrustMonetizationController {
  constructor(
    @Inject(TrustMonetizationService)
    private readonly service: TrustMonetizationService,
  ) {}
  @Get("review-moderation") moderation(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(request, this.service.moderationQueue(auth.userId));
  }
  @Get("review-moderation/:caseId") moderationCase(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("caseId") caseId: string,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.moderationCase(auth.userId, uuid(caseId)),
    );
  }
  @Post("review-moderation/:caseId/transitions") moderationTransition(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("caseId") caseId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.transitionModeration(
        auth.userId,
        uuid(caseId),
        version(match),
        String(body.status ?? ""),
      ),
      true,
    );
  }
  @Post("review-moderation/:caseId/decisions") moderationDecision(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("caseId") caseId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.decideModeration(
        auth.userId,
        uuid(caseId),
        version(match),
        idempotencyKey(key),
        body,
      ),
    );
  }

  @Get("subscription-products") products(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(request, this.service.platformProducts(auth.userId));
  }
  @Post("subscription-products") createProduct(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createPlatformProduct(
        auth.userId,
        idempotencyKey(key),
        body,
      ),
    );
  }
  @Patch("subscription-products/:productId") updateProduct(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("productId") productId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.updatePlatformProduct(
        auth.userId,
        uuid(productId),
        version(match),
        body,
      ),
      true,
    );
  }
  @Get("subscription-prices") prices(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(request, this.service.platformPrices(auth.userId));
  }
  @Post("subscription-prices") createPrice(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.createPlatformPrice(auth.userId, idempotencyKey(key), body),
    );
  }
  @Patch("subscription-prices/:priceId") updatePrice(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("priceId") priceId: string,
    @Headers("if-match") match: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.updatePlatformPrice(
        auth.userId,
        uuid(priceId),
        version(match),
        body,
      ),
      true,
    );
  }

  @Get("settlements") settlements(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(request, this.service.platformSettlements(auth.userId));
  }
  @Post("settlements/calculate") calculate(
    @CurrentAuth() auth: AuthenticatedSession,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: Input,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.platformCalculateSettlement(
        auth.userId,
        idempotencyKey(key),
        body,
      ),
    );
  }
  @Post("settlements/:settlementId/finalize") finalize(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("settlementId") settlementId: string,
    @Headers("if-match") match: string | undefined,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.platformFinalizeSettlement(
        auth.userId,
        uuid(settlementId),
        version(match),
        idempotencyKey(key),
      ),
      true,
    );
  }
  @Post("settlements/:settlementId/payout") payout(
    @CurrentAuth() auth: AuthenticatedSession,
    @Param("settlementId") settlementId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(
      request,
      this.service.platformCreatePayout(
        auth.userId,
        uuid(settlementId),
        idempotencyKey(key),
      ),
    );
  }
}

@ApiTags("vendor-subscriptions")
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
@Controller("api/v1")
export class SubscriptionCatalogController {
  constructor(
    @Inject(TrustMonetizationService)
    private readonly service: TrustMonetizationService,
  ) {}
  @Get("vendor-subscription-plans") plans(
    @CurrentAuth() auth: AuthenticatedSession,
    @Req() request: WeddingOsRequest,
  ) {
    return respond(request, this.service.subscriptionPlans(auth.userId));
  }
}

@ApiTags("provider-webhooks")
@Controller("api/v1/webhooks")
export class TrustMonetizationWebhookController {
  constructor(
    @Inject(TrustMonetizationService)
    private readonly service: TrustMonetizationService,
  ) {}
  @Post("subscriptions/:provider")
  subscription(
    @Param("provider") provider: string,
    @Headers("x-weddingos-signature") signature: string | undefined,
    @Headers("x-weddingos-timestamp") timestamp: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    return respond(
      request,
      this.service.subscriptionWebhook(
        provider,
        raw(request),
        signature,
        timestamp,
      ),
    );
  }
  @Post("payouts/:provider")
  payout(
    @Param("provider") provider: string,
    @Headers("x-weddingos-signature") signature: string | undefined,
    @Headers("x-weddingos-timestamp") timestamp: string | undefined,
    @Req() request: WeddingOsRequest & { rawBody?: Buffer },
  ) {
    return respond(
      request,
      this.service.payoutWebhook(provider, raw(request), signature, timestamp),
    );
  }
}

async function respond(
  request: WeddingOsRequest,
  value: Promise<unknown>,
  includeVersion = false,
) {
  const data = await value;
  return apiResponse(
    request,
    data,
    includeVersion ? { version: versionOf(data) } : undefined,
  );
}
function uuid(value: string) {
  return parseUuid(value, "id");
}
function idempotencyKey(value: string | undefined) {
  if (!value || value.length > 200)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Idempotency-Key required",
    );
  return value;
}
function optionalVersion(value: string | undefined) {
  return value ? version(value) : null;
}
function version(value: string | undefined) {
  if (!value)
    problem(
      "PRECONDITION_REQUIRED",
      HttpStatus.PRECONDITION_REQUIRED,
      "If-Match required",
    );
  const parsed = Number(value.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(parsed) || parsed < 1)
    problem("VALIDATION_FAILED", HttpStatus.BAD_REQUEST, "If-Match invalid");
  return parsed;
}
function versionOf(value: unknown) {
  return value &&
    typeof value === "object" &&
    "version" in value &&
    typeof (value as { version?: unknown }).version === "number"
    ? (value as { version: number }).version
    : undefined;
}
function raw(request: WeddingOsRequest & { rawBody?: Buffer }) {
  if (!request.rawBody)
    problem(
      "VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "Raw webhook body required",
    );
  return request.rawBody;
}
