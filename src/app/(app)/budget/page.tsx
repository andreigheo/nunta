"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FolderPlus,
  Pencil,
  Plus,
  ReceiptText,
  Target,
  Trash2,
  WalletCards,
} from "lucide-react";
import { apiErrorMessage, weddingOsApi, type OperationResource } from "@/lib/api/client";
import { useWorkspace } from "@/lib/api/workspace-context";
import { useDeferredLoad } from "@/lib/hooks/use-deferred-load";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  CardSkeleton,
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

type BudgetResponse = {
  plan: OperationResource | null;
  categories: OperationResource[];
  items: OperationResource[];
  summary: Record<string, unknown> | null;
};
type EditorMode = "plan" | "category" | "item" | "expense";
type BudgetView = "costs" | "expenses";
type DeleteTarget = {
  kind: "category" | "item" | "expense";
  resource: OperationResource;
};

const categoryTypes = [
  ["VENUE", "Locație"],
  ["CATERING", "Mâncare și băuturi"],
  ["PHOTO_VIDEO", "Foto și video"],
  ["ENTERTAINMENT", "Muzică și divertisment"],
  ["DECOR_FLOWERS", "Decor și flori"],
  ["ATTIRE_BEAUTY", "Ținute și beauty"],
  ["INVITATIONS", "Invitații și papetărie"],
  ["CEREMONY", "Ceremonie"],
  ["CAKE", "Tort"],
  ["RENTALS", "Închirieri"],
  ["PLANNER", "Wedding planner"],
  ["TRANSPORT", "Transport"],
  ["ACCOMMODATION", "Cazare"],
  ["GIFTS", "Cadouri"],
  ["LEGAL", "Acte și taxe"],
  ["CONTINGENCY", "Rezervă"],
  ["MISCELLANEOUS", "Altele"],
] as const;

const expenseStatuses = [
  ["PLANNED", "Planificată"],
  ["INCURRED", "Înregistrată"],
  ["PAID", "Plătită"],
  ["REFUNDED", "Rambursată"],
  ["CANCELLED", "Anulată"],
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
  const [view, setView] = React.useState<BudgetView>("costs");
  const [mode, setMode] = React.useState<EditorMode | null>(null);
  const [editing, setEditing] = React.useState<OperationResource | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const currency = safeCurrency(
    budget.plan?.currency ?? onboardingTarget?.currency ?? bootstrap?.workspace.currency,
  );
  const canEditBudget =
    demoMode ||
    (bootstrap?.membership.capabilities.includes("budget.write") ?? false);
  const canEditExpenses =
    demoMode ||
    (bootstrap?.membership.capabilities.includes("expense.write") ?? false);
  const canExport =
    !demoMode &&
    (bootstrap?.membership.capabilities.includes("budget.export") ?? false);

  const load = React.useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError("");
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
            quotedMinor: 3_000_000,
            committedMinor: 3_000_000,
            paidMinor: 1_000_000,
            dueAt: "2027-08-01T12:00:00.000Z",
          },
        ],
        summary: {
          targetTotalMinor: 18_000_000,
          allocatedMinor: 3_500_000,
          estimatedMinor: 3_000_000,
          forecastMinor: 3_000_000,
          committedMinor: 3_000_000,
          paidMinor: 1_000_000,
          outstandingMinor: 2_000_000,
          remainingMinor: 15_000_000,
        },
      });
      setExpenses([
        {
          id: "demo-expense",
          version: 1,
          budgetItemId: "demo-item",
          description: "Avans foto demo",
          status: "PAID",
          amountMinor: 1_000_000,
          expenseDate: "2026-06-05",
          paymentMethodLabel: "Transfer bancar",
        },
      ]);
      setLoading(false);
      return;
    }
    try {
      const canReadOnboarding =
        bootstrap?.membership.capabilities.includes("workspace.update") ??
        false;
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
                currency: safeCurrency(onboarding.budget.currency ?? bootstrap?.workspace.currency),
              }
            : null,
        );
      }
    } catch (caught) {
      setError(apiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [bootstrap, currentWorkspace, demoMode]);
  useDeferredLoad(load);

  const closeEditor = () => {
    if (saving) return;
    setMode(null);
    setEditing(null);
    setForm({});
  };

  const openEditor = (
    nextMode: EditorMode,
    defaults: Record<string, string> = {},
    resource: OperationResource | null = null,
  ) => {
    setMode(nextMode);
    setEditing(resource);
    setForm(defaults);
  };

  const openPlan = (useOnboardingTarget = false) =>
    openEditor(
      "plan",
      {
        name: String(budget.plan?.name ?? "Bugetul nunții"),
        amount: String(
          useOnboardingTarget
            ? onboardingTarget?.amount ?? ""
            : Number(budget.plan?.targetTotalMinor ?? 0) / 100 || "",
        ),
        contingency: String(budget.plan?.contingencyPercent ?? 10),
      },
      budget.plan,
    );

  const openCategory = (category?: OperationResource) =>
    openEditor(
      "category",
      category
        ? {
            name: String(category.name ?? ""),
            type: String(category.canonicalType ?? "MISCELLANEOUS"),
            amount: amountInput(category.allocatedMinor),
          }
        : { type: "MISCELLANEOUS" },
      category ?? null,
    );

  const openItem = (categoryId = "", item?: OperationResource) => {
    setView("costs");
    openEditor(
      "item",
      item
        ? {
            name: String(item.name ?? ""),
            categoryId: String(item.categoryId ?? categoryId),
            amount: amountInput(item.estimatedMinor),
            quoted: amountInput(item.quotedMinor),
            committed: amountInput(item.committedMinor),
            dueAt: dateInput(item.dueAt),
            description: String(item.description ?? ""),
          }
        : { categoryId },
      item ?? null,
    );
  };

  const openExpense = (itemId = "", expense?: OperationResource) => {
    setView("expenses");
    openEditor(
      "expense",
      expense
        ? {
            itemId: String(expense.budgetItemId ?? itemId),
            description: String(expense.description ?? ""),
            amount: amountInput(expense.amountMinor),
            date: dateInput(expense.expenseDate),
            status: String(expense.status ?? "INCURRED"),
            method: String(expense.paymentMethodLabel ?? ""),
            notes: String(expense.notesPrivate ?? ""),
          }
        : { itemId, status: "INCURRED", date: todayInput() },
      expense ?? null,
    );
  };

  const valid = editorIsValid(mode, form);
  const submit = async () => {
    if (!currentWorkspace || !mode || !valid) return;
    if (demoMode) {
      toast({
        title: editing ? "Modificare simulată" : "Element adăugat în demo",
        description: "Nu a fost trimisă nicio modificare către server.",
        variant: "info",
      });
      closeEditor();
      return;
    }
    setSaving(true);
    try {
      if (mode === "plan") {
        await weddingOsApi.upsertBudget(currentWorkspace.id, budget.plan?.version ?? null, {
          name: form.name.trim(),
          targetTotalMinor: minor(form.amount),
          contingencyPercent: Number(form.contingency || 0),
          status: "ACTIVE",
        });
      }
      if (mode === "category") {
        const payload = {
          name: form.name.trim(),
          canonicalType: form.type || null,
          allocatedMinor: minor(form.amount),
          position: Number(editing?.position ?? budget.categories.length),
        };
        if (editing)
          await weddingOsApi.updateBudgetCategory(
            currentWorkspace.id,
            editing.id,
            editing.version,
            payload,
          );
        else await weddingOsApi.createBudgetCategory(currentWorkspace.id, payload);
      }
      if (mode === "item") {
        const payload = {
          categoryId: form.categoryId,
          name: form.name.trim(),
          description: form.description?.trim() || null,
          estimatedMinor: minor(form.amount),
          quotedMinor: optionalMinor(form.quoted),
          committedMinor: optionalMinor(form.committed),
          dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00.000Z`).toISOString() : null,
        };
        if (editing)
          await weddingOsApi.updateBudgetItem(
            currentWorkspace.id,
            editing.id,
            editing.version,
            payload,
          );
        else await weddingOsApi.createBudgetItem(currentWorkspace.id, payload);
      }
      if (mode === "expense") {
        const payload = {
          budgetItemId: form.itemId,
          description: form.description.trim(),
          amountMinor: minor(form.amount),
          expenseDate: form.date,
          status: form.status || "INCURRED",
          paymentMethodLabel: form.method?.trim() || null,
          notesPrivate: form.notes?.trim() || null,
        };
        if (editing)
          await weddingOsApi.updateExpense(
            currentWorkspace.id,
            editing.id,
            editing.version,
            payload,
          );
        else await weddingOsApi.createExpense(currentWorkspace.id, payload);
      }
      setMode(null);
      setEditing(null);
      setForm({});
      await load();
      toast({
        title: editing ? "Modificările au fost salvate" : "Buget actualizat",
        variant: "success",
      });
    } catch (caught) {
      toast({
        title: "Datele nu au fost salvate",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!currentWorkspace || !deleteTarget) return;
    if (demoMode) {
      toast({ title: "Ștergerea este simulată în demo", variant: "info" });
      setDeleteTarget(null);
      return;
    }
    setSaving(true);
    try {
      const { kind, resource } = deleteTarget;
      if (kind === "category")
        await weddingOsApi.deleteBudgetCategory(currentWorkspace.id, resource.id, resource.version);
      if (kind === "item")
        await weddingOsApi.deleteBudgetItem(currentWorkspace.id, resource.id, resource.version);
      if (kind === "expense")
        await weddingOsApi.deleteExpense(currentWorkspace.id, resource.id, resource.version);
      setDeleteTarget(null);
      await load();
      toast({ title: "Elementul a fost eliminat", variant: "success" });
    } catch (caught) {
      toast({
        title: "Elementul nu a putut fi eliminat",
        description: apiErrorMessage(caught),
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
    } catch (caught) {
      toast({
        title: "Exportul nu a fost pornit",
        description: apiErrorMessage(caught),
        variant: "error",
      });
    }
  };

  const summary = budget.summary ?? {};
  const targetMinor = Number(summary.targetTotalMinor ?? 0);
  const allocatedMinor = Number(summary.allocatedMinor ?? 0);
  const forecastMinor = Number(summary.forecastMinor ?? 0);
  const committedMinor = Number(summary.committedMinor ?? 0);
  const paidMinor = Number(summary.paidMinor ?? 0);
  const outstandingMinor = Number(summary.outstandingMinor ?? 0);
  const remainingMinor = Number(summary.remainingMinor ?? targetMinor - committedMinor);
  const committedPercent = targetMinor ? Math.round((committedMinor / targetMinor) * 100) : 0;
  const forecastPercent = targetMinor ? Math.round((forecastMinor / targetMinor) * 100) : 0;
  const guidance = budgetGuidance({
    targetMinor,
    allocatedMinor,
    forecastMinor,
    committedMinor,
    categories: budget.categories.length,
    items: budget.items.length,
    currency,
  });

  if (loading)
    return (
      <div className="mx-auto max-w-7xl space-y-5" aria-busy="true" aria-label="Se încarcă bugetul">
        <div className="h-24 animate-pulse rounded-xl bg-subtle" />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={6} />
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title="Bugetul nunții"
        description="Planifică fiecare cost, urmărește ce ai confirmat și notează separat ce ai plătit."
        actions={
          <>
            {canExport ? (
              <Button variant="outline" size="sm" onClick={() => void exportBudget()} disabled={!budget.plan}>
                <Download className="size-4" aria-hidden />
                Export XLSX
              </Button>
            ) : null}
            {canEditBudget ? (
              <Button
                size="sm"
                onClick={() =>
                  budget.plan
                    ? budget.categories.length
                      ? openItem()
                      : openCategory()
                    : openPlan(Boolean(onboardingTarget))
                }
              >
                <Plus className="size-4" aria-hidden />
                {!budget.plan
                  ? "Setează bugetul"
                  : budget.categories.length
                    ? "Adaugă un cost"
                    : "Creează o categorie"}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? (
        <ErrorState title="Bugetul nu a putut fi încărcat" description={error} onRetry={() => void load()} />
      ) : !budget.plan ? (
        <BudgetStart
          onboardingTarget={onboardingTarget}
          currency={currency}
          canEdit={canEditBudget}
          onStart={() => openPlan()}
          onUseTarget={() => openPlan(true)}
        />
      ) : (
        <>
          <section
            className={cn(
              "rounded-2xl border p-5 sm:p-6",
              guidance.tone === "danger"
                ? "border-danger/30 bg-danger-soft/45"
                : guidance.tone === "warning"
                  ? "border-warning/30 bg-warning-soft/40"
                  : "border-brand/20 bg-brand-softer/55",
            )}
            aria-labelledby="budget-guidance-title"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  {guidance.tone === "danger" || guidance.tone === "warning" ? (
                    <AlertTriangle className="size-5 text-warning" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-5 text-brand" aria-hidden />
                  )}
                  <h2 id="budget-guidance-title" className="font-brand text-xl font-semibold text-ink">
                    {guidance.title}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">{guidance.description}</p>
              </div>
              {guidance.action && canEditBudget ? (
                <Button
                  variant={guidance.tone === "danger" ? "outline" : "primary"}
                  onClick={() =>
                    guidance.action === "category"
                      ? openCategory()
                      : guidance.action === "item"
                        ? openItem()
                        : openPlan()
                  }
                >
                  {guidance.actionLabel}
                </Button>
              ) : null}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Situația bugetului">
            <div className="grid sm:grid-cols-2 xl:grid-cols-4">
              <BudgetMetric label="Ținta stabilită" value={formatMoney(targetMinor, currency)} help="Limita pe care vrei să o respecți" action={canEditBudget ? { label: "Modifică", onClick: () => openPlan() } : undefined} />
              <BudgetMetric label="Estimare la final" value={formatMoney(forecastMinor, currency)} help={`${forecastPercent}% din țintă, pe baza costurilor de acum`} tone={forecastMinor > targetMinor ? "danger" : undefined} />
              <BudgetMetric label="Costuri confirmate" value={formatMoney(committedMinor, currency)} help={`${committedPercent}% din țintă este deja angajat`} tone={committedMinor > targetMinor ? "danger" : undefined} />
              <BudgetMetric label="Plătit până acum" value={formatMoney(paidMinor, currency)} help={outstandingMinor ? `${formatMoney(outstandingMinor, currency)} rămas de plată` : "Nicio sumă restantă confirmată"} />
            </div>
            <div className="border-t border-line bg-subtle/45 px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-ink">Confirmat din bugetul total</span>
                <span className={cn("font-semibold tabular-nums", committedPercent > 100 ? "text-danger" : "text-ink")}>
                  {committedPercent}% · {formatMoney(Math.abs(remainingMinor), currency)} {remainingMinor < 0 ? "peste țintă" : "neangajat"}
                </span>
              </div>
              <Progress className="mt-3" value={Math.min(committedMinor, Math.max(targetMinor, 1))} max={Math.max(targetMinor, 1)} tone={committedMinor > targetMinor ? "danger" : "brand"} />
            </div>
          </section>

          <BudgetVocabulary />

          <section aria-labelledby="budget-workspace-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="budget-workspace-title" className="font-brand text-2xl font-semibold tracking-[-0.02em] text-ink">Gestionează bugetul</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">Lucrează întâi cu costurile planificate, apoi înregistrează sumele cheltuite în realitate.</p>
              </div>
              <SegmentedControl
                value={view}
                onChange={setView}
                ariaLabel="Alege zona bugetului"
                options={[
                  { value: "costs", label: `Costuri (${budget.items.length})`, icon: <WalletCards className="size-4" aria-hidden /> },
                  { value: "expenses", label: `Cheltuieli (${expenses.length})`, icon: <ReceiptText className="size-4" aria-hidden /> },
                ]}
              />
            </div>

            {view === "costs" ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Categorii și costuri planificate</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted">Ai alocat {formatMoney(allocatedMinor, currency)} din {formatMoney(targetMinor, currency)} în {budget.categories.length} categorii.</p>
                  </div>
                  {canEditBudget ? <Button variant="outline" size="sm" onClick={() => openCategory()}><FolderPlus className="size-4" aria-hidden />Categorie nouă</Button> : null}
                </div>

                {budget.categories.length ? (
                  budget.categories.map((category) => (
                    <BudgetCategorySection
                      key={category.id}
                      category={category}
                      items={budget.items.filter((item) => item.categoryId === category.id)}
                      currency={currency}
                      canEditBudget={canEditBudget}
                      canEditExpenses={canEditExpenses}
                      onAddItem={() => openItem(category.id)}
                      onEditCategory={() => openCategory(category)}
                      onDeleteCategory={() => setDeleteTarget({ kind: "category", resource: category })}
                      onEditItem={(item) => openItem(String(item.categoryId), item)}
                      onDeleteItem={(item) => setDeleteTarget({ kind: "item", resource: item })}
                      onAddExpense={(item) => openExpense(item.id)}
                    />
                  ))
                ) : (
                  <EmptyState
                    icon={FolderPlus}
                    title="Împarte bugetul în categorii"
                    description="Începe cu zone mari precum locație, mâncare, foto-video și decor. În interiorul lor vei adăuga costurile concrete."
                    action={canEditBudget ? { label: "Creează prima categorie", onClick: () => openCategory() } : undefined}
                  />
                )}
              </div>
            ) : (
              <ExpensesSection
                expenses={expenses}
                items={budget.items}
                currency={currency}
                canEdit={canEditExpenses}
                onAdd={() => openExpense()}
                onEdit={(expense) => openExpense(String(expense.budgetItemId ?? ""), expense)}
                onDelete={(expense) => setDeleteTarget({ kind: "expense", resource: expense })}
              />
            )}
          </section>
        </>
      )}

      <BudgetEditorModal mode={mode} editing={editing} form={form} setForm={setForm} budget={budget} currency={currency} valid={valid} saving={saving} onClose={closeEditor} onSubmit={() => void submit()} />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => { if (!saving) setDeleteTarget(null); }}
        onConfirm={() => void remove()}
        title={deleteDialog(deleteTarget).title}
        description={deleteDialog(deleteTarget).description}
        confirmLabel="Elimină"
        destructive
        loading={saving}
      />
    </div>
  );
}

function BudgetStart({ onboardingTarget, currency, canEdit, onStart, onUseTarget }: { onboardingTarget: { amount: number; currency: string } | null; currency: string; canEdit: boolean; onStart: () => void; onUseTarget: () => void }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-brand/20 bg-surface" aria-labelledby="budget-start-title">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="p-5 sm:p-7">
          <Badge variant="brand">Primul pas</Badge>
          <h2 id="budget-start-title" className="mt-3 max-w-2xl font-brand text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">Construiește bugetul în trei pași ușor de urmărit.</h2>
          <ol className="mt-6 grid gap-5 sm:grid-cols-3">
            <BudgetStep icon={Target} number="1" title="Stabilește ținta" copy="Suma totală pe care vrei să o respecți." />
            <BudgetStep icon={FolderPlus} number="2" title="Împarte pe categorii" copy="Decide cât rezervi pentru fiecare zonă." />
            <BudgetStep icon={ReceiptText} number="3" title="Urmărește realitatea" copy="Compară estimările cu sumele confirmate și plătite." />
          </ol>
        </div>
        <div className="flex items-center border-t border-line bg-brand-softer/60 p-5 lg:border-l lg:border-t-0 lg:p-6">
          <div className="w-full">
            {onboardingTarget ? (
              <>
                <p className="text-sm font-semibold text-brand">Ai deja o estimare inițială</p>
                <p className="mt-2 font-brand text-3xl font-semibold text-ink">{formatMoney(onboardingTarget.amount * 100, onboardingTarget.currency)}</p>
                <p className="mt-2 text-sm leading-6 text-muted">Confirm-o ca țintă și continuă direct cu împărțirea pe categorii.</p>
                {canEdit ? <Button className="mt-4 w-full" onClick={onUseTarget}>Folosește această țintă</Button> : null}
              </>
            ) : (
              <>
                <p className="font-brand text-xl font-semibold text-ink">Începe cu o sumă orientativă</p>
                <p className="mt-2 text-sm leading-6 text-muted">O poți modifica oricând. Cheltuielile nu sunt create automat.</p>
                {canEdit ? <Button className="mt-4 w-full" onClick={onStart}>Setează ținta în {currency}</Button> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function BudgetVocabulary() {
  const terms = [
    ["1", "Categorie", "O zonă mare a bugetului, de exemplu Foto și video."],
    ["2", "Cost", "Un serviciu concret, de exemplu Pachet foto 12 ore."],
    ["3", "Cheltuială", "O sumă reală înregistrată pentru acel cost."],
  ] as const;
  return (
    <section className="rounded-xl border border-line bg-surface px-4 py-4 sm:px-5" aria-labelledby="budget-language-title">
      <h2 id="budget-language-title" className="text-sm font-semibold text-ink">Cum este organizat bugetul</h2>
      <ol className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-0">
        {terms.map(([number, title, copy], index) => (
          <li key={title} className={cn("flex min-w-0 flex-1 gap-3", index > 0 && "sm:border-l sm:border-line sm:pl-5", index < terms.length - 1 && "sm:pr-5")}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">{number}</span>
            <span><span className="block text-sm font-semibold text-ink">{title}</span><span className="mt-0.5 block text-xs leading-5 text-muted">{copy}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BudgetMetric({ label, value, help, tone, action }: { label: string; value: string; help: string; tone?: "danger"; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="min-w-0 border-b border-line p-5 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
      <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium text-muted">{label}</p>{action ? <button type="button" onClick={action.onClick} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-brand hover:bg-brand-softer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{action.label}</button> : null}</div>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums text-ink", tone === "danger" && "text-danger")}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{help}</p>
    </div>
  );
}

function BudgetCategorySection({ category, items, currency, canEditBudget, canEditExpenses, onAddItem, onEditCategory, onDeleteCategory, onEditItem, onDeleteItem, onAddExpense }: { category: OperationResource; items: OperationResource[]; currency: string; canEditBudget: boolean; canEditExpenses: boolean; onAddItem: () => void; onEditCategory: () => void; onDeleteCategory: () => void; onEditItem: (item: OperationResource) => void; onDeleteItem: (item: OperationResource) => void; onAddExpense: (item: OperationResource) => void }) {
  const allocated = Number(category.allocatedMinor ?? 0);
  const estimated = sumMinor(items, "estimatedMinor");
  const committed = sumMinor(items, "committedMinor");
  const paid = sumMinor(items, "paidMinor");
  const used = committed || estimated;
  const overAllocated = allocated > 0 && used > allocated;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-labelledby={`budget-category-${category.id}`}>
      <header className="flex flex-col gap-4 border-b border-line bg-subtle/35 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h3 id={`budget-category-${category.id}`} className="font-brand text-lg font-semibold text-ink">{String(category.name)}</h3>{overAllocated ? <Badge variant="warning">Peste suma alocată</Badge> : null}</div>
          <p className="mt-1 text-xs leading-5 text-muted">Alocat {formatMoney(allocated, currency)} · Estimat {formatMoney(estimated, currency)} · Confirmat {formatMoney(committed, currency)} · Plătit {formatMoney(paid, currency)}</p>
          {allocated > 0 ? <Progress className="mt-2 max-w-md" value={Math.min(used, allocated)} max={allocated} tone={overAllocated ? "danger" : "brand"} /> : null}
        </div>
        {canEditBudget ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={onAddItem}><Plus className="size-4" aria-hidden />Adaugă un cost</Button>
            <Button variant="ghost" size="icon-sm" onClick={onEditCategory} aria-label={`Editează categoria ${String(category.name)}`} title="Editează categoria"><Pencil className="size-4" aria-hidden /></Button>
            <Button variant="ghost" size="icon-sm" onClick={onDeleteCategory} disabled={items.length > 0} aria-label={`Șterge categoria ${String(category.name)}`} title={items.length ? "Șterge mai întâi costurile din categorie" : "Șterge categoria"}><Trash2 className="size-4" aria-hidden /></Button>
          </div>
        ) : null}
      </header>
      {items.length ? (
        <div className="divide-y divide-line">
          {items.map((item) => (
            <article key={item.id} className="p-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-ink">{String(item.name)}</p><Badge variant={statusTone(String(item.status))}>{statusLabel(String(item.status))}</Badge></div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{item.dueAt ? <span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />Termen {formatDate(item.dueAt)}</span> : <span>Fără termen de plată</span>}{item.description ? <span className="max-w-xl truncate">{String(item.description)}</span> : null}</div>
                </div>
                <div className="grid grid-cols-3 gap-x-5 gap-y-2 sm:min-w-[22rem]"><MoneyCell label="Estimat" value={Number(item.estimatedMinor ?? 0)} currency={currency} /><MoneyCell label="Confirmat" value={Number(item.committedMinor ?? 0)} currency={currency} /><MoneyCell label="Plătit" value={Number(item.paidMinor ?? 0)} currency={currency} /></div>
                {(canEditBudget || canEditExpenses) ? <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">{canEditExpenses ? <Button variant="secondary" size="sm" onClick={() => onAddExpense(item)}><ReceiptText className="size-4" aria-hidden />Adaugă cheltuială</Button> : null}{canEditBudget ? <Button variant="ghost" size="icon-sm" onClick={() => onEditItem(item)} aria-label={`Editează costul ${String(item.name)}`} title="Editează costul"><Pencil className="size-4" aria-hidden /></Button> : null}{canEditBudget ? <Button variant="ghost" size="icon-sm" onClick={() => onDeleteItem(item)} aria-label={`Șterge costul ${String(item.name)}`} title="Șterge costul"><Trash2 className="size-4" aria-hidden /></Button> : null}</div> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted">Categoria este pregătită. Adaugă primul serviciu sau produs pe care vrei să-l urmărești.</p>{canEditBudget ? <Button variant="outline" size="sm" onClick={onAddItem}>Adaugă primul cost</Button> : null}</div>
      )}
    </section>
  );
}

function ExpensesSection({ expenses, items, currency, canEdit, onAdd, onEdit, onDelete }: { expenses: OperationResource[]; items: OperationResource[]; currency: string; canEdit: boolean; onAdd: () => void; onEdit: (expense: OperationResource) => void; onDelete: (expense: OperationResource) => void }) {
  const total = sumMinor(expenses.filter((item) => item.status !== "CANCELLED"), "amountMinor");
  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-ink">Cheltuieli reale înregistrate</p><p className="mt-0.5 text-xs leading-5 text-muted">Total {formatMoney(total, currency)}. Fiecare sumă rămâne legată de costul pentru care a fost făcută.</p></div>{canEdit ? <Button size="sm" onClick={onAdd} disabled={!items.length}><Plus className="size-4" aria-hidden />Înregistrează o cheltuială</Button> : null}</div>
      {expenses.length ? (
        <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label="Lista cheltuielilor"><div className="divide-y divide-line">{expenses.map((expense) => { const item = items.find((candidate) => candidate.id === expense.budgetItemId); return <article key={expense.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-ink">{String(expense.description)}</p><Badge variant={statusTone(String(expense.status))}>{statusLabel(String(expense.status))}</Badge></div><p className="mt-1 text-xs leading-5 text-muted">{item ? `Pentru ${String(item.name)}` : "Costul asociat nu mai este activ"} · {formatDate(expense.expenseDate)}{expense.paymentMethodLabel ? ` · ${String(expense.paymentMethodLabel)}` : ""}</p></div><div className="flex items-center justify-between gap-2 sm:justify-end"><p className="mr-2 text-base font-semibold tabular-nums text-ink">{formatMoney(Number(expense.amountMinor ?? 0), currency)}</p>{canEdit ? <Button variant="ghost" size="icon-sm" onClick={() => onEdit(expense)} aria-label={`Editează cheltuiala ${String(expense.description)}`} title="Editează cheltuiala"><Pencil className="size-4" aria-hidden /></Button> : null}{canEdit ? <Button variant="ghost" size="icon-sm" onClick={() => onDelete(expense)} aria-label={`Șterge cheltuiala ${String(expense.description)}`} title="Șterge cheltuiala"><Trash2 className="size-4" aria-hidden /></Button> : null}</div></article>; })}</div></section>
      ) : (
        <EmptyState icon={CircleDollarSign} title="Nicio cheltuială înregistrată" description={items.length ? "Când plătești un avans sau primești o factură, înregistrează suma aici și leag-o de costul potrivit." : "Adaugă întâi cel puțin un cost planificat, apoi vei putea înregistra cheltuielile reale."} action={canEdit && items.length ? { label: "Înregistrează prima cheltuială", onClick: onAdd } : undefined} />
      )}
    </div>
  );
}

function BudgetEditorModal({ mode, editing, form, setForm, budget, currency, valid, saving, onClose, onSubmit }: { mode: EditorMode | null; editing: OperationResource | null; form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>; budget: BudgetResponse; currency: string; valid: boolean; saving: boolean; onClose: () => void; onSubmit: () => void }) {
  const title = mode === "plan" ? "Ținta bugetului" : mode === "category" ? `${editing ? "Editează" : "Adaugă"} categoria` : mode === "item" ? `${editing ? "Editează" : "Adaugă"} costul` : `${editing ? "Editează" : "Înregistrează"} cheltuiala`;
  const description = mode === "plan" ? "Stabilește limita totală și rezerva pentru situații neprevăzute." : mode === "category" ? "Categoria grupează costuri similare și îți arată cât ai rezervat pentru ele." : mode === "item" ? "Costul este un serviciu sau produs concret pe care îl estimezi, negociezi și confirmi." : "Cheltuiala este o sumă reală plătită sau datorată pentru un cost planificat.";
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <Modal open={Boolean(mode)} onClose={onClose} title={title} description={description} footer={<><Button variant="ghost" onClick={onClose} disabled={saving}>Renunță</Button><Button onClick={onSubmit} disabled={!valid || saving} loading={saving}>{editing ? "Salvează modificările" : "Salvează"}</Button></>}>
      <div className="space-y-4">
        {mode !== "expense" ? <Field label={mode === "plan" ? "Numele bugetului" : mode === "category" ? "Numele categoriei" : "Numele costului"} required><Input value={form.name ?? ""} onChange={(event) => update("name", event.target.value)} autoFocus /></Field> : null}
        {mode === "plan" ? <><Field label={`Țintă totală (${currency})`} hint="Suma totală pe care vrei să o respecți" required><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => update("amount", event.target.value)} /></Field><Field label="Rezervă pentru neprevăzute (%)" hint="Recomandat: 5–15%"><Input inputMode="numeric" value={form.contingency ?? "10"} onChange={(event) => update("contingency", event.target.value)} /></Field></> : null}
        {mode === "category" ? <><Field label="Tip de cost" required><Select value={form.type ?? "MISCELLANEOUS"} onChange={(event) => update("type", event.target.value)}>{categoryTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label={`Sumă alocată (${currency})`} hint="Cât din buget rezervi pentru această categorie"><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => update("amount", event.target.value)} /></Field></> : null}
        {mode === "item" ? <><Field label="Categorie" required><Select value={form.categoryId ?? ""} onChange={(event) => update("categoryId", event.target.value)}><option value="">Alege categoria</option>{budget.categories.map((category) => <option key={category.id} value={category.id}>{String(category.name)}</option>)}</Select></Field><div className="grid gap-4 sm:grid-cols-3"><Field label={`Estimat (${currency})`} hint="Așteptarea ta actuală" required><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => update("amount", event.target.value)} /></Field><Field label={`Ofertă (${currency})`} hint="Suma primită în ofertă"><Input inputMode="decimal" value={form.quoted ?? ""} onChange={(event) => update("quoted", event.target.value)} /></Field><Field label={`Confirmat (${currency})`} hint="Suma agreată final"><Input inputMode="decimal" value={form.committed ?? ""} onChange={(event) => update("committed", event.target.value)} /></Field></div><Field label="Termen de plată"><Input type="date" value={form.dueAt ?? ""} onChange={(event) => update("dueAt", event.target.value)} /></Field><Field label="Detalii"><Textarea value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} /></Field></> : null}
        {mode === "expense" ? <><Field label="Costul pentru care ai făcut cheltuiala" required><Select value={form.itemId ?? ""} onChange={(event) => update("itemId", event.target.value)} autoFocus><option value="">Alege costul</option>{budget.items.map((item) => <option key={item.id} value={item.id}>{String(item.name)}</option>)}</Select></Field><Field label="Descriere" required><Input value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label={`Sumă (${currency})`} required><Input inputMode="decimal" value={form.amount ?? ""} onChange={(event) => update("amount", event.target.value)} /></Field><Field label="Data cheltuielii" required><Input type="date" value={form.date ?? ""} onChange={(event) => update("date", event.target.value)} /></Field></div><Field label="Stare" required><Select value={form.status ?? "INCURRED"} onChange={(event) => update("status", event.target.value)}>{expenseStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field><Field label="Metoda de plată (opțional)"><Input value={form.method ?? ""} onChange={(event) => update("method", event.target.value)} placeholder="De exemplu, transfer bancar" /></Field><Field label="Notițe private (opțional)"><Textarea value={form.notes ?? ""} onChange={(event) => update("notes", event.target.value)} /></Field></> : null}
      </div>
    </Modal>
  );
}

function BudgetStep({ icon: Icon, number, title, copy }: { icon: typeof Target; number: string; title: string; copy: string }) {
  return <li className="flex gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand"><Icon className="size-4" aria-hidden /></span><span><span className="block text-xs font-semibold text-faint">Pasul {number}</span><span className="mt-1 block text-sm font-semibold text-ink">{title}</span><span className="mt-1 block text-xs leading-5 text-muted">{copy}</span></span></li>;
}

function MoneyCell({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted">{label}</p><p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-ink">{formatMoney(value, currency)}</p></div>;
}

function budgetGuidance(input: { targetMinor: number; allocatedMinor: number; forecastMinor: number; committedMinor: number; categories: number; items: number; currency: string }) {
  if (input.committedMinor > input.targetMinor) return { tone: "danger" as const, title: `Bugetul confirmat depășește ținta cu ${formatMoney(input.committedMinor - input.targetMinor, input.currency)}`, description: "Revizuiește costurile confirmate sau ajustează ținta, ca planul să reflecte decizia reală.", action: "plan" as const, actionLabel: "Revizuiește ținta" };
  if (input.forecastMinor > input.targetMinor) return { tone: "warning" as const, title: `Estimarea actuală depășește ținta cu ${formatMoney(input.forecastMinor - input.targetMinor, input.currency)}`, description: "Încă nu ai confirmat toate aceste sume. Compară costurile și decide unde poți ajusta.", action: null, actionLabel: "" };
  if (!input.categories) return { tone: "neutral" as const, title: "Următorul pas: împarte bugetul pe categorii", description: "Creează zonele mari de cheltuieli ca să știi cât îți permiți pentru fiecare.", action: "category" as const, actionLabel: "Creează prima categorie" };
  if (!input.items) return { tone: "neutral" as const, title: "Următorul pas: adaugă primul cost concret", description: "Alege o categorie și notează primul serviciu sau produs pe care vrei să-l urmărești.", action: "item" as const, actionLabel: "Adaugă primul cost" };
  if (input.allocatedMinor > input.targetMinor) return { tone: "warning" as const, title: "Ai alocat pe categorii mai mult decât ținta totală", description: "Poți păstra estimările, dar ajustează sumele alocate ca să ai un plan realist.", action: null, actionLabel: "" };
  return { tone: "neutral" as const, title: "Bugetul este organizat și pregătit de urmărit", description: "Actualizează costurile când primești oferte și înregistrează cheltuielile când apar plăți reale.", action: null, actionLabel: "" };
}

function deleteDialog(target: DeleteTarget | null) {
  if (!target) return { title: "Elimini elementul?", description: "Această acțiune elimină elementul din bugetul activ." };
  const name = String(target.resource.name ?? target.resource.description ?? "elementul selectat");
  if (target.kind === "category") return { title: `Elimini categoria „${name}”?`, description: "Categoria poate fi eliminată numai dacă nu mai conține costuri active." };
  if (target.kind === "item") return { title: `Elimini costul „${name}”?`, description: "Costul dispare din planul activ. Dacă are plăți confirmate, sistemul va bloca eliminarea." };
  return { title: `Elimini cheltuiala „${name}”?`, description: "Cheltuiala dispare din evidența activă a bugetului." };
}

function editorIsValid(mode: EditorMode | null, form: Record<string, string>) {
  if (!mode) return false;
  const amount = Number(form.amount);
  if (mode === "plan") { const contingency = Number(form.contingency || 0); return Boolean(form.name?.trim()) && amount > 0 && contingency >= 0 && contingency <= 100; }
  if (mode === "category") return Boolean(form.name?.trim()) && (!form.amount || amount >= 0);
  if (mode === "item") return Boolean(form.name?.trim() && form.categoryId) && amount >= 0 && optionalAmountIsValid(form.quoted) && optionalAmountIsValid(form.committed);
  return Boolean(form.itemId && form.description?.trim() && form.date && form.status) && amount > 0;
}

function optionalAmountIsValid(value?: string) { return !value || Number(value) >= 0; }
function minor(value?: string) { return Math.max(0, Math.round(Number(value || 0) * 100)); }
function optionalMinor(value?: string) { return value ? minor(value) : null; }
function amountInput(value: unknown) { const amount = Number(value); return Number.isFinite(amount) && amount > 0 ? String(amount / 100) : ""; }
function dateInput(value: unknown) { return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : ""; }
function todayInput() { return new Date().toISOString().slice(0, 10); }
function sumMinor(items: OperationResource[], key: string) { return items.reduce((sum, item) => sum + Number(item[key] ?? 0), 0); }
function formatMoney(minorValue: number, currency: string) { return new Intl.NumberFormat("ro-RO", { style: "currency", currency, maximumFractionDigits: 0 }).format(minorValue / 100); }
function safeCurrency(value: unknown) { return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : "RON"; }
function formatDate(value: unknown) { if (typeof value !== "string" || !value) return "Dată necunoscută"; const date = new Date(value.length === 10 ? `${value}T12:00:00.000Z` : value); return Number.isNaN(date.getTime()) ? "Dată necunoscută" : new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date); }
function statusTone(value: string): "success" | "brand" | "warning" | "neutral" | "danger" { if (value === "PAID") return "success"; if (value === "COMMITTED" || value === "INCURRED") return "brand"; if (value === "PARTIALLY_PAID" || value === "QUOTED") return "warning"; if (value === "CANCELLED") return "danger"; return "neutral"; }
function statusLabel(value: string) { const labels: Record<string, string> = { PLANNED: "Planificat", QUOTED: "Ofertat", COMMITTED: "Confirmat", PARTIALLY_PAID: "Plătit parțial", PAID: "Plătit", CANCELLED: "Anulat", INCURRED: "Înregistrat", REFUNDED: "Rambursat" }; return labels[value] ?? value.toLowerCase().replaceAll("_", " "); }
