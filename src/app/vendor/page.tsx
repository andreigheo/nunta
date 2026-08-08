"use client";

import * as React from "react";
import {
  Building2,
  CalendarClock,
  CreditCard,
  FileSignature,
  Inbox,
  Plus,
  Star,
  Store,
} from "lucide-react";
import { PortalShell } from "@/components/portals/portal-shell";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  useToast,
} from "@/components/ui";
import type { CapabilityKey } from "@weddingos/contracts";

export default function VendorPortalPage() {
  const { user, workspaces, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [organizations, setOrganizations] = React.useState<OperationResource[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [rfqs, setRfqs] = React.useState<OperationResource[]>([]);
  const [services, setServices] = React.useState<OperationResource[]>([]);
  const [bookings, setBookings] = React.useState<OperationResource[]>([]);
  const [contracts, setContracts] = React.useState<OperationResource[]>([]);
  const [monetization, setMonetization] = React.useState<Record<string, unknown>>({});
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    legalName: "",
    displayName: "",
    country: "România",
    contactEmail: "",
  });

  const loadOrganizations = React.useCallback(async () => {
    if (demoMode) {
      setLoaded(true);
      return;
    }
    try {
      const result = await weddingOsApi.vendorOrganizations();
      setOrganizations(result.items);
      setActiveId((current) => current ?? result.items[0]?.id ?? null);
      if (
        result.items.length === 0 &&
        new URLSearchParams(window.location.search).get("setup") === "1"
      ) {
        setOpen(true);
      }
    } catch (error) {
      toast({
        title: "Zona profesională nu a putut fi încărcată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoaded(true);
    }
  }, [demoMode, toast]);
  useDeferredLoad(loadOrganizations);

  const loadCommercial = React.useCallback(async () => {
    if (!activeId || demoMode) {
      setRfqs([]);
      setServices([]);
      setBookings([]);
      setContracts([]);
      setMonetization({});
      return;
    }
    try {
      const organization = organizations.find((item) => item.id === activeId);
      const capabilities = new Set(
        Array.isArray(organization?.capabilities)
          ? organization.capabilities.map(String)
          : [],
      );
      const can = (capability: CapabilityKey) => capabilities.has(capability);
      const [requestRows, serviceRows, bookingRows, contractRows, trustRows] =
        await Promise.all([
          can("vendor.rfq.read")
            ? weddingOsApi.vendorRfqs(activeId)
            : Promise.resolve({ items: [] }),
          can("vendor.services.read")
            ? weddingOsApi.vendorServices(activeId)
            : Promise.resolve({ items: [] }),
          can("vendor.booking.read")
            ? weddingOsApi.vendorBookings(activeId)
            : Promise.resolve({ items: [] }),
          can("vendor.contract.read")
            ? weddingOsApi.vendorContracts(activeId)
            : Promise.resolve({ items: [] }),
          can("vendor.subscription.read")
            ? weddingOsApi.vendorMonetizationOverview(activeId)
            : Promise.resolve({}),
        ]);
      setRfqs(requestRows.items);
      setServices(serviceRows.items);
      setBookings(bookingRows.items);
      setContracts(contractRows.items);
      setMonetization(trustRows);
    } catch (error) {
      toast({
        title: "Datele profesionale nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [activeId, demoMode, organizations, toast]);
  useDeferredLoad(loadCommercial);

  const create = async () => {
    try {
      const organization = await weddingOsApi.createVendorOrganization({
        ...form,
        contactEmail: form.contactEmail || user?.user.email || "",
      });
      setOpen(false);
      await loadOrganizations();
      setActiveId(organization.id);
      toast({
        title: "Profil profesional creat",
        description:
          "Ești administratorul acestui profil. Publicarea rămâne o acțiune separată și explicită.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Profilul profesional nu a fost creat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  const active =
    organizations.find((organization) => organization.id === activeId) ?? null;
  const activeCapabilities = new Set(
    Array.isArray(active?.capabilities)
      ? active.capabilities.map(String)
      : [],
  );
  const can = (capability: CapabilityKey) =>
    activeCapabilities.has(capability);
  const backHref = workspaces.length ? "/overview" : "/start";
  const backLabel = workspaces.length ? "Evenimente" : "Contul meu";

  return (
    <PortalShell
      role="Furnizor de servicii"
      title={`Bună, ${user?.user.firstName ?? "furnizor"}`}
      subtitle="Un spațiu separat pentru profil, servicii, cereri, oferte, rezervări și contracte."
      backHref={backHref}
      backLabel={backLabel}
    >
      <div className="space-y-5">
        <PageHeader
          title={active ? String(active.displayName) : "Serviciile tale"}
          description={
            active
              ? `${String(active.role ?? "membru").replaceAll("_", " ")} · ${String(active.status).toLowerCase()}`
              : "Configurează profilul prin care vei primi solicitări de la organizatori."
          }
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Plus className="size-4" />
                Profil profesional
              </Button>
              {organizations.length > 1 ? (
                <select
                  className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
                  value={activeId ?? ""}
                  onChange={(event) => setActiveId(event.target.value)}
                  aria-label="Alege profilul profesional"
                >
                  {organizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {String(organization.displayName)}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          }
        />

        {!loaded ? (
          <div className="h-48 animate-pulse rounded-xl bg-subtle" />
        ) : !active ? (
          <EmptyState
            icon={Building2}
            title="Nu ai încă un profil profesional"
            description="Poți lucra ca persoană fizică sau ca organizație. Numele legal este folosit intern, iar numele public apare clienților."
            action={{ label: "Configurează profilul", onClick: () => setOpen(true) }}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {can("vendor.profile.read") ? <Metric icon={Store} label="Profil public" value={record(active.profile).publicationStatus ? String(record(active.profile).publicationStatus).toLowerCase() : "neconfigurat"} href={`/vendor/profile?organization=${active.id}`} /> : null}
            {can("vendor.services.read") ? <Metric icon={Star} label="Servicii" value={services.length} href={`/vendor/services?organization=${active.id}`} /> : null}
            {can("vendor.rfq.read") ? <Metric icon={Inbox} label="Cereri primite" value={rfqs.length} href={`/vendor/requests?organization=${active.id}`} /> : null}
            {can("vendor.booking.read") ? <Metric icon={CalendarClock} label="Rezervări" value={bookings.length} href={`/vendor/bookings?organization=${active.id}`} /> : null}
            {can("vendor.contract.read") ? <Metric icon={FileSignature} label="Contracte" value={contracts.length} href={`/vendor/contracts?organization=${active.id}`} /> : null}
            {can("vendor.review.read") ? <Metric icon={Star} label="Rating verificat" value={record(monetization.reviews).averageScaled ? (Number(record(monetization.reviews).averageScaled) / 100).toFixed(1) : "—"} href={`/vendor/reviews?organization=${active.id}`} /> : null}
            {can("vendor.subscription.read") ? <Metric icon={CreditCard} label="Abonament" value={String(record(monetization.subscription).planKey ?? "FREE")} href={`/vendor/billing?organization=${active.id}`} /> : null}
          </div>
        )}

        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Profil pentru servicii de evenimente"
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Renunță
              </Button>
              <Button
                disabled={
                  !form.legalName ||
                  !form.displayName ||
                  !(form.contactEmail || user?.user.email)
                }
                onClick={() => void create()}
              >
                Creează profilul
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field
              label="Nume legal sau numele persoanei"
              hint="Folosit pentru contracte și verificări, nu ca nume public."
            >
              <Input
                value={form.legalName}
                onChange={(event) =>
                  setForm({ ...form, legalName: event.target.value })
                }
              />
            </Field>
            <Field label="Nume public">
              <Input
                value={form.displayName}
                onChange={(event) =>
                  setForm({ ...form, displayName: event.target.value })
                }
              />
            </Field>
            <Field label="Țară">
              <Input
                value={form.country}
                onChange={(event) =>
                  setForm({ ...form, country: event.target.value })
                }
              />
            </Field>
            <Field label="Email de contact">
              <Input
                type="email"
                value={form.contactEmail || user?.user.email || ""}
                onChange={(event) =>
                  setForm({ ...form, contactEmail: event.target.value })
                }
              />
            </Field>
          </div>
        </Modal>
      </div>
    </PortalShell>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Inbox;
  label: string;
  value: string | number;
  href: string;
}) {
  return (
    <Card interactive onClick={() => window.location.assign(href)}>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-lg bg-brand-soft p-2 text-brand">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted">{label}</p>
          <p className="truncate text-lg font-semibold text-ink">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
