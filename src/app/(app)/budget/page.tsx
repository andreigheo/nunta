"use client";

import * as React from "react";
import { Download, Plus, WalletCards } from "lucide-react";
import { formatRON } from "@/lib/utils";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, Modal, PageHeader, Progress, Select, Table, Textarea, TBody, TD, TH, THead, TR, useToast } from "@/components/ui";

type BudgetResponse = { plan: OperationResource | null; categories: OperationResource[]; items: OperationResource[]; summary: Record<string, unknown> | null };

export default function BudgetPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [budget, setBudget] = React.useState<BudgetResponse>({ plan: null, categories: [], items: [], summary: null });
  const [expenses, setExpenses] = React.useState<OperationResource[]>([]);
  const [mode, setMode] = React.useState<"plan" | "category" | "item" | "expense" | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const currency = bootstrap?.workspace.currency ?? "RON";
  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    if (demoMode) {
      setBudget({
        plan: { id: "demo-budget", version: 1, name: "Buget demo", targetTotalMinor: 18000000, contingencyPercent: 10 },
        categories: [{ id: "demo-category", version: 1, name: "Foto-video", canonicalType: "PHOTO_VIDEO", allocatedMinor: 3500000 }],
        items: [{ id: "demo-item", version: 1, categoryId: "demo-category", name: "Pachet foto demo", status: "COMMITTED", estimatedMinor: 3000000, committedMinor: 3000000, paidMinor: 1000000 }],
        summary: { targetTotalMinor: 18000000, committedMinor: 3000000, paidMinor: 1000000 },
      });
      setExpenses([{ id: "demo-expense", version: 1, description: "Avans foto demo", status: "PAID", amountMinor: 1000000 }]);
      return;
    }
    try { const [nextBudget, nextExpenses] = await Promise.all([weddingOsApi.budget(currentWorkspace.id), weddingOsApi.expenses(currentWorkspace.id)]); setBudget(nextBudget as unknown as BudgetResponse); setExpenses(nextExpenses.items); }
    catch (error) { toast({ title: "Bugetul nu a putut fi încărcat", description: apiErrorMessage(error), variant: "error" }); }
  }, [currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);

  const submit = async () => {
    if (!currentWorkspace || !mode) return;
    if (demoMode) { toast({ title: "Buget demo actualizat local", description: "Nu a fost trimisă nicio mutație API.", variant: "info" }); setMode(null); return; }
    try {
      if (mode === "plan") await weddingOsApi.upsertBudget(currentWorkspace.id, budget.plan?.version ?? null, { name: form.name || "Bugetul evenimentului", targetTotalMinor: minor(form.amount), contingencyPercent: Number(form.contingency || 0), status: "ACTIVE" });
      if (mode === "category") await weddingOsApi.createBudgetCategory(currentWorkspace.id, { name: form.name, canonicalType: form.type || null, allocatedMinor: minor(form.amount), position: budget.categories.length });
      if (mode === "item") await weddingOsApi.createBudgetItem(currentWorkspace.id, { categoryId: form.categoryId, name: form.name, description: form.description || null, estimatedMinor: minor(form.amount), dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00.000Z`).toISOString() : null });
      if (mode === "expense") await weddingOsApi.createExpense(currentWorkspace.id, { budgetItemId: form.itemId, description: form.description, amountMinor: minor(form.amount), expenseDate: form.date, status: "INCURRED", paymentMethodLabel: form.method || null, notesPrivate: form.notes || null });
      setMode(null); setForm({}); await load(); toast({ title: "Buget actualizat", variant: "success" });
    } catch (error) { toast({ title: "Datele nu au fost salvate", description: apiErrorMessage(error), variant: "error" }); }
  };
  const exportBudget = async () => {
    if (!currentWorkspace) return;
    if (demoMode) { toast({ title: "Export indisponibil în demo", variant: "info" }); return; }
    try { const result = await weddingOsApi.commercialExport(currentWorkspace.id, { type: "budget", format: "xlsx" }); toast({ title: "Export pus în coadă", description: `Job ${result.job.id.slice(0, 8)} procesează artefactul XLSX.`, variant: "info" }); }
    catch (error) { toast({ title: "Exportul nu a fost pornit", description: apiErrorMessage(error), variant: "error" }); }
  };
  const summary = budget.summary ?? {};
  const target = Number(summary.targetTotalMinor ?? 0) / 100;
  const committed = Number(summary.committedMinor ?? 0) / 100;
  const paid = Number(summary.paidMinor ?? 0) / 100;
  return <div className="mx-auto max-w-7xl space-y-4"><PageHeader title="Buget" description="Vezi ce ai estimat, ce ai confirmat și ce mai rămâne de plătit." actions={<><Button variant="outline" size="sm" onClick={() => void exportBudget()} disabled={!budget.plan}><Download className="size-4" />Export XLSX</Button><Button size="sm" onClick={() => setMode(budget.plan ? "item" : "plan")}><Plus className="size-4" />{budget.plan ? "Poziție nouă" : "Configurează bugetul"}</Button></>} />
    {!budget.plan ? <EmptyState icon={WalletCards} title="Bugetul nu este configurat" description="Setează ținta bugetului. Ofertele acceptate vor crea automat poziții angajate fără a inventa plăți." action={{ label: "Configurează bugetul", onClick: () => setMode("plan") }} /> : <><div className="grid gap-3 sm:grid-cols-3"><Metric label="Țintă" value={formatRON(target)} /><Metric label="Angajat" value={formatRON(committed)} /><Metric label="Plătit înregistrat" value={formatRON(paid)} /></div><Card><CardContent className="p-4"><div className="flex justify-between text-sm"><span className="text-muted">Progres angajamente</span><span className="font-semibold text-ink">{target ? Math.round(committed / target * 100) : 0}%</span></div><Progress className="mt-2" value={committed} max={Math.max(target, 1)} /></CardContent></Card><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setMode("category")}>Categorie nouă</Button><Button variant="outline" size="sm" onClick={() => setMode("expense")} disabled={!budget.items.length}>Cheltuială nouă</Button><Button variant="outline" size="sm" onClick={() => { setMode("plan"); setForm({ name: String(budget.plan?.name ?? ""), amount: String(Number(budget.plan?.targetTotalMinor ?? 0) / 100), contingency: String(budget.plan?.contingencyPercent ?? 0) }); }}>Editează ținta</Button></div><Table minWidth="760px"><THead><TR><TH>Poziție</TH><TH>Categorie</TH><TH>Stare</TH><TH align="right">Estimat</TH><TH align="right">Angajat</TH><TH align="right">Plătit</TH></TR></THead><TBody>{budget.items.map((item) => <TR key={item.id}><TD className="font-medium">{String(item.name)}</TD><TD>{String(budget.categories.find((category) => category.id === item.categoryId)?.name ?? "—")}</TD><TD><Badge variant={item.status === "PAID" ? "success" : item.status === "COMMITTED" ? "brand" : "neutral"}>{label(String(item.status))}</Badge></TD><TD align="right">{formatRON(Number(item.estimatedMinor ?? 0) / 100)}</TD><TD align="right">{formatRON(Number(item.committedMinor ?? 0) / 100)}</TD><TD align="right">{formatRON(Number(item.paidMinor ?? 0) / 100)}</TD></TR>)}</TBody></Table>{expenses.length ? <Card><CardContent className="p-4"><p className="font-semibold text-ink">Cheltuieli ({expenses.length})</p><div className="mt-3 space-y-2">{expenses.map((expense) => <div key={expense.id} className="flex justify-between border-b border-line pb-2 text-sm"><span>{String(expense.description)} · {label(String(expense.status))}</span><span className="font-medium">{formatRON(Number(expense.amountMinor ?? 0) / 100)}</span></div>)}</div></CardContent></Card> : null}</>}
    <Modal open={Boolean(mode)} onClose={() => { setMode(null); setForm({}); }} title={mode === "plan" ? "Plan de buget" : mode === "category" ? "Categorie nouă" : mode === "item" ? "Poziție nouă" : "Cheltuială nouă"} footer={<><Button variant="ghost" onClick={() => setMode(null)}>Renunță</Button><Button onClick={() => void submit()}>Salvează</Button></>}><div className="space-y-3">{mode !== "expense" ? <Field label="Nume"><Input value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field> : null}{mode === "plan" ? <Field label={`Țintă (${currency})`}><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field> : null}{mode === "plan" ? <Field label="Contingență (%)"><Input inputMode="numeric" value={form.contingency ?? "0"} onChange={(event) => setForm({ ...form, contingency: event.target.value })} /></Field> : null}{mode === "category" ? <><Field label="Tip"><Select value={form.type ?? "MISCELLANEOUS"} onChange={(event) => setForm({ ...form, type: event.target.value })}>{["VENUE", "CATERING", "PHOTO_VIDEO", "ENTERTAINMENT", "DECOR_FLOWERS", "TRANSPORT", "ACCOMMODATION", "MISCELLANEOUS"].map((value) => <option key={value}>{value}</option>)}</Select></Field><Field label={`Alocare (${currency})`}><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field></> : null}{mode === "item" ? <><Field label="Categorie"><Select value={form.categoryId ?? ""} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="">Selectează</option>{budget.categories.map((category) => <option key={category.id} value={category.id}>{String(category.name)}</option>)}</Select></Field><Field label={`Estimare (${currency})`}><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label="Scadență"><Input type="date" value={form.dueAt ?? ""} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></Field><Field label="Descriere"><Textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field></> : null}{mode === "expense" ? <><Field label="Poziție buget"><Select value={form.itemId ?? ""} onChange={(event) => setForm({ ...form, itemId: event.target.value })}><option value="">Selectează</option>{budget.items.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</Select></Field><Field label="Descriere"><Input value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field><Field label={`Sumă (${currency})`}><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></Field><Field label="Data"><Input type="date" value={form.date ?? ""} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><Field label="Metodă externă"><Input value={form.method ?? ""} onChange={(event) => setForm({ ...form, method: event.target.value })} /></Field></> : null}</div></Modal>
  </div>;
}
function Metric({ label: metricLabel, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-faint">{metricLabel}</p><p className="mt-1 text-xl font-semibold text-ink">{value}</p></CardContent></Card>; }
function minor(value?: string) { return Math.max(0, Math.round(Number(value || 0) * 100)); }
function label(value: string) { return value.toLowerCase().replaceAll("_", " "); }
