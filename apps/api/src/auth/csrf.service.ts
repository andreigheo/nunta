import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { ApiEnvironment } from "@weddingos/config";
import { API_ENVIRONMENT } from "../common/environment.module";
import { hashSecret } from "./auth.crypto";

@Injectable()
export class CsrfService {
  constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  issue(rawSessionToken: string) {
    const expiresAt =
      Date.now() + this.environment.CSRF_TOKEN_TTL_SECONDS * 1000;
    const nonce = randomBytes(24).toString("base64url");
    const payload = `${hashSecret(rawSessionToken)}.${expiresAt}.${nonce}`;
    return {
      token: `${payload}.${this.sign(payload)}`,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  verify(rawSessionToken: string, token: string | undefined) {
    if (!token) return false;
    const parts = token.split(".");
    if (parts.length !== 4) return false;
    const [sessionHash, expiresAt, nonce, signature] = parts;
    if (
      !sessionHash ||
      !expiresAt ||
      !nonce ||
      !signature ||
      Number(expiresAt) <= Date.now()
    )
      return false;
    if (sessionHash !== hashSecret(rawSessionToken)) return false;
    const expected = Buffer.from(
      this.sign(`${sessionHash}.${expiresAt}.${nonce}`),
    );
    const supplied = Buffer.from(signature);
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  }

  private sign(payload: string) {
    return createHmac("sha256", this.environment.SESSION_SECRET)
      .update(payload)
      .digest("base64url");
  }
}
