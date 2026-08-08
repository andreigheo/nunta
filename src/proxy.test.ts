import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

describe("authentication entry routing", () => {
  it("expires demo mode when a user opens real sign-in", () => {
    const request = new NextRequest("http://localhost/sign-in", {
      headers: {
        cookie: "weddingos_demo=1",
      },
    });

    const response = proxy(request);
    const demoCookie = response.cookies.get("weddingos_demo");

    expect(response.status).toBe(200);
    expect(demoCookie?.value).toBe("");
    expect(demoCookie?.maxAge).toBe(0);
  });

  it("expires both session modes when the user explicitly switches account", () => {
    const request = new NextRequest("http://localhost/sign-in?switch=1", {
      headers: {
        cookie: "weddingos_session=stale; weddingos_demo=1",
      },
    });

    const response = proxy(request);

    expect(response.cookies.get("weddingos_session")?.maxAge).toBe(0);
    expect(response.cookies.get("weddingos_demo")?.maxAge).toBe(0);
  });

  it("keeps the access-denied recovery redirect and clears stale state", () => {
    const request = new NextRequest("http://localhost/access-denied", {
      headers: {
        cookie: "weddingos_session=stale; weddingos_demo=1",
      },
    });

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/sign-in?switch=1",
    );
    expect(response.cookies.get("weddingos_session")?.maxAge).toBe(0);
    expect(response.cookies.get("weddingos_demo")?.maxAge).toBe(0);
  });
});
