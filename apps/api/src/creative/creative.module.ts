import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { CreativeController } from "./creative.controller";
import { CreativeService } from "./creative.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [CreativeController],
  providers: [CreativeService],
})
export class CreativeModule {}
