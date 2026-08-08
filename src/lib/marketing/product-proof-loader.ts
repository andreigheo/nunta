import {
  fallbackProductProof,
  normalizePublicProductProof,
  type MarketingProductProof,
} from "./product-proof-normalizer";

type ProofFetchInit = RequestInit & { next: { revalidate: number } };
type ProofResponse = Pick<Response, "ok" | "json">;
type ProofFetch = (
  input: string,
  init: ProofFetchInit,
) => Promise<ProofResponse>;

type LoadMarketingProductProofOptions = {
  fetcher?: ProofFetch;
  nowMs?: number;
  timeoutMs?: number;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  cacheNamespace?: string;
};

/** Fetch adapter kept free of Next server-only so fallback behavior can be unit tested. */
export async function loadMarketingProductProof(
  apiBase: string,
  options: LoadMarketingProductProofOptions = {},
): Promise<MarketingProductProof> {
  const {
    fetcher = fetch as ProofFetch,
    nowMs = Date.now(),
    timeoutMs = 3_000,
    createTimeoutSignal = AbortSignal.timeout,
    cacheNamespace,
  } = options;

  const endpoint = `${apiBase.replace(/\/$/, "")}/api/v1/public/product-proof`;
  const headers = {
    Accept: "application/json",
    ...(cacheNamespace ? { "X-WeddingOS-Proof-Cache": cacheNamespace } : {}),
  };

  try {
    const response = await fetcher(endpoint, {
      credentials: "omit",
      headers,
      signal: createTimeoutSignal(timeoutMs),
      next: { revalidate: 900 },
    });
    if (!response.ok) return fallbackProductProof;

    return normalizePublicProductProof(await response.json(), nowMs);
  } catch {
    return fallbackProductProof;
  }
}
