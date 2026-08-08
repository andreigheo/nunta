import { describe, expect, it } from "vitest";
import type { PublicProductProofV1, PublicProofMetric } from "@weddingos/contracts";
import {
  hasPublishablePublicProof,
  normalizePublicProductProof,
} from "./product-proof-normalizer";

const now = Date.parse("2026-07-20T18:00:00.000Z");

function published(value: number): PublicProofMetric {
  return {
    state: "published",
    value,
    unit: "percent",
    contributingWorkspaceBucket: 30,
    suppressionReason: null,
  };
}

function suppressed(): PublicProofMetric {
  return {
    state: "suppressed",
    value: null,
    unit: "percent",
    contributingWorkspaceBucket: null,
    suppressionReason: "minimum_cohort",
  };
}

function proof(overrides: Partial<PublicProductProofV1> = {}): PublicProductProofV1 {
  return {
    schemaVersion: "1.0",
    generatedAt: "2026-07-20T17:30:00.000Z",
    window: {
      startedAt: "2025-07-21T00:00:00.000Z",
      endedAt: "2026-07-20T00:00:00.000Z",
      days: 365,
    },
    freshness: "fresh",
    privacy: {
      minimumCohort: 20,
      percentageRoundingIncrement: 5,
      cohortBucketSize: 10,
    },
    capabilities: {
      planning: "implemented",
      rsvpAndLogistics: "implemented",
      procurementAndBudget: "implemented",
      weddingDay: "partial",
    },
    flow: {
      planning: {
        medianPlanProgressPercent: published(55),
        nextActionCoveragePercent: published(80),
      },
      rsvpAndLogistics: {
        rsvpResponseRatePercent: published(65),
        logisticsAssignmentRatePercent: published(45),
      },
      procurementAndBudget: {
        rfqToBookingWorkspaceRatePercent: published(35),
        medianBudgetCommittedPercent: published(60),
      },
      weddingDay: {
        runOfShowCompletionRatePercent: published(70),
        checkInRatePercent: published(75),
        incidentResolutionRatePercent: published(85),
      },
    },
    ...overrides,
  };
}

describe("normalizePublicProductProof", () => {
  it("normalizează dovada fresh și limitează suprafața la patru agregate", () => {
    const result = normalizePublicProductProof({ data: proof() }, now);

    expect(result.state).toBe("fresh");
    expect(result.metrics).toHaveLength(4);
    expect(result.metrics.map((metric) => metric.value)).toEqual(["80%", "65%", "35%", "70%"]);
    expect(result.capabilities?.weddingDay).toBe("partial");
  });

  it("păstrează o dovadă stale verificată în fereastra de 24 de ore", () => {
    const result = normalizePublicProductProof(proof({ freshness: "stale" }), now);

    expect(result.state).toBe("stale");
    expect(result.generatedAt).toBe("2026-07-20T17:30:00.000Z");
    expect(result.metrics).toHaveLength(4);
  });

  it("marchează independent stale un payload declarat fresh după 30 de minute", () => {
    const result = normalizePublicProductProof(
      proof({ generatedAt: "2026-07-20T17:29:00.000Z", freshness: "fresh" }),
      now,
    );

    expect(result.state).toBe("stale");
  });

  it("păstrează slotul suppressed fără valoare sau cohortă", () => {
    const input = proof();
    input.flow.rsvpAndLogistics.rsvpResponseRatePercent = suppressed();

    const result = normalizePublicProductProof(input, now);
    const metric = result.metrics.find((item) => item.key === "rsvp");

    expect(metric).toEqual({
      key: "rsvp",
      label: "Răspunsuri RSVP",
      state: "suppressed",
      value: null,
      cohort: null,
    });
  });

  it("respinge un payload care nu respectă schema", () => {
    const result = normalizePublicProductProof({ ...proof(), schemaVersion: "2.0" }, now);

    expect(result).toEqual({
      state: "fallback",
      generatedAt: null,
      windowDays: null,
      metrics: [],
      capabilities: null,
    });
  });

  it("respinge dovada mai veche de 24 de ore", () => {
    const result = normalizePublicProductProof(
      proof({ generatedAt: "2026-07-19T17:59:59.999Z", freshness: "stale" }),
      now,
    );

    expect(result.state).toBe("fallback");
    expect(result.metrics).toEqual([]);
  });

  it("respinge timestampul aflat cu mai mult de cinci minute în viitor", () => {
    const result = normalizePublicProductProof(
      proof({ generatedAt: "2026-07-20T18:05:00.001Z" }),
      now,
    );

    expect(result.state).toBe("fallback");
  });
});

describe("hasPublishablePublicProof", () => {
  it("acceptă dovada numai când cel puțin trei indicatori au valori publicabile", () => {
    const normalized = normalizePublicProductProof(proof(), now);

    expect(hasPublishablePublicProof(normalized)).toBe(true);
  });

  it("respinge dovada cu mai puțin de trei indicatori publicați", () => {
    const input = proof();
    input.flow.rsvpAndLogistics.rsvpResponseRatePercent = suppressed();
    input.flow.procurementAndBudget.rfqToBookingWorkspaceRatePercent =
      suppressed();

    const normalized = normalizePublicProductProof(input, now);

    expect(hasPublishablePublicProof(normalized)).toBe(false);
  });

  it("respinge o dovadă în care toți indicatorii sunt suprimați", () => {
    const input = proof();
    input.flow.planning.nextActionCoveragePercent = suppressed();
    input.flow.rsvpAndLogistics.rsvpResponseRatePercent = suppressed();
    input.flow.procurementAndBudget.rfqToBookingWorkspaceRatePercent =
      suppressed();
    input.flow.weddingDay.runOfShowCompletionRatePercent = suppressed();

    const normalized = normalizePublicProductProof(input, now);

    expect(hasPublishablePublicProof(normalized)).toBe(false);
  });
});
