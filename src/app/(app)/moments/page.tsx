"use client";
import * as React from "react";
import Image from "next/image";
import {
  Camera,
  Check,
  Download,
  EyeOff,
  FileVideo,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import {
  apiErrorMessage,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  SegmentedControl,
  Skeleton,
  useToast,
} from "@/components/ui";
import { CollectionControl } from "@/components/moments/collection-control";

type Moment = OperationResource & {
  caption?: string | null;
  contributorName?: string | null;
  submittedAt?: string;
  originalFileName?: string;
  sizeBytes?: number;
  media?: {
    mediaType?: string;
    moderationStatus?: string;
    derivativeAvailable?: boolean;
  } | null;
};
const labels: Record<string, string> = {
  UPLOADING: "Se încarcă",
  PROCESSING: "Se verifică",
  PENDING_REVIEW: "De verificat",
  APPROVED: "Aprobat",
  PUBLISHED: "Publicat",
  REJECTED: "Respins",
  HIDDEN: "Ascuns",
  DELETED: "Șters",
};
const compactQuery = "(max-width: 1279px)";
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const compactSnapshot = () => window.matchMedia(compactQuery).matches;

export default function MomentsPage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  return (
    <MomentsContent key={`${currentWorkspace?.id ?? "none"}:${demoMode}`} />
  );
}
function MomentsContent() {
  const { currentWorkspace, demoMode, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const [items, setItems] = React.useState<Moment[]>([]);
  const [filter, setFilter] = React.useState("all");
  const [loading, setLoading] = React.useState(
    !demoMode && Boolean(currentWorkspace),
  );
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const compact = React.useSyncExternalStore(
    subscribe,
    compactSnapshot,
    () => false,
  );
  const canManage =
    bootstrap?.membership.capabilities.includes("guest_moment.moderate") ??
    false;
  const workspaceId = currentWorkspace?.id;
  const load = React.useCallback(
    (quiet = false) => {
      if (!workspaceId || demoMode) return;
      return weddingOsApi
        .guestMomentsForModeration(workspaceId)
        .then((result) => {
          setItems(result.items as Moment[]);
          setError("");
        })
        .catch((cause) => {
          if (!quiet) setError(apiErrorMessage(cause));
        })
        .finally(() => setLoading(false));
    },
    [workspaceId, demoMode],
  );
  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    if (demoMode) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !working) void load(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [load, demoMode, working]);
  const selected = items.find((item) => item.id === selectedId);
  const visible = items.filter(
    (item) =>
      filter === "all" ||
      item.status === filter ||
      (filter === "APPROVED" && item.status === "PUBLISHED"),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(visible.length / 12) - 1),
  );
  const pageItems = visible.slice(currentPage * 12, currentPage * 12 + 12);
  async function moderate(moment: Moment, transition: string) {
    if (!workspaceId || working) return;
    setWorking(true);
    try {
      await weddingOsApi.moderateGuestMoment(
        workspaceId,
        moment.id,
        moment.version,
        transition,
        transition === "REJECT"
          ? "Respins după verificarea organizatorului"
          : undefined,
      );
      await load(true);
      setDeleteId(null);
      toast({ title: "Materialul a fost actualizat", variant: "success" });
    } catch (cause) {
      toast({
        title: "Modificarea nu a fost salvată",
        description: apiErrorMessage(cause),
        variant: "error",
      });
      await load(true);
    } finally {
      setWorking(false);
    }
  }
  async function download(moment: Moment) {
    if (!workspaceId || working) return;
    setWorking(true);
    try {
      const result = await weddingOsApi.downloadMoment(workspaceId, moment.id);
      const response = await fetch(result.url);
      if (!response.ok) throw new Error("Materialul nu a putut fi descărcat.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = result.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) {
      toast({
        title: "Descărcare indisponibilă",
        description: apiErrorMessage(cause),
        variant: "error",
      });
    } finally {
      setWorking(false);
    }
  }
  function actions(moment: Moment) {
    const safe = ["AUTOMATED_SAFE", "APPROVED", "HIDDEN"].includes(
      moment.media?.moderationStatus ?? "",
    );
    return (
      <div className="flex flex-col gap-2">
        {moment.status === "PENDING_REVIEW" && (
          <>
            <Button
              className="w-full"
              disabled={working || !safe}
              onClick={() => void moderate(moment, "APPROVE")}
            >
              <Check className="size-4" />
              Aprobă
            </Button>
            <Button
              variant="destructive-outline"
              disabled={working}
              onClick={() => void moderate(moment, "REJECT")}
            >
              <X className="size-4" />
              Respinge
            </Button>
          </>
        )}
        {["APPROVED", "PUBLISHED"].includes(String(moment.status)) && (
          <Button
            variant="outline"
            disabled={working}
            onClick={() => void moderate(moment, "HIDE")}
          >
            <EyeOff className="size-4" />
            Ascunde
          </Button>
        )}
        {moment.status === "HIDDEN" && (
          <Button
            variant="outline"
            disabled={working}
            onClick={() => void moderate(moment, "RESTORE")}
          >
            <ShieldAlert className="size-4" />
            Restaurează
          </Button>
        )}
        {safe && moment.status !== "REJECTED" && (
          <Button
            variant="outline"
            disabled={working}
            onClick={() => void download(moment)}
          >
            <Download className="size-4" />
            Descarcă
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={working}
          onClick={() => setDeleteId(moment.id)}
        >
          <Trash2 className="size-4" />
          Șterge materialul
        </Button>
      </div>
    );
  }
  const details =
    selected && workspaceId ? (
      <MomentDetails
        key={`${selected.id}:${selected.version}`}
        moment={selected}
        workspaceId={workspaceId}
        onClose={compact ? undefined : () => setSelectedId(null)}
      >
        {actions(selected)}
      </MomentDetails>
    ) : null;
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Momentele evenimentului"
        description="Colectează, verifică și gestionează materialele încărcate de participanți."
        actions={
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Actualizează
          </Button>
        }
      />
      {workspaceId && (
        <CollectionControl
          key={workspaceId}
          workspaceId={workspaceId}
          demoMode={demoMode}
          canManage={canManage}
        />
      )}
      {error && (
        <ErrorState
          title="Materialele nu au putut fi încărcate"
          description={error}
          onRetry={() => void load()}
        />
      )}
      <Card className="p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto"
            ariaLabel="Filtrează materialele"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(0);
              setSelectedId(null);
            }}
            options={[
              { value: "all", label: "Toate" },
              {
                value: "PENDING_REVIEW",
                label: `De verificat (${items.filter((i) => i.status === "PENDING_REVIEW").length})`,
              },
              {
                value: "APPROVED",
                label: `Aprobate (${items.filter((i) => ["APPROVED", "PUBLISHED"].includes(String(i.status))).length})`,
              },
              { value: "REJECTED", label: "Respinse" },
            ]}
          />
          <span className="text-xs text-muted">{visible.length} materiale</span>
        </div>
        {loading && !items.length ? (
          <Skeleton className="h-64" />
        ) : demoMode ? (
          <EmptyState
            icon={Camera}
            title="Momentele apar aici după colectare"
            description="În demo nu se încarcă și nu se modifică materiale reale."
          />
        ) : !visible.length ? (
          <EmptyState
            icon={Camera}
            title="Niciun moment în acest filtru"
            description="Distribuie codul QR. Fotografiile și clipurile participanților vor apărea aici."
          />
        ) : (
          <div
            className={
              selected && !compact
                ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"
                : ""
            }
          >
            <div className="min-w-0">
              <div
                className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${selected && !compact ? "2xl:grid-cols-4" : "xl:grid-cols-4"}`}
              >
                {pageItems.map((moment) => (
                  <button
                    key={moment.id}
                    type="button"
                    disabled={!canManage}
                    onClick={() => setSelectedId(moment.id)}
                    aria-label={`Deschide ${moment.originalFileName || moment.caption || "momentul"}`}
                    aria-pressed={selectedId === moment.id}
                    className={`group min-w-0 overflow-hidden rounded-lg border bg-surface text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selectedId === moment.id ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong"}`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-subtle">
                      <MomentThumbnail
                        workspaceId={workspaceId!}
                        moment={moment}
                        canRead={canManage}
                      />
                      <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-1">
                        {moment.media?.mediaType === "VIDEO" && (
                          <span className="rounded bg-black/70 p-1 text-white">
                            <FileVideo
                              className="size-3.5"
                              aria-label="Video"
                            />
                          </span>
                        )}
                        <Badge
                          variant={
                            moment.status === "PENDING_REVIEW"
                              ? "warning"
                              : ["APPROVED", "PUBLISHED"].includes(
                                    String(moment.status),
                                  )
                                ? "success"
                                : "neutral"
                          }
                        >
                          {labels[String(moment.status)] || moment.status}
                        </Badge>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-xs font-medium text-ink">
                        {moment.originalFileName ||
                          moment.caption ||
                          "Moment de la eveniment"}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {moment.contributorName || "Participant anonim"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {visible.length > 12 && (
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Înapoi
                  </Button>
                  <span className="text-xs text-muted">
                    Pagina {currentPage + 1} din{" "}
                    {Math.ceil(visible.length / 12)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(currentPage + 1) * 12 >= visible.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Înainte
                  </Button>
                </div>
              )}
            </div>
            {selected && !compact && (
              <aside
                className="sticky top-20 min-w-0 rounded-lg border border-line p-3"
                aria-label="Detaliile materialului"
              >
                {details}
              </aside>
            )}
          </div>
        )}
      </Card>
      <Modal
        open={Boolean(selected && compact && !deleteId)}
        onClose={() => setSelectedId(null)}
        title="Detaliile materialului"
        size="lg"
      >
        {compact && details}
      </Modal>
      <Modal
        open={Boolean(deleteId)}
        onClose={() => {
          if (!working) setDeleteId(null);
        }}
        title="Ștergi acest material?"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={working}
              onClick={() => setDeleteId(null)}
            >
              Renunță
            </Button>
            <Button
              variant="destructive"
              disabled={working}
              onClick={() => {
                const item = items.find((i) => i.id === deleteId);
                if (item) void moderate(item, "DELETE_REQUEST");
              }}
            >
              Șterge materialul
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Materialul va fi eliminat din lista evenimentului și din galeriile
          asociate.
        </p>
      </Modal>
    </div>
  );
}
function MomentThumbnail({
  moment,
  workspaceId,
  canRead,
}: {
  moment: Moment;
  workspaceId: string;
  canRead: boolean;
}) {
  const [url, setUrl] = React.useState("");
  React.useEffect(() => {
    if (!moment.media?.derivativeAvailable || !canRead) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await weddingOsApi.guestMomentPreview(
          workspaceId,
          moment.id,
        );
        if (!cancelled) setUrl(result.url);
      } catch {
        /* Pending preview can be retried on the next refresh. */
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 50_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [workspaceId, moment.id, moment.media?.derivativeAvailable, canRead]);
  return url ? (
    <Image
      unoptimized
      src={url}
      alt=""
      width={480}
      height={360}
      className="size-full object-cover"
      loading="lazy"
    />
  ) : (
    <div className="flex size-full items-center justify-center">
      {moment.status === "PROCESSING" ? (
        <Loader2 className="size-7 animate-spin text-muted" />
      ) : moment.media?.mediaType === "VIDEO" ? (
        <FileVideo className="size-8 text-faint" />
      ) : (
        <Camera className="size-8 text-faint" />
      )}
    </div>
  );
}
function MomentDetails({
  moment,
  workspaceId,
  children,
  onClose,
}: {
  moment: Moment;
  workspaceId: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let cancelled = false;
    weddingOsApi
      .momentContent(workspaceId, moment.id)
      .then((result) => {
        if (!cancelled) setUrl(result.url);
      })
      .catch((cause) => {
        if (!cancelled) setError(apiErrorMessage(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, moment.id]);
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-sm font-semibold">
            {moment.originalFileName || "Moment de la eveniment"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {moment.submittedAt &&
              new Date(moment.submittedAt).toLocaleString("ro-RO")}
            {moment.sizeBytes
              ? ` · ${(moment.sizeBytes / 1024 / 1024).toFixed(1)} MB`
              : ""}
          </p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Închide detaliile"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-lg bg-subtle">
        {url ? (
          moment.media?.mediaType === "VIDEO" ? (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[50dvh] w-full"
              aria-label="Video de la eveniment"
            />
          ) : (
            <Image
              unoptimized
              src={url}
              alt={moment.caption || "Fotografie de la eveniment"}
              width={800}
              height={600}
              className="max-h-[50dvh] w-full object-contain"
            />
          )
        ) : (
          <p className="p-4 text-sm text-muted">
            {error || "Se încarcă previzualizarea…"}
          </p>
        )}
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Încărcat de</dt>
          <dd className="mt-1">
            {moment.contributorName || "Participant anonim"}
          </dd>
        </div>
        {moment.caption && (
          <div>
            <dt className="text-xs text-muted">Mesaj</dt>
            <dd className="mt-1 break-words">{moment.caption}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-muted">Stare</dt>
          <dd className="mt-1">
            {labels[String(moment.status)] || moment.status}
          </dd>
        </div>
      </dl>
      {children}
    </div>
  );
}
