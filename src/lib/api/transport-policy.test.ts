import { describe, expect, it } from "vitest";
import { browserApiBasePath } from "./client";
import { classifyApiProblem, isDemoCookieHeader } from "./transport-policy";

describe("frontend API transport policy", () => {
  it.each([
    [401, "reauthenticate"],
    [403, "forbidden"],
    [409, "conflict"],
    [412, "conflict"],
    [422, "inline"],
  ] as const)("classifies HTTP %i", (status, policy) => {
    expect(classifyApiProblem(status)).toBe(policy);
  });

  it("denies real transport whenever the exact demo cookie is active", () => {
    expect(isDemoCookieHeader("theme=dark; weddingos_demo=1; session=real"))
      .toBe(true);
    expect(isDemoCookieHeader("weddingos_demo=0; session=real")).toBe(false);
    expect(isDemoCookieHeader("not_weddingos_demo=1")).toBe(false);
  });

  it("uses only the same-origin API path in browser code", () => {
    expect(browserApiBasePath).toBe("/api/v1");
    expect(browserApiBasePath).not.toMatch(/^https?:\/\//);
  });
});
