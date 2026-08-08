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
    timeoutMs = 1_200,
    createTimeoutSignal = AbortSignal.timeout,
    cacheNamespace,
  } = options;

  const endpoint = new URL(
    `${apiBase.replace(/\/$/, "")}/api/v1/public/product-proof`,
  );
  if (cacheNamespace) endpoint.searchParams.set("cache", cacheNamespace);

  try {
    const response = await fetcher(endpoint.toString(), {
      credentials: "omit",
      headers: { Accept: "application/json" },
      signal: createTimeoutSignal(timeoutMs),
      next: { revalidate: 900 },
    });
    if (!response.ok) return fallbackProductProof;

    return normalizePublicProductProof(await response.json(), nowMs);
  } catch {
    return fallbackProductProof;
  }
}
