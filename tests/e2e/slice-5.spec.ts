import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHash, createHmac } from "node:crypto";
import { PrismaClient } from "@weddingos/database";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const suiteKey = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const vendorAName = `Studio Lumina ${suiteKey}`;
const vendorASlug = `studio-lumina-${suiteKey}`;
const vendorBName = `Cadru Clar ${suiteKey}`;
const vendorBSlug = `cadru-clar-${suiteKey}`;
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
type Account = { email: string; userId: string; api: APIRequestContext };
type Resource = Record<string, unknown> & { id: string; version: number };

const contexts: APIRequestContext[] = [];
let couple!: Account;
let otherCouple!: Account;
let vendorA!: Account;
let vendorB!: Account;
let vendorMember!: Account;
let workspaceId = "";
let otherWorkspaceId = "";
let organizationA = "";
let organizationB = "";
let freeVendorOrganization = "";
let profileA!: Resource;
let rfq!: Resource;
let offerA!: Resource;
let offerB!: Resource;
let bookingId = "";
let contract!: Resource;
let budgetItem!: Resource;
let schedule!: Resource;
let payment!: Resource;
let cleanContractDocument!: Resource;
let quarantinedDocument!: Resource;
let sharedDocument!: Resource;
let documentGrant!: Resource;
let portfolioAsset!: Resource;
let contractMaterialization!: Resource;
let signatureEnvelope!: Resource;
let declinedEnvelope!: Resource;
let staleEnvelope!: Resource;
let onlineSchedule!: Resource;
let onlineCheckout!: Resource;
let onlineTransaction!: Resource;
let partialRefund!: Resource;
let failedCheckout!: Resource;
let reviewEligibility!: Resource;
let verifiedReview!: Resource;
let reviewReply!: Resource;
let reviewModerationCaseId = "";
let vendorSubscription!: Resource;
let vendorPayoutAccount!: Resource;
let payoutTransaction!: Resource;
let vendorSettlement!: Resource;
let vendorPayout!: Resource;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  couple = await createVerifiedAccount("slice5-couple");
  otherCouple = await createVerifiedAccount("slice5-other-couple");
  vendorA = await createVerifiedAccount("slice5-vendor-a");
  vendorB = await createVerifiedAccount("slice5-vendor-b");
  vendorMember = await createVerifiedAccount("slice5-vendor-member");
  workspaceId = await createWorkspace(
    couple.api,
    `Commercial E2E ${Date.now()}`,
  );
  otherWorkspaceId = await createWorkspace(
    otherCouple.api,
    `Commercial isolated ${Date.now()}`,
  );
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("E2E 1 — Vendor organization", async ({ page }) => {
  const organization = await apiData<Resource>(
    await vendorA.api.post("/api/v1/vendor-organizations", {
      headers: mutationHeaders({
        "Idempotency-Key": `vendor-a-${crypto.randomUUID()}`,
      }),
      data: vendorOrganization(vendorAName, vendorA.email),
    }),
  );
  organizationA = organization.id;
  const invitation = await apiData<{
    id: string;
    email: string;
    status: string;
  }>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/invitations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `vendor-invite-${crypto.randomUUID()}`,
        }),
        data: { email: vendorMember.email, role: "vendor_sales" },
      },
    ),
  );
  expect(invitation).toMatchObject({
    email: vendorMember.email,
    status: "PENDING",
  });
  expect(invitation).not.toHaveProperty("token");
  const token = await waitForVendorInvitationToken(vendorMember.email);
  const mismatched = await couple.api.post(
    "/api/v1/vendor-invitations/accept",
    {
      headers: mutationHeaders(),
      data: { token },
    },
  );
  expect(mismatched.status()).toBe(404);
  expect((await mismatched.json()).code).toBe("TOKEN_INVALID");
  const invitationPreview = await apiData<Record<string, unknown>>(
    await vendorMember.api.post("/api/v1/vendor-invitations/preview", {
      headers: mutationHeaders(),
      data: { token },
    }),
  );
  expect(invitationPreview).toMatchObject({
    vendorOrganizationId: organizationA,
    organizationName: vendorAName,
  });
  await apiData(
    await vendorMember.api.post("/api/v1/vendor-invitations/accept", {
      headers: mutationHeaders(),
      data: { token },
    }),
  );
  profileA = await apiData<Resource>(
    await vendorA.api.put(
      `/api/v1/vendor-organizations/${organizationA}/profile`,
      {
        headers: mutationHeaders(),
        data: vendorProfile(vendorASlug, vendorAName),
      },
    ),
  );
  await authorizePage(page, vendorA);
  await page.goto("/vendor");
  await expect(page.getByText(vendorAName).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(vendorAName).first()).toBeVisible();
});

test("E2E 2 — Publish vendor profile", async () => {
  const service = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/services`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `service-a-${crypto.randomUUID()}`,
        }),
        data: vendorService("Fotografie documentară E2E"),
      },
    ),
  );
  await apiData(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/services/${service.id}/packages`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `package-a-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Documentar complet E2E",
          description: "12 ore și galerie privată.",
          basePriceMinor: 150_000,
          currency: "RON",
          includedItems: ["12 ore", "Galerie"],
          excludedItems: ["Album"],
          active: true,
          position: 0,
        },
      },
    ),
  );
  await apiData(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/subscription-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `starter-before-publish-${crypto.randomUUID()}`,
        }),
        data: { planKey: "STARTER" },
      },
    ),
  );
  profileA = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/profile/publish`,
      {
        headers: mutationHeaders({ "If-Match": `"${profileA.version}"` }),
        data: {},
      },
    ),
  );
  expect(profileA.publicationStatus).toBe("PUBLISHED");
  const missingAvailability = await apiData<{
    items: Array<Record<string, unknown>>;
  }>(
    await couple.api.get(
      `/api/v1/marketplace/vendors?search=${encodeURIComponent(suiteKey)}&date=2027-09-12`,
    ),
  );
  expect(missingAvailability.items).toHaveLength(0);
  await apiData(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/availability`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `availability-a-${crypto.randomUUID()}`,
        }),
        data: {
          startAt: "2027-09-12T00:00:00.000Z",
          endAt: "2027-09-13T00:00:00.000Z",
          status: "AVAILABLE",
          source: "MANUAL",
        },
      },
    ),
  );
  const publicProfile = await apiData<Record<string, unknown>>(
    await couple.api.get(`/api/v1/marketplace/vendors/${vendorASlug}`),
  );
  expect(publicProfile).not.toHaveProperty("billingEmailEncrypted");
  expect(publicProfile).not.toHaveProperty("taxIdEncrypted");
});

test("E2E 3 — Marketplace", async ({ page }) => {
  const list = await apiData<{ items: Array<Record<string, unknown>> }>(
    await couple.api.get(
      `/api/v1/marketplace/vendors?category=PHOTOGRAPHY&search=${encodeURIComponent(suiteKey)}`,
    ),
  );
  expect(list.items).toHaveLength(1);
  await apiData(
    await couple.api.put(
      `/api/v1/workspaces/${workspaceId}/vendor-favorites/${organizationA}`,
      { headers: mutationHeaders(), data: {} },
    ),
  );
  const shortlist = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/vendor-shortlists`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `shortlist-${crypto.randomUUID()}`,
        }),
        data: { name: "Foto E2E", category: "PHOTOGRAPHY" },
      },
    ),
  );
  await apiData(
    await couple.api.put(
      `/api/v1/workspaces/${workspaceId}/vendor-shortlists/${shortlist.id}/vendors/${organizationA}`,
      { headers: mutationHeaders(), data: {} },
    ),
  );
  await authorizePage(page, couple);
  await page.goto("/favorites");
  await expect(page.getByText(vendorAName).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText(vendorAName).first()).toBeVisible();
});

test("E2E 4 — Create RFQ", async () => {
  organizationB = (
    await apiData<Resource>(
      await vendorB.api.post("/api/v1/vendor-organizations", {
        headers: mutationHeaders({
          "Idempotency-Key": `vendor-b-${crypto.randomUUID()}`,
        }),
        data: vendorOrganization(vendorBName, vendorB.email),
      }),
    )
  ).id;
  let profileB = await apiData<Resource>(
    await vendorB.api.put(
      `/api/v1/vendor-organizations/${organizationB}/profile`,
      {
        headers: mutationHeaders(),
        data: vendorProfile(vendorBSlug, vendorBName),
      },
    ),
  );
  await apiData(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/services`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `service-b-${crypto.randomUUID()}`,
        }),
        data: vendorService("Pachet foto Cadru Clar"),
      },
    ),
  );
  await apiData(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/subscription-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `starter-b-before-publish-${crypto.randomUUID()}`,
        }),
        data: { planKey: "STARTER" },
      },
    ),
  );
  profileB = await apiData<Resource>(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/profile/publish`,
      {
        headers: mutationHeaders({ "If-Match": `"${profileB.version}"` }),
        data: {},
      },
    ),
  );
  expect(profileB.publicationStatus).toBe("PUBLISHED");
  await apiData(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/availability`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `availability-b-${crypto.randomUUID()}`,
        }),
        data: {
          startAt: "2027-09-12T00:00:00.000Z",
          endAt: "2027-09-13T00:00:00.000Z",
          status: "AVAILABLE",
          source: "MANUAL",
        },
      },
    ),
  );

  rfq = await apiData<Resource>(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/rfqs`, {
      headers: mutationHeaders({
        "Idempotency-Key": `rfq-${crypto.randomUUID()}`,
      }),
      data: rfqPayload(),
    }),
  );
  const recipients = await apiData<{ items: unknown[]; version: number }>(
    await couple.api.put(
      `/api/v1/workspaces/${workspaceId}/rfqs/${rfq.id}/recipients`,
      {
        headers: mutationHeaders({ "If-Match": `"${rfq.version}"` }),
        data: { vendorOrganizationIds: [organizationA, organizationB] },
      },
    ),
  );
  expect(recipients.items).toHaveLength(2);
  const preview = await apiData<{ canSend: boolean; items: unknown[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/rfqs/${rfq.id}/recipient-preview`,
    ),
  );
  expect(preview).toMatchObject({ canSend: true });
  rfq = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/rfqs/${rfq.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${recipients.version}"` }),
        data: { transition: "MARK_READY" },
      },
    ),
  );
  rfq = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/rfqs/${rfq.id}/transitions`,
      {
        headers: mutationHeaders({
          "If-Match": `"${rfq.version}"`,
          "Idempotency-Key": `send-rfq-${crypto.randomUUID()}`,
        }),
        data: { transition: "SEND" },
      },
    ),
  );
  expect(rfq.status).toBe("SENT");
});

test("E2E 5 — Vendor receives RFQ", async ({ page }) => {
  await expect
    .poll(async () => {
      const result = await apiData<{ items: Array<Record<string, unknown>> }>(
        await vendorA.api.get(
          `/api/v1/vendor-organizations/${organizationA}/rfqs`,
        ),
      );
      return (result.items[0]?.recipient as Record<string, unknown>)?.status;
    })
    .toBe("SENT");
  const opened = await apiData<{ rfq: Record<string, unknown> }>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/rfqs/${rfq.id}/open`,
      { headers: mutationHeaders(), data: {} },
    ),
  );
  expect(opened.rfq).not.toHaveProperty("recipients");
  await authorizePage(page, vendorA);
  await page.goto(`/vendor/requests?organization=${organizationA}`);
  await expect(page.getByText("Fotografie nuntă E2E").first()).toBeVisible();
});

test("E2E 6 — Vendor submits offer", async () => {
  const vendorRfq = await apiData<{ rfq: Record<string, unknown> }>(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/rfqs/${rfq.id}`,
    ),
  );
  const questionId = (vendorRfq.rfq.questions as Array<{ id: string }>)[0]!.id;
  const foreignCurrency = await vendorA.api.post(
    `/api/v1/vendor-organizations/${organizationA}/rfqs/${rfq.id}/offers`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `offer-a-eur-${crypto.randomUUID()}`,
      }),
      data: { ...offerPayload(145_000, questionId), currency: "EUR" },
    },
  );
  expect(foreignCurrency.status()).toBe(400);
  expect((await foreignCurrency.json()).code).toBe("CURRENCY_MISMATCH");
  offerA = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/rfqs/${rfq.id}/offers`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `offer-a-${crypto.randomUUID()}`,
        }),
        data: offerPayload(145_000, questionId),
      },
    ),
  );
  offerA = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/offers/${offerA.id}/submit`,
      {
        headers: mutationHeaders({
          "If-Match": `"${offerA.version}"`,
          "Idempotency-Key": `offer-a-submit-${crypto.randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  expect(offerA).toMatchObject({
    status: "SUBMITTED",
    currentVersionNumber: 1,
  });
  const immutable = await vendorA.api.patch(
    `/api/v1/vendor-organizations/${organizationA}/offers/${offerA.id}/draft`,
    {
      headers: mutationHeaders({ "If-Match": `"${offerA.version}"` }),
      data: { pricingNotes: "Mutare interzisă" },
    },
  );
  expect(immutable.status()).toBe(409);
});

test("E2E 7 — Compare offers", async () => {
  await apiData(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/rfqs/${rfq.id}/open`,
      { headers: mutationHeaders(), data: {} },
    ),
  );
  const detail = await apiData<{ rfq: Record<string, unknown> }>(
    await vendorB.api.get(
      `/api/v1/vendor-organizations/${organizationB}/rfqs/${rfq.id}`,
    ),
  );
  const questionId = (detail.rfq.questions as Array<{ id: string }>)[0]!.id;
  offerB = await apiData<Resource>(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/rfqs/${rfq.id}/offers`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `offer-b-${crypto.randomUUID()}`,
        }),
        data: offerPayload(160_000, questionId),
      },
    ),
  );
  offerB = await apiData<Resource>(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/offers/${offerB.id}/submit`,
      {
        headers: mutationHeaders({
          "If-Match": `"${offerB.version}"`,
          "Idempotency-Key": `offer-b-submit-${crypto.randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  const comparison = await apiData<{ items: Array<Record<string, unknown>> }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/rfqs/${rfq.id}/offer-comparison`,
    ),
  );
  expect(comparison.items).toHaveLength(2);
  expect(comparison.items.every((item) => typeof item.score === "object")).toBe(
    true,
  );
  expect(
    (
      await vendorA.api.get(
        `/api/v1/vendor-organizations/${organizationA}/offers/${offerB.id}`,
      )
    ).status(),
  ).toBe(404);
});

test("E2E 8 — Request revision", async () => {
  offerA = await apiData<{ offer: Resource }>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/offers/${offerA.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${offerA.version}"` }),
        data: {
          transition: "REQUEST_REVISION",
          reason: "Clarifică livrarea și ajustează prețul.",
        },
      },
    ),
  ).then((result) => result.offer);
  const previousHash = (offerA.currentVersion as Record<string, unknown>)
    .contentHash;
  offerA = await apiData<Resource>(
    await vendorA.api.patch(
      `/api/v1/vendor-organizations/${organizationA}/offers/${offerA.id}/draft`,
      {
        headers: mutationHeaders({ "If-Match": `"${offerA.version}"` }),
        data: { pricingNotes: "Livrare clarificată, preț revizuit." },
      },
    ),
  );
  expect(offerA.currentVersionNumber).toBe(2);
  expect(
    (offerA.currentVersion as Record<string, unknown>).contentHash,
  ).not.toBe(previousHash);
  offerA = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/offers/${offerA.id}/submit`,
      {
        headers: mutationHeaders({
          "If-Match": `"${offerA.version}"`,
          "Idempotency-Key": `offer-a-resubmit-${crypto.randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
});

test("E2E 9 — Accept offer", async () => {
  const key = `accept-${crypto.randomUUID()}`;
  const headers = mutationHeaders({
    "If-Match": `"${offerA.version}"`,
    "Idempotency-Key": key,
  });
  const accepted = await apiData<{
    offer: Resource;
    booking: Resource;
    contract: Resource;
  }>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/offers/${offerA.id}/transitions`,
      { headers, data: { transition: "ACCEPT" } },
    ),
  );
  const replay = await apiData<{
    booking: Resource;
    contract: Resource;
  }>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/offers/${offerA.id}/transitions`,
      { headers, data: { transition: "ACCEPT" } },
    ),
  );
  bookingId = accepted.booking.id;
  contract = accepted.contract;
  expect(replay.booking.id).toBe(bookingId);
  expect(replay.contract.id).toBe(contract.id);
  const budget = await currentBudget();
  expect(
    budget.items.filter((item) => item.sourceId === offerA.id),
  ).toHaveLength(1);
});

test("E2E 10 — Negotiation", async () => {
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/offers/${offerA.id}/negotiation/messages`,
      { headers: mutationHeaders(), data: { body: "Mesaj cuplu E2E" } },
    ),
  );
  await apiData(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/offers/${offerA.id}/negotiation/messages`,
      { headers: mutationHeaders(), data: { body: "Răspuns furnizor E2E" } },
    ),
  );
  const thread = await apiData<{ items: Array<{ body: string }> }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/offers/${offerA.id}/negotiation/messages`,
    ),
  );
  expect(thread.items.map((item) => item.body)).toEqual(
    expect.arrayContaining(["Mesaj cuplu E2E", "Răspuns furnizor E2E"]),
  );
  expect(
    (
      await otherCouple.api.get(
        `/api/v1/workspaces/${workspaceId}/offers/${offerA.id}/negotiation/messages`,
      )
    ).status(),
  ).toBe(403);
});

test("E2E 11 — Contract review", async () => {
  contract = await contractDetail(couple.api, workspaceId, contract.id);
  const current = contract.currentVersion as Record<string, unknown>;
  contract = await apiData<Resource>(
    await couple.api.put(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/draft`,
      {
        headers: mutationHeaders({ "If-Match": `"${contract.version}"` }),
        data: contractDraft(current, "Contract revizuit de cuplu E2E"),
      },
    ),
  );
  expect(contract.currentVersionNumber).toBe(2);
  contract = await transitionContract(
    couple.api,
    `/api/v1/workspaces/${workspaceId}`,
    contract,
    "SUBMIT_FOR_REVIEW",
  );
  contract = await transitionContract(
    vendorA.api,
    `/api/v1/vendor-organizations/${organizationA}`,
    contract,
    "REQUEST_CHANGES",
    "Clarifică responsabilitățile.",
  );
  const changed = contract.currentVersion as Record<string, unknown>;
  contract = await apiData<Resource>(
    await vendorA.api.put(
      `/api/v1/vendor-organizations/${organizationA}/contracts/${contract.id}/draft`,
      {
        headers: mutationHeaders({ "If-Match": `"${contract.version}"` }),
        data: contractDraft(changed, "Contract clarificat de furnizor E2E"),
      },
    ),
  );
  expect(contract.currentVersionNumber).toBe(3);
});

test("E2E 12 — Contract agreement", async () => {
  contract = await transitionContract(
    couple.api,
    `/api/v1/workspaces/${workspaceId}`,
    contract,
    "SUBMIT_FOR_REVIEW",
  );
  contract = await transitionContract(
    vendorA.api,
    `/api/v1/vendor-organizations/${organizationA}`,
    contract,
    "MARK_READY",
  );
  const hash = (contract.currentVersion as Record<string, unknown>)
    .contentHash as string;
  contract = await acknowledge(
    couple.api,
    `/api/v1/workspaces/${workspaceId}`,
    contract,
    "Ana E2E",
    hash,
  );
  contract = await acknowledge(
    vendorA.api,
    `/api/v1/vendor-organizations/${organizationA}`,
    contract,
    "Studio Lumina E2E",
    hash,
  );
  expect(contract.status).toBe("ACKNOWLEDGED");
  const booking = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/bookings/${bookingId}`,
    ),
  );
  expect(booking.status).toBe("CONFIRMED");
});

test("E2E 13 — Contract conflict", async () => {
  const stale = await couple.api.put(
    `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/draft`,
    {
      headers: mutationHeaders({
        "If-Match": `"${Math.max(1, contract.version - 1)}"`,
      }),
      data: contractDraft(
        contract.currentVersion as Record<string, unknown>,
        "Stale write",
      ),
    },
  );
  expect(stale.status()).toBe(412);
  expect(
    (await contractDetail(couple.api, workspaceId, contract.id)).version,
  ).toBe(contract.version);
});

test("E2E 14 — Budget", async ({ page }) => {
  let budget = await currentBudget();
  const plan = budget.plan!;
  await apiData(
    await couple.api.put(`/api/v1/workspaces/${workspaceId}/budget`, {
      headers: mutationHeaders({
        "If-Match": `"${plan.version}"`,
        "Idempotency-Key": `budget-${crypto.randomUUID()}`,
      }),
      data: {
        name: "Buget E2E",
        targetTotalMinor: 500_000,
        contingencyPercent: 10,
        status: "ACTIVE",
      },
    }),
  );
  const category = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/budget/categories`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `budget-category-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Diverse E2E",
          canonicalType: "MISCELLANEOUS",
          allocatedMinor: 50_000,
          position: 10,
        },
      },
    ),
  );
  await apiData(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/budget/items`, {
      headers: mutationHeaders({
        "Idempotency-Key": `budget-item-${crypto.randomUUID()}`,
      }),
      data: {
        categoryId: category.id,
        name: "Poziție manuală E2E",
        estimatedMinor: 25_000,
      },
    }),
  );
  budget = await currentBudget();
  expect(
    budget.items.some((item) => item.sourceChainKey === `offer:${offerA.id}`),
  ).toBe(true);
  expect(budget.items.some((item) => item.name === "Poziție manuală E2E")).toBe(
    true,
  );
  await authorizePage(page, couple);
  await page.goto("/budget");
  await expect(page.getByText("Poziție manuală E2E")).toBeVisible();
});

test("E2E 15 — Payment schedule", async ({ page }) => {
  const budget = await currentBudget();
  budgetItem = budget.items.find(
    (item) => item.sourceChainKey === `offer:${offerA.id}`,
  )!;
  const schedules = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/payment-schedules`),
  );
  schedule = schedules.items.find((item) => item.bookingId === bookingId)!;
  expect(schedule).toBeTruthy();
  expect(Number(schedule.amountMinor) - Number(schedule.paidMinor)).toBe(
    50_000,
  );
  const calendar = await apiData<{ items: Array<Record<string, unknown>> }>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/calendar-events`),
  );
  expect(
    calendar.items.some(
      (item) =>
        item.sourceType === "payment_schedule" && item.sourceId === schedule.id,
    ),
  ).toBe(true);
  await authorizePage(page, couple);
  await page.goto("/payments");
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Avans").first()).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 20_000 });
});

test("E2E 16 — Record payment", async () => {
  payment = await apiData<Resource>(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/payments`, {
      headers: mutationHeaders({
        "Idempotency-Key": `payment-${crypto.randomUUID()}`,
      }),
      data: paymentPayload(schedule, budgetItem, 50_000, "E2E-DEPOSIT-1"),
    }),
  );
  payment = await transitionPayment(payment, "CONFIRM", "Extras verificat E2E");
  const summary = await apiData<Record<string, number>>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/budget/summary`),
  );
  expect(summary.paidMinor).toBe(50_000);
  const booking = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/bookings/${bookingId}`,
    ),
  );
  expect(booking.outstandingTotalMinor).toBe(95_000);
});

test("E2E 17 — Reverse payment", async () => {
  const reversal = await apiData<{
    originalPaymentId: string;
    adjustment: Resource;
    externalProcessing: boolean;
  }>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payments/${payment.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${payment.version}"` }),
        data: { transition: "REVERSE", reason: "Corecție E2E" },
      },
    ),
  );
  expect(reversal).toMatchObject({
    originalPaymentId: payment.id,
    externalProcessing: false,
    adjustment: { entryType: "REVERSAL", status: "CONFIRMED" },
  });
  payment = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/payments/${payment.id}`,
    ),
  );
  expect(payment).toMatchObject({ status: "CONFIRMED", entryType: "PAYMENT" });
  const summary = await apiData<Record<string, number>>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/budget/summary`),
  );
  expect(summary.paidMinor).toBe(0);
  const activity = await apiData<{ items: Array<Record<string, unknown>> }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/activity?limit=100`,
    ),
  );
  await expect
    .poll(async () => {
      const value = await apiData<{ items: Array<Record<string, unknown>> }>(
        await couple.api.get(
          `/api/v1/workspaces/${workspaceId}/activity?limit=100`,
        ),
      );
      return value.items.some((item) => item.action === "payment_reverse");
    })
    .toBe(true);
  expect(Array.isArray(activity.items)).toBe(true);
});

test("E2E 18 — Over-budget", async ({ page }) => {
  const budget = await currentBudget();
  const updated = await apiData<Resource>(
    await couple.api.put(`/api/v1/workspaces/${workspaceId}/budget`, {
      headers: mutationHeaders({
        "If-Match": `"${budget.plan!.version}"`,
        "Idempotency-Key": `budget-low-${crypto.randomUUID()}`,
      }),
      data: {
        name: "Buget sub angajamente E2E",
        targetTotalMinor: 100_000,
        contingencyPercent: 0,
        status: "ACTIVE",
      },
    }),
  );
  expect(updated.targetTotalMinor).toBe(100_000);
  const summary = await apiData<Record<string, unknown>>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/budget/summary`),
  );
  expect(summary.overBudget).toBe(true);
  await authorizePage(page, couple);
  await page.goto("/budget");
  await expect(page.getByText("145%")).toBeVisible();
});

test("E2E 19 — Payment reminder", async () => {
  await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-schedules`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `reminder-${crypto.randomUUID()}`,
        }),
        data: {
          budgetItemId: budgetItem.id,
          bookingId,
          contractId: contract.id,
          vendorOrganizationId: organizationA,
          name: "Reminder E2E imediat",
          amountMinor: 10_000,
          dueAt: new Date(Date.now() + 5_000).toISOString(),
          sequence: 99,
        },
      },
    ),
  );
  await expect
    .poll(
      async () => {
        const notifications = await apiData<{
          items: Array<Record<string, unknown>>;
        }>(
          await couple.api.get(
            `/api/v1/workspaces/${workspaceId}/notifications?limit=100`,
          ),
        );
        return notifications.items.filter(
          (item) =>
            item.kind === "payment_due" &&
            String(item.body).includes("Reminder E2E imediat") &&
            item.actionUrl === "/payments",
        ).length;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
});

test("E2E 20 — Contract export", async () => {
  contract = await contractDetail(couple.api, workspaceId, contract.id);
  const currentVersion = contract.currentVersion as Resource;
  const requested = await apiData<{ job: { id: string } }>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/exports`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `contract-export-${crypto.randomUUID()}`,
        }),
        data: { format: "html", contractVersionId: currentVersion.id },
      },
    ),
  );
  await waitForJob(couple.api, requested.job.id);
  const artifact = await couple.api.get(
    `/api/v1/jobs/${requested.job.id}/artifact`,
  );
  expect(artifact.status()).toBe(200);
  expect(artifact.headers()["content-type"]).toContain("text/html");
  expect(
    (
      await otherCouple.api.get(`/api/v1/jobs/${requested.job.id}/artifact`)
    ).status(),
  ).toBe(404);
});

test("E2E 21 — Vendor isolation", async () => {
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationB}/offers/${offerA.id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationB}/bookings/${bookingId}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationB}/contracts/${contract.id}`,
      )
    ).status(),
  ).toBe(404);
});

test("E2E 22 — Wedding isolation", async () => {
  expect(
    (
      await otherCouple.api.get(
        `/api/v1/workspaces/${otherWorkspaceId}/rfqs/${rfq.id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await otherCouple.api.get(
        `/api/v1/workspaces/${otherWorkspaceId}/payments/${payment.id}`,
      )
    ).status(),
  ).toBe(404);
  const otherBudget = await otherCouple.api.get(
    `/api/v1/workspaces/${otherWorkspaceId}/budget`,
  );
  expect(otherBudget.status()).toBe(200);
  expect(await apiData(otherBudget)).toMatchObject({
    plan: null,
    categories: [],
    items: [],
    summary: null,
  });
});

test("E2E 23 — Cross-tenant relationship", async () => {
  expect(
    (
      await couple.api.get(
        `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}`,
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await vendorA.api.get(
        `/api/v1/vendor-organizations/${organizationA}/contracts/${contract.id}`,
      )
    ).status(),
  ).toBe(200);
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationB}/contracts/${contract.id}`,
      )
    ).status(),
  ).toBe(404);
});

test("E2E 24 — Overview", async ({ page }) => {
  let replacement = await apiData<Resource>(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/payments`, {
      headers: mutationHeaders({
        "Idempotency-Key": `payment-replacement-${crypto.randomUUID()}`,
      }),
      data: paymentPayload(schedule, budgetItem, 50_000, "E2E-DEPOSIT-2"),
    }),
  );
  replacement = await transitionPayment(
    replacement,
    "CONFIRM",
    "Înlocuire verificată E2E",
  );
  expect(replacement.status).toBe("CONFIRMED");
  const dashboard = await apiData<{
    commercial: {
      budget: { committedMinor: number; paidMinor: number };
      procurement: Record<string, Record<string, number>>;
    };
  }>(await couple.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`));
  expect(dashboard.commercial.budget).toMatchObject({
    committedMinor: 145_000,
    paidMinor: 50_000,
  });
  expect(dashboard.commercial.procurement.contracts.acknowledged).toBe(1);
  await authorizePage(page, couple);
  await page.goto("/overview");
  await expect(page.getByText(/1\.450\s*RON/).first()).toBeVisible();
});

test("E2E 25 — Demo", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/") && request.method() !== "GET")
      mutations.push(request.url());
  });
  await page
    .context()
    .addCookies([
      { name: "weddingos_demo", value: "1", url: origin, sameSite: "Lax" },
    ]);
  await page.goto("/marketplace?demo=1");
  await expect(page.getByText("Marketplace furnizori")).toBeVisible();
  await expect(
    page.locator("main").getByText("Studio Nord Film"),
  ).toBeVisible();
  await page.goto("/budget?demo=1");
  await expect(page.getByText("Pachet foto demo")).toBeVisible();
  await page.goto("/payments?demo=1");
  await expect(page.getByText("Bugetul nu are poziții")).toBeVisible();
  expect(mutations).toEqual([]);
});

test("Slice 6 E2E 1 — Upload contract attachment", async () => {
  cleanContractDocument = await uploadVaultDocument(
    couple.api,
    { workspaceId },
    {
      purpose: "CONTRACT_ATTACHMENT",
      bytes: Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF\n"),
      contentType: "application/pdf",
      fileName: "contract-attachment-e2e.pdf",
      title: "Contract attachment E2E",
      documentType: "CONTRACT_ATTACHMENT",
      classification: "CONTRACTUAL",
      resourceType: "CONTRACT",
      resourceId: contract.id,
    },
  );
  cleanContractDocument = await waitForDocument(
    couple.api,
    { workspaceId },
    cleanContractDocument.id,
    "AVAILABLE",
  );
  const attachments = await apiData<{ items: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/documents`,
    ),
  );
  expect(
    attachments.items.some((item) => item.id === cleanContractDocument.id),
  ).toBe(true);
  expect(
    (
      await couple.api.get(
        `/api/v1/documents/${cleanContractDocument.id}?workspaceId=${workspaceId}`,
      )
    ).status(),
  ).toBe(200);
});

test("Slice 6 E2E 2 — Quarantine", async () => {
  const eicar = Buffer.from(
    "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
  );
  quarantinedDocument = await uploadVaultDocument(
    couple.api,
    { workspaceId },
    {
      purpose: "GENERAL_COMMERCIAL_DOCUMENT",
      bytes: eicar,
      contentType: "text/plain",
      fileName: "security-fixture-e2e.txt",
      title: "Security fixture E2E",
      documentType: "OTHER",
      classification: "SENSITIVE",
    },
  );
  quarantinedDocument = await waitForDocument(
    couple.api,
    { workspaceId },
    quarantinedDocument.id,
    "QUARANTINED",
  );
  expect(
    (
      await couple.api.post(
        `/api/v1/documents/${quarantinedDocument.id}/downloads?workspaceId=${workspaceId}`,
        { headers: mutationHeaders() },
      )
    ).status(),
  ).toBe(423);
  await expect
    .poll(
      async () => {
        const notifications = await apiData<{ items: Resource[] }>(
          await couple.api.get(
            `/api/v1/workspaces/${workspaceId}/notifications?limit=100`,
          ),
        );
        return notifications.items.some(
          (item) => item.kind === "document_quarantined",
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
});

test("Slice 6 E2E 3 — Document sharing", async () => {
  sharedDocument = await uploadVaultDocument(
    couple.api,
    { workspaceId },
    {
      purpose: "BOOKING_DOCUMENT",
      bytes: Buffer.from("%PDF-1.4\n% booking document\n%%EOF\n"),
      contentType: "application/pdf",
      fileName: "booking-document-e2e.pdf",
      title: "Booking document E2E",
      documentType: "BOOKING_DOCUMENT",
      classification: "SHARED_PARTIES",
      resourceType: "BOOKING",
      resourceId: bookingId,
    },
  );
  sharedDocument = await waitForDocument(
    couple.api,
    { workspaceId },
    sharedDocument.id,
    "AVAILABLE",
  );
  let vendorDocuments = await apiData<{ items: Resource[] }>(
    await vendorA.api.get(
      `/api/v1/documents?vendorOrganizationId=${organizationA}`,
    ),
  );
  expect(
    vendorDocuments.items.some((item) => item.id === sharedDocument.id),
  ).toBe(false);
  documentGrant = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/documents/${sharedDocument.id}/grants?workspaceId=${workspaceId}`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `document-grant-${crypto.randomUUID()}`,
        }),
        data: {
          granteeType: "BOOKING_PARTY",
          granteeId: organizationA,
          permission: "DOWNLOAD",
        },
      },
    ),
  );
  vendorDocuments = await apiData<{ items: Resource[] }>(
    await vendorA.api.get(
      `/api/v1/documents?vendorOrganizationId=${organizationA}`,
    ),
  );
  expect(
    vendorDocuments.items.some((item) => item.id === sharedDocument.id),
  ).toBe(true);
  expect(
    (
      await vendorA.api.post(
        `/api/v1/documents/${sharedDocument.id}/downloads?vendorOrganizationId=${organizationA}`,
        { headers: mutationHeaders() },
      )
    ).status(),
  ).toBe(201);
  await apiData(
    await couple.api.delete(
      `/api/v1/documents/${sharedDocument.id}/grants/${documentGrant.id}?workspaceId=${workspaceId}`,
      { headers: mutationHeaders() },
    ),
  );
  expect(
    (
      await vendorA.api.post(
        `/api/v1/documents/${sharedDocument.id}/downloads?vendorOrganizationId=${organizationA}`,
        { headers: mutationHeaders() },
      )
    ).status(),
  ).toBe(404);
});

test("Slice 6 E2E 4 — Receipt", async () => {
  const receipt = await uploadVaultDocument(
    couple.api,
    { workspaceId },
    {
      purpose: "EXPENSE_RECEIPT",
      bytes: Buffer.from("%PDF-1.4\n% receipt\n%%EOF\n"),
      contentType: "application/pdf",
      fileName: "receipt-e2e.pdf",
      title: "Receipt E2E",
      documentType: "EXPENSE_RECEIPT",
      classification: "FINANCIAL",
    },
  );
  await waitForDocument(couple.api, { workspaceId }, receipt.id, "AVAILABLE");
  expect(
    (
      await couple.api.post(
        `/api/v1/documents/${receipt.id}/downloads?workspaceId=${workspaceId}`,
        { headers: mutationHeaders() },
      )
    ).status(),
  ).toBe(201);
  expect(
    (
      await otherCouple.api.get(
        `/api/v1/documents/${receipt.id}?workspaceId=${otherWorkspaceId}`,
      )
    ).status(),
  ).toBe(404);
});

test("Slice 6 E2E 5 — Vendor portfolio", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await completeUpload(
    vendorA.api,
    { vendorOrganizationId: organizationA },
    {
      purpose: "VENDOR_PORTFOLIO_IMAGE",
      bytes: png,
      contentType: "image/png",
      fileName: "portfolio-e2e.png",
    },
  );
  await expect
    .poll(
      async () => {
        const assets = await apiData<{ items: Resource[] }>(
          await vendorA.api.get(
            `/api/v1/vendor-organizations/${organizationA}/portfolio-assets`,
          ),
        );
        portfolioAsset = assets.items.find(
          (item) => item.title === "portfolio-e2e",
        )!;
        return portfolioAsset?.sourceStatus;
      },
      { timeout: 60_000 },
    )
    .toBe("AVAILABLE");
  portfolioAsset = await apiData<Resource>(
    await vendorA.api.patch(
      `/api/v1/vendor-organizations/${organizationA}/portfolio-assets/${portfolioAsset.id}`,
      {
        headers: mutationHeaders({ "If-Match": `"${portfolioAsset.version}"` }),
        data: { published: true, altText: "Portofoliu WeddingOS E2E" },
      },
    ),
  );
  const publicAsset = await couple.api.get(String(portfolioAsset.url));
  expect(publicAsset.status()).toBe(200);
  expect(publicAsset.headers()["content-type"]).toContain("image/webp");
  const marketplace = await apiData<{ portfolio: Resource[] }>(
    await couple.api.get(`/api/v1/marketplace/vendors/${vendorASlug}`),
  );
  expect(
    marketplace.portfolio.some(
      (item) => item.artifactId === portfolioAsset.artifactId,
    ),
  ).toBe(true);
  expect(JSON.stringify(marketplace.portfolio)).not.toContain("objectKey");
});

test("Slice 6 E2E 6 — Contract materialization", async () => {
  contract = await contractDetail(couple.api, workspaceId, contract.id);
  const currentVersion = contract.currentVersion as Resource;
  contractMaterialization = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/documents/materializations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `materialize-${crypto.randomUUID()}`,
        }),
        data: { contractVersionId: currentVersion.id },
      },
    ),
  );
  expect(String(contractMaterialization.documentContentHash)).toMatch(
    /^[a-f0-9]{64}$/,
  );
  const replay = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/documents/materializations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `materialize-replay-${crypto.randomUUID()}`,
        }),
        data: { contractVersionId: currentVersion.id },
      },
    ),
  );
  expect(replay.id).toBe(contractMaterialization.id);
  expect(replay.documentContentHash).toBe(
    contractMaterialization.documentContentHash,
  );
});

test("Slice 6 E2E 7 — Signature envelope", async () => {
  contract = await contractDetail(couple.api, workspaceId, contract.id);
  const currentVersion = contract.currentVersion as Resource;
  const candidates = await apiData<{ wedding: Resource[]; vendor: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/signer-candidates?contractVersionId=${currentVersion.id}`,
    ),
  );
  signatureEnvelope = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/signature-envelopes`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `signature-${crypto.randomUUID()}`,
        }),
        data: {
          contractVersionId: currentVersion.id,
          weddingSignerMembershipId: candidates.wedding[0]!.membershipId,
          vendorSignerMembershipId: candidates.vendor.find(
            (item) => item.userId === vendorA.userId,
          )!.membershipId,
        },
      },
    ),
  );
  signatureEnvelope = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${signatureEnvelope.id}/send`,
      {
        headers: mutationHeaders({
          "If-Match": `"${signatureEnvelope.version}"`,
          "Idempotency-Key": `signature-send-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  let detail = await apiData<Resource & { signers: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${signatureEnvelope.id}`,
    ),
  );
  const weddingSigner = detail.signers.find(
    (item) => item.partyType === "WEDDING",
  )!;
  const vendorSigner = detail.signers.find(
    (item) => item.partyType === "VENDOR",
  )!;
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${signatureEnvelope.id}/fake-actions`,
      {
        headers: mutationHeaders(),
        data: { signerId: weddingSigner.id, action: "SIGN" },
      },
    ),
  );
  await apiData(
    await vendorA.api.post(
      `/api/v1/signature-signing-sessions/${signatureEnvelope.id}/fake-actions`,
      {
        headers: mutationHeaders(),
        data: { signerId: vendorSigner.id, action: "SIGN" },
      },
    ),
  );
  detail = await apiData<Resource & { signers: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${signatureEnvelope.id}`,
    ),
  );
  expect(detail.status).toBe("COMPLETED");
  expect(
    (
      await couple.api.get(
        `/api/v1/workspaces/${workspaceId}/signature-envelopes/${signatureEnvelope.id}/evidence`,
      )
    ).status(),
  ).toBe(200);
});

test("Slice 6 E2E 8 — Signature decline", async () => {
  contract = await contractDetail(couple.api, workspaceId, contract.id);
  const signedAt = contract.electronicallySignedAt;
  const currentVersion = contract.currentVersion as Resource;
  const candidates = await apiData<{ wedding: Resource[]; vendor: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/signer-candidates?contractVersionId=${currentVersion.id}`,
    ),
  );
  declinedEnvelope = await createAndSendEnvelope(currentVersion.id, candidates);
  const detail = await apiData<Resource & { signers: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${declinedEnvelope.id}`,
    ),
  );
  const vendorSigner = detail.signers.find(
    (item) => item.partyType === "VENDOR",
  )!;
  declinedEnvelope = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/signature-signing-sessions/${declinedEnvelope.id}/fake-actions`,
      {
        headers: mutationHeaders(),
        data: {
          signerId: vendorSigner.id,
          action: "DECLINE",
          reason: "Decline E2E",
        },
      },
    ),
  );
  expect(declinedEnvelope.status).toBe("DECLINED");
  expect(
    (await contractDetail(couple.api, workspaceId, contract.id))
      .electronicallySignedAt,
  ).toBe(signedAt);
});

test("Slice 6 E2E 9 — Signature stale version", async () => {
  contract = await contractDetail(couple.api, workspaceId, contract.id);
  const currentVersion = contract.currentVersion as Resource;
  const candidates = await apiData<{ wedding: Resource[]; vendor: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/signer-candidates?contractVersionId=${currentVersion.id}`,
    ),
  );
  staleEnvelope = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/signature-envelopes`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `signature-stale-${crypto.randomUUID()}`,
        }),
        data: {
          contractVersionId: currentVersion.id,
          weddingSignerMembershipId: candidates.wedding[0]!.membershipId,
          vendorSignerMembershipId: candidates.vendor[0]!.membershipId,
        },
      },
    ),
  );
  const staleSend = await couple.api.post(
    `/api/v1/workspaces/${workspaceId}/signature-envelopes/${staleEnvelope.id}/send`,
    {
      headers: mutationHeaders({
        "If-Match": `"${staleEnvelope.version + 1}"`,
        "Idempotency-Key": `signature-stale-send-${crypto.randomUUID()}`,
      }),
    },
  );
  expect(staleSend.status()).toBe(412);
  const current = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${staleEnvelope.id}`,
    ),
  );
  expect(current.status).toBe("READY");
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${staleEnvelope.id}/cancel`,
      {
        headers: mutationHeaders({ "If-Match": `"${current.version}"` }),
        data: { reason: "Cleanup stale E2E" },
      },
    ),
  );
});

test("Slice 6 E2E 10 — Signature isolation", async () => {
  expect(
    (
      await otherCouple.api.get(
        `/api/v1/workspaces/${otherWorkspaceId}/signature-envelopes/${signatureEnvelope.id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await vendorB.api.post(
        `/api/v1/signature-signing-sessions/${signatureEnvelope.id}`,
        { headers: mutationHeaders() },
      )
    ).status(),
  ).toBe(403);
});

// Sarbato intentionally grants VENDOR_PAYMENTS to no subscription plan.
// These provider-lifecycle scenarios remain documented, but are not part of
// the active browser contract while payment intermediation is disabled.
test("[inactive-vendor-payments] Slice 6 E2E 11 — Online checkout", async () => {
  onlineSchedule = (await createOnlineSchedule("Online payment E2E", 80_000))
    .schedule;
  onlineCheckout = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `checkout-${crypto.randomUUID()}`,
        }),
        data: {
          paymentScheduleEntryId: onlineSchedule.id,
          amountMode: "FULL_OUTSTANDING",
          successReturnPath: "/payments?checkout=success",
          cancelReturnPath: "/payments?checkout=cancelled",
        },
      },
    ),
  );
  expect(onlineCheckout.status).toBe("OPEN");
  expect(String(onlineCheckout.hostedUrl)).toContain(
    `/provider/checkout/${onlineCheckout.id}`,
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${onlineCheckout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "CAPTURE" } },
    ),
  );
  const transactions = await apiData<Resource[]>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions`,
    ),
  );
  onlineTransaction = transactions.find(
    (item) => item.checkoutId === onlineCheckout.id,
  )!;
  expect(onlineTransaction.status).toBe("CAPTURED");
  const ledger = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/payments`),
  );
  expect(
    ledger.items.some(
      (item) =>
        item.sourceType === "ONLINE_PAYMENT" &&
        item.sourceId === onlineTransaction.id,
    ),
  ).toBe(true);
});

test("[inactive-vendor-payments] Slice 6 E2E 12 — Payment replay", async () => {
  const before = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/payments`),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${onlineCheckout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "CAPTURE" } },
    ),
  );
  const after = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/payments`),
  );
  expect(
    after.items.filter(
      (item) =>
        item.sourceType === "ONLINE_PAYMENT" &&
        item.sourceId === onlineTransaction.id,
    ),
  ).toHaveLength(1);
  expect(after.items.length).toBe(before.items.length);
});

test("[inactive-vendor-payments] Slice 6 E2E 13 — Payment failure", async () => {
  const failed = await createOnlineSchedule("Failed payment E2E", 30_000);
  const before = await currentBudget();
  failedCheckout = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `checkout-fail-${crypto.randomUUID()}`,
        }),
        data: {
          paymentScheduleEntryId: failed.schedule.id,
          amountMode: "FULL_OUTSTANDING",
        },
      },
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${failedCheckout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "FAIL" } },
    ),
  );
  const after = await currentBudget();
  expect(after.summary.paidMinor).toBe(before.summary.paidMinor);
  const retry = await couple.api.post(
    `/api/v1/workspaces/${workspaceId}/payment-checkouts`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `checkout-retry-${crypto.randomUUID()}`,
      }),
      data: {
        paymentScheduleEntryId: failed.schedule.id,
        amountMode: "FULL_OUTSTANDING",
      },
    },
  );
  expect(retry.status()).toBe(201);
});

test("[inactive-vendor-payments] Slice 6 E2E 14 — Partial refund", async () => {
  const idempotencyKey = `refund-partial-${crypto.randomUUID()}`;
  const transactionVersion = onlineTransaction.version;
  partialRefund = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${onlineTransaction.id}/refunds`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(transactionVersion),
        }),
        data: { amountMinor: 20_000, reason: "Partial refund E2E" },
      },
    ),
  );
  expect(partialRefund.status).toBe("SUCCEEDED");
  onlineTransaction = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${onlineTransaction.id}`,
    ),
  );
  expect(onlineTransaction.status).toBe("PARTIALLY_REFUNDED");
  expect(Number(onlineTransaction.amountRefundedMinor)).toBe(20_000);
  const replay = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${onlineTransaction.id}/refunds`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": idempotencyKey,
          "If-Match": String(transactionVersion),
        }),
        data: { amountMinor: 20_000, reason: "Partial refund E2E" },
      },
    ),
  );
  expect(replay.id).toBe(partialRefund.id);
  expect(replay.replayed).toBe(true);
});

test("[inactive-vendor-payments] Slice 6 E2E 15 — Full refund", async () => {
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${onlineTransaction.id}/refunds`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `refund-full-${crypto.randomUUID()}`,
          "If-Match": String(onlineTransaction.version),
        }),
        data: { amountMinor: 60_000, reason: "Full refund E2E" },
      },
    ),
  );
  onlineTransaction = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${onlineTransaction.id}`,
    ),
  );
  expect(onlineTransaction.status).toBe("REFUNDED");
  const ledger = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/workspaces/${workspaceId}/payments`),
  );
  expect(
    ledger.items.some(
      (item) =>
        item.sourceType === "ONLINE_PAYMENT" &&
        item.sourceId === onlineTransaction.id &&
        item.status === "CONFIRMED",
    ),
  ).toBe(true);
  expect(
    ledger.items.filter((item) => item.sourceType === "ONLINE_REFUND").length,
  ).toBeGreaterThanOrEqual(2);
});

test("[inactive-vendor-payments] Slice 6 E2E 16 — Over-refund", async () => {
  const extra = await createOnlineSchedule("Over refund E2E", 20_000);
  const checkout = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `checkout-over-${crypto.randomUUID()}`,
        }),
        data: {
          paymentScheduleEntryId: extra.schedule.id,
          amountMode: "FULL_OUTSTANDING",
        },
      },
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${checkout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "CAPTURE" } },
    ),
  );
  const transactions = await apiData<Resource[]>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions`,
    ),
  );
  const transaction = transactions.find(
    (item) => item.checkoutId === checkout.id,
  )!;
  const response = await couple.api.post(
    `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${transaction.id}/refunds`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `refund-over-${crypto.randomUUID()}`,
        "If-Match": String(transaction.version),
      }),
      data: { amountMinor: 30_000, reason: "Over refund E2E" },
    },
  );
  expect(response.status()).toBe(422);
  expect((await response.json()).code).toBe("REFUND_EXCEEDS_CAPTURED");
});

test("[inactive-vendor-payments] Slice 6 E2E 17 — Payment webhook security", async () => {
  const before = await apiData<Resource[]>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions`,
    ),
  );
  const response = await couple.api.post("/api/v1/webhooks/payments/fake", {
    headers: mutationHeaders({
      "x-provider-signature": "sha256=invalid",
      "x-provider-timestamp": String(Math.floor(Date.now() / 1000)),
    }),
    data: {
      id: `invalid-${crypto.randomUUID()}`,
      type: "payment.captured",
      occurredAt: new Date().toISOString(),
      data: {
        providerCheckoutId: "forged",
        providerPaymentId: "forged",
        amountMinor: 999,
      },
    },
  });
  expect(response.status()).toBe(401);
  const after = await apiData<Resource[]>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions`,
    ),
  );
  expect(after).toHaveLength(before.length);
});

test("[inactive-vendor-payments] Slice 6 E2E 18 — Payment tenant isolation", async () => {
  expect(
    (
      await otherCouple.api.get(
        `/api/v1/workspaces/${otherWorkspaceId}/payment-checkouts/${onlineCheckout.id}`,
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await otherCouple.api.post(
        `/api/v1/workspaces/${otherWorkspaceId}/online-payment-transactions/${onlineTransaction.id}/refunds`,
        {
          headers: mutationHeaders({
            "Idempotency-Key": `isolated-refund-${crypto.randomUUID()}`,
            "If-Match": "1",
          }),
          data: { amountMinor: 1, reason: "Isolation E2E" },
        },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await vendorA.api.get(
        `/api/v1/documents/${quarantinedDocument.id}?vendorOrganizationId=${organizationA}`,
      )
    ).status(),
  ).toBe(404);
});

test("[inactive-vendor-payments] Slice 6 E2E 19 — Overview", async ({
  page,
}) => {
  const dashboard = await apiData<{
    documents: Record<string, number>;
    onlinePayments: Record<string, number | string>;
    nextBestAction: Record<string, unknown>;
  }>(await couple.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`));
  expect(dashboard.documents.quarantined).toBeGreaterThanOrEqual(1);
  expect(dashboard.documents.signatureEnvelopesFailed).toBeGreaterThanOrEqual(
    1,
  );
  expect(dashboard.onlinePayments.failedPayments).toBeGreaterThanOrEqual(1);
  expect(dashboard.nextBestAction.type).toBe("document_quarantined");
  await authorizePage(page, couple);
  await page.goto("/overview");
  await expect(page.getByText("Documente și plăți online")).toBeVisible();
});

test("Slice 6 E2E 20 — Demo isolation", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/") && request.method() !== "GET")
      mutations.push(request.url());
  });
  await page
    .context()
    .addCookies([
      { name: "weddingos_demo", value: "1", url: origin, sameSite: "Lax" },
    ]);
  await page.goto("/documents?demo=1");
  await expect(page.getByText("Niciun document găsit")).toBeVisible();
  await page.goto("/contracts?demo=1");
  await expect(page.locator("main")).toBeVisible();
  await page.goto("/payments?demo=1");
  await expect(page.getByText("Bugetul nu are poziții")).toBeVisible();
  expect(mutations).toEqual([]);
});

async function completeUpload(
  api: APIRequestContext,
  owner: { workspaceId?: string; vendorOrganizationId?: string },
  input: {
    purpose: string;
    bytes: Buffer;
    contentType: string;
    fileName: string;
  },
) {
  const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
  const session = await apiData<
    Resource & { upload: { url: string; headers: Record<string, string> } }
  >(
    await api.post("/api/v1/uploads", {
      headers: mutationHeaders({
        "Idempotency-Key": `upload-${crypto.randomUUID()}`,
      }),
      data: {
        ...owner,
        purpose: input.purpose,
        originalFileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.bytes.byteLength,
        checksumSha256,
      },
    }),
  );
  const put = await api.put(session.upload.url, {
    headers: session.upload.headers,
    data: input.bytes,
  });
  expect(put.ok(), `Object storage upload failed with ${put.status()}`).toBe(
    true,
  );
  await apiData(
    await api.post(`/api/v1/uploads/${session.id}/complete`, {
      headers: mutationHeaders(),
      data: { checksumSha256 },
    }),
  );
  return session;
}

async function uploadVaultDocument(
  api: APIRequestContext,
  owner: { workspaceId?: string; vendorOrganizationId?: string },
  input: {
    purpose: string;
    bytes: Buffer;
    contentType: string;
    fileName: string;
    title: string;
    documentType: string;
    classification: string;
    resourceType?: string;
    resourceId?: string;
  },
) {
  const session = await completeUpload(api, owner, input);
  return apiData<Resource>(
    await api.post("/api/v1/documents", {
      headers: mutationHeaders({
        "Idempotency-Key": `document-${crypto.randomUUID()}`,
      }),
      data: {
        ...owner,
        uploadSessionId: session.id,
        title: input.title,
        documentType: input.documentType,
        classification: input.classification,
        ...(input.resourceType
          ? { resourceType: input.resourceType, resourceId: input.resourceId }
          : {}),
      },
    }),
  );
}

async function waitForDocument(
  api: APIRequestContext,
  owner: { workspaceId?: string; vendorOrganizationId?: string },
  documentId: string,
  status: string,
) {
  const query = owner.workspaceId
    ? `workspaceId=${owner.workspaceId}`
    : `vendorOrganizationId=${owner.vendorOrganizationId}`;
  let document!: Resource;
  await expect
    .poll(
      async () => {
        const response = await api.get(
          `/api/v1/documents/${documentId}?${query}`,
        );
        if (!response.ok()) return `HTTP_${response.status()}`;
        document = await apiData<Resource>(response);
        return document.status;
      },
      { timeout: 60_000 },
    )
    .toBe(status);
  return document;
}

async function createAndSendEnvelope(
  contractVersionId: string,
  candidates: { wedding: Resource[]; vendor: Resource[] },
) {
  let envelope = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/contracts/${contract.id}/signature-envelopes`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `signature-${crypto.randomUUID()}`,
        }),
        data: {
          contractVersionId,
          weddingSignerMembershipId: candidates.wedding[0]!.membershipId,
          vendorSignerMembershipId: candidates.vendor.find(
            (item) => item.userId === vendorA.userId,
          )!.membershipId,
        },
      },
    ),
  );
  envelope = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/signature-envelopes/${envelope.id}/send`,
      {
        headers: mutationHeaders({
          "If-Match": `"${envelope.version}"`,
          "Idempotency-Key": `signature-send-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  return envelope;
}

async function createOnlineSchedule(name: string, amountMinor: number) {
  const budget = await currentBudget();
  const category = budget.categories[0]!;
  const item = await apiData<Resource>(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/budget/items`, {
      headers: mutationHeaders({
        "Idempotency-Key": `online-budget-${crypto.randomUUID()}`,
      }),
      data: {
        categoryId: category.id,
        name,
        estimatedMinor: amountMinor,
        committedMinor: amountMinor,
        vendorOrganizationId: organizationA,
      },
    }),
  );
  const scheduleRow = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-schedules`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `online-schedule-${crypto.randomUUID()}`,
        }),
        data: {
          budgetItemId: item.id,
          bookingId,
          contractId: contract.id,
          vendorOrganizationId: organizationA,
          name,
          amountMinor,
          currency: "RON",
          dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          sequence: Math.floor(Date.now() % 1_000_000) + 100,
        },
      },
    ),
  );
  return { item, schedule: scheduleRow };
}

async function transitionContract(
  api: APIRequestContext,
  prefix: string,
  value: Resource,
  transition: string,
  reason?: string,
) {
  return apiData<Resource>(
    await api.post(`${prefix}/contracts/${value.id}/transitions`, {
      headers: mutationHeaders({ "If-Match": `"${value.version}"` }),
      data: { transition, reason },
    }),
  );
}

async function acknowledge(
  api: APIRequestContext,
  prefix: string,
  value: Resource,
  typedName: string,
  contentHash: string,
) {
  return apiData<Resource>(
    await api.post(`${prefix}/contracts/${value.id}/acknowledgements`, {
      headers: mutationHeaders({
        "If-Match": `"${value.version}"`,
        "Idempotency-Key": `ack-${crypto.randomUUID()}`,
      }),
      data: {
        typedName,
        statementVersion: "weddingos-contract-ack-v1",
        contentHash,
      },
    }),
  );
}

async function transitionPayment(
  value: Resource,
  transition: string,
  reason: string,
) {
  return apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payments/${value.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${value.version}"` }),
        data: { transition, reason },
      },
    ),
  );
}

function contractDraft(current: Record<string, unknown>, summary: string) {
  return {
    document: current.document,
    summary,
    cancellationTerms: current.cancellationTerms,
    paymentTerms: current.paymentTerms,
    serviceScope: current.serviceScope,
  };
}

async function contractDetail(
  api: APIRequestContext,
  workspace: string,
  contractId: string,
) {
  return apiData<Resource>(
    await api.get(`/api/v1/workspaces/${workspace}/contracts/${contractId}`),
  );
}

async function currentBudget() {
  return apiData<{
    plan: Resource | null;
    categories: Resource[];
    items: Resource[];
    summary: Record<string, unknown>;
  }>(await couple.api.get(`/api/v1/workspaces/${workspaceId}/budget`));
}

function paymentPayload(
  paymentSchedule: Resource,
  item: Resource,
  amountMinor: number,
  reference: string,
) {
  return {
    paymentScheduleEntryId: paymentSchedule.id,
    budgetItemId: item.id,
    bookingId,
    contractId: contract.id,
    vendorOrganizationId: organizationA,
    amountMinor,
    paidAt: new Date().toISOString(),
    method: "BANK_TRANSFER",
    reference,
    notesPrivate: "Evidență externă E2E; WeddingOS nu procesează bani.",
  };
}

function vendorOrganization(name: string, email: string) {
  return {
    legalName: `${name} SRL`,
    displayName: name,
    country: "Moldova",
    registrationNumber: `REG-${Date.now()}`,
    taxId: `TAX-${Date.now()}`,
    billingEmail: email,
    contactEmail: email,
    contactPhone: "+37360000000",
    websiteUrl: "https://example.test/vendor",
  };
}

function vendorProfile(slug: string, headline: string) {
  return {
    slug,
    headline,
    description:
      "Servicii foto documentare pentru nunți, cu ofertare structurată și livrare clară.",
    shortDescription: "Fotografie documentară pentru nunți.",
    categories: ["PHOTOGRAPHY"],
    languages: ["ro", "en"],
    pricingVisibility: "STARTING_FROM",
    startingPriceMinor: 125_000,
    currency: "RON",
    responseTimeLabel: "Răspuns în 24 de ore",
  };
}

function vendorService(name: string) {
  return {
    category: "PHOTOGRAPHY",
    name,
    description: "Acoperire completă a zilei nunții.",
    pricingModel: "FIXED",
    startingPriceMinor: 125_000,
    currency: "RON",
    active: true,
  };
}

function rfqPayload() {
  return {
    title: "Fotografie nuntă E2E",
    category: "PHOTOGRAPHY",
    description: "Dorim acoperire documentară completă pentru nuntă.",
    eventDate: "2027-09-12",
    guestCount: 120,
    locationSnapshot: { city: "Chișinău" },
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
}

function offerPayload(amountMinor: number, questionId: string) {
  return {
    currency: "RON",
    lineItems: [
      {
        type: "SERVICE",
        name: "Documentar complet",
        description: "Acoperire 12 ore",
        quantity: 1,
        unit: "FIXED",
        unitPriceMinor: amountMinor,
        optional: false,
        selected: true,
        position: 0,
      },
      {
        type: "OPTIONAL",
        name: "Album tipărit",
        description: "Album premium opțional",
        quantity: 1,
        unit: "ITEM",
        unitPriceMinor: 20_000,
        optional: true,
        selected: false,
        position: 1,
      },
    ],
    answers: [{ questionId, value: "45 de zile" }],
    discountMinor: 0,
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
    deliveryTimeline: "Galeria în 45 de zile.",
    cancellationTerms: "Avans nerambursabil după confirmare.",
    validUntil: "2027-08-01T10:00:00.000Z",
  };
}

async function waitForJob(api: APIRequestContext, jobId: string) {
  let value: { status: string } = { status: "queued" };
  await expect
    .poll(
      async () => {
        value = await apiData(await api.get(`/api/v1/jobs/${jobId}`));
        return value.status;
      },
      { timeout: 60_000 },
    )
    .toBe("completed");
  return value;
}

async function waitForVendorInvitationToken(email: string) {
  await expect
    .poll(
      async () => {
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
          const match = message.Text.match(
            /vendor-invitation\?token=([^&\s]+)/,
          );
          if (match?.[1]) return decodeURIComponent(match[1]);
        }
        return "";
      },
      { timeout: 60_000 },
    )
    .not.toBe("");
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
  throw new Error(`Vendor invitation email not delivered to ${email}`);
}

async function authorizePage(page: Page, account: Account) {
  const state = await account.api.storageState();
  await page.context().addCookies(state.cookies);
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registered = await apiData<{ userId: string }>(
    await api.post("/api/v1/auth/registrations", {
      headers: mutationHeaders(),
      data: {
        firstName: "E2E",
        lastName: label,
        email,
        password,
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      },
    }),
  );
  const token = await waitForVerificationToken(email);
  expect(
    (
      await api.post("/api/v1/auth/email-verifications", {
        headers: mutationHeaders(),
        data: { token },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api.post("/api/v1/auth/sessions", {
        headers: mutationHeaders(),
        data: { email, password, remember: true },
      })
    ).status(),
  ).toBe(200);
  return { email, userId: registered.userId, api };
}

async function createWorkspace(api: APIRequestContext, title: string) {
  const workspace = await apiData<{ id: string }>(
    await api.post("/api/v1/workspaces", {
      headers: mutationHeaders({
        "Idempotency-Key": `workspace-${crypto.randomUUID()}`,
      }),
      data: {
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Chișinău",
        timezone: "Europe/Chisinau",
      },
    }),
  );
  const account = api === couple.api ? couple : otherCouple;
  await ownerDatabase.workspaceSubscription.upsert({
    where: { workspaceId: workspace.id },
    update: { planKey: "PRO", status: "ACTIVE", updatedById: account.userId },
    create: {
      workspaceId: workspace.id,
      planKey: "PRO",
      status: "ACTIVE",
      createdById: account.userId,
      updatedById: account.userId,
    },
  });
  return workspace.id;
}

async function waitForVerificationToken(email: string) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    const summary = list.messages.find(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Verification e-mail missing for ${email}`);
}

async function newApiContext() {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  contexts.push(context);
  return context;
}

async function apiData<T>(response: {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
}): Promise<T> {
  const body = (await response.json()) as {
    data?: T;
    code?: string;
    detail?: string;
  };
  expect(
    response.ok(),
    `${response.status()} ${body.code ?? ""} ${body.detail ?? ""}`,
  ).toBe(true);
  return body.data as T;
}

function mutationHeaders(extra: Record<string, string> = {}) {
  return { Origin: origin, ...extra };
}

test("Slice 7 E2E 1 — Completed booking creates one verified eligibility", async () => {
  let booking = await apiData<Resource>(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/bookings/${bookingId}`,
    ),
  );
  booking = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/bookings/${bookingId}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${booking.version}"` }),
        data: { transition: "START" },
      },
    ),
  );
  booking = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/bookings/${bookingId}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${booking.version}"` }),
        data: { transition: "COMPLETE" },
      },
    ),
  );
  expect(booking.status).toBe("COMPLETED");
  const first = await apiData<{ items: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/review-eligibilities`,
    ),
  );
  const replay = await apiData<{ items: Resource[] }>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/review-eligibilities`,
    ),
  );
  reviewEligibility = first.items.find((item) => item.bookingId === bookingId)!;
  expect(reviewEligibility).toMatchObject({
    vendorOrganizationId: organizationA,
    status: "ELIGIBLE",
    eligibilityType: "COMPLETED_BOOKING",
  });
  expect(
    replay.items.filter((item) => item.bookingId === bookingId),
  ).toHaveLength(1);
});

test("Slice 7 E2E 2 — Ineligible and malformed reviews are rejected", async () => {
  const malformed = await couple.api.post(
    `/api/v1/workspaces/${workspaceId}/reviews`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `review-invalid-${crypto.randomUUID()}`,
      }),
      data: {
        eligibilityId: reviewEligibility.id,
        title: "Invalid",
        body: "Prea scurt",
        overallRating: 5,
        criteria: { QUALITY: 5 },
        authenticityConfirmed: true,
      },
    },
  );
  expect(malformed.status()).toBe(422);
  const forged = await otherCouple.api.post(
    `/api/v1/workspaces/${otherWorkspaceId}/reviews`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `review-forged-${crypto.randomUUID()}`,
      }),
      data: reviewPayload(reviewEligibility.id),
    },
  );
  expect(forged.status()).toBe(409);
});

test("Slice 7 E2E 3 — Review draft creation is idempotent", async () => {
  const key = `review-create-${crypto.randomUUID()}`;
  verifiedReview = await apiData<Resource>(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/reviews`, {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: reviewPayload(reviewEligibility.id),
    }),
  );
  const replay = await apiData<Resource>(
    await couple.api.post(`/api/v1/workspaces/${workspaceId}/reviews`, {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: reviewPayload(reviewEligibility.id),
    }),
  );
  expect(verifiedReview.status).toBe("DRAFT");
  expect(replay.id).toBe(verifiedReview.id);
  expect(Array.isArray(verifiedReview.criteria)).toBe(true);
});

test("Slice 7 E2E 4 — Review edits preserve immutable history and reject stale writes", async () => {
  const staleVersion = verifiedReview.version;
  verifiedReview = await apiData<Resource>(
    await couple.api.patch(
      `/api/v1/workspaces/${workspaceId}/reviews/${verifiedReview.id}/draft`,
      {
        headers: mutationHeaders({ "If-Match": `"${staleVersion}"` }),
        data: {
          title: "Experiență excelentă, documentată",
          body: "Comunicarea a fost clară, iar serviciul final a respectat toate promisiunile stabilite.",
        },
      },
    ),
  );
  const stale = await couple.api.patch(
    `/api/v1/workspaces/${workspaceId}/reviews/${verifiedReview.id}/draft`,
    {
      headers: mutationHeaders({ "If-Match": `"${staleVersion}"` }),
      data: { title: "Suprascriere stale" },
    },
  );
  expect(stale.status()).toBe(412);
  expect((verifiedReview.versions as Resource[]).length).toBe(2);
});

test("Slice 7 E2E 5 — Submit, publish and retry keep one public review", async () => {
  verifiedReview = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/reviews/${verifiedReview.id}/submit`,
      {
        headers: mutationHeaders({
          "If-Match": `"${verifiedReview.version}"`,
        }),
      },
    ),
  );
  expect(verifiedReview.status).toBe("SUBMITTED");
  const publishVersion = verifiedReview.version;
  const key = `review-publish-${crypto.randomUUID()}`;
  verifiedReview = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/reviews/${verifiedReview.id}/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${publishVersion}"`,
          "Idempotency-Key": key,
        }),
        data: { authenticityConfirmed: true },
      },
    ),
  );
  const replay = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/reviews/${verifiedReview.id}/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${publishVersion}"`,
          "Idempotency-Key": key,
        }),
        data: { authenticityConfirmed: true },
      },
    ),
  );
  expect(verifiedReview).toMatchObject({
    status: "PUBLISHED",
    verificationStatus: "VERIFIED_BOOKING",
  });
  expect(replay.id).toBe(verifiedReview.id);
  expect(
    await ownerDatabase.vendorReview.count({
      where: { eligibilityId: reviewEligibility.id },
    }),
  ).toBe(1);
});

test("Slice 7 E2E 6 — Public rating aggregate uses only published verified data", async () => {
  const reviews = await apiData<{ items: Resource[]; summary: Resource }>(
    await couple.api.get(`/api/v1/marketplace/vendors/${vendorASlug}/reviews`),
  );
  const summary = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/marketplace/vendors/${vendorASlug}/rating-summary`,
    ),
  );
  expect(reviews.items).toHaveLength(1);
  expect(reviews.items[0]).toMatchObject({
    verified: true,
    publicDisplayName: "Cuplu E2E verificat",
  });
  expect(reviews.items[0]).not.toHaveProperty("authorUserId");
  expect(summary).toMatchObject({
    publishedReviewCount: 1,
    verifiedReviewCount: 1,
    overallAverageScaled: 500,
    rating5Count: 1,
  });
});

test("Slice 7 E2E 7 — Review tenant isolation blocks cross-workspace reads", async () => {
  const response = await otherCouple.api.get(
    `/api/v1/workspaces/${otherWorkspaceId}/reviews/${verifiedReview.id}`,
  );
  expect(response.status()).toBe(404);
});

test("Slice 7 E2E 8 — Vendor reply publish is real and replay-safe", async () => {
  const listed = await apiData<{ items: Resource[] }>(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/reviews`,
    ),
  );
  expect(listed.items.some((item) => item.id === verifiedReview.id)).toBe(true);
  reviewReply = await apiData<Resource>(
    await vendorA.api.put(
      `/api/v1/vendor-organizations/${organizationA}/reviews/${verifiedReview.id}/reply`,
      {
        headers: mutationHeaders(),
        data: {
          body: "Vă mulțumim pentru încredere și pentru feedbackul verificat!",
        },
      },
    ),
  );
  const key = `reply-publish-${crypto.randomUUID()}`;
  const replyVersion = reviewReply.version;
  reviewReply = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/reviews/${verifiedReview.id}/reply/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${replyVersion}"`,
          "Idempotency-Key": key,
        }),
      },
    ),
  );
  const replay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/reviews/${verifiedReview.id}/reply/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${replyVersion}"`,
          "Idempotency-Key": key,
        }),
      },
    ),
  );
  expect(reviewReply.status).toBe("PUBLISHED");
  expect(replay.id).toBe(reviewReply.id);
});

test("Slice 7 E2E 9 — Vendor dispute is private and unique", async () => {
  const key = `review-dispute-${crypto.randomUUID()}`;
  const first = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/reviews/${verifiedReview.id}/disputes`,
      {
        headers: mutationHeaders({
          "If-Match": `"${verifiedReview.version}"`,
          "Idempotency-Key": key,
        }),
        data: {
          reason: "Solicităm verificarea unei afirmații factuale.",
          statementPrivate:
            "Dovezile rezervării și conversația privată sunt disponibile moderatorului.",
        },
      },
    ),
  );
  const replay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/reviews/${verifiedReview.id}/disputes`,
      {
        headers: mutationHeaders({
          "If-Match": `"${verifiedReview.version - 1}"`,
          "Idempotency-Key": key,
        }),
        data: {
          reason: "Solicităm verificarea unei afirmații factuale.",
          statementPrivate:
            "Dovezile rezervării și conversația privată sunt disponibile moderatorului.",
        },
      },
    ),
  );
  expect(replay.id).toBe(first.id);
  const publicReview = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/marketplace/vendors/${vendorASlug}/reviews`),
  );
  expect(publicReview.items[0]).not.toHaveProperty("statementPrivate");
});

test("Slice 7 E2E 10 — Report creates moderation work without false public mutation", async () => {
  const reported = await apiData<{
    report: Resource;
    moderationCaseId: string;
  }>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/reviews/${verifiedReview.id}/reports`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `review-report-${crypto.randomUUID()}`,
        }),
        data: {
          reason: "PRIVATE_INFORMATION",
          details:
            "Moderatorul trebuie să verifice dacă textul expune date private.",
        },
      },
    ),
  );
  reviewModerationCaseId = reported.moderationCaseId;
  expect(reported.report.reason).toBe("PRIVATE_INFORMATION");
  expect(reviewModerationCaseId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const publicReview = await apiData<{ items: Resource[] }>(
    await couple.api.get(`/api/v1/marketplace/vendors/${vendorASlug}/reviews`),
  );
  expect(publicReview.items).toHaveLength(1);
});

test("Slice 7 E2E 11 — Platform operations require persisted grants", async () => {
  const denied = await vendorA.api.get("/api/v1/platform/review-moderation");
  expect(denied.status()).toBe(403);
  const capabilities = [
    "platform.review_moderate",
    "platform.review_view_private",
    "platform.review_decide",
    "platform.subscription.read",
    "platform.subscription.write_plans",
    "platform.subscription.manage",
    "platform.subscription.reconcile",
    "platform.settlement.read",
    "platform.settlement.calculate",
    "platform.settlement.finalize",
    "platform.payout.create",
    "platform.payout.reconcile",
    "platform.payout.view_provider_details",
  ];
  for (const capability of capabilities) {
    await ownerDatabase.platformCapabilityGrant.upsert({
      where: {
        userId_capability: { userId: vendorA.userId, capability },
      },
      create: {
        userId: vendorA.userId,
        capability,
        grantedById: vendorA.userId,
      },
      update: { active: true, revokedAt: null },
    });
  }
  const queue = await apiData<{ items: Resource[] }>(
    await vendorA.api.get("/api/v1/platform/review-moderation"),
  );
  expect(queue.items.some((item) => item.id === reviewModerationCaseId)).toBe(
    true,
  );
});

test("Slice 7 E2E 12 — Moderation decision is auditable and idempotent", async () => {
  const moderation = await apiData<Resource>(
    await vendorA.api.get(
      `/api/v1/platform/review-moderation/${reviewModerationCaseId}`,
    ),
  );
  const key = `moderation-${crypto.randomUUID()}`;
  const decision = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/review-moderation/${reviewModerationCaseId}/decisions`,
      {
        headers: mutationHeaders({
          "If-Match": `"${moderation.version}"`,
          "Idempotency-Key": key,
        }),
        data: {
          decision: "NO_ACTION",
          reason: "Nu există date private în conținutul public verificat.",
        },
      },
    ),
  );
  const replay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/review-moderation/${reviewModerationCaseId}/decisions`,
      {
        headers: mutationHeaders({
          "If-Match": `"${moderation.version}"`,
          "Idempotency-Key": key,
        }),
        data: {
          decision: "NO_ACTION",
          reason: "Nu există date private în conținutul public verificat.",
        },
      },
    ),
  );
  expect(replay.id).toBe(decision.id);
  expect(
    await ownerDatabase.vendorReviewModerationDecision.count({
      where: { caseId: reviewModerationCaseId },
    }),
  ).toBe(1);
});

test("Slice 7 E2E 13 — FREE subscription and entitlement snapshot are real", async () => {
  freeVendorOrganization = (
    await apiData<Resource>(
      await vendorB.api.post("/api/v1/vendor-organizations", {
        headers: mutationHeaders({
          "Idempotency-Key": `vendor-free-${crypto.randomUUID()}`,
        }),
        data: vendorOrganization(`Vendor Free ${suiteKey}`, vendorB.email),
      }),
    )
  ).id;
  vendorSubscription = await apiData<Resource>(
    await vendorB.api.get(
      `/api/v1/vendor-organizations/${freeVendorOrganization}/subscription`,
    ),
  );
  const entitlements = await apiData<Resource>(
    await vendorB.api.get(
      `/api/v1/vendor-organizations/${freeVendorOrganization}/entitlements`,
    ),
  );
  expect(vendorSubscription.status).toBe("ACTIVE");
  expect(entitlements.snapshot).toBeTruthy();
  expect(
    (entitlements.snapshot as Record<string, unknown>).entitlements,
  ).toBeTruthy();
});

test("Slice 7 E2E 14 — Subscription checkout is provider-backed and idempotent", async () => {
  const key = `subscription-checkout-${crypto.randomUUID()}`;
  const first = await apiData<{ checkout: Resource; subscription: Resource }>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/subscription-checkouts`,
      {
        headers: mutationHeaders({ "Idempotency-Key": key }),
        data: { planKey: "STARTER" },
      },
    ),
  );
  const replay = await apiData<{ checkout: Resource; subscription: Resource }>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/subscription-checkouts`,
      {
        headers: mutationHeaders({ "Idempotency-Key": key }),
        data: { planKey: "STARTER" },
      },
    ),
  );
  vendorSubscription = first.subscription;
  expect(first.checkout.status).toBe("COMPLETED");
  expect(String(first.checkout.hostedUrl)).toContain("/vendor/billing");
  expect(replay.checkout.id).toBe(first.checkout.id);
  expect(
    await ownerDatabase.subscriptionCheckout.count({
      where: { vendorOrganizationId: organizationA, idempotencyKey: key },
    }),
  ).toBe(1);
});

test("Slice 7 E2E 15 — Subscription cancel and resume are replay-safe", async () => {
  const cancelVersion = vendorSubscription.version;
  vendorSubscription = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/subscription/cancel`,
      {
        headers: mutationHeaders({
          "If-Match": `"${cancelVersion}"`,
          "Idempotency-Key": `subscription-cancel-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  expect(vendorSubscription.cancelAtPeriodEnd).toBe(true);
  const cancelReplay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/subscription/cancel`,
      {
        headers: mutationHeaders({
          "If-Match": `"${cancelVersion}"`,
          "Idempotency-Key": `subscription-cancel-replay-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  expect(cancelReplay.version).toBe(vendorSubscription.version);
  vendorSubscription = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/subscription/resume`,
      {
        headers: mutationHeaders({
          "If-Match": `"${vendorSubscription.version}"`,
          "Idempotency-Key": `subscription-resume-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  expect(vendorSubscription.cancelAtPeriodEnd).toBe(false);
});

test("Slice 7 E2E 16 — Subscription webhook validates signature and deduplicates", async () => {
  const event = {
    id: `sub-event-${crypto.randomUUID()}`,
    type: "invoice.paid",
    occurredAt: new Date().toISOString(),
    data: {
      customerId: vendorSubscription.providerCustomerId,
      subscriptionId: vendorSubscription.providerSubscriptionId,
    },
  };
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const invalid = await couple.api.post("/api/v1/webhooks/subscriptions/fake", {
    headers: {
      "Content-Type": "application/json",
      "x-weddingos-timestamp": timestamp,
      "x-weddingos-signature": "sha256=invalid",
    },
    data: rawBody,
  });
  expect(invalid.status()).toBe(401);
  const signature = createHmac("sha256", "weddingos-subscription-local-secret")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const headers = {
    "Content-Type": "application/json",
    "x-weddingos-timestamp": timestamp,
    "x-weddingos-signature": `sha256=${signature}`,
  };
  const accepted = await apiData<{ accepted: boolean; replay: boolean }>(
    await couple.api.post("/api/v1/webhooks/subscriptions/fake", {
      headers,
      data: rawBody,
    }),
  );
  const replay = await apiData<{ accepted: boolean; replay: boolean }>(
    await couple.api.post("/api/v1/webhooks/subscriptions/fake", {
      headers,
      data: rawBody,
    }),
  );
  expect(accepted).toEqual({ accepted: true, replay: false });
  expect(replay).toEqual({ accepted: true, replay: true });
});

test("[inactive-vendor-payments] Slice 7 E2E 17 — Connected payout onboarding is idempotent", async () => {
  vendorPayoutAccount = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/payout-account`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `payout-account-${crypto.randomUUID()}`,
        }),
        data: { country: "RO", currency: "RON" },
      },
    ),
  );
  const key = `payout-onboarding-${crypto.randomUUID()}`;
  const first = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/payout-onboarding-links`,
      { headers: mutationHeaders({ "Idempotency-Key": key }) },
    ),
  );
  const replay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/vendor-organizations/${organizationA}/payout-onboarding-links`,
      { headers: mutationHeaders({ "Idempotency-Key": key }) },
    ),
  );
  vendorPayoutAccount = first.account as Resource;
  expect(vendorPayoutAccount).toMatchObject({
    status: "ACTIVE",
    payoutsEnabled: true,
    detailsSubmitted: true,
  });
  expect(replay.id).toBe(first.id);
});

test("[inactive-vendor-payments] Slice 7 E2E 18 — Captured marketplace payment creates fee and payable ledger", async () => {
  const created = await createOnlineSchedule("Slice 7 payout E2E", 200_000);
  const checkout = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `slice7-checkout-${crypto.randomUUID()}`,
        }),
        data: {
          paymentScheduleEntryId: created.schedule.id,
          amountMode: "FULL_OUTSTANDING",
        },
      },
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${checkout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "CAPTURE" } },
    ),
  );
  const transactions = await apiData<Resource[]>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions`,
    ),
  );
  payoutTransaction = transactions.find(
    (item) => item.checkoutId === checkout.id,
  )!;
  await ownerDatabase.onlinePaymentTransaction.update({
    where: { id: payoutTransaction.id },
    data: { capturedAt: new Date(Date.now() - 8 * 86_400_000) },
  });
  const balance = await apiData<Record<string, number>>(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  const allocation =
    await ownerDatabase.marketplacePaymentAllocation.findUnique({
      where: { transactionId: payoutTransaction.id },
    });
  expect(allocation).toMatchObject({
    grossMinor: 200_000n,
    platformFeeMinor: 10_000n,
    vendorNetMinor: 190_000n,
    status: "ELIGIBLE",
  });
  expect(balance.availableMinor).toBeGreaterThanOrEqual(110_000);
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: { allocationId: allocation!.id },
    }),
  ).toBe(2);
});

test("[inactive-vendor-payments] Slice 7 E2E 19 — Settlement calculation is explicit and idempotent", async () => {
  const key = `settlement-${crypto.randomUUID()}`;
  const data = {
    vendorOrganizationId: organizationA,
    currency: "RON",
    periodStart: new Date(Date.now() - 90 * 86_400_000).toISOString(),
    periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
  };
  vendorSettlement = await apiData<Resource>(
    await vendorA.api.post("/api/v1/platform/settlements/calculate", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data,
    }),
  );
  const replay = await apiData<Resource>(
    await vendorA.api.post("/api/v1/platform/settlements/calculate", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data,
    }),
  );
  expect(vendorSettlement.status).toBe("READY");
  expect(Number(vendorSettlement.netPayoutMinor)).toBeGreaterThanOrEqual(
    110_000,
  );
  expect(replay.id).toBe(vendorSettlement.id);
});

test("[inactive-vendor-payments] Slice 7 E2E 20 — Finalize and payout produce one immutable paid result", async () => {
  const finalizeVersion = vendorSettlement.version;
  vendorSettlement = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/settlements/${vendorSettlement.id}/finalize`,
      {
        headers: mutationHeaders({
          "If-Match": `"${finalizeVersion}"`,
          "Idempotency-Key": `finalize-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  expect(vendorSettlement.status).toBe("FINALIZED");
  const finalReplay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/settlements/${vendorSettlement.id}/finalize`,
      {
        headers: mutationHeaders({
          "If-Match": `"${finalizeVersion}"`,
          "Idempotency-Key": `finalize-replay-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  expect(finalReplay.id).toBe(vendorSettlement.id);
  const key = `payout-${crypto.randomUUID()}`;
  vendorPayout = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/settlements/${vendorSettlement.id}/payout`,
      { headers: mutationHeaders({ "Idempotency-Key": key }) },
    ),
  );
  const replay = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/settlements/${vendorSettlement.id}/payout`,
      { headers: mutationHeaders({ "Idempotency-Key": key }) },
    ),
  );
  expect(vendorPayout.status).toBe("PAID");
  expect(replay.id).toBe(vendorPayout.id);
  expect(
    await ownerDatabase.vendorPayout.count({
      where: { settlementId: vendorSettlement.id },
    }),
  ).toBe(1);
  await expect(
    ownerDatabase.vendorSettlement.update({
      where: { id: vendorSettlement.id },
      data: { grossMinor: 1n },
    }),
  ).rejects.toThrow();
});

test("[inactive-vendor-payments] Slice 7 E2E 21 — Payout webhook is signed, monotone and replay-safe", async () => {
  const account = await ownerDatabase.vendorPayoutAccount.findUniqueOrThrow({
    where: { vendorOrganizationId: organizationA },
  });
  const persistedPayout = await ownerDatabase.vendorPayout.findUniqueOrThrow({
    where: { id: vendorPayout.id },
  });
  const event = {
    id: `payout-event-${crypto.randomUUID()}`,
    type: "payout.paid",
    occurredAt: new Date().toISOString(),
    data: {
      accountId: account.providerAccountId,
      payoutId: persistedPayout.providerPayoutId,
    },
  };
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "weddingos-payout-local-secret")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const headers = {
    "Content-Type": "application/json",
    "x-weddingos-timestamp": timestamp,
    "x-weddingos-signature": `sha256=${signature}`,
  };
  const accepted = await apiData<{ accepted: boolean; replay: boolean }>(
    await couple.api.post("/api/v1/webhooks/payouts/fake", {
      headers,
      data: rawBody,
    }),
  );
  const replay = await apiData<{ accepted: boolean; replay: boolean }>(
    await couple.api.post("/api/v1/webhooks/payouts/fake", {
      headers,
      data: rawBody,
    }),
  );
  expect(accepted.replay).toBe(false);
  expect(replay.replay).toBe(true);
  expect(
    (
      await ownerDatabase.vendorPayout.findUniqueOrThrow({
        where: { id: vendorPayout.id },
      })
    ).status,
  ).toBe("PAID");
});

test("[inactive-vendor-payments] Slice 7 E2E 22 — Vendor trust and payout isolation", async () => {
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationA}/reviews`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationA}/payouts`,
      )
    ).status(),
  ).toBe(403);
});

test("Slice 7 E2E 23 — Couple and marketplace UI render persisted review data", async ({
  page,
}) => {
  await authorizePage(page, couple);
  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", { name: "Recenzii verificate" }),
  ).toBeVisible();
  await expect(page.getByText("publicat").first()).toBeVisible();
  await page.goto(`/marketplace/${vendorASlug}`);
  await expect(page.getByText(vendorAName).first()).toBeVisible();
  await page.getByRole("tab", { name: "Recenzii" }).click();
  await expect(
    page.getByText("Experiență excelentă, documentată"),
  ).toBeVisible();
});

test("[inactive-vendor-payments] Slice 7 E2E 24 — Vendor and platform pages use real Slice 7 APIs", async ({
  page,
}) => {
  await authorizePage(page, vendorA);
  await page.goto("/vendor/reviews");
  await expect(
    page.getByText("Experiență excelentă, documentată"),
  ).toBeVisible();
  await page.goto("/vendor/billing");
  await expect(page.getByText("Abonament Vendor OS")).toBeVisible();
  await page.goto("/vendor/payouts");
  await expect(page.getByText("Încasări și payouturi")).toBeVisible();
  await expect(page.getByText("PAID").first()).toBeVisible();
  await page.goto("/admin/trust");
  await expect(page.getByText("Trust & monetizare")).toBeVisible();
});

test("Slice 7 E2E 25 — Demo review mode performs zero mutations", async ({
  page,
}) => {
  await authorizePage(page, couple);
  await page
    .context()
    .addCookies([
      { name: "weddingos_demo", value: "1", url: origin, sameSite: "Lax" },
    ]);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) &&
      request.url().includes("/api/")
    )
      mutations.push(request.url());
  });
  await page.goto("/reviews?demo=1");
  await expect(
    page.getByText("Recenziile reale sunt oprite în demo"),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(mutations).toEqual([]);
});

test("Slice 7 E2E 26 — A public vendor without reviews has no fabricated rating", async () => {
  const summary = await apiData<Record<string, unknown>>(
    await couple.api.get(
      `/api/v1/marketplace/vendors/${vendorBSlug}/rating-summary`,
    ),
  );
  expect(summary).toMatchObject({
    publishedReviewCount: 0,
    verifiedReviewCount: 0,
    overallAverageScaled: null,
    emptyLabel: "Nicio evaluare încă",
  });
});

test("Slice 7 E2E 27 — FREE entitlement prevents a third active service", async () => {
  for (let index = 0; index < 2; index += 1) {
    await apiData(
      await vendorB.api.post(
        `/api/v1/vendor-organizations/${freeVendorOrganization}/services`,
        {
          headers: mutationHeaders({
            "Idempotency-Key": `free-service-${index}-${crypto.randomUUID()}`,
          }),
          data: {
            category: "PHOTOGRAPHY",
            name: `Serviciu FREE ${index + 1}`,
            description: "Serviciu activ pentru verificarea limitei planului.",
            pricingModel: "FIXED",
            startingPriceMinor: 50_000,
            currency: "RON",
            active: true,
          },
        },
      ),
    );
  }
  const blocked = await vendorB.api.post(
    `/api/v1/vendor-organizations/${freeVendorOrganization}/services`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `free-service-blocked-${crypto.randomUUID()}`,
      }),
      data: {
        category: "PHOTOGRAPHY",
        name: "Serviciu peste limită",
        description: "Acest serviciu nu trebuie persistat.",
        pricingModel: "FIXED",
        startingPriceMinor: 50_000,
        currency: "RON",
        active: true,
      },
    },
  );
  expect(blocked.status()).toBe(402);
  expect((await blocked.json()).code).toBe("USAGE_LIMIT_REACHED");
  expect(
    await ownerDatabase.vendorService.count({
      where: {
        vendorOrganizationId: freeVendorOrganization,
        active: true,
        deletedAt: null,
      },
    }),
  ).toBe(2);
});

test("Slice 7 E2E 28 — Trial eligibility cannot be reset by a second checkout", async () => {
  const result = await apiData<{ subscription: Resource }>(
    await vendorB.api.post(
      `/api/v1/vendor-organizations/${organizationB}/subscription-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `second-trial-${crypto.randomUUID()}`,
        }),
        data: { planKey: "STARTER" },
      },
    ),
  );
  expect(result.subscription.status).toBe("ACTIVE");
  expect(
    await ownerDatabase.vendorSubscriptionHistory.count({
      where: {
        vendorOrganizationId: organizationB,
        eventType: "TRIAL_STARTED",
      },
    }),
  ).toBe(1);
});

test("Slice 7 E2E 29 — Subscription invoice lifecycle is monotone and persists billing periods", async () => {
  const subscription = await ownerDatabase.vendorSubscription.findUniqueOrThrow(
    {
      where: { vendorOrganizationId: organizationA },
    },
  );
  const latestProviderEvent =
    await ownerDatabase.subscriptionProviderEvent.findFirst({
      where: { providerSubscriptionId: subscription.providerSubscriptionId },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    });
  const sequenceStart = Math.max(
    Date.now(),
    (latestProviderEvent?.occurredAt.getTime() ?? 0) + 1,
  );
  const periodStart = new Date(Date.now() - 86_400_000).toISOString();
  const periodEnd = new Date(Date.now() + 29 * 86_400_000).toISOString();
  const failedAt = new Date(sequenceStart).toISOString();
  await apiData(
    await postSignedCommercialWebhook("subscriptions", {
      id: `subscription-failed-${crypto.randomUUID()}`,
      type: "invoice.failed",
      occurredAt: failedAt,
      data: {
        customerId: subscription.providerCustomerId,
        subscriptionId: subscription.providerSubscriptionId,
        invoiceId: `invoice-failed-${crypto.randomUUID()}`,
        amountDueMinor: 9900,
        amountPaidMinor: 0,
        currency: "RON",
        periodStart,
        periodEnd,
      },
    }),
  );
  const pastDue = await ownerDatabase.vendorSubscription.findUniqueOrThrow({
    where: { id: subscription.id },
  });
  expect(pastDue.status).toBe("PAST_DUE");
  expect(pastDue.gracePeriodEndAt).not.toBeNull();

  const paidAt = new Date(sequenceStart + 1).toISOString();
  await apiData(
    await postSignedCommercialWebhook("subscriptions", {
      id: `subscription-paid-${crypto.randomUUID()}`,
      type: "invoice.paid",
      occurredAt: paidAt,
      data: {
        customerId: subscription.providerCustomerId,
        subscriptionId: subscription.providerSubscriptionId,
        invoiceId: `invoice-paid-${crypto.randomUUID()}`,
        amountDueMinor: 9900,
        amountPaidMinor: 9900,
        currency: "RON",
        periodStart,
        periodEnd,
      },
    }),
  );
  await apiData(
    await postSignedCommercialWebhook("subscriptions", {
      id: `subscription-stale-${crypto.randomUUID()}`,
      type: "invoice.failed",
      occurredAt: new Date(Date.parse(failedAt) - 1000).toISOString(),
      data: {
        customerId: subscription.providerCustomerId,
        subscriptionId: subscription.providerSubscriptionId,
        invoiceId: `invoice-stale-${crypto.randomUUID()}`,
        amountDueMinor: 9900,
        currency: "RON",
      },
    }),
  );
  expect(
    (
      await ownerDatabase.vendorSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).status,
  ).toBe("ACTIVE");
  expect(
    await ownerDatabase.subscriptionInvoiceRecord.count({
      where: { subscriptionId: subscription.id },
    }),
  ).toBeGreaterThanOrEqual(2);
  expect(
    await ownerDatabase.vendorSubscriptionPeriod.count({
      where: { subscriptionId: subscription.id },
    }),
  ).toBeGreaterThanOrEqual(1);
});

test("[inactive-vendor-payments] Slice 7 E2E 30 — Refund after a paid payout creates a carry-forward adjustment", async () => {
  const current = await apiData<Resource>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${payoutTransaction.id}`,
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions/${payoutTransaction.id}/refunds`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `post-payout-refund-${crypto.randomUUID()}`,
          "If-Match": String(current.version),
        }),
        data: { amountMinor: 20_000, reason: "Refund după payout E2E" },
      },
    ),
  );
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  const allocation =
    await ownerDatabase.marketplacePaymentAllocation.findUniqueOrThrow({
      where: { transactionId: payoutTransaction.id },
    });
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: {
        allocationId: allocation.id,
        entryType: "REFUND_ADJUSTMENT",
      },
    }),
  ).toBe(1);
  expect(
    (
      await ownerDatabase.vendorPayout.findUniqueOrThrow({
        where: { id: vendorPayout.id },
      })
    ).status,
  ).toBe("PAID");
});

test("[inactive-vendor-payments] Slice 7 E2E 31 — Dispute holds are released on win and converted on loss", async () => {
  const won = await createCapturedTransaction("Dispute won E2E", 70_000);
  await ownerDatabase.onlinePaymentTransaction.update({
    where: { id: won.transaction.id },
    data: { capturedAt: new Date(Date.now() - 8 * 86_400_000) },
  });
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${won.checkout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "DISPUTE" } },
    ),
  );
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  await apiData(
    await postSignedPaymentWebhook({
      id: `dispute-won-${crypto.randomUUID()}`,
      type: "payment.dispute_won",
      occurredAt: new Date().toISOString(),
      data: {
        providerCheckoutId: won.checkout.providerCheckoutId,
        providerPaymentId: won.transaction.providerPaymentId,
        amountMinor: Number(won.transaction.amountCapturedMinor),
        currency: won.transaction.currency,
      },
    }),
  );
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  const wonAllocation =
    await ownerDatabase.marketplacePaymentAllocation.findUniqueOrThrow({
      where: { transactionId: won.transaction.id },
    });
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: {
        allocationId: wonAllocation.id,
        entryType: "DISPUTE_HOLD",
      },
    }),
  ).toBe(1);
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: {
        allocationId: wonAllocation.id,
        entryType: "DISPUTE_RELEASE",
      },
    }),
  ).toBe(1);

  const lost = await createCapturedTransaction("Dispute lost E2E", 60_000);
  await ownerDatabase.onlinePaymentTransaction.update({
    where: { id: lost.transaction.id },
    data: { capturedAt: new Date(Date.now() - 8 * 86_400_000) },
  });
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${lost.checkout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "DISPUTE" } },
    ),
  );
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  await apiData(
    await postSignedPaymentWebhook({
      id: `dispute-lost-${crypto.randomUUID()}`,
      type: "payment.dispute_lost",
      occurredAt: new Date().toISOString(),
      data: {
        providerCheckoutId: lost.checkout.providerCheckoutId,
        providerPaymentId: lost.transaction.providerPaymentId,
        amountMinor: Number(lost.transaction.amountCapturedMinor),
        currency: lost.transaction.currency,
      },
    }),
  );
  await apiData(
    await vendorA.api.get(
      `/api/v1/vendor-organizations/${organizationA}/balance`,
    ),
  );
  const lostAllocation =
    await ownerDatabase.marketplacePaymentAllocation.findUniqueOrThrow({
      where: { transactionId: lost.transaction.id },
    });
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: {
        allocationId: lostAllocation.id,
        entryType: "REFUND_ADJUSTMENT",
      },
    }),
  ).toBe(1);
});

test("[inactive-vendor-payments] Slice 7 E2E 32 — Paid payout can be returned exactly once", async () => {
  const account = await ownerDatabase.vendorPayoutAccount.findUniqueOrThrow({
    where: { vendorOrganizationId: organizationA },
  });
  const persisted = await ownerDatabase.vendorPayout.findUniqueOrThrow({
    where: { id: vendorPayout.id },
  });
  await apiData(
    await postSignedCommercialWebhook("payouts", {
      id: `payout-returned-${crypto.randomUUID()}`,
      type: "payout.returned",
      occurredAt: new Date().toISOString(),
      data: {
        accountId: account.providerAccountId,
        payoutId: persisted.providerPayoutId,
      },
    }),
  );
  expect(
    (
      await ownerDatabase.vendorPayout.findUniqueOrThrow({
        where: { id: vendorPayout.id },
      })
    ).status,
  ).toBe("RETURNED");
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: {
        entryType: "PAYOUT_REVERSAL",
        sourceType: "VENDOR_PAYOUT",
        sourceId: vendorPayout.id,
      },
    }),
  ).toBe(1);
});

test("[inactive-vendor-payments] Slice 7 E2E 33 — Failed payout retry reuses the payout and appends one attempt", async () => {
  const account = await ownerDatabase.vendorPayoutAccount.findUniqueOrThrow({
    where: { vendorOrganizationId: organizationA },
  });
  const now = Date.now();
  const settlement = await ownerDatabase.vendorSettlement.create({
    data: {
      vendorOrganizationId: organizationA,
      payoutAccountId: account.id,
      currency: "RON",
      periodStart: new Date(now + 2 * 86_400_000),
      periodEnd: new Date(now + 3 * 86_400_000),
      netPayoutMinor: 10_000n,
      status: "FAILED",
      idempotencyKey: `failed-settlement-${crypto.randomUUID()}`,
    },
  });
  const failed = await ownerDatabase.vendorPayout.create({
    data: {
      vendorOrganizationId: organizationA,
      settlementId: settlement.id,
      payoutAccountId: account.id,
      provider: "fake",
      currency: "RON",
      amountMinor: 10_000n,
      status: "FAILED",
      failedAt: new Date(),
      failureCode: "PROVIDER_FAILED",
      idempotencyKey: `failed-payout-${crypto.randomUUID()}`,
    },
  });
  await ownerDatabase.vendorPayoutAttempt.create({
    data: {
      payoutId: failed.id,
      attemptNumber: 1,
      status: "FAILED",
      idempotencyKey: `failed-attempt-${crypto.randomUUID()}`,
      completedAt: new Date(),
    },
  });
  const retried = await apiData<Resource>(
    await vendorA.api.post(
      `/api/v1/platform/settlements/${settlement.id}/payout`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `payout-retry-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
  expect(retried).toMatchObject({ id: failed.id, status: "PAID" });
  expect(
    await ownerDatabase.vendorPayoutAttempt.count({
      where: { payoutId: failed.id },
    }),
  ).toBe(2);
  expect(
    await ownerDatabase.vendorPayableEntry.count({
      where: {
        entryType: "PAYOUT",
        sourceType: "VENDOR_PAYOUT",
        sourceId: failed.id,
      },
    }),
  ).toBe(1);
});

test("[inactive-vendor-payments] Slice 7 E2E 34 — Vendor global search is capability-filtered and navigable", async ({
  page,
}) => {
  await authorizePage(page, vendorA);
  await page.goto("/vendor/payouts");
  await page.getByLabel("Caută în Vendor OS").fill("returned");
  await page.getByRole("button", { name: "Caută" }).click();
  await expect(page.getByText("Payout returned").first()).toBeVisible();
  expect(
    (
      await vendorB.api.get(
        `/api/v1/vendor-organizations/${organizationA}/search?q=returned`,
      )
    ).status(),
  ).toBe(403);
});

async function createCapturedTransaction(title: string, amountMinor: number) {
  const created = await createOnlineSchedule(title, amountMinor);
  const checkout = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `captured-checkout-${crypto.randomUUID()}`,
        }),
        data: {
          paymentScheduleEntryId: created.schedule.id,
          amountMode: "FULL_OUTSTANDING",
        },
      },
    ),
  );
  await apiData(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/payment-checkouts/${checkout.id}/fake-actions`,
      { headers: mutationHeaders(), data: { action: "CAPTURE" } },
    ),
  );
  const transactions = await apiData<Resource[]>(
    await couple.api.get(
      `/api/v1/workspaces/${workspaceId}/online-payment-transactions`,
    ),
  );
  return {
    checkout,
    transaction: transactions.find((item) => item.checkoutId === checkout.id)!,
  };
}

function postSignedCommercialWebhook(
  family: "subscriptions" | "payouts",
  event: Record<string, unknown>,
) {
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const secret =
    family === "subscriptions"
      ? "weddingos-subscription-local-secret"
      : "weddingos-payout-local-secret";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return couple.api.post(`/api/v1/webhooks/${family}/fake`, {
    headers: {
      "Content-Type": "application/json",
      "x-weddingos-timestamp": timestamp,
      "x-weddingos-signature": `sha256=${signature}`,
    },
    data: rawBody,
  });
}

function postSignedPaymentWebhook(event: Record<string, unknown>) {
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", "weddingos-payment-local-secret")
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return couple.api.post("/api/v1/webhooks/payments/fake", {
    headers: {
      "Content-Type": "application/json",
      "x-provider-timestamp": timestamp,
      "x-provider-signature": `sha256=${signature}`,
    },
    data: rawBody,
  });
}

function reviewPayload(eligibilityId: string) {
  return {
    eligibilityId,
    title: "Experiență excelentă",
    body: "Furnizorul a comunicat clar și a livrat exact serviciul promis pentru eveniment.",
    overallRating: 5,
    criteria: {
      QUALITY: 5,
      COMMUNICATION: 5,
      RELIABILITY: 5,
      VALUE: 5,
      PROFESSIONALISM: 5,
      FLEXIBILITY: 5,
    },
    publicDisplayName: "Cuplu E2E verificat",
    authenticityConfirmed: true,
  };
}
