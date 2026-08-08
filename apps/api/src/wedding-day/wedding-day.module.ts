import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  GuestWeddingDayController,
  WeddingDayController,
} from "./wedding-day.controller";
import { WeddingDayService } from "./wedding-day.service";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule],
  controllers: [WeddingDayController, GuestWeddingDayController],
  providers: [WeddingDayService],
  exports: [WeddingDayService],
})
export class WeddingDayModule {}
