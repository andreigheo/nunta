"use client";

import * as React from "react";
import type { TimelineMilestone } from "@weddingos/contracts";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { formatDateLong } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

type TimelineData = Awaited<ReturnType<typeof weddingOsApi.timeline>>;

function MilestoneModal({
  open,
  milestone,
  phases,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  milestone: TimelineMilestone | null;
  phases: TimelineData["phases"];
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    phaseId?: string | null;
    title: string;
    description?: string;
    targetAt?: string | null;
    position?: number;
  }) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
}) {
  const [title, setTitle] = React.useState(milestone?.title ?? "");
  const [description, setDescription] = React.useState(
    milestone?.description ?? "",
  );
  const [date, setDate] = React.useState(
    milestone?.targetAt?.slice(0, 10) ?? "",
  );
  const [phaseId, setPhaseId] = React.useState(milestone?.phaseId ?? "");
  const [error, setError] = React.useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={milestone ? "Editează milestone-ul" : "Milestone nou"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          {onDelete && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onDelete()}
            >
              Șterge
            </Button>
          )}
          <Button
            loading={busy}
            onClick={() => {
              if (!title.trim()) {
                setError("Titlul este obligatoriu.");
                return;
              }
              void onSave({
                title: title.trim(),
                description: description.trim() || undefined,
                phaseId: phaseId || null,
                targetAt: date
                  ? new Date(`${date}T12:00:00`).toISOString()
                  : null,
                position: milestone?.position ?? 0,
              });
            }}
          >
            Salvează
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titlu" required error={error} className="sm:col-span-2">
          <Input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError("");
            }}
          />
        </Field>
        <Field label="Descriere" className="sm:col-span-2">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Fază">
          <Select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">Fără fază</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dată țintă">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export default function TimelinePage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [timeline, setTimeline] = React.useState<TimelineData | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<TimelineMilestone | null>(
    null,
  );
  const [modalOpen, setModalOpen] = React.useState(false);
  const [preview, setPreview] = React.useState<Awaited<
    ReturnType<typeof weddingOsApi.recalculateTimeline>
  > | null>(null);
  const [applyPreviewOpen, setApplyPreviewOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError("");
    try {
      if (demoMode)
        setTimeline({
          phases: [],
          unphasedMilestones: [],
          criticalTaskIds: [],
        });
      else {
        const data = await weddingOsApi.timeline(currentWorkspace.id);
        setTimeline(data);
        setExpanded(new Set(data.phases.map((phase) => phase.id)));
      }
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  React.useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener("weddingos:planning-changed", refresh);
    return () =>
      window.removeEventListener("weddingos:planning-changed", refresh);
  }, [load]);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setError(message);
      toast({
        title: "Timeline-ul nu a fost actualizat",
        description: message,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };
  if (!currentWorkspace || loading)
    return (
      <div className="mx-auto max-w-7xl">
        <div className="h-64 animate-pulse rounded-xl bg-subtle" />
      </div>
    );
  if (error && !timeline)
    return (
      <ErrorState
        title="Timeline indisponibil"
        description={error}
        onRetry={() => void load()}
      />
    );
  if (!timeline) return null;
  const totalTasks = timeline.phases.reduce(
    (sum, phase) => sum + phase.taskTotal,
    0,
  );
  const completedTasks = timeline.phases.reduce(
    (sum, phase) => sum + phase.taskCompleted,
    0,
  );
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Master Timeline"
        description="Faze, milestone-uri, progres, întârzieri și elemente critice din datele canonice."
        meta={
          <>
            <Badge variant="neutral">{timeline.phases.length} faze</Badge>
            <Badge
              variant={timeline.criticalTaskIds.length ? "warning" : "success"}
            >
              {timeline.criticalTaskIds.length} elemente critice
            </Badge>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="PDF-ul rămâne planificat până la un renderer verificat"
            >
              PDF · planificat
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Review AI general nu intră în Slice 2B"
            >
              <Sparkles className="size-4" />
              Review AI · planificat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void run(async () => {
                  if (demoMode) {
                    toast({
                      title: "Recalcularea demo nu mută date reale",
                      variant: "info",
                    });
                    return;
                  }
                  const result = await weddingOsApi.recalculateTimeline(
                    currentWorkspace.id,
                  );
                  setPreview(result);
                  toast({
                    title: "Preview recalculat",
                    description: `${result.proposedChanges.length} schimbări propuse; niciun termen manual nu a fost suprascris.`,
                    variant: "success",
                  });
                })
              }
            >
              <RefreshCw className="size-4" />
              Recalculează
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setSelected(null);
                setModalOpen(true);
              }}
            >
              <Plus className="size-4" />
              Milestone
            </Button>
          </>
        }
      />
      {error && (
        <ErrorState
          title="Unele date nu s-au actualizat"
          description={error}
          onRetry={() => void load()}
        />
      )}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-sm font-medium text-muted">Progres total</p>
              <p className="mt-1 text-3xl font-semibold text-ink">
                {totalTasks
                  ? Math.round((completedTasks / totalTasks) * 100)
                  : 0}
                %
              </p>
            </div>
            <p className="text-sm text-faint">
              {completedTasks}/{totalTasks} sarcini
            </p>
          </div>
          <Progress
            value={completedTasks}
            max={Math.max(totalTasks, 1)}
            className="mt-3 h-2"
          />
        </CardContent>
      </Card>
      {preview && (
        <Card className="border-info/30">
          <CardHeader>
            <div>
              <CardTitle>
                {preview.preview ? "Preview recalculare" : "Timeline actualizat"}
              </CardTitle>
              <p className="text-[13px] text-muted">
                {preview.preview
                  ? "Verifică numărul de termene înainte să aplici recalcularea. Nicio dată nu este modificată în tăcere."
                  : "Termenele relative au fost recalculate pornind de la data nunții."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {preview.preview && preview.proposedChanges.length > 0 ? (
                <Button size="sm" onClick={() => setApplyPreviewOpen(true)}>
                  Aplică {preview.proposedChanges.length} propuneri
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                Închide
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">
                {preview.proposedChanges.length}{" "}
                {preview.preview ? "propuneri" : "termene aplicate"}
              </Badge>
              <Badge
                variant={preview.overdueTaskIds.length ? "danger" : "neutral"}
              >
                {preview.overdueTaskIds.length} întârziate
              </Badge>
              <Badge
                variant={preview.blockedTaskIds.length ? "warning" : "neutral"}
              >
                {preview.blockedTaskIds.length} blocate
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
      {timeline.phases.length === 0 &&
      timeline.unphasedMilestones.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="Timeline-ul nu are încă faze"
          description="Aplică o propunere de plan pentru a crea faze și milestone-uri, sau adaugă primul milestone manual."
          action={{
            label: "Adaugă milestone",
            onClick: () => setModalOpen(true),
          }}
        />
      ) : (
        <div className="space-y-3">
          {timeline.phases.map((phase) => {
            const isOpen = expanded.has(phase.id);
            return (
              <Card key={phase.id}>
                <button
                  className="flex w-full items-center gap-3 p-4 text-left"
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(phase.id)) next.delete(phase.id);
                      else next.add(phase.id);
                      return next;
                    })
                  }
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 text-faint" />
                  ) : (
                    <ChevronRight className="size-4 text-faint" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-brand text-lg font-semibold text-ink">
                        {phase.title}
                      </h2>
                      <Badge
                        variant={
                          phase.status === "completed"
                            ? "success"
                            : phase.status === "in_progress"
                              ? "info"
                              : "neutral"
                        }
                      >
                        {phase.status.replaceAll("_", " ")}
                      </Badge>
                      {phase.delayedItems > 0 && (
                        <Badge variant="danger">
                          <AlertTriangle className="size-3" />
                          {phase.delayedItems} întârziate
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <Progress
                        value={phase.progressPercent}
                        className="max-w-sm"
                      />
                      <span className="text-xs text-faint">
                        {Math.round(phase.progressPercent)}%
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted">
                    {phase.taskCompleted}/{phase.taskTotal} sarcini
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-line p-4 pl-11">
                    {phase.milestones.length ? (
                      phase.milestones.map((milestone) => (
                        <MilestoneRow
                          key={milestone.id}
                          milestone={milestone}
                          onOpen={() => {
                            setSelected(milestone);
                            setModalOpen(true);
                          }}
                          onToggle={() =>
                            void run(async () => {
                              if (demoMode) return;
                              await weddingOsApi.updateMilestone(
                                currentWorkspace.id,
                                milestone.id,
                                milestone.version,
                                {
                                  status:
                                    milestone.status === "completed"
                                      ? "upcoming"
                                      : "completed",
                                },
                              );
                              await load();
                            })
                          }
                        />
                      ))
                    ) : (
                      <p className="text-sm text-muted">
                        Fără milestone-uri în această fază.
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {timeline.unphasedMilestones.map((milestone) => (
            <Card key={milestone.id} className="p-4">
              <MilestoneRow
                milestone={milestone}
                onOpen={() => {
                  setSelected(milestone);
                  setModalOpen(true);
                }}
                onToggle={() =>
                  void run(async () => {
                    if (!demoMode) {
                      await weddingOsApi.updateMilestone(
                        currentWorkspace.id,
                        milestone.id,
                        milestone.version,
                        {
                          status:
                            milestone.status === "completed"
                              ? "upcoming"
                              : "completed",
                        },
                      );
                      await load();
                    }
                  })
                }
              />
            </Card>
          ))}
        </div>
      )}
      <MilestoneModal
        key={`${selected?.id ?? "new"}-${modalOpen}`}
        open={modalOpen}
        milestone={selected}
        phases={timeline.phases}
        busy={busy}
        onClose={() => setModalOpen(false)}
        onSave={async (input) =>
          run(async () => {
            if (demoMode) {
              toast({
                title: "Milestone demo creat local",
                variant: "success",
              });
              setModalOpen(false);
              return;
            }
            if (selected)
              await weddingOsApi.updateMilestone(
                currentWorkspace.id,
                selected.id,
                selected.version,
                input,
              );
            else await weddingOsApi.createMilestone(currentWorkspace.id, input);
            setModalOpen(false);
            await load();
            toast({
              title: selected ? "Milestone actualizat" : "Milestone creat",
              variant: "success",
            });
          })
        }
        onDelete={
          selected
            ? async () =>
                run(async () => {
                  if (!demoMode)
                    await weddingOsApi.deleteMilestone(
                      currentWorkspace.id,
                      selected.id,
                      selected.version,
                    );
                  setModalOpen(false);
                  await load();
                })
            : null
        }
      />
      <ConfirmDialog
        open={applyPreviewOpen}
        onClose={() => setApplyPreviewOpen(false)}
        title="Aplici termenele recalculate?"
        description={`${preview?.proposedChanges.length ?? 0} termene relative vor fi actualizate după data nunții. Termenele manuale rămân neschimbate.`}
        confirmLabel="Aplică termenele"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (demoMode) return;
            const result = await weddingOsApi.recalculateTimeline(
              currentWorkspace.id,
              { applyRelativeDates: true },
            );
            setPreview(result);
            setApplyPreviewOpen(false);
            await load();
            toast({
              title: "Timeline actualizat",
              description: `${result.proposedChanges.length} termene relative au fost aplicate.`,
              variant: "success",
            });
          })
        }
      />
    </div>
  );
}

function MilestoneRow({
  milestone,
  onOpen,
  onToggle,
}: {
  milestone: TimelineMilestone;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-elevated p-3">
      <button
        onClick={onToggle}
        aria-label={
          milestone.status === "completed"
            ? "Redeschide milestone"
            : "Finalizează milestone"
        }
        className={`flex size-6 items-center justify-center rounded-full border-2 ${milestone.status === "completed" ? "border-success bg-success text-on-success" : "border-line-strong"}`}
      >
        {milestone.status === "completed" && <Check className="size-3.5" />}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className={`block text-sm font-semibold ${milestone.status === "completed" ? "text-faint line-through" : "text-ink"}`}
        >
          {milestone.title}
        </span>
        {milestone.description && (
          <span className="block truncate text-xs text-muted">
            {milestone.description}
          </span>
        )}
      </button>
      {milestone.targetAt ? (
        <span className="flex items-center gap-1 text-xs text-faint">
          <CalendarClock className="size-3.5" />
          {formatDateLong(milestone.targetAt)}
        </span>
      ) : (
        <Badge variant="outline">relativ</Badge>
      )}
      <Badge
        variant={
          milestone.status === "missed"
            ? "danger"
            : milestone.status === "completed"
              ? "success"
              : "neutral"
        }
      >
        {milestone.status.replaceAll("_", " ")}
      </Badge>
    </div>
  );
}
