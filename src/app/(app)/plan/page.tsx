"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type {
  CreateTask,
  PlanProposalResource,
  TaskTransitionRequest,
} from "@weddingos/contracts";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowRight,
  CalendarDays,
  CircleCheckBig,
  CircleDashed,
  Download,
  Filter,
  GanttChart,
  Kanban,
  LayoutList,
  Plus,
  Search,
  Sparkles,
  UserRoundX,
} from "lucide-react";
import type { Task, TaskStatus } from "@/lib/types";
import { tasks as demoTasks } from "@/lib/data/tasks";
import { apiErrorMessage, weddingOsApi } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import {
  taskCategoryLabel,
  taskFromApi,
  transitionForStatus,
} from "@/lib/planning-adapter";
import { cn, daysUntil, formatDateShort, percent } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Progress,
  SegmentedControl,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
} from "@/components/ui";
import { BoardView, boardColumns } from "@/components/plan/board-view";
import { ProposalReview } from "@/components/plan/proposal-review";
import { TaskDrawer } from "@/components/plan/task-drawer";
import { TaskModal } from "@/components/plan/task-modal";

type View = "list" | "board" | "timeline" | "calendar";
type SortKey = "deadline" | "priority" | "title";
type FocusFilter = "overdue" | "unassigned" | null;
const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
const priorityLabels = {
  low: "Scăzută",
  medium: "Medie",
  high: "Ridicată",
  urgent: "Urgentă",
} as const;
const priorityTones = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
} as const;
const statusLabels = {
  "not-started": "Neînceput",
  "in-progress": "În lucru",
  waiting: "În așteptare",
  blocked: "Blocat",
  completed: "Finalizat",
} as const;
const statusTones = {
  "not-started": "neutral",
  "in-progress": "info",
  waiting: "warning",
  blocked: "danger",
  completed: "success",
} as const;
const sortLabels: Record<SortKey, string> = {
  deadline: "termen",
  priority: "prioritate",
  title: "titlu",
};
const viewDescriptions: Record<View, string> = {
  list: "Vezi toate detaliile și compară rapid sarcinile.",
  board: "Mută sarcinile între stări, de la neînceput la finalizat.",
  timeline: "Urmărește ordinea sarcinilor după termen.",
  calendar: "Vezi când este programată fiecare sarcină.",
};

function isUnassigned(task: Task) {
  return task.owner.trim().toLocaleLowerCase("ro-RO") === "nealocat";
}

function recommendedTask(tasks: Task[]) {
  const incomplete = tasks.filter((task) => task.status !== "completed");
  const compare = (left: Task, right: Task) =>
    priorityOrder[left.priority] - priorityOrder[right.priority] ||
    left.deadline.localeCompare(right.deadline);
  return (
    incomplete
      .filter((task) => daysUntil(task.deadline) < 0)
      .sort(compare)[0] ??
    incomplete
      .filter((task) => task.status === "in-progress")
      .sort(compare)[0] ??
    incomplete.sort(compare)[0] ??
    null
  );
}

function taskDueLabel(task: Task) {
  const days = daysUntil(task.deadline);
  if (days < -1) return `Termen depășit cu ${Math.abs(days)} zile`;
  if (days === -1) return "Termen depășit de ieri";
  if (days === 0) return "Termen astăzi";
  if (days === 1) return "Termen mâine";
  return `Termen în ${days} zile`;
}

export default function PlanPage() {
  const router = useRouter();
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [members, setMembers] = React.useState<
    Array<{ id: string; name: string }>
  >([]);
  const [proposal, setProposal] = React.useState<PlanProposalResource | null>(
    null,
  );
  const [proposalOpen, setProposalOpen] = React.useState(false);
  const [generation, setGeneration] = React.useState<{
    status: string;
    progress: number;
    jobId: string;
  } | null>(null);
  const [view, setView] = React.useState<View>("list");
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string | null>(
    null,
  );
  const [statusFilter, setStatusFilter] = React.useState<TaskStatus | null>(
    null,
  );
  const [focusFilter, setFocusFilter] = React.useState<FocusFilter>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("deadline");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Task | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const automaticGenerationStarted = React.useRef(false);

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError("");
    try {
      if (demoMode) {
        setTasks(demoTasks);
        setMembers([
          { id: "demo-ana", name: "Ana Dumitrescu" },
          { id: "demo-mihai", name: "Mihai Ionescu" },
        ]);
        return;
      }
      const [taskList, proposalList] = await Promise.all([
        weddingOsApi.tasks(currentWorkspace.id, {
          includeSubtasks: true,
          sort: "due_at",
        }),
        weddingOsApi.planProposals(currentWorkspace.id),
      ]);
      const team = bootstrap?.membership.capabilities.includes("team.read")
        ? await weddingOsApi.team(currentWorkspace.id)
        : { members: [] };
      setTasks(taskList.items.map(taskFromApi));
      setMembers(
        team.members
          .filter((item) => item.status === "active")
          .map((item) => ({ id: item.id, name: item.name })),
      );
      const active =
        proposalList.items.find(
          (item) =>
            item.status === "ready_for_review" || item.status === "generating",
        ) ?? proposalList.items[0];
      if (active)
        setProposal(
          await weddingOsApi.planProposal(currentWorkspace.id, active.id),
        );
      else setProposal(null);
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [bootstrap, currentWorkspace, demoMode]);

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

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const requestedTaskId = new URLSearchParams(window.location.search).get(
        "task",
      );
      if (!requestedTaskId) return;
      const requestedTask = tasks.find((task) => task.id === requestedTaskId);
      if (requestedTask) setSelected(requestedTask);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tasks]);

  const refreshTasks = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    const list = await weddingOsApi.tasks(currentWorkspace.id, {
      includeSubtasks: true,
      sort: "due_at",
    });
    const next = list.items.map(taskFromApi);
    setTasks(next);
    setSelected((current) =>
      current ? (next.find((item) => item.id === current.id) ?? null) : null,
    );
  }, [currentWorkspace, demoMode]);

  const run = React.useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (caught) {
      const message = apiErrorMessage(caught);
      setError(message);
      toast({
        title: "Operația nu a reușit",
        description: message,
        variant: "error",
      });
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [toast]);

  const generatePlan = React.useCallback(async (
    mode: "auto" | "deterministic" = "auto",
  ) => {
    if (!currentWorkspace || demoMode) {
      toast({
        title: "Demo izolat",
        description:
          "În demo, planul rămâne în memoria locală și nu produce mutații API.",
        variant: "info",
      });
      return;
    }
    await run(async () => {
      const onboarding = await weddingOsApi.onboarding(currentWorkspace.id);
      if (onboarding.status !== "ready") {
        toast({
          title: "Onboarding incomplet",
          description:
            "Completează onboardingul înainte de generarea planului.",
          variant: "warning",
        });
        router.push("/onboarding");
        return;
      }
      const result = await weddingOsApi.createPlanGeneration(
        currentWorkspace.id,
        onboarding.version,
        { mode },
      );
      setGeneration({
        status: result.job.status,
        progress: result.job.progress,
        jobId: result.job.id,
      });
      if (result.existingProposalId) {
        const existing = await weddingOsApi.planProposal(
          currentWorkspace.id,
          result.existingProposalId,
        );
        setProposal(existing);
        setProposalOpen(true);
        return;
      }
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        const job = await weddingOsApi.job(result.job.id);
        setGeneration({
          status: job.status,
          progress: job.progress,
          jobId: job.id,
        });
        if (job.status === "failed" || job.status === "dead_letter")
          throw new Error(job.error?.message ?? "Generarea planului a eșuat.");
        if (job.status === "completed") break;
      }
      const proposals = await weddingOsApi.planProposals(currentWorkspace.id);
      const ready = proposals.items.find(
        (item) => item.status === "ready_for_review",
      );
      if (!ready)
        throw new Error(
          "Jobul s-a terminat, dar propunerea nu este încă disponibilă.",
        );
      const full = await weddingOsApi.planProposal(
        currentWorkspace.id,
        ready.id,
      );
      setProposal(full);
      setProposalOpen(true);
      toast({
        title: "Propunerea este gata",
        description: full.fallbackUsed
          ? "A fost folosit generatorul determinist de rezervă."
          : "Poți verifica și edita structura înainte de aplicare.",
        variant: full.fallbackUsed ? "warning" : "success",
      });
    });
  }, [currentWorkspace, demoMode, router, run, toast]);

  React.useEffect(() => {
    if (loading || automaticGenerationStarted.current) return;
    const requested =
      new URLSearchParams(window.location.search).get("generate") === "1";
    if (!requested) return;
    automaticGenerationStarted.current = true;
    router.replace("/plan");
    const timer = window.setTimeout(() => {
      if (proposal) {
        setProposalOpen(true);
        return;
      }
      if (tasks.length === 0) void generatePlan("auto");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [generatePlan, loading, proposal, router, tasks.length]);

  const createTask = async (input: CreateTask, subtasks: string[]) => {
    if (!currentWorkspace) return;
    if (demoMode) {
      const created: Task = {
        id: `demo-${Date.now()}`,
        title: input.title,
        description: input.description,
        category: input.category,
        owner:
          members.find((item) => item.id === input.assigneeMembershipId)
            ?.name ?? "Nealocat",
        priority: input.priority,
        status: "not-started",
        deadline: input.dueAt ?? new Date().toISOString(),
        comments: 0,
        attachments: 0,
        subtasks: subtasks.map((title, index) => ({
          id: `demo-sub-${index}`,
          title,
          done: false,
        })),
      };
      setTasks((items) => [created, ...items]);
      toast({ title: "Sarcină demo creată", variant: "success" });
      return;
    }
    await run(async () => {
      const created = await weddingOsApi.createTask(currentWorkspace.id, input);
      for (const title of subtasks)
        await weddingOsApi.createSubtask(currentWorkspace.id, created.id, {
          title,
          category: input.category,
          priority: input.priority,
          position: 0,
          isPrivate: input.isPrivate,
        });
      await refreshTasks();
      toast({
        title: "Sarcină creată",
        description: input.title,
        variant: "success",
      });
    });
  };

  const transition = async (
    task: Task,
    transitionName: TaskTransitionRequest["transition"],
  ) => {
    if (!currentWorkspace) return;
    if (demoMode) {
      const next: TaskStatus =
        transitionName === "COMPLETE"
          ? "completed"
          : transitionName === "REOPEN"
            ? "not-started"
            : transitionName === "BLOCK"
              ? "blocked"
              : transitionName === "UNBLOCK"
                ? "in-progress"
                : task.status;
      setTasks((items) =>
        items.map((item) =>
          item.id === task.id ? { ...item, status: next } : item,
        ),
      );
      return;
    }
    let reason: string | undefined;
    let postponeUntil: string | undefined;
    if (transitionName === "BLOCK") {
      reason = window.prompt("De ce este blocată sarcina?")?.trim();
      if (!reason) return;
    }
    if (transitionName === "POSTPONE") {
      const date = new Date(task.deadline);
      date.setDate(date.getDate() + 7);
      postponeUntil = date.toISOString();
      reason = "Amânată cu 7 zile din interfața planului";
    }
    const result = await weddingOsApi.transitionTask(
      currentWorkspace.id,
      task.id,
      {
        transition: transitionName,
        reason,
        postponeUntil,
        version: task.version ?? 1,
        confirmIncompleteSubtasks: true,
      },
    );
    const adapted = taskFromApi(result);
    setTasks((items) =>
      items.map((item) => (item.id === task.id ? adapted : item)),
    );
    setSelected(adapted);
  };

  const boardTransition = async (taskId: string, target: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === target) return;
    if (target === "not-started" && task.status !== "completed") {
      toast({
        title: "Tranziție invalidă",
        description: "Folosește Redeschide numai pentru o sarcină finalizată.",
        variant: "warning",
      });
      return;
    }
    const previous = tasks;
    setTasks((items) =>
      items.map((item) =>
        item.id === taskId ? { ...item, status: target } : item,
      ),
    );
    try {
      await transition(
        task,
        target === "not-started" ? "REOPEN" : transitionForStatus[target],
      );
    } catch {
      setTasks(previous);
    }
  };

  const updateTask = async (
    task: Task,
    patch: Parameters<React.ComponentProps<typeof TaskDrawer>["onUpdate"]>[1],
  ) => {
    if (!currentWorkspace) return;
    if (demoMode) {
      setTasks((items) =>
        items.map((item) =>
          item.id === task.id
            ? {
                ...item,
                title: patch.title ?? item.title,
                description: patch.description ?? item.description,
                priority: patch.priority ?? item.priority,
                deadline: patch.dueAt ?? item.deadline,
              }
            : item,
        ),
      );
      return;
    }
    const result = await weddingOsApi.updateTask(
      currentWorkspace.id,
      task.id,
      task.version ?? 1,
      patch,
    );
    const adapted = taskFromApi(result);
    setTasks((items) =>
      items.map((item) => (item.id === task.id ? adapted : item)),
    );
    setSelected(adapted);
  };

  const filtered = React.useMemo(() => {
    let list = [...tasks];
    const normalized = query.trim().toLowerCase();
    if (normalized)
      list = list.filter((task) =>
        `${task.title} ${task.category} ${task.owner}`
          .toLowerCase()
          .includes(normalized),
      );
    if (categoryFilter)
      list = list.filter((task) => task.category === categoryFilter);
    if (statusFilter)
      list = list.filter((task) => task.status === statusFilter);
    if (focusFilter === "overdue")
      list = list.filter(
        (task) => task.status !== "completed" && daysUntil(task.deadline) < 0,
      );
    if (focusFilter === "unassigned") list = list.filter(isUnassigned);
    list.sort((a, b) => {
      const comparison =
        sortKey === "deadline"
          ? a.deadline.localeCompare(b.deadline)
          : sortKey === "priority"
            ? priorityOrder[a.priority] - priorityOrder[b.priority]
            : a.title.localeCompare(b.title, "ro");
      return sortDir === "asc" ? comparison : -comparison;
    });
    return list;
  }, [
    tasks,
    query,
    categoryFilter,
    statusFilter,
    focusFilter,
    sortKey,
    sortDir,
  ]);

  const doneCount = tasks.filter((task) => task.status === "completed").length;
  const overdueCount = tasks.filter(
    (task) => task.status !== "completed" && daysUntil(task.deadline) < 0,
  ).length;
  const blockedCount = tasks.filter((task) => task.status === "blocked").length;
  const unassignedCount = tasks.filter(isUnassigned).length;
  const nextTask = recommendedTask(tasks);
  const taskCategoryOptions = React.useMemo(
    () =>
      Array.from(new Set(tasks.map((task) => task.category))).sort((a, b) =>
        taskCategoryLabel(a).localeCompare(taskCategoryLabel(b), "ro"),
      ),
    [tasks],
  );
  const activeFilterCount =
    Number(!!categoryFilter) + Number(!!statusFilter) + Number(!!focusFilter);

  const resetFilters = () => {
    setQuery("");
    setCategoryFilter(null);
    setStatusFilter(null);
    setFocusFilter(null);
  };

  if (!currentWorkspace || loading)
    return (
      <div className="mx-auto max-w-7xl">
        <div className="h-56 animate-pulse rounded-xl bg-subtle" />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        title="Planul evenimentului"
        description="Vezi ce urmează, ce necesită atenție și cine se ocupă, fără să cauți prin toate sarcinile."
        actions={
          tasks.length === 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(true)}
            >
              <Plus className="size-4" />
              Adaugă manual
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void run(async () => {
                    const job = await weddingOsApi.createPlanningExport(
                      currentWorkspace.id,
                    );
                    toast({
                      title: "Export în coadă",
                      description: `Job ${job.id.slice(0, 8)} procesează lista de sarcini.`,
                      variant: "info",
                    });
                    for (let attempt = 0; attempt < 60; attempt += 1) {
                      await new Promise((resolve) =>
                        window.setTimeout(resolve, 500),
                      );
                      const state = await weddingOsApi.job(job.id);
                      if (
                        state.status === "failed" ||
                        state.status === "dead_letter"
                      )
                        throw new Error(
                          state.error?.message ??
                            "Exportul nu a putut fi generat.",
                        );
                      if (state.status !== "completed") continue;
                      const blob = await weddingOsApi.downloadJobArtifact(
                        job.id,
                      );
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = "weddingos-planning.csv";
                      link.click();
                      URL.revokeObjectURL(url);
                      toast({
                        title: "Export CSV descărcat",
                        variant: "success",
                      });
                      return;
                    }
                    throw new Error(
                      "Exportul nu s-a finalizat în intervalul așteptat.",
                    );
                  })
                }
              >
                <Download className="size-3.5" />
                Export CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  proposal ? setProposalOpen(true) : void generatePlan("auto")
                }
              >
                <Sparkles className="size-3.5 text-accent" />
                {proposal?.status === "ready_for_review"
                  ? "Verifică propunerea"
                  : "Generează plan"}
              </Button>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="size-4" />
                Adaugă sarcină
              </Button>
            </>
          )
        }
      />

      {tasks.length === 0 && !error ? (
        <section
          className="overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-softer via-surface to-accent-soft/35 p-5 sm:p-7"
          aria-labelledby="plan-start-title"
        >
          <Badge variant="brand">Primul pas recomandat</Badge>
          <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,.85fr)] lg:items-end">
            <div>
              <h2
                id="plan-start-title"
                className="max-w-2xl font-brand text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl"
              >
                Transformă detaliile evenimentului într-un plan pe care îl controlezi.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                Sarbato pregătește o propunere pe baza răspunsurilor tale. Nimic
                nu intră în plan până nu verifici și aprobi fiecare etapă.
              </p>
            </div>
            <ol
              className="grid gap-2 text-sm"
              aria-label="Cum se creează planul"
            >
              {[
                ["1", "Folosim detaliile salvate la configurare"],
                ["2", "Îți arătăm propunerea înainte de aplicare"],
                ["3", "Tu alegi ce sarcini intră în plan"],
              ].map(([number, copy]) => (
                <li
                  key={number}
                  className="flex items-center gap-3 rounded-xl border border-line/80 bg-surface/85 px-3 py-2.5"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-brand">
                    {number}
                  </span>
                  <span className="font-medium text-ink">{copy}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {generation && generation.status !== "completed" && (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/40 p-4">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-ink">
              Generarea propunerii: {generation.status}
            </span>
            <span className="text-muted">{generation.progress}%</span>
          </div>
          <Progress value={generation.progress} className="mt-2" />
        </div>
      )}
      {error && (
        <ErrorState
          title="Datele de planning nu sunt disponibile"
          description={error}
          onRetry={() => void load()}
        />
      )}

      {tasks.length > 0 && !error ? (
        <section
          aria-labelledby="plan-status-title"
          className="rounded-2xl border border-line bg-surface p-4 sm:p-6"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)] lg:items-stretch">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">
                Situația planului
              </p>
              <h2
                id="plan-status-title"
                className="mt-2 font-brand text-2xl font-semibold tracking-[-0.02em] text-ink"
              >
                {overdueCount > 0
                  ? `${overdueCount} ${overdueCount === 1 ? "sarcină are" : "sarcini au"} termenul depășit.`
                  : doneCount === tasks.length
                    ? "Planul este finalizat."
                    : "Planul este la zi."}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Ai finalizat {doneCount} din {tasks.length} sarcini. Elementele
                de mai jos sunt lucruri de urmărit, nu erori ale aplicației.
              </p>
              <div className="mt-4 flex max-w-xl items-center gap-3">
                <Progress
                  value={doneCount}
                  max={Math.max(tasks.length, 1)}
                  className="flex-1"
                />
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                  {percent(doneCount, tasks.length)}%
                </span>
              </div>
              <div
                className="mt-5 flex flex-wrap gap-2"
                aria-label="De urmărit"
              >
                <button
                  type="button"
                  disabled={overdueCount === 0}
                  onClick={() => {
                    setFocusFilter((current) =>
                      current === "overdue" ? null : "overdue",
                    );
                    setStatusFilter(null);
                  }}
                  aria-pressed={focusFilter === "overdue"}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                    focusFilter === "overdue"
                      ? "border-danger/40 bg-danger-soft text-danger"
                      : "border-line bg-elevated text-muted hover:border-danger/30 hover:text-ink",
                  )}
                >
                  <AlertTriangle className="size-4" aria-hidden />
                  {overdueCount} depășite
                </button>
                <button
                  type="button"
                  disabled={blockedCount === 0}
                  onClick={() => {
                    setStatusFilter((current) =>
                      current === "blocked" ? null : "blocked",
                    );
                    setFocusFilter(null);
                  }}
                  aria-pressed={statusFilter === "blocked"}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                    statusFilter === "blocked"
                      ? "border-warning/40 bg-warning-soft text-warning"
                      : "border-line bg-elevated text-muted hover:border-warning/30 hover:text-ink",
                  )}
                >
                  <CircleDashed className="size-4" aria-hidden />
                  {blockedCount} blocate
                </button>
                <button
                  type="button"
                  disabled={unassignedCount === 0}
                  onClick={() => {
                    setFocusFilter((current) =>
                      current === "unassigned" ? null : "unassigned",
                    );
                    setStatusFilter(null);
                  }}
                  aria-pressed={focusFilter === "unassigned"}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                    focusFilter === "unassigned"
                      ? "border-brand/35 bg-brand-softer text-brand"
                      : "border-line bg-elevated text-muted hover:border-brand/30 hover:text-ink",
                  )}
                >
                  <UserRoundX className="size-4" aria-hidden />
                  {unassignedCount} fără responsabil
                </button>
              </div>
            </div>

            <aside className="flex flex-col justify-between rounded-xl bg-subtle/70 p-4 sm:p-5">
              <div>
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-faint">
                  <CircleCheckBig className="size-4 text-brand" aria-hidden />
                  Următorul pas recomandat
                </p>
                {nextTask ? (
                  <>
                    <h3 className="mt-3 text-lg font-semibold leading-6 text-ink">
                      {nextTask.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-2 text-sm",
                        daysUntil(nextTask.deadline) < 0
                          ? "font-medium text-danger"
                          : "text-muted",
                      )}
                    >
                      {taskDueLabel(nextTask)} ·{" "}
                      {formatDateShort(nextTask.deadline)}
                    </p>
                    <p className="mt-1 text-xs text-faint">
                      {taskCategoryLabel(nextTask.category)} · {nextTask.owner}
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Toate sarcinile sunt finalizate. Poți adăuga un pas nou dacă
                    mai apare ceva de organizat.
                  </p>
                )}
              </div>
              <Button
                className="mt-5 w-full justify-between"
                onClick={() =>
                  nextTask ? setSelected(nextTask) : setModalOpen(true)
                }
              >
                {nextTask ? "Deschide sarcina" : "Adaugă o sarcină"}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </aside>
          </div>
        </section>
      ) : null}

      {tasks.length > 0 ? (
        <section
          aria-labelledby="plan-workspace-title"
          className="space-y-3 pt-1"
        >
          <div>
            <h2
              id="plan-workspace-title"
              className="text-base font-semibold text-ink"
            >
              Alege cum vrei să lucrezi
            </h2>
            <p className="mt-1 text-sm text-muted">{viewDescriptions[view]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<View>
              ariaLabel="Alege modul de afișare al planului"
              value={view}
              onChange={setView}
              className="w-full md:w-auto [&>button]:flex-1 md:[&>button]:flex-none"
              options={[
                {
                  value: "list",
                  label: (
                    <>
                      <span className="md:hidden">Sarcini</span>
                      <span className="hidden md:inline">Toate sarcinile</span>
                    </>
                  ),
                  icon: <LayoutList className="size-4" />,
                },
                {
                  value: "board",
                  label: (
                    <>
                      <span className="md:hidden">Stări</span>
                      <span className="hidden md:inline">După stare</span>
                    </>
                  ),
                  icon: <Kanban className="size-4" />,
                },
                {
                  value: "timeline",
                  label: (
                    <>
                      <span className="md:hidden">Termene</span>
                      <span className="hidden md:inline">După termen</span>
                    </>
                  ),
                  icon: <GanttChart className="size-4" />,
                },
                {
                  value: "calendar",
                  label: "Calendar",
                  icon: <CalendarDays className="size-4" />,
                },
              ]}
            />
            <Input
              icon={<Search className="size-4" />}
              placeholder="Caută sarcini…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full sm:w-64"
            />
            <Dropdown>
              <DropdownTrigger>
                <Button variant="outline" size="sm">
                  <Filter className="size-3.5" />
                  Filtre{" "}
                  {activeFilterCount > 0 && (
                    <Badge variant="brand">{activeFilterCount}</Badge>
                  )}
                </Button>
              </DropdownTrigger>
              <DropdownContent align="start" widthClass="w-56">
                <DropdownLabel>Categorie</DropdownLabel>
                <DropdownItem
                  selected={!categoryFilter}
                  onSelect={() => setCategoryFilter(null)}
                >
                  Toate
                </DropdownItem>
                {taskCategoryOptions.map((category) => (
                  <DropdownItem
                    key={category}
                    selected={categoryFilter === category}
                    onSelect={() =>
                      setCategoryFilter(
                        categoryFilter === category ? null : category,
                      )
                    }
                  >
                    {taskCategoryLabel(category)}
                  </DropdownItem>
                ))}
                <DropdownSeparator />
                <DropdownLabel>Stare</DropdownLabel>
                <DropdownItem
                  selected={!statusFilter}
                  onSelect={() => setStatusFilter(null)}
                >
                  Toate
                </DropdownItem>
                {boardColumns.map((column) => (
                  <DropdownItem
                    key={column.id}
                    selected={statusFilter === column.id}
                    onSelect={() =>
                      setStatusFilter(
                        statusFilter === column.id ? null : column.id,
                      )
                    }
                  >
                    {column.label}
                  </DropdownItem>
                ))}
              </DropdownContent>
            </Dropdown>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSortKey((current) =>
                  current === "deadline"
                    ? "priority"
                    : current === "priority"
                      ? "title"
                      : "deadline",
                );
                setSortDir((current) => (current === "asc" ? "desc" : "asc"));
              }}
            >
              <ArrowUpDown className="size-3.5" />
              Sortare: {sortLabels[sortKey]}
            </Button>
            {activeFilterCount > 0 || query ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Resetează
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={
            proposal
              ? "Propunerea este pregătită pentru verificare"
              : "Creează prima propunere de plan"
          }
          description={
            proposal
              ? "Deschide propunerea, ajustează ce ai nevoie și aplică doar sarcinile pe care le aprobi."
              : "Procesul durează de obicei sub un minut și nu modifică planul fără confirmarea ta."
          }
          action={{
            label: proposal ? "Verifică propunerea" : "Creează propunerea",
            onClick: () =>
              proposal ? setProposalOpen(true) : void generatePlan("auto"),
          }}
          secondaryAction={{
            label: "Adaugă o sarcină manual",
            onClick: () => setModalOpen(true),
          }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nicio sarcină nu corespunde selecției"
          description="Schimbă termenul căutat sau resetează filtrele pentru a vedea din nou întregul plan."
          action={{ label: "Resetează filtrele", onClick: resetFilters }}
        />
      ) : view === "board" ? (
        <BoardView
          tasks={filtered}
          onStatusChange={(id, status) => void boardTransition(id, status)}
          onOpen={setSelected}
        />
      ) : view === "calendar" ? (
        <div className="grid gap-2 md:grid-cols-2">
          {filtered
            .filter((task) => task.deadline)
            .map((task) => (
              <button
                key={task.id}
                onClick={() => setSelected(task)}
                className="flex items-center justify-between rounded-xl border border-line bg-elevated p-4 text-left hover:border-brand/40"
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {task.title}
                  </span>
                  <span className="text-xs text-muted">
                    {taskCategoryLabel(task.category)}
                  </span>
                </span>
                <Badge
                  variant={daysUntil(task.deadline) < 0 ? "danger" : "neutral"}
                >
                  {formatDateShort(task.deadline)}
                </Badge>
              </button>
            ))}
        </div>
      ) : view === "timeline" ? (
        <div className="space-y-2">
          {filtered.map((task) => (
            <button
              key={task.id}
              onClick={() => setSelected(task)}
              className="grid w-full grid-cols-[120px_1fr_auto] items-center gap-3 rounded-xl border border-line bg-elevated p-3 text-left"
            >
              <span className="text-xs text-muted">
                {formatDateShort(task.deadline)}
              </span>
              <span className="text-sm font-medium text-ink">{task.title}</span>
              <Badge variant={statusTones[task.status]}>
                {statusLabels[task.status]}
              </Badge>
            </button>
          ))}
        </div>
      ) : (
        <div>
          <div className="space-y-2 sm:hidden">
            {filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelected(task)}
                aria-label={`Deschide sarcina ${task.title}`}
                className="w-full rounded-xl border border-line bg-elevated p-4 text-left transition-colors hover:border-brand/40"
              >
                <span className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "min-w-0 text-sm font-semibold leading-5 text-ink",
                      task.status === "completed" && "text-faint line-through",
                    )}
                  >
                    {task.title}
                  </span>
                  <Badge variant={statusTones[task.status]}>
                    {statusLabels[task.status]}
                  </Badge>
                </span>
                <span className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="neutral">
                    {taskCategoryLabel(task.category)}
                  </Badge>
                  <Badge variant={priorityTones[task.priority]}>
                    {priorityLabels[task.priority]}
                  </Badge>
                  <span
                    className={cn(
                      "text-xs text-muted",
                      daysUntil(task.deadline) < 0 &&
                        task.status !== "completed" &&
                        "font-semibold text-danger",
                    )}
                  >
                    {formatDateShort(task.deadline)}
                  </span>
                </span>
                <span className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Avatar name={task.owner} size="xs" />
                  {task.owner}
                  {task.subtasks?.length ? (
                    <span className="ml-auto text-faint">
                      {task.subtasks.filter((item) => item.done).length}/
                      {task.subtasks.length} pași
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-xl border border-line bg-elevated sm:block">
            <Table>
              <THead>
                <TR>
                  <TH>Sarcină</TH>
                  <TH>Categorie</TH>
                  <TH>Responsabil</TH>
                  <TH>Prioritate</TH>
                  <TH>Stare</TH>
                  <TH>Termen</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((task) => (
                  <TR
                    key={task.id}
                    onClick={() => setSelected(task)}
                    className="cursor-pointer"
                  >
                    <TD>
                      <span
                        className={cn(
                          "font-medium text-ink",
                          task.status === "completed" &&
                            "text-faint line-through",
                        )}
                      >
                        {task.title}
                      </span>
                      {task.subtasks?.length ? (
                        <span className="ml-2 text-xs text-faint">
                          {task.subtasks.filter((item) => item.done).length}/
                          {task.subtasks.length}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      <Badge variant="neutral">
                        {taskCategoryLabel(task.category)}
                      </Badge>
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        <Avatar name={task.owner} size="xs" />
                        {task.owner}
                      </span>
                    </TD>
                    <TD>
                      <Badge variant={priorityTones[task.priority]}>
                        {priorityLabels[task.priority]}
                      </Badge>
                    </TD>
                    <TD>
                      <Badge variant={statusTones[task.status]}>
                        {statusLabels[task.status]}
                      </Badge>
                    </TD>
                    <TD>
                      <span
                        className={
                          daysUntil(task.deadline) < 0 &&
                          task.status !== "completed"
                            ? "font-semibold text-danger"
                            : "text-muted"
                        }
                      >
                        {formatDateShort(task.deadline)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        members={members}
        onCreate={createTask}
      />
      <TaskDrawer
        task={selected}
        availableTasks={tasks}
        members={members}
        onClose={() => setSelected(null)}
        onTransition={async (task, name) => run(() => transition(task, name))}
        onUpdate={async (task, patch) => run(() => updateTask(task, patch))}
        onDuplicate={async (task) =>
          run(async () => {
            if (!demoMode) {
              await weddingOsApi.copyTask(currentWorkspace.id, task.id);
              await refreshTasks();
            } else
              setTasks((items) => [
                ...items,
                {
                  ...task,
                  id: `demo-copy-${Date.now()}`,
                  title: `${task.title} (copie)`,
                  status: "not-started",
                },
              ]);
            toast({ title: "Sarcină duplicată", variant: "success" });
          })
        }
        onDelete={async (task) =>
          run(async () => {
            if (
              !window.confirm(
                "Ștergi această sarcină? Impactul asupra dependențelor va fi raportat de server.",
              )
            )
              return;
            if (!demoMode)
              await weddingOsApi.deleteTask(
                currentWorkspace.id,
                task.id,
                task.version ?? 1,
              );
            setTasks((items) => items.filter((item) => item.id !== task.id));
            setSelected(null);
          })
        }
        onDependencies={async (task, ids) =>
          run(async () => {
            if (!demoMode)
              await weddingOsApi.replaceTaskDependencies(
                currentWorkspace.id,
                task.id,
                task.version ?? 1,
                ids,
              );
            toast({ title: "Dependențe actualizate", variant: "success" });
            await refreshTasks();
          })
        }
        loadComments={async (taskId) =>
          demoMode
            ? []
            : (await weddingOsApi.taskComments(currentWorkspace.id, taskId))
                .items
        }
        addComment={async (taskId, body) =>
          demoMode
            ? {
                id: `demo-comment-${Date.now()}`,
                authorName: "Demo",
                body,
                createdAt: new Date().toISOString(),
              }
            : weddingOsApi.createTaskComment(currentWorkspace.id, taskId, body)
        }
      />
      <ProposalReview
        proposal={proposal}
        open={proposalOpen}
        busy={busy}
        onClose={() => setProposalOpen(false)}
        onUpdate={async (input) =>
          run(async () => {
            if (!proposal || demoMode) return;
            setProposal(
              await weddingOsApi.updatePlanProposal(
                currentWorkspace.id,
                proposal.id,
                proposal.version,
                input,
              ),
            );
          })
        }
        onReject={async (reason) =>
          run(async () => {
            if (!proposal || demoMode) return;
            setProposal(
              await weddingOsApi.rejectPlanProposal(
                currentWorkspace.id,
                proposal.id,
                proposal.version,
                reason,
              ),
            );
            setProposalOpen(false);
          })
        }
        onRegenerate={() => generatePlan("auto")}
        onApply={async () =>
          run(async () => {
            if (!proposal || demoMode) return;
            const counts = proposal.items.length;
            if (
              !window.confirm(
                `Aplici această propunere? Vor fi create fazele, reperele și sarcinile incluse (${counts} grupuri principale).`,
              )
            )
              return;
            const result = await weddingOsApi.applyPlanProposal(
              currentWorkspace.id,
              proposal.id,
              proposal.version,
              proposal.warnings.length > 0,
            );
            toast({
              title: "Plan aplicat",
              description: `${result.phaseCount} faze, ${result.milestoneCount} repere și ${result.taskCount} sarcini create.`,
              variant: "success",
            });
            setProposalOpen(false);
            await load();
          })
        }
      />
    </div>
  );
}
