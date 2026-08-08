"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { FileText, MessageSquare, Send, XCircle } from "lucide-react";
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
  Textarea,
  useToast,
} from "@/components/ui";

export default function VendorOffersPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const search = useSearchParams();
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<OperationResource | null>(
    null,
  );
  const [messages, setMessages] = React.useState<OperationResource[]>([]);
  const [body, setBody] = React.useState("");
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.offer.read") || !can("vendor.rfq.read")) {
      setItems([]);
      return;
    }
    try {
      const entries = (await weddingOsApi.vendorRfqs(organizationId)).items;
      const rfqs = entries.map((entry) => entry.rfq as OperationResource);
      const offerIds = [
        ...new Set(
          rfqs
            .map((item) => item.existingOfferId)
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      const offers = await Promise.all(
        offerIds.map((id) => weddingOsApi.vendorOffer(organizationId, id)),
      );
      setItems(offers);
      const requested = search.get("offer");
      if (requested)
        setSelected(
          offers.find((offer) => offer.id === requested) ??
            (await weddingOsApi.vendorOffer(organizationId, requested)),
        );
    } catch (error) {
      toast({
        title: "Ofertele nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, search, toast]);
  useDeferredLoad(load);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!context.organizationId || !selected?.negotiationThreadId) {
        setMessages([]);
        return;
      }
      void weddingOsApi
        .vendorNegotiationMessages(context.organizationId, selected.id)
        .then((result) => setMessages(result.items));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [context.organizationId, selected]);
  const submit = async () => {
    if (!context.organizationId || !selected) return;
    try {
      const next = await weddingOsApi.vendorSubmitOffer(
        context.organizationId,
        selected.id,
        selected.version,
      );
      setSelected(next);
      await load();
      toast({
        title: "Oferta a fost trimisă",
        description: "Cuplul poate acum analiza versiunea imuabilă a ofertei.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Oferta nu a fost trimisă",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const withdraw = async () => {
    if (!context.organizationId || !selected) return;
    try {
      await weddingOsApi.vendorWithdrawOffer(
        context.organizationId,
        selected.id,
        selected.version,
      );
      setSelected(null);
      await load();
      toast({ title: "Oferta a fost retrasă", variant: "success" });
    } catch (error) {
      toast({
        title: "Oferta nu a fost retrasă",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const sendMessage = async () => {
    if (!context.organizationId || !selected || !body.trim()) return;
    try {
      await weddingOsApi.vendorSendNegotiationMessage(
        context.organizationId,
        selected.id,
        body,
      );
      setBody("");
      setMessages(
        (
          await weddingOsApi.vendorNegotiationMessages(
            context.organizationId,
            selected.id,
          )
        ).items,
      );
    } catch (error) {
      toast({
        title: "Mesajul nu a fost trimis",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <VendorPage
      title="Oferte Vendor OS"
      description="Drafturi versionate, submit explicit și negociere persistentă."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nicio ofertă"
          description="Deschide un RFQ și creează prima ofertă draft."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((offer) => (
            <Card key={offer.id} interactive onClick={() => setSelected(offer)}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <p className="font-semibold text-ink">
                    Oferta {offer.id.slice(0, 8)}
                  </p>
                  <Badge
                    variant={
                      offer.status === "ACCEPTED"
                        ? "success"
                        : offer.status === "DRAFT"
                          ? "neutral"
                          : "brand"
                    }
                  >
                    {String(offer.status).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 text-xl font-semibold">
                  {formatRON(Number(offer.totalMinor ?? 0) / 100)}
                </p>
                <p className="text-xs text-muted">
                  versiunea {String(offer.currentVersionNumber)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Ofertă"
        description={
          selected
            ? `${String(selected.status).toLowerCase()} · versiunea ${selected.version}`
            : undefined
        }
        width="xl"
      >
        {selected ? (
          <div className="space-y-4 p-5">
            {context.can("vendor.offer.write") ||
            context.can("vendor.offer.submit") ? (
              <div className="flex gap-2">
                {context.can("vendor.offer.submit") &&
                (selected.status === "DRAFT" ||
                  selected.status === "REVISION_REQUESTED") ? (
                  <Button onClick={() => void submit()}>
                    <Send className="size-4" />
                    Trimite oferta
                  </Button>
                ) : null}
                {context.can("vendor.offer.write") &&
                [
                  "SUBMITTED",
                  "UNDER_REVIEW",
                  "REVISION_REQUESTED",
                  "REVISED",
                ].includes(String(selected.status)) ? (
                  <Button
                    variant="destructive-outline"
                    onClick={() => void withdraw()}
                  >
                    <XCircle className="size-4" />
                    Retrage
                  </Button>
                ) : null}
              </div>
            ) : null}
            <pre className="overflow-auto rounded bg-subtle p-3 text-xs text-muted">
              {JSON.stringify(
                {
                  currentVersion: selected.currentVersion,
                  lineItems: selected.lineItems,
                  answers: selected.answers,
                },
                null,
                2,
              )}
            </pre>
            <Card>
              <CardContent className="p-4">
                <p className="font-semibold">Negociere ({messages.length})</p>
                <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                  {messages.map((message) => (
                    <p
                      key={message.id}
                      className="rounded bg-subtle p-2 text-sm"
                    >
                      <span className="font-medium">
                        {String(message.senderType).toLowerCase()}:
                      </span>{" "}
                      {String(message.body)}
                    </p>
                  ))}
                </div>
                {context.can("vendor.offer.write") ? (
                  <>
                    <Field label="Mesaj" className="mt-3">
                      <Textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                      />
                    </Field>
                    <Button
                      className="mt-2"
                      size="sm"
                      onClick={() => void sendMessage()}
                    >
                      <MessageSquare className="size-4" />
                      Trimite
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </Drawer>
    </VendorPage>
  );
}
