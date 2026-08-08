import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { PlanningController } from "./planning.controller";
import { PlanningService } from "./planning.service";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule],
  controllers: [PlanningController],
  providers: [PlanningService],
})
export class PlanningModule {}
