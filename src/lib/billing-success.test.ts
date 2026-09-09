import { describe, expect, it } from "vitest";
import type { WorkspaceBillingOverview } from "@weddingos/contracts";
import {
  billingReturnUrl,
  creditSuccessNotice,
  subscriptionSuccessNotice,
} from "./billing-success";

const overview = {
  plans: [
    {
      key: "PLUS",
      name: "Plus",
      description: "Plan Plus",
      amountMinor: 2_700,
      currency: "EUR",
      interval: "month",
      recommended: true,
      features: [],
      entitlements: { MESSAGING_CREDITS: 50 },
    },
  ],
  subscription: {
    plan: "PLUS",
    status: "ACTIVE",
    entitlements: { MESSAGING_CREDITS: 50 },
    currentPeriodEnd: "2026-10-09T16:53:35.941Z",
    gracePeriodEndAt: null,
    cancelAtPeriodEnd: false,
  },
  messageCredits: {
    included: 50,
    purchased: 100,
    available: 150,
    planAllowance: 50,
    resetsAt: "2026-10-09T16:53:35.941Z",
  },
} satisfies Pick<
  WorkspaceBillingOverview,
  "plans" | "subscription" | "messageCredits"
>;

describe("billing success confirmation", () => {
  it("builds a confirmation from effective backend plan data", () => {
    expect(subscriptionSuccessNotice(overview)).toMatchObject({
      kind: "subscription",
      title: "Planul Plus este activ",
      primaryValue: "50",
      primaryLabel: "credite de mesagerie / lună",
    });
  });

  it("shows the post-purchase balances returned by the backend", () => {
    expect(creditSuccessNotice(100, overview)).toMatchObject({
      kind: "credits",
      title: "100 de credite au fost adăugate",
      primaryValue: "150",
      secondaryValue: "100",
    });
  });

  it("returns to billing with the exact Paddle transaction identifier", () => {
    expect(
      billingReturnUrl(
        "https://sarbato.space",
        "subscription",
        "txn_subscription",
      ),
    ).toBe(
      "https://sarbato.space/settings?tab=billing&checkout=success&transaction=txn_subscription",
    );
    expect(
      billingReturnUrl("https://sarbato.space", "credits", "txn_credits"),
    ).toBe(
      "https://sarbato.space/settings?tab=billing&checkout=credits-success&creditTransaction=txn_credits",
    );
  });
});
