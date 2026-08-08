"use client";

import * as React from "react";
import { BadgeCheck, CreditCard } from "lucide-react";
import { PortalShell } from "@/components/portals/portal-shell";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  weddingOsApi,
  type OperationResource,
} from "@/lib/api/client";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";

export default function PlatformTrustPage() {
  const { toast } = useToast();
  const [cases, setCases] = React.useState<OperationResource[]>([]);
  const [products, setProducts] = React.useState<OperationResource[]>([]);
  const [prices, setPrices] = React.useState<OperationResource[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [reviewRows, productRows, priceRows] = await Promise.all([
        weddingOsApi.platformReviewModeration(),
        weddingOsApi.platformSubscriptionProducts(),
        weddingOsApi.platformSubscriptionPrices(),
      ]);
      setCases(reviewRows.items);
      setProducts(productRows.items);
      setPrices(priceRows.items);
    } catch (error) {
      const message = apiErrorMessage(error);
      setLoadError(message);
      toast({
        title: "Centrul de control este restricționat",
        description: message,
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useDeferredLoad(load);
  const decide = async (row: OperationResource, decision: string) => {
    try {
      await weddingOsApi.platformModerationDecision(
        row.id,
        row.version,
        decision,
        "Decizie manuală documentată în Platform Ops",
      );
      await load();
      toast({ title: "Decizie de moderare salvată", variant: "success" });
    } catch (error) {
      toast({
        title: "Decizia nu a fost aplicată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <PortalShell
      role="Operațiuni platformă"
      title="Siguranță și monetizare"
      subtitle="Moderare și catalogul de abonamente, cu acces explicit la nivel de platformă."
      backHref="/admin"
      backLabel="Centru de control"
    >
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          <CardSkeleton lines={5} />
          <CardSkeleton lines={5} />
        </div>
      ) : loadError ? (
        <ErrorState
          title="Datele operaționale nu sunt disponibile"
          description={loadError}
          onRetry={() => void load()}
        />
      ) : (
        <>
          <Tabs defaultValue="reviews">
            <TabsList>
              <TabsTrigger value="reviews">Moderare</TabsTrigger>
              <TabsTrigger value="subscriptions">Abonamente</TabsTrigger>
            </TabsList>
            <TabsContent value="reviews" className="mt-4">
              {cases.length ? (
                <div className="space-y-3">
                  {cases.map((row) => (
                    <Card key={row.id}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div>
                          <p className="font-semibold text-ink">
                            Caz {row.id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-muted">
                            {String(row.sourceType)} · prioritate{" "}
                            {String(row.priority)}
                          </p>
                        </div>
                        <Badge
                          variant={
                            row.status === "OPEN" ? "warning" : "neutral"
                          }
                        >
                          {String(row.status)}
                        </Badge>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void decide(row, "NO_ACTION")}
                          >
                            Fără acțiune
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive-outline"
                            onClick={() => void decide(row, "HIDE_CONTENT")}
                          >
                            Ascunde
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={BadgeCheck}
                  title="Coada este goală"
                  description="Rapoartele și contestațiile vor apărea aici."
                />
              )}
            </TabsContent>
            <TabsContent value="subscriptions" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardContent className="p-5">
                    <p className="font-semibold text-ink">
                      Produse ({products.length})
                    </p>
                    {products.map((row) => (
                      <div
                        key={row.id}
                        className="mt-3 rounded-lg bg-subtle p-3"
                      >
                        <p className="text-sm font-medium">
                          {String(row.name)}
                        </p>
                        <p className="text-xs text-muted">
                          {String(row.status)}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <p className="font-semibold text-ink">
                      Prețuri active (
                      {prices.filter((row) => row.active).length})
                    </p>
                    {prices.map((row) => (
                      <div
                        key={row.id}
                        className="mt-3 rounded-lg bg-subtle p-3"
                      >
                        <p className="text-sm font-medium">
                          {(Number(row.amountMinor) / 100).toFixed(2)}{" "}
                          {String(row.currency)}
                        </p>
                        <p className="text-xs text-muted">
                          {String(row.provider)} · {String(row.billingInterval)}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted">
            <CreditCard className="size-4" />
            Acțiunile necesită permisiuni persistente la nivel de platformă, nu
            roluri ale evenimentului sau furnizorului.
          </p>
        </>
      )}
    </PortalShell>
  );
}
