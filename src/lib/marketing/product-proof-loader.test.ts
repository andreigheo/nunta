import { describe, expect, it, vi } from "vitest";
import { loadMarketingProductProof } from "./product-proof-loader";

const fallback = {
  state: "fallback",
  generatedAt: null,
  windowDays: null,
  metrics: [],
  capabilities: null,
};

describe("loadMarketingProductProof", () => {
  it("revine la fallback la timeout și configurează requestul public fără cookies", async () => {
    const timeoutSignal = new AbortController().signal;
    const createTimeoutSignal = vi.fn(() => timeoutSignal);
    const fetcher = vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));

    const result = await loadMarketingProductProof("http://api.test/", {
      fetcher,
      createTimeoutSignal,
    });

    expect(result).toEqual(fallback);
    expect(createTimeoutSignal).toHaveBeenCalledWith(1_200);
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/api/v1/public/product-proof",
      expect.objectContaining({
        credentials: "omit",
        headers: { Accept: "application/json" },
        signal: timeoutSignal,
        next: { revalidate: 900 },
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]).not.toHaveProperty("cookie");
  });

  it.each([500, 503])("revine la fallback pentru HTTP %i", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: vi.fn() });

    await expect(loadMarketingProductProof("http://api.test", { fetcher })).resolves.toEqual(fallback);
    expect(fetcher.mock.results[0]?.type).toBe("return");
  });

  it("revine la fallback când răspunsul nu conține snapshot", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ data: null }) });

    await expect(loadMarketingProductProof("http://api.test", { fetcher })).resolves.toEqual(fallback);
  });
});
