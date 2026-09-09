import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PrismaClient } from "@weddingos/database";
import { assertDestructiveDatabasePurpose } from "./database-identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { ProblemFilter } from "../src/common/problem.filter";

const origin = process.env.WEB_URL!;
const database = new PrismaClient({
  datasourceUrl: process.env.DATABASE_OWNER_URL!,
});

type Account = {
  email: string;
  userId: string;
  agent: ReturnType<typeof request.agent>;
};

describe.sequential("Slice 5 commercial journey integration", () => {
  let application!: INestApplication;
  let couple!: Account;
  let vendor!: Account;
  let outsider!: Account;
  let invitee!: Account;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let organizationId = "";
  let rfqId = "";
  let offerId = "";
  let bookingId = "";
  let contractId = "";

  beforeAll(async () => {
    if (process.env.WEDDINGOS_INTEGRATION_DATABASE_PREPARED !== "true") {
      await cleanDatabase();
    }
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    application = testingModule.createNestApplication();
    application.use(cookieParser());
    application.useGlobalFilters(new ProblemFilter());
    await application.init();
    couple = await createAccount("slice5-couple");
    vendor = await createAccount("slice5-vendor");
    outsider = await createAccount("slice5-outsider");
    invitee = await createAccount("slice5-invitee");
    workspaceId = await createWorkspace(couple, "Slice 5 commercial");
    otherWorkspaceId = await createWorkspace(outsider, "Slice 5 isolated");
    // Slice 5 exercises vendor coordination, contracts, payments and exports.
    // Keep the fixture on the plan that owns those capabilities so entitlement
    // responses do not mask the commercial integration behavior under test.
    await database.workspaceSubscription.update({
      where: { workspaceId },
      data: {
        planKey: "PLUS",
        status: "ACTIVE",
        provider: "integration-test",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
  }, 180_000);

  afterAll(async () => {
    await application?.close();
    await database.$disconnect();
  });

  it("publishes a real vendor profile, service and marketplace entry with vendor isolation", async () => {
    const key = `vendor-org-${randomUUID()}`;
    const created = await vendor.agent
      .post("/api/v1/vendor-organizations")
      .set("Origin", origin)
      .set("Idempotency-Key", key)
      .send({
        legalName: "Studio Lumina SRL",
        displayName: "Studio Lumina",
        country: "Moldova",
        registrationNumber: "TEST-123",
        taxId: "TEST-TAX-123",
        billingEmail: vendor.email,
        contactEmail: vendor.email,
        contactPhone: "+37360000000",
        websiteUrl: "https://example.test/studio-lumina",
      })
      .expect(201);
    const replay = await vendor.agent
      .post("/api/v1/vendor-organizations")
      .set("Origin", origin)
      .set("Idempotency-Key", key)
      .send({
        legalName: "Studio Lumina SRL",
        displayName: "Studio Lumina",
        country: "Moldova",
        registrationNumber: "TEST-123",
        taxId: "TEST-TAX-123",
        billingEmail: vendor.email,
        contactEmail: vendor.email,
        contactPhone: "+37360000000",
        websiteUrl: "https://example.test/studio-lumina",
      })
      .expect(201);
    organizationId = created.body.data.id;
    expect(replay.body.data.id).toBe(organizationId);

    const invitation = await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/invitations`)
      .set("Origin", origin)
      .set("Idempotency-Key", `vendor-invite-${randomUUID()}`)
      .send({ email: invitee.email, role: "vendor_sales" })
      .expect(201);
    expect(invitation.body.data).toMatchObject({
      email: invitee.email,
      status: "PENDING",
    });
    expect(invitation.body.data).not.toHaveProperty("token");
    const invitationToken = await waitForVendorInvitationToken(invitee.email);
    const mismatchedAcceptance = await outsider.agent
      .post("/api/v1/vendor-invitations/accept")
      .set("Origin", origin)
      .send({ token: invitationToken })
      .expect(404);
    expect(mismatchedAcceptance.body.code).toBe("TOKEN_INVALID");
    const preview = await invitee.agent
      .post("/api/v1/vendor-invitations/preview")
      .set("Origin", origin)
      .send({ token: invitationToken })
      .expect(201);
    expect(preview.body.data).toMatchObject({
      vendorOrganizationId: organizationId,
      organizationName: "Studio Lumina",
      roleName: "Vânzări",
    });
    await invitee.agent
      .post("/api/v1/vendor-invitations/accept")
      .set("Origin", origin)
      .send({ token: invitationToken })
      .expect(201);
    await invitee.agent
      .post("/api/v1/vendor-invitations/accept")
      .set("Origin", origin)
      .send({ token: invitationToken })
      .expect(404);

    const profile = await vendor.agent
      .put(`/api/v1/vendor-organizations/${organizationId}/profile`)
      .set("Origin", origin)
      .send({
        slug: "studio-lumina-slice-5",
        headline: "Studio Lumina",
        description:
          "Fotografie documentară și portrete pentru nunți, cu livrare versionată și ofertare transparentă.",
        shortDescription: "Fotografie documentară pentru nunți.",
        categories: ["PHOTOGRAPHY"],
        languages: ["ro", "en"],
        pricingVisibility: "STARTING_FROM",
        startingPriceMinor: 125_000,
        currency: "RON",
        responseTimeLabel: "Răspuns în 24 de ore",
        publicEmail: vendor.email,
      })
      .expect(200);
    const serviceKey = `vendor-service-${randomUUID()}`;
    const service = await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/services`)
      .set("Origin", origin)
      .set("Idempotency-Key", serviceKey)
      .send({
        category: "PHOTOGRAPHY",
        name: "Pachet foto nuntă",
        description: "Acoperire completă a zilei nunții.",
        pricingModel: "FIXED",
        startingPriceMinor: 125_000,
        currency: "RON",
        active: true,
      })
      .expect(201);
    await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/services/${service.body.data.id}/packages`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `vendor-package-${randomUUID()}`)
      .send({
        name: "Documentar complet",
        description: "12 ore de acoperire și galerie online.",
        basePriceMinor: 150_000,
        currency: "RON",
        includedItems: ["12 ore", "Galerie online"],
        excludedItems: ["Album tipărit"],
        active: true,
        position: 0,
      })
      .expect(201);
    await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/subscription-checkouts`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `starter-before-publish-${randomUUID()}`)
      .send({ planKey: "STARTER" })
      .expect(201);
    const published = await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/profile/publish`)
      .set("Origin", origin)
      .set("If-Match", `"${profile.body.data.version}"`)
      .send({})
      .expect(201);
    expect(published.body.data.publicationStatus).toBe("PUBLISHED");

    const marketplace = await couple.agent
      .get("/api/v1/marketplace/vendors?category=PHOTOGRAPHY&search=Lumina")
      .expect(200);
    expect(marketplace.body.data.items).toHaveLength(1);
    expect(marketplace.body.data.items[0]).toMatchObject({
      slug: "studio-lumina-slice-5",
      verificationStatus: "UNVERIFIED",
      availabilityStatus: "UNKNOWN",
    });
    const unavailableByDefault = await couple.agent
      .get(
        "/api/v1/marketplace/vendors?category=PHOTOGRAPHY&search=Lumina&date=2027-09-12",
      )
      .expect(200);
    expect(unavailableByDefault.body.data.items).toHaveLength(0);
    await outsider.agent
      .get(`/api/v1/vendor-organizations/${organizationId}`)
      .expect(403);
  }, 180_000);

  it("runs RFQ to immutable offer and atomically accepts booking, contract and budget projections", async () => {
    const rfqKey = `rfq-${randomUUID()}`;
    const payload = {
      title: "Fotografie pentru nunta noastră",
      category: "PHOTOGRAPHY",
      description:
        "Dorim acoperire documentară completă pentru ceremonie și recepție.",
      eventDate: "2027-09-12",
      guestCount: 120,
      locationSnapshot: { city: "Chișinău", venue: "Sala de evenimente" },
      budgetRangeMinMinor: 100_000,
      budgetRangeMaxMinor: 200_000,
      currency: "RON",
      responseDeadline: "2027-08-01T10:00:00.000Z",
      requirements: [
        {
          type: "coverage",
          label: "Acoperire completă",
          description: "Ceremonie și recepție",
          required: true,
          position: 0,
        },
      ],
      questions: [
        {
          question: "În cât timp livrați galeria?",
          responseType: "TEXT",
          options: [],
          required: true,
          position: 0,
        },
      ],
    };
    const created = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/rfqs`)
      .set("Origin", origin)
      .set("Idempotency-Key", rfqKey)
      .send(payload)
      .expect(201);
    const replayCreate = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/rfqs`)
      .set("Origin", origin)
      .set("Idempotency-Key", rfqKey)
      .send(payload)
      .expect(201);
    rfqId = created.body.data.id;
    expect(replayCreate.body.data.id).toBe(rfqId);

    const recipients = await couple.agent
      .put(`/api/v1/workspaces/${workspaceId}/rfqs/${rfqId}/recipients`)
      .set("Origin", origin)
      .set("If-Match", `"${created.body.data.version}"`)
      .send({ vendorOrganizationIds: [organizationId] })
      .expect(200);
    const ready = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/rfqs/${rfqId}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${recipients.body.data.version}"`)
      .send({ transition: "MARK_READY" })
      .expect(201);
    const sendKey = `rfq-send-${randomUUID()}`;
    const sent = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/rfqs/${rfqId}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${ready.body.data.version}"`)
      .set("Idempotency-Key", sendKey)
      .send({ transition: "SEND" })
      .expect(201);
    const sentReplay = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/rfqs/${rfqId}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${ready.body.data.version}"`)
      .set("Idempotency-Key", sendKey)
      .send({ transition: "SEND" })
      .expect(201);
    expect(sentReplay.body.data.id).toBe(sent.body.data.id);
    await expect
      .poll(
        async () =>
          (
            await database.rfqRecipient.findFirstOrThrow({
              where: { rfqId, vendorOrganizationId: organizationId },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("SENT");

    const vendorInbox = await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/rfqs`)
      .expect(200);
    expect(vendorInbox.body.data.items[0].rfq.id).toBe(rfqId);
    await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/rfqs/${rfqId}/open`)
      .set("Origin", origin)
      .send({})
      .expect(201);

    const offerPayload = {
      currency: "RON",
      lineItems: [
        {
          type: "SERVICE",
          name: "Documentar complet",
          description: "Acoperire 12 ore",
          quantity: 1,
          unit: "FIXED",
          unitPriceMinor: 150_000,
          optional: false,
          selected: true,
          position: 0,
        },
      ],
      answers: [],
      discountMinor: 5_000,
      taxRateBasisPoints: 0,
      depositMinor: 50_000,
      pricingNotes: "Preț final în RON.",
      terms: {
        paymentSchedule: [
          {
            name: "Avans",
            amountMinor: 50_000,
            dueAt: "2027-08-15T10:00:00.000Z",
          },
        ],
      },
      availabilityConfirmation: "Data este disponibilă.",
      deliveryTimeline: "Galeria în maximum 45 de zile.",
      cancellationTerms: "Avansul este nerambursabil după confirmare.",
      validUntil: "2027-08-01T10:00:00.000Z",
    };
    const foreignCurrency = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/rfqs/${rfqId}/offers`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `offer-foreign-${randomUUID()}`)
      .send({ ...offerPayload, currency: "EUR" })
      .expect(400);
    expect(foreignCurrency.body.code).toBe("CURRENCY_MISMATCH");
    const offer = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/rfqs/${rfqId}/offers`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `offer-${randomUUID()}`)
      .send(offerPayload)
      .expect(201);
    offerId = offer.body.data.id;
    const submitted = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/offers/${offerId}/submit`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${offer.body.data.version}"`)
      .set("Idempotency-Key", `offer-submit-${randomUUID()}`)
      .send({});
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(201);
    expect(submitted.body.data.status).toBe("SUBMITTED");

    const unavailableAcceptance = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/offers/${offerId}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${submitted.body.data.version}"`)
      .set("Idempotency-Key", `offer-accept-unavailable-${randomUUID()}`)
      .send({ transition: "ACCEPT" });
    expect(
      unavailableAcceptance.status,
      JSON.stringify(unavailableAcceptance.body),
    ).toBe(409);
    expect(unavailableAcceptance.body.code).toBe("AVAILABILITY_NOT_CONFIRMED");
    await database.vendorProfile.update({
      where: { vendorOrganizationId: organizationId },
      data: { publicationStatus: "SUSPENDED" },
    });
    expect(
      (
        await couple.agent
          .get("/api/v1/marketplace/vendors?search=Lumina")
          .expect(200)
      ).body.data.items,
    ).toHaveLength(0);
    await vendor.agent
      .post(`/api/v1/vendor-organizations/${organizationId}/availability`)
      .set("Origin", origin)
      .set("Idempotency-Key", `availability-${randomUUID()}`)
      .send({
        startAt: "2027-09-12T00:00:00.000Z",
        endAt: "2027-09-13T00:00:00.000Z",
        status: "AVAILABLE",
        source: "MANUAL",
      })
      .expect(201);

    const acceptKey = `offer-accept-${randomUUID()}`;
    const accepted = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/offers/${offerId}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${submitted.body.data.version}"`)
      .set("Idempotency-Key", acceptKey)
      .send({ transition: "ACCEPT" })
      .expect(201);
    const acceptReplay = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/offers/${offerId}/transitions`)
      .set("Origin", origin)
      .set("If-Match", `"${submitted.body.data.version}"`)
      .set("Idempotency-Key", acceptKey)
      .send({ transition: "ACCEPT" })
      .expect(201);
    bookingId = accepted.body.data.booking.id;
    contractId = accepted.body.data.contract.id;
    expect(acceptReplay.body.data.booking.id).toBe(bookingId);
    await database.vendorProfile.update({
      where: { vendorOrganizationId: organizationId },
      data: { publicationStatus: "PUBLISHED" },
    });
    expect(await database.vendorBooking.count({ where: { offerId } })).toBe(1);
    expect(await database.vendorContract.count({ where: { bookingId } })).toBe(
      1,
    );
    expect(
      await database.budgetItem.count({
        where: { workspaceId, sourceType: "ACCEPTED_OFFER", sourceId: offerId },
      }),
    ).toBe(1);
    expect(
      await database.paymentScheduleEntry.count({ where: { bookingId } }),
    ).toBe(1);
    const bookingBeforeProfileEdit =
      await database.vendorBooking.findUniqueOrThrow({
        where: { id: bookingId },
      });
    const vendorSnapshotBefore = bookingBeforeProfileEdit.vendorSnapshot;
    const currentProfile = await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/profile`)
      .expect(200);
    await vendor.agent
      .put(`/api/v1/vendor-organizations/${organizationId}/profile`)
      .set("Origin", origin)
      .set("If-Match", `"${currentProfile.body.data.version}"`)
      .send({
        slug: currentProfile.body.data.slug,
        headline: "Studio Lumina — profil actualizat",
        description: currentProfile.body.data.description,
        shortDescription: currentProfile.body.data.shortDescription,
        logoUrl: currentProfile.body.data.logoUrl,
        coverImageUrl: currentProfile.body.data.coverImageUrl,
        categories: currentProfile.body.data.categories,
        customCategoryLabel: currentProfile.body.data.customCategoryLabel,
        languages: currentProfile.body.data.languages,
        yearsExperience: currentProfile.body.data.yearsExperience,
        pricingVisibility: currentProfile.body.data.pricingVisibility,
        startingPriceMinor: currentProfile.body.data.startingPriceMinor,
        currency: currentProfile.body.data.currency,
        responseTimeLabel: currentProfile.body.data.responseTimeLabel,
        publicEmail: currentProfile.body.data.publicEmail,
        publicPhone: currentProfile.body.data.publicPhone,
      })
      .expect(200);
    expect(
      (
        await database.vendorBooking.findUniqueOrThrow({
          where: { id: bookingId },
        })
      ).vendorSnapshot,
    ).toEqual(vendorSnapshotBefore);
    await outsider.agent
      .get(`/api/v1/workspaces/${otherWorkspaceId}/offers/${offerId}`)
      .expect(404);
  }, 180_000);

  it("acknowledges the operational contract, records external payment evidence and produces a real export", async () => {
    let contract = await couple.agent
      .get(`/api/v1/workspaces/${workspaceId}/contracts/${contractId}`)
      .expect(200);
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "SUBMIT_FOR_REVIEW" })
      .expect(201);
    contract = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "MARK_READY" })
      .expect(201);
    const contentHash = contract.body.data.currentVersion.contentHash as string;
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .set("Idempotency-Key", `ack-couple-${randomUUID()}`)
      .send({
        typedName: "Ana Test",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash,
      })
      .expect(201);
    const vendorAcknowledgement = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .set("Idempotency-Key", `ack-vendor-${randomUUID()}`)
      .send({
        typedName: "Studio Lumina",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash,
      });
    expect(
      vendorAcknowledgement.status,
      JSON.stringify(vendorAcknowledgement.body),
    ).toBe(201);
    contract = vendorAcknowledgement;
    expect(contract.body.data.status).toBe("ACKNOWLEDGED");
    expect(
      (
        await database.vendorBooking.findUniqueOrThrow({
          where: { id: bookingId },
        })
      ).status,
    ).toBe("CONFIRMED");

    const budgetItem = await database.budgetItem.findFirstOrThrow({
      where: { workspaceId, sourceChainKey: `offer:${offerId}` },
    });
    const schedule = await database.paymentScheduleEntry.findFirstOrThrow({
      where: { workspaceId, budgetItemId: budgetItem.id },
    });
    const paymentKey = `payment-${randomUUID()}`;
    const paymentPayload = {
      paymentScheduleEntryId: schedule.id,
      budgetItemId: budgetItem.id,
      bookingId,
      contractId,
      vendorOrganizationId: organizationId,
      amountMinor: 50_000,
      paidAt: "2027-08-10T10:00:00.000Z",
      method: "BANK_TRANSFER",
      reference: "OP-TEST-001",
      notesPrivate: "Dovadă manuală; plata a fost făcută extern.",
    };
    const payment = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/payments`)
      .set("Origin", origin)
      .set("Idempotency-Key", paymentKey)
      .send(paymentPayload)
      .expect(201);
    const paymentReplay = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/payments`)
      .set("Origin", origin)
      .set("Idempotency-Key", paymentKey)
      .send(paymentPayload)
      .expect(201);
    expect(paymentReplay.body.data.id).toBe(payment.body.data.id);
    const confirmed = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${payment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${payment.body.data.version}"`)
      .send({ transition: "CONFIRM", reason: "Extras bancar verificat" })
      .expect(201);
    expect(confirmed.body.data.status).toBe("CONFIRMED");
    const budgetSummary = await couple.agent
      .get(`/api/v1/workspaces/${workspaceId}/budget/summary`)
      .expect(200);
    expect(budgetSummary.body.data.paidMinor).toBe(50_000);

    const exportResponse = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/commercial-exports`)
      .set("Origin", origin)
      .set("Idempotency-Key", `commercial-export-${randomUUID()}`)
      .send({ type: "budget", format: "xlsx" })
      .expect(201);
    const jobId = exportResponse.body.data.job.id as string;
    await expect
      .poll(
        async () =>
          (
            await database.backgroundJob.findUniqueOrThrow({
              where: { id: jobId },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("COMPLETED");
    await couple.agent
      .get(`/api/v1/jobs/${jobId}/artifact`)
      .expect("Content-Type", /spreadsheetml/)
      .expect(200);

    const dashboard = await couple.agent
      .get(`/api/v1/workspaces/${workspaceId}/dashboard`)
      .expect(200);
    expect(dashboard.body.data.commercial).toMatchObject({
      budget: { committedMinor: 145_000, paidMinor: 50_000 },
    });
    const search = await couple.agent
      .get(`/api/v1/workspaces/${workspaceId}/search?q=Fotografie`)
      .expect(200);
    expect(
      search.body.data.items.some(
        (item: { type: string }) => item.type === "rfq",
      ),
    ).toBe(true);

    const reversed = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${payment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${confirmed.body.data.version}"`)
      .set("Idempotency-Key", `payment-reverse-${randomUUID()}`)
      .send({ transition: "REVERSE", reason: "Corecție contabilă test" })
      .expect(201);
    expect(reversed.body.data).toMatchObject({
      originalPaymentId: payment.body.data.id,
      externalProcessing: false,
      adjustment: { entryType: "REVERSAL", status: "CONFIRMED" },
    });
    const originalPayment = await database.paymentRecord.findUniqueOrThrow({
      where: { id: payment.body.data.id },
    });
    expect(originalPayment).toMatchObject({
      status: "CONFIRMED",
      entryType: "PAYMENT",
      amountMinor: 50_000n,
    });
    const secondReversal = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${payment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${originalPayment.version}"`)
      .set("Idempotency-Key", `payment-reverse-again-${randomUUID()}`)
      .send({ transition: "REVERSE", reason: "Dublare interzisă" })
      .expect(409);
    expect(secondReversal.body.code).toBe(
      "PAYMENT_ADJUSTMENT_EXCEEDS_ORIGINAL",
    );
    expect(
      (
        await couple.agent
          .get(`/api/v1/workspaces/${workspaceId}/budget/summary`)
          .expect(200)
      ).body.data.paidMinor,
    ).toBe(0);

    const partialPayment = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/payments`)
      .set("Origin", origin)
      .set("Idempotency-Key", `partial-payment-${randomUUID()}`)
      .send({
        ...paymentPayload,
        paymentScheduleEntryId: undefined,
        amountMinor: 10_000,
        reference: "OP-TEST-PARTIAL",
      })
      .expect(201);
    const partialConfirmed = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${partialPayment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${partialPayment.body.data.version}"`)
      .send({ transition: "CONFIRM", reason: "Plată parțială verificată" })
      .expect(201);
    await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${partialPayment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${partialConfirmed.body.data.version}"`)
      .send({
        transition: "REFUND",
        reason: "Rambursare parțială verificată",
        amountMinor: 4_000,
      })
      .expect(201);
    const partialAfterRefund = await database.paymentRecord.findUniqueOrThrow({
      where: { id: partialPayment.body.data.id },
    });
    const excessiveRefund = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${partialPayment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${partialAfterRefund.version}"`)
      .send({
        transition: "REFUND",
        reason: "Rambursare peste sold",
        amountMinor: 7_000,
      })
      .expect(409);
    expect(excessiveRefund.body.code).toBe(
      "PAYMENT_ADJUSTMENT_EXCEEDS_ORIGINAL",
    );
    await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/payments/${partialPayment.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${partialAfterRefund.version}"`)
      .send({
        transition: "REFUND",
        reason: "Rambursare sold rămas",
        amountMinor: 6_000,
      })
      .expect(201);
    expect(
      await database.paymentRecord.count({
        where: {
          originalPaymentId: partialPayment.body.data.id,
          entryType: "REFUND",
          status: "CONFIRMED",
        },
      }),
    ).toBe(2);
    expect(
      (
        await couple.agent
          .get(`/api/v1/workspaces/${workspaceId}/budget/summary`)
          .expect(200)
      ).body.data.paidMinor,
    ).toBe(0);
  }, 180_000);

  it("retains agreed versions and requires both parties to acknowledge an amendment", async () => {
    const schedulesBefore = await database.paymentScheduleEntry.count({
      where: { bookingId },
    });
    let contract = await couple.agent
      .get(`/api/v1/workspaces/${workspaceId}/contracts/${contractId}`)
      .expect(200);
    const originalAgreedVersionId = contract.body.data
      .agreedVersionId as string;
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "START_AMENDMENT" })
      .expect(201);
    expect(contract.body.data.currentVersion.kind).toBe("AMENDMENT");
    expect(contract.body.data.currentVersion.baseVersionId).toBe(
      originalAgreedVersionId,
    );
    const draft = contract.body.data.currentVersion;
    contract = await couple.agent
      .put(`/api/v1/workspaces/${workspaceId}/contracts/${contractId}/draft`)
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({
        document: draft.document,
        summary: "Amendament de test",
        cancellationTerms: draft.cancellationTerms,
        paymentTerms: draft.paymentTerms,
        serviceScope: draft.serviceScope,
      })
      .expect(200);
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "SUBMIT_FOR_REVIEW" })
      .expect(201);
    contract = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "MARK_READY" })
      .expect(201);
    const badHash = "0".repeat(64);
    const mismatchedHash = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .set("Idempotency-Key", `bad-amendment-ack-${randomUUID()}`)
      .send({
        typedName: "Ana Test",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash: badHash,
      })
      .expect(412);
    expect(mismatchedHash.body.code).toBe("VERSION_CONFLICT");
    const hash = contract.body.data.currentVersion.contentHash as string;
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .set("Idempotency-Key", `amendment-couple-${randomUUID()}`)
      .send({
        typedName: "Ana Test",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash: hash,
      })
      .expect(201);
    expect(contract.body.data.status).toBe("READY_FOR_ACKNOWLEDGEMENT");
    const currentAfterOneAck = contract.body.data.currentVersion;
    contract = await vendor.agent
      .put(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/draft`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({
        document: currentAfterOneAck.document,
        summary: "Amendament actualizat după o confirmare",
        cancellationTerms: currentAfterOneAck.cancellationTerms,
        paymentTerms: currentAfterOneAck.paymentTerms,
        serviceScope: currentAfterOneAck.serviceScope,
      })
      .expect(200);
    expect(contract.body.data.acknowledgements).toHaveLength(0);
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "SUBMIT_FOR_REVIEW" })
      .expect(201);
    contract = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .send({ transition: "MARK_READY" })
      .expect(201);
    const finalHash = contract.body.data.currentVersion.contentHash as string;
    contract = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${contract.body.data.version}"`)
      .set("Idempotency-Key", `final-amendment-couple-${randomUUID()}`)
      .send({
        typedName: "Ana Test",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash: finalHash,
      })
      .expect(201);
    const vendorAckKey = `final-amendment-vendor-${randomUUID()}`;
    const vendorAckVersion = contract.body.data.version;
    contract = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${vendorAckVersion}"`)
      .set("Idempotency-Key", vendorAckKey)
      .send({
        typedName: "Studio Lumina",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash: finalHash,
      })
      .expect(201);
    expect(contract.body.data.status).toBe("ACKNOWLEDGED");
    await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/contracts/${contractId}/acknowledgements`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${vendorAckVersion}"`)
      .set("Idempotency-Key", vendorAckKey)
      .send({
        typedName: "Studio Lumina",
        statementVersion: "weddingos-contract-ack-v1",
        contentHash: finalHash,
      })
      .expect(201);
    expect(
      await database.vendorContractVersion.count({ where: { contractId } }),
    ).toBeGreaterThanOrEqual(3);
    expect(
      await database.paymentScheduleEntry.count({ where: { bookingId } }),
    ).toBe(schedulesBefore + 1);

    await database.rfqRecipient.updateMany({
      where: { rfqId, vendorOrganizationId: organizationId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureCode: "PROVIDER_REJECTED_TEST",
      },
    });
    const partialDelivery = await couple.agent
      .get(`/api/v1/workspaces/${workspaceId}/rfqs/${rfqId}`)
      .expect(200);
    expect(partialDelivery.body.data.progress).toMatchObject({
      total: 1,
      failed: 1,
      deliveryState: "PARTIAL_FAILURE",
    });

    await database.vendorProfile.update({
      where: { vendorOrganizationId: organizationId },
      data: { publicationStatus: "SUSPENDED" },
    });
    const suspendedPublic = await couple.agent
      .get("/api/v1/marketplace/vendors?search=Lumina")
      .expect(200);
    expect(suspendedPublic.body.data.items).toHaveLength(0);
    await vendor.agent
      .get(`/api/v1/vendor-organizations/${organizationId}/profile`)
      .expect(200);
  }, 180_000);

  it("serializes concurrent single-award acceptance to one winner", async () => {
    await database.vendorProfile.update({
      where: { vendorOrganizationId: organizationId },
      data: { publicationStatus: "PUBLISHED" },
    });
    const ownerRole = await database.vendorRoleTemplate.findUniqueOrThrow({
      where: { key: "vendor_owner" },
    });
    const competitorOrganization = await database.vendorOrganization.create({
      data: {
        legalName: "Cadru Alternativ SRL",
        displayName: "Cadru Alternativ",
        country: "Moldova",
        contactEmail: invitee.email,
        status: "ACTIVE",
        createdById: invitee.userId,
        updatedById: invitee.userId,
      },
    });
    await database.vendorOrganizationMembership.create({
      data: {
        vendorOrganizationId: competitorOrganization.id,
        userId: invitee.userId,
        roleTemplateId: ownerRole.id,
        status: "ACTIVE",
        joinedAt: new Date(),
        createdById: invitee.userId,
        updatedById: invitee.userId,
      },
    });
    await database.vendorProfile.create({
      data: {
        vendorOrganizationId: competitorOrganization.id,
        slug: `cadru-alternativ-${randomUUID()}`,
        headline: "Cadru Alternativ",
        description:
          "Furnizor alternativ pentru testul de atribuire concurentă.",
        shortDescription: "Fotografie alternativă.",
        categories: ["PHOTOGRAPHY"],
        languages: ["ro"],
        pricingVisibility: "STARTING_FROM",
        startingPriceMinor: 130_000,
        currency: "RON",
        publicEmail: invitee.email,
        publicationStatus: "PUBLISHED",
        publishedAt: new Date(),
        updatedById: invitee.userId,
      },
    });

    const concurrentRfq = await couple.agent
      .post(`/api/v1/workspaces/${workspaceId}/rfqs`)
      .set("Origin", origin)
      .set("Idempotency-Key", `concurrent-rfq-${randomUUID()}`)
      .send({
        title: "Atribuire concurentă fotografie",
        category: "PHOTOGRAPHY",
        description: "Două oferte valide, un singur câștigător permis.",
        eventDate: "2027-10-12",
        guestCount: 100,
        locationSnapshot: { city: "Chișinău" },
        budgetRangeMinMinor: 100_000,
        budgetRangeMaxMinor: 200_000,
        currency: "RON",
        responseDeadline: "2027-09-01T10:00:00.000Z",
        requirements: [],
        questions: [],
      })
      .expect(201);
    let rfq = await couple.agent
      .put(
        `/api/v1/workspaces/${workspaceId}/rfqs/${concurrentRfq.body.data.id}/recipients`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${concurrentRfq.body.data.version}"`)
      .send({
        vendorOrganizationIds: [organizationId, competitorOrganization.id],
      })
      .expect(200);
    rfq = await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/rfqs/${concurrentRfq.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${rfq.body.data.version}"`)
      .send({ transition: "MARK_READY" })
      .expect(201);
    await couple.agent
      .post(
        `/api/v1/workspaces/${workspaceId}/rfqs/${concurrentRfq.body.data.id}/transitions`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${rfq.body.data.version}"`)
      .set("Idempotency-Key", `concurrent-rfq-send-${randomUUID()}`)
      .send({ transition: "SEND" })
      .expect(201);
    await expect
      .poll(
        () =>
          database.rfqRecipient.count({
            where: { rfqId: concurrentRfq.body.data.id, status: "SENT" },
          }),
        { timeout: 60_000 },
      )
      .toBe(2);
    await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/rfqs/${concurrentRfq.body.data.id}/open`,
      )
      .set("Origin", origin)
      .send({})
      .expect(201);
    await invitee.agent
      .post(
        `/api/v1/vendor-organizations/${competitorOrganization.id}/rfqs/${concurrentRfq.body.data.id}/open`,
      )
      .set("Origin", origin)
      .send({})
      .expect(201);
    for (const [account, tenant] of [
      [vendor, organizationId],
      [invitee, competitorOrganization.id],
    ] as const) {
      await account.agent
        .post(`/api/v1/vendor-organizations/${tenant}/availability`)
        .set("Origin", origin)
        .set("Idempotency-Key", `concurrent-availability-${randomUUID()}`)
        .send({
          startAt: "2027-10-12T00:00:00.000Z",
          endAt: "2027-10-13T00:00:00.000Z",
          status: "AVAILABLE",
          source: "MANUAL",
        })
        .expect(201);
    }
    const concurrentOfferPayload = {
      currency: "RON",
      lineItems: [
        {
          type: "SERVICE",
          name: "Pachet concurent",
          description: "Acoperire foto completă",
          quantity: 1,
          unit: "FIXED",
          unitPriceMinor: 140_000,
          optional: false,
          selected: true,
          position: 0,
        },
      ],
      answers: [],
      discountMinor: 0,
      taxRateBasisPoints: 0,
      depositMinor: 40_000,
      pricingNotes: "Ofertă pentru test concurent.",
      terms: { paymentSchedule: [] },
      availabilityConfirmation: "Data este disponibilă.",
      deliveryTimeline: "45 de zile.",
      cancellationTerms: "Condiții standard.",
      validUntil: "2027-09-01T10:00:00.000Z",
    };
    const firstOffer = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/rfqs/${concurrentRfq.body.data.id}/offers`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `concurrent-offer-a-${randomUUID()}`)
      .send(concurrentOfferPayload)
      .expect(201);
    const secondOffer = await invitee.agent
      .post(
        `/api/v1/vendor-organizations/${competitorOrganization.id}/rfqs/${concurrentRfq.body.data.id}/offers`,
      )
      .set("Origin", origin)
      .set("Idempotency-Key", `concurrent-offer-b-${randomUUID()}`)
      .send({
        ...concurrentOfferPayload,
        lineItems: [
          {
            ...concurrentOfferPayload.lineItems[0],
            name: "Pachet concurent alternativ",
            unitPriceMinor: 135_000,
          },
        ],
      })
      .expect(201);
    const firstSubmitted = await vendor.agent
      .post(
        `/api/v1/vendor-organizations/${organizationId}/offers/${firstOffer.body.data.id}/submit`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${firstOffer.body.data.version}"`)
      .set("Idempotency-Key", `concurrent-submit-a-${randomUUID()}`)
      .send({})
      .expect(201);
    const secondSubmitted = await invitee.agent
      .post(
        `/api/v1/vendor-organizations/${competitorOrganization.id}/offers/${secondOffer.body.data.id}/submit`,
      )
      .set("Origin", origin)
      .set("If-Match", `"${secondOffer.body.data.version}"`)
      .set("Idempotency-Key", `concurrent-submit-b-${randomUUID()}`)
      .send({})
      .expect(201);
    const accept = (offer: {
      body: { data: { id: string; version: number } };
    }) =>
      couple.agent
        .post(
          `/api/v1/workspaces/${workspaceId}/offers/${offer.body.data.id}/transitions`,
        )
        .set("Origin", origin)
        .set("If-Match", `"${offer.body.data.version}"`)
        .set("Idempotency-Key", `concurrent-accept-${randomUUID()}`)
        .send({ transition: "ACCEPT" });
    const acceptances = await Promise.all([
      accept(firstSubmitted),
      accept(secondSubmitted),
    ]);
    expect(acceptances.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      acceptances.find((response) => response.status === 409)?.body.code,
    ).toBe("RFQ_ALREADY_AWARDED");
    expect(
      await database.vendorBooking.count({
        where: { rfqId: concurrentRfq.body.data.id },
      }),
    ).toBe(1);
    expect(
      await database.vendorOffer.count({
        where: { rfqId: concurrentRfq.body.data.id, status: "ACCEPTED" },
      }),
    ).toBe(1);
  }, 180_000);

  it("fails a forged dual-tenant commercial worker context closed", async () => {
    const marker = randomUUID();
    const forged = await database.$transaction(async (transaction) => {
      const outbox = await transaction.outboxMessage.create({
        data: {
          eventName: "offer.updated.v1",
          aggregateType: "VendorOffer",
          aggregateId: offerId,
          aggregateVersion: 1,
          workspaceId: otherWorkspaceId,
          vendorOrganizationId: organizationId,
          actorUserId: outsider.userId,
          correlationId: marker,
          deduplicationKey: `forged-commercial:${marker}`,
          payload: {
            occurredAt: new Date().toISOString(),
            subject: { offerId },
            workspaceId: otherWorkspaceId,
            vendorOrganizationId: organizationId,
            offerProjection: { offerId },
          },
        },
      });
      return transaction.outboxConsumerExecution.create({
        data: {
          outboxMessageId: outbox.id,
          consumerName: "offer_projection",
          maxAttempts: 1,
          deduplicationKey: `forged-commercial-consumer:${marker}`,
        },
      });
    });
    await expect
      .poll(
        async () =>
          (
            await database.outboxConsumerExecution.findUniqueOrThrow({
              where: { id: forged.id },
            })
          ).status,
        { timeout: 60_000 },
      )
      .toBe("DEAD_LETTER");
    expect(
      (
        await database.outboxConsumerExecution.findUniqueOrThrow({
          where: { id: forged.id },
        })
      ).lastErrorCode,
    ).toBe("COMMERCIAL_AGGREGATE_CONTEXT_MISMATCH");
    expect(
      await database.vendorBooking.count({
        where: { workspaceId: otherWorkspaceId },
      }),
    ).toBe(0);
  }, 180_000);

  async function createAccount(label: string): Promise<Account> {
    const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const registration = await request(application.getHttpServer())
      .post("/api/v1/auth/registrations")
      .set("Origin", origin)
      .send({
        firstName: "Test",
        lastName: label,
        email,
        password: "WeddingOS2026!",
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      })
      .expect(201);
    const token = await waitForVerificationToken(email);
    await request(application.getHttpServer())
      .post("/api/v1/auth/email-verifications")
      .set("Origin", origin)
      .send({ token })
      .expect(200);
    const agent = request.agent(application.getHttpServer());
    await agent
      .post("/api/v1/auth/sessions")
      .set("Origin", origin)
      .send({ email, password: "WeddingOS2026!", remember: true })
      .expect(200);
    return { email, userId: registration.body.data.userId, agent };
  }

  async function createWorkspace(account: Account, title: string) {
    const response = await account.agent
      .post("/api/v1/workspaces")
      .set("Origin", origin)
      .set("Idempotency-Key", `workspace-${randomUUID()}`)
      .send({
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Chișinău",
        timezone: "Europe/Chisinau",
      })
      .expect(201);
    return response.body.data.id as string;
  }
});

async function waitForVerificationToken(email: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    for (const summary of list.messages.filter(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    )) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Verification email not delivered to ${email}`);
}

async function waitForVendorInvitationToken(email: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    for (const summary of list.messages.filter(
      (message) =>
        message.Subject.startsWith("Invitație în ") &&
        message.To.some((recipient) => recipient.Address === email),
    )) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/vendor-invitation\?token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vendor invitation email not delivered to ${email}`);
}

async function cleanDatabase() {
  await assertDestructiveDatabasePurpose(database, "integration");
  const tables = await database.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'database_identities', 'role_templates', 'vendor_role_templates', 'subscription_products', 'subscription_plans', 'subscription_prices', 'subscription_plan_entitlements', 'platform_fee_policies', 'platform_roles', 'legal_documents', 'legal_document_versions', 'consent_purposes', 'data_retention_policies', 'data_retention_rules')
  `;
  if (!tables.length) return;
  const quoted = tables
    .map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await database.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}
