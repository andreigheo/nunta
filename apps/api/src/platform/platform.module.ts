import { Module } from "@nestjs/common";
import { AsyncModule } from "../async/async.module";
import { AuthModule } from "../auth/auth.module";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PrivacyController } from "./privacy.controller";
import {
  VendorPrivacyController,
  WorkspacePrivacyController,
} from "./scoped-privacy.controller";

@Module({
  imports: [AsyncModule, AuthModule],
  controllers: [
    PlatformController,
    PrivacyController,
    WorkspacePrivacyController,
    VendorPrivacyController,
  ],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
