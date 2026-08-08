import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  PublicAggregateConsentController,
  PublicMarketingController,
} from "./marketing.controller";
import { MarketingService } from "./marketing.service";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule],
  controllers: [PublicMarketingController, PublicAggregateConsentController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
