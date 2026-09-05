import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionAuthGuard } from "./session-auth.guard";
import { SessionService } from "./session.service";
import { CsrfController } from "./csrf.controller";
import { CsrfService } from "./csrf.service";
import { MfaController, StepUpController } from "./mfa.controller";
import { MfaService } from "./mfa.service";
import { AdminStepUpGuard } from "./step-up.guard";
import { SecurityDetectionService } from "../common/security-detection.service";
import { GoogleOAuthService } from "./google-oauth.service";

@Module({
  controllers: [
    AuthController,
    CsrfController,
    MfaController,
    StepUpController,
  ],
  providers: [
    AuthService,
    SessionService,
    SessionAuthGuard,
    CsrfService,
    MfaService,
    AdminStepUpGuard,
    SecurityDetectionService,
    GoogleOAuthService,
  ],
  exports: [
    SessionService,
    SessionAuthGuard,
    CsrfService,
    MfaService,
    AdminStepUpGuard,
  ],
})
export class AuthModule {}
