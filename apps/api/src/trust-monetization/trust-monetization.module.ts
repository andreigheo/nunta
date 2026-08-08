import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { VendorCapabilityGuard } from "../commercial/vendor-capability.guard";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  MarketplaceTrustController,
  PlatformTrustMonetizationController,
  SubscriptionCatalogController,
  TrustMonetizationWebhookController,
  VendorTrustMonetizationController,
  WeddingReviewController,
} from "./trust-monetization.controller";
import { trustProviderBindings } from "./providers";
import { TrustMonetizationService } from "./trust-monetization.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [
    WeddingReviewController,
    VendorTrustMonetizationController,
    MarketplaceTrustController,
    PlatformTrustMonetizationController,
    SubscriptionCatalogController,
    TrustMonetizationWebhookController,
  ],
  providers: [
    TrustMonetizationService,
    VendorCapabilityGuard,
    ...trustProviderBindings,
  ],
  exports: [TrustMonetizationService],
})
export class TrustMonetizationModule {}
