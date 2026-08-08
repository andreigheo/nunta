"use client";

import * as React from "react";
import { FileSignature, Send } from "lucide-react";
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
  useToast,
} from "@/components/ui";

export default function VendorContractsPage() {
  const context = useVendorOrganization();
  const { organizationId, organization, loading, can } = context;
  const { toast } = useToast();
  const [items, setItems] = React.useState<OperationResource[]>([]);
  const [selected, setSelected] = React.useState<OperationResource | null>(
    null,
  );
  const [typedName, setTypedName] = React.useState("");
  const load = React.useCallback(async () => {
    if (!organizationId || loading || !organization) return;
    if (!can("vendor.contract.read")) {
      setItems([]);
      return;
    }
    try {
      setItems((await weddingOsApi.vendorContracts(organizationId)).items);
    } catch (error) {
      toast({
        title: "Contractele nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [organizationId, organization, loading, can, toast]);
  useDeferredLoad(load);
  const transition = async (item: OperationResource, action: string) => {
    if (!context.organizationId) return;
    try {
      const next = await weddingOsApi.vendorTransitionContract(
        context.organizationId,
        item.id,
        item.version,
        action,
      );
      setSelected(next);
      await load();
    } catch (error) {
      toast({
        title: "Contractul nu a fost actualizat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  const acknowledge = async () => {
    if (!context.organizationId || !selected) return;
    const version = record(selected.currentVersion);
    try {
      const next = await weddingOsApi.vendorAcknowledgeContract(
        context.organizationId,
        selected.id,
        selected.version,
        {
          typedName,
          statementVersion: "weddingos-contract-ack-v1",
          contentHash: String(version.contentHash),
        },
      );
      setSelected(next);
      await load();
      toast({
        title: "Confirmare Vendor înregistrată",
        description:
          "Confirmare operațională Sarbato, nu semnătură electronică calificată.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Confirmarea nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };
  return (
    <VendorPage
      title="Contracte Vendor OS"
      description="Versiuni comune, confirmări duale și disclaimer juridic explicit."
      organizationId={context.organizationId}
      organizations={context.organizations}
      onOrganizationChange={context.setOrganizationId}
    >
      {items.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="Niciun contract"
          description="Contractele apar după acceptarea unei oferte."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} interactive onClick={() => setSelected(item)}>
              <CardContent className="p-4">
                <div className="flex justify-between">
                  <p className="font-semibold">
                    Contract {item.id.slice(0, 8)}
                  </p>
                  <Badge
                    variant={
                      item.status === "ACKNOWLEDGED" ? "success" : "brand"
                    }
                  >
                    {String(item.status).toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted">
                  confirmări{" "}
                  {Array.isArray(item.acknowledgements)
                    ? item.acknowledgements.length
                    : 0}
                  /2
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Contract operațional"
        description={
          selected
            ? `${String(selected.status).toLowerCase()} · versiunea ${selected.version}`
            : undefined
        }
        width="xl"
      >
        {selected ? (
          <div className="space-y-4 p-5">
            <p className="rounded bg-warning-soft p-3 text-sm text-warning-strong">
              {String(selected.disclaimer)}
            </p>
            <pre className="overflow-auto rounded bg-subtle p-3 text-xs text-muted">
              {JSON.stringify(
                record(selected.currentVersion).document ?? {},
                null,
                2,
              )}
            </pre>
            {context.can("vendor.contract.write") &&
            selected.status === "DRAFT" ? (
              <Button
                onClick={() => void transition(selected, "SUBMIT_FOR_REVIEW")}
              >
                <Send className="size-4" />
                Trimite la verificare
              </Button>
            ) : null}
            {context.can("vendor.contract.write") &&
            ["IN_REVIEW", "CHANGES_REQUESTED"].includes(
              String(selected.status),
            ) ? (
              <Button onClick={() => void transition(selected, "MARK_READY")}>
                Pregătit pentru confirmare
              </Button>
            ) : null}
            {context.can("vendor.contract.acknowledge") &&
            selected.status === "READY_FOR_ACKNOWLEDGEMENT" ? (
              <Card>
                <CardContent className="p-4">
                  <Field label="Numele pentru confirmare">
                    <Input
                      value={typedName}
                      onChange={(event) => setTypedName(event.target.value)}
                    />
                  </Field>
                  <Button className="mt-3" onClick={() => void acknowledge()}>
                    Confirmă în Sarbato
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </VendorPage>
  );
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
