import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  GuestEventDayController,
  EventDayController,
} from "./event-day.controller";
import { EventDayService } from "./event-day.service";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule],
  controllers: [EventDayController, GuestEventDayController],
  providers: [EventDayService],
  exports: [EventDayService],
})
export class EventDayModule {}
