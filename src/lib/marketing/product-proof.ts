import "server-only";
import { loadMarketingProductProof } from "./product-proof-loader";
import type { MarketingProductProof } from "./product-proof-normalizer";

export type { MarketingProductProof } from "./product-proof-normalizer";

/** PublicProductProofV1 este singura sursă acceptată pentru cifre pe landing. */
export async function getMarketingProductProof(): Promise<MarketingProductProof> {
  const apiBase = (
    process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"
  ).replace(/\/$/, "");
  return loadMarketingProductProof(apiBase, {
    cacheNamespace: process.env.WEDDINGOS_PUBLIC_PROOF_CACHE_NAMESPACE,
  });
}
