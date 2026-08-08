import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { WorkspaceBillingModule } from "../workspace-billing/workspace-billing.module";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [AuthModule, WorkspacesModule, WorkspaceBillingModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
