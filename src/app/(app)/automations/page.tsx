"use client";

import * as React from "react";
import { Pause, Play, Plus, TestTube2, Workflow } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type AutomationRuleResource,
  type OperationResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";

const initialForm = {
  name: "",
  description: "",
  triggerType: "TASK_OVERDUE",
  actionType: "CREATE_NOTIFICATION",
};

export default function AutomationsPage() {
  const { currentWorkspace, demoMode, bootstrap } = useWorkspace();
  const { toast } = useToast();
  const [rules, setRules] = React.useState<AutomationRuleResource[]>([]);
  const [executions, setExecutions] = React.useState<Record<string, OperationResource[]>>({});
  const [open, setOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(initialForm);
  const capabilities = bootstrap?.membership.capabilities ?? [];
  const canWrite = capabilities.includes("automation.write");
  const canExecute = capabilities.includes("automation.execute");

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    try {
      const nextRules = (await weddingOsApi.automationRules(currentWorkspace.id)).items;
      setRules(nextRules);
      const history = await Promise.all(
        nextRules.map(async (rule) => [
          rule.id,
          (await weddingOsApi.automationExecutions(currentWorkspace.id, rule.id)).items,
        ] as const),
      );
      setExecutions(Object.fromEntries(history));
    } catch (error) {
      toast({
        title: "Automatizările nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [currentWorkspace, demoMode, toast]);
  React.useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const create = async () => {
    if (!currentWorkspace || !form.name.trim()) return;
    setBusyId("new");
    try {
      await weddingOsApi.createAutomationRule(currentWorkspace.id, {
        name: form.name,
        description: form.description || undefined,
        triggerType: form.triggerType,
        triggerConfiguration: {},
        conditions: [],
        actions: [
          {
            type: form.actionType,
            configuration: { title: form.name },
            position: 0,
          },
        ],
        requiresApproval: form.actionType !== "CREATE_NOTIFICATION",
      });
      setForm(initialForm);
      setOpen(false);
      await load();
      toast({ title: "Regula a fost creată ca draft", variant: "success" });
    } catch (error) {
      toast({
        title: "Regula nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const setStatus = async (
    rule: AutomationRuleResource,
    status: "ACTIVE" | "PAUSED",
  ) => {
    if (!currentWorkspace) return;
    setBusyId(rule.id);
    try {
      await weddingOsApi.updateAutomationRule(
        currentWorkspace.id,
        rule.id,
        rule.version,
        { status },
      );
      await load();
      toast({
        title:
          status === "ACTIVE"
            ? "Automatizarea este activă"
            : "Automatizarea este pusă pe pauză",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Statusul nu a fost actualizat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const execute = async (
    rule: AutomationRuleResource,
    mode: "DRY_RUN" | "EXECUTE",
  ) => {
    if (!currentWorkspace) return;
    setBusyId(rule.id);
    try {
      const result = await weddingOsApi.executeAutomationRule(
        currentWorkspace.id,
        rule.id,
        rule.version,
        mode,
      );
      let completed: Awaited<ReturnType<typeof weddingOsApi.job>> | null = null;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const job = await weddingOsApi.job(result.job.id);
        if (job.status === "completed") {
          completed = job;
          break;
        }
        if (["failed", "dead_letter", "cancelled"].includes(job.status))
          throw new Error(job.error?.message ?? "Execuția a eșuat.");
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      await load();
      toast({
        title:
          mode === "DRY_RUN"
            ? "Dry-run finalizat"
            : "Automatizarea a fost executată",
        description:
          mode === "DRY_RUN"
            ? "Zero efecte reale; poți verifica preview-ul în istoricul jobului."
            : `${completed ? "Efectele au fost confirmate de worker." : "Verifică statusul jobului."}`,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Execuția nu a fost finalizată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Automatizări"
        description="Reguli controlate, cu trigger și acțiuni dintr-un catalog închis."
        actions={
          <Button size="sm" disabled={demoMode || !canWrite} onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Regulă
          </Button>
        }
      />
      <div className="rounded-xl border border-info/30 bg-info-soft p-4 text-sm text-info">
        Dry-run-ul nu produce efecte. Execuția reală este disponibilă numai
        pentru reguli active și fiecare pas este deduplicat și auditat.
      </div>
      {!rules.length ? (
        <EmptyState
          icon={Workflow}
          title="Nu există automatizări"
          description="Creează o regulă din acțiunile permise și testeaz-o fără efecte înainte de activare."
          action={canWrite && !demoMode ? {
            label: "Creează prima regulă",
            onClick: () => setOpen(true),
          } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <section
              key={rule.id}
              className="rounded-xl border border-line bg-surface p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ink">{rule.name}</h2>
                    <Badge
                      variant={
                        rule.status === "active"
                          ? "success"
                          : rule.status === "paused"
                            ? "warning"
                            : "neutral"
                      }
                      dot
                    >
                      {rule.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {rule.description || "Fără descriere."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-faint">
                    <span>Trigger: {rule.triggerType}</span>
                    <span>•</span>
                    <span>DSL: {rule.dslVersion}</span>
                    <span>•</span>
                    <span>
                      {rule.requiresApproval
                        ? "aprobare necesară"
                        : "risc redus"}
                    </span>
                  </div>
                  {executions[rule.id]?.[0] ? <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-xs text-muted"><span className="font-medium text-ink">Ultima execuție:</span> {String(executions[rule.id]![0]!.mode).replaceAll("_", " ")} · {String(executions[rule.id]![0]!.status).replaceAll("_", " ")} · {executions[rule.id]![0]!.createdAt ? new Date(String(executions[rule.id]![0]!.createdAt)).toLocaleString("ro-RO") : "dată indisponibilă"}</div> : <p className="mt-3 text-xs text-muted">Regula nu a fost executată încă.</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === rule.id || !canExecute}
                    onClick={() => void execute(rule, "DRY_RUN")}
                  >
                    <TestTube2 className="size-4" /> Dry-run
                  </Button>
                  {rule.status === "active" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === rule.id || !canWrite}
                      onClick={() => void setStatus(rule, "PAUSED")}
                    >
                      <Pause className="size-4" /> Pauză
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === rule.id || !canWrite}
                      onClick={() => void setStatus(rule, "ACTIVE")}
                    >
                      <Play className="size-4" /> Activează
                    </Button>
                  )}
                  <Button
                    size="sm"
                    disabled={busyId === rule.id || rule.status !== "active" || !canExecute}
                    onClick={() => void execute(rule, "EXECUTE")}
                  >
                    <Workflow className="size-4" /> Execută
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Automatizare nouă"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button
              disabled={!form.name.trim() || busyId === "new"}
              onClick={() => void create()}
            >
              {busyId === "new" ? "Se salvează…" : "Creează draft"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nume" required>
            <Input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="ex. Atenționare pentru task urgent întârziat"
            />
          </Field>
          <Field label="Descriere">
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Trigger">
              <Select
                value={form.triggerType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    triggerType: event.target.value,
                  }))
                }
              >
                <option value="TASK_OVERDUE">Task întârziat</option>
                <option value="RISK_LEVEL_CHANGED">Nivel risc schimbat</option>
                <option value="MILESTONE_APPROACHING">
                  Milestone apropiat
                </option>
                <option value="MANUAL">Manual</option>
              </Select>
            </Field>
            <Field label="Acțiune">
              <Select
                value={form.actionType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    actionType: event.target.value,
                  }))
                }
              >
                <option value="CREATE_NOTIFICATION">Creează notificare</option>
                <option value="CREATE_TASK">Creează task</option>
                <option value="CREATE_RISK">Creează risc</option>
                <option value="CREATE_CALENDAR_EVENT">Creează eveniment</option>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-faint">
            Regula se salvează ca draft. Activeaz-o explicit numai după un
            dry-run.
          </p>
        </div>
      </Modal>
    </div>
  );
}
