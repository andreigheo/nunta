import { Module } from "@nestjs/common";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AuthModule } from "../auth/auth.module";
import { ActivityController } from "./activity.controller";
import { ActivityService } from "./activity.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
