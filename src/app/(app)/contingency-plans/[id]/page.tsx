"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Pencil, Play, ShieldCheck, Zap } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type ContingencyPlanResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";

export default function ContingencyPlanPage() {
  const params = useParams<{ id: string }>();
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [plan, setPlan] = React.useState<ContingencyPlanResource | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    try {
      setPlan(
        await weddingOsApi.contingencyPlan(currentWorkspace.id, params.id),
      );
    } catch (error) {
      toast({
        title: "Planul B nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [currentWorkspace, demoMode, params.id, toast]);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const waitJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const job = await weddingOsApi.job(jobId);
      if (job.status === "completed") return;
      if (["failed", "dead_letter", "cancelled"].includes(job.status))
        throw new Error(job.error?.message ?? "Job eșuat");
      await new Promise((resolve) => window.setTimeout(resolve, 750));
    }
    throw new Error("Operațiunea durează prea mult.");
  };

  const simulate = async () => {
    if (!currentWorkspace || !plan) return;
    setBusy(true);
    try {
      const result = await weddingOsApi.simulateContingencyPlan(
        currentWorkspace.id,
        plan.id,
        { triggerType: "MANUAL", assumptions: [] },
      );
      await waitJob(result.job.id);
      await load();
      toast({
        title: "Simularea este gata",
        description: "Nicio modificare reală nu a fost executată.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Simularea a eșuat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const activate = async () => {
    if (!currentWorkspace || !plan) return;
    setBusy(true);
    try {
      await weddingOsApi.activateContingencyPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
        "Activare confirmată din fișa Plan B.",
      );
      await load();
      toast({ title: "Planul B a fost activat", variant: "success" });
    } catch (error) {
      toast({
        title: "Activarea a eșuat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!currentWorkspace || !plan) return;
    setBusy(true);
    try {
      await weddingOsApi.approveContingencyPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
        "Planul B a fost verificat în interfața de review.",
      );
      await load();
      toast({ title: "Planul B este aprobat", variant: "success" });
    } catch (error) {
      toast({
        title: "Aprobarea a eșuat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = () => {
    if (!plan) return;
    setTitle(plan.title);
    setSummary(plan.summary ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!currentWorkspace || !plan || !title.trim()) return;
    setBusy(true);
    try {
      await weddingOsApi.updateContingencyPlan(
        currentWorkspace.id,
        plan.id,
        plan.version,
        { title: title.trim(), summary: summary.trim() || undefined },
      );
      setEditing(false);
      await load();
      toast({ title: "Planul B a fost actualizat", variant: "success" });
    } catch (error) {
      toast({
        title: "Planul B nu a fost actualizat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!plan)
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Planul B se încarcă"
        description="Verificăm resursa și accesul la workspace."
      />
    );
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={plan.title}
        description={plan.summary ?? "Plan de continuitate Sarbato"}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || plan.status !== "draft"}
              onClick={beginEdit}
            >
              <Pencil className="size-4" /> Editează
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void simulate()}
            >
              <Play className="size-4" /> Simulează
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || plan.status !== "draft"}
              onClick={() => void approve()}
            >
              <ShieldCheck className="size-4" /> Aprobă
            </Button>
            <Button
              size="sm"
              disabled={busy || plan.status !== "ready"}
              onClick={() => void activate()}
            >
              <Zap className="size-4" /> Activează
            </Button>
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Declanșatori</h2>
            <Badge variant="neutral">{plan.triggers?.length ?? 0}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {plan.triggers?.map((trigger) => (
              <div
                key={trigger.id}
                className="rounded-lg bg-subtle p-3 text-sm text-ink"
              >
                {String(trigger.triggerType ?? "MANUAL")}
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Acțiuni</h2>
            <Badge variant="neutral">{plan.actions?.length ?? 0}</Badge>
          </div>
          <div className="mt-3 space-y-2">
            {plan.actions?.map((action, index) => (
              <div
                key={action.id}
                className="rounded-lg bg-subtle p-3 text-sm text-ink"
              >
                <span className="mr-2 text-faint">{index + 1}.</span>
                {String(action.title ?? "Acțiune")}
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold text-ink">Istoric simulări</h2>
        <div className="mt-3 space-y-2">
          {plan.simulations?.map((simulation) => (
            <div
              key={simulation.id}
              className="flex items-center justify-between rounded-lg bg-subtle p-3 text-sm"
            >
              <span>{String(simulation.status)}</span>
              <span className="text-faint">
                {simulation.createdAt
                  ? new Date(String(simulation.createdAt)).toLocaleString(
                      "ro-RO",
                    )
                  : ""}
              </span>
            </div>
          ))}
          {!plan.simulations?.length ? (
            <p className="text-sm text-faint">
              Nu a fost rulată nicio simulare.
            </p>
          ) : null}
        </div>
      </section>
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Editează Planul B"
        description="Modificările creează o versiune nouă înainte de aprobare."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Renunță
            </Button>
            <Button disabled={busy || !title.trim()} onClick={() => void saveEdit()}>
              Salvează versiunea
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Titlu">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Rezumat">
            <Textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
