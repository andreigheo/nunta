"use client";

import * as React from "react";
import Link from "next/link";
import { Grid3X3, Plus, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  apiErrorMessage,
  type RiskResource,
  weddingOsApi,
} from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { cn } from "@/lib/utils";

const levelMeta: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  low: { label: "Scăzut", tone: "success" },
  medium: { label: "Mediu", tone: "warning" },
  high: { label: "Ridicat", tone: "danger" },
  critical: { label: "Critic", tone: "danger" },
};

const statusMeta: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  open: { label: "Deschis", tone: "danger" },
  monitoring: { label: "Monitorizat", tone: "warning" },
  mitigating: { label: "În atenuare", tone: "warning" },
  resolved: { label: "Rezolvat", tone: "success" },
  accepted: { label: "Acceptat", tone: "neutral" },
  archived: { label: "Arhivat", tone: "neutral" },
};

const categoryLabels: Record<string, string> = {
  schedule: "Calendar",
  vendor: "Furnizori",
  budget: "Buget",
  guest: "Invitați",
  logistics: "Logistică",
  weather: "Meteo",
  safety: "Siguranță",
  other: "Altele",
};

const initialForm = {
  title: "",
  description: "",
  category: "OTHER",
  probability: "3",
  impact: "3",
};

export default function RisksPage() {
  const { currentWorkspace, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [risks, setRisks] = React.useState<RiskResource[]>([]);
  const [summary, setSummary] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<RiskResource | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [matrixOpen, setMatrixOpen] = React.useState(false);
  const [form, setForm] = React.useState(initialForm);

  const load = React.useCallback(async () => {
    if (!currentWorkspace || demoMode) {
      setRisks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await weddingOsApi.risks(currentWorkspace.id);
      setRisks(result.items);
      setSummary(result.summary);
      setDetail((current) =>
        current
          ? (result.items.find((item) => item.id === current.id) ?? null)
          : null,
      );
    } catch (loadError) {
      setError(apiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, demoMode]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const createRisk = async () => {
    if (!currentWorkspace || !form.title.trim()) return;
    setBusy(true);
    try {
      await weddingOsApi.createRisk(currentWorkspace.id, {
        title: form.title,
        description: form.description || undefined,
        category: form.category,
        probability: Number(form.probability),
        impact: Number(form.impact),
        source: "MANUAL",
      });
      setForm(initialForm);
      setAddOpen(false);
      await load();
      toast({ title: "Riscul a fost adăugat", variant: "success" });
    } catch (createError) {
      toast({
        title: "Riscul nu a fost salvat",
        description: apiErrorMessage(createError),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const resolveRisk = async (risk: RiskResource) => {
    if (!currentWorkspace) return;
    setBusy(true);
    try {
      const updated = await weddingOsApi.updateRisk(
        currentWorkspace.id,
        risk.id,
        risk.version,
        {
          status: "RESOLVED",
          resolutionNote: "Marcat rezolvat din registrul de riscuri.",
        },
      );
      setRisks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setDetail(updated);
      toast({ title: "Riscul este rezolvat", variant: "success" });
    } catch (updateError) {
      toast({
        title: "Statusul nu a fost actualizat",
        description: apiErrorMessage(updateError),
        variant: "error",
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const detect = async () => {
    if (!currentWorkspace) return;
    setBusy(true);
    try {
      const { job } = await weddingOsApi.detectRisks(currentWorkspace.id);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const current = await weddingOsApi.job(job.id);
        if (current.status === "completed") break;
        if (["failed", "dead_letter", "cancelled"].includes(current.status))
          throw new Error(
            current.error?.message ?? "Analiza riscurilor a eșuat.",
          );
        await new Promise((resolve) => window.setTimeout(resolve, 750));
      }
      await load();
      toast({
        title: "Analiza deterministă este gata",
        description: "Registrul a fost actualizat fără a inventa date externe.",
        variant: "success",
      });
    } catch (detectError) {
      toast({
        title: "Analiza nu a fost finalizată",
        description: apiErrorMessage(detectError),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const active = risks.filter(
    (risk) => !["resolved", "archived"].includes(risk.status ?? ""),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Riscuri & Plan B"
        description="Semnale reale, evaluări versionate și acțiuni de atenuare controlate."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMatrixOpen(true)}
            >
              <Grid3X3 className="size-3.5" aria-hidden /> Matrice
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || demoMode}
              onClick={() => void detect()}
            >
              {busy ? (
                <RefreshCw className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5 text-accent" />
              )}
              Detectează riscuri
            </Button>
            <Button
              size="sm"
              disabled={demoMode}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="size-4" aria-hidden /> Risc
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Critice"
          value={summary.critical ?? 0}
          tone={summary.critical ? "danger" : "default"}
          icon={ShieldAlert}
        />
        <StatCard
          label="Ridicate"
          value={summary.high ?? 0}
          tone={summary.high ? "warning" : "default"}
        />
        <StatCard label="Medii" value={summary.medium ?? 0} />
        <StatCard label="Scăzute" value={summary.low ?? 0} />
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
          <Button
            size="sm"
            variant="ghost"
            className="ml-3"
            onClick={() => void load()}
          >
            Reîncearcă
          </Button>
        </div>
      ) : null}

      {!loading && !risks.length ? (
        <EmptyState
          icon={ShieldAlert}
          title="Nu există riscuri înregistrate"
          description="Adaugă primul risc sau rulează detectorul determinist peste taskurile și milestone-urile reale."
          action={{ label: "Adaugă risc", onClick: () => setAddOpen(true) }}
        />
      ) : (
        <Table minWidth="880px">
          <THead>
            <TR>
              <TH>Risc</TH>
              <TH>Categorie</TH>
              <TH>Probabilitate</TH>
              <TH>Impact</TH>
              <TH align="center">Scor</TH>
              <TH>Nivel</TH>
              <TH>Stare</TH>
            </TR>
          </THead>
          <TBody>
            {risks.map((risk) => {
              const level = levelMeta[risk.level] ?? levelMeta.medium;
              const status =
                statusMeta[risk.status ?? "open"] ?? statusMeta.open;
              return (
                <TR key={risk.id} onClick={() => setDetail(risk)}>
                  <TD className="max-w-[320px] font-medium">{risk.title}</TD>
                  <TD>
                    <Badge variant="neutral">
                      {categoryLabels[risk.category] ?? risk.category}
                    </Badge>
                  </TD>
                  <TD className="tabular-nums">{risk.probability}/5</TD>
                  <TD className="tabular-nums">{risk.impact}/5</TD>
                  <TD align="center">
                    <span
                      className={cn(
                        "inline-flex size-8 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                        risk.score >= 20
                          ? "bg-danger text-on-danger"
                          : risk.score >= 12
                            ? "bg-danger-soft text-danger"
                            : risk.score >= 6
                              ? "bg-warning-soft text-warning"
                              : "bg-success-soft text-success",
                      )}
                    >
                      {risk.score}
                    </span>
                  </TD>
                  <TD>
                    <Badge variant={level.tone}>{level.label}</Badge>
                  </TD>
                  <TD>
                    <Badge variant={status.tone} dot>
                      {status.label}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <Drawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title}
        description={
          detail
            ? `${categoryLabels[detail.category] ?? detail.category} · scor ${detail.score}/25`
            : undefined
        }
        width="lg"
      >
        {detail ? (
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Probabilitate" value={`${detail.probability}/5`} />
              <Metric label="Impact" value={`${detail.impact}/5`} />
              <Metric
                label="Nivel"
                value={levelMeta[detail.level]?.label ?? detail.level}
              />
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">
                Descriere
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {detail.description || "Fără descriere."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-subtle"
                href={`/risks/${detail.id}`}
              >
                Deschide fișa completă
              </Link>
              <Link
                className="inline-flex h-8 items-center rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:bg-subtle"
                href={`/contingency-plans?riskId=${detail.id}`}
              >
                Plan B
              </Link>
              {detail.status !== "resolved" ? (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void resolveRisk(detail)}
                >
                  Marchează rezolvat
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Risc nou"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Renunță
            </Button>
            <Button
              disabled={busy || !form.title.trim()}
              onClick={() => void createRisk()}
            >
              {busy ? "Se salvează…" : "Adaugă riscul"}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Titlul riscului" required className="sm:col-span-2">
            <Input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="ex. Întârzierea confirmării locației"
            />
          </Field>
          <Field label="Categorie">
            <Select
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
            >
              <option value="SCHEDULE">Calendar</option>
              <option value="VENDOR">Furnizori</option>
              <option value="BUDGET">Buget</option>
              <option value="GUEST">Invitați</option>
              <option value="LOGISTICS">Logistică</option>
              <option value="WEATHER">Meteo</option>
              <option value="SAFETY">Siguranță</option>
              <option value="OTHER">Altele</option>
            </Select>
          </Field>
          <Field label="Probabilitate">
            <Select
              value={form.probability}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  probability: event.target.value,
                }))
              }
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}/5
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Impact">
            <Select
              value={form.impact}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  impact: event.target.value,
                }))
              }
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}/5
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scor calculat">
            <Input
              readOnly
              value={`${Number(form.probability) * Number(form.impact)}/25`}
            />
          </Field>
          <Field label="Descriere" className="sm:col-span-2">
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Ce s-ar putea întâmpla și care este impactul?"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={matrixOpen}
        onClose={() => setMatrixOpen(false)}
        title="Matricea riscurilor"
        description="Probabilitate × impact, pe datele persistente"
        size="lg"
      >
        <div className="grid grid-cols-5 gap-1">
          {[5, 4, 3, 2, 1].flatMap((probability) =>
            [1, 2, 3, 4, 5].map((impact) => {
              const items = active.filter(
                (risk) =>
                  risk.probability === probability && risk.impact === impact,
              );
              const cellScore = probability * impact;
              return (
                <div
                  key={`${probability}-${impact}`}
                  className={cn(
                    "min-h-20 rounded-lg p-2 text-center",
                    cellScore >= 20
                      ? "bg-danger/20"
                      : cellScore >= 12
                        ? "bg-danger-soft"
                        : cellScore >= 6
                          ? "bg-warning-soft"
                          : "bg-success-soft",
                  )}
                >
                  <p className="text-[10px] text-faint">
                    {probability}×{impact}
                  </p>
                  <div className="mt-2 flex flex-wrap justify-center gap-1">
                    {items.map((risk) => (
                      <button
                        key={risk.id}
                        type="button"
                        title={risk.title}
                        aria-label={risk.title}
                        onClick={() => {
                          setMatrixOpen(false);
                          setDetail(risk);
                        }}
                        className="size-3 rounded-full bg-ink"
                      />
                    ))}
                  </div>
                </div>
              );
            }),
          )}
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-subtle/70 p-3 text-center">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
