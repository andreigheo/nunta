import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { WorkspaceBillingModule } from "../workspace-billing/workspace-billing.module";
import { CommercialModule } from "../commercial/commercial.module";
import { GuestsModule } from "../guests/guests.module";
import { OperationsModule } from "../operations/operations.module";
import { PlanningModule } from "../planning/planning.module";
import { EventDayModule } from "../event-day/event-day.module";
import { IntelligenceController } from "./intelligence.controller";
import { IntelligenceService } from "./intelligence.service";
import { CopilotMemoryService } from "./copilot-memory.service";

@Module({
  imports: [
    AsyncModule,
    AuthModule,
    WorkspacesModule,
    WorkspaceBillingModule,
    PlanningModule,
    CommercialModule,
    GuestsModule,
    OperationsModule,
    EventDayModule,
  ],
  controllers: [IntelligenceController],
  providers: [IntelligenceService, CopilotMemoryService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}
