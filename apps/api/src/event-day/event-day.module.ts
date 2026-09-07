import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  GuestEventDayController,
  EventDayController,
} from "./event-day.controller";
import { EventDayService } from "./event-day.service";
import { MediaPortalService } from "./media-portal.service";
import {
  MediaPortalController,
  PublicMediaPortalController,
} from "./media-portal.controller";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule],
  controllers: [
    EventDayController,
    GuestEventDayController,
    MediaPortalController,
    PublicMediaPortalController,
  ],
  providers: [EventDayService, MediaPortalService],
  exports: [EventDayService],
})
export class EventDayModule {}
