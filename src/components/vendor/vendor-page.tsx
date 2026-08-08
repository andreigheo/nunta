"use client";

import * as React from "react";
import { Search } from "lucide-react";
import type { CapabilityKey } from "@weddingos/contracts";
import { PortalShell } from "@/components/portals/portal-shell";
import { Button, Input, useToast } from "@/components/ui";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";

export function VendorPage({
  title,
  description,
  organizationId,
  organizations,
  onOrganizationChange,
  children,
}: {
  title: string;
  description: string;
  organizationId: string | null;
  organizations: OperationResource[];
  onOrganizationChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<OperationResource[]>([]);
  const [searching, setSearching] = React.useState(false);
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(
        (await weddingOsApi.vendorTrustSearch(organizationId, query.trim()))
          .items,
      );
    } catch (error) {
      setResults([]);
      toast({
        title: "Căutarea Vendor OS a eșuat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setSearching(false);
    }
  };
  const active = organizations.find((item) => item.id === organizationId);
  const capabilities = new Set(
    Array.isArray(active?.capabilities) ? active.capabilities.map(String) : [],
  );
  const destinations: Array<{
    label: string;
    href: string;
    capability: CapabilityKey;
  }> = [
    {
      label: "Profil",
      href: "/vendor/profile",
      capability: "vendor.profile.read",
    },
    {
      label: "Servicii",
      href: "/vendor/services",
      capability: "vendor.services.read",
    },
    {
      label: "Cereri",
      href: "/vendor/requests",
      capability: "vendor.rfq.read",
    },
    {
      label: "Oferte",
      href: "/vendor/offers",
      capability: "vendor.offer.read",
    },
    {
      label: "Rezervări",
      href: "/vendor/bookings",
      capability: "vendor.booking.read",
    },
    {
      label: "Contracte",
      href: "/vendor/contracts",
      capability: "vendor.contract.read",
    },
    {
      label: "Recenzii",
      href: "/vendor/reviews",
      capability: "vendor.review.read",
    },
    {
      label: "Abonament",
      href: "/vendor/billing",
      capability: "vendor.subscription.read",
    },
  ];
  return (
    <PortalShell
      role="Furnizor de servicii"
      title={title}
      subtitle={description}
      backHref="/vendor"
      backLabel="Zona profesională"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {destinations
          .filter((item) => capabilities.has(item.capability))
          .map((item) => (
            <Button
              key={item.href}
              size="sm"
              variant="outline"
              onClick={() =>
                window.location.assign(
                  `${item.href}?organization=${organizationId ?? ""}`,
                )
              }
            >
              {item.label}
            </Button>
          ))}
        {organizations.length > 1 ? (
          <select
            className="ml-auto h-9 rounded-lg border border-line bg-surface px-3 text-sm"
            value={organizationId ?? ""}
            onChange={(event) => onOrganizationChange(event.target.value)}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {String(item.displayName)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <form
        className="relative mb-5 flex max-w-xl gap-2"
        onSubmit={(event) => void search(event)}
      >
        <Input
          className="min-w-0 flex-1"
          aria-label="Caută în zona profesională"
          placeholder="Caută cereri, oferte, rezervări sau contracte…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (event.target.value.trim().length < 2) setResults([]);
          }}
        />
        <Button
          className="shrink-0"
          type="submit"
          size="sm"
          variant="ghost"
          disabled={searching || query.trim().length < 2}
        >
          <Search className="size-4" />
          {searching ? "Caută…" : "Caută"}
        </Button>
        {results.length ? (
          <div className="absolute top-full z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
            {results.map((item) => (
              <button
                type="button"
                key={`${String(item.type)}:${item.id}`}
                className="block w-full border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-subtle"
                onClick={() => window.location.assign(String(item.actionUrl))}
              >
                <span className="block text-sm font-medium text-ink">
                  {String(item.title)}
                </span>
                <span className="block truncate text-xs text-muted">
                  {String(item.subtitle ?? item.type)}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </form>
      {children}
    </PortalShell>
  );
}
