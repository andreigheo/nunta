"use client";

import * as React from "react";
import {
  Download,
  FolderPlus,
  Plus,
  ReceiptText,
  Target,
  WalletCards,
} from "lucide-react";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Progress,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from "@/components/ui";

type BudgetResponse = {
  plan: OperationResource | null;
  categories: OperationResource[];
  items: OperationResource[];
  summary: Record<string, unknown> | null;
};
type EditorMode = "plan" | "category" | "item" | "expense";

const categoryTypes = [
  ["VENUE", "Locație"],
  ["CATERING", "Mâncare și băuturi"],
  ["PHOTO_VIDEO", "Foto și video"],
  ["ENTERTAINMENT", "Muzică și divertisment"],
  ["DECOR_FLOWERS", "Decor și flori"],
  ["TRANSPORT", "Transport"],
  ["ACCOMMODATION", "Cazare"],
  ["MISCELLANEOUS", "Altele"],
] as const;

export default function BudgetPage() {
  const { currentWorkspace, bootstrap, demoMode } = useWorkspace();
  const { toast } = useToast();
  const [budget, setBudget] = React.useState<BudgetResponse>({
    plan: null,
    categories: [],
    items: [],
    summary: null,
  });
  const [expenses, setExpenses] = React.useState<OperationResource[]>([]);
  const [onboardingTarget, setOnboardingTarget] = React.useState<{
    amount: number;
    currency: string;
  } | null>(null);
  const [mode, setMode] = React.useState<EditorMode | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const currency = safeCurrency(
    budget.plan?.currency ??
      onboardingTarget?.currency ??
      bootstrap?.workspace.currency,
  );
  const canEdit = bootstrap?.membership.capabilities.includes("budget.write") ?? false;

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    if (demoMode) {
      setBudget({
        plan: {
          id: "demo-budget",
          version: 1,
          name: "Buget demo",
          currency: "RON",
          targetTotalMinor: 18_000_000,
          contingencyPercent: 10,
        },
        categories: [
          {
            id: "demo-category",
            version: 1,
            name: "Foto și video",
            canonicalType: "PHOTO_VIDEO",
            allocatedMinor: 3_500_000,
          },
        ],
        items: [
          {
            id: "demo-item",
            version: 1,
            categoryId: "demo-category",
            name: "Pachet foto demo",
            status: "COMMITTED",
            estimatedMinor: 3_000_000,
            committedMinor: 3_000_000,
            paidMinor: 1_000_000,
          },
        ],
        summary: {
          targetTotalMinor: 18_000_000,
          committedMinor: 3_000_000,
          paidMinor: 1_000_000,
        },
      });
      setExpenses([
        {
          id: "demo-expense",
          version: 1,
          description: "Avans foto demo",
          status: "PAID",
          amountMinor: 1_000_000,
        },
      ]);
      return;
    }
    try {
      const canReadOnboarding =
        bootstrap?.membership.capabilities.includes("workspace.update") ?? false;
      const [nextBudget, nextExpenses, onboarding] = await Promise.all([
        weddingOsApi.budget(currentWorkspace.id),
        weddingOsApi.expenses(currentWorkspace.id),
        canReadOnboarding
          ? weddingOsApi.onboarding(currentWorkspace.id)
          : Promise.resolve(null),
      ]);
      setBudget(nextBudget as unknown as BudgetResponse);
      setExpenses(nextExpenses.items);
      if (onboarding) {
        const rawAmount = Number(onboarding.budget.budget ?? onboarding.budget.amount);
        setOnboardingTarget(
          onboarding.budget.confirmed === true && Number.isFinite(rawAmount) && rawAmount > 0
            ? {
                amount: rawAmount,
                currency: safeCurrency(
                  onboarding.budget.currency ?? bootstrap?.workspace.currency,
                ),
              }
            : null,
        );
      }
    } catch (error) {
      toast({
        title: "Bugetul nu a putut fi încărcat",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  }, [bootstrap, currentWorkspace, demoMode, toast]);
  useDeferredLoad(load);

  const openEditor = (nextMode: EditorMode, defaults: Record<string, string> = {}) => {
    setMode(nextMode);
    setForm(defaults);
  };
  const openPlan = (useOnboardingTarget = false) =>
    openEditor("plan", {
      name: String(budget.plan?.name ?? "Bugetul nunții"),
      amount: String(
        useOnboardingTarget
          ? onboardingTarget?.amount ?? ""
          : Number(budget.plan?.targetTotalMinor ?? 0) / 100 || "",
      ),
      contingency: String(budget.plan?.contingencyPercent ?? 10),
    });

  const valid = editorIsValid(mode, form);
  const submit = async () => {
    if (!currentWorkspace || !mode || !valid) return;
    if (demoMode) {
      toast({
        title: "Buget demo actualizat local",
        description: "Nu a fost trimisă nicio modificare către server.",
        variant: "info",
      });
      setMode(null);
      return;
    }
    setSaving(true);
    try {
      if (mode === "plan")
        await weddingOsApi.upsertBudget(
          currentWorkspace.id,
          budget.plan?.version ?? null,
          {
            name: form.name.trim(),
            targetTotalMinor: minor(form.amount),
            contingencyPercent: Number(form.contingency || 0),
            status: "ACTIVE",
          },
        );
      if (mode === "category")
        await weddingOsApi.createBudgetCategory(currentWorkspace.id, {
          name: form.name.trim(),
          canonicalType: form.type || null,
          allocatedMinor: minor(form.amount),
          position: budget.categories.length,
        });
      if (mode === "item")
        await weddingOsApi.createBudgetItem(currentWorkspace.id, {
          categoryId: form.categoryId,
          name: form.name.trim(),
          description: form.description?.trim() || null,
          estimatedMinor: minor(form.amount),
          dueAt: form.dueAt
            ? new Date(`${form.dueAt}T12:00:00.000Z`).toISOString()
            : null,
        });
      if (mode === "expense")
        await weddingOsApi.createExpense(currentWorkspace.id, {
          budgetItemId: form.itemId,
          description: form.description.trim(),
          amountMinor: minor(form.amount),
          expenseDate: form.date,
          status: "INCURRED",
          paymentMethodLabel: form.method?.trim() || null,
          notesPrivate: form.notes?.trim() || null,
        });
      setMode(null);
      setForm({});
      await load();
      toast({ title: "Buget actualizat", variant: "success" });
    } catch (error) {
      toast({
        title: "Datele nu au fost salvate",
        description: apiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const exportBudget = async () => {
    if (!currentWorkspace) return;
    if (demoMode) {
      toast({ title: "Export indisponibil în demo", variant: "info" });
      return;
    }
    try {
      const result = await weddingOsApi.commercialExport(currentWorkspace.id, {
        type: "budget",
        format: "xlsx",
      });
      toast({
        title: "Export pus în coadă",
        description: `Job ${result.job.id.slice(0, 8)} procesează fișierul XLSX.`,
        variant: "info",
      });
    } catch (error) {
      toast({
        title: "Exportul nu a fost pornit",
        description: apiErrorMessage(error),
        variant: "error",
      });
    }
  };

  const summary = budget.summary ?? {};
  const targetMinor = Number(summary.targetTotalMinor ?? 0);
  const committedMinor = Number(summary.committedMinor ?? 0);
  const paidMinor = Number(summary.paidMinor ?? 0);
  const progress = targetMinor ? Math.round((committedMinor / targetMinor) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Bugetul nunții"
        description="Pornește de la o țintă, împarte-o pe categorii și înregistrează numai cheltuielile reale."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void exportBudget()} disabled={!budget.plan}>
              <Download className="size-4" />
              Export XLSX
            </Button>
            {canEdit ? (
              <Button
                size="sm"
                onClick={() =>
                  budget.plan
                    ? budget.categories.length
                      ? openEditor("item")
                      : openEditor("category", { type: "MISCELLANEOUS" })
                    : openPlan(Boolean(onboardingTarget))
                }
              >
                <Plus className="size-4" />
                {!budget.plan
                  ? "Setează ținta"
                  : budget.categories.length
                    ? "Poziție nouă"
                    : "Prima categorie"}
              </Button>
            ) : null}
          </>
        }
      />

      {!budget.plan ? (
        <section className="overflow-hidden rounded-2xl border border-brand/20 bg-surface shadow-card" aria-labelledby="budget-start-title">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="p-5 sm:p-7">
              <Badge variant="brand">Începe cu ținta</Badge>
              <h2 id="budget-start-title" className="mt-3 max-w-2xl font-brand text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">
                Bugetul devine simplu când îl construiești în ordinea potrivită.
              </h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <BudgetStep icon={Target} number="1" title="Țintă" copy="Suma totală pe care vrei să o respecți." />
                <BudgetStep icon={FolderPlus} number="2" title="Categorii" copy="Cât aloci pentru locație, foto, decor și restul." />
                <BudgetStep icon={ReceiptText} number="3" title="Cheltuieli" copy="Ce ai confirmat și ce ai plătit în realitate." />
              </div>
            </div>
            <div className="flex items-center border-t border-line bg-brand-softer/60 p-5 lg:border-l lg:border-t-0 lg:p-6">
              <div className="w-full">
                {onboardingTarget ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">Din configurarea inițială</p>
                    <p className="mt-2 font-brand text-3xl font-semibold text-ink">
                      {formatMoney(onboardingTarget.amount * 100, onboardingTarget.currency)}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Ai introdus deja această estimare. Confirm-o aici și o folosim ca țintă reală a bugetului.
                    </p>
                    {canEdit ? (
                      <Button className="mt-4 w-full" onClick={() => openPlan(true)}>
                        Folosește această țintă
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="font-brand text-xl font-semibold text-ink">Alege o sumă realistă</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      Poți modifica ținta oricând. Nu vom înregistra plăți automat și nu vom inventa costuri.
                    </p>
                    {canEdit ? (
                      <Button className="mt-4 w-full" onClick={() => openPlan()}>
                        Setează ținta bugetului
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Ținta totală" value={formatMoney(targetMinor, currency)} />
            <Metric label="Costuri confirmate" value={formatMoney(committedMinor, currency)} />
            <Metric label="Plăți înregistrate" value={formatMoney(paidMinor, currency)} />
          </div>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold text-ink">Cât din țintă este deja angajat</p>
                  <p className="mt-1 text-xs text-muted">Costuri confirmate, indiferent dacă au fost sau nu plătite.</p>
                </div>
                <span className="font-semibold text-ink">{progress}%</span>
              </div>
              <Progress className="mt-3" value={committedMinor} max={Math.max(targetMinor, 1)} />
            </CardContent>
          </Card>
          {canEdit ? (
            <div className="flex flex-wrap gap-2" aria-label="Acțiuni pentru buget">
              <Button variant="outline" size="sm" onClick={() => openEditor("category", { type: "MISCELLANEOUS" })}>
                Categorie nouă
              </Button>
              <Button variant="outline" size="sm" onClick={() => openEditor("expense")} disabled={!budget.items.length}>
                Înregistrează o cheltuială
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openPlan()}>
                Modifică ținta
              </Button>
            </div>
          ) : null}
          {budget.items.length ? (
            <Table minWidth="760px">
              <THead>
                <TR>
                  <TH>Poziție</TH>
                  <TH>Categorie</TH>
                  <TH>Stare</TH>
                  <TH align="right">Estimat</TH>
                  <TH align="right">Confirmat</TH>
                  <TH align="right">Plătit</TH>
                </TR>
              </THead>
              <TBody>
                {budget.items.map((item) => (
                  <TR key={item.id}>
                    <TD className="font-medium">{String(item.name)}</TD>
                    <TD>{String(budget.categories.find((category) => category.id === item.categoryId)?.name ?? "—")}</TD>
                    <TD>
                      <Badge variant={item.status === "PAID" ? "success" : item.status === "COMMITTED" ? "brand" : "neutral"}>
                        {statusLabel(String(item.status))}
                      </Badge>
                    </TD>
                    <TD align="right">{formatMoney(Number(item.estimatedMinor ?? 0), currency)}</TD>
                    <TD align="right">{formatMoney(Number(item.committedMinor ?? 0), currency)}</TD>
                    <TD align="right">{formatMoney(Number(item.paidMinor ?? 0), currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              icon={WalletCards}
              title={budget.categories.length ? "Adaugă prima poziție de buget" : "Împarte ținta în categorii"}
              description={budget.categories.length ? "O poziție reprezintă un cost concret: locație, fotograf, flori sau orice alt serviciu." : "Creează întâi categoriile importante. Apoi vei putea adăuga costurile concrete în fiecare dintre ele."}
              action={canEdit ? {
                label: budget.categories.length ? "Adaugă o poziție" : "Creează prima categorie",
                onClick: () => budget.categories.length ? openEditor("item") : openEditor("category", { type: "MISCELLANEOUS" }),
              } : undefined}
            />
          )}
          {expenses.length ? (
            <Card>
              <CardContent className="p-4 sm:p-5">
                <p className="font-semibold text-ink">Cheltuieli înregistrate ({expenses.length})</p>
                <div className="mt-3 divide-y divide-line">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                      <span>{String(expense.description)} · {statusLabel(String(expense.status))}</span>
                      <span className="font-medium text-ink">{formatMoney(Number(expense.amountMinor ?? 0), currency)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(mode)}
        onClose={() => {
          if (saving) return;
          setMode(null);
          setForm({});
        }}
        title={mode === "plan" ? "Ținta bugetului" : mode === "category" ? "Categorie nouă" : mode === "item" ? "Poziție nouă" : "Cheltuială nouă"}
        description={mode === "plan" ? "Aceasta este limita de orientare a întregului eveniment; o poți ajusta ulterior." : mode === "category" ? "Grupează costurile ca să vezi rapid unde se duce bugetul." : mode === "item" ? "Adaugă un cost concret într-o categorie." : "Înregistrează numai o cheltuială reală deja făcută sau datorată."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={saving}>Renunță</Button>
            <Button onClick={() => void submit()} disabled={!valid || saving} loading={saving}>Salvează</Button>
          </>
        }
      >
        <div className="space-y-3">
          {mode !== "expense" ? (
            <Field label="Nume" required>
              <Input value={form.name ?? ""} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
          ) : null}
          {mode === "plan" ? (
            <>
              <Field label={`Țintă totală (${currency})`} required>
                <Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </Field>
              <Field label="Rezervă pentru neprevăzute (%)" hint="Recomandat: 5–15%">
                <Input inputMode="numeric" value={form.contingency ?? "10"} onChange={(event) => setForm({ ...form, contingency: event.target.value })} />
              </Field>
            </>
          ) : null}
          {mode === "category" ? (
            <>
              <Field label="Tip de cost" required>
                <Select value={form.type ?? "MISCELLANEOUS"} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                  {categoryTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label={`Sumă alocată (${currency})`}>
                <Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </Field>
            </>
          ) : null}
          {mode === "item" ? (
            <>
              <Field label="Categorie" required>
                <Select value={form.categoryId ?? ""} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
                  <option value="">Alege categoria</option>
                  {budget.categories.map((category) => <option key={category.id} value={category.id}>{String(category.name)}</option>)}
                </Select>
              </Field>
              <Field label={`Cost estimat (${currency})`} required>
                <Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </Field>
              <Field label="Termen de plată">
                <Input type="date" value={form.dueAt ?? ""} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
              </Field>
              <Field label="Detalii">
                <Textarea value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
            </>
          ) : null}
          {mode === "expense" ? (
            <>
              <Field label="Poziția din buget" required>
                <Select value={form.itemId ?? ""} onChange={(event) => setForm({ ...form, itemId: event.target.value })}>
                  <option value="">Alege poziția</option>
                  {budget.items.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}
                </Select>
              </Field>
              <Field label="Descriere" required>
                <Input value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>
              <Field label={`Sumă (${currency})`} required>
                <Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </Field>
              <Field label="Data cheltuielii" required>
                <Input type="date" value={form.date ?? ""} onChange={(event) => setForm({ ...form, date: event.target.value })} />
              </Field>
              <Field label="Metoda de plată (opțional)">
                <Input value={form.method ?? ""} onChange={(event) => setForm({ ...form, method: event.target.value })} />
              </Field>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function BudgetStep({ icon: Icon, number, title, copy }: { icon: typeof Target; number: string; title: string; copy: string }) {
  return (
    <div className="rounded-xl border border-line bg-subtle/45 p-4">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon className="size-4" aria-hidden /></span>
        <span className="text-xs font-semibold text-faint">PASUL {number}</span>
      </div>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{copy}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-faint">{label}</p>
        <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
      </CardContent>
    </Card>
  );
}

function editorIsValid(mode: EditorMode | null, form: Record<string, string>) {
  if (!mode) return false;
  const amount = Number(form.amount);
  if (mode === "plan") {
    const contingency = Number(form.contingency || 0);
    return Boolean(form.name?.trim()) && amount > 0 && contingency >= 0 && contingency <= 100;
  }
  if (mode === "category") return Boolean(form.name?.trim()) && (!form.amount || amount >= 0);
  if (mode === "item") return Boolean(form.name?.trim() && form.categoryId) && amount >= 0;
  return Boolean(form.itemId && form.description?.trim() && form.date) && amount > 0;
}

function minor(value?: string) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function formatMoney(minorValue: number, currency: string) {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minorValue / 100);
}

function safeCurrency(value: unknown) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value)
    ? value
    : "RON";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    PLANNED: "Planificat",
    QUOTED: "Ofertat",
    COMMITTED: "Confirmat",
    PARTIALLY_PAID: "Plătit parțial",
    PAID: "Plătit",
    CANCELLED: "Anulat",
    INCURRED: "Înregistrat",
  };
  return labels[value] ?? value.toLowerCase().replaceAll("_", " ");
}
