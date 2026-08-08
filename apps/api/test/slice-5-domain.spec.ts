import { describe, expect, it } from "vitest";
import {
  calculateBudgetSummary,
  calculateOfferTotals,
  createOfferSchema,
  createPaymentSchema,
  createRfqSchema,
  offerReviewTransitionSchema,
} from "@weddingos/contracts";
import { selectOutboxConsumers } from "@weddingos/jobs";

const uuid = "00000000-0000-4000-8000-000000000001";

describe("Slice 5 commercial money and contract rules", () => {
  it("calculates selected offer lines, discount and integer tax deterministically", () => {
    expect(
      calculateOfferTotals({
        lineItems: [
          {
            type: "service",
            name: "Foto",
            description: "",
            quantity: 2,
            unit: "HOUR",
            unitPriceMinor: 10_000,
            optional: false,
            selected: true,
            position: 0,
          },
          {
            type: "extra",
            name: "Album",
            description: "",
            quantity: 1,
            unit: "ITEM",
            unitPriceMinor: 5_000,
            optional: true,
            selected: false,
            position: 1,
          },
        ],
        discountMinor: 2_000,
        taxRateBasisPoints: 2_000,
      }),
    ).toEqual({
      subtotalMinor: 20_000,
      discountMinor: 2_000,
      taxableBaseMinor: 18_000,
      taxMinor: 3_600,
      totalMinor: 21_600,
    });
  });

  it("rejects unsafe money arithmetic and negative external payment evidence", () => {
    expect(() =>
      calculateOfferTotals({
        lineItems: [
          {
            type: "service",
            name: "Overflow",
            description: "",
            quantity: 1_000_000,
            unit: "ITEM",
            unitPriceMinor: Number.MAX_SAFE_INTEGER,
            optional: false,
            selected: true,
            position: 0,
          },
        ],
      }),
    ).toThrow(/MONEY_OVERFLOW/);
    expect(
      createPaymentSchema.safeParse({
        budgetItemId: uuid,
        amountMinor: -1,
        paidAt: "2027-07-19T10:00:00.000Z",
        method: "BANK_TRANSFER",
      }).success,
    ).toBe(false);
  });

  it("derives budget commitments and forecast without treating cancelled items as spend", () => {
    expect(
      calculateBudgetSummary({
        targetTotalMinor: 100_000,
        categories: [{ allocatedMinor: 70_000 }],
        items: [
          {
            status: "ACTIVE",
            estimatedMinor: 60_000,
            quotedMinor: 55_000,
            committedMinor: 50_000,
            paidMinor: 20_000,
          },
          {
            status: "ACTIVE",
            estimatedMinor: 30_000,
            paidMinor: 0,
          },
          {
            status: "CANCELLED",
            estimatedMinor: 999_999,
            committedMinor: 999_999,
            paidMinor: 999_999,
          },
        ],
      }),
    ).toMatchObject({
      committedMinor: 50_000,
      paidMinor: 20_000,
      outstandingMinor: 30_000,
      remainingMinor: 50_000,
      forecastMinor: 80_000,
      overBudget: false,
    });
  });

  it("validates RFQ ranges, offer review commands and offer line contracts", () => {
    const rfq = createRfqSchema.safeParse({
      title: "Fotografie nuntă",
      category: "PHOTOGRAPHY",
      description: "Cerere completă pentru ziua nunții.",
      eventDate: "2027-09-12",
      locationSnapshot: { city: "Chișinău" },
      budgetRangeMinMinor: 100_000,
      budgetRangeMaxMinor: 50_000,
      currency: "MDL",
      responseDeadline: "2027-07-19T10:00:00.000Z",
      requirements: [],
      questions: [],
    });
    expect(rfq.success).toBe(false);
    expect(
      offerReviewTransitionSchema.safeParse({ transition: "ACCEPT" }).success,
    ).toBe(true);
    expect(
      createOfferSchema.safeParse({
        currency: "MDL",
        lineItems: [],
        answers: [],
        availabilityConfirmation: "Data este disponibilă.",
        deliveryTimeline: "Livrare după eveniment.",
        cancellationTerms: "Conform acordului.",
      }).success,
    ).toBe(false);
  });
});

describe("Slice 5 outbox routing", () => {
  it("selects independent commercial consumers and stable at-least-once effects", () => {
    const base = {
      occurredAt: "2027-07-19T10:00:00.000Z",
      subject: {},
      workspaceId: uuid,
    };
    expect(
      selectOutboxConsumers({
        eventName: "rfq.sent.v1",
        hasEmail: false,
        payload: {
          ...base,
          rfqDelivery: { recipientId: uuid },
          vendorNotificationProjection: { vendorOrganizationId: uuid },
          activity: {
            category: "vendors",
            action: "rfq_sent",
            summary: "Cerere trimisă",
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "event_ack",
        "rfq_delivery",
        "activity_projection",
        "vendor_notification_projection",
      ]),
    );
    expect(
      selectOutboxConsumers({
        eventName: "offer.accepted.v1",
        hasEmail: false,
        payload: { ...base, offerProjection: { offerId: uuid } },
      }),
    ).toEqual(expect.arrayContaining(["offer_projection"]));
    expect(
      selectOutboxConsumers({
        eventName: "payment.reminder_due.v1",
        hasEmail: false,
        payload: {
          ...base,
          paymentReminder: { scheduleId: uuid, scheduleVersion: 1 },
        },
      }),
    ).toEqual(expect.arrayContaining(["payment_reminder"]));
  });
});
