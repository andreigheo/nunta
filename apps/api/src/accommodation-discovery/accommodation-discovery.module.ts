import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SafeOutboundHttpClient } from "../common/safe-outbound-http.client";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { OperationsModule } from "../operations/operations.module";
import { AccommodationDiscoveryController } from "./accommodation-discovery.controller";
import { AccommodationDiscoveryService } from "./accommodation-discovery.service";

@Module({
  imports: [AuthModule, WorkspacesModule, OperationsModule],
  controllers: [AccommodationDiscoveryController],
  providers: [AccommodationDiscoveryService, SafeOutboundHttpClient],
  exports: [AccommodationDiscoveryService],
})
export class AccommodationDiscoveryModule {}
