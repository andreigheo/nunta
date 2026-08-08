"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { weddingOsApi, type OperationResource } from "./client";
import type { CapabilityKey } from "@weddingos/contracts";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";

export function useVendorOrganization() {
  const search = useSearchParams();
  const [organizations, setOrganizations] = React.useState<OperationResource[]>(
    [],
  );
  const [organizationId, setOrganizationId] = React.useState<string | null>(
    search.get("organization"),
  );
  const [loading, setLoading] = React.useState(true);
  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await weddingOsApi.vendorOrganizations();
      setOrganizations(result.items);
      setOrganizationId((current) =>
        current && result.items.some((item) => item.id === current)
          ? current
          : (result.items[0]?.id ?? null),
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useDeferredLoad(refresh);
  const organization =
    organizations.find((item) => item.id === organizationId) ?? null;
  const capabilities = React.useMemo(
    () =>
      new Set(
        Array.isArray(organization?.capabilities)
          ? organization.capabilities.map(String)
          : [],
      ),
    [organization],
  );
  const can = React.useCallback(
    (capability: CapabilityKey) => capabilities.has(capability),
    [capabilities],
  );
  return {
    organizations,
    organizationId,
    setOrganizationId,
    organization,
    capabilities,
    can,
    loading,
    refresh,
  };
}
