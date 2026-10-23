import { afterEach, describe, expect, it, vi } from "vitest";
import type { SafeOutboundHttpClient } from "../src/common/safe-outbound-http.client";
import { GeoapifyProvider } from "../src/accommodation-discovery/providers/geoapify-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function provider(
  response = new Response(
    JSON.stringify({ type: "FeatureCollection", features: [] }),
    { status: 200 },
  ),
) {
  const fetch = vi.fn().mockResolvedValue(response);
  const geo = new GeoapifyProvider({
    fetch,
  } as unknown as SafeOutboundHttpClient);
  const reserve = vi.spyOn(geo, "reserveCredits").mockResolvedValue(undefined);
  return { geo, fetch, reserve };
}

describe("Geoapify request contract and failure boundaries", () => {
  it("reserves a bounded Free-tier cost before a fixed-origin HTTPS request", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "unit-test-key");
    const { geo, fetch, reserve } = provider();
    await geo.places(44.43, 26.1, 2);
    expect(reserve).toHaveBeenCalledWith(5);
    const [url, init, policy] = fetch.mock.calls[0];
    expect(url.origin).toBe("https://api.geoapify.com");
    expect(url.pathname).toBe("/v2/places");
    expect(url.searchParams.get("filter")).toBe("circle:26.1,44.43,2000");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(policy).toMatchObject({
      allowedHostnames: ["api.geoapify.com"],
      maxRedirects: 0,
      timeoutMs: 6000,
      maxResponseBytes: 2000000,
    });
    expect(init).not.toHaveProperty("body");
    expect(url.searchParams.has("apiKey")).toBe(false);
    expect(init.headers["x-api-key"]).toBe("unit-test-key");
  });

  it("sends only the requested location text to geocoding and reserves one credit", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "unit-test-key");
    const { geo, fetch, reserve } = provider();
    await geo.geocode("Brașov, România");
    expect(reserve).toHaveBeenCalledWith(1);
    expect([...fetch.mock.calls[0][0].searchParams.keys()]).toEqual([
      "text",
      "limit",
      "lang",
    ]);
  });

  it.each([
    "GEOAPIFY_DAILY_LIMIT",
    "GEOAPIFY_RATE_LIMIT",
    "GEOAPIFY_BUDGET_UNAVAILABLE",
  ])("never sends upstream when %s", async (reason) => {
    vi.stubEnv("GEOAPIFY_API_KEY", "unit-test-key");
    const { geo, fetch, reserve } = provider();
    reserve.mockRejectedValue(new Error(reason));
    await expect(geo.places(44.43, 26.1, 2)).rejects.toThrow(reason);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never sends upstream without a configured server key", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    const { geo, fetch, reserve } = provider();
    await expect(geo.geocode("București")).rejects.toThrow(
      "GEOAPIFY_NOT_CONFIGURED",
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });

  it("rejects HTTP errors without including the key or response body in its error", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "never-log-this-key");
    const { geo } = provider(
      new Response("private provider response", { status: 429 }),
    );
    await expect(geo.geocode("București")).rejects.toThrow(
      "GEOAPIFY_UNAVAILABLE",
    );
  });

  it("rejects a malformed provider payload", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "unit-test-key");
    const { geo } = provider(new Response(JSON.stringify({ features: [] })));
    await expect(geo.geocode("București")).rejects.toThrow();
  });
});
