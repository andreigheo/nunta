import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import {
  AccommodationController,
  SeatingController,
  TransportController,
} from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({
  imports: [AsyncModule, AuthModule, WorkspacesModule],
  controllers: [
    SeatingController,
    TransportController,
    AccommodationController,
  ],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
