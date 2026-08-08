import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenAPIObject } from "@nestjs/swagger";
import {
  defaultRoleTemplates,
  PUBLIC_AGGREGATE_POLICY_VERSION,
  publicProofMetricSchema,
  updatePublicAggregateConsentSchema,
  overrideInputSchema,
} from "@weddingos/contracts";
import { applyOpenApiContracts } from "../src/openapi/openapi-contracts";

describe("public product proof contracts", () => {
  it("enforces suppression, five-point rounding and ten-workspace buckets", () => {
    expect(() =>
      publicProofMetricSchema.parse({
        state: "published",
        value: 73,
        unit: "percent",
        contributingWorkspaceBucket: 20,
        suppressionReason: null,
      }),
    ).toThrow();
    expect(() =>
      publicProofMetricSchema.parse({
        state: "published",
        value: 75,
        unit: "percent",
        contributingWorkspaceBucket: 25,
        suppressionReason: null,
      }),
    ).toThrow();
    expect(
      publicProofMetricSchema.parse({
        state: "suppressed",
        value: null,
        unit: "percent",
        contributingWorkspaceBucket: null,
        suppressionReason: "minimum_cohort",
      }).state,
    ).toBe("suppressed");
  });

  it("accepts only the explicit current consent policy", () => {
    expect(
      updatePublicAggregateConsentSchema.parse({
        enabled: true,
        policyVersion: PUBLIC_AGGREGATE_POLICY_VERSION,
      }),
    ).toEqual({ enabled: true, policyVersion: "public-aggregate-v1" });
    expect(() =>
      updatePublicAggregateConsentSchema.parse({
        enabled: true,
        policyVersion: "legacy-policy",
      }),
    ).toThrow();
  });

  it("grants public aggregation management only to the couple owner", () => {
    const holders = defaultRoleTemplates
      .filter((role) =>
        role.capabilities.includes("workspace.manage_public_aggregation"),
      )
      .map((role) => role.key);
    expect(holders).toEqual(["couple_owner"]);
    expect(() =>
      overrideInputSchema.parse({
        capability: "workspace.manage_public_aggregation",
        effect: "allow",
      }),
    ).toThrow(/cannot be delegated/);
  });

  it("keeps worker access behind the bounded aggregate function", () => {
    const migration = readFileSync(
      resolve(
        "../../packages/database/prisma/migrations/20260720170000_public_product_proof/migration.sql",
      ),
      "utf8",
    );
    expect(migration).not.toMatch(
      /GRANT SELECT ON TABLE "public_aggregate_consents" TO weddingos_worker/,
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.weddingos_compute_public_marketing_metrics",
    );
    expect(migration).toContain("SET row_security = off");
    expect(migration).toContain("IF minimum_cohort < 20");
    expect(migration).toContain("round(metric_value / 5.0) * 5");
    expect(migration).toContain("floor(contributor_count / 10.0)");

    const hardening = readFileSync(
      resolve(
        "../../packages/database/prisma/migrations/20260720213000_public_product_proof_hardening/migration.sql",
      ),
      "utf8",
    );
    expect(hardening).toContain("CREATE ROLE weddingos_public_aggregator");
    expect(hardening).toContain("NOLOGIN NOSUPERUSER");
    expect(hardening).toContain("OWNER TO weddingos_public_aggregator");
    expect(hardening).not.toMatch(
      /GRANT .*weddingos_public_aggregator TO weddingos_worker/,
    );
  });

  it("defines a tenant-free, append-only revocation safety gate", () => {
    const migration = readFileSync(
      resolve(
        "../../packages/database/prisma/migrations/20260720213000_public_product_proof_hardening/migration.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      'CREATE TABLE "public_marketing_snapshot_invalidations"',
    );
    expect(migration).not.toContain("workspace_id");
    expect(migration).not.toContain("tenant_id");
    expect(migration).toContain(
      'GRANT SELECT, INSERT ON TABLE "public_marketing_snapshot_invalidations" TO weddingos_app',
    );
    expect(migration).not.toMatch(
      /GRANT[^;]*(?:UPDATE|DELETE)[^;]*public_marketing_snapshot_invalidations/,
    );
    expect(migration).toContain(
      'ALTER TABLE "public_marketing_snapshot_invalidations" FORCE ROW LEVEL SECURITY',
    );
    expect(migration).toContain(
      'CREATE POLICY "public_marketing_snapshot_invalidation_app_read"',
    );
    expect(migration).toContain(
      'CREATE POLICY "public_marketing_snapshot_invalidation_app_insert"',
    );
  });

  it("documents the anonymous ETag contract and versioned owner consent", () => {
    const document = applyOpenApiContracts({
      openapi: "3.0.0",
      info: { title: "marketing", version: "1" },
      paths: {
        "/api/v1/public/product-proof": { get: { responses: {} } },
        "/api/v1/workspaces/{workspaceId}/public-aggregate-consent": {
          get: { responses: {} },
          put: { responses: {} },
        },
      },
      components: {
        securitySchemes: {
          cookie: { type: "apiKey", in: "cookie", name: "weddingos_session" },
        },
      },
    } as OpenAPIObject);
    const publicOperation = document.paths["/api/v1/public/product-proof"]?.get;
    expect(publicOperation?.security).toEqual([]);
    expect(publicOperation?.responses["200"]).toMatchObject({
      headers: {
        ETag: expect.any(Object),
        "Cache-Control": expect.any(Object),
      },
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/PublicProductProofV1" },
        },
      },
    });
    expect(publicOperation?.responses["304"]).toBeDefined();
    expect(publicOperation?.responses["503"]).toBeDefined();
    expect(publicOperation?.responses["401"]).toBeUndefined();
    expect(publicOperation?.responses["403"]).toBeUndefined();

    const consent =
      document.paths[
        "/api/v1/workspaces/{workspaceId}/public-aggregate-consent"
      ]?.put;
    expect(consent?.requestBody).toBeDefined();
    expect(consent?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "If-Match", required: true }),
      ]),
    );
    expect(
      (consent as Record<string, unknown> | undefined)?.[
        "x-required-capability"
      ],
    ).toBe("workspace.manage_public_aggregation");
  });
});
