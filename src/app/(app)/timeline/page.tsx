"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { TimelineMilestone } from "@weddingos/contracts";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Plus,
  RefreshCw,
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
  SegmentedControl,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";

type TimelineData = Awaited<ReturnType<typeof weddingOsApi.timeline>>;
type TimelineView = "phases" | "milestones";

const phaseStatusLabel = {
  not_started: "Urmează",
  in_progress: "În lucru",
  completed: "Finalizată",
} as const;

const milestoneStatusLabel = {
  upcoming: "Urmează",
  in_progress: "În lucru",
  completed: "Finalizat",
  missed: "Întârziat",
} as const;

function demoTimeline(): TimelineData {
  const phaseOne = "00000000-0000-4000-8000-000000000101";
  const phaseTwo = "00000000-0000-4000-8000-000000000102";
  const milestone = (
    id: string,
    phaseId: string,
    title: string,
    days: number,
    status: TimelineMilestone["status"],
  ): TimelineMilestone => ({
    id,
    phaseId,
    title,
    description: null,
    targetAt: new Date(Date.now() + days * 86_400_000).toISOString(),
    relativeOffsetDays: null,
    status,
    position: 0,
    version: 1,
  });
  return {
    phases: [
      {
        id: phaseOne,
        title: "Deciziile de bază",
        description: "Stabilește direcția, data și bugetul de lucru.",
        position: 0,
        startAt: null,
        endAt: null,
        relativeStartOffsetDays: null,
        relativeEndOffsetDays: null,
        status: "in_progress",
        version: 1,
        milestones: [
          milestone(
            "00000000-0000-4000-8000-000000000111",
            phaseOne,
            "Bugetul inițial este confirmat",
            5,
            "in_progress",
          ),
        ],
        taskTotal: 6,
        taskCompleted: 2,
        progressPercent: 33,
        delayedItems: 0,
      },
      {
        id: phaseTwo,
        title: "Furnizorii principali",
        description: "Compară ofertele și confirmă serviciile esențiale.",
        position: 1,
        startAt: null,
        endAt: null,
        relativeStartOffsetDays: null,
        relativeEndOffsetDays: null,
        status: "not_started",
        version: 1,
        milestones: [
          milestone(
            "00000000-0000-4000-8000-000000000112",
            phaseTwo,
            "Locația este rezervată",
            30,
            "upcoming",
          ),
        ],
        taskTotal: 8,
        taskCompleted: 0,
        progressPercent: 0,
        delayedItems: 0,
      },
    ],
    unphasedMilestones: [],
    criticalTaskIds: [],
  };
}

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
      title={milestone ? "Editează reperul" : "Reper nou"}
      description="Un reper este un rezultat important care te ajută să vezi dacă planificarea avansează la timp."
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
                targetAt: date ? `${date}T12:00:00.000Z` : null,
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
  const router = useRouter();
  const { currentWorkspace, demoMode, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const [timeline, setTimeline] = React.useState<TimelineData | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<TimelineMilestone | null>(
    null,
  );
  const [modalOpen, setModalOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [view, setView] = React.useState<TimelineView>("phases");
  const [preview, setPreview] = React.useState<Awaited<
    ReturnType<typeof weddingOsApi.recalculateTimeline>
  > | null>(null);
  const [applyPreviewOpen, setApplyPreviewOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = demoMode || capabilities.includes("timeline.write");
  const canRecalculate =
    demoMode || capabilities.includes("timeline.recalculate");
  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError("");
    try {
      if (demoMode) {
        const data = demoTimeline();
        setTimeline(data);
        setExpanded(new Set(data.phases.map((phase) => phase.id)));
      }
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
        title: "Cronologia nu a fost actualizată",
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
  const delayedItems = timeline.phases.reduce(
    (sum, phase) => sum + phase.delayedItems,
    0,
  );
  const allMilestones = [
    ...timeline.phases.flatMap((phase) =>
      phase.milestones.map((milestone) => ({ milestone, phase: phase.title })),
    ),
    ...timeline.unphasedMilestones.map((milestone) => ({
      milestone,
      phase: "Fără fază",
    })),
  ].sort((a, b) =>
    (a.milestone.targetAt ?? "9999").localeCompare(
      b.milestone.targetAt ?? "9999",
    ),
  );
  const nextMilestone = allMilestones.find(
    ({ milestone }) => milestone.status !== "completed",
  );
  const updateDemoMilestone = (
    milestoneId: string,
    updater: (milestone: TimelineMilestone) => TimelineMilestone | null,
  ) => {
    setTimeline((current) => {
      if (!current) return current;
      return {
        ...current,
        phases: current.phases.map((phase) => ({
          ...phase,
          milestones: phase.milestones.flatMap((milestone) => {
            if (milestone.id !== milestoneId) return [milestone];
            const updated = updater(milestone);
            return updated ? [updated] : [];
          }),
        })),
        unphasedMilestones: current.unphasedMilestones.flatMap((milestone) => {
          if (milestone.id !== milestoneId) return [milestone];
          const updated = updater(milestone);
          return updated ? [updated] : [];
        }),
      };
    });
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Cronologia planificării"
        description="Urmărește cum avansează nunta de la primele decizii până la ziua evenimentului. Sarcinile se gestionează în Plan; aici vezi fazele și reperele importante."
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
            <Button variant="outline" size="sm" onClick={() => router.push("/plan")}>
              Deschide planul de sarcini
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canRecalculate}
              title={canRecalculate ? undefined : "Nu ai permisiunea de a recalcula termenele"}
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
                    title: "Propunerile de termene sunt gata",
                    description: `${result.proposedChanges.length} schimbări propuse; niciun termen manual nu a fost suprascris.`,
                    variant: "success",
                  });
                })
              }
            >
              <RefreshCw className="size-4" />
              Recalculează termenele
            </Button>
            <Button
              size="sm"
              disabled={!canWrite}
              onClick={() => {
                setSelected(null);
                setModalOpen(true);
              }}
            >
              <Plus className="size-4" />
              Reper
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
      <div className="grid gap-3 lg:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-brand/20 bg-brand-softer/30">
          <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">Următorul reper</p>
              {nextMilestone ? (
                <>
                  <p className="mt-2 font-brand text-xl font-semibold text-ink">{nextMilestone.milestone.title}</p>
                  <p className="mt-1 text-sm text-muted">
                    {nextMilestone.phase}
                    {nextMilestone.milestone.targetAt ? ` · ${formatDateLong(nextMilestone.milestone.targetAt)}` : " · dată relativă"}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">Toate reperele sunt finalizate. Poți adăuga următorul rezultat important.</p>
              )}
            </div>
            {nextMilestone && canWrite && (
              <Button variant="outline" size="sm" onClick={() => { setSelected(nextMilestone.milestone); setModalOpen(true); }}>
                Vezi reperul <ArrowRight className="size-4" />
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted">Progres total</p>
                <p className="mt-1 text-3xl font-semibold text-ink">{totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0}%</p>
              </div>
              <p className="text-sm text-faint">{completedTasks}/{totalTasks} sarcini</p>
            </div>
            <Progress value={completedTasks} max={Math.max(totalTasks, 1)} className="mt-3 h-2" />
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={delayedItems ? "danger" : "success"}>{delayedItems} întârziate</Badge>
              <Badge variant={timeline.criticalTaskIds.length ? "warning" : "neutral"}>{timeline.criticalTaskIds.length} critice</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
      {preview && (
        <Card className="border-info/30">
          <CardHeader>
            <div>
              <CardTitle>
                {preview.preview ? "Verifică termenele propuse" : "Cronologia a fost actualizată"}
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
          title="Cronologia nu are încă faze"
          description="Creează planul de sarcini pentru a primi fazele de lucru sau adaugă primul reper manual."
          action={{ label: "Deschide planul", onClick: () => router.push("/plan") }}
        />
      ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl<TimelineView>
            ariaLabel="Mod de afișare cronologie"
            value={view}
            onChange={setView}
            options={[{ value: "phases", label: "Pe faze" }, { value: "milestones", label: "Toate reperele" }]}
          />
          <p className="text-sm text-muted">Fazele vin din Plan; reperele pot fi gestionate aici.</p>
        </div>
        {view === "phases" ? <div className="space-y-3">
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
                        {phaseStatusLabel[phase.status]}
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
                          canWrite={canWrite}
                          onOpen={() => {
                            setSelected(milestone);
                            setModalOpen(true);
                          }}
                          onToggle={() =>
                            void run(async () => {
                              if (demoMode) {
                                updateDemoMilestone(milestone.id, (current) => ({ ...current, status: current.status === "completed" ? "upcoming" : "completed", version: current.version + 1 }));
                                return;
                              }
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
                        Fără repere în această fază. Sarcinile fazei se găsesc în Plan.
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
                canWrite={canWrite}
                onOpen={() => {
                  setSelected(milestone);
                  setModalOpen(true);
                }}
                onToggle={() =>
                  void run(async () => {
                    if (demoMode) {
                      updateDemoMilestone(milestone.id, (current) => ({ ...current, status: current.status === "completed" ? "upcoming" : "completed", version: current.version + 1 }));
                    } else {
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
        </div> : (
          <Card className="divide-y divide-line overflow-hidden">
            {allMilestones.map(({ milestone, phase }) => (
              <div key={milestone.id} className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-faint">{phase}</p>
                <MilestoneRow milestone={milestone} canWrite={canWrite} onOpen={() => { setSelected(milestone); setModalOpen(true); }} onToggle={() => void run(async () => {
                  if (demoMode) updateDemoMilestone(milestone.id, (current) => ({ ...current, status: current.status === "completed" ? "upcoming" : "completed", version: current.version + 1 }));
                  else { await weddingOsApi.updateMilestone(currentWorkspace.id, milestone.id, milestone.version, { status: milestone.status === "completed" ? "upcoming" : "completed" }); await load(); }
                })} />
              </div>
            ))}
          </Card>
        )}
        </>
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
              const created: TimelineMilestone = {
                id: selected?.id ?? crypto.randomUUID(),
                phaseId: input.phaseId ?? null,
                title: input.title,
                description: input.description ?? null,
                targetAt: input.targetAt ?? null,
                relativeOffsetDays: null,
                status: selected?.status ?? "upcoming",
                position: input.position ?? 0,
                version: (selected?.version ?? 0) + 1,
              };
              if (selected) updateDemoMilestone(selected.id, () => created);
              else setTimeline((current) => current ? { ...current, unphasedMilestones: [...current.unphasedMilestones, created] } : current);
              toast({ title: selected ? "Reper demo actualizat" : "Reper demo creat", variant: "success" });
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
              title: selected ? "Reper actualizat" : "Reper creat",
              variant: "success",
            });
          })
        }
        onDelete={
          selected
            ? async () => setDeleteOpen(true)
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
              title: "Cronologia a fost actualizată",
              description: `${result.proposedChanges.length} termene relative au fost aplicate.`,
              variant: "success",
            });
          })
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Ștergi reperul?"
        description={`„${selected?.title ?? "Acest reper"}” va fi eliminat. Sarcinile legate rămân în Plan, fără acest reper.`}
        confirmLabel="Șterge reperul"
        destructive
        loading={busy}
        onConfirm={() => void run(async () => {
          if (!selected) return;
          if (demoMode) updateDemoMilestone(selected.id, () => null);
          else await weddingOsApi.deleteMilestone(currentWorkspace.id, selected.id, selected.version);
          setDeleteOpen(false);
          setModalOpen(false);
          if (!demoMode) await load();
          toast({ title: "Reper șters", variant: "success" });
        })}
      />
    </div>
  );
}

function MilestoneRow({
  milestone,
  canWrite,
  onOpen,
  onToggle,
}: {
  milestone: TimelineMilestone;
  canWrite: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-elevated p-3">
      <button
        onClick={onToggle}
        disabled={!canWrite}
        aria-label={
          milestone.status === "completed"
            ? "Redeschide reperul"
            : "Finalizează reperul"
        }
        className={`flex size-6 items-center justify-center rounded-full border-2 ${milestone.status === "completed" ? "border-success bg-success text-on-success" : "border-line-strong"}`}
      >
        {milestone.status === "completed" && <Check className="size-3.5" />}
      </button>
      <button disabled={!canWrite} onClick={onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
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
        {milestoneStatusLabel[milestone.status]}
      </Badge>
    </div>
  );
}
