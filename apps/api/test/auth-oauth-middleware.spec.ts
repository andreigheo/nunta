import type { NextFunction, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { CsrfMiddleware } from "../src/common/csrf.middleware";
import type { WeddingOsRequest } from "../src/common/http.types";
import { OriginMiddleware } from "../src/common/origin.middleware";

const webUrl = "https://sarbato.space";

function request(input: {
  path?: string;
  originalUrl?: string;
  method?: string;
  origin?: string;
  session?: string;
}): WeddingOsRequest {
  return {
    method: input.method ?? "POST",
    // Nest mounts global middleware on a wildcard route. Express consumes that
    // mount path, so `path` can be `/` while `originalUrl` remains canonical.
    path: input.path ?? "/",
    originalUrl: input.originalUrl ?? "/api/v1/auth/google",
    headers: input.origin ? { origin: input.origin } : {},
    cookies: input.session ? { sarbato_session: input.session } : {},
    requestId: "request-id",
  } as WeddingOsRequest;
}

function response() {
  const send = vi.fn();
  const type = vi.fn().mockReturnValue({ send });
  const status = vi.fn().mockReturnValue({ type });
  return {
    value: { status } as unknown as Response,
    status,
    type,
    send,
  };
}

describe("Google OAuth initiation middleware", () => {
  it("allows a same-origin OAuth POST even when a stale session cookie exists", () => {
    const middleware = new CsrfMiddleware(
      { CSRF_ENFORCEMENT: true, WEB_URL: webUrl } as never,
      { cookieName: "sarbato_session" } as never,
      { verify: vi.fn().mockReturnValue(false) } as never,
    );
    const next = vi.fn() as unknown as NextFunction;
    const res = response();

    middleware.use(
      request({ origin: webUrl, session: "stale-session-token" }),
      res.value,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("continues to require CSRF for other authenticated POST routes", () => {
    const middleware = new CsrfMiddleware(
      { CSRF_ENFORCEMENT: true, WEB_URL: webUrl } as never,
      { cookieName: "sarbato_session" } as never,
      { verify: vi.fn().mockReturnValue(false) } as never,
    );
    const next = vi.fn() as unknown as NextFunction;
    const res = response();

    middleware.use(
      request({
        originalUrl: "/api/v1/workspaces",
        origin: webUrl,
        session: "active-session-token",
      }),
      res.value,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: "CSRF_TOKEN_INVALID" }),
    );
  });

  it("requires the exact Sarbato origin for OAuth initiation", () => {
    const middleware = new OriginMiddleware({ WEB_URL: webUrl } as never);

    for (const origin of [undefined, "https://attacker.example"]) {
      const next = vi.fn() as unknown as NextFunction;
      const res = response();
      middleware.use(request({ origin }), res.value, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED" }),
      );
    }

    const next = vi.fn() as unknown as NextFunction;
    const res = response();
    middleware.use(request({ origin: webUrl }), res.value, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
