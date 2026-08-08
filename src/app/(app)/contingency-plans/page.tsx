"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, ShieldCheck } from "lucide-react";
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

export default function ContingencyPlansPage() {
  const searchParams = useSearchParams();
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [plans, setPlans] = React.useState<ContingencyPlanResource[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [action, setAction] = React.useState("");

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) return;
    try {
      setPlans(
        (await weddingOsApi.contingencyPlans(currentWorkspace.id)).items,
      );
    } catch (error) {
      toast({
        title: "Planurile B nu au putut fi încărcate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [currentWorkspace, demoMode, toast]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  React.useEffect(() => {
    if (!searchParams.get("riskId")) return;
    const timeout = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timeout);
  }, [searchParams]);

  const create = async () => {
    if (!currentWorkspace || !title.trim() || !action.trim()) return;
    setBusy(true);
    try {
      await weddingOsApi.createContingencyPlan(currentWorkspace.id, {
        riskId: searchParams.get("riskId") || undefined,
        title,
        summary: summary || undefined,
        triggers: [{ type: "MANUAL", configuration: {} }],
        actions: [{ title: action, position: 0 }],
      });
      setOpen(false);
      setTitle("");
      setSummary("");
      setAction("");
      await load();
      toast({ title: "Planul B a fost creat", variant: "success" });
    } catch (error) {
      toast({
        title: "Planul B nu a fost salvat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Planuri B"
        description="Declanșatori, acțiuni versionate, simulare fără efecte și activare explicită."
        actions={
          <Button size="sm" disabled={demoMode} onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Plan B
          </Button>
        }
      />
      {!plans.length ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nu există Planuri B"
          description="Creează un plan pentru un risc și verifică-l prin simulare înainte de activare."
          action={{
            label: "Creează primul plan",
            onClick: () => setOpen(true),
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/contingency-plans/${plan.id}`}
              className="rounded-xl border border-line bg-surface p-5 transition-colors hover:border-brand/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-ink">{plan.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">
                    {plan.summary || "Fără rezumat."}
                  </p>
                </div>
                <Badge
                  variant={plan.status === "active" ? "danger" : "neutral"}
                  dot
                >
                  {plan.status}
                </Badge>
              </div>
              <p className="mt-4 text-xs text-faint">
                Versiunea {plan.version} · actualizat{" "}
                {new Date(plan.updatedAt).toLocaleString("ro-RO")}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Plan B nou"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Renunță
            </Button>
            <Button
              disabled={busy || !title.trim() || !action.trim()}
              onClick={() => void create()}
            >
              {busy ? "Se salvează…" : "Creează"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Titlu" required>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="ex. Locație alternativă pentru ceremonie"
            />
          </Field>
          <Field label="Rezumat">
            <Textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Când și de ce se activează acest plan?"
            />
          </Field>
          <Field label="Prima acțiune" required>
            <Input
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="ex. Confirmă sala interioară cu locația"
            />
          </Field>
          <p className="text-xs text-faint">
            Declanșatorul inițial este manual. Poți simula planul înainte de
            activare.
          </p>
        </div>
      </Modal>
    </div>
  );
}
