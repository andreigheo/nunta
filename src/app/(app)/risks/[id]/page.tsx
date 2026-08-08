"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Gauge,
  Plus,
  ShieldAlert,
} from "lucide-react";
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
  type RiskResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";

export default function RiskDetailPage() {
  const params = useParams<{ id: string }>();
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [risk, setRisk] = React.useState<RiskResource | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [title, setTitle] = React.useState("");
  const [assessmentOpen, setAssessmentOpen] = React.useState(false);
  const [probability, setProbability] = React.useState(3);
  const [impact, setImpact] = React.useState(3);
  const [assessmentReason, setAssessmentReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRisk(await weddingOsApi.risk(currentWorkspace.id, params.id));
    } catch (error) {
      toast({
        title: "Riscul nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode, params.id, toast]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const addMitigation = async () => {
    if (!currentWorkspace || !risk || !title.trim()) return;
    try {
      await weddingOsApi.addRiskMitigation(currentWorkspace.id, risk.id, {
        title,
      });
      setTitle("");
      await load();
      toast({ title: "Atenuarea a fost adăugată", variant: "success" });
    } catch (error) {
      toast({
        title: "Atenuarea nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  const assess = async () => {
    if (!currentWorkspace || !risk) return;
    setBusy(true);
    try {
      await weddingOsApi.assessRisk(currentWorkspace.id, risk.id, risk.version, {
        probability,
        impact,
        reason: assessmentReason || undefined,
      });
      setAssessmentOpen(false);
      await load();
      toast({ title: "Evaluarea riscului a fost salvată", variant: "success" });
    } catch (error) {
      toast({
        title: "Evaluarea nu a fost salvată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const transition = async (name: "START_MITIGATION" | "RESOLVE") => {
    if (!currentWorkspace || !risk) return;
    setBusy(true);
    try {
      await weddingOsApi.transitionRisk(
        currentWorkspace.id,
        risk.id,
        risk.version,
        name,
        name === "RESOLVE"
          ? "Riscul a fost verificat și închis din registru."
          : "A început aplicarea măsurilor de atenuare.",
      );
      await load();
      toast({
        title:
          name === "RESOLVE"
            ? "Riscul a fost rezolvat"
            : "Atenuarea a început",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Tranziția nu a fost aplicată",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!loading && !risk)
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Riscul nu este disponibil"
        description="Verifică workspace-ul și drepturile de acces."
      />
    );

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title={risk?.title ?? "Se încarcă…"}
        description={
          risk
            ? `${risk.category} · scor ${risk.score}/25 · ${risk.source}`
            : undefined
        }
        actions={
          <>
            {risk ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setProbability(risk.probability);
                  setImpact(risk.impact);
                  setAssessmentOpen(true);
                }}
              >
                <Gauge className="size-4" /> Reevaluează
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="size-4" /> Înapoi
            </Button>
          </>
        }
      />
      {risk ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Card label="Probabilitate" value={`${risk.probability}/5`} />
            <Card label="Impact" value={`${risk.impact}/5`} />
            <Card label="Nivel" value={risk.level} />
            <Card label="Status" value={risk.status ?? "open"} />
          </div>
          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-ink">Plan de atenuare</h2>
                <p className="text-sm text-muted">
                  Acțiuni persistente legate de acest risc.
                </p>
              </div>
              <Link
                className="text-sm font-medium text-brand hover:underline"
                href={`/contingency-plans?riskId=${risk.id}`}
              >
                Construiește Plan B
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {(risk.mitigations ?? []).map((mitigation) => (
                <div
                  key={mitigation.id}
                  className="flex items-center gap-2 rounded-lg bg-subtle p-3 text-sm text-ink"
                >
                  <CheckCircle2 className="size-4 text-success" />{" "}
                  {String(mitigation.title ?? "Atenuare")}
                </div>
              ))}
              {!risk.mitigations?.length ? (
                <p className="text-sm text-faint">
                  Nu există încă acțiuni de atenuare.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <Field label="Atenuare nouă" className="flex-1">
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="ex. Confirmă furnizorul de rezervă"
                />
              </Field>
              <Button
                className="mt-6"
                disabled={!title.trim()}
                onClick={() => void addMitigation()}
              >
                <Plus className="size-4" /> Adaugă
              </Button>
            </div>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-semibold text-ink">Descriere și evidență</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {risk.description || "Fără descriere."}
            </p>
            <div className="mt-3 flex gap-2">
              <Badge variant="neutral">versiunea {risk.version}</Badge>
              <Badge variant="neutral">
                actualizat {new Date(risk.updatedAt).toLocaleString("ro-RO")}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || risk.status === "mitigating"}
                onClick={() => void transition("START_MITIGATION")}
              >
                Începe atenuarea
              </Button>
              <Button
                size="sm"
                disabled={busy || risk.status === "resolved"}
                onClick={() => void transition("RESOLVE")}
              >
                Marchează rezolvat
              </Button>
            </div>
          </section>
          <Modal
            open={assessmentOpen}
            onClose={() => setAssessmentOpen(false)}
            title="Reevaluează riscul"
            description="Scorul este recalculat server-side din probabilitate × impact."
            footer={
              <>
                <Button variant="ghost" onClick={() => setAssessmentOpen(false)}>
                  Renunță
                </Button>
                <Button disabled={busy} onClick={() => void assess()}>
                  Salvează evaluarea
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Probabilitate (1–5)">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={probability}
                  onChange={(event) => setProbability(Number(event.target.value))}
                />
              </Field>
              <Field label="Impact (1–5)">
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={impact}
                  onChange={(event) => setImpact(Number(event.target.value))}
                />
              </Field>
              <Field label="Motiv" className="sm:col-span-2">
                <Textarea
                  value={assessmentReason}
                  onChange={(event) => setAssessmentReason(event.target.value)}
                  placeholder="Ce s-a schimbat față de evaluarea anterioară?"
                />
              </Field>
            </div>
          </Modal>
        </>
      ) : null}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-lg font-semibold capitalize text-ink">{value}</p>
    </div>
  );
}
