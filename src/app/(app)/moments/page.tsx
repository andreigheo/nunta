"use client";

import * as React from "react";
import { Camera, Check, Eye, EyeOff, RefreshCw, ShieldAlert, Trash2, X } from "lucide-react";
import { apiErrorMessage, type OperationResource, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  Skeleton,
  useToast,
} from "@/components/ui";

type GuestMoment = OperationResource & {
  caption?: string | null;
  submittedAt?: string;
  reportCount?: number;
  media?: {
    mediaType?: string;
    moderationStatus?: string;
    derivativeAvailable?: boolean;
  } | null;
};

const filters = [
  { value: "all", label: "Toate" },
  { value: "PENDING_REVIEW", label: "De verificat" },
  { value: "APPROVED", label: "Aprobate" },
  { value: "REJECTED", label: "Respinse" },
];

export default function MomentsPage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = React.useState<GuestMoment[]>([]);
  const [filter, setFilter] = React.useState("all");
  const [loading, setLoading] = React.useState(true);
  const [workingId, setWorkingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [previews, setPreviews] = React.useState<Record<string, string>>({});

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await weddingOsApi.guestMomentsForModeration(currentWorkspace.id);
      setItems(result.items as GuestMoment[]);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode]);

  React.useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  async function moderate(moment: GuestMoment, transition: string) {
    if (!currentWorkspace) return;
    setWorkingId(moment.id);
    try {
      await weddingOsApi.moderateGuestMoment(
        currentWorkspace.id,
        moment.id,
        moment.version,
        transition,
        transition === "REJECT" ? "Conținut respins după verificare" : undefined,
      );
      await load();
      toast({
        title: transition === "APPROVE" ? "Moment aprobat" : "Moderare salvată",
        description: "Starea persistată este acum vizibilă și în Guest Companion.",
        variant: "success",
      });
    } catch (cause) {
      toast({ title: "Acțiunea nu a fost salvată", description: apiErrorMessage(cause), variant: "error" });
    } finally {
      setWorkingId(null);
    }
  }

  async function showPreview(moment: GuestMoment) {
    if (!currentWorkspace) return;
    setWorkingId(moment.id);
    try {
      const preview = await weddingOsApi.guestMomentPreview(currentWorkspace.id, moment.id);
      setPreviews((current) => ({ ...current, [moment.id]: preview.url }));
    } catch (cause) {
      toast({ title: "Preview indisponibil", description: apiErrorMessage(cause), variant: "error" });
    } finally {
      setWorkingId(null);
    }
  }

  const visible = items.filter((item) => filter === "all" || item.status === filter);
  const pending = items.filter((item) => item.status === "PENDING_REVIEW").length;
  const approved = items.filter((item) => ["APPROVED", "PUBLISHED"].includes(String(item.status))).length;

  if (loading)
    return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-20" /><Skeleton className="h-52" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Momentele invitaților"
        description="Verifică uploadurile scanate, aprobă conținutul sigur și gestionează raportările fără copii locale sau succes simulat."
        actions={<Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" />Actualizează</Button>}
      />

      {error ? <ErrorState title="Momentele nu au putut fi încărcate" description={error} onRetry={() => void load()} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Încărcate" value={items.length} />
        <Metric label="De verificat" value={pending} tone="warning" />
        <Metric label="Aprobate" value={approved} tone="success" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl ariaLabel="Filtrează moderarea" value={filter} onChange={setFilter} options={filters} />
        <p className="text-xs text-faint">Fișierele devin disponibile numai după scanare și moderare.</p>
      </div>

      {demoMode ? (
        <EmptyState icon={Camera} title="Momentele reale sunt oprite în demo" description="Modul demo nu citește și nu modifică uploaduri reale." />
      ) : visible.length === 0 ? (
        <EmptyState icon={Camera} title="Niciun moment în acest filtru" description="Uploadurile invitaților vor apărea aici după finalizarea verificării securizate." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((moment) => {
            const preview = previews[moment.id];
            const moderation = String(moment.media?.moderationStatus ?? "PENDING");
            return (
              <Card key={moment.id} className="overflow-hidden">
                <div className="flex aspect-video items-center justify-center bg-subtle">
                  {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed private previews cannot be fetched by the Next image optimizer
                    <img src={preview} alt={moment.caption || "Guest Moment"} className="size-full object-cover" />
                  ) : (
                    <Camera className="size-9 text-faint" aria-hidden />
                  )}
                </div>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-semibold text-ink">{moment.caption || "Moment fără descriere"}</p><p className="mt-1 text-xs text-faint">{moment.submittedAt ? new Date(moment.submittedAt).toLocaleString("ro-RO") : "Dată indisponibilă"}</p></div>
                    <Badge variant={moment.status === "PENDING_REVIEW" ? "warning" : ["APPROVED", "PUBLISHED"].includes(String(moment.status)) ? "success" : "neutral"}>{String(moment.status).replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted"><span>{moment.media?.mediaType === "VIDEO" ? "Video" : "Imagine"}</span><span>·</span><span>Scanare: {moderation}</span>{Number(moment.reportCount) > 0 ? <><span>·</span><span className="text-danger">{moment.reportCount} raportări</span></> : null}</div>
                  <div className="flex flex-wrap gap-2">
                    {moment.media?.derivativeAvailable ? <Button size="sm" variant="outline" disabled={workingId === moment.id} onClick={() => void showPreview(moment)}><Eye className="size-3.5" />Preview</Button> : null}
                    {moment.status === "PENDING_REVIEW" ? <><Button size="sm" disabled={workingId === moment.id} onClick={() => void moderate(moment, "APPROVE")}><Check className="size-3.5" />Aprobă</Button><Button size="sm" variant="outline" disabled={workingId === moment.id} onClick={() => void moderate(moment, "REJECT")}><X className="size-3.5" />Respinge</Button></> : null}
                    {["APPROVED", "PUBLISHED"].includes(String(moment.status)) ? <Button size="sm" variant="ghost" disabled={workingId === moment.id} onClick={() => void moderate(moment, "HIDE")}><EyeOff className="size-3.5" />Ascunde</Button> : null}
                    {moment.status === "HIDDEN" ? <Button size="sm" variant="outline" disabled={workingId === moment.id} onClick={() => void moderate(moment, "RESTORE")}><ShieldAlert className="size-3.5" />Restaurează</Button> : null}
                    {moment.status !== "DELETED" ? <Button size="sm" variant="ghost" disabled={workingId === moment.id} onClick={() => void moderate(moment, "DELETE_REQUEST")}><Trash2 className="size-3.5" />Ștergere</Button> : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warning" | "success" }) {
  return <Card><CardContent className="p-4"><p className="text-xs font-medium text-faint">{label}</p><p className={tone === "success" ? "mt-1 text-3xl font-semibold text-success" : tone === "warning" ? "mt-1 text-3xl font-semibold text-warning" : "mt-1 text-3xl font-semibold text-ink"}>{value}</p></CardContent></Card>;
}
