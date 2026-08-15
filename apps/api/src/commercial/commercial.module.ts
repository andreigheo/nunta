import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { CommercialController } from "./commercial.controller";
import { CommercialService } from "./commercial.service";
import { MarketplaceController } from "./marketplace.controller";
import { VendorCapabilityGuard } from "./vendor-capability.guard";
import {
  VendorController,
  VendorInvitationController,
  VendorScopedController,
} from "./vendor.controller";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [
    MarketplaceController,
    VendorController,
    VendorInvitationController,
    VendorScopedController,
    CommercialController,
  ],
  providers: [CommercialService, VendorCapabilityGuard],
  exports: [CommercialService],
})
export class CommercialModule {}
