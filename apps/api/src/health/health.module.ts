import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AsyncHealthService } from "./async-health.service";
import { PublicStatusController } from "./status.controller";

@Module({
  controllers: [HealthController, PublicStatusController],
  providers: [AsyncHealthService],
})
export class HealthModule {}
