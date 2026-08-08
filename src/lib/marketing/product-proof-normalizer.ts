import {
  publicProductProofV1Schema,
  type PublicProductProofV1,
  type PublicProofMetric,
} from "@weddingos/contracts";

export type PublishedProofMetric = {
  key: string;
  label: string;
  state: "published" | "suppressed";
  value: string | null;
  cohort: string | null;
};

export type MarketingProductProof = {
  state: "fresh" | "stale" | "fallback";
  generatedAt: string | null;
  windowDays: number | null;
  metrics: PublishedProofMetric[];
  capabilities: PublicProductProofV1["capabilities"] | null;
};

export const fallbackProductProof: MarketingProductProof = {
  state: "fallback",
  generatedAt: null,
  windowDays: null,
  metrics: [],
  capabilities: null,
};

export function hasPublishablePublicProof(
  proof: MarketingProductProof,
): boolean {
  if (proof.state === "fallback") return false;

  return (
    proof.metrics.filter(
      (metric) => metric.state === "published" && metric.value !== null,
    ).length >= 3
  );
}

export function normalizePublicProductProof(
  payload: unknown,
  nowMs = Date.now(),
): MarketingProductProof {
  const envelope = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  const parsed = publicProductProofV1Schema.safeParse(envelope.data ?? payload);
  if (!parsed.success) return fallbackProductProof;

  const proof = parsed.data;
  const generatedAtMs = Date.parse(proof.generatedAt);
  const ageMs = nowMs - generatedAtMs;
  if (!Number.isFinite(generatedAtMs) || ageMs > 24 * 60 * 60 * 1_000 || ageMs < -5 * 60 * 1_000) {
    return fallbackProductProof;
  }

  const candidates: Array<[string, string, PublicProofMetric]> = [
    ["planning", "Planuri cu următoarea acțiune", proof.flow.planning.nextActionCoveragePercent],
    ["rsvp", "Răspunsuri RSVP", proof.flow.rsvpAndLogistics.rsvpResponseRatePercent],
    ["procurement", "Cereri ajunse la rezervare", proof.flow.procurementAndBudget.rfqToBookingWorkspaceRatePercent],
    ["wedding-day", "Momente din desfășurător finalizate", proof.flow.weddingDay.runOfShowCompletionRatePercent],
  ];
  const metrics = candidates.map(([key, label, metric]): PublishedProofMetric => ({
    key,
    label,
    state: metric.state,
    value: metric.state === "published" && metric.value !== null
      ? `${new Intl.NumberFormat("ro-RO").format(metric.value)}%`
      : null,
    cohort: metric.state === "published" && metric.contributingWorkspaceBucket !== null
      ? `cohortă agregată ≥ ${new Intl.NumberFormat("ro-RO").format(metric.contributingWorkspaceBucket)}`
      : null,
  }));

  return {
    state: proof.freshness === "stale" || ageMs > 30 * 60 * 1_000 ? "stale" : "fresh",
    generatedAt: proof.generatedAt,
    windowDays: proof.window.days,
    metrics,
    capabilities: proof.capabilities,
  };
}
