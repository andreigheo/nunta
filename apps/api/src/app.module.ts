import type { MiddlewareConsumer } from "@nestjs/common";
import { Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { EnvironmentModule } from "./common/environment.module";
import { DatabaseModule } from "./common/database.module";
import { OriginMiddleware } from "./common/origin.middleware";
import { CsrfMiddleware } from "./common/csrf.middleware";
import { MaintenanceMiddleware } from "./common/maintenance.middleware";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";
import { TeamModule } from "./team/team.module";
import { AsyncModule } from "./async/async.module";
import { JobsModule } from "./jobs/jobs.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ActivityModule } from "./activity/activity.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { PlanningModule } from "./planning/planning.module";
import { OperationsModule } from "./operations/operations.module";
import { GuestsModule } from "./guests/guests.module";
import { CommercialModule } from "./commercial/commercial.module";
import { SecureCommerceModule } from "./secure-commerce/secure-commerce.module";
import { TrustMonetizationModule } from "./trust-monetization/trust-monetization.module";
import { WeddingDayModule } from "./wedding-day/wedding-day.module";
import { MarketingModule } from "./marketing/marketing.module";
import { IntelligenceModule } from "./intelligence/intelligence.module";
import { PlatformModule } from "./platform/platform.module";
import { WorkspaceBillingModule } from "./workspace-billing/workspace-billing.module";
import { AccommodationDiscoveryModule } from "./accommodation-discovery/accommodation-discovery.module";
import { CreativeModule } from "./creative/creative.module";

const throttleGuardProviders =
  process.env.NODE_ENV === "test" &&
  process.env.WEDDINGOS_TEST_DISABLE_THROTTLE === "true"
    ? []
    : [{ provide: APP_GUARD, useClass: ThrottlerGuard }];

@Module({
  imports: [
    EnvironmentModule,
    DatabaseModule,
    AsyncModule,
    AuditModule,
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 120,
      },
    ]),
    HealthModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    WorkspaceBillingModule,
    TeamModule,
    JobsModule,
    NotificationsModule,
    ActivityModule,
    OnboardingModule,
    PlanningModule,
    OperationsModule,
    AccommodationDiscoveryModule,
    CreativeModule,
    GuestsModule,
    CommercialModule,
    SecureCommerceModule,
    TrustMonetizationModule,
    WeddingDayModule,
    MarketingModule,
    IntelligenceModule,
    PlatformModule,
  ],
  providers: throttleGuardProviders,
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestContextMiddleware,
        OriginMiddleware,
        MaintenanceMiddleware,
        CsrfMiddleware,
      )
      .forRoutes("*");
  }
}
