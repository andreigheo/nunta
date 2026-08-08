import { describe, expect, it } from "vitest";
import {
  createDocumentGrantSchema,
  createPaymentCheckoutSchema,
  createSignatureEnvelopeSchema,
  createUploadSessionSchema,
  detectMediaType,
  isMonotoneTransition,
  normalizeUploadFileName,
  paymentStatusPrecedence,
  signatureStatusPrecedence,
} from "@weddingos/contracts";
import {
  domainEventPayloadSchema,
  selectOutboxConsumers,
} from "@weddingos/jobs";

const uuid = "00000000-0000-4000-8000-000000000001";
const uuid2 = "00000000-0000-4000-8000-000000000002";

describe("Slice 6 secure document contracts", () => {
  it("detects content from bytes instead of trusting the claimed MIME", () => {
    expect(detectMediaType(Buffer.from("%PDF-1.4\n%%EOF"))).toBe(
      "application/pdf",
    );
    expect(
      detectMediaType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("image/png");
    expect(detectMediaType(Buffer.from("plain utf8 text"))).toBe("text/plain");
    expect(detectMediaType(Buffer.from([0, 1, 2, 3, 4]))).toBeNull();
  });

  it("normalizes unsafe file names without preserving paths or controls", () => {
    expect(normalizeUploadFileName(" ../contract\\draft\u0000.pdf ")).toBe(
      "..-contract-draft-.pdf",
    );
    expect(normalizeUploadFileName("a".repeat(300))).toHaveLength(255);
  });

  it("requires exactly one tenant and a closed upload purpose", () => {
    const base = {
      purpose: "CONTRACT_ATTACHMENT",
      originalFileName: "contract.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      checksumSha256: "a".repeat(64),
    };
    expect(
      createUploadSessionSchema.safeParse({ ...base, workspaceId: uuid })
        .success,
    ).toBe(true);
    expect(
      createUploadSessionSchema.safeParse({
        ...base,
        workspaceId: uuid,
        vendorOrganizationId: uuid2,
      }).success,
    ).toBe(false);
    expect(
      createUploadSessionSchema.safeParse({
        ...base,
        workspaceId: uuid,
        purpose: "ARBITRARY",
      }).success,
    ).toBe(false);
    expect(
      createUploadSessionSchema.safeParse({
        ...base,
        workspaceId: uuid,
        purpose: "PROFILE_IMAGE",
        originalFileName: "profil.webp",
        contentType: "image/webp",
      }).success,
    ).toBe(true);
  });

  it("validates contract-party grants and signature memberships as UUIDs", () => {
    expect(
      createDocumentGrantSchema.safeParse({
        granteeType: "BOOKING_PARTY",
        granteeId: uuid,
        permission: "DOWNLOAD",
      }).success,
    ).toBe(true);
    expect(
      createSignatureEnvelopeSchema.safeParse({
        contractVersionId: uuid,
        weddingSignerMembershipId: uuid,
        vendorSignerMembershipId: uuid2,
      }).success,
    ).toBe(true);
  });
});

describe("Slice 6 monotone provider state and outbox routing", () => {
  it("does not allow a stale payment event to regress a terminal state", () => {
    expect(
      isMonotoneTransition("PENDING", "CAPTURED", paymentStatusPrecedence),
    ).toBe(true);
    expect(
      isMonotoneTransition("CAPTURED", "AUTHORIZED", paymentStatusPrecedence),
    ).toBe(false);
    expect(
      isMonotoneTransition("COMPLETED", "VIEWED", signatureStatusPrecedence),
    ).toBe(false);
  });

  it("derives checkout amounts server-side and only accepts local return paths", () => {
    expect(
      createPaymentCheckoutSchema.safeParse({
        paymentScheduleEntryId: uuid,
        amountMode: "FULL_OUTSTANDING",
        successReturnPath: "/payments?ok=1",
        cancelReturnPath: "/payments?cancel=1",
      }).success,
    ).toBe(true);
    expect(
      createPaymentCheckoutSchema.safeParse({
        paymentScheduleEntryId: uuid,
        amountMode: "CUSTOM",
        customAmountMinor: 10,
        successReturnPath: "https://evil.test",
        cancelReturnPath: "/payments",
      }).success,
    ).toBe(false);
  });

  it("accepts each canonical payment projection aggregate identifier", () => {
    for (const projection of [
      { transactionId: uuid },
      { checkoutId: uuid },
      { refundId: uuid },
      { reconciliationRunId: uuid },
    ]) {
      expect(
        domainEventPayloadSchema.safeParse({
          occurredAt: new Date().toISOString(),
          subject: {},
          paymentStatusProjection: projection,
        }).success,
      ).toBe(true);
    }
    expect(
      domainEventPayloadSchema.safeParse({
        occurredAt: new Date().toISOString(),
        subject: {},
        paymentStatusProjection: {},
      }).success,
    ).toBe(false);
  });

  it("routes independent secure consumers without turning projections into user jobs", () => {
    const consumers = selectOutboxConsumers({
      eventName: "storage.upload_completed.v1",
      hasEmail: false,
      payload: {
        occurredAt: new Date().toISOString(),
        subject: {},
        documentScan: { storedObjectId: uuid },
      },
    });
    expect(consumers).toEqual(
      expect.arrayContaining(["event_ack", "document_scan"]),
    );
    expect(consumers).not.toContain("payment_status_projection");
    expect(
      selectOutboxConsumers({
        eventName: "document.contract_materialized.v1",
        hasEmail: false,
        payload: {
          occurredAt: new Date().toISOString(),
          subject: { documentId: uuid },
        },
      }),
    ).toEqual(["event_ack"]);
  });
});
