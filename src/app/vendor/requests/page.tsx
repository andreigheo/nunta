"use client";

import * as React from "react";
import { Inbox, Send, XCircle } from "lucide-react";
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
  Drawer,
  EmptyState,
  Field,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";

export default function VendorRequestsPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<OperationResource | null>(
    null,
  );
  const [form, setForm] = React.useState({
    name: "Servicii ofertate",
    description: "",
    amount: "",
    tax: "0",
    deposit: "",
    availability: "Data solicitată este disponibilă.",
    timeline: "Livrare conform brief-ului.",
    cancellation: "Condițiile de anulare vor fi stabilite în contract.",
  });
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.rfq.read")) {
      setItems([]);
      return;
    }
    try {
      const result = await weddingOsApi.vendorRfqs(organizationId);
      setItems(
        result.items.map((entry) => ({
          ...(entry.rfq as OperationResource),
          recipient: entry.recipient,
        })),
      );
    } catch (error) {
      toast({
        title: "Inboxul RFQ nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(load);
  const open = async (item: OperationResource) => {
    if (!context.organizationId) return;
    try {
      const value = await weddingOsApi.vendorOpenRfq(
        context.organizationId,
        item.id,
      );
      setSelected({
        ...(value.rfq as OperationResource),
        recipient: value.recipient,
      });
      await load();
    } catch (error) {
      toast({
        title: "RFQ-ul nu a putut fi deschis",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const decline = async (item: OperationResource) => {
    if (!context.organizationId) return;
    try {
      await weddingOsApi.vendorDeclineRfq(
        context.organizationId,
        item.id,
        "Nu putem răspunde în condițiile curente",
      );
      setSelected(null);
      await load();
      toast({ title: "RFQ refuzat", variant: "success" });
    } catch (error) {
      toast({
        title: "RFQ-ul nu a fost refuzat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const createOffer = async () => {
    if (!context.organizationId || !selected) return;
    try {
      const offer = await weddingOsApi.vendorCreateOffer(
        context.organizationId,
        selected.id,
        {
          currency: String(selected.currency ?? "RON"),
          lineItems: [
            {
              type: "SERVICE",
              name: form.name,
              description: form.description,
              quantity: 1,
              unit: "FIXED",
              unitPriceMinor: Math.round(Number(form.amount) * 100),
              optional: false,
              selected: true,
              position: 0,
            },
          ],
          answers: [],
          discountMinor: 0,
          taxRateBasisPoints: Number(form.tax),
          depositMinor: form.deposit
            ? Math.round(Number(form.deposit) * 100)
            : null,
          pricingNotes: null,
          terms: {},
          availabilityConfirmation: form.availability,
          deliveryTimeline: form.timeline,
          cancellationTerms: form.cancellation,
          validUntil: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        },
      );
      toast({
        title: "Ofertă salvată ca draft",
        description:
          "Versiunea este imuabilă după submit; reviziile creează versiuni noi.",
        variant: "success",
      });
      window.location.assign(
        `/vendor/offers?organization=${context.organizationId}&offer=${offer.id}`,
      );
    } catch (error) {
      toast({
        title: "Oferta nu a fost creată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <VendorPage
      title="Inbox RFQ"
      description="Cereri livrate asincron și izolate la organizația selectată."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nicio cerere activă"
          description="RFQ-urile trimise organizației apar aici după procesarea workerului."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} interactive onClick={() => void open(item)}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <p className="font-semibold text-ink">{String(item.title)}</p>
                  <Badge variant="brand">
                    {String(item.status).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">
                  {String(item.description)}
                </p>
                <p className="mt-3 text-xs text-faint">
                  Termen:{" "}
                  {new Date(String(item.responseDeadline)).toLocaleString(
                    "ro-RO",
                  )}{" "}
                  · buget maxim{" "}
                  {item.budgetRangeMaxMinor
                    ? formatRON(Number(item.budgetRangeMaxMinor) / 100)
                    : "nespecificat"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? String(selected.title) : undefined}
        description={
          selected
            ? `${String(selected.category).toLowerCase()} · ${String(selected.status).toLowerCase()}`
            : undefined
        }
        width="xl"
      >
        {selected ? (
          <div className="space-y-4 p-5">
            <p className="whitespace-pre-wrap text-sm text-muted">
              {String(selected.description)}
            </p>
            <pre className="overflow-auto rounded bg-subtle p-3 text-xs text-muted">
              {JSON.stringify(
                {
                  requirements: selected.requirements ?? [],
                  questions: selected.questions ?? [],
                },
                null,
                2,
              )}
            </pre>
            {selected.existingOfferId ? (
              <Button
                onClick={() =>
                  window.location.assign(
                    `/vendor/offers?organization=${context.organizationId}&offer=${String(selected.existingOfferId)}`,
                  )
                }
              >
                Deschide oferta existentă
              </Button>
            ) : (
              <Card>
                <fieldset disabled={!context.can("vendor.offer.write")}>
                  <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                    {!context.can("vendor.offer.write") ? (
                      <p className="sm:col-span-2 rounded-lg bg-subtle px-3 py-2 text-sm text-muted">
                        Rolul tău poate consulta cererea, dar nu poate crea o
                        ofertă.
                      </p>
                    ) : null}
                    <Field label="Linie ofertă">
                      <Input
                        value={form.name}
                        onChange={(event) =>
                          setForm({ ...form, name: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Sumă fără taxe (RON)">
                      <Input
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(event) =>
                          setForm({ ...form, amount: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Descriere" className="sm:col-span-2">
                      <Textarea
                        value={form.description}
                        onChange={(event) =>
                          setForm({ ...form, description: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Taxă (basis points)">
                      <Input
                        inputMode="numeric"
                        value={form.tax}
                        onChange={(event) =>
                          setForm({ ...form, tax: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Avans (RON)">
                      <Input
                        inputMode="decimal"
                        value={form.deposit}
                        onChange={(event) =>
                          setForm({ ...form, deposit: event.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label="Confirmare disponibilitate"
                      className="sm:col-span-2"
                    >
                      <Textarea
                        value={form.availability}
                        onChange={(event) =>
                          setForm({ ...form, availability: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Timeline livrare" className="sm:col-span-2">
                      <Textarea
                        value={form.timeline}
                        onChange={(event) =>
                          setForm({ ...form, timeline: event.target.value })
                        }
                      />
                    </Field>
                    <div className="sm:col-span-2 flex gap-2">
                      {context.can("vendor.offer.write") ? (
                        <Button
                          disabled={!form.amount || !form.description}
                          onClick={() => void createOffer()}
                        >
                          <Send className="size-4" />
                          Salvează draft
                        </Button>
                      ) : null}
                      {context.can("vendor.rfq.decline") ? (
                        <Button
                          variant="destructive-outline"
                          onClick={() => void decline(selected)}
                        >
                          <XCircle className="size-4" />
                          Refuză RFQ
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </fieldset>
              </Card>
            )}
          </div>
        ) : null}
      </Drawer>
    </VendorPage>
  );
}
