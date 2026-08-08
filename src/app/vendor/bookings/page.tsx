"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, Play, XCircle } from "lucide-react";
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
  useToast,
} from "@/components/ui";

export default function VendorBookingsPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.booking.read")) {
      setItems([]);
      return;
    }
    try {
      setItems((await weddingOsApi.vendorBookings(organizationId)).items);
    } catch (error) {
      toast({
        title: "Booking-urile nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(load);
  const transition = async (item: OperationResource, action: string) => {
    if (!context.organizationId) return;
    try {
      await weddingOsApi.vendorTransitionBooking(
        context.organizationId,
        item.id,
        item.version,
        action,
        action === "CANCEL" ? "Anulat de furnizor" : undefined,
      );
      await load();
      toast({ title: "Booking actualizat", variant: "success" });
    } catch (error) {
      toast({
        title: "Booking-ul nu a fost actualizat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <VendorPage
      title="Bookings Vendor OS"
      description="Calendar de servicii și tranziții autorizate pentru furnizor."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Niciun booking"
          description="Booking-urile apar după acceptarea unei oferte de către cuplu."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <p className="font-semibold">{String(item.title)}</p>
                  <Badge
                    variant={
                      item.status === "COMPLETED"
                        ? "success"
                        : item.status === "CANCELLED"
                          ? "danger"
                          : "brand"
                    }
                  >
                    {String(item.status).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 text-lg font-semibold">
                  {formatRON(Number(item.totalMinor ?? 0) / 100)}
                </p>
                <p className="text-xs text-muted">
                  {item.serviceStartAt
                    ? new Date(String(item.serviceStartAt)).toLocaleString(
                        "ro-RO",
                      )
                    : "Data serviciului nespecificată"}
                </p>
                {context.can("vendor.booking.transition") ? (
                  <div className="mt-3 flex gap-2">
                    {item.status === "CONFIRMED" ? (
                      <Button
                        size="sm"
                        onClick={() => void transition(item, "START")}
                      >
                        <Play className="size-4" />
                        Începe
                      </Button>
                    ) : null}
                    {item.status === "IN_PROGRESS" ? (
                      <Button
                        size="sm"
                        onClick={() => void transition(item, "COMPLETE")}
                      >
                        <CheckCircle2 className="size-4" />
                        Finalizează
                      </Button>
                    ) : null}
                    {!["CANCELLED", "COMPLETED", "ARCHIVED"].includes(
                      String(item.status),
                    ) ? (
                      <Button
                        size="sm"
                        variant="destructive-outline"
                        onClick={() => void transition(item, "CANCEL")}
                      >
                        <XCircle className="size-4" />
                        Anulează
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </VendorPage>
  );
}
