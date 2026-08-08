import { describe, expect, it } from "vitest";
import {
  capabilityKeySchema,
  createVendorReviewSchema,
  moderationDecisionSchema,
  payoutAccountRequestSchema,
  settlementCalculationSchema,
  subscriptionCheckoutRequestSchema,
  subscriptionPriceMutationSchema,
  vendorReviewDisputeSchema,
} from "@weddingos/contracts";
import { consumerJobId, selectOutboxConsumers } from "@weddingos/jobs";
import {
  calculatePlatformFeeMinor,
  mapSubscriptionEvent,
  payableEntrySign,
} from "../src/trust-monetization/trust-monetization.service";

const uuid = "00000000-0000-4000-8000-000000000001";
const eventBase = {
  occurredAt: "2027-07-19T10:00:00.000Z",
  subject: {},
};
const criteria = {
  QUALITY: 5,
  COMMUNICATION: 5,
  RELIABILITY: 4,
  VALUE: 4,
  PROFESSIONALISM: 5,
  FLEXIBILITY: 4,
};

describe("Slice 7 verified review contracts", () => {
  it("accepts a complete six-criterion review and rejects invented ratings", () => {
    expect(
      createVendorReviewSchema.safeParse({
        eligibilityId: uuid,
        title: "O colaborare foarte bună",
        body: "Furnizorul a comunicat clar și a livrat serviciul promis.",
        overallRating: 5,
        criteria,
        publicDisplayName: "Ana și Mihai",
        authenticityConfirmed: true,
      }).success,
    ).toBe(true);
    expect(
      createVendorReviewSchema.safeParse({
        eligibilityId: uuid,
        title: "Review invalid",
        body: "Text suficient de lung pentru validarea contractului.",
        overallRating: 6,
        criteria: { ...criteria, QUALITY: 0 },
        authenticityConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("keeps moderation and private dispute evidence on closed schemas", () => {
    expect(
      vendorReviewDisputeSchema.safeParse({
        reason: "Informație factuală incorectă",
        statementPrivate:
          "Contractul și istoricul rezervării demonstrează situația reală.",
      }).success,
    ).toBe(true);
    expect(
      moderationDecisionSchema.safeParse({
        decision: "HIDE_CONTENT",
        reason: "Conținutul expune date private neverificate.",
      }).success,
    ).toBe(true);
    expect(
      moderationDecisionSchema.safeParse({
        decision: "DELETE_FOREVER",
        reason: "Acțiune nesuportată.",
      }).success,
    ).toBe(false);
  });
});

describe("Slice 7 subscription and payout contracts", () => {
  it("validates plan selection and provider-independent money inputs", () => {
    expect(
      subscriptionCheckoutRequestSchema.safeParse({ planKey: "STARTER" })
        .success,
    ).toBe(true);
    expect(
      subscriptionPriceMutationSchema.safeParse({
        productId: uuid,
        currency: "RON",
        amountMinor: 9_900,
        billingInterval: "MONTH",
        trialDays: 14,
      }).success,
    ).toBe(true);
    expect(
      subscriptionPriceMutationSchema.safeParse({
        currency: "ron",
        amountMinor: -1,
      }).success,
    ).toBe(false);
  });

  it("requires canonical payout currencies and platform settlement tenants", () => {
    expect(
      payoutAccountRequestSchema.safeParse({ country: "RO", currency: "RON" })
        .success,
    ).toBe(true);
    expect(
      settlementCalculationSchema.safeParse({
        vendorOrganizationId: uuid,
        currency: "RON",
        periodEnd: "2027-07-19T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      settlementCalculationSchema.safeParse({ currency: "RON" }).success,
    ).toBe(false);
  });

  it("registers atomic workspace, vendor and platform capabilities", () => {
    for (const capability of [
      "review.publish",
      "vendor.subscription.checkout",
      "vendor.payout.request",
      "platform.review_decide",
      "platform.settlement.finalize",
    ]) {
      expect(capabilityKeySchema.safeParse(capability).success).toBe(true);
    }
  });
});

describe("Slice 7 durable outbox routing", () => {
  it("routes review consumers independently and deterministically", () => {
    const consumers = selectOutboxConsumers({
      eventName: "review.published.v1",
      hasEmail: false,
      payload: eventBase,
    });
    expect(consumers).toEqual(
      expect.arrayContaining([
        "event_ack",
        "review_notification_projection",
        "review_rating_projection",
      ]),
    );
    expect(consumerJobId(uuid, "review_rating_projection")).toBe(
      `${uuid}--review_rating_projection`,
    );
  });

  it("routes subscription entitlement effects separately from payout effects", () => {
    expect(
      selectOutboxConsumers({
        eventName: "subscription.activated.v1",
        hasEmail: false,
        payload: eventBase,
      }),
    ).toEqual(
      expect.arrayContaining([
        "subscription_status_projection",
        "subscription_entitlement_projection",
        "subscription_usage_projection",
        "subscription_notification_projection",
      ]),
    );
    expect(
      selectOutboxConsumers({
        eventName: "payout.requested.v1",
        hasEmail: false,
        payload: eventBase,
      }),
    ).toEqual(
      expect.arrayContaining(["payout_status_projection", "payout_execution"]),
    );
  });
});

describe("Slice 7 deterministic financial rules", () => {
  it.each([
    [10_000, { ruleType: "PERCENTAGE", percentageBasisPoints: 500 }, 500],
    [9_999, { ruleType: "PERCENTAGE", percentageBasisPoints: 500 }, 500],
    [10_000, { ruleType: "FIXED", fixedMinor: 700n }, 700],
    [
      10_000,
      {
        ruleType: "PERCENTAGE_PLUS_FIXED",
        percentageBasisPoints: 250,
        fixedMinor: 100n,
      },
      350,
    ],
    [1_000, { ruleType: "FIXED", fixedMinor: 2_000n }, 1_000],
    [
      10_000,
      { ruleType: "FIXED", fixedMinor: 100n, minimumFeeMinor: 250n },
      250,
    ],
    [
      10_000,
      { ruleType: "FIXED", fixedMinor: 900n, maximumFeeMinor: 600n },
      600,
    ],
  ])(
    "calculates fee snapshots in minor units %#",
    (gross, partial, expected) => {
      expect(
        calculatePlatformFeeMinor(gross, {
          percentageBasisPoints: null,
          fixedMinor: null,
          minimumFeeMinor: null,
          maximumFeeMinor: null,
          ...partial,
        }),
      ).toBe(expected);
    },
  );

  it.each([
    ["PAYMENT_EARNED", 1],
    ["DISPUTE_RELEASE", 1],
    ["PAYOUT_REVERSAL", 1],
    ["RESERVE_RELEASE", 1],
    ["PLATFORM_FEE", -1],
    ["REFUND_ADJUSTMENT", -1],
    ["DISPUTE_HOLD", -1],
    ["PAYOUT", -1],
  ])("applies append-only payable sign for %s", (entryType, expected) => {
    expect(payableEntrySign(entryType)).toBe(expected);
  });
});

describe("Slice 7 canonical subscription event mapping", () => {
  it.each([
    ["trial.started", "ACTIVE", "TRIALING", "subscription.trial_started.v1"],
    ["subscription.active", "TRIALING", "ACTIVE", "subscription.activated.v1"],
    ["invoice.paid", "PAST_DUE", "ACTIVE", "subscription.renewed.v1"],
    ["invoice.failed", "ACTIVE", "PAST_DUE", "subscription.past_due.v1"],
    [
      "subscription.cancelled",
      "ACTIVE",
      "CANCELLED",
      "subscription.cancelled.v1",
    ],
    ["subscription.resumed", "CANCELLED", "ACTIVE", "subscription.resumed.v1"],
    [
      "subscription.plan_changed",
      "PAST_DUE",
      "PAST_DUE",
      "subscription.plan_changed.v1",
    ],
  ])(
    "maps %s without leaking provider states",
    (event, current, status, semanticEvent) => {
      expect(mapSubscriptionEvent(event, current)).toEqual({
        status,
        event: semanticEvent,
      });
    },
  );
});
