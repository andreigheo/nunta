import SwaggerParser from "@apidevtools/swagger-parser";
import { SwaggerModule } from "@nestjs/swagger";
import type { OpenAPIObject } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { applyOpenApiContracts } from "../src/openapi/openapi-contracts";
import { AppModule } from "../src/app.module";

describe("Slice 2A OpenAPI contracts", () => {
  it("documents concrete active contracts and validates as OpenAPI", async () => {
    const document = applyOpenApiContracts({
      openapi: "3.0.0",
      info: { title: "Sarbato test", version: "2A" },
      paths: {
        "/health": { get: { responses: {} } },
        "/api/v1/workspaces": {
          get: { responses: {} },
          post: { responses: {} },
        },
        "/api/v1/workspaces/{workspaceId}/onboarding": {
          patch: {
            parameters: [
              {
                name: "workspaceId",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: {},
          },
        },
        "/api/v1/me/mfa-challenges": { post: { responses: {} } },
      },
      components: {
        securitySchemes: {
          cookie: { type: "apiKey", in: "cookie", name: "weddingos_session" },
        },
      },
    } as OpenAPIObject);

    expect(
      Object.keys(document.components?.schemas ?? {}).length,
    ).toBeGreaterThan(40);
    expect(document.paths["/planned"]).toBeUndefined();
    expect(
      document.paths["/api/v1/workspaces"]?.post?.requestBody,
    ).toBeDefined();
    expect(
      document.paths["/api/v1/workspaces/{workspaceId}/onboarding"]?.patch
        ?.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "If-Match", required: true }),
      ]),
    );
    const mfa = document.paths["/api/v1/me/mfa-challenges"]?.post;
    expect(mfa?.["x-feature-flag" as keyof typeof mfa]).toBe(
      "FEATURE_MFA_ENABLED",
    );
    expect(mfa?.responses["501"]).toBeDefined();
    expect(mfa?.responses["201"]).toBeUndefined();
    await expect(
      SwaggerParser.validate(document as never),
    ).resolves.toBeDefined();
  });
});

describe("Slice 2B complete OpenAPI surface", () => {
  it("has concrete request/response contracts and no planned operations", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "2B" },
        } as never),
      );
      const operations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch", "put", "delete"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation ? [{ path, method, operation }] : [];
          }),
      );
      const slice2B = operations.filter(({ path }) =>
        /plan-|tasks|calendar|timeline|milestones|dashboard|search|planning-exports/.test(
          path,
        ),
      );
      expect(slice2B.length).toBeGreaterThan(20);
      expect(
        slice2B.every(
          ({ operation }) => operation["x-operation-status"] !== "planned",
        ),
      ).toBe(true);
      expect(
        slice2B.every(({ operation }) => {
          const responses = operation.responses as Record<string, unknown>;
          return Object.keys(responses).some((status) =>
            /^2\d\d$/.test(status),
          );
        }),
      ).toBe(true);
      expect(
        slice2B
          .filter(({ method }) => ["post", "patch", "put"].includes(method))
          .every(({ operation }) => Boolean(operation.requestBody)),
      ).toBe(true);
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Slice 4 operations OpenAPI surface", () => {
  it("documents every active seating, transport and accommodation operation", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "4" },
        } as never),
      );
      const operations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch", "put", "delete"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation ? [{ path, method, operation }] : [];
          }),
      );
      const slice4 = operations.filter(({ path }) =>
        /venue-spaces|seating-plans|transport-|accommodation-/.test(path),
      );
      expect(slice4.length).toBeGreaterThanOrEqual(50);
      expect(
        slice4.every(
          ({ operation }) => operation["x-operation-status"] !== "planned",
        ),
      ).toBe(true);
      expect(
        slice4
          .filter(({ method }) => ["post", "patch", "put"].includes(method))
          .every(({ operation }) => Boolean(operation.requestBody)),
      ).toBe(true);
      expect(
        slice4.every(({ operation }) => {
          const responses = operation.responses as Record<string, unknown>;
          return Object.keys(responses).some((status) =>
            /^2\d\d$/.test(status),
          );
        }),
      ).toBe(true);
      expect(
        slice4
          .filter(({ method }) => ["patch", "put", "delete"].includes(method))
          .every(({ operation }) =>
            JSON.stringify(operation.parameters ?? []).includes("If-Match"),
          ),
      ).toBe(true);
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Slice 5 commercial OpenAPI surface", () => {
  it("documents every active marketplace, Vendor OS and commercial operation", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "5" },
        } as never),
      );
      const operations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch", "put", "delete"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation ? [{ path, method, operation }] : [];
          }),
      );
      const slice5 = operations.filter(({ path }) =>
        /marketplace\/vendors|vendor-invitations|vendor-organizations|vendor-favorites|vendor-shortlists|rfqs|offers|bookings|contracts|budget|expenses|payment-schedules|payments|commercial-exports/.test(
          path,
        ),
      );
      expect(slice5.length).toBeGreaterThanOrEqual(85);
      expect(
        slice5.every(
          ({ operation }) => operation["x-operation-status"] !== "planned",
        ),
      ).toBe(true);
      expect(
        slice5
          .filter(
            ({ method, operation }) =>
              ["post", "patch", "put"].includes(method) &&
              !operation.requestBody,
          )
          .map(({ method, path }) => `${method.toUpperCase()} ${path}`),
      ).toEqual([]);
      expect(
        slice5.every(({ operation }) => {
          const responses = operation.responses as Record<string, unknown>;
          return Object.keys(responses).some((status) =>
            /^2\d\d$/.test(status),
          );
        }),
      ).toBe(true);
      const vendorProfile = slice5.find(
        ({ path, method }) =>
          path.endsWith("/vendor-organizations/{organizationId}/profile") &&
          method === "put",
      )?.operation;
      expect(vendorProfile?.["x-required-vendor-capability"]).toBe(
        "vendor.profile.write",
      );
      expect(JSON.stringify(vendorProfile?.parameters ?? [])).toContain(
        "If-Match",
      );
      const rfqCreate = slice5.find(
        ({ path, method }) =>
          path.endsWith("/workspaces/{workspaceId}/rfqs") && method === "post",
      )?.operation;
      expect(rfqCreate?.["x-required-capability"]).toBe("rfq.write");
      expect(JSON.stringify(rfqCreate?.parameters ?? [])).toContain(
        "Idempotency-Key",
      );
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Slice 6 secure commerce OpenAPI surface", () => {
  it("documents vault, signature and online payment contracts without exposing private storage", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "6" },
        } as never),
      );
      const paths = document.paths;
      expect(paths["/api/v1/uploads"]?.post?.requestBody).toBeDefined();
      expect(
        JSON.stringify(paths["/api/v1/uploads"]?.post?.parameters),
      ).toContain("Idempotency-Key");
      expect(
        JSON.stringify(
          paths["/api/v1/documents/{documentId}"]?.patch?.parameters,
        ),
      ).toContain("If-Match");
      const checkout = paths[
        "/api/v1/workspaces/{workspaceId}/payment-checkouts"
      ]?.post as Record<string, unknown> | undefined;
      expect(checkout?.["x-required-capability"]).toBe(
        "online_payment.create_checkout",
      );
      expect(
        JSON.stringify(
          paths[
            "/api/v1/workspaces/{workspaceId}/online-payment-transactions/{transactionId}/refunds"
          ]?.post?.parameters,
        ),
      ).toContain("If-Match");
      const webhook = paths["/api/v1/webhooks/payments/{provider}"]?.post;
      expect(JSON.stringify(webhook?.parameters)).toContain(
        "X-Provider-Signature",
      );
      expect(JSON.stringify(webhook?.parameters)).toContain(
        "X-Provider-Timestamp",
      );
      const derivative =
        paths["/api/v1/marketplace/portfolio-assets/{derivativeId}"]?.get;
      expect(derivative?.security).toEqual([]);
      expect(JSON.stringify(derivative?.responses["200"])).toContain(
        "image/webp",
      );
      expect(JSON.stringify(document.components?.schemas)).not.toContain(
        "objectKey",
      );
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Slice 7 trust and monetization OpenAPI surface", () => {
  it("documents every active review, subscription and payout contract", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "7" },
        } as never),
      );
      const operations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch", "put"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation ? [{ path, method, operation }] : [];
          }),
      );
      const slice7 = operations.filter(({ path }) =>
        /review-eligibilities|\/reviews|rating-summary|trust-monetization|vendor-subscription|\/subscription|\/entitlements|\/usage|payout-account|payout-onboarding|\/balance|\/settlements|\/payouts|review-moderation/.test(
          path,
        ),
      );
      expect(slice7.length).toBeGreaterThanOrEqual(49);
      expect(
        slice7.filter(
          ({ method, operation }) =>
            ["post", "patch", "put"].includes(method) && !operation.requestBody,
        ),
      ).toEqual([]);
      expect(
        slice7.every(
          ({ operation }) => operation["x-operation-status"] !== "planned",
        ),
      ).toBe(true);
      const search =
        document.paths["/api/v1/vendor-organizations/{organizationId}/search"]
          ?.get;
      expect(
        (search as (Record<string, unknown> & typeof search) | undefined)?.[
          "x-required-vendor-capability"
        ],
      ).toBe("vendor.organization.read");
      expect(JSON.stringify(search?.responses["200"])).toContain(
        "TrustMonetizationList",
      );
      const dispute =
        document.paths[
          "/api/v1/vendor-organizations/{organizationId}/reviews/{reviewId}/disputes"
        ]?.post;
      expect(JSON.stringify(dispute?.parameters)).toContain("If-Match");
      expect(JSON.stringify(dispute?.parameters)).toContain("Idempotency-Key");
      const subscriptionWebhook =
        document.paths["/api/v1/webhooks/subscriptions/{provider}"]?.post;
      expect(JSON.stringify(subscriptionWebhook?.parameters)).toContain(
        "X-WeddingOS-Signature",
      );
      expect(JSON.stringify(subscriptionWebhook?.parameters)).toContain(
        "X-WeddingOS-Timestamp",
      );
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Slice 8 Wedding Day OpenAPI surface", () => {
  it("publishes concrete secured contracts for operations, check-in and guest media", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "8" },
        } as never),
      );
      const operations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch", "put", "delete"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation ? [{ path, method, operation }] : [];
          }),
      );
      const slice8 = operations.filter(({ path }) =>
        /wedding-day|check-in|guest-moments|galleries|\/api\/v1\/guest\/(moments|gallery)/.test(
          path,
        ),
      );
      expect(slice8.length).toBeGreaterThanOrEqual(60);
      expect(
        slice8.every(({ operation }) =>
          Object.keys(operation.responses as Record<string, unknown>).some(
            (status) => /^2\d\d$/.test(status),
          ),
        ),
      ).toBe(true);
      expect(document.components?.schemas?.CreateWeddingDayPlan).toBeDefined();
      expect(document.components?.schemas?.GuestCheckInCommand).toBeDefined();
      expect(document.components?.schemas?.CreateGuestMoment).toBeDefined();

      const createPlan =
        document.paths["/api/v1/workspaces/{workspaceId}/wedding-day/plans"]
          ?.post;
      expect(JSON.stringify(createPlan?.requestBody)).toContain(
        "CreateWeddingDayPlan",
      );
      expect(JSON.stringify(createPlan?.parameters)).toContain(
        "Idempotency-Key",
      );
      expect(
        (
          createPlan as
            (Record<string, unknown> & typeof createPlan) | undefined
        )?.["x-required-capability"],
      ).toBe("wedding_day.write");

      const updateItem =
        document.paths[
          "/api/v1/workspaces/{workspaceId}/wedding-day/run-of-show/items/{itemId}"
        ]?.patch;
      expect(JSON.stringify(updateItem?.parameters)).toContain("If-Match");
      expect(JSON.stringify(updateItem?.requestBody)).toContain(
        "UpdateRunOfShowItem",
      );

      const offline =
        document.paths[
          "/api/v1/workspaces/{workspaceId}/check-in/sessions/{sessionId}/offline-sync"
        ]?.post;
      expect(JSON.stringify(offline?.requestBody)).toContain(
        "CheckInOfflineSync",
      );
      expect(
        (offline as (Record<string, unknown> & typeof offline) | undefined)?.[
          "x-required-capability"
        ],
      ).toBe("check_in.offline_sync");

      const guestMoment = document.paths["/api/v1/guest/moments"]?.post;
      expect(JSON.stringify(guestMoment?.security)).toContain(
        "guestAccessToken",
      );
      expect(JSON.stringify(guestMoment?.parameters)).toContain(
        "Idempotency-Key",
      );
      expect(JSON.stringify(guestMoment?.requestBody)).toContain(
        "CreateGuestMoment",
      );

      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Slice 9 intelligence OpenAPI surface", () => {
  it("publishes active secured contracts for Copilot, Risks, Plan B, automations and digests", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "9" },
        } as never),
      );
      const operations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch", "delete"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation ? [{ path, method, operation }] : [];
          }),
      );
      const slice9 = operations.filter(({ path }) =>
        /copilot|\/risks|risk-detections|contingency-plans|automation|weekly-digests/.test(
          path,
        ),
      );
      expect(slice9.length).toBeGreaterThanOrEqual(55);
      expect(
        slice9.every(
          ({ operation }) =>
            operation["x-operation-status"] !== "planned" &&
            typeof operation["x-required-capability"] === "string" &&
            Object.keys(operation.responses as Record<string, unknown>).some(
              (status) => /^2\d\d$/.test(status),
            ),
        ),
      ).toBe(true);

      const createConversation =
        document.paths["/api/v1/workspaces/{workspaceId}/copilot/conversations"]
          ?.post;
      expect(JSON.stringify(createConversation?.requestBody)).toContain(
        "CreateCopilotConversation",
      );
      expect(JSON.stringify(createConversation?.parameters)).toContain(
        "Idempotency-Key",
      );

      const proposalEdit =
        document.paths[
          "/api/v1/workspaces/{workspaceId}/copilot/proposals/{proposalId}"
        ]?.patch;
      expect(JSON.stringify(proposalEdit?.requestBody)).toContain(
        "UpdateCopilotProposal",
      );
      expect(JSON.stringify(proposalEdit?.parameters)).toContain("If-Match");

      const automationApproval =
        document.paths[
          "/api/v1/workspaces/{workspaceId}/automation-executions/{executionId}/approve"
        ]?.post;
      expect(JSON.stringify(automationApproval?.parameters)).toContain(
        "If-Match",
      );
      expect(JSON.stringify(automationApproval?.parameters)).toContain(
        "Idempotency-Key",
      );
      expect(
        (
          automationApproval as
            (Record<string, unknown> & typeof automationApproval) | undefined
        )?.["x-required-capability"],
      ).toBe("automation.approve");

      const weeklyDigest =
        document.paths["/api/v1/workspaces/{workspaceId}/weekly-digests"]?.post;
      expect(JSON.stringify(weeklyDigest?.requestBody)).toContain(
        "CreateWeeklyDigest",
      );
      expect(JSON.stringify(weeklyDigest?.parameters)).toContain(
        "Idempotency-Key",
      );
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});

describe("Public API launch surface", () => {
  it("does not expose the retired controlled-beta administration surface", async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const application = testingModule.createNestApplication();
    await application.init();
    try {
      const document = applyOpenApiContracts(
        SwaggerModule.createDocument(application, {
          openapi: "3.0.0",
          info: { title: "Sarbato", version: "Live" },
        } as never),
      );
      const betaOperations = Object.entries(document.paths).flatMap(
        ([path, item]) =>
          ["get", "post", "patch"].flatMap((method) => {
            const operation = (item as Record<string, unknown>)[method] as
              Record<string, unknown> | undefined;
            return operation && /\/api\/v1\/(?:platform\/)?beta\//.test(path)
              ? [{ path, method, operation }]
              : [];
          }),
      );
      expect(betaOperations).toEqual([]);
      await expect(
        SwaggerParser.validate(document as never),
      ).resolves.toBeDefined();
    } finally {
      await application.close();
    }
  }, 60_000);
});
