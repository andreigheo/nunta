import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { WeddingOsRequest } from "../common/http.types";
import { problem } from "../common/problem";
import { SessionService } from "./session.service";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WeddingOsRequest>();
    const cookies = request.cookies as
      Record<string, string | undefined> | undefined;
    const auth = await this.sessions.authenticate(
      cookies?.[this.sessions.cookieName],
    );
    if (!auth) {
      problem(
        "UNAUTHENTICATED",
        HttpStatus.UNAUTHORIZED,
        "Authentication required",
        "Sesiunea lipsește, a expirat sau a fost revocată.",
      );
    }
    request.auth = auth;
    return true;
  }
}
