import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { PaddleService } from "./paddle.service";
import {
  PaddleWebhookController,
  PublicPaddleController,
  WorkspaceBillingController,
} from "./workspace-billing.controller";
import { WorkspaceBillingService } from "./workspace-billing.service";
import { WorkspaceEntitlementService } from "./workspace-entitlement.service";

@Module({
  imports: [AuthModule, WorkspacesModule],
  controllers: [
    WorkspaceBillingController,
    PublicPaddleController,
    PaddleWebhookController,
  ],
  providers: [
    WorkspaceBillingService,
    WorkspaceEntitlementService,
    PaddleService,
  ],
  exports: [WorkspaceBillingService, WorkspaceEntitlementService],
})
export class WorkspaceBillingModule {}
