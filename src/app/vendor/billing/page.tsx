"use client";

import * as React from "react";
import { Check, CreditCard, ExternalLink } from "lucide-react";
import { VendorPage } from "@/components/vendor/vendor-page";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useVendorOrganization } from "@/lib/api/vendor-organization";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";

export default function VendorBillingPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [subscription, setSubscription] =
    React.useState<OperationResource | null>(null);
  const [plans, setPlans] = React.useState<OperationResource[]>([]);
  const [usage, setUsage] = React.useState<Record<string, unknown>>({});
  const [entitlements, setEntitlements] = React.useState<
    Record<string, unknown>
  >({});
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.subscription.read")) {
      setSubscription(null);
      setPlans([]);
      setUsage({});
      setEntitlements({});
      return;
    }
    try {
      const [current, catalog, counters, access] = await Promise.all([
        weddingOsApi.vendorSubscription(organizationId),
        weddingOsApi.vendorSubscriptionPlans(),
        weddingOsApi.vendorUsage(organizationId),
        weddingOsApi.vendorEntitlements(organizationId),
      ]);
      setSubscription(current);
      setPlans(catalog.items);
      setUsage(counters);
      setEntitlements(access);
    } catch (error) {
      toast({
        title: "Abonamentul nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(load);
  const choose = async (plan: OperationResource) => {
    if (!context.organizationId) return;
    setBusy(true);
    try {
      await weddingOsApi.createVendorSubscriptionCheckout(
        context.organizationId,
        String(plan.key),
      );
      await load();
      toast({
        title: "Plan activat",
        description:
          "În mediul local providerul fake a confirmat checkout-ul; în producție se folosește URL-ul hosted al providerului.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Checkout-ul nu a fost creat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };
  const toggleCancel = async () => {
    if (!subscription || !context.organizationId) return;
    setBusy(true);
    try {
      const row = subscription.cancelAtPeriodEnd
        ? await weddingOsApi.resumeVendorSubscription(
            context.organizationId,
            subscription.version,
          )
        : await weddingOsApi.cancelVendorSubscription(
            context.organizationId,
            subscription.version,
          );
      setSubscription(row);
      toast({
        title: row.cancelAtPeriodEnd
          ? "Anulare programată"
          : "Abonament reluat",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Abonamentul nu a fost actualizat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };
  const openPortal = async () => {
    if (!context.organizationId) return;
    setBusy(true);
    try {
      const session = await weddingOsApi.createVendorSubscriptionPortal(
        context.organizationId,
      );
      const url = String(session.url ?? "");
      if (
        !url.startsWith("/") &&
        !url.startsWith("http://") &&
        !url.startsWith("https://")
      )
        throw new Error("Providerul nu a întors un URL sigur");
      window.location.assign(url);
    } catch (error) {
      toast({
        title: "Portalul de billing nu a fost deschis",
        description: apiErrorMessage(error),
        variant: "error",
      });
      setBusy(false);
    }
  };
  const effectivePlan = plans.find((plan) => plan.id === entitlements.planId);
  return (
    <VendorPage
      title="Abonament Vendor OS"
      description="Plan, trial, entitlement-uri și utilizare calculate din starea providerului."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      {!subscription ? (
        <EmptyState
          icon={CreditCard}
          title="Selectează o organizație"
          description="Abonamentul gratuit este creat când organizația este încărcată."
        />
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="text-xs text-muted">Status provider</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {String(subscription.status)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {subscription.currentPeriodEnd
                    ? `Perioada curentă până la ${new Date(String(subscription.currentPeriodEnd)).toLocaleDateString("ro-RO")}`
                    : "Plan fără perioadă facturată"}
                </p>
                {subscription.gracePeriodEndAt ? (
                  <p className="mt-1 text-xs text-danger">
                    Perioada de grație expiră la{" "}
                    {new Date(
                      String(subscription.gracePeriodEndAt),
                    ).toLocaleString("ro-RO")}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  Plan efectiv: {String(effectivePlan?.key ?? "FREE")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    subscription.status === "ACTIVE" ||
                    subscription.status === "TRIALING"
                      ? "success"
                      : "warning"
                  }
                >
                  {subscription.cancelAtPeriodEnd
                    ? "anulare programată"
                    : String(subscription.status).toLowerCase()}
                </Badge>
                {context.can("vendor.subscription.portal") ? (
                  <Button
                    variant="outline"
                    disabled={busy || !subscription.providerCustomerId}
                    onClick={() => void openPortal()}
                  >
                    <ExternalLink className="size-4" />
                    Portal billing
                  </Button>
                ) : null}
                {context.can("vendor.subscription.manage") ? (
                  <Button
                    variant="outline"
                    disabled={busy || !subscription.providerSubscriptionId}
                    onClick={() => void toggleCancel()}
                  >
                    {subscription.cancelAtPeriodEnd
                      ? "Reia"
                      : "Anulează la finalul perioadei"}
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const planEntitlements =
                plan.entitlements && typeof plan.entitlements === "object"
                  ? (plan.entitlements as Record<string, unknown>)
                  : {};
              const prices = Array.isArray(plan.prices)
                ? (plan.prices as OperationResource[])
                : [];
              return (
                <Card key={plan.id}>
                  <CardContent className="flex h-full flex-col p-5">
                    <p className="text-lg font-semibold text-ink">
                      {String(plan.name)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {String(plan.description)}
                    </p>
                    <p className="mt-4 text-xl font-semibold text-ink">
                      {prices[0]
                        ? `${(Number(prices[0].amountMinor) / 100).toFixed(0)} ${String(prices[0].currency)}/lună`
                        : "Gratuit"}
                    </p>
                    <div className="my-4 space-y-2">
                      {Object.entries(planEntitlements)
                        .slice(0, 5)
                        .map(([key, value]) => (
                          <p
                            key={key}
                            className="flex gap-2 text-xs text-muted"
                          >
                            <Check className="size-4 shrink-0 text-success" />
                            {key.toLowerCase().replaceAll("_", " ")}:{" "}
                            {String(value)}
                          </p>
                        ))}
                    </div>
                    {context.can("vendor.subscription.checkout") ? (
                      <Button
                        className="mt-auto"
                        disabled={busy}
                        onClick={() => void choose(plan)}
                      >
                        Alege {String(plan.name)}
                      </Button>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <p className="font-semibold text-ink">
                  Entitlement-uri efective
                </p>
                <pre className="mt-3 overflow-auto rounded-lg bg-subtle p-3 text-xs text-muted">
                  {JSON.stringify(
                    entitlements.snapshot &&
                      typeof entitlements.snapshot === "object"
                      ? ((entitlements.snapshot as Record<string, unknown>)
                          .entitlements ?? {})
                      : {},
                    null,
                    2,
                  )}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="font-semibold text-ink">
                  Utilizare în perioada curentă
                </p>
                <pre className="mt-3 overflow-auto rounded-lg bg-subtle p-3 text-xs text-muted">
                  {JSON.stringify(usage.resources ?? {}, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </VendorPage>
  );
}
