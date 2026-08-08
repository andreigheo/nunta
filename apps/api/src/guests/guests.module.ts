import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { WorkspaceBillingModule } from "../workspace-billing/workspace-billing.module";
import { GuestCrmController } from "./guest-crm.controller";
import { GuestCrmService } from "./guest-crm.service";
import {
  EmailWebhookController,
  InvitationCampaignController,
} from "./invitation-campaign.controller";
import { InvitationCampaignService } from "./invitation-campaign.service";
import {
  GuestCompanionController,
  RsvpMenuController,
} from "./rsvp-menu.controller";
import { RsvpMenuService } from "./rsvp-menu.service";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule, WorkspaceBillingModule],
  controllers: [
    GuestCrmController,
    InvitationCampaignController,
    EmailWebhookController,
    GuestCompanionController,
    RsvpMenuController,
  ],
  providers: [GuestCrmService, InvitationCampaignService, RsvpMenuService],
})
export class GuestsModule {}
