import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CapabilityGuard } from "./capability.guard";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  imports: [AuthModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, CapabilityGuard],
  exports: [WorkspacesService, CapabilityGuard],
})
export class WorkspacesModule {}
