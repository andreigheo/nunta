"use client";

import * as React from "react";
import { CalendarClock, Plus, Store } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { VendorPage } from "@/components/vendor/vendor-page";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useVendorOrganization } from "@/lib/api/vendor-organization";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

export default function VendorServicesPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [services, setServices] = React.useState<OperationResource[]>([]);
  const [availability, setAvailability] = React.useState<OperationResource[]>(
    [],
  );
  const [mode, setMode] = React.useState<
    "service" | "package" | "availability" | null
  >(null);
  const [serviceId, setServiceId] = React.useState("");
  const [form, setForm] = React.useState<Record<string, string>>({
    category: "OTHER",
    pricingModel: "FIXED",
    currency: "RON",
    status: "AVAILABLE",
  });
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    try {
      const [serviceRows, blocks] = await Promise.all([
        can("vendor.services.read")
          ? weddingOsApi.vendorServices(organizationId)
          : Promise.resolve({ items: [] }),
        can("vendor.availability.read")
          ? weddingOsApi.vendorAvailability(organizationId)
          : Promise.resolve({ items: [] }),
      ]);
      setServices(serviceRows.items);
      setAvailability(blocks.items);
    } catch (error) {
      toast({
        title: "Serviciile nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(load);
  const save = async () => {
    if (!context.organizationId || !mode) return;
    try {
      if (mode === "service")
        await weddingOsApi.createVendorService(context.organizationId, {
          category: form.category,
          name: form.name,
          description: form.description,
          pricingModel: form.pricingModel,
          startingPriceMinor: form.price
            ? Math.round(Number(form.price) * 100)
            : null,
          currency: form.currency,
          active: true,
        });
      if (mode === "package")
        await weddingOsApi.createVendorPackage(
          context.organizationId,
          serviceId,
          {
            name: form.name,
            description: form.description,
            basePriceMinor: form.price
              ? Math.round(Number(form.price) * 100)
              : null,
            currency: form.currency,
            includedItems: form.included
              ? form.included.split("\n").filter(Boolean)
              : [],
            excludedItems: [],
            active: true,
            position: 0,
          },
        );
      if (mode === "availability")
        await weddingOsApi.createVendorAvailability(context.organizationId, {
          startAt: new Date(form.start).toISOString(),
          endAt: new Date(form.end).toISOString(),
          status: form.status,
          source: "MANUAL",
          notePrivate: form.note || null,
        });
      setMode(null);
      setForm({
        category: "OTHER",
        pricingModel: "FIXED",
        currency: "RON",
        status: "AVAILABLE",
      });
      await load();
      toast({ title: "Date salvate", variant: "success" });
    } catch (error) {
      toast({
        title: "Datele nu au fost salvate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <VendorPage
      title="Servicii & disponibilitate"
      description="Catalog persistent, pachete și blocaje de calendar versionate."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      <div className="space-y-4">
        {context.can("vendor.services.write") ||
        context.can("vendor.availability.write") ? (
          <div className="flex flex-wrap gap-2">
            {context.can("vendor.services.write") ? (
              <Button onClick={() => setMode("service")}>
                <Plus className="size-4" />
                Serviciu
              </Button>
            ) : null}
            {context.can("vendor.availability.write") ? (
              <Button variant="outline" onClick={() => setMode("availability")}>
                <CalendarClock className="size-4" />
                Disponibilitate
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-line bg-subtle px-4 py-3 text-sm text-muted">
            Ai acces de consultare. Modificarea serviciilor și a
            disponibilității nu este inclusă în rolul tău.
          </p>
        )}
        {services.length === 0 ? (
          <EmptyState
            icon={Store}
            title="Fără servicii"
            description="Adaugă un serviciu înainte de publicarea profilului."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {services.map((service) => (
              <Card key={service.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between">
                    <p className="font-semibold text-ink">
                      {String(service.name)}
                    </p>
                    <Badge variant={service.active ? "success" : "neutral"}>
                      {service.active ? "activ" : "inactiv"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {String(service.description)}
                  </p>
                  <p className="mt-2 font-medium">
                    {service.startingPriceMinor
                      ? formatRON(Number(service.startingPriceMinor) / 100)
                      : "Preț la cerere"}
                  </p>
                  {context.can("vendor.services.write") ? (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setServiceId(service.id);
                        setMode("package");
                      }}
                    >
                      Adaugă pachet
                    </Button>
                  ) : null}
                  <div className="mt-3 space-y-1">
                    {(Array.isArray(service.packages)
                      ? (service.packages as OperationResource[])
                      : []
                    ).map((item) => (
                      <p
                        key={item.id}
                        className="rounded bg-subtle px-2 py-1 text-xs text-muted"
                      >
                        {String(item.name)} ·{" "}
                        {item.basePriceMinor
                          ? formatRON(Number(item.basePriceMinor) / 100)
                          : "la cerere"}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {context.can("vendor.availability.read") ? (
          <Card>
            <CardContent className="p-4">
              <p className="font-semibold text-ink">
                Intervale de disponibilitate ({availability.length})
              </p>
              <div className="mt-3 space-y-2">
                {availability.map((block) => (
                  <div key={block.id} className="flex justify-between text-sm">
                    <span>
                      {new Date(String(block.startAt)).toLocaleString("ro-RO")}{" "}
                      – {new Date(String(block.endAt)).toLocaleString("ro-RO")}
                    </span>
                    <Badge
                      variant={
                        block.status === "AVAILABLE"
                          ? "success"
                          : block.status === "BOOKED"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {String(block.status).toLowerCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Modal
          open={Boolean(mode)}
          onClose={() => setMode(null)}
          title={
            mode === "service"
              ? "Serviciu nou"
              : mode === "package"
                ? "Pachet nou"
                : "Interval disponibilitate"
          }
          footer={
            <>
              <Button variant="ghost" onClick={() => setMode(null)}>
                Renunță
              </Button>
              <Button onClick={() => void save()}>Salvează</Button>
            </>
          }
        >
          {mode === "availability" ? (
            <div className="space-y-3">
              <Field label="Început">
                <Input
                  type="datetime-local"
                  value={form.start ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Sfârșit">
                <Input
                  type="datetime-local"
                  value={form.end ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, end: event.target.value })
                  }
                />
              </Field>
              <Field label="Stare">
                <Select
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                >
                  {["AVAILABLE", "TENTATIVE", "UNAVAILABLE"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              {mode === "service" ? (
                <>
                  <Field label="Categorie">
                    <Select
                      value={form.category}
                      onChange={(event) =>
                        setForm({ ...form, category: event.target.value })
                      }
                    >
                      {[
                        "PHOTOGRAPHY",
                        "VIDEOGRAPHY",
                        "CATERING",
                        "MUSIC",
                        "DECOR",
                        "FLOWERS",
                        "TRANSPORT",
                        "OTHER",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Model preț">
                    <Select
                      value={form.pricingModel}
                      onChange={(event) =>
                        setForm({ ...form, pricingModel: event.target.value })
                      }
                    >
                      {[
                        "FIXED",
                        "PER_GUEST",
                        "PER_HOUR",
                        "PER_DAY",
                        "CUSTOM",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </Select>
                  </Field>
                </>
              ) : null}
              <Field label="Nume">
                <Input
                  value={form.name ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Descriere">
                <Textarea
                  value={form.description ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </Field>
              <Field label="Preț (RON)">
                <Input
                  inputMode="decimal"
                  value={form.price ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, price: event.target.value })
                  }
                />
              </Field>
              {mode === "package" ? (
                <Field label="Elemente incluse (unul pe linie)">
                  <Textarea
                    value={form.included ?? ""}
                    onChange={(event) =>
                      setForm({ ...form, included: event.target.value })
                    }
                  />
                </Field>
              ) : null}
            </div>
          )}
        </Modal>
      </div>
    </VendorPage>
  );
}
